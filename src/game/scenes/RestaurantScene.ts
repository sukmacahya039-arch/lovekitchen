import Phaser from 'phaser';
import { CHEF_SPAWN, WAITER_SPAWN } from '../../shared/layout.ts';
import { isSoloControlMode, type GameSnapshot, type PlayerRole } from '../../shared/types.ts';
import { audioManager } from '../systems/audio/AudioManager.ts';
import {
  CharacterRenderer,
  type LocalCharacterMotion,
} from '../systems/character/CharacterRenderer.ts';
import { CollisionSystem } from '../systems/collision/CollisionSystem.ts';
import { CookingSystem } from '../systems/cooking/CookingSystem.ts';
import { CustomerRenderer } from '../systems/customer/CustomerRenderer.ts';
import { MovementDebugOverlay } from '../systems/debug/MovementDebugOverlay.ts';
import { InputController } from '../systems/input/InputController.ts';
import { InteractionIndicatorRenderer } from '../systems/interaction/InteractionIndicatorRenderer.ts';
import {
  InteractionSystem,
  type InteractableObject,
} from '../systems/interaction/InteractionSystem.ts';
import { KitchenSystem } from '../systems/kitchen/KitchenSystem.ts';
import {
  MovementController,
  type CharacterMovementSnapshot,
} from '../systems/movement/MovementController.ts';
import { socketService } from '../systems/multiplayer/SocketService.ts';
import { NavigationGrid } from '../systems/navigation/NavigationGrid.ts';
import { PathfindingService } from '../systems/navigation/PathfindingService.ts';
import { OrderSystem } from '../systems/order/OrderSystem.ts';
import { gameSessionManager } from '../systems/session/GameSessionManager.ts';
import { SOLO_BALANCE_CONFIG } from '../systems/solo/SoloConfig.ts';
import { gameBridge } from '../systems/ui/GameBridge.ts';

declare global {
  interface Window {
    __LOVE_KITCHEN_DEBUG__?: {
      toggle: () => boolean;
      getSnapshots: () => Record<PlayerRole, CharacterMovementSnapshot>;
    };
  }
}

export class RestaurantScene extends Phaser.Scene {
  private kitchenSystem!: KitchenSystem;
  private cookingSystem!: CookingSystem;
  private customerRenderer!: CustomerRenderer;
  private characterRenderer!: CharacterRenderer;
  private orderSystem!: OrderSystem;

  // Phase 04 modular movement, navigation, collision, interaction, input & debug systems
  private navGrid!: NavigationGrid;
  private pathfinding!: PathfindingService;
  private collisionSystem!: CollisionSystem;
  private interactionSystem!: InteractionSystem;
  private controllers!: Record<PlayerRole, MovementController>;
  private inputController!: InputController;
  private indicatorRenderer!: InteractionIndicatorRenderer;
  private debugOverlay!: MovementDebugOverlay;

  private snapshot: GameSnapshot | null = null;
  private activeRole: PlayerRole = 'chef';
  private lastSentMoving = false;
  private lastSentRunning = false;
  private lastReportedBridgeMoving = false;

  private unsubState?: () => void;
  private unsubBridge?: () => void;

