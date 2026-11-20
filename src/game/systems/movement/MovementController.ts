import type { GridCoord } from '../../../shared/layout.ts';
import type { FacingDirection, PlayerRole } from '../../../shared/types.ts';
import { MOVEMENT_CONFIG, type MovementConfig } from '../../config/movementConfig.ts';
import { CollisionSystem } from '../collision/CollisionSystem.ts';
import {
  InteractionSystem,
  type InteractableObject,
} from '../interaction/InteractionSystem.ts';
import { PathfindingService } from '../navigation/PathfindingService.ts';

export type MovementState =
  | 'Idle'
  | 'Moving'
  | 'Interacting'
  | 'Carrying'
  | 'Blocked'
  | 'Disabled';

export interface MovementControllerOptions {
  characterId: string;
  playerId: string;
  role: PlayerRole;
  startPosition: GridCoord;
  facing?: FacingDirection;
  config?: Partial<MovementConfig>;
}

/**
 * Multiplayer-ready state snapshot for network sync, rendering, and debug inspection.
 */
export interface CharacterMovementSnapshot {
  characterId: string;
  playerId: string;
  role: PlayerRole;
  movementState: MovementState;
  position: GridCoord;
  destination: GridCoord | null;
  path: GridCoord[];
  facing: FacingDirection;
  isMoving: boolean;
  isRunning: boolean;
  isCarrying: boolean;
  activeInteractionId: string | null;
  pendingInteractionId: string | null;
  moveSpeed: number;
  currentSpeed: number;
}

export interface MoveCommandResult {
  accepted: boolean;
  usedFallbackGoal: boolean;
  destination: GridCoord | null;
  reason?: 'disabled' | 'unreachable' | 'role_restricted' | 'object_disabled';
}

/**
 * Reusable character movement & state machine controller shared by Chef Male and Waiter Female.
 * Decoupled from local input so it can drive local players, practice-mode dual control,
 * and future remote multiplayer characters identically.
 */
export class MovementController {
  public readonly characterId: string;
  public readonly playerId: string;
  public readonly role: PlayerRole;

  private config: MovementConfig;
  private pathfinding: PathfindingService;
  private collision: CollisionSystem;
  private interactionSystem: InteractionSystem;

  private state: MovementState = 'Idle';
  private position: GridCoord;
  private facing: FacingDirection;
  private currentSpeed = 0;
  private isRunning = false;
  private isCarrying = false;

  // Pathfinding state
  private path: GridCoord[] = [];
  private destination: GridCoord | null = null;
  private lastGridVersion: number;

  // Manual directional input (keyboard / optional joystick)
  private manualInput = { screenDx: 0, screenDy: 0, sprint: false };

  // Pending / active interaction orchestration
  private pendingInteractable: InteractableObject | null = null;
  private pendingInteractToken = 0;
  private blockedUntilMs = 0;
  private onBlockedFeedback?: (target: GridCoord, reason: string) => void;

  constructor(
    options: MovementControllerOptions,
    pathfinding: PathfindingService,
    collision: CollisionSystem,
    interactionSystem: InteractionSystem
  ) {
    this.characterId = options.characterId;
    this.playerId = options.playerId;
    this.role = options.role;
    this.config = { ...MOVEMENT_CONFIG, ...(options.config ?? {}) };
    this.pathfinding = pathfinding;
    this.collision = collision;
    this.interactionSystem = interactionSystem;
    this.position = { col: options.startPosition.col, row: options.startPosition.row };
    this.facing = options.facing ?? 'front';
    this.lastGridVersion = pathfinding.getGrid().getVersion();
  }

  public setBlockedFeedbackHandler(handler: (target: GridCoord, reason: string) => void): void {
    this.onBlockedFeedback = handler;
  }

  public setCarrying(carrying: boolean): void {
    this.isCarrying = carrying;
    if (this.state === 'Idle' && carrying) {
      this.state = 'Carrying';
    } else if (this.state === 'Carrying' && !carrying) {
      this.state = 'Idle';
    }
  }

