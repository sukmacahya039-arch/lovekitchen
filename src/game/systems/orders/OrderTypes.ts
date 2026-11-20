import type { MenuItemId } from '../menu/MenuConfig.ts';

export type OrderDraftStatus =
  | 'OPEN'
  | 'EDITING'
  | 'READY_TO_CONFIRM'
  | 'CONFIRMED'
  | 'CANCELLED';

export type OrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'QUEUED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'SERVED'
  | 'COMPLETED'
  | 'CANCELLED';

export type OrderItemStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'SERVED'
  | 'CANCELLED';

export type OrderPriority = 'NORMAL' | 'URGENT';

export interface OrderDraftItem {
  lineId: string;
  menuItemId: MenuItemId;
  menuNameSnapshot: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  recipeId: string;
  notes: string;
}

export interface OrderDraft {
  draftId: string;
  tableId: string;
  tableLabel: string;
  customerIds: string[];
  customerGroupId: string;
  waiterId: string;
  items: OrderDraftItem[];
  createdAt: number;
  updatedAt: number;
  subtotal: number;
  total: number;
  notes: string;
  draftStatus: OrderDraftStatus;
}

export interface OrderItem {
  itemId: string;
  menuItemId: MenuItemId;
  menuNameSnapshot: string;
  quantity: number;
  unitPriceSnapshot: number;
  totalPrice: number;
  recipeId: string;
  notes: string;
  itemStatus: OrderItemStatus;
  matchedQuantity: number;
}

export interface Order {
  orderId: string;
  orderNumber: string; // e.g., ORD-001
  sessionId: string;
  tableId: string;
  tableLabel: string;
  customerIds: string[];
  customerGroupId: string;
  waiterId: string;
  acceptedByChefId: string | null;
  items: OrderItem[];
  subtotal: number;
  total: number;
  notes: string;
  priority: OrderPriority;
  status: OrderStatus;
  createdAt: number;
  confirmedAt: number;
  updatedAt: number;
  acceptedAt: number | null;
  deliveredAt: number | null;
  completedAt: number | null;
  cancelledAt: number | null;
  cancelReason: string | null;
}

export interface KitchenQueueItem {
  queueId: string;
  orderId: string;
  orderNumber: string;
  tableId: string;
  tableLabel: string;
  createdAt: number;
  queuePosition: number; // 1-indexed position in pending queue
  priority: OrderPriority;
  status: OrderStatus;
  sequence: number;
}

export interface CustomerOrderContext {
  tableId: string;
  tableLabel: string;
  customerIds: string[];
  customerGroupId: string;
  waiterId: string;
}

export interface OrderDraftSubmissionItem {
  menuItemId: string;
  quantity: number;
  notes?: string;
}

export interface OrderValidationResult {
  valid: boolean;
  errors: string[];
  code?: string;
}

export interface SimulatedFoodItem {
  foodId: string;
  menuItemId: string;
  orderId: string;
  orderItemId: string;
  tableId: string;
  customerGroupId?: string;
  quantity: number;
  recipeId?: string;
}

export interface OrderMatchingResult {
  matched: boolean;
  reason?: string;
  errorCode?: string;
  orderId: string;
  orderItemId: string;
  foodId: string;
  remainingQuantity?: number;
}

export interface OrderSessionMetrics {
  sessionId: string;
  totalOrders: number;
  totalItemsOrdered: number;
  pendingCount: number;
  activeCount: number;
  completedCount: number;
  cancelledCount: number;
  averageOrderTimeMs: number;
}

export interface OrderSystemSnapshot {
  sessionId: string;
  pendingQueue: KitchenQueueItem[];
  orders: Order[];
  metrics: OrderSessionMetrics;
}
