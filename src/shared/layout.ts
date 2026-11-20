import type { ApplianceType, DishId, PlayerRole } from './types.ts';

/**
 * LOVE KITCHEN — Burger Cafe 2.5D Isometric Map Layout (14 x 9 Grid)
 * Kitchen Zone: cols 0..4 | Food Pickup Counter Divider: col 5 | Dining Area: cols 6..13
 */
export const GRID_COLS = 14;
export const GRID_ROWS = 9;
export const DIVIDER_COL = 5;

export interface GridCoord {
  col: number;
  row: number;
}

export interface PantryDef extends GridCoord {
  id: string;
  dishId: DishId;
  label: string;
}

export interface StationDef extends GridCoord {
  id: string;
  appliance: ApplianceType;
  label: string;
}

export interface PassDef extends GridCoord {
  id: string;
}

export interface TableDef extends GridCoord {
  id: string;
  label: string;
}

export interface NamedPropDef extends GridCoord {
  id: string;
  label: string;
}

// --- KITCHEN OBJECTS ---
export const PANTRIES: PantryDef[] = [
  { id: 'pantry_burger', dishId: 'heart_burger', col: 0, row: 1, label: 'Burger' },
  { id: 'pantry_pasta', dishId: 'love_pasta', col: 0, row: 3, label: 'Pasta' },
  { id: 'pantry_cake', dishId: 'berry_cake', col: 0, row: 5, label: 'Cake' },
  { id: 'pantry_ramen', dishId: 'golden_ramen', col: 0, row: 7, label: 'Ramen' },
];

// 3 Dedicated Cooking Stations
export const COOKING_STATIONS: StationDef[] = [
  { id: 'stove_1', appliance: 'grill', col: 2, row: 1, label: 'Grill' },
  { id: 'stove_2', appliance: 'pot', col: 2, row: 3, label: 'Pot' },
  { id: 'oven_1', appliance: 'oven', col: 2, row: 5, label: 'Oven' },
];

// Preparation Table (Chopping & Seasoning Counter)
export const PREP_TABLE_POS: NamedPropDef = {
  id: 'prep_table',
  col: 2,
  row: 7,
  label: 'Prep Table',
};

// Food Pickup Counter Slots along Divider Wall (col 5)
export const SERVING_PASS_SLOTS: PassDef[] = [
  { id: 'pass_1', col: 5, row: 1 },
  { id: 'pass_2', col: 5, row: 2 },
  { id: 'pass_3', col: 5, row: 4 },
  { id: 'pass_4', col: 5, row: 5 },
];

// Solid non-slot divider segments along col 5 (counters, menu arch, corner divider)
export const DIVIDER_DECOR_ROWS = [0, 3, 6, 7, 8];

export const TRASH_BIN_POS: NamedPropDef = {
  id: 'trash_bin',
  col: 4,
  row: 7,
  label: 'Trash',
};

// --- DINING AREA OBJECTS ---
// 6 Customer Tables arranged with generous 2-tile walkways for A* pathfinding
export const DINING_TABLES: TableDef[] = [
  { id: 'table_1', label: 'T1', col: 7, row: 2 },
  { id: 'table_2', label: 'T2', col: 9, row: 2 },
  { id: 'table_3', label: 'T3', col: 11, row: 2 },
  { id: 'table_4', label: 'T4', col: 7, row: 5 },
  { id: 'table_5', label: 'T5', col: 9, row: 5 },
  { id: 'table_6', label: 'T6', col: 11, row: 5 },
];

// Cashier & Cleaning Station in Dining Service Zone
export const REGISTER_POS: NamedPropDef = {
  id: 'cashier',
  col: 6,
  row: 7,
  label: 'Cashier',
};

export const CLEANING_STATION_POS: NamedPropDef = {
  id: 'cleaning_station',
  col: 8,
  row: 7,
  label: 'Clean Stn',
};

