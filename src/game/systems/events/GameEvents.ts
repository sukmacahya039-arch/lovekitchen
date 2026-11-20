export type GameEventType =
  // Phase 05: Customer & Table Events
  | 'CUSTOMER_SPAWNED'
  | 'CUSTOMER_ENTERED'
  | 'CUSTOMER_QUEUED'
  | 'CUSTOMER_QUEUE_UPDATED'
  | 'CUSTOMER_TABLE_SEARCH_STARTED'
  | 'CUSTOMER_TABLE_ASSIGNED'
  | 'CUSTOMER_MOVING_TO_TABLE'
  | 'CUSTOMER_ARRIVED_AT_TABLE'
  | 'CUSTOMER_SEATED'
  | 'CUSTOMER_WAITING'
  | 'CUSTOMER_PATIENCE_LOW'
  | 'CUSTOMER_PATIENCE_EXPIRED'
  | 'CUSTOMER_ANGRY'
  | 'CUSTOMER_LEAVING'
  | 'CUSTOMER_EXITED'
  | 'TABLE_RESERVED'
  | 'TABLE_RESERVATION_RELEASED'
  | 'TABLE_OCCUPIED'
  | 'TABLE_DIRTY'
  | 'TABLE_CLEANING'
  | 'TABLE_CLEANED'
  | 'CUSTOMER_GROUP_CREATED'
  | 'CUSTOMER_GROUP_DISBANDED'
  // Phase 06: Menu, Order Draft, Kitchen Queue & Order Matching Events
  | 'MENU_OPENED'
  | 'MENU_CLOSED'
  | 'MENU_ITEM_SELECTED'
  | 'MENU_ITEM_ADDED'
  | 'MENU_ITEM_REMOVED'
  | 'ORDER_DRAFT_CREATED'
  | 'ORDER_DRAFT_UPDATED'
  | 'ORDER_DRAFT_CANCELLED'
  | 'ORDER_VALIDATED'
  | 'ORDER_CONFIRMED'
  | 'ORDER_CREATED'
  | 'ORDER_QUEUED'
  | 'ORDER_QUEUE_UPDATED'
  | 'ORDER_ACCEPTED'
  | 'ORDER_ITEM_STATUS_CHANGED'
  | 'ORDER_CANCELLED'
  | 'ORDER_MATCH_ATTEMPTED'
  | 'ORDER_MATCHED'
  | 'ORDER_MATCH_FAILED';

export type GameEventName = GameEventType;

export interface GameEventPayloadMap {
  // Phase 05
  CUSTOMER_SPAWNED: { customerId: string; groupId: string; profileId: string; col: number; row: number };
  CUSTOMER_ENTERED: { customerId: string; groupId: string };
  CUSTOMER_QUEUED: { customerId: string; groupId: string; queueIndex: number };
  CUSTOMER_QUEUE_UPDATED: { groupId: string; queueIndex: number; queueSize: number };
  CUSTOMER_TABLE_SEARCH_STARTED: { customerId: string; groupId: string };
  CUSTOMER_TABLE_ASSIGNED: { customerId: string; groupId: string; tableId: string; seatIndex: number };
  CUSTOMER_MOVING_TO_TABLE: { customerId: string; groupId: string; tableId: string };
  CUSTOMER_ARRIVED_AT_TABLE: { customerId: string; groupId: string; tableId: string };
  CUSTOMER_SEATED: { customerId: string; groupId: string; tableId: string; seatIndex: number };
  CUSTOMER_WAITING: { customerId: string; groupId: string; tableId: string; waitKind: 'waiter' | 'order' | 'food' | 'bill' };
  CUSTOMER_PATIENCE_LOW: { customerId: string; groupId: string; ratio: number };
  CUSTOMER_PATIENCE_EXPIRED: { customerId: string; groupId: string; reason: 'queue' | 'table' };
  CUSTOMER_ANGRY: { customerId: string; groupId: string; tableId: string | null };
  CUSTOMER_LEAVING: { customerId: string; groupId: string; tableId: string | null; angry: boolean };
  CUSTOMER_EXITED: { customerId: string; groupId: string; angry: boolean };
  TABLE_RESERVED: { tableId: string; groupId: string; customerIds: string[]; expiresAtMs: number };
  TABLE_RESERVATION_RELEASED: { tableId: string; groupId: string | null; reason: string };
  TABLE_OCCUPIED: { tableId: string; groupId: string; occupancy: number; capacity: number };
  TABLE_DIRTY: { tableId: string; previousGroupId: string | null };
  TABLE_CLEANING: { tableId: string; startedBy?: string };
  TABLE_CLEANED: { tableId: string };
  CUSTOMER_GROUP_CREATED: { groupId: string; memberIds: string[]; size: number };
  CUSTOMER_GROUP_DISBANDED: { groupId: string; reason: 'completed' | 'angry' | 'cancelled' };

