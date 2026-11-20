import type { KitchenQueueItem, Order, OrderPriority } from './OrderTypes.ts';

function priorityWeight(priority: OrderPriority): number {
  return priority === 'URGENT' ? 0 : 1;
}

/**
 * Predictable KitchenOrderQueue supporting multiple concurrent orders,
 * URGENT vs NORMAL priority framework with strict FIFO fairness by creation time + sequence.
 */
export class KitchenOrderQueue {
  private pending: KitchenQueueItem[] = [];
  private nextQueueSeq = 1;

  public enqueue(order: Order): KitchenQueueItem | null {
    // Prevent duplicate queue insertion for the same orderId
    if (this.pending.some((item) => item.orderId === order.orderId)) {
      return null;
    }

    const seq = this.nextQueueSeq++;
    const entry: KitchenQueueItem = {
      queueId: `q_${seq}`,
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      tableId: order.tableId,
      tableLabel: order.tableLabel,
      createdAt: order.confirmedAt || order.createdAt,
      queuePosition: this.pending.length + 1,
      priority: order.priority,
      status: 'QUEUED',
      sequence: seq,
    };

    this.pending.push(entry);
    this.sortAndReindex();
    return { ...entry };
  }

  public removeByOrderId(orderId: string): KitchenQueueItem | null {
    const idx = this.pending.findIndex((i) => i.orderId === orderId);
    if (idx === -1) return null;
    const [removed] = this.pending.splice(idx, 1);
    this.sortAndReindex();
    return { ...removed };
  }

  public updatePriority(orderId: string, priority: OrderPriority): boolean {
    const entry = this.pending.find((i) => i.orderId === orderId);
    if (!entry) return false;
    entry.priority = priority;
    this.sortAndReindex();
    return true;
  }

  public getEntry(orderId: string): KitchenQueueItem | null {
    const found = this.pending.find((i) => i.orderId === orderId);
    return found ? { ...found } : null;
  }

  public getPendingItems(): KitchenQueueItem[] {
    return this.pending.map((item) => ({ ...item }));
  }

  public getLength(): number {
    return this.pending.length;
  }

  public hasOrder(orderId: string): boolean {
    return this.pending.some((i) => i.orderId === orderId);
  }

  public clear(): void {
    this.pending = [];
    this.nextQueueSeq = 1;
  }

  private sortAndReindex(): void {
    this.pending.sort((a, b) => {
      const pDiff = priorityWeight(a.priority) - priorityWeight(b.priority);
      if (pDiff !== 0) return pDiff;
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return a.sequence - b.sequence;
    });

    this.pending.forEach((item, index) => {
      item.queuePosition = index + 1;
    });
  }
}
