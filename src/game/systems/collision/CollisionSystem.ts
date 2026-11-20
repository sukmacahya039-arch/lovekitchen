import type { GridCoord } from '../../../shared/layout.ts';
import type { PlayerRole } from '../../../shared/types.ts';
import { MOVEMENT_CONFIG } from '../../config/movementConfig.ts';
import { NavigationGrid } from '../navigation/NavigationGrid.ts';

export interface CollisionResolution {
  position: GridCoord;
  blockedX: boolean;
  blockedY: boolean;
  wasBlocked: boolean;
}

/**
 * Ground/feet collision system backed by NavigationGrid.
 * Uses a compact feet bounding radius so characters' upper bodies, hats, and hair
 * visually overlap tables/counters naturally while their feet never penetrate solid objects.
 */
export class CollisionSystem {
  private grid: NavigationGrid;
  private feetRadius: number;

  constructor(grid: NavigationGrid, feetRadius = MOVEMENT_CONFIG.avatarFeetRadius) {
    this.grid = grid;
    this.feetRadius = feetRadius;
  }

  public getFeetRadius(): number {
    return this.feetRadius;
  }

  public canOccupy(role: PlayerRole | 'any', col: number, row: number): boolean {
    const minCol =
      role === 'chef'
        ? -0.45 + this.feetRadius
        : role === 'waiter'
          ? this.grid.dividerCol + 0.52 + this.feetRadius
          : -0.45 + this.feetRadius;
    const maxCol =
      role === 'chef'
        ? this.grid.dividerCol - 0.52 - this.feetRadius
        : this.grid.cols - 0.55 - this.feetRadius;
    const minRow = -0.45 + this.feetRadius;
    const maxRow = this.grid.rows - 0.55 - this.feetRadius;

    if (col < minCol || col > maxCol || row < minRow || row > maxRow) {
      return false;
    }

    const r = this.feetRadius;
    const samplePoints: Array<[number, number]> = [
      [col, row],
      [col - r, row - r],
      [col + r, row - r],
      [col - r, row + r],
      [col + r, row + r],
    ];

    for (const [sc, sr] of samplePoints) {
      const tc = Math.round(sc);
      const tr = Math.round(sr);
      if (!this.grid.isWalkable(tc, tr, role)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Resolves continuous character movement against walls, tables, counters, and dynamic obstacles
   * using smooth axis sliding + stuck recovery to eliminate corner jitter.
   */
  public resolveMovement(
    role: PlayerRole | 'any',
    from: GridCoord,
    proposed: GridCoord
  ): CollisionResolution {
    if (this.canOccupy(role, proposed.col, proposed.row)) {
      return {
        position: { col: proposed.col, row: proposed.row },
        blockedX: false,
        blockedY: false,
        wasBlocked: false,
      };
    }

    // Attempt independent axis sliding so characters glide smoothly along tables & counters
    const canSlideCol = this.canOccupy(role, proposed.col, from.row);
    const canSlideRow = this.canOccupy(role, from.col, proposed.row);

    if (canSlideCol && !canSlideRow) {
      return {
        position: { col: proposed.col, row: from.row },
        blockedX: false,
        blockedY: true,
        wasBlocked: true,
      };
    }

    if (canSlideRow && !canSlideCol) {
      return {
        position: { col: from.col, row: proposed.row },
        blockedX: true,
        blockedY: false,
        wasBlocked: true,
      };
    }

    if (canSlideCol && canSlideRow) {
      // Pick axis with greater intended travel to avoid corner oscillation
      const dc = Math.abs(proposed.col - from.col);
      const dr = Math.abs(proposed.row - from.row);
      if (dc >= dr) {
        return {
          position: { col: proposed.col, row: from.row },
          blockedX: false,
          blockedY: true,
          wasBlocked: true,
        };
      }
      return {
        position: { col: from.col, row: proposed.row },
        blockedX: true,
        blockedY: false,
        wasBlocked: true,
      };
    }

    // Recovery if character somehow spawned or got pushed into a newly placed dynamic obstacle
    if (!this.canOccupy(role, from.col, from.row)) {
      const safe = this.grid.findNearestWalkableTile(role, from.col, from.row);
      if (safe) {
        const dc = safe.col - from.col;
        const dr = safe.row - from.row;
        const dist = Math.hypot(dc, dr);
        if (dist > 0.005) {
          const nudge = Math.min(dist, 0.14);
          return {
            position: {
              col: from.col + (dc / dist) * nudge,
              row: from.row + (dr / dist) * nudge,
            },
            blockedX: true,
            blockedY: true,
            wasBlocked: true,
          };
        }
      }
    }

    return {
      position: { col: from.col, row: from.row },
      blockedX: true,
      blockedY: true,
      wasBlocked: true,
    };
  }
}
