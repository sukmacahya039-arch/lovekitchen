import type { GameEventBus } from '../events/GameEvents.ts';
import type { OrderManager } from './OrderManager.ts';
import type { OrderMatchingResult, SimulatedFoodItem } from './OrderTypes.ts';

/**
 * Authoritative OrderMatchingService matching future/simulated cooked food items
 * strictly via stable IDs (orderId, orderItemId, menuItemId, tableId, customerGroupId,
 * quantity, recipeId) — NEVER by menu display name.
 * Prevents duplicate food matches, over-quantity delivery, wrong table/item, and cancelled/completed orders.
 */
export class OrderMatchingService {
  private orderManager: OrderManager;
  private events?: GameEventBus;
  private matchedFoodIds = new Set<string>();

  constructor(orderManager: OrderManager, events?: GameEventBus) {
    this.orderManager = orderManager;
    this.events = events;
  }

  /**
   * Validates whether a food item matches an active order & line item without mutating state.
   */
  public validateMatch(food: SimulatedFoodItem): OrderMatchingResult {
    if (!food.foodId || food.foodId.trim().length === 0) {
      return this.fail(food, 'MISSING_FOOD_ID', 'Food item must have a unique foodId.');
    }

    if (this.matchedFoodIds.has(food.foodId)) {
      return this.fail(
        food,
        'DUPLICATE_FOOD',
        `Food item "${food.foodId}" has already been matched to an order.`
      );
    }

    if (!Number.isInteger(food.quantity) || food.quantity < 1) {
      return this.fail(food, 'INVALID_QUANTITY', 'Food quantity must be a positive integer.');
    }

    const order = this.orderManager.getOrderRef(food.orderId);
    if (!order) {
      return this.fail(food, 'ORDER_NOT_FOUND', `Order "${food.orderId}" does not exist.`);
    }

    if (order.status === 'CANCELLED') {
      return this.fail(food, 'ORDER_CANCELLED', `Order ${order.orderNumber} is cancelled.`);
    }

    if (order.status === 'COMPLETED' || order.status === 'SERVED') {
      return this.fail(
        food,
        'ORDER_COMPLETED',
        `Order ${order.orderNumber} is already ${order.status}.`
      );
    }

    if (order.status === 'DRAFT') {
      return this.fail(food, 'ORDER_NOT_CONFIRMED', `Order ${order.orderNumber} is still a draft.`);
    }

    if (order.tableId !== food.tableId) {
      return this.fail(
        food,
        'WRONG_TABLE',
        `Food table "${food.tableId}" does not match order table "${order.tableId}".`
      );
    }

    if (food.customerGroupId && food.customerGroupId !== order.customerGroupId) {
      return this.fail(
        food,
        'WRONG_CUSTOMER_GROUP',
        `Customer group mismatch on order ${order.orderNumber}.`
      );
    }

    const item = order.items.find((i) => i.itemId === food.orderItemId);
    if (!item) {
      return this.fail(
        food,
        'ORDER_ITEM_NOT_FOUND',
        `Order item "${food.orderItemId}" not found in order ${order.orderNumber}.`
      );
    }

    if (item.itemStatus === 'CANCELLED') {
      return this.fail(food, 'ORDER_ITEM_CANCELLED', `Order item "${item.itemId}" is cancelled.`);
    }

    if (item.itemStatus === 'SERVED') {
      return this.fail(food, 'ORDER_ITEM_COMPLETED', `Order item "${item.itemId}" is already served.`);
    }

    if (item.menuItemId !== food.menuItemId) {
      return this.fail(
        food,
        'WRONG_MENU_ITEM',
        `Menu item "${food.menuItemId}" does not match requested "${item.menuItemId}".`
      );
    }

    if (food.recipeId && food.recipeId !== item.recipeId) {
      return this.fail(
        food,
        'WRONG_RECIPE',
        `Recipe "${food.recipeId}" does not match "${item.recipeId}".`
      );
    }

    const remaining = item.quantity - item.matchedQuantity;
    if (remaining <= 0) {
      return this.fail(
        food,
        'ITEM_ALREADY_FULFILLED',
        `Order item "${item.itemId}" has already been completely matched.`
      );
    }

    if (food.quantity > remaining) {
      return this.fail(
        food,
        'QUANTITY_EXCEEDED',
        `Food quantity (${food.quantity}) exceeds remaining requested quantity (${remaining}).`
      );
    }

    return {
      matched: true,
      orderId: order.orderId,
      orderItemId: item.itemId,
      foodId: food.foodId,
      remainingQuantity: remaining - food.quantity,
    };
  }

  /**
   * Executes authoritative food-to-order matching, records matched foodId & quantity,
   * and emits ORDER_MATCH_ATTEMPTED + ORDER_MATCHED / ORDER_MATCH_FAILED.
   */
  public matchFoodToOrder(food: SimulatedFoodItem, nowMs = Date.now()): OrderMatchingResult {
    this.events?.emit(
      'ORDER_MATCH_ATTEMPTED',
      {
        foodId: food.foodId,
        orderId: food.orderId,
        orderItemId: food.orderItemId,
        menuItemId: food.menuItemId,
        tableId: food.tableId,
      },
      nowMs
    );

    const check = this.validateMatch(food);
    if (!check.matched) {
      this.events?.emit(
        'ORDER_MATCH_FAILED',
        {
          foodId: food.foodId,
          orderId: food.orderId,
          reason: check.reason ?? 'Unknown match error',
        },
        nowMs
      );
      return check;
    }

    const order = this.orderManager.getOrderRef(food.orderId)!;
    const item = order.items.find((i) => i.itemId === food.orderItemId)!;

    this.matchedFoodIds.add(food.foodId);
    item.matchedQuantity += food.quantity;
    order.updatedAt = nowMs;

    this.events?.emit(
      'ORDER_MATCHED',
      {
        foodId: food.foodId,
        orderId: order.orderId,
        orderItemId: item.itemId,
        menuItemId: item.menuItemId,
        tableId: order.tableId,
        quantity: food.quantity,
      },
      nowMs
    );

    return {
      matched: true,
      orderId: order.orderId,
      orderItemId: item.itemId,
      foodId: food.foodId,
      remainingQuantity: item.quantity - item.matchedQuantity,
    };
  }

  public isFoodMatched(foodId: string): boolean {
    return this.matchedFoodIds.has(foodId);
  }

  public clear(): void {
    this.matchedFoodIds.clear();
  }

  private fail(food: SimulatedFoodItem, errorCode: string, reason: string): OrderMatchingResult {
    return {
      matched: false,
      errorCode,
      reason,
      orderId: food.orderId,
      orderItemId: food.orderItemId,
      foodId: food.foodId,
    };
  }
}
