import type { GridCoord } from '../../../shared/layout.ts';
import type { DishId, FacingDirection } from '../../../shared/types.ts';
import type { CollisionSystem } from '../collision/CollisionSystem.ts';
import type { GameEventBus } from '../events/GameEvents.ts';
import type { PathfindingService } from '../navigation/PathfindingService.ts';
import type { CustomerProfile, CustomerSystemConfig } from './CustomerConfig.ts';
import {
  CustomerStateMachine,
  getCustomerAnimationForState,
  getCustomerExpressionAndBubble,
  type CustomerAnimState,
  type CustomerExpression,
  type CustomerState,
} from './CustomerStateMachine.ts';

export interface CustomerRuntimeSnapshot {
  id: string;
  groupId: string;
  profileId: string;
  name: string;
  genderPresentation: CustomerProfile['genderPresentation'];
  hairStyle: CustomerProfile['hairStyle'];
  hairColor: number;
  shirtColor: number;
  pantsColor: number;
  skinTone: number;
  accessories: CustomerProfile['accessories'];
  state: CustomerState;
  animState: CustomerAnimState;
  expression: CustomerExpression;
  thoughtBubble: string | null;
  col: number;
  row: number;
  facing: FacingDirection;
  isMoving: boolean;
  assignedTableId: string | null;
  seatIndex: number | null;
  queueIndex: number | null;
  dishId: DishId;
  patience: number; // 0..1
  isAngry: boolean;
  destination: GridCoord | null;
  path: GridCoord[];
  exitAlpha: number; // 1 -> 0 during EXITING
}

export interface CustomerAIUpdateSignals {
  arrivedAtDestination: boolean;
  stuckExceeded: boolean;
  patienceExpired: boolean;
  seatingFinished: boolean;
  browsingFinished: boolean;
  eatingFinished: boolean;
  standUpFinished: boolean;
  exitFinished: boolean;
}

/**
 * Individual Customer AI entity integrated directly with Phase 04's
 * NavigationGrid, PathfindingService, and CollisionSystem.
 * Never teleports — walks smoothly along obstacle-avoiding A* paths with stuck recovery.
 */
export class CustomerAI {
  public readonly id: string;
  public readonly groupId: string;
  public readonly profile: CustomerProfile;
  public readonly fsm: CustomerStateMachine;
  public dishId: DishId;

  private config: CustomerSystemConfig;
  private pathfinding: PathfindingService;
  private collision: CollisionSystem;
  private events: GameEventBus;

  private position: GridCoord;
  private facing: FacingDirection = 'left';
  private path: GridCoord[] = [];
  private destination: GridCoord | null = null;
  private lastGridVersion: number;
  private isMoving = false;

  // Stuck detection & route recovery
  private stuckTimerSec = 0;
  private rerouteAttempts = 0;

  // Assignment & patience tracking
  public assignedTableId: string | null = null;
  public seatIndex: number | null = null;
  public seatAnchor: { col: number; row: number; facing: FacingDirection } | null = null;
  public queueIndex: number | null = null;
  public isAngry = false;

  private patienceRemainingSec: number;
  private patienceMaxSec: number;
  private lowPatienceEmitted = false;
  private destroyed = false;

  constructor(
    id: string,
    groupId: string,
    profile: CustomerProfile,
    dishId: DishId,
    spawnPos: GridCoord,
    pathfinding: PathfindingService,
    collision: CollisionSystem,
    events: GameEventBus,
    config: CustomerSystemConfig
  ) {
    this.id = id;
    this.groupId = groupId;
    this.profile = profile;
    this.dishId = dishId;
    this.config = config;
    this.pathfinding = pathfinding;
    this.collision = collision;
    this.events = events;

    this.fsm = new CustomerStateMachine('SPAWNING');
    this.position = { col: spawnPos.col, row: spawnPos.row };
    this.lastGridVersion = pathfinding.getGrid().getVersion();

    this.patienceMaxSec = Math.max(8, profile.patience || config.customerPatience);
    this.patienceRemainingSec = this.patienceMaxSec;
  }

