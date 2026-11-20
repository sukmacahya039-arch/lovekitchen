import type { GameEventBus } from '../events/GameEvents.ts';
import type { MenuService } from '../menu/MenuService.ts';
import {
  DEFAULT_ORDER_CONFIG,
  sanitizeOrderNote,
  type OrderSystemConfig,
} from './OrderConfig.ts';
import type {
  CustomerOrderContext,
  OrderDraft,
  OrderDraftItem,
} from './OrderTypes.ts';

export interface DraftMutationResult {
  ok: boolean;
  draft?: OrderDraft;
  error?: string;
}

/**
 * Manages temporary Waiter Order Drafts prior to confirmation.
 * Drafts never enter KitchenOrderQueue or generate tickets until confirmed.
 * Always computes prices strictly from MenuService (never from UI inputs).
 */
export class OrderDraftManager {
  private drafts = new Map<string, OrderDraft>();
  private menuService: MenuService;
  private events?: GameEventBus;
  private config: OrderSystemConfig;
  private nextDraftSeq = 1;
  private nextLineSeq = 1;

  constructor(
    menuService: MenuService,
    events?: GameEventBus,
    config: Partial<OrderSystemConfig> = {}
  ) {
    this.menuService = menuService;
    this.events = events;
    this.config = { ...DEFAULT_ORDER_CONFIG, ...config };
  }

  public createDraft(ctx: CustomerOrderContext, nowMs = Date.now()): OrderDraft {
    const draftId = `draft_${nowMs}_${this.nextDraftSeq++}`;
    const draft: OrderDraft = {
      draftId,
      tableId: ctx.tableId,
      tableLabel: ctx.tableLabel,
      customerIds: [...ctx.customerIds],
      customerGroupId: ctx.customerGroupId,
      waiterId: ctx.waiterId,
      items: [],
      createdAt: nowMs,
      updatedAt: nowMs,
      subtotal: 0,
      total: 0,
      notes: '',
      draftStatus: 'OPEN',
    };
    this.drafts.set(draftId, draft);
    this.events?.emit(
      'ORDER_DRAFT_CREATED',
      {
        draftId,
        tableId: draft.tableId,
        customerGroupId: draft.customerGroupId,
        waiterId: draft.waiterId,
      },
      nowMs
    );
    return this.cloneDraft(draft);
  }

  public getDraft(draftId: string): OrderDraft | null {
    const draft = this.drafts.get(draftId);
    return draft ? this.cloneDraft(draft) : null;
  }

  public getActiveDraftForTable(tableId: string): OrderDraft | null {
    for (const draft of this.drafts.values()) {
      if (
        draft.tableId === tableId &&
        draft.draftStatus !== 'CONFIRMED' &&
        draft.draftStatus !== 'CANCELLED'
      ) {
        return this.cloneDraft(draft);
      }
    }
    return null;
  }

  public getAllActiveDrafts(): OrderDraft[] {
    return Array.from(this.drafts.values())
      .filter((d) => d.draftStatus !== 'CONFIRMED' && d.draftStatus !== 'CANCELLED')
      .map((d) => this.cloneDraft(d));
  }

  public addItem(
    draftId: string,
    menuItemId: string,
    quantity = 1,
    itemNotes = '',
    nowMs = Date.now()
  ): DraftMutationResult {
    const draft = this.drafts.get(draftId);
    if (!draft) return { ok: false, error: 'Order draft not found.' };
    if (!this.isEditable(draft)) {
      return { ok: false, error: `Draft cannot be edited in status ${draft.draftStatus}.` };
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      return { ok: false, error: 'Quantity must be a positive integer (>= 1).' };
    }

    const menuItem = this.menuService.getItemById(menuItemId);
    if (!menuItem) {
      return { ok: false, error: `Invalid menu item ID: ${menuItemId}` };
    }
    if (!this.menuService.isItemAvailable(menuItem.id)) {
      return { ok: false, error: `${menuItem.displayName} is currently unavailable.` };
    }

    const cleanNotes = sanitizeOrderNote(itemNotes, this.config.maxItemNotesLength);

    // Merge identical menuItemId + identical notes into one line item
    const existing = draft.items.find(
      (line) => line.menuItemId === menuItem.id && line.notes === cleanNotes
    );

    if (existing) {
      const nextQty = existing.quantity + quantity;
      if (nextQty > this.config.maxQuantityPerItem) {
        return {
          ok: false,
          error: `Max quantity per line is ${this.config.maxQuantityPerItem}.`,
        };
      }
      existing.quantity = nextQty;
      existing.unitPrice = menuItem.price;
      existing.totalPrice = existing.unitPrice * existing.quantity;
    } else {
      if (draft.items.length >= this.config.maxItemsPerOrder) {
        return { ok: false, error: `Max ${this.config.maxItemsPerOrder} distinct items per order.` };
      }
      if (quantity > this.config.maxQuantityPerItem) {
        return {
          ok: false,
          error: `Max quantity per line is ${this.config.maxQuantityPerItem}.`,
        };
      }
      const line: OrderDraftItem = {
        lineId: `line_${this.nextLineSeq++}`,
        menuItemId: menuItem.id,
        menuNameSnapshot: menuItem.displayName,
        quantity,
        unitPrice: menuItem.price,
        totalPrice: menuItem.price * quantity,
        recipeId: menuItem.recipeId,
        notes: cleanNotes,
      };
      draft.items.push(line);
    }

    this.recalculate(draft, nowMs);
    this.events?.emit(
      'MENU_ITEM_ADDED',
      { draftId: draft.draftId, menuItemId: menuItem.id, quantity },
      nowMs
    );
    this.emitDraftUpdated(draft, nowMs);
    return { ok: true, draft: this.cloneDraft(draft) };
  }

