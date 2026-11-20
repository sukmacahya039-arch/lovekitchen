import type { GridCoord } from '../../../shared/layout.ts';
import type { DishId } from '../../../shared/types.ts';
import type { CollisionSystem } from '../collision/CollisionSystem.ts';
import type { GameEventBus } from '../events/GameEvents.ts';
import type { NavigationGrid } from '../navigation/NavigationGrid.ts';
import type { PathfindingService } from '../navigation/PathfindingService.ts';
import type { TableManager, TableMetrics } from '../table/TableManager.ts';
import { CustomerAI, type CustomerRuntimeSnapshot } from './CustomerAI.ts';
import {
  DEFAULT_CUSTOMER_CONFIG,
  type CustomerProfile,
  type CustomerSystemConfig,
} from './CustomerConfig.ts';
import { CustomerGroupManager, type CustomerGroup } from './CustomerGroupManager.ts';
import { CustomerQueueManager } from './CustomerQueueManager.ts';
import { CustomerSpawner } from './CustomerSpawner.ts';

export interface RestaurantMetrics {
  activeCustomers: number;
  maxCustomers: number;
  queuedCustomers: number;
  queuedGroups: number;
  maxQueueSize: number;
  abandonedCustomers: number;
  angryCustomers: number;
  servedCustomers: number;
  tables: TableMetrics;
}

export interface CustomerManagerCallbacks {
  onCustomerAngryLeave?: (info: {
    groupId: string;
    tableId: string | null;
    col: number;
    row: number;
    memberCount: number;
  }) => void;
  onTableOrderReady?: (tableId: string, dishId: DishId) => void;
  onTableBillReady?: (tableId: string) => void;
}

/**
 * Authoritative CustomerManager coordinating CustomerSpawner, CustomerGroupManager,
 * CustomerQueueManager, TableManager, CustomerAI instances, and GameEventBus.
 * Designed as a single source of truth usable both server-side (multiplayer) and in unit tests.
 */
export class CustomerManager {
  public readonly config: CustomerSystemConfig;
  public readonly spawner: CustomerSpawner;
  public readonly groups: CustomerGroupManager;
  public readonly queue: CustomerQueueManager;
  public readonly tables: TableManager;
  public readonly events: GameEventBus;

  private grid: NavigationGrid;
  private pathfinding: PathfindingService;
  private collision: CollisionSystem;
  private callbacks: CustomerManagerCallbacks;

  private customers = new Map<string, CustomerAI>();
  private abandonedCustomers = 0;
  private angryCustomers = 0;
  private servedCustomers = 0;

  constructor(
    grid: NavigationGrid,
    pathfinding: PathfindingService,
    collision: CollisionSystem,
    tables: TableManager,
    events: GameEventBus,
    config: Partial<CustomerSystemConfig> = {},
    callbacks: CustomerManagerCallbacks = {}
  ) {
    this.grid = grid;
    this.pathfinding = pathfinding;
    this.collision = collision;
    this.tables = tables;
    this.events = events;
    this.callbacks = callbacks;
    this.config = {
      ...DEFAULT_CUSTOMER_CONFIG,
      ...config,
      queueSlots: config.queueSlots ?? DEFAULT_CUSTOMER_CONFIG.queueSlots.map((q) => ({ ...q })),
    };

    this.spawner = new CustomerSpawner(this.grid, this.config);
    this.groups = new CustomerGroupManager(this.events);
    this.queue = new CustomerQueueManager(this.grid, this.events, this.config);
  }

  public getCustomer(customerId: string): CustomerAI | null {
    return this.customers.get(customerId) ?? null;
  }

  public getActiveCustomers(): CustomerAI[] {
    return Array.from(this.customers.values());
  }

  public getActiveCustomerCount(): number {
    return this.customers.size;
  }

  public getCustomerSnapshots(): CustomerRuntimeSnapshot[] {
    return Array.from(this.customers.values()).map((c) => c.getSnapshot());
  }

  public getMetrics(): RestaurantMetrics {
    return {
      activeCustomers: this.customers.size,
      maxCustomers: this.config.maxCustomers,
      queuedCustomers: this.queue.getTotalQueuedCustomers(),
      queuedGroups: this.queue.getLength(),
      maxQueueSize: this.config.maxQueueSize,
      abandonedCustomers: this.abandonedCustomers,
      angryCustomers: this.angryCustomers,
      servedCustomers: this.servedCustomers,
      tables: this.tables.getMetrics(),
    };
  }

