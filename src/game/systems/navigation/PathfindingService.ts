import type { GridCoord } from '../../../shared/layout.ts';
import type { PlayerRole } from '../../../shared/types.ts';
import { MOVEMENT_CONFIG } from '../../config/movementConfig.ts';
import { NavigationGrid } from './NavigationGrid.ts';

interface AStarNode {
  col: number;
  row: number;
  g: number;
  f: number;
  parent: AStarNode | null;
}

export interface PathResult {
  reachable: boolean;
  path: GridCoord[];
  resolvedGoal: GridCoord | null;
  usedFallbackGoal: boolean;
}

const DIRECTIONS: ReadonlyArray<{ dc: number; dr: number; cost: number; diag: boolean }> = [
  { dc: 1, dr: 0, cost: 1, diag: false },
  { dc: -1, dr: 0, cost: 1, diag: false },
  { dc: 0, dr: 1, cost: 1, diag: false },
  { dc: 0, dr: -1, cost: 1, diag: false },
  { dc: 1, dr: 1, cost: Math.SQRT2, diag: true },
  { dc: 1, dr: -1, cost: Math.SQRT2, diag: true },
  { dc: -1, dr: 1, cost: Math.SQRT2, diag: true },
  { dc: -1, dr: -1, cost: Math.SQRT2, diag: true },
];

/**
 * A* Pathfinding Service operating on NavigationGrid with:
 * - 8-directional navigation & strict corner-cutting prevention
 * - Safe obstacle-aware line-of-sight path smoothing (never clips corners or blocked tiles)
 * - Unreachable destination detection + optional nearest-reachable fallback
 * - Dynamic path validity check for runtime obstacle updates
 */
export class PathfindingService {
  private grid: NavigationGrid;

  constructor(grid: NavigationGrid) {
    this.grid = grid;
  }

  public getGrid(): NavigationGrid {
    return this.grid;
  }

  /**
   * Computes a validated, smoothed A* path from start to goal.
   * When allowNearestFallback is true and the tapped tile is blocked (e.g. a wall or table),
   * searches for the closest reachable tile to the tap point.
   */
  public findPath(
    role: PlayerRole | 'any',
    start: GridCoord,
    goal: GridCoord,
    allowNearestFallback = true
  ): PathResult {
    const startTile = this.grid.findNearestWalkableTile(role, start.col, start.row);
    if (!startTile) {
      return { reachable: false, path: [], resolvedGoal: null, usedFallbackGoal: false };
    }

    const goalC = Math.round(goal.col);
    const goalR = Math.round(goal.row);

    // Direct attempt when requested goal tile is walkable
    if (this.grid.isWalkable(goalC, goalR, role)) {
      const direct = this.runAStar(role, startTile, { col: goalC, row: goalR });
      if (direct !== null) {
        return {
          reachable: true,
          path: this.smoothPath(role, startTile, direct),
          resolvedGoal: { col: goalC, row: goalR },
          usedFallbackGoal: false,
        };
      }
      if (!allowNearestFallback) {
        return { reachable: false, path: [], resolvedGoal: null, usedFallbackGoal: false };
      }
    } else if (!allowNearestFallback) {
      return { reachable: false, path: [], resolvedGoal: null, usedFallbackGoal: false };
    }

    // Fallback: BFS flood-fill from start to find the truly REACHABLE tile closest to goal
    const fallback = this.findClosestReachableTile(role, startTile, goal);
    if (!fallback) {
      return { reachable: false, path: [], resolvedGoal: null, usedFallbackGoal: true };
    }

    const fallbackPath = this.runAStar(role, startTile, fallback);
    if (!fallbackPath) {
      return { reachable: false, path: [], resolvedGoal: null, usedFallbackGoal: true };
    }

    return {
      reachable: true,
      path: this.smoothPath(role, startTile, fallbackPath),
      resolvedGoal: fallback,
      usedFallbackGoal: true,
    };
  }