// Entrance & Waiting Queue Area
export const ENTRANCE_DOOR_POS: GridCoord = { col: 13, row: 2 };
export const WAIT_MAT_POS: NamedPropDef = {
  id: 'wait_mat',
  col: 13,
  row: 3,
  label: 'Entrance',
};
export const QUEUE_SLOTS: GridCoord[] = [
  { col: 13, row: 3 },
  { col: 13, row: 4 },
  { col: 13, row: 5 },
  { col: 13, row: 6 },
];

// Decorative solid cafe props (potted plants, stanchion) included in collision grid
export const DECOR_PLANTS: GridCoord[] = [
  { col: 4, row: 0 },
  { col: 6, row: 0 },
  { col: 12, row: 0 },
  { col: 10, row: 7 },
];

export const CHEF_SPAWN: GridCoord = { col: 3, row: 3 };
export const WAITER_SPAWN: GridCoord = { col: 8, row: 3 };

// Precomputed solid obstacle tile lookup for fast O(1) collision & pathfinding
const SOLID_TILES = new Set<string>([
  ...PANTRIES.map((p) => `${p.col},${p.row}`),
  ...COOKING_STATIONS.map((s) => `${s.col},${s.row}`),
  `${PREP_TABLE_POS.col},${PREP_TABLE_POS.row}`,
  `${TRASH_BIN_POS.col},${TRASH_BIN_POS.row}`,
  ...DINING_TABLES.map((t) => `${t.col},${t.row}`),
  `${REGISTER_POS.col},${REGISTER_POS.row}`,
  `${CLEANING_STATION_POS.col},${CLEANING_STATION_POS.row}`,
  ...DECOR_PLANTS.map((d) => `${d.col},${d.row}`),
  ...Array.from({ length: GRID_ROWS }, (_, r) => `${DIVIDER_COL},${r}`),
]);

export function isTileSolid(col: number, row: number): boolean {
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return true;
  return SOLID_TILES.has(`${col},${row}`);
}

export function isWalkableForRole(role: PlayerRole, col: number, row: number): boolean {
  const c = Math.round(col);
  const r = Math.round(row);
  if (c < 0 || c >= GRID_COLS || r < 0 || r >= GRID_ROWS) return false;
  if (role === 'chef') {
    if (c < 0 || c >= DIVIDER_COL) return false;
  } else {
    if (c <= DIVIDER_COL || c >= GRID_COLS) return false;
  }
  return !SOLID_TILES.has(`${c},${r}`);
}

/**
 * Returns the nearest walkable approach tile adjacent to a target interactive object.
 */
export function getInteractionSpot(
  role: PlayerRole,
  targetCol: number,
  targetRow: number,
  fromCol?: number,
  fromRow?: number
): GridCoord {
  const tCol = Math.round(targetCol);
  const tRow = Math.round(targetRow);

  // If the target itself is walkable (e.g., Entrance Wait Mat), prefer adjacent tile on role's side or tile itself
  const candidates: GridCoord[] = [
    { col: tCol + 1, row: tRow },
    { col: tCol - 1, row: tRow },
    { col: tCol, row: tRow + 1 },
    { col: tCol, row: tRow - 1 },
  ];
  if (isWalkableForRole(role, tCol, tRow)) {
    candidates.unshift({ col: tCol, row: tRow });
  }

  const valid = candidates.filter((c) => isWalkableForRole(role, c.col, c.row));
  if (valid.length > 0) {
    if (fromCol !== undefined && fromRow !== undefined) {
      valid.sort(
        (a, b) =>
          Math.hypot(a.col - fromCol, a.row - fromRow) -
          Math.hypot(b.col - fromCol, b.row - fromRow)
      );
    }
    return valid[0];
  }

  // Fallback diagonal neighbors
  const diag = [
    { col: tCol + 1, row: tRow + 1 },
    { col: tCol - 1, row: tRow + 1 },
    { col: tCol + 1, row: tRow - 1 },
    { col: tCol - 1, row: tRow - 1 },
  ].filter((c) => isWalkableForRole(role, c.col, c.row));

  if (diag.length > 0) return diag[0];
  return role === 'chef' ? { ...CHEF_SPAWN } : { ...WAITER_SPAWN };
}