  public setDisabled(disabled: boolean): void {
    if (disabled) {
      this.cancelMovementAndInteraction();
      this.state = 'Disabled';
    } else if (this.state === 'Disabled') {
      this.state = this.isCarrying ? 'Carrying' : 'Idle';
    }
  }

  public syncExternalPosition(col: number, row: number, facing?: FacingDirection): void {
    this.position = { col, row };
    if (facing) this.facing = facing;
    this.cancelMovementAndInteraction();
  }

  public getState(): MovementState {
    return this.state;
  }

  public getPosition(): GridCoord {
    return { col: this.position.col, row: this.position.row };
  }

  public getSnapshot(): CharacterMovementSnapshot {
    return {
      characterId: this.characterId,
      playerId: this.playerId,
      role: this.role,
      movementState: this.state,
      position: { col: this.position.col, row: this.position.row },
      destination: this.destination ? { ...this.destination } : null,
      path: this.path.map((p) => ({ ...p })),
      facing: this.facing,
      isMoving: this.state === 'Moving',
      isRunning: this.state === 'Moving' && this.isRunning,
      isCarrying: this.isCarrying,
      activeInteractionId: this.interactionSystem.getActiveObjectId(this.characterId),
      pendingInteractionId: this.pendingInteractable?.id ?? null,
      moveSpeed: this.isRunning ? this.config.runSpeedTilesPerSec : this.config.walkSpeedTilesPerSec,
      currentSpeed: this.currentSpeed,
    };
  }

  /**
   * Tap-to-move command: replaces any previous destination and cancels pending interactions.
   */
  public moveTo(
    targetCol: number,
    targetRow: number,
    allowNearestFallback = true,
    nowMs = Date.now()
  ): MoveCommandResult {
    if (this.state === 'Disabled') {
      return { accepted: false, usedFallbackGoal: false, destination: null, reason: 'disabled' };
    }

    this.cancelPendingOrActiveInteractionOnly();
    this.manualInput = { screenDx: 0, screenDy: 0, sprint: false };

    const result = this.pathfinding.findPath(
      this.role,
      this.position,
      { col: targetCol, row: targetRow },
      allowNearestFallback
    );

    if (!result.reachable || !result.resolvedGoal || result.path.length === 0) {
      this.path = [];
      this.destination = null;
      this.state = 'Blocked';
      this.blockedUntilMs = nowMs + 450;
      this.onBlockedFeedback?.({ col: targetCol, row: targetRow }, 'unreachable');
      return { accepted: false, usedFallbackGoal: false, destination: null, reason: 'unreachable' };
    }

    this.path = result.path;
    this.destination = result.resolvedGoal;
    this.lastGridVersion = this.pathfinding.getGrid().getVersion();
    this.state = 'Moving';
    return {
      accepted: true,
      usedFallbackGoal: result.usedFallbackGoal,
      destination: result.resolvedGoal,
    };
  }

