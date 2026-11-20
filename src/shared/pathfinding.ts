import {
  DIVIDER_COL,
  GRID_COLS,
  GRID_ROWS,
  isWalkableForRole,
  type GridCoord,
} from './layout.ts';
import type { PlayerRole } from './types.ts';

const AVATAR_HALF_EXTENT = 0.34;

/**
 * Continuous axis-aligned collision test against solid furniture & zone boundaries.
 * Ensures characters never clip through tables, cooking stations, counters, or walls.
 */
export function canStandAt(role: PlayerRole, col: number, row: number): boolean {
  const minCol = role === 'chef' ? 0.36 : DIVIDER_COL + 0.64;
  const maxCol = role === 'chef' ? DIVIDER_COL - 0.64 : GRID_COLS - 0.52;
  const minRow = 0.36;
  const maxRow = GRID_ROWS - 0.52;

  if (col < minCol || col > maxCol || row < minRow || row > maxRow) {
    return false;
  }

  const samples: Array<[number, number]> = [
    [col, row],
    [col - AVATAR_HALF_EXTENT, row - AVATAR_HALF_EXTENT],
    [col + AVATAR_HALF_EXTENT, row - AVATAR_HALF_EXTENT],
    [col - AVATAR_HALF_EXTENT, row + AVATAR_HALF_EXTENT],
    [col + AVATAR_HALF_EXTENT, row + AVATAR_HALF_EXTENT],
  ];

  for (const [sc, sr] of samples) {
    const tc = Math.round(sc);
    const tr = Math.round(sr);
    if (!isWalkableForRole(role, tc, tr)) {
      return false;
    }
  }
  return true;
}

/**
 * Smooth axis-sliding collision resolver for joystick/keyboard continuous movement.
 */
export function resolveSlideMovement(
  role: PlayerRole,
  fromCol: number,
  fromRow: number,
  nextCol: number,
  nextRow: number
): GridCoord {
  if (canStandAt(role, nextCol, nextRow)) {
    return { col: nextCol, row: nextRow };
  }
  // Try horizontal (col) slide
  if (canStandAt(role, nextCol, fromRow)) {
    return { col: nextCol, row: fromRow };
  }
  // Try vertical (row) slide
  if (canStandAt(role, fromCol, nextRow)) {
    return { col: fromCol, row: nextRow };
  }
  // If somehow already slightly overlapping (e.g. spawn edge), nudge toward nearest valid tile center
  const nearest = findNearestWalkableTile(role, nextCol, nextRow);
  const dc = nearest.col - fromCol;
  const dr = nearest.row - fromRow;
  const dist = Math.hypot(dc, dr);
  if (dist > 0.01) {
    const step = Math.min(dist, 0.08);
    return { col: fromCol + (dc / dist) * step, row: fromRow + (dr / dist) * step };
  }
  return { col: fromCol, row: fromRow };
}

/**
 * Finds the nearest walkable integer tile in the character's zone.
 */
export function findNearestWalkableTile(
  role: PlayerRole,
  targetCol: number,
  targetRow: number
): GridCoord {
  const startC = Math.max(0, Math.min(GRID_COLS - 1, Math.round(targetCol)));
  const startR = Math.max(0, Math.min(GRID_ROWS - 1, Math.round(targetRow)));
  if (isWalkableForRole(role, startC, startR)) {
    return { col: startC, row: startR };
  }

  let best: GridCoord | null = null;
  let bestDist = Infinity;
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      if (!isWalkableForRole(role, c, r)) continue;
      const d = Math.hypot(c - targetCol, r - targetRow);
      if (d < bestDist) {
        bestDist = d;
        best = { col: c, row: r };
      }
    }
  }
  return best ?? { col: role === 'chef' ? 3 : 8, row: 3 };
}

interface AStarNode {
  col: number;
  row: number;
  g: number;
  f: number;
  parent: AStarNode | null;
}

const DIRECTIONS: Array<{ dc: number; dr: number; cost: number; diag: boolean }> = [
  { dc: 1, dr: 0, cost: 1, diag: false },
  { dc: -1, dr: 0, cost: 1, diag: false },
  { dc: 0, dr: 1, cost: 1, diag: false },
  { dc: 0, dr: -1, cost: 1, diag: false },
  { dc: 1, dr: 1, cost: 1.414, diag: true },
  { dc: 1, dr: -1, cost: 1.414, diag: true },
  { dc: -1, dr: 1, cost: 1.414, diag: true },
  { dc: -1, dr: -1, cost: 1.414, diag: true },
];

/**
 * 8-directional A* pathfinding on the Burger Cafe grid with strict corner-cutting prevention.
 * Returns an ordered array of walkable grid waypoints excluding the start tile.
 */
export function findGridPath(
  role: PlayerRole,
  startCol: number,
  startRow: number,
  rawGoalCol: number,
  rawGoalRow: number
): GridCoord[] {
  const start = findNearestWalkableTile(role, startCol, startRow);
  const goal = findNearestWalkableTile(role, rawGoalCol, rawGoalRow);

  if (start.col === goal.col && start.row === goal.row) {
    return [{ col: goal.col, row: goal.row }];
  }

  const keyOf = (c: number, r: number) => `${c},${r}`;
  const heuristic = (c: number, r: number) => {
    const dx = Math.abs(c - goal.col);
    const dy = Math.abs(r - goal.row);
    // Octile distance heuristic
    return dx + dy + (1.414 - 2) * Math.min(dx, dy);
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
      return simplifyPath(reversed);
    }

    for (const dir of DIRECTIONS) {
      const nc = current.col + dir.dc;
      const nr = current.row + dir.dr;
      if (!isWalkableForRole(role, nc, nr)) continue;

      // Prevent corner cutting past tables, counters, and stoves
      if (dir.diag) {
        if (
          !isWalkableForRole(role, current.col + dir.dc, current.row) ||
          !isWalkableForRole(role, current.col, current.row + dir.dr)
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

  return [];
}

/**
 * Removes redundant collinear mid-points so character movement looks smooth and natural.
 */
function simplifyPath(points: GridCoord[]): GridCoord[] {
  if (points.length <= 2) return points;
  const result: GridCoord[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];
    const dx1 = Math.sign(curr.col - prev.col);
    const dy1 = Math.sign(curr.row - prev.row);
    const dx2 = Math.sign(next.col - curr.col);
    const dy2 = Math.sign(next.row - curr.row);
    if (dx1 !== dx2 || dy1 !== dy2) {
      result.push(curr);
    }
  }
  result.push(points[points.length - 1]);
  return result;
}
