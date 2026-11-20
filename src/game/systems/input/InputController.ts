import Phaser from 'phaser';
import { MOVEMENT_CONFIG } from '../../config/movementConfig.ts';
import { InteractionSystem, type InteractableObject } from '../interaction/InteractionSystem.ts';
import { isoToGrid } from '../restaurant/IsometricGrid.ts';

export interface InputCallbacks {
  isGameplayActive: () => boolean;
  onSelectInteractable: (obj: InteractableObject) => void;
  onTapFloorDestination: (col: number, row: number) => void;
  onTriggerInteractKey: () => void;
  onCancelOrPauseKey: () => void;
  onSwapPracticeRoleKey: () => void;
  onToggleDebugKey: () => void;
  onUnlockAudio: () => void;
}

export interface ManualDirectionSample {
  dx: number;
  dy: number;
  sprint: boolean;
}

/**
 * Clean 4-level priority InputController for Android touchscreen + Desktop keyboard:
 *   1. UI interaction (DOM HUD controls never leak to canvas)
 *   2. Interactable object selection (Phaser object tap or world-grid interactable hit)
 *   3. Walkable destination selection (tap-to-move)
 *   4. Empty/blocked area tap (nearest reachable fallback or blocked indicator)
 *
 * Includes pointer deduplication for hybrid Android touch/mouse devices and
 * complete listener cleanup on destroy().
 */
export class InputController {
  private scene: Phaser.Scene;
  private interactionSystem: InteractionSystem;
  private callbacks: InputCallbacks;