  constructor() {
    super('RestaurantScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#FDEBD2');
    audioManager.startMusic('kitchen');

    // Warm sunlit pastel backdrop behind isometric Burger Cafe platform
    const bg = this.add.graphics();
    bg.fillGradientStyle(0xfff6ea, 0xffeff4, 0xfbe0c8, 0xf9cedc, 1);
    bg.fillRect(0, 0, 1280, 720);
    bg.setDepth(0);

    // 1. Initialize Phase 04 core navigation, collision & generic interaction systems
    this.navGrid = new NavigationGrid();
    this.pathfinding = new PathfindingService(this.navGrid);
    this.collisionSystem = new CollisionSystem(this.navGrid);
    this.interactionSystem = new InteractionSystem();

    // 2. Build isometric restaurant map & props, routing sprite taps to InputController (Priority 2)
    this.kitchenSystem = new KitchenSystem(this, (spot, pointer) => {
      this.inputController?.notifyInteractableTapped(spot.id, pointer);
    });
    this.cookingSystem = new CookingSystem(this);
    this.customerRenderer = new CustomerRenderer(this);
    this.characterRenderer = new CharacterRenderer(this);
    this.orderSystem = new OrderSystem(this);

    // 3. Visual indicators (outline + short label + tap destination ring + blocked ripple) & dev debug overlay
    this.indicatorRenderer = new InteractionIndicatorRenderer(this);
    this.debugOverlay = new MovementDebugOverlay(this);

    // 4. Register every restaurant interactive object into the generic InteractionSystem
    this.registerKitchenInteractables();

    // 5. Create reusable MovementControllers for BOTH Chef Male and Waiter Female
    const myIdentityId = gameSessionManager.getLocalIdentityId();
    this.controllers = {
      chef: new MovementController(
        {
          characterId: 'chef_male',
          playerId: myIdentityId,
          role: 'chef',
          startPosition: CHEF_SPAWN,
          facing: 'front',
        },
        this.pathfinding,
        this.collisionSystem,
        this.interactionSystem
      ),
      waiter: new MovementController(
        {
          characterId: 'waiter_female',
          playerId: myIdentityId,
          role: 'waiter',
          startPosition: WAITER_SPAWN,
          facing: 'front',
        },
        this.pathfinding,
        this.collisionSystem,
        this.interactionSystem
      ),
    };

    const blockedHandler = (target: { col: number; row: number }) => {
      this.indicatorRenderer.triggerBlockedRipple(target.col, target.row);
    };
    this.controllers.chef.setBlockedFeedbackHandler(blockedHandler);
    this.controllers.waiter.setBlockedFeedbackHandler(blockedHandler);

    // Determine initial role cleanly for either Offline Solo or Online Co-Op
    if (gameSessionManager.isSoloSession()) {
      this.activeRole =
        gameSessionManager.getSoloSession()?.getActiveRole() ?? SOLO_BALANCE_CONFIG.initialRole;
    } else {
      const room = socketService.getCurrentRoom();
      const me = room?.members.find((m) => m.socketId === myIdentityId);
      this.activeRole = me?.role ?? 'chef';
    }
    this.lastReportedBridgeMoving = false;
    gameBridge.patch({
      activeScene: 'RestaurantScene',
      activeControlRole: this.activeRole,
      isCharacterMoving: false,
    });

    // Load initial snapshot immediately (synchronous for LocalSoloSession, cached for Online)
    const initial = gameSessionManager.getLatestSnapshot();
    if (initial) {
      this.applySnapshot(initial, true);
    }

    // 6. Initialize 4-level priority InputController (UI > Interactable > Walkable > Blocked)
    this.inputController = new InputController(this, this.interactionSystem, {
      isGameplayActive: () => this.isWorldInputActive(),
      onUnlockAudio: () => audioManager.unlock(),
      onSelectInteractable: (obj) => this.handleInteractableSelection(obj),
      onTapFloorDestination: (col, row) => this.handleFloorDestinationTap(col, row),
      onTriggerInteractKey: () => this.triggerNearestInteract(),
      onCancelOrPauseKey: () => this.handleCancelOrPause(),
      onSwapPracticeRoleKey: () => this.trySwapPracticeRole(),
      onSelectRoleKey: (role) => this.trySelectSoloRole(role),
      onToggleDebugKey: () => {
        const enabled = this.debugOverlay.toggle();
        gameBridge.showToast(enabled ? 'Debug Mode: ON (F3)' : 'Debug Mode: OFF', 1400);
      },
    });

    // Expose developer-only debug hook on window (off by default)
    if (typeof window !== 'undefined') {
      window.__LOVE_KITCHEN_DEBUG__ = {
        toggle: () => this.debugOverlay.toggle(),
        getSnapshots: () => ({
          chef: this.controllers.chef.getSnapshot(),
          waiter: this.controllers.waiter.getSnapshot(),
        }),
      };
    }

    // Optional virtual joystick, action button & contextual Cancel Move HUD controls
    gameBridge.registerControls(
      (dx, dy) => {
        this.inputController.setVirtualJoystickVector(dx, dy);
      },
      () => this.triggerNearestInteract(),
      () => this.cancelActiveMovement()
    );

    // Watch role swap triggered from React HUD segmented [CHEF][WAITER] button in Solo / Practice mode
    this.unsubBridge = gameBridge.subscribe((state) => {
      if (
        isSoloControlMode(this.snapshot?.mode) &&
        state.activeControlRole !== this.activeRole
      ) {
        this.applyRoleSwitch(state.activeControlRole);
      }
    });

    this.unsubState = gameSessionManager.on('gameState', (snap) => {
      this.applySnapshot(snap, false);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanup();
    });
  }

