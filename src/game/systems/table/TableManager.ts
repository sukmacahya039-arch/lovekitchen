import type { GridCoord } from '../../../shared/layout.ts';
import type { GameEventBus } from '../events/GameEvents.ts';
import type { PathfindingService } from '../navigation/PathfindingService.ts';
import { Table, type TableRuntimeSnapshot } from './Table.ts';
import {
  DEFAULT_TABLE_CONFIG,
  type TableSystemConfig,
  type TableType,
} from './TableConfig.ts';
import {
  isTableAcceptingNewCustomers,
  isTableOccupiedOrActive,
  type RestaurantTableState,
} from './TableState.ts';

export interface TableSelectionCriteria {
  groupSize: number;
  fromPosition: GridCoord;
  preferredTableType?: TableType;
}

export interface TableSelectionResult {
  table: Table;
  score: number;
  approachSpot: GridCoord;
  pathLength: number;
}

export interface TableMetrics {
  total: number;
  available: number;
  reserved: number;
  occupied: number;
  dirty: number;
  cleaning: number;
  disabled: number;
  totalSeats: number;
  occupiedSeats: number;
}

/**
 * Centralized TableManager acting as the single authoritative source of truth for all
 * dining tables, reservation locks, seat assignments, Table Selection AI, and cleaning lifecycle.
 */
export class TableManager {
  private tables = new Map<string, Table>();
  private customerToTable = new Map<string, string>();
  private config: TableSystemConfig;
  private pathfinding: PathfindingService;
  private events: GameEventBus;

  constructor(
    pathfinding: PathfindingService,
    events: GameEventBus,
    config: Partial<TableSystemConfig> = {}
  ) {
    this.pathfinding = pathfinding;
    this.events = events;
    this.config = {
      ...DEFAULT_TABLE_CONFIG,
      ...config,
      tables: config.tables ?? DEFAULT_TABLE_CONFIG.tables,
    };

    for (const def of this.config.tables) {
      this.tables.set(def.id, new Table(def));
    }
  }

  public getTable(tableId: string): Table | null {
    return this.tables.get(tableId) ?? null;
  }

  public getAllTables(): Table[] {
    return Array.from(this.tables.values());
  }

  public getMaxTableCapacity(): number {
    let maxCap = 0;
    for (const tbl of this.tables.values()) {
      if (tbl.getStatus() !== 'DISABLED') {
        maxCap = Math.max(maxCap, tbl.capacity);
      }
    }
    return maxCap;
  }

  public getTableForCustomer(customerId: string): Table | null {
    const tableId = this.customerToTable.get(customerId);
    return tableId ? this.tables.get(tableId) ?? null : null;
  }

  /**
   * Table Selection AI (§10):
   * Evaluates every AVAILABLE table with sufficient capacity, validates real A* pathfinding
   * reachability, and picks the optimal table by combined fit, distance, preference, and congestion score.
   */
  public selectBestTable(criteria: TableSelectionCriteria): TableSelectionResult | null {
    if (criteria.groupSize <= 0) return null;

    let best: TableSelectionResult | null = null;

    for (const table of this.tables.values()) {
      if (!isTableAcceptingNewCustomers(table.getStatus())) continue;
      if (table.capacity < criteria.groupSize) continue;
      if (table.getReservation() !== null) continue;

      // Verify real pathfinding reachability to an approach spot around this table
      const approach = this.pathfinding.findPathToApproach(
        'waiter',
        criteria.fromPosition,
        { col: table.config.col, row: table.config.row },
        1
      );
      if (!approach.reachable || !approach.resolvedGoal) continue;

      // Compute path distance
      let pathLength = 0;
      let prev = criteria.fromPosition;
      for (const wp of approach.path) {
        pathLength += Math.hypot(wp.col - prev.col, wp.row - prev.row);
        prev = wp;
      }

      // Scoring:
      // 1. Capacity fit score: strongly prefer exact/tight fit so 2-seat tables fill before 4-seat tables
      const wastedSeats = table.capacity - criteria.groupSize;
      const capacityFitScore = 100 - wastedSeats * 22;

      // 2. Distance score: closer reachable tables score higher
      const distanceScore = Math.max(0, 60 - pathLength * 4.5);

      // 3. Preferred table type bonus
      const preferenceBonus =
        criteria.preferredTableType && table.config.tableType === criteria.preferredTableType
          ? 14
          : 0;

      // 4. Congestion penalty: slight penalty if neighboring tables are already busy
      let adjacentBusy = 0;
      for (const other of this.tables.values()) {
        if (other.id === table.id) continue;
        if (!isTableOccupiedOrActive(other.getStatus())) continue;
        const d = Math.hypot(other.config.col - table.config.col, other.config.row - table.config.row);
        if (d <= 2.6) adjacentBusy += 1;
      }
      const congestionPenalty = adjacentBusy * 4;

      const score = capacityFitScore + distanceScore + preferenceBonus - congestionPenalty;

      if (!best || score > best.score) {
        best = {
          table,
          score,
          approachSpot: approach.resolvedGoal,
          pathLength,
        };
      }
    }

    return best;
  }

