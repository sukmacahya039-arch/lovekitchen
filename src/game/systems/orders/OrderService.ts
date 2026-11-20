import type { CustomerManager } from '../customer/CustomerManager.ts';
import type { GameEventBus } from '../events/GameEvents.ts';
import type { MenuService } from '../menu/MenuService.ts';
import type { RecipeService } from '../recipe/RecipeService.ts';
import type { TableManager } from '../table/TableManager.ts';
import { DEFAULT_ORDER_CONFIG, type OrderSystemConfig } from './OrderConfig.ts';
import { OrderDraftManager, type DraftMutationResult } from './OrderDraft.ts';
import { OrderManager } from './OrderManager.ts';
import { OrderMatchingService } from './OrderMatchingService.ts';
import type {
  CustomerOrderContext,
  Order,
  OrderDraft,
  OrderDraftSubmissionItem,
  OrderItemStatus,
  OrderMatchingResult,
  OrderPriority,
  OrderStatus,
  OrderSystemSnapshot,
  OrderValidationResult,
  SimulatedFoodItem,
} from './OrderTypes.ts';
import { OrderValidator } from './OrderValidator.ts';

export interface ConfirmOrderResult {
  ok: boolean;
  order?: Order;
  validation: OrderValidationResult;
}

/**
 * Facade OrderService unifying OrderDraftManager, OrderValidator, OrderManager,
 * KitchenOrderQueue, and OrderMatchingService.
 * Single centralized entry point suitable for both local session and server-authoritative multiplayer.
 */
export class OrderService {
  public readonly menuService: MenuService;
  public readonly recipeService: RecipeService;
  public readonly drafts: OrderDraftManager;
  public readonly validator: OrderValidator;
  public readonly manager: OrderManager;
  public readonly matching: OrderMatchingService;
  public readonly events?: GameEventBus;

  constructor(options: {
    sessionId?: string;
    menuService: MenuService;
    recipeService: RecipeService;
    events?: GameEventBus;
    tableManager?: TableManager;
    customerManager?: CustomerManager;
    config?: Partial<OrderSystemConfig>;
  }) {
    const cfg = { ...DEFAULT_ORDER_CONFIG, ...(options.config ?? {}) };
    this.menuService = options.menuService;
    this.recipeService = options.recipeService;
    this.events = options.events;

    this.drafts = new OrderDraftManager(this.menuService, this.events, cfg);
    this.validator = new OrderValidator(
      this.menuService,
      this.recipeService,
      {
        tableManager: options.tableManager,
        customerManager: options.customerManager,
      },
      cfg
    );
    this.manager = new OrderManager(options.sessionId, this.events, cfg);
    this.matching = new OrderMatchingService(this.manager, this.events);
  }

  // --- Draft Operations ---

  public createDraft(ctx: CustomerOrderContext, nowMs = Date.now()): OrderDraft {
    return this.drafts.createDraft(ctx, nowMs);
  }

  public addItemToDraft(
    draftId: string,
    menuItemId: string,
    quantity = 1,
    itemNotes = '',
    nowMs = Date.now()
  ): DraftMutationResult {
    return this.drafts.addItem(draftId, menuItemId, quantity, itemNotes, nowMs);
  }

  public removeItemFromDraft(
    draftId: string,
    lineIdOrMenuItemId: string,
    nowMs = Date.now()
  ): DraftMutationResult {
    return this.drafts.removeItem(draftId, lineIdOrMenuItemId, nowMs);
  }

  public increaseDraftItemQuantity(
    draftId: string,
    lineIdOrMenuItemId: string,
    nowMs = Date.now()
  ): DraftMutationResult {
    return this.drafts.increaseQuantity(draftId, lineIdOrMenuItemId, nowMs);
  }

  public decreaseDraftItemQuantity(
    draftId: string,
    lineIdOrMenuItemId: string,
    nowMs = Date.now()
  ): DraftMutationResult {
    return this.drafts.decreaseQuantity(draftId, lineIdOrMenuItemId, nowMs);
  }

  public setDraftItemQuantity(
    draftId: string,
    lineIdOrMenuItemId: string,
    quantity: number,
    nowMs = Date.now()
  ): DraftMutationResult {
    return this.drafts.setQuantity(draftId, lineIdOrMenuItemId, quantity, nowMs);
  }

  public editDraftNotes(draftId: string, notes: string, nowMs = Date.now()): DraftMutationResult {
    return this.drafts.editOrderNotes(draftId, notes, nowMs);
  }

