import {
  DIVIDER_COL,
  GRID_COLS,
  GRID_ROWS,
  isTileSolid,
  type GridCoord,
} from '../../../shared/layout.ts';
import type { PlayerRole } from '../../../shared/types.ts';

export interface DynamicObstacle {
  id: string;
  col: number;
  row: number;
  width: number;
  height: number;
  label?: string;
}

/**
 * Stateful 2D Navigation Grid mapped directly onto the 14x9 Burger Cafe isometric layout.
 * Combines static restaurant furniture/walls with runtime dynamic obstacles (e.g., future
 * customers or temporary spills) and tracks a monotonically increasing version number so
 * active MovementControllers know exactly when to recalculate paths.
 */
export class NavigationGrid {
  public readonly cols: number;
  public readonly rows: number;
  public readonly dividerCol: number;

  private staticBlocked: Set<string>;
  private dynamicObstacles = new Map<string, DynamicObstacle>();
  private dynamicBlocked = new Set<string>();
  private gridVersion = 1;

  constructor(
    cols = GRID_COLS,
    rows = GRID_ROWS,
    dividerCol = DIVIDER_COL,
    customStaticBlocked?: GridCoord[]
  ) {
    this.cols = cols;
    this.rows = rows;
    this.dividerCol = dividerCol;
    this.staticBlocked = new Set<string>();

    if (customStaticBlocked) {
      for (const tile of customStaticBlocked) {
        this.staticBlocked.add(this.tileKey(tile.col, tile.row));
      }
    } else {
      for (let c = 0; c < this.cols; c++) {
        for (let r = 0; r < this.rows; r++) {
          if (isTileSolid(c, r)) {
            this.staticBlocked.add(this.tileKey(c, r));
          }
        }
      }
    }
  }

  public getVersion(): number {
    return this.gridVersion;
  }

  public isInBounds(col: number, row: number): boolean {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  public isRoleZoneAllowed(role: PlayerRole | 'any', col: number): boolean {
    if (role === 'any') return col >= 0 && col < this.cols;
    if (role === 'chef') return col >= 0 && col < this.dividerCol;
    return col > this.dividerCol && col < this.cols;
  }

  public isStaticBlocked(col: number, row: number): boolean {
    const c = Math.round(col);
    const r = Math.round(row);
    if (!this.isInBounds(c, r)) return true;
    return this.staticBlocked.has(this.tileKey(c, r));
  }

  public isDynamicBlocked(col: number, row: number): boolean {
    const c = Math.round(col);
    const r = Math.round(row);
    return this.dynamicBlocked.has(this.tileKey(c, r));
  }

  public isBlocked(col: number, row: number): boolean {
    const c = Math.round(col);
    const r = Math.round(row);
    if (!this.isInBounds(c, r)) return true;
    const key = this.tileKey(c, r);
    return this.staticBlocked.has(key) || this.dynamicBlocked.has(key);
  }

  public isWalkable(col: number, row: number, role: PlayerRole | 'any' = 'any'): boolean {
    const c = Math.round(col);
    const r = Math.round(row);
    if (!this.isInBounds(c, r)) return false;
    if (!this.isRoleZoneAllowed(role, c)) return false;
    return !this.isBlocked(c, r);
  }

  public addDynamicObstacle(obstacle: DynamicObstacle): void {
    this.dynamicObstacles.set(obstacle.id, { ...obstacle });
    this.rebuildDynamicSet();
  }

  public removeDynamicObstacle(id: string): boolean {
    const deleted = this.dynamicObstacles.delete(id);
    if (deleted) {
      this.rebuildDynamicSet();
    }
    return deleted;
  }

  public getDynamicObstacles(): DynamicObstacle[] {
    return Array.from(this.dynamicObstacles.values());
  }

  public clearDynamicObstacles(): void {
    if (this.dynamicObstacles.size === 0) return;
    this.dynamicObstacles.clear();
    this.rebuildDynamicSet();
  }

  /**
   * Finds the nearest walkable tile to (targetCol, targetRow) within the role's zone.
   */
  public findNearestWalkableTile(
    role: PlayerRole | 'any',
    targetCol: number,
    targetRow: number
  ): GridCoord | null {
    const roundedC = Math.max(0, Math.min(this.cols - 1, Math.round(targetCol)));
    const roundedR = Math.max(0, Math.min(this.rows - 1, Math.round(targetRow)));
    if (this.isWalkable(roundedC, roundedR, role)) {
      return { col: roundedC, row: roundedR };
    }

    let best: GridCoord | null = null;
    let bestDist = Infinity;
    for (let c = 0; c < this.cols; c++) {
      if (!this.isRoleZoneAllowed(role, c)) continue;
      for (let r = 0; r < this.rows; r++) {
        if (this.isBlocked(c, r)) continue;
        const d = Math.hypot(c - targetCol, r - targetRow);
        if (d < bestDist) {
          bestDist = d;
          best = { col: c, row: r };
        }
      }
    }
    return best;
  }

  /**
   * Lists candidate approach tiles around a target object (supports multi-tile footprints).
   */
  public getApproachCandidates(
    role: PlayerRole | 'any',
    targetCol: number,
    targetRow: number,
    radiusTiles = 1
  ): GridCoord[] {
    const tCol = Math.round(targetCol);
    const tRow = Math.round(targetRow);
    const results: GridCoord[] = [];
    const seen = new Set<string>();

    const tryAdd = (c: number, r: number) => {
      const k = this.tileKey(c, r);
      if (seen.has(k)) return;
      seen.add(k);
      if (this.isWalkable(c, r, role)) {
        results.push({ col: c, row: r });
      }
    };

    // Prefer target tile itself if walkable (e.g., Entrance Wait Mat)
    tryAdd(tCol, tRow);

    // Cardinal neighbors first, then diagonals up to radiusTiles
    for (let rad = 1; rad <= Math.max(1, Math.ceil(radiusTiles)); rad++) {
      tryAdd(tCol + rad, tRow);
      tryAdd(tCol - rad, tRow);
      tryAdd(tCol, tRow + rad);
      tryAdd(tCol, tRow - rad);
      tryAdd(tCol + rad, tRow + rad);
      tryAdd(tCol - rad, tRow + rad);
      tryAdd(tCol + rad, tRow - rad);
      tryAdd(tCol - rad, tRow - rad);
    }

    return results;
  }

  private rebuildDynamicSet(): void {
    this.dynamicBlocked.clear();
    for (const obs of this.dynamicObstacles.values()) {
      const startC = Math.round(obs.col);
      const startR = Math.round(obs.row);
      const w = Math.max(1, Math.round(obs.width));
      const h = Math.max(1, Math.round(obs.height));
      for (let dc = 0; dc < w; dc++) {
        for (let dr = 0; dr < h; dr++) {
          const c = startC + dc;
          const r = startR + dr;
          if (this.isInBounds(c, r)) {
            this.dynamicBlocked.add(this.tileKey(c, r));
          }
        }
      }
    }
    this.gridVersion += 1;
  }

  private tileKey(col: number, row: number): string {
    return `${col},${row}`;
  }
}
