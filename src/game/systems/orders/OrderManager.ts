import type { GameEventBus } from '../events/GameEvents.ts';
import { DEFAULT_ORDER_CONFIG, type OrderSystemConfig } from './OrderConfig.ts';
import { KitchenOrderQueue } from './OrderQueue.ts';
import {
  canCancelOrder,
  canTransitionOrderItemStatus,
  canTransitionOrderStatus,
  deriveOrderStatusFromItems,
} from './OrderStateMachine.ts';
import type {
  Order,
  OrderDraft,
  OrderItem,
  OrderItemStatus,
  OrderPriority,
  OrderSessionMetrics,
  OrderStatus,
  OrderSystemSnapshot,
} from './OrderTypes.ts';

/**
 * Centralized session-scoped OrderManager & Order Number Generator.
 * Stores every confirmed, queued, accepted, completed, and cancelled order in the session
 * so accepted orders remain tracked after leaving KitchenOrderQueue.
 */
export class OrderManager {
  public readonly sessionId: string;
  public readonly queue: KitchenOrderQueue;

  private orders = new Map<string, Order>();
  private orderSeq = 0;
  private itemSeq = 0;
  private events?: GameEventBus;
  private config: OrderSystemConfig;

  constructor(
    sessionId = `sess_${Date.now()}`,
    events?: GameEventBus,
    config: Partial<OrderSystemConfig> = {}
  ) {
    this.sessionId = sessionId;
    this.events = events;
    this.config = { ...DEFAULT_ORDER_CONFIG, ...config };
    this.queue = new KitchenOrderQueue();
  }

  /**
   * Generates a unique collision-free order number (e.g., ORD-001) scoped to this game session.
   * Never uses array index.
   */
  public generateOrderNumber(): { orderId: string; orderNumber: string } {
    this.orderSeq += 1;
    const padded = String(this.orderSeq).padStart(3, '0');
    const orderNumber = `${this.config.orderNumberPrefix}-${padded}`;
    const orderId = `${this.sessionId}_${orderNumber}`;
    return { orderId, orderNumber };
  }

  /**
   * Creates an immutable-snapshot Order from a validated OrderDraft,
   * transitions DRAFT -> CONFIRMED -> QUEUED, and inserts into KitchenOrderQueue.
   */
  public createAndQueueFromDraft(
    draft: OrderDraft,
    priority: OrderPriority = 'NORMAL',
    nowMs = Date.now()
  ): Order {
    const { orderId, orderNumber } = this.generateOrderNumber();

    const items: OrderItem[] = draft.items.map((d) => ({
      itemId: `${orderId}_item_${++this.itemSeq}`,
      menuItemId: d.menuItemId,
      menuNameSnapshot: d.menuNameSnapshot,
      quantity: d.quantity,
      unitPriceSnapshot: d.unitPrice,
      totalPrice: d.unitPrice * d.quantity,
      recipeId: d.recipeId,
      notes: d.notes,
      itemStatus: 'PENDING',
      matchedQuantity: 0,
    }));

    const subtotal = items.reduce((sum, i) => sum + i.totalPrice, 0);

    const order: Order = {
      orderId,
      orderNumber,
      sessionId: this.sessionId,
      tableId: draft.tableId,
      tableLabel: draft.tableLabel,
      customerIds: [...draft.customerIds],
      customerGroupId: draft.customerGroupId,
      waiterId: draft.waiterId,
      acceptedByChefId: null,
      items,
      subtotal,
      total: subtotal,
      notes: draft.notes,
      priority,
      status: 'CONFIRMED',
      createdAt: draft.createdAt,
      confirmedAt: nowMs,
      updatedAt: nowMs,
      acceptedAt: null,
      deliveredAt: null,
      completedAt: null,
      cancelledAt: null,
      cancelReason: null,
    };

    this.orders.set(orderId, order);

    this.events?.emit(
      'ORDER_CONFIRMED',
      { orderId, orderNumber, tableId: order.tableId, total: order.total },
      nowMs
    );
    this.events?.emit(
      'ORDER_CREATED',
      {
        orderId,
        orderNumber,
        tableId: order.tableId,
        customerGroupId: order.customerGroupId,
        itemCount: items.reduce((s, i) => s + i.quantity, 0),
      },
      nowMs
    );

    // Transition CONFIRMED -> QUEUED and insert into KitchenOrderQueue
    this.transitionOrderStatus(orderId, 'QUEUED', nowMs);
    const queueEntry = this.queue.enqueue(order);
    if (queueEntry) {
      this.events?.emit(
        'ORDER_QUEUED',
        {
          orderId,
          orderNumber,
          queueId: queueEntry.queueId,
          queuePosition: queueEntry.queuePosition,
          priority: queueEntry.priority,
        },
        nowMs
      );
      this.emitQueueUpdated(nowMs);
    }

    return this.cloneOrder(order);
  }