  // Phase 06
  MENU_OPENED: { tableId: string; waiterId: string };
  MENU_CLOSED: { tableId: string; waiterId: string };
  MENU_ITEM_SELECTED: { menuItemId: string; category: string };
  MENU_ITEM_ADDED: { draftId: string; menuItemId: string; quantity: number };
  MENU_ITEM_REMOVED: { draftId: string; menuItemId: string };
  ORDER_DRAFT_CREATED: { draftId: string; tableId: string; customerGroupId: string; waiterId: string };
  ORDER_DRAFT_UPDATED: { draftId: string; tableId: string; itemCount: number; total: number };
  ORDER_DRAFT_CANCELLED: { draftId: string; tableId: string; reason?: string };
  ORDER_VALIDATED: { draftId: string; tableId: string; valid: boolean; errors: string[] };
  ORDER_CONFIRMED: { orderId: string; orderNumber: string; tableId: string; total: number };
  ORDER_CREATED: { orderId: string; orderNumber: string; tableId: string; customerGroupId: string; itemCount: number };
  ORDER_QUEUED: { orderId: string; orderNumber: string; queueId: string; queuePosition: number; priority: string };
  ORDER_QUEUE_UPDATED: { pendingCount: number; activeCount: number };
  ORDER_ACCEPTED: { orderId: string; orderNumber: string; tableId: string; chefId: string };
  ORDER_ITEM_STATUS_CHANGED: { orderId: string; itemId: string; menuItemId: string; fromStatus: string; toStatus: string };
  ORDER_CANCELLED: { orderId: string; orderNumber: string; tableId: string; reason: string };
  ORDER_MATCH_ATTEMPTED: { foodId: string; orderId: string; orderItemId: string; menuItemId: string; tableId: string };
  ORDER_MATCHED: { foodId: string; orderId: string; orderItemId: string; menuItemId: string; tableId: string; quantity: number };
  ORDER_MATCH_FAILED: { foodId: string; orderId: string; reason: string };
}

export interface RecordedGameEvent<K extends GameEventType = GameEventType> {
  type: K;
  payload: GameEventPayloadMap[K];
  timestampMs: number;
}

type EventHandler<K extends GameEventType> = (payload: GameEventPayloadMap[K]) => void;

/**
 * Lightweight, zero-DOM typed event bus for Customer, Table, Menu, Order,
 * Kitchen Queue, and Order Matching events.
 */
export class GameEventBus {
  private listeners = new Map<GameEventType, Set<EventHandler<GameEventType>>>();
  private wildcardListeners = new Set<(evt: RecordedGameEvent) => void>();
  private history: RecordedGameEvent[] = [];
  private maxHistory: number;

  constructor(maxHistory = 160) {
    this.maxHistory = maxHistory;
  }

  public on<K extends GameEventType>(type: K, handler: EventHandler<K>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler as EventHandler<GameEventType>);
    return () => this.off(type, handler);
  }

  public once<K extends GameEventType>(type: K, handler: EventHandler<K>): () => void {
    const unsub = this.on(type, (payload) => {
      unsub();
      handler(payload);
    });
    return unsub;
  }

  public off<K extends GameEventType>(type: K, handler: EventHandler<K>): void {
    this.listeners.get(type)?.delete(handler as EventHandler<GameEventType>);
  }

  public onAny(handler: (evt: RecordedGameEvent) => void): () => void {
    this.wildcardListeners.add(handler);
    return () => this.wildcardListeners.delete(handler);
  }

  public emit<K extends GameEventType>(
    type: K,
    payload: GameEventPayloadMap[K],
    timestampMs = Date.now()
  ): void {
    const record: RecordedGameEvent<K> = { type, payload, timestampMs };
    this.history.push(record);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const handlers = this.listeners.get(type);
    if (handlers) {
      for (const fn of Array.from(handlers)) {
        fn(payload);
      }
    }
    for (const fn of Array.from(this.wildcardListeners)) {
      fn(record);
    }
  }

  public getHistory(): RecordedGameEvent[] {
    return [...this.history];
  }

  public clearHistory(): void {
    this.history = [];
  }

  public clear(): void {
    this.listeners.clear();
    this.wildcardListeners.clear();
    this.history = [];
  }
}