  public getPosition(): GridCoord {
    return { col: this.position.col, row: this.position.row };
  }

  public getState(): CustomerState {
    return this.fsm.getState();
  }

  public getPatienceRatio(): number {
    if (this.patienceMaxSec <= 0) return 0;
    return Math.max(0, Math.min(1, this.patienceRemainingSec / this.patienceMaxSec));
  }

  public resetPatience(durationSec: number): void {
    this.patienceMaxSec = Math.max(5, durationSec);
    this.patienceRemainingSec = this.patienceMaxSec;
    this.lowPatienceEmitted = false;
  }

  public boostPatience(fraction: number): void {
    this.patienceRemainingSec = Math.min(
      this.patienceMaxSec,
      this.patienceRemainingSec + this.patienceMaxSec * fraction
    );
    if (this.getPatienceRatio() > 0.3) {
      this.lowPatienceEmitted = false;
    }
  }

  public setPatienceRatio(ratio: number): void {
    const clamped = Math.max(0, Math.min(1, ratio));
    this.patienceRemainingSec = clamped * this.patienceMaxSec;
  }

  /**
   * Computes an obstacle-free A* route inside the dining zone to targetCol/targetRow.
   */
  public setMoveDestination(
    targetCol: number,
    targetRow: number,
    allowNearestFallback = true
  ): boolean {
    const result = this.pathfinding.findPath(
      'waiter',
      this.position,
      { col: targetCol, row: targetRow },
      allowNearestFallback
    );

    if (!result.reachable || !result.resolvedGoal) {
      this.path = [];
      this.destination = null;
      this.isMoving = false;
      return false;
    }

    // Preserve exact fine-grained target if walkable (e.g., spaced queue positions)
    const exactWalkable = this.collision.canOccupy('waiter', targetCol, targetRow);
    const waypoints = result.path.map((p) => ({ ...p }));
    if (exactWalkable && waypoints.length > 0) {
      waypoints[waypoints.length - 1] = { col: targetCol, row: targetRow };
    } else if (exactWalkable && waypoints.length === 0) {
      waypoints.push({ col: targetCol, row: targetRow });
    }

    this.path = waypoints;
    this.destination = exactWalkable ? { col: targetCol, row: targetRow } : result.resolvedGoal;
    this.lastGridVersion = this.pathfinding.getGrid().getVersion();
    this.stuckTimerSec = 0;
    this.rerouteAttempts = 0;
    this.isMoving = this.path.length > 0;
    return true;
  }

  public setMoveToApproach(targetCol: number, targetRow: number): boolean {
    const result = this.pathfinding.findPathToApproach(
      'waiter',
      this.position,
      { col: targetCol, row: targetRow },
      1
    );
    if (!result.reachable || !result.resolvedGoal) {
      this.path = [];
      this.destination = null;
      this.isMoving = false;
      return false;
    }
    this.path = result.path.map((p) => ({ ...p }));
    this.destination = result.resolvedGoal;
    this.lastGridVersion = this.pathfinding.getGrid().getVersion();
    this.stuckTimerSec = 0;
    this.rerouteAttempts = 0;
    this.isMoving = this.path.length > 0;
    return true;
  }

  public cancelMovement(): void {
    this.path = [];
    this.destination = null;
    this.isMoving = false;
    this.stuckTimerSec = 0;
  }

  public faceTowards(targetCol: number, targetRow: number): void {
    const dc = targetCol - this.position.col;
    const dr = targetRow - this.position.row;
    if (Math.hypot(dc, dr) < 0.01) return;
    const screenX = dc - dr;
    const screenY = (dc + dr) * 0.52;
    this.facing = this.resolveFourWayFacing(screenX, screenY);
  }

  public setFacing(dir: FacingDirection): void {
    this.facing = dir;
  }

  /**
   * Aligns customer cleanly onto their assigned seat anchor while seated (never used for travel).
   */
  public alignToSeat(col: number, row: number, facing: FacingDirection): void {
    this.cancelMovement();
    this.seatAnchor = { col, row, facing };
    this.position = { col, row };
    this.facing = facing;
  }

