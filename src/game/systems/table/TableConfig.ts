import { DINING_TABLES, type GridCoord } from '../../../shared/layout.ts';
import type { FacingDirection } from '../../../shared/types.ts';

export type TableType = 'standard_2' | 'family_4';

export interface SeatConfig {
  seatIndex: number;
  /** Grid coordinate where customer anchors when seated (aligned neatly next to table) */
  seatCol: number;
  seatRow: number;
  /** Facing direction looking toward the table center */
  facing: FacingDirection;
  /** Fine-tuned isometric screen pixel offset so seated chibi aligns cleanly with table rim */
  visualOffsetX: number;
  visualOffsetY: number;
  /** Walkable approach tile adjacent to this seat */
  approachCol: number;
  approachRow: number;
}

export interface TableDefinition {
  id: string;
  label: string;
  col: number;
  row: number;
  tableType: TableType;
  capacity: number;
  enabled: boolean;
  interactionPosition: GridCoord;
  diningPosition: GridCoord;
  approachPositions: GridCoord[];
  seats: SeatConfig[];
}

export interface TableSystemConfig {
  reservationTimeoutMs: number;
  cleaningDurationMs: number;
  tables: TableDefinition[];
}

function buildSeatsForTable(col: number, row: number, capacity: number): SeatConfig[] {
  if (capacity <= 2) {
    // 2-seat tables (T1–T3): cozy left & right chairs facing the table
    return [
      {
        seatIndex: 0,
        seatCol: col - 0.44,
        seatRow: row + 0.08,
        facing: 'right',
        visualOffsetX: -24,
        visualOffsetY: -6,
        approachCol: col - 1,
        approachRow: row,
      },
      {
        seatIndex: 1,
        seatCol: col + 0.44,
        seatRow: row - 0.08,
        facing: 'left',
        visualOffsetX: 24,
        visualOffsetY: -8,
        approachCol: col + 1,
        approachRow: row,
      },
    ];
  }

  // 4-seat family tables (T4–T6): 4 evenly spaced chairs around the table
  return [
    {
      seatIndex: 0,
      seatCol: col - 0.46,
      seatRow: row - 0.08,
      facing: 'right',
      visualOffsetX: -25,
      visualOffsetY: -12,
      approachCol: col - 1,
      approachRow: row,
    },
    {
      seatIndex: 1,
      seatCol: col + 0.46,
      seatRow: row - 0.12,
      facing: 'left',
      visualOffsetX: 25,
      visualOffsetY: -12,
      approachCol: col + 1,
      approachRow: row,
    },
    {
      seatIndex: 2,
      seatCol: col - 0.24,
      seatRow: row + 0.46,
      facing: 'back',
      visualOffsetX: -14,
      visualOffsetY: 6,
      approachCol: col,
      approachRow: row + 1,
    },
    {
      seatIndex: 3,
      seatCol: col + 0.28,
      seatRow: row + 0.42,
      facing: 'back',
      visualOffsetX: 16,
      visualOffsetY: 6,
      approachCol: col,
      approachRow: row + 1,
    },
  ];
}

export function buildDefaultTableDefinitions(): TableDefinition[] {
  return DINING_TABLES.map((t, index) => {
    // T1–T3 = 2 seats, T4–T6 = 4 seats (matches Phase 03 Burger Cafe 6-table layout)
    const isFourSeat = index >= 3;
    const capacity = isFourSeat ? 4 : 2;
    const tableType: TableType = isFourSeat ? 'family_4' : 'standard_2';
    return {
      id: t.id,
      label: t.label,
      col: t.col,
      row: t.row,
      tableType,
      capacity,
      enabled: true,
      interactionPosition: { col: t.col, row: t.row + 1 },
      diningPosition: { col: t.col, row: t.row },
      approachPositions: [
        { col: t.col - 1, row: t.row },
        { col: t.col + 1, row: t.row },
        { col: t.col, row: t.row + 1 },
        { col: t.col, row: t.row - 1 },
      ],
      seats: buildSeatsForTable(t.col, t.row, capacity),
    };
  });
}

export const DEFAULT_TABLE_CONFIG: TableSystemConfig = {
  reservationTimeoutMs: 20_000,
  cleaningDurationMs: 1_200,
  tables: buildDefaultTableDefinitions(),
};