  /**
   * Spawns a new customer or customer group at the walkable restaurant entrance.
   */
  public spawnGroup(
    groupSize = 1,
    options?: {
      profiles?: CustomerProfile[];
      dishId?: DishId;
      nowMs?: number;
      bypassCapacity?: boolean;
    }
  ): CustomerGroup | null {
    const nowMs = options?.nowMs ?? Date.now();
    if (!options?.bypassCapacity && this.customers.size + groupSize > this.config.maxCustomers) {
      return null;
    }

    const batch = this.spawner.createBatch(groupSize, options?.profiles, options?.dishId);

    // Guard against duplicate IDs
    for (const cid of batch.customerIds) {
      if (this.customers.has(cid)) return null;
    }

    const group = this.groups.createGroup(batch.customerIds, batch.dishId, nowMs);
    const entranceLobby = this.resolveEntranceLobbyPoint();

    batch.customerIds.forEach((cid, idx) => {
      const spawnPos = batch.spawnPositions[idx];
      const profile = batch.profiles[idx];
      const customer = new CustomerAI(
        cid,
        group.id,
        profile,
        batch.dishId,
        spawnPos,
        this.pathfinding,
        this.collision,
        this.events,
        this.config
      );

      this.customers.set(cid, customer);
      this.events.emit(
        'CUSTOMER_SPAWNED',
        {
          customerId: cid,
          groupId: group.id,
          profileId: profile.id,
          col: spawnPos.col,
          row: spawnPos.row,
        },
        nowMs
      );

      // Begin smooth entrance walk into dining lobby
      customer.fsm.transitionTo('ENTERING');
      this.events.emit('CUSTOMER_ENTERED', { customerId: cid, groupId: group.id }, nowMs);

      const lobbyTarget: GridCoord = {
        col: entranceLobby.col - idx * 0.25,
        row: entranceLobby.row + (idx % 2) * 0.25,
      };
      customer.setMoveDestination(lobbyTarget.col, lobbyTarget.row, true);
    });

    return group;
  }