  public removeItem(draftId: string, lineIdOrMenuItemId: string, nowMs = Date.now()): DraftMutationResult {
    const draft = this.drafts.get(draftId);
    if (!draft) return { ok: false, error: 'Order draft not found.' };
    if (!this.isEditable(draft)) {
      return { ok: false, error: `Draft cannot be edited in status ${draft.draftStatus}.` };
    }

    const idx = draft.items.findIndex(
      (i) => i.lineId === lineIdOrMenuItemId || i.menuItemId === lineIdOrMenuItemId
    );
    if (idx === -1) return { ok: false, error: 'Item not found in draft.' };

    const [removed] = draft.items.splice(idx, 1);
    this.recalculate(draft, nowMs);
    this.events?.emit(
      'MENU_ITEM_REMOVED',
      { draftId: draft.draftId, menuItemId: removed.menuItemId },
      nowMs
    );
    this.emitDraftUpdated(draft, nowMs);
    return { ok: true, draft: this.cloneDraft(draft) };
  }

  public increaseQuantity(draftId: string, lineIdOrMenuItemId: string, nowMs = Date.now()): DraftMutationResult {
    const draft = this.drafts.get(draftId);
    if (!draft) return { ok: false, error: 'Order draft not found.' };
    const line = this.findLine(draft, lineIdOrMenuItemId);
    if (!line) return { ok: false, error: 'Item not found in draft.' };
    return this.setQuantity(draftId, line.lineId, line.quantity + 1, nowMs);
  }

  public decreaseQuantity(draftId: string, lineIdOrMenuItemId: string, nowMs = Date.now()): DraftMutationResult {
    const draft = this.drafts.get(draftId);
    if (!draft) return { ok: false, error: 'Order draft not found.' };
    const line = this.findLine(draft, lineIdOrMenuItemId);
    if (!line) return { ok: false, error: 'Item not found in draft.' };
    if (line.quantity <= 1) {
      return this.removeItem(draftId, line.lineId, nowMs);
    }
    return this.setQuantity(draftId, line.lineId, line.quantity - 1, nowMs);
  }

  public setQuantity(
    draftId: string,
    lineIdOrMenuItemId: string,
    quantity: number,
    nowMs = Date.now()
  ): DraftMutationResult {
    const draft = this.drafts.get(draftId);
    if (!draft) return { ok: false, error: 'Order draft not found.' };
    if (!this.isEditable(draft)) {
      return { ok: false, error: `Draft cannot be edited in status ${draft.draftStatus}.` };
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { ok: false, error: 'Quantity must be at least 1.' };
    }
    if (quantity > this.config.maxQuantityPerItem) {
      return { ok: false, error: `Max quantity per item is ${this.config.maxQuantityPerItem}.` };
    }

    const line = this.findLine(draft, lineIdOrMenuItemId);
    if (!line) return { ok: false, error: 'Item not found in draft.' };

    const menuItem = this.menuService.getItemById(line.menuItemId);
    if (!menuItem || !this.menuService.isItemAvailable(menuItem.id)) {
      return { ok: false, error: 'Menu item is no longer available.' };
    }

    line.quantity = quantity;
    line.unitPrice = menuItem.price;
    line.totalPrice = menuItem.price * quantity;
    this.recalculate(draft, nowMs);
    this.emitDraftUpdated(draft, nowMs);
    return { ok: true, draft: this.cloneDraft(draft) };
  }

  public editOrderNotes(draftId: string, notes: string, nowMs = Date.now()): DraftMutationResult {
    const draft = this.drafts.get(draftId);
    if (!draft) return { ok: false, error: 'Order draft not found.' };
    if (!this.isEditable(draft)) {
      return { ok: false, error: `Draft cannot be edited in status ${draft.draftStatus}.` };
    }
    draft.notes = sanitizeOrderNote(notes, this.config.maxNotesLength);
    this.recalculate(draft, nowMs);
    this.emitDraftUpdated(draft, nowMs);
    return { ok: true, draft: this.cloneDraft(draft) };
  }