  /**
   * Finds the shortest path to any reachable approach tile next to an interactable object.
   */
  public findPathToApproach(
    role: PlayerRole | 'any',
    start: GridCoord,
    target: GridCoord,
    approachRadius = 1
  ): PathResult {
    const startTile = this.grid.findNearestWalkableTile(role, start.col, start.row);
    if (!startTile) {
      return { reachable: false, path: [], resolvedGoal: null, usedFallbackGoal: false };
    }

    const candidates = this.grid.getApproachCandidates(role, target.col, target.row, approachRadius);
    if (candidates.length === 0) {
      return { reachable: false, path: [], resolvedGoal: null, usedFallbackGoal: false };
    }

    // Sort candidates by proximity to start for fast best-path selection
    candidates.sort(
      (a, b) =>
        Math.hypot(a.col - start.col, a.row - start.row) -
        Math.hypot(b.col - start.col, b.row - start.row)
    );

    let bestPath: GridCoord[] | null = null;
    let bestGoal: GridCoord | null = null;
    let bestCost = Infinity;

    for (const candidate of candidates) {
      const raw = this.runAStar(role, startTile, candidate);
      if (!raw) continue;
      const len = this.computePathLength(startTile, raw);
      if (len < bestCost) {
        bestCost = len;
        bestPath = raw;
        bestGoal = candidate;
      }
    }

    if (!bestPath || !bestGoal) {
      return { reachable: false, path: [], resolvedGoal: null, usedFallbackGoal: false };
    }

    return {
      reachable: true,
      path: this.smoothPath(role, startTile, bestPath),
      resolvedGoal: bestGoal,
      usedFallbackGoal: false,
    };
  }

  /**
   * Checks whether every segment of an existing path remains completely clear of obstacles.
   */
  public isPathClear(role: PlayerRole | 'any', currentPos: GridCoord, path: GridCoord[]): boolean {
    if (path.length === 0) return true;
    let prev = currentPos;
    for (const wp of path) {
      if (!this.grid.isWalkable(wp.col, wp.row, role)) return false;
      if (!this.hasClearLineOfSight(role, prev, wp)) return false;
      prev = wp;
    }
    return true;
  }

  private runAStar(
    role: PlayerRole | 'any',
    start: GridCoord,
    goal: GridCoord
  ): GridCoord[] | null {
    if (start.col === goal.col && start.row === goal.row) {
      return [{ col: goal.col, row: goal.row }];
    }

    const keyOf = (c: number, r: number) => `${c},${r}`;
    const heuristic = (c: number, r: number) => {
      const dx = Math.abs(c - goal.col);
      const dy = Math.abs(r - goal.row);
      return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };

    const open: AStarNode[] = [
      {
        col: start.col,
        row: start.row,
        g: 0,
        f: heuristic(start.col, start.row),
        parent: null,
      },
    ];
    const bestG = new Map<string, number>([[keyOf(start.col, start.row), 0]]);
    const closed = new Set<string>();

    while (open.length > 0) {
      let lowestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[lowestIdx].f) lowestIdx = i;
      }
      const current = open.splice(lowestIdx, 1)[0];
      const cKey = keyOf(current.col, current.row);
      if (closed.has(cKey)) continue;
      closed.add(cKey);

      if (current.col === goal.col && current.row === goal.row) {
        const reversed: GridCoord[] = [];
        let node: AStarNode | null = current;
        while (node && !(node.col === start.col && node.row === start.row)) {
          reversed.push({ col: node.col, row: node.row });
          node = node.parent;
        }
        reversed.reverse();
        return reversed;
      }