  /**
   * Tap-on-object command: validates enabled + role permission, navigates to a reachable
   * approach spot within interactionRadius, faces the object, and executes its callback ONCE.
   */
  public moveToInteract(objectId: string, nowMs = Date.now()): MoveCommandResult {
    if (this.state === 'Disabled') {
      return { accepted: false, usedFallbackGoal: false, destination: null, reason: 'disabled' };
    }

    const validation = this.interactionSystem.validateAccess(this.role, objectId);
    if (!validation.allowed) {
      const reason =
        validation.reason === 'role_restricted'
          ? 'role_restricted'
          : validation.reason === 'disabled'
            ? 'object_disabled'
            : 'unreachable';
      return { accepted: false, usedFallbackGoal: false, destination: null, reason };
    }

    const obj = this.interactionSystem.getById(objectId)!;
    this.cancelPendingOrActiveInteractionOnly();
    this.manualInput = { screenDx: 0, screenDy: 0, sprint: false };

    const dist = Math.hypot(this.position.col - obj.col, this.position.row - obj.row);
    if (dist <= obj.interactionRadius) {
      this.path = [];
      this.destination = null;
      this.beginInteractionWith(obj, nowMs);
      return { accepted: true, usedFallbackGoal: false, destination: { ...this.position } };
    }

    const approachResult = this.pathfinding.findPathToApproach(
      this.role,
      this.position,
      { col: obj.col, row: obj.row },
      1
    );

    if (!approachResult.reachable || !approachResult.resolvedGoal) {
      this.state = 'Blocked';
      this.blockedUntilMs = nowMs + 450;
      this.onBlockedFeedback?.({ col: obj.col, row: obj.row }, 'unreachable');
      return { accepted: false, usedFallbackGoal: false, destination: null, reason: 'unreachable' };
    }

    this.pendingInteractable = obj;
    this.pendingInteractToken += 1;
    this.path = approachResult.path;
    this.destination = approachResult.resolvedGoal;
    this.lastGridVersion = this.pathfinding.getGrid().getVersion();
    this.state = 'Moving';

    return {
      accepted: true,
      usedFallbackGoal: false,
      destination: approachResult.resolvedGoal,
    };
  }

  /**
   * Sets continuous manual directional input (WASD / Arrow keys / optional touch joystick).
   * Non-zero manual input cleanly cancels active pathfinding and pending/active interactions.
   */
  public setManualInput(screenDx: number, screenDy: number, sprint = false): void {
    if (this.state === 'Disabled') return;

    const hasInput = Math.hypot(screenDx, screenDy) > 0.1;
    if (hasInput) {
      if (this.path.length > 0 || this.pendingInteractable || this.state === 'Interacting') {
        this.cancelMovementAndInteraction();
      }
    }
    this.manualInput = { screenDx, screenDy, sprint };
  }

  /**
   * Cancels movement path and safely cancels any pending or active interaction.
   */
  public cancelMovementAndInteraction(): void {
    this.path = [];
    this.destination = null;
    this.manualInput = { screenDx: 0, screenDy: 0, sprint: false };
    this.currentSpeed = 0;
    this.isRunning = false;
    this.cancelPendingOrActiveInteractionOnly();
    if (this.state !== 'Disabled') {
      this.state = this.isCarrying ? 'Carrying' : 'Idle';
    }
  }

  private cancelPendingOrActiveInteractionOnly(): void {
    this.pendingInteractable = null;
    this.pendingInteractToken += 1;
    this.interactionSystem.cancelForCharacter(this.characterId);
  }

  /**
   * Advances movement, path recalculation, collision sliding, and interaction timers.
   */
  public update(dtSeconds: number, nowMs = Date.now()): CharacterMovementSnapshot {
    const dt = Math.max(0, Math.min(0.05, dtSeconds));

    // 1. Update active timed interactions
    const finished = this.interactionSystem.update(nowMs);
    if (finished.includes(this.characterId) && this.state === 'Interacting') {
      this.state = this.isCarrying ? 'Carrying' : 'Idle';
    }

    if (this.state === 'Disabled') {
      return this.getSnapshot();
    }

    if (this.state === 'Blocked' && nowMs >= this.blockedUntilMs) {
      this.state = this.isCarrying ? 'Carrying' : 'Idle';
    }

    if (this.state === 'Interacting') {
      this.currentSpeed = 0;
      this.isRunning = false;
      return this.getSnapshot();
    }

    // 2. Manual keyboard / optional joystick movement (strictly normalized diagonal speed!)
    const manualMag = Math.hypot(this.manualInput.screenDx, this.manualInput.screenDy);
    if (manualMag > 0.1) {
      this.stepManualMovement(dt, manualMag);
      return this.getSnapshot();
    }

    // 3. Pathfinding movement (tap-to-move or interact approach)
    if (this.path.length > 0) {
      this.stepPathMovement(dt, nowMs);
      return this.getSnapshot();
    }

    // 4. Smooth deceleration to Idle / Carrying
    if (this.currentSpeed > 0) {
      this.currentSpeed = Math.max(0, this.currentSpeed - this.config.deceleration * dt);
    }
    this.isRunning = false;
    if (this.state === 'Moving') {
      this.state = this.isCarrying ? 'Carrying' : 'Idle';
    }

    return this.getSnapshot();
  }

