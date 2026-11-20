import type { OrderItemStatus, OrderStatus } from './OrderTypes.ts';

export const VALID_ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['QUEUED', 'CANCELLED'],
  QUEUED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED', 'CANCELLED'],
  SERVED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const VALID_ORDER_ITEM_TRANSITIONS: Record<OrderItemStatus, readonly OrderItemStatus[]> = {
  PENDING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED', 'CANCELLED'],
  SERVED: [],
  CANCELLED: [],
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false; // Prevent duplicate self-transitions
  return VALID_ORDER_TRANSITIONS[from].includes(to);
}

export function canTransitionOrderItemStatus(
  from: OrderItemStatus,
  to: OrderItemStatus
): boolean {
  if (from === to) return false;
  return VALID_ORDER_ITEM_TRANSITIONS[from].includes(to);
}

export function isOrderTerminal(status: OrderStatus): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}

export function isOrderActive(status: OrderStatus): boolean {
  return (
    status === 'CONFIRMED' ||
    status === 'QUEUED' ||
    status === 'ACCEPTED' ||
    status === 'PREPARING' ||
    status === 'READY' ||
    status === 'SERVED'
  );
}

export function canCancelOrder(status: OrderStatus): boolean {
  return (
    status === 'DRAFT' ||
    status === 'CONFIRMED' ||
    status === 'QUEUED' ||
    status === 'ACCEPTED' ||
    status === 'PREPARING' ||
    status === 'READY'
  );
}

/**
 * Computes an aggregate OrderStatus suggestion from individual line item statuses
 * without forcing other items to jump prematurely.
 */
export function deriveOrderStatusFromItems(
  currentStatus: OrderStatus,
  itemStatuses: readonly OrderItemStatus[]
): OrderStatus {
  if (isOrderTerminal(currentStatus) || itemStatuses.length === 0) {
    return currentStatus;
  }
  const nonCancelled = itemStatuses.filter((s) => s !== 'CANCELLED');
  if (nonCancelled.length === 0) return 'CANCELLED';
  if (nonCancelled.every((s) => s === 'SERVED')) return 'SERVED';
  if (nonCancelled.every((s) => s === 'READY' || s === 'SERVED')) return 'READY';
  if (nonCancelled.some((s) => s === 'PREPARING' || s === 'READY' || s === 'SERVED')) {
    return 'PREPARING';
  }
  if (nonCancelled.every((s) => s === 'ACCEPTED')) return 'ACCEPTED';
  return currentStatus;
}