  private registerKitchenInteractables(): void {
    for (const spot of this.kitchenSystem.getHotspots()) {
      this.interactionSystem.register({
        id: spot.id,
        type: spot.interactableType,
        col: spot.col,
        row: spot.row,
        requiredRole: spot.roleAllowed,
        onInteract: (ctx) => {
          // Phase 06: When Waiter interacts empty-handed with an OCCUPIED or WAITING_FOR_ORDER table,
          // open the structured Waiter Order Taking UI instead of silently auto-creating a legacy order.
          if (ctx.role === 'waiter' && ctx.object.type === 'DiningTable' && this.snapshot) {
            const waiter = this.snapshot.players.waiter;
            const table = this.snapshot.tables.find((t) => t.id === ctx.object.id);
            const tableReadyForOrder =
              table &&
              (table.phase05Status === 'WAITING_FOR_ORDER' ||
                table.phase05Status === 'OCCUPIED' ||
                table.status === 'ready_to_order' ||
                table.status === 'browsing');
            if (tableReadyForOrder && !waiter?.carriedItem) {
              audioManager.playSfx('click');
              gameBridge.openOrderMenu(table.id);
              return;
            }
          }

          void gameSessionManager.sendInteract(ctx.role, ctx.object.id).then((res) => {
            if (res.ok) {
              audioManager.playSfx('pick');
            } else if (res.message) {
              gameBridge.showToast(res.message);
            }
          });
        },
      });
    }
  }

  private isWorldInputActive(): boolean {
    if (this.snapshot?.phase !== 'playing') return false;
    const ui = gameBridge.getState();
    return !ui.orderMenuTableId && !ui.showKitchenBoard && !ui.selectedRecipeId;
  }

  private applySnapshot(snap: GameSnapshot, snapBothPositions: boolean): void {
    this.snapshot = snap;
    gameBridge.patch({ lastSnapshot: snap });

    (['chef', 'waiter'] as PlayerRole[]).forEach((role) => {
      const p = snap.players[role];
      if (!p) return;
      const ctrl = this.controllers[role];
      ctrl.setCarrying(Boolean(p.carriedItem));
      if (snapBothPositions || role !== this.activeRole) {
        ctrl.syncExternalPosition(p.col, p.row, p.facing);
      }
    });

    // Keep disabled dining tables non-interactable (e.g., 4 active tables in Solo Mode)
    for (const tbl of snap.tables) {
      this.interactionSystem.setEnabled(tbl.id, tbl.phase05Status !== 'DISABLED');
    }

    this.cookingSystem.sync(snap.stations, 0.016);
    this.kitchenSystem.syncServingPass(snap.servingPass);
    this.kitchenSystem.syncCafeProps(
      snap.prepTableItem,
      snap.cashierTips,
      Date.now() < snap.waiterCleanBuffUntil
    );
    this.customerRenderer.sync(snap.tables, snap.customers ?? [], snap.restaurantMetrics);
    this.orderSystem.processEvents(snap.recentEvents);
  }