  private stepManualMovement(dt: number, manualMag: number): void {
    const nx = this.manualInput.screenDx / manualMag;
    const ny = this.manualInput.screenDy / manualMag;

    // Convert normalized screen-space direction to normalized isometric grid vector
    // Ensures diagonal speed equals horizontal/vertical speed!
    const rawGridDx = nx + ny;
    const rawGridDy = ny - nx;
    const gridLen = Math.hypot(rawGridDx, rawGridDy) || 1;
    const unitGridDx = rawGridDx / gridLen;
    const unitGridDy = rawGridDy / gridLen;

    const targetSpeed = this.manualInput.sprint
      ? this.config.runSpeedTilesPerSec
      : this.config.walkSpeedTilesPerSec;
    this.currentSpeed = Math.min(targetSpeed, this.currentSpeed + this.config.acceleration * dt);
    this.isRunning = this.manualInput.sprint;

    const proposed: GridCoord = {
      col: this.position.col + unitGridDx * this.currentSpeed * dt,
      row: this.position.row + unitGridDy * this.currentSpeed * dt,
    };

    const resolved = this.collision.resolveMovement(this.role, this.position, proposed);
    const movedDist = Math.hypot(
      resolved.position.col - this.position.col,
      resolved.position.row - this.position.row
    );

    this.position = resolved.position;
    this.facing = this.resolveFourWayFacing(nx, ny);
    this.state = movedDist > this.config.minMoveEpsilon ? 'Moving' : this.isCarrying ? 'Carrying' : 'Idle';
  }

