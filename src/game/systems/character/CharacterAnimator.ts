import Phaser from 'phaser';
import type {
  CharacterAnimState,
  FacingDirection,
  PlayerAvatarState,
  PlayerRole,
} from '../../../shared/types.ts';
import { getAnimKey, isValidAnimForRole } from './CharacterAnimations.ts';

export interface CharacterMotionInput {
  state: PlayerAvatarState;
  facing: FacingDirection;
  isMoving: boolean;
  isRunning: boolean;
  timeRemaining: number;
  nowMs: number;
}

export interface CharacterVisualFeedback {
  activeAnim: CharacterAnimState;
  flipX: boolean;
  shadowScaleX: number;
  shadowScaleY: number;
  shadowAlpha: number;
}

const BASE_SCALE = 0.88;

/**
 * State machine + smooth transition controller for 2.5D chibi Phaser 3 characters.
 * Resolves priority between server-triggered action/emotion animations, locomotion
 * (run, carry, 4-way walk), and contextual idle (normal vs tired).
 */
export class CharacterAnimator {
  private scene: Phaser.Scene;
  private role: PlayerRole;
  private sprite: Phaser.GameObjects.Sprite;
  private currentAnim: CharacterAnimState | null = null;
  private transitionTween: Phaser.Tweens.Tween | null = null;
  private baseScale: number;

  constructor(
    scene: Phaser.Scene,
    role: PlayerRole,
    sprite: Phaser.GameObjects.Sprite,
    baseScale = BASE_SCALE
  ) {
    this.scene = scene;
    this.role = role;
    this.sprite = sprite;
    this.baseScale = baseScale;
    this.sprite.setScale(baseScale);
  }

  public resolveAnimState(input: CharacterMotionInput): CharacterAnimState {
    const { state, facing, isMoving, isRunning, timeRemaining, nowMs } = input;

    // 1. High-priority action or emotional reaction from authoritative simulation
    if (
      state.actionAnim &&
      state.actionAnimUntil > nowMs &&
      isValidAnimForRole(this.role, state.actionAnim)
    ) {
      // Allow moving to cancel subtle idle-like reactions except strong work/reaction locks
      const lockWhileMoving =
        state.actionAnim === 'burnt_reaction' ||
        state.actionAnim === 'happy' ||
        state.actionAnim === 'angry' ||
        state.actionAnim === 'sad' ||
        state.actionAnim === 'tired';
      if (!isMoving || lockWhileMoving) {
        return state.actionAnim;
      }
    }

    // 2. Locomotion states
    if (isMoving) {
      if (isRunning) {
        return 'run';
      }
      if (state.carriedItem) {
        return this.role === 'waiter' ? 'carrying_tray' : 'carry_item';
      }
      switch (facing) {
        case 'front':
          return 'walk_front';
        case 'back':
          return 'walk_back';
        case 'left':
          return 'walk_left';
        case 'right':
          return 'walk_right';
      }
    }

    // 3. Standing while holding an item
    if (state.carriedItem) {
      return this.role === 'waiter' ? 'carrying_tray' : 'carry_item';
    }

    // 4. Contextual rush fatigue near end of shift when standing idle
    if (timeRemaining > 0 && timeRemaining <= 18) {
      return 'tired';
    }

    return 'idle';
  }

  public update(input: CharacterMotionInput, elapsedSec: number): CharacterVisualFeedback {
    const target = this.resolveAnimState(input);
    const shouldFlip = this.computeFlipX(target, input.facing);

    this.playState(target, shouldFlip);

    // Dynamic ground shadow coupling for crisp 2.5D depth feel
    let shadowScaleX = 1.0;
    let shadowScaleY = 1.0;
    let shadowAlpha = 0.82;

    if (target === 'run') {
      const pulse = Math.abs(Math.sin(elapsedSec * 15));
      shadowScaleX = 0.86 + (1 - pulse) * 0.12;
      shadowScaleY = 0.82 + (1 - pulse) * 0.12;
      shadowAlpha = 0.72;
    } else if (target === 'happy') {
      const hop = Math.abs(Math.sin(elapsedSec * 10));
      shadowScaleX = 0.78 + (1 - hop) * 0.22;
      shadowScaleY = 0.76 + (1 - hop) * 0.22;
      shadowAlpha = 0.66 + (1 - hop) * 0.16;
    } else if (
      target === 'walk_front' ||
      target === 'walk_back' ||
      target === 'walk_left' ||
      target === 'walk_right' ||
      target === 'carry_item' ||
      target === 'carrying_tray'
    ) {
      const stride = Math.abs(Math.sin(elapsedSec * 11));
      shadowScaleX = 0.92 + (1 - stride) * 0.08;
      shadowScaleY = 0.92 + (1 - stride) * 0.06;
    } else if (target === 'tired' || target === 'sad') {
      shadowScaleX = 1.06;
      shadowScaleY = 1.02;
    }

    return {
      activeAnim: target,
      flipX: shouldFlip,
      shadowScaleX,
      shadowScaleY,
      shadowAlpha,
    };
  }

  public playState(state: CharacterAnimState, flipX = false): void {
    const resolved: CharacterAnimState = isValidAnimForRole(this.role, state) ? state : 'idle';
    const animKey = getAnimKey(this.role, resolved);

    this.sprite.setFlipX(flipX);

    if (this.currentAnim !== resolved) {
      this.currentAnim = resolved;
      if (this.scene.anims.exists(animKey)) {
        this.sprite.play(animKey, true);
      }
      this.playSmoothTransitionSquash();
    } else if (!this.sprite.anims.isPlaying && this.scene.anims.exists(animKey)) {
      this.sprite.play(animKey, true);
    }
  }

  private computeFlipX(anim: CharacterAnimState, facing: FacingDirection): boolean {
    // Dedicated 4-way walk animations already encode exact left/right/front/back art
    if (
      anim === 'walk_left' ||
      anim === 'walk_right' ||
      anim === 'walk_front' ||
      anim === 'walk_back'
    ) {
      return false;
    }
    // Symmetric front-facing emotions & actions read best unflipped unless facing left while running/carrying
    if (
      anim === 'run' ||
      anim === 'carry_item' ||
      anim === 'carrying_tray' ||
      anim === 'serving_counter' ||
      anim === 'serving_food' ||
      anim === 'frying'
    ) {
      return facing === 'left';
    }
    return false;
  }

  private playSmoothTransitionSquash(): void {
    if (this.transitionTween) {
      this.transitionTween.stop();
      this.transitionTween = null;
    }
    this.sprite.setScale(this.baseScale * 1.07, this.baseScale * 0.93);
    this.transitionTween = this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.baseScale,
      scaleY: this.baseScale,
      duration: 120,
      ease: 'Back.easeOut',
    });
  }

  public getCurrentAnim(): CharacterAnimState {
    return this.currentAnim ?? 'idle';
  }

  public destroy(): void {
    if (this.transitionTween) {
      this.transitionTween.stop();
      this.transitionTween = null;
    }
  }
}