  /**
   * Atomically locks an AVAILABLE table for a customer or customer group.
   * Prevents duplicate reservations and ensures a customer is never assigned to two tables.
   */
  public reserveTable(
    tableId: string,
    groupId: string,
    customerIds: string[],
    nowMs = Date.now(),
    timeoutMs = this.config.reservationTimeoutMs
  ): Map<string, number> | null {
    const table = this.tables.get(tableId);
    if (!table) return null;

    // Ensure no customer in this group is already bound to another table
    for (const cid of customerIds) {
      if (this.customerToTable.has(cid)) {
        return null;
      }
    }

    const seatMap = table.reserve(groupId, customerIds, nowMs, timeoutMs);
    if (!seatMap) return null;

    for (const cid of customerIds) {
      this.customerToTable.set(cid, table.id);
    }

    const res = table.getReservation()!;
    this.events.emit(
      'TABLE_RESERVED',
      {
        tableId: table.id,
        groupId,
        customerIds: [...customerIds],
        expiresAtMs: res.expiresAtMs,
      },
      nowMs
    );

    return seatMap;
  }

  public releaseReservation(tableId: string, reason: string, nowMs = Date.now()): boolean {
    const table = this.tables.get(tableId);
    if (!table || table.getStatus() !== 'RESERVED') return false;

    const assignedIds = table.getAssignedCustomerIds();
    const prevGroup = table.releaseReservation();
    for (const cid of assignedIds) {
      this.customerToTable.delete(cid);
    }

    this.events.emit(
      'TABLE_RESERVATION_RELEASED',
      {
        tableId: table.id,
        groupId: prevGroup,
        reason,
      },
      nowMs
    );
    return true;
  }

  public seatCustomer(
    tableId: string,
    customerId: string,
    nowMs = Date.now()
  ): { seatIndex: number; seatCol: number; seatRow: number; facing: 'front' | 'back' | 'left' | 'right' } | null {
    const table = this.tables.get(tableId);
    if (!table) return null;

    const boundTableId = this.customerToTable.get(customerId);
    if (boundTableId && boundTableId !== tableId) {
      return null;
    }

    const wasReserved = table.getStatus() === 'RESERVED';
    const seat = table.seatCustomer(customerId);
    if (!seat) return null;

    this.customerToTable.set(customerId, tableId);

    if (wasReserved || table.getOccupancy() === 1) {
      this.events.emit(
        'TABLE_OCCUPIED',
        {
          tableId: table.id,
          groupId: table.getAssignedGroupId() ?? customerId,
          occupancy: table.getOccupancy(),
          capacity: table.capacity,
        },
        nowMs
      );
    }

    return {
      seatIndex: seat.config.seatIndex,
      seatCol: seat.config.seatCol,
      seatRow: seat.config.seatRow,
      facing: seat.config.facing,
    };
  }

