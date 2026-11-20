import { ISO_TILE_W } from '../systems/restaurant/IsometricGrid.ts';

/**
 * Tunable movement, collision, pathfinding, and interaction configuration.
 * Values are expressed in grid-tile units (1 tile ≈ 74px horizontal / 38px vertical iso)
 * and derived world pixels so Chef & Waiter stay balanced across screen sizes.
 */
export interface MovementConfig {
  /** Base walking speed in grid tiles per second (~2.15 tiles/s ≈ 125 iso px/s) */
  walkSpeedTilesPerSec: number;
  /** Sprint speed when holding Shift or tapping distant destinations */
  runSpeedTilesPerSec: number;
  /** Equivalent reference speed in screen pixels per second */
  walkSpeedPxPerSec: number;
  /** Smooth acceleration ramp (tiles/s²) */
  acceleration: number;
  /** Smooth stopping deceleration (tiles/s²) */
  deceleration: number;
  /** Distance (tiles) at which character snaps cleanly to final destination */
  stoppingDistance: number;
  /** Distance (tiles) at which an intermediate A* waypoint is considered reached */
  waypointReachDistance: number;
  /** Remaining path length (tiles) above which tap-to-move smoothly sprints */
  longPathRunThreshold: number;
  /** Default interaction radius (tiles; ~1.45 tiles ≈ 50-55 iso px from object center) */
  defaultInteractionRadius: number;
  /** Character ground/feet collision half-extent (tiles) — keeps head/hat free of false collisions */
  avatarFeetRadius: number;
  /** Tap-to-move pointer debounce window (ms) to prevent duplicate touch + synthetic mouse fires */
  pointerDedupeMs: number;
  /** Minimum movement delta (tiles) considered active locomotion */
  minMoveEpsilon: number;
}

export const MOVEMENT_CONFIG: MovementConfig = {
  walkSpeedTilesPerSec: 3.85,
  runSpeedTilesPerSec: 5.35,
  walkSpeedPxPerSec: Math.round(3.85 * (ISO_TILE_W * 0.45)), // ~128 px/s visual speed
  acceleration: 26.0,
  deceleration: 30.0,
  stoppingDistance: 0.1,
  waypointReachDistance: 0.16,
  longPathRunThreshold: 2.8,
  defaultInteractionRadius: 1.55,
  avatarFeetRadius: 0.3,
  pointerDedupeMs: 45,
  minMoveEpsilon: 0.002,
};