  /**
   * Main simulation tick advancing spawning, reservations, queue auto-seating,
   * CustomerAI movement, FSM transitions, patience timers, and cleanup.
   */
  public update(dtSeconds: number, nowMs = Date.now(), difficultyProgress = 0): void {
    const dt = Math.max(0, Math.min(0.25, dtSeconds));

    // 1. Update tables (reservation lock timeouts & active cleaning timers)
    const { expiredReservations } = this.tables.update(dt, nowMs);
    for (const expired of expiredReservations) {
      this.handleExpiredReservation(expired.groupId, nowMs);
    }

    // 2. Spawner check
    const activePositions = Array.from(this.customers.values()).map((c) => c.getPosition());
    const tableMetrics = this.tables.getMetrics();
    const spawnBatch = this.spawner.update(
      dt,
      this.customers.size,
      this.queue.isFull(),
      tableMetrics.available > 0,
      this.tables.getMaxTableCapacity(),
      activePositions,
      difficultyProgress
    );
    if (spawnBatch) {
      this.spawnGroupFromBatch(spawnBatch, nowMs);
    }

    // 3. Auto-assign front queued group whenever an appropriate AVAILABLE table opens up
    if (this.config.autoSeatFromQueue && this.queue.getLength() > 0 && tableMetrics.available > 0) {
      this.tryAssignQueuedGroups(nowMs);
    }

    // 4. Advance every active CustomerAI
    const toCleanup: Array<{ customer: CustomerAI; reason: 'completed' | 'angry' | 'cancelled' }> = [];

    for (const customer of Array.from(this.customers.values())) {
      const signals = customer.update(dt, nowMs);
      const state = customer.getState();

      if (state === 'ENTERING' && (signals.arrivedAtDestination || customer.fsm.getTimeInState() > 2.2)) {
        this.handleCustomerEnteredLobby(customer, nowMs);
      } else if (state === 'SEARCHING_TABLE') {
        this.handleGroupTableSearch(customer.groupId, nowMs);
      } else if (state === 'WALKING_TO_TABLE') {
        if (signals.arrivedAtDestination) {
          this.handleArrivedAtTable(customer, nowMs);
        } else if (signals.stuckExceeded) {
          this.handleWalkToTableStuck(customer, nowMs);
        }
      } else if (state === 'SEATING' && signals.seatingFinished) {
        if (customer.fsm.transitionTo('SEATED')) {
          this.events.emit(
            'CUSTOMER_SEATED',
            {
              customerId: customer.id,
              groupId: customer.groupId,
              tableId: customer.assignedTableId ?? '',
              seatIndex: customer.seatIndex ?? 0,
            },
            nowMs
          );
        }
      } else if (state === 'SEATED' && signals.browsingFinished) {
        this.handleCustomerReadyForOrder(customer, nowMs);
      } else if (state === 'EATING' && signals.eatingFinished) {
        this.handleGroupFinishedEating(customer.groupId, nowMs);
      } else if (state === 'LEAVING_TABLE' && signals.standUpFinished) {
        this.beginWalkToExit(customer, nowMs);
      } else if (state === 'WALKING_TO_EXIT') {
        if (signals.arrivedAtDestination || signals.stuckExceeded) {
          customer.cancelMovement();
          customer.fsm.transitionTo('EXITING');
        }
      } else if (state === 'EXITING' && signals.exitFinished) {
        customer.fsm.transitionTo('COMPLETED');
        this.events.emit(
          'CUSTOMER_EXITED',
          {
            customerId: customer.id,
            groupId: customer.groupId,
            angry: customer.isAngry,
          },
          nowMs
        );
        toCleanup.push({
          customer,
          reason: customer.isAngry ? 'angry' : 'completed',
        });
      }

      // Handle patience expiration cleanly (queue OR waiting at table)
      if (signals.patienceExpired && !customer.isAngry && !customer.fsm.isTerminal()) {
        this.handleGroupPatienceExpired(customer.groupId, state === 'QUEUING' ? 'queue' : 'table', nowMs);
      }
    }

    // 5. Sync table patience snapshots from seated groups
    this.syncTablePatienceFromGroups();

    // 6. Clean up completed/cancelled customers safely
    for (const item of toCleanup) {
      this.cleanupCustomer(item.customer.id, item.reason, nowMs);
    }
  }

  /**
   * Waiter Interaction API: Welcomes the front queued group to an available table (or explicit tableId).
   */
  public seatNextQueuedGroup(targetTableId?: string, nowMs = Date.now()): { ok: boolean; tableId?: string; groupId?: string } {
    const entries = this.queue.getEntries();
    if (entries.length === 0) return { ok: false };

    for (const entry of entries) {
      const group = this.groups.getGroup(entry.groupId);
      if (!group) continue;
      const leader = this.customers.get(group.memberIds[0]);
      if (!leader) continue;

      let chosenTableId: string | null = null;
      if (targetTableId) {
        const tbl = this.tables.getTable(targetTableId);
        if (tbl && tbl.getStatus() === 'AVAILABLE' && tbl.capacity >= group.size) {
          chosenTableId = tbl.id;
        }
      } else {
        const best = this.tables.selectBestTable({
          groupSize: group.size,
          fromPosition: leader.getPosition(),
          preferredTableType: leader.profile.preferredTableType,
        });
        if (best) chosenTableId = best.table.id;
      }

      if (!chosenTableId) continue;

      if (this.assignGroupToTable(group.id, chosenTableId, nowMs)) {
        return { ok: true, tableId: chosenTableId, groupId: group.id };
      }
    }

    return { ok: false };
  }