  private stepPathMovement(dt: number, nowMs: number): void {
    // Recalculate automatically if NavigationGrid dynamic obstacles changed!
    const currentGridVer = this.pathfinding.getGrid().getVersion();
    if (currentGridVer !== this.lastGridVersion) {
      this.lastGridVersion = currentGridVer;
      if (!this.pathfinding.isPathClear(this.role, this.position, this.path)) {
        const recalculated = this.pendingInteractable
          ? this.pathfinding.findPathToApproach(
              this.role,
              this.position,
              { col: this.pendingInteractable.col, row: this.pendingInteractable.row },
              1
            )
          : this.destination
            ? this.pathfinding.findPath(this.role, this.position, this.destination, true)
            : { reachable: false, path: [], resolvedGoal: null, usedFallbackGoal: false };

        if (!recalculated.reachable || recalculated.path.length === 0) {
          this.cancelMovementAndInteraction();
          this.state = 'Blocked';
          this.blockedUntilMs = nowMs + 450;
          return;
        }
        this.path = recalculated.path;
        this.destination = recalculated.resolvedGoal;
      }
    }

    // Early arrival check when approaching an interactable object within its radius
    if (this.pendingInteractable) {
      const distToObj = Math.hypot(
        this.position.col - this.pendingInteractable.col,
        this.position.row - this.pendingInteractable.row
      );
      if (distToObj <= this.pendingInteractable.interactionRadius) {
        const obj = this.pendingInteractable;
        this.path = [];
        this.destination = null;
        this.beginInteractionWith(obj, nowMs);
        return;
      }
    }

    const waypoint = this.path[0];
    const dc = waypoint.col - this.position.col;
    const dr = waypoint.row - this.position.row;
    const dist = Math.hypot(dc, dr);

    const remainingDist = this.computeRemainingDistance(dist);
    this.isRunning = remainingDist > this.config.longPathRunThreshold;
    const targetSpeed = this.isRunning
      ? this.config.runSpeedTilesPerSec
      : this.config.walkSpeedTilesPerSec;
    this.currentSpeed = Math.min(targetSpeed, this.currentSpeed + this.config.acceleration * dt);

    const isLastWaypoint = this.path.length === 1;
    const reachThreshold = isLastWaypoint
      ? this.config.stoppingDistance
      : this.config.waypointReachDistance;

    if (dist <= reachThreshold) {
      const snapCheck = this.collision.resolveMovement(this.role, this.position, waypoint);
      this.position = snapCheck.position;
      this.path.shift();

      if (this.path.length === 0) {
        this.destination = null;
        this.currentSpeed = 0;
        this.isRunning = false;
        if (this.pendingInteractable) {
          const obj = this.pendingInteractable;
          this.beginInteractionWith(obj, nowMs);
        } else {
          this.state = this.isCarrying ? 'Carrying' : 'Idle';
        }
      }
      return;
    }

    // Normalized grid step — diagonal and cardinal speeds are strictly identical
    const step = Math.min(dist, this.currentSpeed * dt);
    const proposed: GridCoord = {
      col: this.position.col + (dc / dist) * step,
      row: this.position.row + (dr / dist) * step,
    };

    const resolved = this.collision.resolveMovement(this.role, this.position, proposed);
    const movedDist = Math.hypot(
      resolved.position.col - this.position.col,
      resolved.position.row - this.position.row
    );

    if (movedDist <= this.config.minMoveEpsilon && resolved.wasBlocked) {
      // Blocked unexpectedly — stop safely instead of oscillating
      this.cancelMovementAndInteraction();
      this.state = 'Blocked';
      this.blockedUntilMs = nowMs + 400;
      return;
    }

    this.position = resolved.position;
    const screenStepX = dc - dr;
    const screenStepY = (dc + dr) * 0.52;
    this.facing = this.resolveFourWayFacing(screenStepX, screenStepY);
    this.state = 'Moving';
  }

  private beginInteractionWith(obj: InteractableObject, nowMs = Date.now()): void {
    const tokenAtStart = this.pendingInteractToken;
    this.pendingInteractable = null;
    this.currentSpeed = 0;
    this.isRunning = false;

    // Face the object before triggering interaction
    this.faceTowards(obj.col, obj.row);

    // Guard against stale cancellation
    if (tokenAtStart !== this.pendingInteractToken) return;

    const exec = this.interactionSystem.executeInteraction(
      this.characterId,
      this.role,
      obj.id,
      this.position,
      nowMs
    );

    if (exec.started && obj.interactionDurationMs > 0) {
      this.state = 'Interacting';
    } else {
      this.state = this.isCarrying ? 'Carrying' : 'Idle';
    }
  }

  public faceTowards(targetCol: number, targetRow: number): void {
    const dc = targetCol - this.position.col;
    const dr = targetRow - this.position.row;
    if (Math.hypot(dc, dr) < 0.01) return;
    const screenX = dc - dr;
    const screenY = (dc + dr) * 0.52;
    this.facing = this.resolveFourWayFacing(screenX, screenY);
  }

  private resolveFourWayFacing(screenX: number, screenY: number): FacingDirection {
    if (Math.abs(screenX) >= Math.abs(screenY) * 1.1) {
      return screenX < 0 ? 'left' : 'right';
    }
    return screenY < 0 ? 'back' : 'front';
  }

  private computeRemainingDistance(distToFirst: number): number {
    let total = distToFirst;
    for (let i = 0; i < this.path.length - 1; i++) {
      total += Math.hypot(
        this.path[i + 1].col - this.path[i].col,
        this.path[i + 1].row - this.path[i].row
      );
    }
    return total;
  }
}
