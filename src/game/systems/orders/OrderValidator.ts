import type { CustomerManager } from '../customer/CustomerManager.ts';
import type { MenuService } from '../menu/MenuService.ts';
import type { RecipeService } from '../recipe/RecipeService.ts';
import type { TableManager } from '../table/TableManager.ts';
import { DEFAULT_ORDER_CONFIG, type OrderSystemConfig } from './OrderConfig.ts';
import type { OrderDraft, OrderValidationResult } from './OrderTypes.ts';

export interface TableOrderValidationHooks {
  tableManager?: TableManager;
  customerManager?: CustomerManager;
}

/**
 * Validates OrderDrafts against MenuService, RecipeService, and Phase 05 TableManager/CustomerManager.
 * Prevents empty orders, invalid menu/recipe IDs, negative quantities, dirty/unoccupied tables,
 * leaving customers, or duplicate confirmations.
 */
export class OrderValidator {
  private menuService: MenuService;
  private recipeService: RecipeService;
  private hooks: TableOrderValidationHooks;
  private config: OrderSystemConfig;

  constructor(
    menuService: MenuService,
    recipeService: RecipeService,
    hooks: TableOrderValidationHooks = {},
    config: Partial<OrderSystemConfig> = {}
  ) {
    this.menuService = menuService;
    this.recipeService = recipeService;
    this.hooks = hooks;
    this.config = { ...DEFAULT_ORDER_CONFIG, ...config };
  }

  public validateDraft(draft: OrderDraft | null): OrderValidationResult {
    if (!draft) {
      return { valid: false, errors: ['Order draft does not exist.'], code: 'DRAFT_NOT_FOUND' };
    }

    const errors: string[] = [];

    if (draft.draftStatus === 'CONFIRMED') {
      return {
        valid: false,
        errors: ['This order draft has already been confirmed.'],
        code: 'DUPLICATE_CONFIRMATION',
      };
    }

    if (draft.draftStatus === 'CANCELLED') {
      return {
        valid: false,
        errors: ['This order draft has been cancelled.'],
        code: 'DRAFT_CANCELLED',
      };
    }

    if (!draft.tableId || draft.tableId.trim().length === 0) {
      errors.push('Invalid table ID.');
    }

    if (!draft.waiterId || draft.waiterId.trim().length === 0) {
      errors.push('Waiter identity is required to take an order.');
    }

    if (!draft.customerGroupId && draft.customerIds.length === 0) {
      errors.push('Order must be associated with at least one customer or group.');
    }

    if (!draft.items || draft.items.length === 0) {
      errors.push('Order cannot be empty. Add at least one menu item.');
    }

    if (draft.notes.length > this.config.maxNotesLength) {
      errors.push(`Order notes exceed ${this.config.maxNotesLength} characters.`);
    }

    // Validate every line item against MenuDatabase & RecipeDatabase
    for (const item of draft.items) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        errors.push(`Invalid quantity (${item.quantity}) for ${item.menuItemId}.`);
      } else if (item.quantity > this.config.maxQuantityPerItem) {
        errors.push(`Quantity exceeds max (${this.config.maxQuantityPerItem}) for ${item.menuItemId}.`);
      }

      const menu = this.menuService.getItemById(item.menuItemId);
      if (!menu) {
        errors.push(`Menu item does not exist: ${item.menuItemId}.`);
        continue;
      }

      if (!this.menuService.isItemAvailable(menu.id)) {
        errors.push(`Menu item is unavailable: ${menu.displayName}.`);
      }

      const recipe = this.recipeService.getRecipeById(menu.recipeId);
      if (!recipe) {
        errors.push(`Missing recipe "${menu.recipeId}" for ${menu.displayName}.`);
      } else {
        const integrity = this.recipeService.validateRecipe(recipe.recipeId);
        if (!integrity.valid) {
          errors.push(...integrity.errors);
        }
      }

      if (item.notes.length > this.config.maxItemNotesLength) {
        errors.push(`Line note too long on ${menu.displayName}.`);
      }
    }

    // Validate against Phase 05 TableManager & CustomerManager if connected
    if (this.hooks.tableManager) {
      const table = this.hooks.tableManager.getTable(draft.tableId);
      if (!table) {
        errors.push(`Table "${draft.tableId}" does not exist.`);
      } else {
        const status = table.getStatus();
        if (status === 'DIRTY') {
          errors.push(`Table ${table.config.label} is dirty and must be cleaned first.`);
        } else if (status === 'CLEANING') {
          errors.push(`Table ${table.config.label} is currently being cleaned.`);
        } else if (status === 'DISABLED') {
          errors.push(`Table ${table.config.label} is disabled.`);
        } else if (status === 'AVAILABLE' || status === 'RESERVED') {
          errors.push(`Table ${table.config.label} has no seated customers yet.`);
        }

        const assignedGroup = table.getAssignedGroupId();
        if (table.getOccupancy() <= 0 || !assignedGroup) {
          errors.push(`Table ${table.config.label} is no longer occupied.`);
        } else if (draft.customerGroupId && assignedGroup !== draft.customerGroupId) {
          errors.push(`Draft customer group does not match Table ${table.config.label}.`);
        }

        // Verify customers at this table are not already leaving/angry/terminal
        if (this.hooks.customerManager && assignedGroup) {
          const group = this.hooks.customerManager.groups.getGroup(assignedGroup);
          if (!group || group.memberIds.length === 0) {
            errors.push(`Customer group ${assignedGroup} is no longer present.`);
          } else {
            const anyActiveSeated = group.memberIds.some((cid) => {
              const c = this.hooks.customerManager!.getCustomer(cid);
              if (!c) return false;
              const s = c.getState();
              return (
                !c.isAngry &&
                !c.fsm.isTerminal() &&
                s !== 'LEAVING_TABLE' &&
                s !== 'WALKING_TO_EXIT' &&
                s !== 'EXITING'
              );
            });
            if (!anyActiveSeated) {
              errors.push(`Customers at Table ${table.config.label} are already leaving.`);
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      code: errors.length === 0 ? undefined : 'VALIDATION_FAILED',
    };
  }
}
