import type { GridCoord } from '../../../shared/layout.ts';
import type { GameEventBus } from '../events/GameEvents.ts';
import type { NavigationGrid } from '../navigation/NavigationGrid.ts';
import type { CustomerSystemConfig } from './CustomerConfig.ts';

export interface QueueEntry {
  groupId: string;
  memberIds: string[];
  enqueuedAtMs: number;
}

/**
 * Manages ordered customer queue positions along the entrance waiting carpet.
 * Ensures non-overlapping spaced positions, dynamic forward shifting when front groups leave,
 * and configurable capacity & overflow behavior.
 */
export class CustomerQueueManager {
  private queue: QueueEntry[] = [];
  private config: CustomerSystemConfig;
  private grid: NavigationGrid;
  private events: GameEventBus;

  constructor(
    grid: NavigationGrid,
    events: GameEventBus,
    config: CustomerSystemConfig
  ) {
    this.grid = grid;
    this.events = events;
    this.config = config;
  }

  public getLength(): number {
    return this.queue.length;
  }

  public getTotalQueuedCustomers(): number {
    let total = 0;
    for (const entry of this.queue) {
      total += entry.memberIds.length;
    }
    return total;
  }

  public isFull(): boolean {
    return this.queue.length >= this.config.maxQueueSize;
  }

  public getEntries(): QueueEntry[] {
    return this.queue.map((e) => ({ ...e, memberIds: [...e.memberIds] }));
  }

  public getGroupIndex(groupId: string): number {
    return this.queue.findIndex((e) => e.groupId === groupId);
  }

  public hasGroup(groupId: string): boolean {
    return this.getGroupIndex(groupId) !== -1;
  }

  public peekFront(): QueueEntry | null {
    return this.queue[0] ?? null;
  }

  public enqueue(
    groupId: string,
    memberIds: string[],
    nowMs = Date.now()
  ): { accepted: boolean; queueIndex: number } {
    const existingIdx = this.getGroupIndex(groupId);
    if (existingIdx !== -1) {
      return { accepted: true, queueIndex: existingIdx };
    }
    if (this.isFull()) {
      return { accepted: false, queueIndex: -1 };
    }

    const index = this.queue.length;
    this.queue.push({
      groupId,
      memberIds: [...memberIds],
      enqueuedAtMs: nowMs,
    });

    for (const cid of memberIds) {
      this.events.emit('CUSTOMER_QUEUED', { customerId: cid, groupId, queueIndex: index }, nowMs);
    }
    this.events.emit(
      'CUSTOMER_QUEUE_UPDATED',
      { groupId, queueIndex: index, queueSize: this.queue.length },
      nowMs
    );

    return { accepted: true, queueIndex: index };
  }

  /**
   * Removes a group from the queue and emits queue update events for every shifted group behind it.
   */
  public removeGroup(groupId: string, nowMs = Date.now()): QueueEntry[] {
    const idx = this.getGroupIndex(groupId);
    if (idx === -1) return [];

    this.queue.splice(idx, 1);

    const shifted: QueueEntry[] = [];
    for (let i = idx; i < this.queue.length; i++) {
      const entry = this.queue[i];
      shifted.push(entry);
      this.events.emit(
        'CUSTOMER_QUEUE_UPDATED',
        { groupId: entry.groupId, queueIndex: i, queueSize: this.queue.length },
        nowMs
      );
    }

    return shifted;
  }

  /**
   * Computes a walkable, non-overlapping queue target coordinate for a specific group member.
   * Spreads multi-member parties gently beside their queue slot so sprites never stack on one point.
   */
  public getTargetPositionForMember(queueIndex: number, memberIndex: number): GridCoord {
    const slots = this.config.queueSlots;
    const clampedIdx = Math.max(0, Math.min(slots.length - 1, queueIndex));
    const baseSlot = slots[clampedIdx] ?? { col: 13, row: 3 + clampedIdx * this.config.queueSpacing };

    // Extra spacing if queueIndex exceeds predefined carpet slots
    const extraRows = queueIndex >= slots.length ? (queueIndex - (slots.length - 1)) * this.config.queueSpacing : 0;

    // Gentle side-by-side offset for party members (member 0 stands on queue line, member 1..3 stand slightly left)
    const sideOffsetCol = memberIndex === 0 ? 0 : memberIndex % 2 === 1 ? -0.45 : -0.82;
    const sideOffsetRow = memberIndex >= 2 ? 0.32 : 0;

    const candidateCol = Math.min(this.grid.cols - 0.65, Math.max(this.grid.dividerCol + 1.0, baseSlot.col + sideOffsetCol));
    const candidateRow = Math.min(this.grid.rows - 0.65, Math.max(0.5, baseSlot.row + extraRows + sideOffsetRow));

    if (this.grid.isWalkable(Math.round(candidateCol), Math.round(candidateRow), 'waiter')) {
      return { col: candidateCol, row: candidateRow };
    }

    const fallback = this.grid.findNearestWalkableTile('waiter', baseSlot.col, baseSlot.row);
    return fallback ?? { col: baseSlot.col, row: baseSlot.row };
  }

  public clear(): void {
    this.queue = [];
  }
}
