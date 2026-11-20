import type { DishId } from '../../../shared/types.ts';
import { SeatManager, type SeatRuntimeState } from './SeatManager.ts';
import type { TableDefinition } from './TableConfig.ts';
import { canTransitionTableState, type RestaurantTableState } from './TableState.ts';

export interface TableReservationInfo {
  groupId: string;
  customerIds: string[];
  reservedAtMs: number;
  expiresAtMs: number;
}

export interface TableRuntimeSnapshot {
  id: string;
  label: string;
  col: number;
  row: number;
  tableType: TableDefinition['tableType'];
  capacity: number;
  occupancy: number;
  availableSeats: number;
  status: RestaurantTableState;
  assignedGroupId: string | null;
  assignedCustomerIds: string[];
  dishId: DishId | null;
  orderId: string | null;
  patience: number;
  actionTimer: number;
  cleaningProgress: number;
  reservationRemainingMs: number;
  seats: SeatRuntimeState[];
}

/**
 * Represents a single managed restaurant table with strict state transitions,
 * atomic reservation locking, seat occupancy, and cleaning lifecycle.
 */
export class Table {
  public readonly config: TableDefinition;
  public readonly seatManager: SeatManager;

  private status: RestaurantTableState;
  private reservation: TableReservationInfo | null = null;
  private assignedGroupId: string | null = null;
  private assignedCustomerIds = new Set<string>();
  private hadSeatedCustomer = false;

  // Gameplay dining metadata (integrates seamlessly with existing Order/Cooking flow)
  public dishId: DishId | null = null;
  public orderId: string | null = null;
  public patience = 1;
  public actionTimer = 0;
  public cleaningProgress = 0;
  public cleaningStartedAtMs: number | null = null;

  constructor(config: TableDefinition) {
    this.config = config;
    this.seatManager = new SeatManager(config.seats);
    this.status = config.enabled ? 'AVAILABLE' : 'DISABLED';
  }

  public get id(): string {
    return this.config.id;
  }

  public get capacity(): number {
    return this.seatManager.getCapacity();
  }

  public getStatus(): RestaurantTableState {
    return this.status;
  }

  public getOccupancy(): number {
    return this.seatManager.getOccupiedCount();
  }

  public getAvailableSeats(): number {
    return this.seatManager.getAvailableSeatCount();
  }

  public getAssignedGroupId(): string | null {
    return this.assignedGroupId;
  }

  public getAssignedCustomerIds(): string[] {
    return Array.from(this.assignedCustomerIds);
  }

  public getReservation(): TableReservationInfo | null {
    return this.reservation ? { ...this.reservation, customerIds: [...this.reservation.customerIds] } : null;
  }

  public hasHadSeatedCustomer(): boolean {
    return this.hadSeatedCustomer;
  }

  public transitionTo(next: RestaurantTableState): boolean {
    if (!canTransitionTableState(this.status, next)) {
      return false;
    }
    this.status = next;
    return true;
  }

  public reserve(
    groupId: string,
    customerIds: string[],
    nowMs: number,
    timeoutMs: number
  ): Map<string, number> | null {
    if (this.status !== 'AVAILABLE') return null;
    if (customerIds.length === 0 || customerIds.length > this.capacity) return null;

    const seatMap = new Map<string, number>();
    for (const cid of customerIds) {
      const seat = this.seatManager.reserveSeat(cid);
      if (!seat) {
        this.seatManager.releaseAll();
        return null;
      }
      seatMap.set(cid, seat.config.seatIndex);
    }

    if (!this.transitionTo('RESERVED')) {
      this.seatManager.releaseAll();
      return null;
    }

    this.reservation = {
      groupId,
      customerIds: [...customerIds],
      reservedAtMs: nowMs,
      expiresAtMs: nowMs + timeoutMs,
    };
    this.assignedGroupId = groupId;
    this.assignedCustomerIds = new Set(customerIds);
    this.hadSeatedCustomer = false;
    this.patience = 1;
    this.actionTimer = 0;
    return seatMap;
  }

  public seatCustomer(customerId: string): SeatRuntimeState | null {
    if (
      this.status !== 'RESERVED' &&
      this.status !== 'OCCUPIED' &&
      this.status !== 'WAITING_FOR_ORDER'
    ) {
      return null;
    }
    if (this.assignedCustomerIds.size > 0 && !this.assignedCustomerIds.has(customerId)) {
      return null;
    }

    const seat = this.seatManager.occupySeat(customerId);
    if (!seat) return null;

    this.assignedCustomerIds.add(customerId);
    this.hadSeatedCustomer = true;

    if (this.status === 'RESERVED') {
      this.transitionTo('OCCUPIED');
      this.reservation = null;
    }
    return seat;
  }