  private handleInteractableSelection(obj: InteractableObject): void {
    if (!this.snapshot || this.snapshot.phase !== 'playing') return;

    // In Solo / Practice mode, tapping an object belonging exclusively to the other role switches smoothly
    if (isSoloControlMode(this.snapshot.mode)) {
      if (obj.requiredRole === 'chef' && this.activeRole !== 'chef') {
        this.switchPracticeRole('chef');
      } else if (obj.requiredRole === 'waiter' && this.activeRole !== 'waiter') {
        this.switchPracticeRole('waiter');
      }
    }

    const activeController = this.controllers[this.activeRole];
    const result = activeController.moveToInteract(obj.id);

    if (!result.accepted) {
      if (result.reason === 'role_restricted') {
        this.indicatorRenderer.triggerBlockedRipple(obj.col, obj.row);
        gameBridge.showToast(
          this.activeRole === 'chef'
            ? 'Area Ruang Makan khusus Waiter!'
            : 'Area Dapur khusus Chef!'
        );
      } else if (result.reason === 'object_disabled') {
        this.indicatorRenderer.triggerBlockedRipple(obj.col, obj.row);
      }
      return;
    }

    if (result.destination) {
      this.indicatorRenderer.triggerTapRipple(
        result.destination.col,
        result.destination.row,
        this.activeRole
      );
    }
  }

  private handleFloorDestinationTap(col: number, row: number): void {
    if (!this.snapshot || this.snapshot.phase !== 'playing') return;

    const activeController = this.controllers[this.activeRole];
    const result = activeController.moveTo(col, row, true);
    if (result.accepted && result.destination) {
      this.indicatorRenderer.triggerTapRipple(
        result.destination.col,
        result.destination.row,
        this.activeRole
      );
    }
  }

  private triggerNearestInteract(): void {
    audioManager.unlock();
    if (!this.snapshot || this.snapshot.phase !== 'playing') return;

    const activeController = this.controllers[this.activeRole];
    const pos = activeController.getPosition();
    const nearest = this.interactionSystem.findNearestInteractable(this.activeRole, pos);

    if (nearest) {
      activeController.moveToInteract(nearest.id);
      return;
    }

    // Fallback to session proximity interact if standing near a dynamic context spot
    void gameSessionManager.sendInteract(this.activeRole).then((res) => {
      if (res.ok) {
        audioManager.playSfx('pick');
      } else if (res.message) {
        gameBridge.showToast(res.message);
      }
    });
  }

  private cancelActiveMovement(): void {
    const activeController = this.controllers[this.activeRole];
    activeController.cancelMovementAndInteraction();
    this.syncMoveNetworkState(activeController.getSnapshot());
  }

  private handleCancelOrPause(): void {
    if (!this.snapshot || this.snapshot.phase !== 'playing') return;

    const activeController = this.controllers[this.activeRole];
    const snap = activeController.getSnapshot();
    if (
      snap.movementState === 'Moving' ||
      snap.movementState === 'Interacting' ||
      snap.pendingInteractionId !== null
    ) {
      this.cancelActiveMovement();
      return;
    }

    gameSessionManager.setPaused(true);
    gameBridge.navigateTo('PauseScene');
  }

  private trySwapPracticeRole(): void {
    if (!isSoloControlMode(this.snapshot?.mode)) return;
    this.switchPracticeRole(this.activeRole === 'chef' ? 'waiter' : 'chef');
  }

  private trySelectSoloRole(role: PlayerRole): void {
    if (!isSoloControlMode(this.snapshot?.mode)) return;
    if (this.activeRole === role) return;
    this.switchPracticeRole(role);
  }

  private switchPracticeRole(next: PlayerRole): void {
    if (!this.snapshot || this.activeRole === next) return;
    this.applyRoleSwitch(next);
    audioManager.playSfx('click');
    gameBridge.patch({ activeControlRole: next });
    gameBridge.showToast(next === 'chef' ? 'Chef Aktif' : 'Waiter Aktif', 1100);
  }

