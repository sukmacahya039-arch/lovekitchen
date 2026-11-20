import type { DishId } from '../../../shared/types.ts';
import type { GameEventBus } from '../events/GameEvents.ts';

export interface CustomerGroup {
  id: string;
  memberIds: string[];
  size: number;
  assignedTableId: string | null;
  queueIndex: number | null;
  sharedPatience: number; // 0..1
  dishId: DishId;
  createdAtMs: number;
  isAngry: boolean;
}

/**
 * Manages customer party groups (1–4 guests) so group members enter, queue,
 * select a table, sit in distinct seats at the same table, dine, and leave together.
 */
export class CustomerGroupManager {
  private groups = new Map<string, CustomerGroup>();
  private customerToGroup = new Map<string, string>();
  private nextGroupNum = 1;
  private events: GameEventBus;

  constructor(events: GameEventBus) {
    this.events = events;
  }

  public createGroup(
    memberIds: string[],
    dishId: DishId,
    nowMs = Date.now()
  ): CustomerGroup {
    const id = `G${String(this.nextGroupNum++).padStart(3, '0')}`;
    const group: CustomerGroup = {
      id,
      memberIds: [...memberIds],
      size: memberIds.length,
      assignedTableId: null,
      queueIndex: null,
      sharedPatience: 1,
      dishId,
      createdAtMs: nowMs,
      isAngry: false,
    };
    this.groups.set(id, group);
    for (const cid of memberIds) {
      this.customerToGroup.set(cid, id);
    }

    this.events.emit(
      'CUSTOMER_GROUP_CREATED',
      {
        groupId: id,
        memberIds: [...memberIds],
        size: memberIds.length,
      },
      nowMs
    );

    return group;
  }

  public getGroup(groupId: string): CustomerGroup | null {
    return this.groups.get(groupId) ?? null;
  }

  public getGroupByCustomer(customerId: string): CustomerGroup | null {
    const gid = this.customerToGroup.get(customerId);
    return gid ? this.groups.get(gid) ?? null : null;
  }

  public getAllGroups(): CustomerGroup[] {
    return Array.from(this.groups.values());
  }

  public setAssignedTable(groupId: string, tableId: string | null): void {
    const g = this.groups.get(groupId);
    if (g) g.assignedTableId = tableId;
  }

  public setQueueIndex(groupId: string, index: number | null): void {
    const g = this.groups.get(groupId);
    if (g) g.queueIndex = index;
  }

  public setSharedPatience(groupId: string, ratio: number): void {
    const g = this.groups.get(groupId);
    if (g) g.sharedPatience = Math.max(0, Math.min(1, ratio));
  }

  public markGroupAngry(groupId: string): void {
    const g = this.groups.get(groupId);
    if (g) g.isAngry = true;
  }

  public removeMember(
    customerId: string,
    reason: 'completed' | 'angry' | 'cancelled' = 'completed',
    nowMs = Date.now()
  ): boolean {
    const gid = this.customerToGroup.get(customerId);
    if (!gid) return false;
    this.customerToGroup.delete(customerId);

    const group = this.groups.get(gid);
    if (!group) return false;

    group.memberIds = group.memberIds.filter((id) => id !== customerId);
    if (group.memberIds.length === 0) {
      this.groups.delete(gid);
      this.events.emit('CUSTOMER_GROUP_DISBANDED', { groupId: gid, reason }, nowMs);
      return true;
    }
    return false;
  }

  public clear(): void {
    this.groups.clear();
    this.customerToGroup.clear();
  }
}