  public releaseReservation(): string | null {
    if (this.status !== 'RESERVED') return null;
    const prevGroup = this.assignedGroupId;
    this.reservation = null;
    this.assignedGroupId = null;
    this.assignedCustomerIds.clear();
    this.seatManager.releaseAll();
    this.hadSeatedCustomer = false;
    this.dishId = null;
    this.orderId = null;
    this.patience = 1;
    this.actionTimer = 0;
    this.transitionTo('AVAILABLE');
    return prevGroup;
  }

  /**
   * Releases a customer from this table. When the final member leaves:
   * - If anyone had actually sat/dined here, the table transitions to DIRTY (or stays AVAILABLE if markDirty=false).
   * - If they cancelled before anyone sat, the table returns to AVAILABLE.
   */
  public vacateCustomer(
    customerId: string,
    markDirtyOnEmpty = true
  ): { becameEmpty: boolean; becameDirty: boolean; previousGroupId: string | null } {
    this.seatManager.releaseCustomer(customerId);
    this.assignedCustomerIds.delete(customerId);

    const remainingOccupied = this.seatManager.getOccupiedCount();
    const remainingAssigned = this.assignedCustomerIds.size;

    if (remainingOccupied === 0 && remainingAssigned === 0) {
      const previousGroupId = this.assignedGroupId;
      const shouldDirty = markDirtyOnEmpty && this.hadSeatedCustomer;
      this.reservation = null;
      this.assignedGroupId = null;
      this.dishId = null;
      this.orderId = null;
      this.patience = 1;
      this.actionTimer = 0;
      this.hadSeatedCustomer = false;

      if (shouldDirty) {
        this.transitionTo('DIRTY');
        return { becameEmpty: true, becameDirty: true, previousGroupId };
      }

      if (this.status === 'RESERVED' || this.status === 'OCCUPIED' || this.status === 'WAITING_FOR_ORDER' || this.status === 'WAITING_FOR_FOOD') {
        this.transitionTo('AVAILABLE');
      }
      return { becameEmpty: true, becameDirty: false, previousGroupId };
    }

    return { becameEmpty: false, becameDirty: false, previousGroupId: null };
  }

  public startCleaning(nowMs: number): boolean {
    if (this.status !== 'DIRTY') return false;
    if (!this.transitionTo('CLEANING')) return false;
    this.cleaningProgress = 0;
    this.cleaningStartedAtMs = nowMs;
    return true;
  }

  public completeCleaning(): boolean {
    if (this.status !== 'CLEANING' && this.status !== 'DIRTY') return false;
    if (this.status === 'DIRTY') {
      if (!this.transitionTo('CLEANING')) return false;
    }
    this.cleaningProgress = 0;
    this.cleaningStartedAtMs = null;
    return this.transitionTo('AVAILABLE');
  }

  public setDisabled(disabled: boolean): boolean {
    if (disabled) {
      this.reservation = null;
      this.assignedGroupId = null;
      this.assignedCustomerIds.clear();
      this.seatManager.releaseAll();
      this.hadSeatedCustomer = false;
      this.dishId = null;
      this.orderId = null;
      return this.transitionTo('DISABLED');
    }
    return this.transitionTo('AVAILABLE');
  }

  public getSnapshot(nowMs = Date.now()): TableRuntimeSnapshot {
    const reservationRemainingMs = this.reservation
      ? Math.max(0, this.reservation.expiresAtMs - nowMs)
      : 0;
    return {
      id: this.config.id,
      label: this.config.label,
      col: this.config.col,
      row: this.config.row,
      tableType: this.config.tableType,
      capacity: this.capacity,
      occupancy: this.getOccupancy(),
      availableSeats: this.getAvailableSeats(),
      status: this.status,
      assignedGroupId: this.assignedGroupId,
      assignedCustomerIds: this.getAssignedCustomerIds(),
      dishId: this.dishId,
      orderId: this.orderId,
      patience: this.patience,
      actionTimer: this.actionTimer,
      cleaningProgress: this.cleaningProgress,
      reservationRemainingMs,
      seats: this.seatManager.getAllSeats(),
    };
  }
}