  /**
   * Waiter Interaction API: Takes order from a table whose customers are waiting to order.
   */
  public takeOrderAtTable(tableId: string, orderId: string, nowMs = Date.now()): { ok: boolean; dishId?: DishId } {
    const table = this.tables.getTable(tableId);
    if (!table) return { ok: false };
    const groupId = table.getAssignedGroupId();
    if (!groupId) return { ok: false };
    const group = this.groups.getGroup(groupId);
    if (!group) return { ok: false };

    const status = table.getStatus();
    if (status !== 'WAITING_FOR_ORDER' && status !== 'OCCUPIED') return { ok: false };

    if (status === 'OCCUPIED') {
      table.transitionTo('WAITING_FOR_ORDER');
    }
    if (!table.transitionTo('WAITING_FOR_FOOD')) return { ok: false };

    table.orderId = orderId;
    table.dishId = group.dishId;

    for (const cid of group.memberIds) {
      const c = this.customers.get(cid);
      if (!c) continue;
      if (c.getState() === 'SEATED') c.fsm.transitionTo('WAITING_FOR_ORDER');
      if (c.getState() === 'WAITING_FOR_WAITER') c.fsm.transitionTo('WAITING_FOR_ORDER');
      c.fsm.transitionTo('WAITING_FOR_FOOD');
      c.resetPatience(this.config.foodPatience);
      c.boostPatience(0.15);
      this.events.emit(
        'CUSTOMER_WAITING',
        { customerId: c.id, groupId: group.id, tableId, waitKind: 'food' },
        nowMs
      );
    }

    return { ok: true, dishId: group.dishId };
  }

  /**
   * Waiter Interaction API: Serves cooked dish to a table waiting for food → starts EATING.
   */
  public deliverFoodToTable(tableId: string, dishId: DishId, nowMs = Date.now()): { ok: boolean; wrongDish?: boolean } {
    const table = this.tables.getTable(tableId);
    if (!table || table.getStatus() !== 'WAITING_FOR_FOOD') return { ok: false };
    if (table.dishId && table.dishId !== dishId) {
      return { ok: false, wrongDish: true };
    }
    const groupId = table.getAssignedGroupId();
    if (!groupId) return { ok: false };
    const group = this.groups.getGroup(groupId);
    if (!group) return { ok: false };

    if (!table.transitionTo('EATING')) return { ok: false };
    table.actionTimer = 0;

    for (const cid of group.memberIds) {
      const c = this.customers.get(cid);
      if (!c) continue;
      c.fsm.transitionTo('EATING');
    }
    void nowMs;
    return { ok: true };
  }

  /**
   * Waiter Interaction API: Collects bill from a table in WAITING_FOR_BILL → triggers happy leave & DIRTY table!
   */
  public collectBillAtTable(tableId: string, nowMs = Date.now()): { ok: boolean; dishId?: DishId; patience?: number; groupSize?: number } {
    const table = this.tables.getTable(tableId);
    if (!table || table.getStatus() !== 'WAITING_FOR_BILL' || !table.dishId) return { ok: false };

    const dishId = table.dishId;
    const patience = table.patience;
    const groupId = table.getAssignedGroupId();
    const group = groupId ? this.groups.getGroup(groupId) : null;
    const groupSize = group?.size ?? 1;

    // Clear dishId immediately to prevent duplicate bill collection while guests stand up
    table.dishId = null;
    table.orderId = null;

    if (group) {
      this.servedCustomers += group.memberIds.length;
      this.triggerGroupLeaveTable(group.id, false, nowMs);
    } else {
      table.transitionTo('DIRTY');
    }

    return { ok: true, dishId, patience, groupSize };
  }

  /**
   * Triggers a seated group to stand up, vacate their seats (making table DIRTY), and walk to exit.
   */
  public triggerGroupLeaveTable(groupId: string, angry: boolean, nowMs = Date.now()): boolean {
    const group = this.groups.getGroup(groupId);
    if (!group) return false;

    for (const cid of group.memberIds) {
      const c = this.customers.get(cid);
      if (!c || c.fsm.isTerminal()) continue;
      if (angry) {
        c.isAngry = true;
        if (c.getState() !== 'ANGRY') c.fsm.transitionTo('ANGRY');
      }
      if (c.fsm.isSeatedState() || c.getState() === 'ANGRY') {
        if (c.assignedTableId) {
          c.fsm.transitionTo('LEAVING_TABLE');
        } else {
          this.beginWalkToExit(c, nowMs);
        }
      } else {
        this.beginWalkToExit(c, nowMs);
      }
    }
    return true;
  }

  /**
   * Cleaning integration API (§19): starts cleaning a DIRTY table (DIRTY -> CLEANING).
   */
  public startTableCleaning(tableId: string, startedBy = 'waiter', nowMs = Date.now()): boolean {
    return this.tables.startCleaning(tableId, startedBy, nowMs);
  }