  public vacateCustomer(
    customerId: string,
    markDirtyOnEmpty = true,
    nowMs = Date.now()
  ): { tableId: string | null; becameDirty: boolean } {
    const tableId = this.customerToTable.get(customerId);
    if (!tableId) return { tableId: null, becameDirty: false };

    this.customerToTable.delete(customerId);
    const table = this.tables.get(tableId);
    if (!table) return { tableId: null, becameDirty: false };

    const result = table.vacateCustomer(customerId, markDirtyOnEmpty);
    if (result.becameDirty) {
      this.events.emit(
        'TABLE_DIRTY',
        {
          tableId: table.id,
          previousGroupId: result.previousGroupId,
        },
        nowMs
      );
    } else if (result.becameEmpty) {
      this.events.emit(
        'TABLE_RESERVATION_RELEASED',
        {
          tableId: table.id,
          groupId: result.previousGroupId,
          reason: 'vacated_before_dining',
        },
        nowMs
      );
    }

    return { tableId: table.id, becameDirty: result.becameDirty };
  }

  /**
   * Cleaning integration API (§19): starts CLEANING state on a DIRTY table.
   * Cleaning completes after cleaningDurationMs via update() OR immediately via completeCleaning().
   */
  public startCleaning(tableId: string, startedBy = 'waiter', nowMs = Date.now()): boolean {
    const table = this.tables.get(tableId);
    if (!table) return false;
    if (!table.startCleaning(nowMs)) return false;

    this.events.emit('TABLE_CLEANING', { tableId: table.id, startedBy }, nowMs);
    return true;
  }

  public completeCleaning(tableId: string, nowMs = Date.now()): boolean {
    const table = this.tables.get(tableId);
    if (!table) return false;
    if (!table.completeCleaning()) return false;

    this.events.emit('TABLE_CLEANED', { tableId: table.id }, nowMs);
    return true;
  }

  public setTableStatus(tableId: string, nextStatus: RestaurantTableState): boolean {
    const table = this.tables.get(tableId);
    if (!table) return false;
    return table.transitionTo(nextStatus);
  }

  public setTableDisabled(tableId: string, disabled: boolean): boolean {
    const table = this.tables.get(tableId);
    if (!table) return false;
    if (disabled) {
      for (const cid of table.getAssignedCustomerIds()) {
        this.customerToTable.delete(cid);
      }
    }
    return table.setDisabled(disabled);
  }

  /**
   * Advances reservation lock timeouts and active table cleaning timers.
   * Returns list of group IDs whose reservations expired so CustomerManager can recover cleanly.
   */
  public update(dtSeconds: number, nowMs = Date.now()): { expiredReservations: Array<{ tableId: string; groupId: string }> } {
    const expiredReservations: Array<{ tableId: string; groupId: string }> = [];

    for (const table of this.tables.values()) {
      // 1. Check reservation lock expiry
      if (table.getStatus() === 'RESERVED') {
        const res = table.getReservation();
        if (res && nowMs >= res.expiresAtMs) {
          this.releaseReservation(table.id, 'reservation_timeout', nowMs);
          expiredReservations.push({ tableId: table.id, groupId: res.groupId });
        }
      }

      // 2. Advance active table cleaning timer
      if (table.getStatus() === 'CLEANING') {
        const durationSec = Math.max(0.1, this.config.cleaningDurationMs / 1000);
        table.cleaningProgress = Math.min(1, table.cleaningProgress + dtSeconds / durationSec);
        if (table.cleaningProgress >= 1) {
          this.completeCleaning(table.id, nowMs);
        }
      }
    }

    return { expiredReservations };
  }

  public getSnapshots(nowMs = Date.now()): TableRuntimeSnapshot[] {
    return Array.from(this.tables.values()).map((t) => t.getSnapshot(nowMs));
  }

  public getMetrics(): TableMetrics {
    let available = 0;
    let reserved = 0;
    let occupied = 0;
    let dirty = 0;
    let cleaning = 0;
    let disabled = 0;
    let totalSeats = 0;
    let occupiedSeats = 0;

    for (const tbl of this.tables.values()) {
      const s = tbl.getStatus();
      totalSeats += tbl.capacity;
      occupiedSeats += tbl.getOccupancy();

      if (s === 'AVAILABLE') available += 1;
      else if (s === 'RESERVED') reserved += 1;
      else if (s === 'DIRTY') dirty += 1;
      else if (s === 'CLEANING') cleaning += 1;
      else if (s === 'DISABLED') disabled += 1;
      else occupied += 1;
    }

    return {
      total: this.tables.size,
      available,
      reserved,
      occupied,
      dirty,
      cleaning,
      disabled,
      totalSeats,
      occupiedSeats,
    };
  }
}