      for (const dir of DIRECTIONS) {
        const nc = current.col + dir.dc;
        const nr = current.row + dir.dr;
        if (!this.grid.isWalkable(nc, nr, role)) continue;

        // Strictly forbid diagonal corner-cutting across furniture or walls
        if (dir.diag) {
          if (
            !this.grid.isWalkable(current.col + dir.dc, current.row, role) ||
            !this.grid.isWalkable(current.col, current.row + dir.dr, role)
          ) {
            continue;
          }
        }

        const nKey = keyOf(nc, nr);
        if (closed.has(nKey)) continue;

        const tentativeG = current.g + dir.cost;
        const prevG = bestG.get(nKey);
        if (prevG === undefined || tentativeG < prevG) {
          bestG.set(nKey, tentativeG);
          open.push({
            col: nc,
            row: nr,
            g: tentativeG,
            f: tentativeG + heuristic(nc, nr),
            parent: current,
          });
        }
      }
    }

    return null;
  }

  /**
   * Safe string-pulling path smoother: removes unnecessary zigzag nodes ONLY when
   * every sampled clearance footprint along the shortcut stays inside walkable tiles.
   */
  private smoothPath(
    role: PlayerRole | 'any',
    start: GridCoord,
    rawPath: GridCoord[]
  ): GridCoord[] {
    if (rawPath.length <= 1) return rawPath;

    const smoothed: GridCoord[] = [];
    let anchor = start;
    let idx = 0;

    while (idx < rawPath.length) {
      let farthest = idx;
      for (let probe = rawPath.length - 1; probe > idx; probe--) {
        if (this.hasClearLineOfSight(role, anchor, rawPath[probe])) {
          farthest = probe;
          break;
        }
      }
      smoothed.push(rawPath[farthest]);
      anchor = rawPath[farthest];
      idx = farthest + 1;
    }

    return smoothed;
  }

  /**
   * Samples points + character feet clearance box along segment A→B so smoothing
   * NEVER cuts across a blocked tile or furniture corner.
   */
  public hasClearLineOfSight(
    role: PlayerRole | 'any',
    from: GridCoord,
    to: GridCoord
  ): boolean {
    const dist = Math.hypot(to.col - from.col, to.row - from.row);
    const steps = Math.max(4, Math.ceil(dist * 6));
    const pad = MOVEMENT_CONFIG.avatarFeetRadius;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const sc = from.col + (to.col - from.col) * t;
      const sr = from.row + (to.row - from.row) * t;
      if (
        !this.grid.isWalkable(Math.round(sc), Math.round(sr), role) ||
        !this.grid.isWalkable(Math.round(sc - pad), Math.round(sr - pad), role) ||
        !this.grid.isWalkable(Math.round(sc + pad), Math.round(sr - pad), role) ||
        !this.grid.isWalkable(Math.round(sc - pad), Math.round(sr + pad), role) ||
        !this.grid.isWalkable(Math.round(sc + pad), Math.round(sr + pad), role)
      ) {
        return false;
      }
    }
    return true;
  }

  private findClosestReachableTile(
    role: PlayerRole | 'any',
    start: GridCoord,
    desiredGoal: GridCoord
  ): GridCoord | null {
    const visited = new Set<string>([`${start.col},${start.row}`]);
    const queue: GridCoord[] = [start];
    let best: GridCoord | null = null;
    let bestDist = Infinity;

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const d = Math.hypot(curr.col - desiredGoal.col, curr.row - desiredGoal.row);
      if (d < bestDist) {
        bestDist = d;
        best = curr;
      }

      for (const dir of DIRECTIONS) {
        if (dir.diag) continue; // 4-way flood-fill guarantees reachability
        const nc = curr.col + dir.dc;
        const nr = curr.row + dir.dr;
        const k = `${nc},${nr}`;
        if (visited.has(k)) continue;
        if (!this.grid.isWalkable(nc, nr, role)) continue;
        visited.add(k);
        queue.push({ col: nc, row: nr });
      }
    }

    return best;
  }

  private computePathLength(start: GridCoord, path: GridCoord[]): number {
    let total = 0;
    let prev = start;
    for (const wp of path) {
      total += Math.hypot(wp.col - prev.col, wp.row - prev.row);
      prev = wp;
    }
    return total;
  }
}