  public completeTableCleaning(tableId: string, nowMs = Date.now()): boolean {
    return this.tables.completeCleaning(tableId, nowMs);
  }

  public cancelCustomer(customerId: string, nowMs = Date.now()): boolean {
    const customer = this.customers.get(customerId);
    if (!customer) return false;
    customer.fsm.transitionTo('CANCELLED');
    this.cleanupCustomer(customerId, 'cancelled', nowMs);
    return true;
  }

  // --- Internal Lifecycle Orchestration ---

  private spawnGroupFromBatch(
    batch: ReturnType<CustomerSpawner['createBatch']>,
    nowMs: number
  ): void {
    this.spawnGroup(batch.groupSize, {
      profiles: batch.profiles,
      dishId: batch.dishId,
      nowMs,
      bypassCapacity: true,
    });
  }

  private resolveEntranceLobbyPoint(): GridCoord {
    const ent = this.spawner.resolveWalkableEntrance();
    const lobby = { col: Math.max(this.grid.dividerCol + 1, ent.col - 0.6), row: ent.row + 0.6 };
    if (this.grid.isWalkable(Math.round(lobby.col), Math.round(lobby.row), 'waiter')) {
      return lobby;
    }
    return ent;
  }

  private handleCustomerEnteredLobby(customer: CustomerAI, nowMs: number): void {
    const group = this.groups.getGroup(customer.groupId);
    if (!group) return;

    // Wait until group hasn't already been assigned a table or queued
    if (group.assignedTableId) {
      this.dispatchMemberToTable(customer, group.assignedTableId, nowMs);
      return;
    }
    if (this.queue.hasGroup(group.id)) {
      const qIdx = this.queue.getGroupIndex(group.id);
      const memberIdx = Math.max(0, group.memberIds.indexOf(customer.id));
      const pos = this.queue.getTargetPositionForMember(qIdx, memberIdx);
      customer.queueIndex = qIdx;
      customer.fsm.transitionTo('QUEUING');
      customer.resetPatience(this.config.queuePatience);
      customer.setMoveDestination(pos.col, pos.row, true);
      return;
    }

    // Leader triggers table search for the entire group
    customer.fsm.transitionTo('SEARCHING_TABLE');
    this.events.emit(
      'CUSTOMER_TABLE_SEARCH_STARTED',
      { customerId: customer.id, groupId: group.id },
      nowMs
    );
    this.handleGroupTableSearch(group.id, nowMs);
  }

  private handleGroupTableSearch(groupId: string, nowMs: number): void {
    const group = this.groups.getGroup(groupId);
    if (!group || group.assignedTableId) return;

    const leader = this.customers.get(group.memberIds[0]);
    if (!leader) return;

    // If queue already has waiting groups ahead of us, join the queue fairly!
    if (this.queue.getLength() > 0 && !this.queue.hasGroup(groupId)) {
      this.enqueueGroup(group, nowMs);
      return;
    }

    const best = this.tables.selectBestTable({
      groupSize: group.size,
      fromPosition: leader.getPosition(),
      preferredTableType: leader.profile.preferredTableType,
    });

    if (best && this.assignGroupToTable(group.id, best.table.id, nowMs)) {
      return;
    }

    // No suitable table right now → enter queue
    this.enqueueGroup(group, nowMs);
  }

  private enqueueGroup(group: CustomerGroup, nowMs: number): void {
    const res = this.queue.enqueue(group.id, group.memberIds, nowMs);
    if (!res.accepted) {
      // Queue overflow behavior: politely walk back out of entrance
      for (const cid of group.memberIds) {
        const c = this.customers.get(cid);
        if (c) {
          this.abandonedCustomers += 1;
          this.beginWalkToExit(c, nowMs);
        }
      }
      return;
    }

    this.groups.setQueueIndex(group.id, res.queueIndex);

    group.memberIds.forEach((cid, idx) => {
      const c = this.customers.get(cid);
      if (!c) return;
      c.queueIndex = res.queueIndex;
      c.assignedTableId = null;
      c.seatIndex = null;
      if (c.getState() !== 'QUEUING') {
        c.fsm.transitionTo('QUEUING');
      }
      c.resetPatience(this.config.queuePatience);
      const target = this.queue.getTargetPositionForMember(res.queueIndex, idx);
      c.setMoveDestination(target.col, target.row, true);
    });
  }

