export interface OrderSystemConfig {
  maxItemsPerOrder: number;
  maxQuantityPerItem: number;
  maxNotesLength: number;
  maxItemNotesLength: number;
  allowMultipleActiveOrdersPerTable: boolean;
  orderNumberPrefix: string;
}

export const DEFAULT_ORDER_CONFIG: OrderSystemConfig = {
  maxItemsPerOrder: 16,
  maxQuantityPerItem: 10,
  maxNotesLength: 140,
  maxItemNotesLength: 60,
  allowMultipleActiveOrdersPerTable: true,
  orderNumberPrefix: 'ORD',
};

export function sanitizeOrderNote(raw: string | undefined, maxLen: number): string {
  if (!raw) return '';
  return raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}
