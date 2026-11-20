import Phaser from 'phaser';
import type {
  CharacterAnimState,
  ChefAnimState,
  PlayerRole,
  WaiterAnimState,
} from '../../../shared/types.ts';

/**
 * Android-optimized spritesheet layout:
 * 8 columns x 9 rows = 72 slots @ 104x128 px per frame => 832x1152 px total texture
 * Safely below the 2048px WebGL MAX_TEXTURE_SIZE limit of mid-range & budget Android GPUs.
 */
export const CHAR_FRAME_W = 104;
export const CHAR_FRAME_H = 128;
export const FRAMES_PER_ANIM = 4;
export const SHEET_COLS = 8; // 2 animations side-by-side per row
export const SHEET_ROWS = 9; // 18 animation slots max (17 used per character)
export const SHEET_WIDTH = CHAR_FRAME_W * SHEET_COLS; // 832
export const SHEET_HEIGHT = CHAR_FRAME_H * SHEET_ROWS; // 1152

export const CHEF_SHEET_KEY = 'sheet_chef';
export const WAITER_SHEET_KEY = 'sheet_waiter';
export const CHAR_SHADOW_KEY = 'char_shadow';

export interface AnimSpec<T extends CharacterAnimState = CharacterAnimState> {
  state: T;
  label: string;
  slotIndex: number; // 0..16 -> startFrame = slotIndex * 4
  frameRate: number;
  repeat: number; // -1 = loop
  yoyo?: boolean;
}

export const CHEF_ANIM_SPECS: AnimSpec<ChefAnimState>[] = [
  { state: 'idle', label: 'Idle', slotIndex: 0, frameRate: 5, repeat: -1 },
  { state: 'walk_front', label: 'Walk Front', slotIndex: 1, frameRate: 9, repeat: -1 },
  { state: 'walk_back', label: 'Walk Back', slotIndex: 2, frameRate: 9, repeat: -1 },
  { state: 'walk_left', label: 'Walk Left', slotIndex: 3, frameRate: 9, repeat: -1 },
  { state: 'walk_right', label: 'Walk Right', slotIndex: 4, frameRate: 9, repeat: -1 },
  { state: 'run', label: 'Run', slotIndex: 5, frameRate: 13, repeat: -1 },
  { state: 'work', label: 'Work', slotIndex: 6, frameRate: 10, repeat: -1 },
  { state: 'carry_item', label: 'Carry Item', slotIndex: 7, frameRate: 9, repeat: -1 },
  { state: 'happy', label: 'Happy', slotIndex: 8, frameRate: 8, repeat: -1 },
  { state: 'sad', label: 'Sad', slotIndex: 9, frameRate: 5, repeat: -1 },
  { state: 'angry', label: 'Angry', slotIndex: 10, frameRate: 10, repeat: -1 },
  { state: 'tired', label: 'Tired', slotIndex: 11, frameRate: 4, repeat: -1 },
  { state: 'cooking', label: 'Cooking', slotIndex: 12, frameRate: 9, repeat: -1 },
  { state: 'frying', label: 'Frying', slotIndex: 13, frameRate: 12, repeat: -1 },
  { state: 'chopping', label: 'Chopping', slotIndex: 14, frameRate: 14, repeat: -1 },
  { state: 'serving_counter', label: 'Serve Counter', slotIndex: 15, frameRate: 8, repeat: -1 },
  { state: 'burnt_reaction', label: 'Burnt Reaction', slotIndex: 16, frameRate: 11, repeat: -1 },
];

export const WAITER_ANIM_SPECS: AnimSpec<WaiterAnimState>[] = [
  { state: 'idle', label: 'Idle', slotIndex: 0, frameRate: 5, repeat: -1 },
  { state: 'walk_front', label: 'Walk Front', slotIndex: 1, frameRate: 9, repeat: -1 },
  { state: 'walk_back', label: 'Walk Back', slotIndex: 2, frameRate: 9, repeat: -1 },
  { state: 'walk_left', label: 'Walk Left', slotIndex: 3, frameRate: 9, repeat: -1 },
  { state: 'walk_right', label: 'Walk Right', slotIndex: 4, frameRate: 9, repeat: -1 },
  { state: 'run', label: 'Run', slotIndex: 5, frameRate: 13, repeat: -1 },
  { state: 'work', label: 'Work', slotIndex: 6, frameRate: 10, repeat: -1 },
  { state: 'carry_item', label: 'Carry Item', slotIndex: 7, frameRate: 9, repeat: -1 },
  { state: 'happy', label: 'Happy', slotIndex: 8, frameRate: 8, repeat: -1 },
  { state: 'sad', label: 'Sad', slotIndex: 9, frameRate: 5, repeat: -1 },
  { state: 'angry', label: 'Angry', slotIndex: 10, frameRate: 10, repeat: -1 },
  { state: 'tired', label: 'Tired', slotIndex: 11, frameRate: 4, repeat: -1 },
  { state: 'taking_order', label: 'Taking Order', slotIndex: 12, frameRate: 10, repeat: -1 },
  { state: 'carrying_tray', label: 'Carrying Tray', slotIndex: 13, frameRate: 9, repeat: -1 },
  { state: 'serving_food', label: 'Serving Food', slotIndex: 14, frameRate: 8, repeat: -1 },
  { state: 'cleaning_table', label: 'Cleaning Table', slotIndex: 15, frameRate: 12, repeat: -1 },
  { state: 'collecting_payment', label: 'Collecting Payment', slotIndex: 16, frameRate: 9, repeat: -1 },
];

export function getAnimKey(role: PlayerRole, state: CharacterAnimState): string {
  return `${role}_${state}`;
}

export function getSheetKey(role: PlayerRole): string {
  return role === 'chef' ? CHEF_SHEET_KEY : WAITER_SHEET_KEY;
}

export function getSpecsForRole(role: PlayerRole): AnimSpec[] {
  return role === 'chef' ? CHEF_ANIM_SPECS : WAITER_ANIM_SPECS;
}

export function isValidAnimForRole(role: PlayerRole, state: CharacterAnimState): boolean {
  return getSpecsForRole(role).some((spec) => spec.state === state);
}

export function registerCharacterAnimations(scene: Phaser.Scene): void {
  const registerFor = (role: PlayerRole, sheetKey: string, specs: AnimSpec[]) => {
    for (const spec of specs) {
      const key = getAnimKey(role, spec.state);
      if (scene.anims.exists(key)) continue;

      const start = spec.slotIndex * FRAMES_PER_ANIM;
      const end = start + FRAMES_PER_ANIM - 1;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(sheetKey, { start, end }),
        frameRate: spec.frameRate,
        repeat: spec.repeat,
        yoyo: Boolean(spec.yoyo),
      });
    }
  };

  registerFor('chef', CHEF_SHEET_KEY, CHEF_ANIM_SPECS);
  registerFor('waiter', WAITER_SHEET_KEY, WAITER_ANIM_SPECS);
}