  private tryAssignQueuedGroups(nowMs: number): void {
    const entries = this.queue.getEntries();
    for (const entry of entries) {
      const group = this.groups.getGroup(entry.groupId);
      if (!group || group.assignedTableId) continue;
      const leader = this.customers.get(group.memberIds[0]);
      if (!leader) continue;

      const best = this.tables.selectBestTable({
        groupSize: group.size,
        fromPosition: leader.getPosition(),
        preferredTableType: leader.profile.preferredTableType,
      });
      if (!best) continue;

      this.assignGroupToTable(group.id, best.table.id, nowMs);
    }
  }

  private assignGroupToTable(groupId: string, tableId: string, nowMs: number): boolean {
    const group = this.groups.getGroup(groupId);
    if (!group) return false;

    const seatMap = this.tables.reserveTable(
      tableId,
      group.id,
      group.memberIds,
      nowMs,
      this.config.reservationTimeoutMs
    );
    if (!seatMap) return false;

    // Remove from queue and smoothly walk remaining queued groups forward
    if (this.queue.hasGroup(group.id)) {
      const shifted = this.queue.removeGroup(group.id, nowMs);
      this.repositionShiftedQueueGroups(shifted);
    }

    this.groups.setQueueIndex(group.id, null);
    this.groups.setAssignedTable(group.id, tableId);

    const table = this.tables.getTable(tableId);
    if (table) {
      table.dishId = group.dishId;
    }

    for (const cid of group.memberIds) {
      const c = this.customers.get(cid);
      if (!c) continue;
      c.queueIndex = null;
      c.assignedTableId = tableId;
      c.seatIndex = seatMap.get(cid) ?? 0;

      this.events.emit(
        'CUSTOMER_TABLE_ASSIGNED',
        {
          customerId: c.id,
          groupId: group.id,
          tableId,
          seatIndex: c.seatIndex,
        },
        nowMs
      );

      this.dispatchMemberToTable(c, tableId, nowMs);
    }

    return true;
  }

  private dispatchMemberToTable(customer: CustomerAI, tableId: string, nowMs: number): void {
    const table = this.tables.getTable(tableId);
    if (!table) return;

    const seat = table.seatManager.getSeatForCustomer(customer.id);
    const approachCol = seat ? seat.config.approachCol : table.config.interactionPosition.col;
    const approachRow = seat ? seat.config.approachRow : table.config.interactionPosition.row;

    customer.fsm.transitionTo('WALKING_TO_TABLE');
    this.events.emit(
      'CUSTOMER_MOVING_TO_TABLE',
      { customerId: customer.id, groupId: customer.groupId, tableId },
      nowMs
    );

    const hasPath =
      customer.setMoveDestination(approachCol, approachRow, false) ||
      customer.setMoveToApproach(table.config.col, table.config.row);

    if (!hasPath) {
      this.handleWalkToTableStuck(customer, nowMs);
    }
  }

  private handleArrivedAtTable(customer: CustomerAI, nowMs: number): void {
    const tableId = customer.assignedTableId;
    if (!tableId) {
      this.handleWalkToTableStuck(customer, nowMs);
      return;
    }

    const table = this.tables.getTable(tableId);
    if (!table) {
      this.handleWalkToTableStuck(customer, nowMs);
      return;
    }

    this.events.emit(
      'CUSTOMER_ARRIVED_AT_TABLE',
      { customerId: customer.id, groupId: customer.groupId, tableId },
      nowMs
    );

    const seat = this.tables.seatCustomer(tableId, customer.id, nowMs);
    if (!seat) {
      this.handleWalkToTableStuck(customer, nowMs);
      return;
    }

    customer.seatIndex = seat.seatIndex;
    customer.alignToSeat(seat.seatCol, seat.seatRow, seat.facing);
    customer.fsm.transitionTo('SEATING');
    customer.resetPatience(this.config.waiterPatience);
  }