  public editDraftItemNotes(
    draftId: string,
    lineIdOrMenuItemId: string,
    notes: string,
    nowMs = Date.now()
  ): DraftMutationResult {
    return this.drafts.editItemNotes(draftId, lineIdOrMenuItemId, notes, nowMs);
  }

  public cancelDraft(draftId: string, reason?: string, nowMs = Date.now()): DraftMutationResult {
    return this.drafts.cancelDraft(draftId, reason, nowMs);
  }

  // --- Validation & Confirmation ---

  public validateDraft(draftId: string, nowMs = Date.now()): OrderValidationResult {
    const draft = this.drafts.getDraft(draftId);
    const result = this.validator.validateDraft(draft);
    if (draft) {
      this.events?.emit(
        'ORDER_VALIDATED',
        {
          draftId: draft.draftId,
          tableId: draft.tableId,
          valid: result.valid,
          errors: result.errors,
        },
        nowMs
      );
    }
    return result;
  }

  public confirmDraft(
    draftId: string,
    priority: OrderPriority = 'NORMAL',
    nowMs = Date.now()
  ): ConfirmOrderResult {
    // Reprice from authoritative MenuDatabase before validating
    this.drafts.recalculateDraft(draftId, nowMs);
    const validation = this.validateDraft(draftId, nowMs);
    if (!validation.valid) {
      return { ok: false, validation };
    }

    const draft = this.drafts.getDraft(draftId);
    if (!draft) {
      return {
        ok: false,
        validation: { valid: false, errors: ['Draft disappeared during confirmation.'] },
      };
    }

    if (!this.drafts.markConfirmed(draftId, nowMs)) {
      return {
        ok: false,
        validation: {
          valid: false,
          errors: ['Draft was already confirmed or cancelled.'],
          code: 'DUPLICATE_CONFIRMATION',
        },
      };
    }

    const order = this.manager.createAndQueueFromDraft(draft, priority, nowMs);
    return { ok: true, order, validation };
  }

  /**
   * Authoritative one-shot submission helper used by Socket.IO server when Waiter confirms
   * their client-side Order Draft payload. Server rebuilds & validates the draft strictly
   * from MenuDatabase, RecipeDatabase, and TableManager (never trusting client prices).
   */
  public submitValidatedOrder(
    ctx: CustomerOrderContext,
    items: OrderDraftSubmissionItem[],
    orderNotes = '',
    priority: OrderPriority = 'NORMAL',
    nowMs = Date.now()
  ): ConfirmOrderResult {
    const draft = this.createDraft(ctx, nowMs);
    const itemErrors: string[] = [];

    for (const raw of items) {
      const added = this.addItemToDraft(draft.draftId, raw.menuItemId, raw.quantity, raw.notes ?? '', nowMs);
      if (!added.ok && added.error) {
        itemErrors.push(added.error);
      }
    }

    if (orderNotes) {
      this.editDraftNotes(draft.draftId, orderNotes, nowMs);
    }

    if (itemErrors.length > 0) {
      this.cancelDraft(draft.draftId, 'submission_invalid_items', nowMs);
      return {
        ok: false,
        validation: { valid: false, errors: itemErrors, code: 'INVALID_ITEMS' },
      };
    }

    const res = this.confirmDraft(draft.draftId, priority, nowMs);
    if (!res.ok) {
      this.cancelDraft(draft.draftId, 'submission_validation_failed', nowMs);
    }
    return res;
  }

  // --- Chef Queue & Order Lifecycle ---

  public acceptOrder(orderId: string, chefId: string, nowMs = Date.now()) {
    return this.manager.acceptOrder(orderId, chefId, nowMs);
  }

  public cancelOrder(orderId: string, reason = 'cancelled', nowMs = Date.now()) {
    return this.manager.cancelOrder(orderId, reason, nowMs);
  }

  public transitionOrderStatus(orderId: string, nextStatus: OrderStatus, nowMs = Date.now()) {
    return this.manager.transitionOrderStatus(orderId, nextStatus, nowMs);
  }

  public transitionOrderItemStatus(
    orderId: string,
    itemId: string,
    nextStatus: OrderItemStatus,
    nowMs = Date.now()
  ) {
    return this.manager.transitionOrderItemStatus(orderId, itemId, nextStatus, nowMs);
  }

  // --- Order Matching ---

  public matchFoodToOrder(food: SimulatedFoodItem, nowMs = Date.now()): OrderMatchingResult {
    return this.matching.matchFoodToOrder(food, nowMs);
  }

  public getSnapshot(): OrderSystemSnapshot {
    return this.manager.getSnapshot();
  }
}