  /**
   * Steps back from the chair onto the nearest walkable approach tile when standing up to leave.
   */
  public stepOutOfSeatToWalkable(): void {
    const safe = this.pathfinding
      .getGrid()
      .findNearestWalkableTile('waiter', this.position.col, this.position.row);
    if (safe) {
      this.position = { col: safe.col, row: safe.row };
    }
    this.seatAnchor = null;
  }

  public update(dtSeconds: number, nowMs = Date.now()): CustomerAIUpdateSignals {
    const signals: CustomerAIUpdateSignals = {
      arrivedAtDestination: false,
      stuckExceeded: false,
      patienceExpired: false,
      seatingFinished: false,
      browsingFinished: false,
      eatingFinished: false,
      standUpFinished: false,
      exitFinished: false,
    };

    if (this.destroyed || this.fsm.isTerminal()) {
      return signals;
    }

    const dt = Math.max(0, Math.min(0.25, dtSeconds));
    this.fsm.advanceTime(dt);
    const state = this.fsm.getState();

    // 1. Movement stepping when following a path
    if (this.path.length > 0 && !this.fsm.isSeatedState()) {
      const moveOutcome = this.stepPath(dt);
      if (moveOutcome === 'arrived') {
        signals.arrivedAtDestination = true;
      } else if (moveOutcome === 'stuck') {
        signals.stuckExceeded = true;
      }
    } else {
      this.isMoving = false;
    }

    // 2. Patience ticking — ONLY active while waiting (paused while walking!)
    if (this.fsm.isPatienceActiveState() && !this.isMoving) {
      this.patienceRemainingSec = Math.max(0, this.patienceRemainingSec - dt);
      const ratio = this.getPatienceRatio();
      if (!this.lowPatienceEmitted && ratio <= 0.3 && ratio > 0) {
        this.lowPatienceEmitted = true;
        this.events.emit(
          'CUSTOMER_PATIENCE_LOW',
          { customerId: this.id, groupId: this.groupId, ratio },
          nowMs
        );
      }
      if (this.patienceRemainingSec <= 0) {
        signals.patienceExpired = true;
      }
    }

    // 3. Timed FSM phase completion signals
    const timeInState = this.fsm.getTimeInState();
    if (state === 'SEATING' && timeInState >= this.config.seatingDuration) {
      signals.seatingFinished = true;
    } else if (state === 'SEATED' && timeInState >= this.config.browsingDuration) {
      signals.browsingFinished = true;
    } else if (state === 'EATING') {
      const eatDur = this.profile.eatingDuration || this.config.eatingDuration;
      if (timeInState >= eatDur) {
        signals.eatingFinished = true;
      }
    } else if (state === 'LEAVING_TABLE' && timeInState >= this.config.standUpDuration) {
      signals.standUpFinished = true;
    } else if (state === 'EXITING' && timeInState >= this.config.exitDelay) {
      signals.exitFinished = true;
    }

    return signals;
  }