  private handleWalkToTableStuck(customer: CustomerAI, nowMs: number): void {
    const group = this.groups.getGroup(customer.groupId);
    const prevTableId = customer.assignedTableId;

    // Release reservation cleanly if nobody has sat down yet
    if (prevTableId) {
      this.tables.releaseReservation(prevTableId, 'customer_stuck_or_unreachable', nowMs);
    }
    if (group) {
      this.groups.setAssignedTable(group.id, null);
      for (const cid of group.memberIds) {
        const m = this.customers.get(cid);
        if (m) {
          m.assignedTableId = null;
          m.seatIndex = null;
          m.cancelMovement();
        }
      }
      // Try finding another reachable table; if none, enqueue or exit cleanly
      const best = this.tables.selectBestTable({
        groupSize: group.size,
        fromPosition: customer.getPosition(),
      });
      if (best && best.table.id !== prevTableId && this.assignGroupToTable(group.id, best.table.id, nowMs)) {
        return;
      }
      this.enqueueGroup(group, nowMs);
    }
  }

  private handleExpiredReservation(groupId: string, nowMs: number): void {
    const group = this.groups.getGroup(groupId);
    if (!group) return;
    this.groups.setAssignedTable(groupId, null);
    for (const cid of group.memberIds) {
      const m = this.customers.get(cid);
      if (m && !m.fsm.isSeatedState()) {
        m.assignedTableId = null;
        m.seatIndex = null;
        m.cancelMovement();
      }
    }
    this.enqueueGroup(group, nowMs);
  }

  private handleCustomerReadyForOrder(customer: CustomerAI, nowMs: number): void {
    const tableId = customer.assignedTableId;
    if (!tableId) return;
    const table = this.tables.getTable(tableId);
    if (!table) return;

    customer.fsm.transitionTo('WAITING_FOR_WAITER');
    customer.fsm.transitionTo('WAITING_FOR_ORDER');
    customer.resetPatience(this.config.waiterPatience);

    if (table.getStatus() === 'OCCUPIED') {
      table.transitionTo('WAITING_FOR_ORDER');
      table.dishId = customer.dishId;
      this.callbacks.onTableOrderReady?.(tableId, customer.dishId);
    }

    this.events.emit(
      'CUSTOMER_WAITING',
      {
        customerId: customer.id,
        groupId: customer.groupId,
        tableId,
        waitKind: 'order',
      },
      nowMs
    );
  }

  private handleGroupFinishedEating(groupId: string, nowMs: number): void {
    const group = this.groups.getGroup(groupId);
    if (!group) return;
    const tableId = group.assignedTableId;
    if (!tableId) return;
    const table = this.tables.getTable(tableId);
    if (!table || table.getStatus() === 'WAITING_FOR_BILL') return;

    table.transitionTo('WAITING_FOR_BILL');
    table.patience = 1;
    table.actionTimer = 0;

    for (const cid of group.memberIds) {
      const c = this.customers.get(cid);
      if (!c) continue;
      c.fsm.transitionTo('WAITING_FOR_BILL');
      c.resetPatience(this.config.billPatience);
      this.events.emit(
        'CUSTOMER_WAITING',
        { customerId: c.id, groupId: group.id, tableId, waitKind: 'bill' },
        nowMs
      );
    }

    this.callbacks.onTableBillReady?.(tableId);
  }

  private handleGroupPatienceExpired(
    groupId: string,
    reason: 'queue' | 'table',
    nowMs: number
  ): void {
    const group = this.groups.getGroup(groupId);
    if (!group || group.isAngry) return;

    this.groups.markGroupAngry(groupId);
    this.abandonedCustomers += group.memberIds.length;
    this.angryCustomers += group.memberIds.length;

    const leader = this.customers.get(group.memberIds[0]);
    const pos = leader?.getPosition() ?? this.config.entrancePos;
    const tableId = group.assignedTableId;

    // Remove from queue & shift others forward smoothly
    if (this.queue.hasGroup(groupId)) {
      const shifted = this.queue.removeGroup(groupId, nowMs);
      this.repositionShiftedQueueGroups(shifted);
    }
    this.groups.setQueueIndex(groupId, null);

    // Release any pending reservation if nobody sat down yet
    if (tableId) {
      const tbl = this.tables.getTable(tableId);
      if (tbl && tbl.getStatus() === 'RESERVED') {
        this.tables.releaseReservation(tableId, 'patience_expired', nowMs);
      }
    }

    for (const cid of group.memberIds) {
      const c = this.customers.get(cid);
      if (!c || c.fsm.isTerminal()) continue;
      c.isAngry = true;
      c.queueIndex = null;

      this.events.emit(
        'CUSTOMER_PATIENCE_EXPIRED',
        { customerId: c.id, groupId, reason },
        nowMs
      );
      this.events.emit(
        'CUSTOMER_ANGRY',
        { customerId: c.id, groupId, tableId },
        nowMs
      );

      c.fsm.transitionTo('ANGRY');
      if (c.seatAnchor || c.assignedTableId) {
        c.fsm.transitionTo('LEAVING_TABLE');
      } else {
        this.beginWalkToExit(c, nowMs);
      }
    }

    this.callbacks.onCustomerAngryLeave?.({
      groupId,
      tableId,
      col: pos.col,
      row: pos.row,
      memberCount: group.memberIds.length,
    });
  }

