export type RestaurantTableState =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'OCCUPIED'
  | 'WAITING_FOR_ORDER'
  | 'WAITING_FOR_FOOD'
  | 'EATING'
  | 'WAITING_FOR_BILL'
  | 'DIRTY'
  | 'CLEANING'
  | 'DISABLED';

/**
 * Strict transition graph preventing invalid table state jumps
 * (e.g., DIRTY can never jump straight to AVAILABLE without CLEANING).
 */
export const VALID_TABLE_TRANSITIONS: Record<RestaurantTableState, RestaurantTableState[]> = {
  AVAILABLE: ['RESERVED', 'DISABLED'],
  RESERVED: ['OCCUPIED', 'AVAILABLE', 'DISABLED'],
  OCCUPIED: ['WAITING_FOR_ORDER', 'DIRTY', 'AVAILABLE', 'DISABLED'],
  WAITING_FOR_ORDER: ['WAITING_FOR_FOOD', 'DIRTY', 'AVAILABLE', 'DISABLED'],
  WAITING_FOR_FOOD: ['EATING', 'DIRTY', 'AVAILABLE', 'DISABLED'],
  EATING: ['WAITING_FOR_BILL', 'DIRTY', 'DISABLED'],
  WAITING_FOR_BILL: ['DIRTY', 'DISABLED'],
  DIRTY: ['CLEANING', 'DISABLED'],
  CLEANING: ['AVAILABLE', 'DIRTY', 'DISABLED'],
  DISABLED: ['AVAILABLE'],
};

export function canTransitionTableState(
  from: RestaurantTableState,
  to: RestaurantTableState
): boolean {
  if (from === to) return true;
  return VALID_TABLE_TRANSITIONS[from].includes(to);
}

export function isTableAcceptingNewCustomers(state: RestaurantTableState): boolean {
  return state === 'AVAILABLE';
}

export function isTableOccupiedOrActive(state: RestaurantTableState): boolean {
  return (
    state === 'RESERVED' ||
    state === 'OCCUPIED' ||
    state === 'WAITING_FOR_ORDER' ||
    state === 'WAITING_FOR_FOOD' ||
    state === 'EATING' ||
    state === 'WAITING_FOR_BILL'
  );
}