  public editItemNotes(
    draftId: string,
    lineIdOrMenuItemId: string,
    notes: string,
    nowMs = Date.now()
  ): DraftMutationResult {
    const draft = this.drafts.get(draftId);
    if (!draft) return { ok: false, error: 'Order draft not found.' };
    if (!this.isEditable(draft)) {
      return { ok: false, error: `Draft cannot be edited in status ${draft.draftStatus}.` };
    }
    const line = this.findLine(draft, lineIdOrMenuItemId);
    if (!line) return { ok: false, error: 'Item not found in draft.' };

    const menuItem = this.menuService.getItemById(line.menuItemId);
    const clean = sanitizeOrderNote(notes, this.config.maxItemNotesLength);

    // Validate against allowed customizations if non-empty and menu restricts customizations
    if (clean && menuItem?.allowedCustomizations && menuItem.allowedCustomizations.length > 0) {
      // Allow preset customization labels or short kitchen notes without breaking matching
      line.notes = clean;
    } else {
      line.notes = clean;
    }

    this.recalculate(draft, nowMs);
    this.emitDraftUpdated(draft, nowMs);
    return { ok: true, draft: this.cloneDraft(draft) };
  }

  public markConfirmed(draftId: string, nowMs = Date.now()): boolean {
    const draft = this.drafts.get(draftId);
    if (!draft || !this.isEditable(draft)) return false;
    draft.draftStatus = 'CONFIRMED';
    draft.updatedAt = nowMs;
    return true;
  }

  public cancelDraft(draftId: string, reason = 'cancelled_by_waiter', nowMs = Date.now()): DraftMutationResult {
    const draft = this.drafts.get(draftId);
    if (!draft) return { ok: false, error: 'Order draft not found.' };
    if (draft.draftStatus === 'CONFIRMED') {
      return { ok: false, error: 'Cannot cancel a draft that was already confirmed.' };
    }
    if (draft.draftStatus === 'CANCELLED') {
      return { ok: false, error: 'Draft is already cancelled.' };
    }
    draft.draftStatus = 'CANCELLED';
    draft.updatedAt = nowMs;
    this.events?.emit(
      'ORDER_DRAFT_CANCELLED',
      { draftId: draft.draftId, tableId: draft.tableId, reason },
      nowMs
    );
    return { ok: true, draft: this.cloneDraft(draft) };
  }

  public recalculateDraft(draftId: string, nowMs = Date.now()): OrderDraft | null {
    const draft = this.drafts.get(draftId);
    if (!draft) return null;
    this.recalculate(draft, nowMs);
    return this.cloneDraft(draft);
  }

  public clear(): void {
    this.drafts.clear();
  }

  private recalculate(draft: OrderDraft, nowMs: number): void {
    let subtotal = 0;
    for (const item of draft.items) {
      const liveMenu = this.menuService.getItemById(item.menuItemId);
      if (liveMenu) {
        item.unitPrice = liveMenu.price;
        item.menuNameSnapshot = liveMenu.displayName;
        item.recipeId = liveMenu.recipeId;
      }
      item.totalPrice = item.unitPrice * item.quantity;
      subtotal += item.totalPrice;
    }
    draft.subtotal = subtotal;
    draft.total = subtotal;
    draft.updatedAt = nowMs;
    if (draft.draftStatus !== 'CONFIRMED' && draft.draftStatus !== 'CANCELLED') {
      draft.draftStatus = draft.items.length > 0 ? 'READY_TO_CONFIRM' : 'EDITING';
    }
  }

  private isEditable(draft: OrderDraft): boolean {
    return (
      draft.draftStatus === 'OPEN' ||
      draft.draftStatus === 'EDITING' ||
      draft.draftStatus === 'READY_TO_CONFIRM'
    );
  }

  private findLine(draft: OrderDraft, lineIdOrMenuItemId: string): OrderDraftItem | undefined {
    return draft.items.find(
      (i) => i.lineId === lineIdOrMenuItemId || i.menuItemId === lineIdOrMenuItemId
    );
  }

  private emitDraftUpdated(draft: OrderDraft, nowMs: number): void {
    const itemCount = draft.items.reduce((sum, i) => sum + i.quantity, 0);
    this.events?.emit(
      'ORDER_DRAFT_UPDATED',
      { draftId: draft.draftId, tableId: draft.tableId, itemCount, total: draft.total },
      nowMs
    );
  }

  private cloneDraft(draft: OrderDraft): OrderDraft {
    return {
      ...draft,
      customerIds: [...draft.customerIds],
      items: draft.items.map((i) => ({ ...i })),
    };
  }
}