  private beginWalkToExit(customer: CustomerAI, nowMs: number): void {
    const prevTableId = customer.assignedTableId;
    if (customer.seatAnchor || prevTableId) {
      customer.stepOutOfSeatToWalkable();
      // Vacate seat; marks table DIRTY when final seated diner stands up!
      this.tables.vacateCustomer(customer.id, true, nowMs);
      customer.assignedTableId = null;
      customer.seatIndex = null;
    }

    this.events.emit(
      'CUSTOMER_LEAVING',
      {
        customerId: customer.id,
        groupId: customer.groupId,
        tableId: prevTableId,
        angry: customer.isAngry,
      },
      nowMs
    );

    customer.fsm.transitionTo('WALKING_TO_EXIT');
    const exitPos = this.spawner.resolveWalkableEntrance();
    const ok = customer.setMoveDestination(exitPos.col, exitPos.row, true);
    if (!ok) {
      // Recovery if exit completely blocked: fade cleanly instead of freezing forever
      customer.fsm.transitionTo('EXITING');
    }
  }

  private repositionShiftedQueueGroups(shiftedEntries: Array<{ groupId: string; memberIds: string[] }>): void {
    for (const entry of shiftedEntries) {
      const newIdx = this.queue.getGroupIndex(entry.groupId);
      if (newIdx === -1) continue;
      this.groups.setQueueIndex(entry.groupId, newIdx);
      entry.memberIds.forEach((cid, memberIdx) => {
        const c = this.customers.get(cid);
        if (!c || c.getState() !== 'QUEUING') return;
        c.queueIndex = newIdx;
        const target = this.queue.getTargetPositionForMember(newIdx, memberIdx);
        // Smooth walk to updated queue position (never teleport!)
        c.setMoveDestination(target.col, target.row, true);
      });
    }
  }

  private syncTablePatienceFromGroups(): void {
    for (const table of this.tables.getAllTables()) {
      const gid = table.getAssignedGroupId();
      if (!gid) continue;
      const group = this.groups.getGroup(gid);
      if (!group || group.memberIds.length === 0) continue;

      let minPatience = 1;
      for (const cid of group.memberIds) {
        const c = this.customers.get(cid);
        if (c) {
          minPatience = Math.min(minPatience, c.getPatienceRatio());
        }
      }
      table.patience = minPatience;
      this.groups.setSharedPatience(gid, minPatience);
    }
  }

  private cleanupCustomer(
    customerId: string,
    reason: 'completed' | 'angry' | 'cancelled',
    nowMs: number
  ): void {
    const customer = this.customers.get(customerId);
    if (!customer) return;

    // Release any lingering queue or table binding
    if (this.queue.hasGroup(customer.groupId)) {
      const grp = this.groups.getGroup(customer.groupId);
      if (grp && grp.memberIds.length <= 1) {
        const shifted = this.queue.removeGroup(customer.groupId, nowMs);
        this.repositionShiftedQueueGroups(shifted);
      }
    }
    if (customer.assignedTableId) {
      this.tables.vacateCustomer(customerId, reason !== 'cancelled', nowMs);
    }

    customer.destroy();
    this.customers.delete(customerId);
    this.groups.removeMember(customerId, reason, nowMs);
  }

  public destroy(): void {
    for (const customer of this.customers.values()) {
      customer.destroy();
    }
    this.customers.clear();
    this.queue.clear();
    this.groups.clear();
    this.events.clear();
  }
}