  /**
   * Chef accepts a QUEUED order: validates state, transitions QUEUED -> ACCEPTED,
   * updates each line item PENDING -> ACCEPTED, removes from pending queue,
   * and keeps order tracked in the session registry.
   */
  public acceptOrder(
    orderId: string,
    chefId: string,
    nowMs = Date.now()
  ): { ok: boolean; order?: Order; error?: string } {
    const order = this.orders.get(orderId);
    if (!order) return { ok: false, error: `Order "${orderId}" not found.` };
    if (order.status === 'CANCELLED') {
      return { ok: false, error: 'Cannot accept a cancelled order.' };
    }
    if (!canTransitionOrderStatus(order.status, 'ACCEPTED')) {
      return {
        ok: false,
        error: `Order ${order.orderNumber} cannot transition from ${order.status} to ACCEPTED.`,
      };
    }

    order.status = 'ACCEPTED';
    order.acceptedByChefId = chefId;
    order.acceptedAt = nowMs;
    order.updatedAt = nowMs;

    for (const item of order.items) {
      if (canTransitionOrderItemStatus(item.itemStatus, 'ACCEPTED')) {
        const prev = item.itemStatus;
        item.itemStatus = 'ACCEPTED';
        this.events?.emit(
          'ORDER_ITEM_STATUS_CHANGED',
          {
            orderId: order.orderId,
            itemId: item.itemId,
            menuItemId: item.menuItemId,
            fromStatus: prev,
            toStatus: 'ACCEPTED',
          },
          nowMs
        );
      }
    }

    this.queue.removeByOrderId(orderId);
    this.events?.emit(
      'ORDER_ACCEPTED',
      {
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        tableId: order.tableId,
        chefId,
      },
      nowMs
    );
    this.emitQueueUpdated(nowMs);

    return { ok: true, order: this.cloneOrder(order) };
  }

  public transitionOrderStatus(
    orderId: string,
    nextStatus: OrderStatus,
    nowMs = Date.now()
  ): { ok: boolean; order?: Order; error?: string } {
    const order = this.orders.get(orderId);
    if (!order) return { ok: false, error: 'Order not found.' };
    if (!canTransitionOrderStatus(order.status, nextStatus)) {
      return {
        ok: false,
        error: `Illegal order transition: ${order.status} -> ${nextStatus}.`,
      };
    }

    order.status = nextStatus;
    order.updatedAt = nowMs;
    if (nextStatus === 'SERVED') order.deliveredAt = nowMs;
    if (nextStatus === 'COMPLETED') order.completedAt = nowMs;
    if (nextStatus === 'CANCELLED') {
      order.cancelledAt = nowMs;
      this.queue.removeByOrderId(orderId);
    }
    return { ok: true, order: this.cloneOrder(order) };
  }

  /**
   * Transitions a single line item independently without prematurely flipping sibling items.
   */
  public transitionOrderItemStatus(
    orderId: string,
    itemId: string,
    nextStatus: OrderItemStatus,
    nowMs = Date.now()
  ): { ok: boolean; order?: Order; error?: string } {
    const order = this.orders.get(orderId);
    if (!order) return { ok: false, error: 'Order not found.' };
    if (order.status === 'CANCELLED' || order.status === 'COMPLETED') {
      return { ok: false, error: `Cannot modify item on ${order.status} order.` };
    }

    const item = order.items.find((i) => i.itemId === itemId);
    if (!item) return { ok: false, error: 'Order item not found.' };

    if (!canTransitionOrderItemStatus(item.itemStatus, nextStatus)) {
      return {
        ok: false,
        error: `Illegal item transition: ${item.itemStatus} -> ${nextStatus}.`,
      };
    }

    const prev = item.itemStatus;
    item.itemStatus = nextStatus;
    order.updatedAt = nowMs;

    this.events?.emit(
      'ORDER_ITEM_STATUS_CHANGED',
      {
        orderId: order.orderId,
        itemId: item.itemId,
        menuItemId: item.menuItemId,
        fromStatus: prev,
        toStatus: nextStatus,
      },
      nowMs
    );

    // Derive aggregate order status cleanly if valid
    const derived = deriveOrderStatusFromItems(
      order.status,
      order.items.map((i) => i.itemStatus)
    );
    if (derived !== order.status && canTransitionOrderStatus(order.status, derived)) {
      this.transitionOrderStatus(orderId, derived, nowMs);
    }

    return { ok: true, order: this.cloneOrder(order) };
  }