  private stepPath(dt: number): 'moving' | 'arrived' | 'stuck' {
    // Check dynamic obstacle version changes and recalculate path cleanly
    const currentGridVer = this.pathfinding.getGrid().getVersion();
    if (currentGridVer !== this.lastGridVersion && this.destination) {
      this.lastGridVersion = currentGridVer;
      if (!this.pathfinding.isPathClear('waiter', this.position, this.path)) {
        const rerouted = this.pathfinding.findPath('waiter', this.position, this.destination, true);
        if (rerouted.reachable && rerouted.path.length > 0) {
          this.path = rerouted.path.map((p) => ({ ...p }));
          this.destination = rerouted.resolvedGoal;
        } else {
          this.stuckTimerSec = this.config.stuckTimeoutSec;
          return 'stuck';
        }
      }
    }

    const waypoint = this.path[0];
    const dc = waypoint.col - this.position.col;
    const dr = waypoint.row - this.position.row;
    const dist = Math.hypot(dc, dr);

    const speed = this.profile.movementSpeed || this.config.customerSpeed;
    const reachThreshold = this.path.length === 1 ? 0.12 : 0.18;

    if (dist <= reachThreshold) {
      const snap = this.collision.resolveMovement('waiter', this.position, waypoint);
      this.position = snap.position;
      this.path.shift();
      this.stuckTimerSec = 0;

      if (this.path.length === 0) {
        this.destination = null;
        this.isMoving = false;
        return 'arrived';
      }
      this.isMoving = true;
      return 'moving';
    }

    const step = Math.min(dist, speed * dt);
    const proposed: GridCoord = {
      col: this.position.col + (dc / dist) * step,
      row: this.position.row + (dr / dist) * step,
    };

    const resolved = this.collision.resolveMovement('waiter', this.position, proposed);
    const movedDist = Math.hypot(
      resolved.position.col - this.position.col,
      resolved.position.row - this.position.row
    );

    this.position = resolved.position;

    if (movedDist < 0.002) {
      this.stuckTimerSec += dt;
      if (this.stuckTimerSec >= this.config.stuckTimeoutSec * 0.5 && this.rerouteAttempts < 2 && this.destination) {
        this.rerouteAttempts += 1;
        const retry = this.pathfinding.findPath('waiter', this.position, this.destination, true);
        if (retry.reachable && retry.path.length > 0) {
          this.path = retry.path.map((p) => ({ ...p }));
          this.destination = retry.resolvedGoal;
          return 'moving';
        }
      }
      if (this.stuckTimerSec >= this.config.stuckTimeoutSec) {
        this.isMoving = false;
        return 'stuck';
      }
    } else {
      this.stuckTimerSec = 0;
    }

    const screenX = dc - dr;
    const screenY = (dc + dr) * 0.52;
    this.facing = this.resolveFourWayFacing(screenX, screenY);
    this.isMoving = true;
    return 'moving';
  }

  private resolveFourWayFacing(screenX: number, screenY: number): FacingDirection {
    if (Math.abs(screenX) >= Math.abs(screenY) * 1.1) {
      return screenX < 0 ? 'left' : 'right';
    }
    return screenY < 0 ? 'back' : 'front';
  }

  public getSnapshot(): CustomerRuntimeSnapshot {
    const state = this.fsm.getState();
    const patience = this.getPatienceRatio();
    const animState = getCustomerAnimationForState(state, this.isMoving, patience, this.isAngry);
    const { expression, thoughtBubble } = getCustomerExpressionAndBubble(state, patience, this.isAngry);
    const exitAlpha =
      state === 'EXITING'
        ? Math.max(0, 1 - this.fsm.getTimeInState() / Math.max(0.1, this.config.exitDelay))
        : 1;

    return {
      id: this.id,
      groupId: this.groupId,
      profileId: this.profile.id,
      name: this.profile.name,
      genderPresentation: this.profile.genderPresentation,
      hairStyle: this.profile.hairStyle,
      hairColor: this.profile.hairColor,
      shirtColor: this.profile.shirtColor,
      pantsColor: this.profile.pantsColor,
      skinTone: this.profile.skinTone,
      accessories: this.profile.accessories,
      state,
      animState,
      expression,
      thoughtBubble,
      col: Number(this.position.col.toFixed(3)),
      row: Number(this.position.row.toFixed(3)),
      facing: this.facing,
      isMoving: this.isMoving,
      assignedTableId: this.assignedTableId,
      seatIndex: this.seatIndex,
      queueIndex: this.queueIndex,
      dishId: this.dishId,
      patience: Number(patience.toFixed(3)),
      isAngry: this.isAngry,
      destination: this.destination ? { ...this.destination } : null,
      path: this.path.map((p) => ({ ...p })),
      exitAlpha: Number(exitAlpha.toFixed(2)),
    };
  }

  public destroy(): void {
    this.destroyed = true;
    this.cancelMovement();
    this.assignedTableId = null;
    this.seatIndex = null;
    this.seatAnchor = null;
    this.queueIndex = null;
  }
}