  private joyVector = { dx: 0, dy: 0 };
  private lastPointerDownMs = 0;
  private lastPointerPos = { x: -999, y: -999 };
  private handledInteractableThisTick = false;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    SHIFT: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
    E: Phaser.Input.Keyboard.Key;
    TAB: Phaser.Input.Keyboard.Key;
    ESC: Phaser.Input.Keyboard.Key;
    F3: Phaser.Input.Keyboard.Key;
  };

  private pointerDownListener: (
    pointer: Phaser.Input.Pointer,
    currentlyOver: Phaser.GameObjects.GameObject[]
  ) => void;

  constructor(
    scene: Phaser.Scene,
    interactionSystem: InteractionSystem,
    callbacks: InputCallbacks
  ) {
    this.scene = scene;
    this.interactionSystem = interactionSystem;
    this.callbacks = callbacks;

    this.pointerDownListener = (pointer, currentlyOver) => {
      this.handleCanvasPointerDown(pointer, currentlyOver);
    };
    this.scene.input.on('pointerdown', this.pointerDownListener);

    this.setupKeyboard();
  }

  public setVirtualJoystickVector(dx: number, dy: number): void {
    this.joyVector = { dx, dy };
  }

  /**
   * Called by Phaser interactive object pointerdown handlers (Priority 2).
   * Prevents the same tap from also triggering floor tap-to-move.
   */
  public notifyInteractableTapped(objectId: string, pointer?: Phaser.Input.Pointer): void {
    this.callbacks.onUnlockAudio();
    if (!this.callbacks.isGameplayActive()) return;
    if (pointer && this.isDuplicatePointer(pointer)) return;

    const obj = this.interactionSystem.getById(objectId);
    if (!obj) return;

    this.handledInteractableThisTick = true;
    this.callbacks.onSelectInteractable(obj);
  }

  private handleCanvasPointerDown(
    pointer: Phaser.Input.Pointer,
    currentlyOver: Phaser.GameObjects.GameObject[]
  ): void {
    this.callbacks.onUnlockAudio();

    // Priority 1: Ignore taps that originated on DOM UI buttons/overlays instead of canvas
    const targetEl = pointer.event?.target as HTMLElement | null;
    if (targetEl && this.scene.game.canvas && targetEl !== this.scene.game.canvas) {
      return;
    }

    if (!this.callbacks.isGameplayActive()) return;

    // If an interactable Phaser sprite already claimed this tap in Priority 2, skip floor move
    if (this.handledInteractableThisTick) {
      this.handledInteractableThisTick = false;
      return;
    }

    if (this.isDuplicatePointer(pointer)) return;

    // Priority 2 fallback: If pointer hit an interactive Phaser object or landed right on an interactable
    const grid = isoToGrid(pointer.worldX, pointer.worldY);
    if (currentlyOver.length > 0) {
      const nearObj = this.interactionSystem.findInteractableAtGrid(grid.col, grid.row, 0.85);
      if (nearObj) {
        this.callbacks.onSelectInteractable(nearObj);
        return;
      }
    }

    const directObj = this.interactionSystem.findInteractableAtGrid(grid.col, grid.row, 0.56);
    if (directObj) {
      this.callbacks.onSelectInteractable(directObj);
      return;
    }

    // Priority 3 & 4: Walkable destination or nearest reachable fallback
    this.callbacks.onTapFloorDestination(grid.col, grid.row);
  }

  private isDuplicatePointer(pointer: Phaser.Input.Pointer): boolean {
    const now = performance.now();
    const sameSpot =
      Math.hypot(pointer.x - this.lastPointerPos.x, pointer.y - this.lastPointerPos.y) < 10;
    if (now - this.lastPointerDownMs < MOVEMENT_CONFIG.pointerDedupeMs && sameSpot) {
      return true;
    }
    this.lastPointerDownMs = now;
    this.lastPointerPos = { x: pointer.x, y: pointer.y };
    return false;
  }

  private setupKeyboard(): void {
    const kb = this.scene.input.keyboard;
    if (!kb) return;

    this.cursors = kb.createCursorKeys();
    this.keys = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      SHIFT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      SPACE: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      E: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      TAB: kb.addKey(Phaser.Input.Keyboard.KeyCodes.TAB),
      ESC: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      F3: kb.addKey(Phaser.Input.Keyboard.KeyCodes.F3),
    };

    this.keys.SPACE.on('down', () => this.callbacks.onTriggerInteractKey());
    this.keys.E.on('down', () => this.callbacks.onTriggerInteractKey());
    this.keys.ESC.on('down', () => this.callbacks.onCancelOrPauseKey());
    this.keys.TAB.on('down', (event: KeyboardEvent) => {
      event.preventDefault();
      this.callbacks.onSwapPracticeRoleKey();
    });
    this.keys.F3.on('down', (event: KeyboardEvent) => {
      event.preventDefault();
      this.callbacks.onToggleDebugKey();
    });
  }

  public sampleManualDirection(): ManualDirectionSample {
    let dx = this.joyVector.dx;
    let dy = this.joyVector.dy;
    const joyMag = Math.hypot(this.joyVector.dx, this.joyVector.dy);
    let keyActive = false;

    if (this.cursors && this.keys) {
      if (this.cursors.left.isDown || this.keys.A.isDown) {
        dx -= 1;
        keyActive = true;
      }
      if (this.cursors.right.isDown || this.keys.D.isDown) {
        dx += 1;
        keyActive = true;
      }
      if (this.cursors.up.isDown || this.keys.W.isDown) {
        dy -= 1;
        keyActive = true;
      }
      if (this.cursors.down.isDown || this.keys.S.isDown) {
        dy += 1;
        keyActive = true;
      }
    }

    const sprint = Boolean(this.keys?.SHIFT.isDown) || (!keyActive && joyMag > 0.84);
    return { dx, dy, sprint };
  }

  public destroy(): void {
    this.scene.input.off('pointerdown', this.pointerDownListener);
    if (this.keys) {
      this.keys.SPACE.removeAllListeners();
      this.keys.E.removeAllListeners();
      this.keys.ESC.removeAllListeners();
      this.keys.TAB.removeAllListeners();
      this.keys.F3.removeAllListeners();
    }
  }
}