  public cancelOrder(
    orderId: string,
    reason = 'cancelled',
    nowMs = Date.now()
  ): { ok: boolean; order?: Order; error?: string } {
    const order = this.orders.get(orderId);
    if (!order) return { ok: false, error: 'Order not found.' };
    if (!canCancelOrder(order.status)) {
      return { ok: false, error: `Cannot cancel order in status ${order.status}.` };
    }

    order.status = 'CANCELLED';
    order.cancelledAt = nowMs;
    order.cancelReason = reason;
    order.updatedAt = nowMs;

    for (const item of order.items) {
      if (canTransitionOrderItemStatus(item.itemStatus, 'CANCELLED')) {
        const prev = item.itemStatus;
        item.itemStatus = 'CANCELLED';
        this.events?.emit(
          'ORDER_ITEM_STATUS_CHANGED',
          {
            orderId: order.orderId,
            itemId: item.itemId,
            menuItemId: item.menuItemId,
            fromStatus: prev,
            toStatus: 'CANCELLED',
          },
          nowMs
        );
      }
    }

    this.queue.removeByOrderId(orderId);
    this.events?.emit(
      'ORDER_CANCELLED',
      { orderId: order.orderId, orderNumber: order.orderNumber, tableId: order.tableId, reason },
      nowMs
    );
    this.emitQueueUpdated(nowMs);

    return { ok: true, order: this.cloneOrder(order) };
  }

  public getOrder(orderId: string): Order | null {
    const o = this.orders.get(orderId);
    return o ? this.cloneOrder(o) : null;
  }

  /** Internal mutable reference used by OrderMatchingService inside same domain boundary. */
  public getOrderRef(orderId: string): Order | null {
    return this.orders.get(orderId) ?? null;
  }

  public getAllOrders(): Order[] {
    return Array.from(this.orders.values()).map((o) => this.cloneOrder(o));
  }

  public getOrdersByTable(tableId: string, onlyActive = false): Order[] {
    return this.getAllOrders().filter(
      (o) =>
        o.tableId === tableId &&
        (!onlyActive || (o.status !== 'COMPLETED' && o.status !== 'CANCELLED'))
    );
  }

  public getPendingOrders(): Order[] {
    return this.queue
      .getPendingItems()
      .map((q) => this.getOrder(q.orderId))
      .filter((o): o is Order => o !== null);
  }

  public getActiveAcceptedOrders(): Order[] {
    return this.getAllOrders().filter(
      (o) =>
        o.status === 'ACCEPTED' ||
        o.status === 'PREPARING' ||
        o.status === 'READY' ||
        o.status === 'SERVED'
    );
  }

  public getCompletedOrders(): Order[] {
    return this.getAllOrders().filter((o) => o.status === 'COMPLETED');
  }

  public getCancelledOrders(): Order[] {
    return this.getAllOrders().filter((o) => o.status === 'CANCELLED');
  }

  public getMetrics(): OrderSessionMetrics {
    const all = Array.from(this.orders.values());
    let totalItemsOrdered = 0;
    let activeCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    let durationSum = 0;
    let durationCount = 0;

    for (const o of all) {
      totalItemsOrdered += o.items.reduce((s, i) => s + i.quantity, 0);
      if (o.status === 'COMPLETED') {
        completedCount += 1;
        if (o.completedAt) {
          durationSum += Math.max(0, o.completedAt - o.confirmedAt);
          durationCount += 1;
        }
      } else if (o.status === 'CANCELLED') {
        cancelledCount += 1;
      } else if (
        o.status === 'ACCEPTED' ||
        o.status === 'PREPARING' ||
        o.status === 'READY' ||
        o.status === 'SERVED'
      ) {
        activeCount += 1;
      }
    }

    return {
      sessionId: this.sessionId,
      totalOrders: all.length,
      totalItemsOrdered,
      pendingCount: this.queue.getLength(),
      activeCount,
      completedCount,
      cancelledCount,
      averageOrderTimeMs: durationCount > 0 ? Math.round(durationSum / durationCount) : 0,
    };
  }

  public getSnapshot(): OrderSystemSnapshot {
    return {
      sessionId: this.sessionId,
      pendingQueue: this.queue.getPendingItems(),
      orders: this.getAllOrders(),
      metrics: this.getMetrics(),
    };
  }

  private emitQueueUpdated(nowMs: number): void {
    const metrics = this.getMetrics();
    this.events?.emit(
      'ORDER_QUEUE_UPDATED',
      { pendingCount: metrics.pendingCount, activeCount: metrics.activeCount },
      nowMs
    );
  }

  private cloneOrder(o: Order): Order {
    return {
      ...o,
      customerIds: [...o.customerIds],
      items: o.items.map((i) => ({ ...i })),
    };
  }
}