  private applyRoleSwitch(next: PlayerRole): void {
    // Freeze active path on previous character right where they stand (never resets position or timers!)
    const prevCtrl = this.controllers[this.activeRole];
    prevCtrl.cancelMovementAndInteraction();
    this.syncMoveNetworkState(prevCtrl.getSnapshot());

    this.activeRole = next;
    gameSessionManager.setSoloActiveRole(next);
    const p = this.snapshot?.players[next];
    if (p) {
      this.controllers[next].syncExternalPosition(p.col, p.row, p.facing);
      this.controllers[next].setCarrying(Boolean(p.carriedItem));
    }
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    if (!this.snapshot) return;

    this.kitchenSystem.update(dt);
    this.cookingSystem.sync(this.snapshot.stations, dt);
    this.customerRenderer.update(dt);

    const activeController = this.controllers[this.activeRole];

    if (this.isWorldInputActive()) {
      const manual = this.inputController.sampleManualDirection();
      activeController.setManualInput(manual.dx, manual.dy, manual.sprint);
    } else {
      activeController.setManualInput(0, 0, false);
    }

    const activeSnap = activeController.update(dt);
    const otherRole: PlayerRole = this.activeRole === 'chef' ? 'waiter' : 'chef';
    const otherSnap = this.controllers[otherRole].getSnapshot();

    if (this.snapshot.phase === 'playing') {
      this.syncMoveNetworkState(activeSnap);
    }

    // Update contextual Cancel Move visibility in React HUD only when boolean changes
    const movingOrApproaching =
      activeSnap.isMoving || activeSnap.pendingInteractionId !== null;
    if (movingOrApproaching !== this.lastReportedBridgeMoving) {
      this.lastReportedBridgeMoving = movingOrApproaching;
      gameBridge.patch({ isCharacterMoving: movingOrApproaching });
    }

    // Determine focused interactable (targeted object while approaching, or closest in-range object)
    const pendingObj = activeSnap.pendingInteractionId
      ? this.interactionSystem.getById(activeSnap.pendingInteractionId) ?? null
      : null;
    const focusedObj =
      pendingObj ??
      this.interactionSystem.findNearestInteractable(this.activeRole, activeSnap.position);

    const actionLabel = focusedObj
      ? this.interactionSystem.getActionLabel(this.activeRole, focusedObj)
      : null;

    this.indicatorRenderer.update(
      dt,
      this.activeRole,
      activeSnap.path,
      activeSnap.destination,
      focusedObj,
      actionLabel
    );

    const localMotion: LocalCharacterMotion = {
      col: activeSnap.position.col,
      row: activeSnap.position.row,
      facing: activeSnap.facing,
      isMoving: activeSnap.isMoving,
      isRunning: activeSnap.isRunning,
    };

    this.characterRenderer.sync(
      this.snapshot.players,
      this.activeRole,
      localMotion,
      dt,
      this.snapshot.timeRemaining
    );

    if (this.debugOverlay.isEnabled()) {
      const allSnaps: Record<PlayerRole, CharacterMovementSnapshot> = {
        chef: this.activeRole === 'chef' ? activeSnap : otherSnap,
        waiter: this.activeRole === 'waiter' ? activeSnap : otherSnap,
      };
      this.debugOverlay.render(
        this.navGrid,
        this.activeRole,
        allSnaps,
        this.interactionSystem.getAll(),
        this.snapshot.customers ?? [],
        this.snapshot.tables ?? []
      );
    }
  }

  private syncMoveNetworkState(snap: CharacterMovementSnapshot): void {
    const moved = snap.isMoving;
    const running = snap.isRunning;
    if (moved || this.lastSentMoving || running !== this.lastSentRunning) {
      gameSessionManager.sendMove(
        this.activeRole,
        Number(snap.position.col.toFixed(2)),
        Number(snap.position.row.toFixed(2)),
        snap.facing,
        moved,
        running
      );
    }
    this.lastSentMoving = moved;
    this.lastSentRunning = running;
  }

  private cleanup(): void {
    this.unsubState?.();
    this.unsubBridge?.();
    gameBridge.registerControls(null, null, null);
    gameBridge.patch({
      isCharacterMoving: false,
      orderMenuTableId: null,
      showKitchenBoard: false,
      selectedRecipeId: null,
    });
    if (typeof window !== 'undefined') {
      delete window.__LOVE_KITCHEN_DEBUG__;
    }
    this.inputController?.destroy();
    this.indicatorRenderer?.destroy();
    this.debugOverlay?.destroy();
    this.interactionSystem?.clear();
    this.kitchenSystem?.destroy();
    this.cookingSystem?.destroy();
    this.customerRenderer?.destroy();
    this.characterRenderer?.destroy();
  }
}
