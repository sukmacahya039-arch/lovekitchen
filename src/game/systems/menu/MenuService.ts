import type { GameEventBus } from '../events/GameEvents.ts';
import {
  isValidMenuCategory,
  MENU_CATEGORIES,
  type MenuCategoryDefinition,
  type MenuCategoryId,
} from './MenuCategory.ts';
import {
  DEFAULT_MENU_CONFIG,
  type MenuItem,
  type MenuSystemConfig,
} from './MenuConfig.ts';
import { BURGER_CAFE_MENU } from './MenuDatabase.ts';

/**
 * Centralized MenuService providing query, category filtering, availability overrides,
 * unlock-level checks, and menu UI event dispatch.
 */
export class MenuService {
  private items = new Map<string, MenuItem>();
  private availabilityOverrides = new Map<string, boolean>();
  private config: MenuSystemConfig;
  private events?: GameEventBus;

  constructor(
    items: readonly MenuItem[] = BURGER_CAFE_MENU,
    events?: GameEventBus,
    config: Partial<MenuSystemConfig> = {}
  ) {
    this.events = events;
    this.config = { ...DEFAULT_MENU_CONFIG, ...config };
    for (const item of items) {
      if (this.items.has(item.id)) {
        throw new Error(`Duplicate MenuItem ID detected: ${item.id}`);
      }
      this.items.set(item.id, item);
    }
  }

  public getConfig(): MenuSystemConfig {
    return { ...this.config };
  }

  public setRestaurantLevel(level: number): void {
    this.config.restaurantLevel = Math.max(1, Math.floor(level));
  }

  public getCategories(includeUnavailable = true): MenuCategoryDefinition[] {
    const list = includeUnavailable
      ? [...MENU_CATEGORIES]
      : MENU_CATEGORIES.filter((c) => c.available);
    return list.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public getAllItems(): MenuItem[] {
    return Array.from(this.items.values()).map((item) => this.withResolvedAvailability(item));
  }

  public getAvailableItems(): MenuItem[] {
    return this.getAllItems().filter((item) => item.available);
  }

  public getItemsByCategory(category: MenuCategoryId | 'ALL', onlyAvailable = false): MenuItem[] {
    if (category === 'ALL') {
      return onlyAvailable ? this.getAvailableItems() : this.getAllItems();
    }
    if (!isValidMenuCategory(category)) {
      return [];
    }
    return this.getAllItems().filter(
      (item) => item.category === category && (!onlyAvailable || item.available)
    );
  }

  public getItemById(menuItemId: string): MenuItem | null {
    const raw = this.items.get(menuItemId);
    if (!raw) return null;
    return this.withResolvedAvailability(raw);
  }

  public isItemAvailable(menuItemId: string): boolean {
    const item = this.getItemById(menuItemId);
    if (!item) return false;
    return item.available && item.unlockLevel <= this.config.restaurantLevel;
  }

  public setItemAvailability(menuItemId: string, available: boolean): boolean {
    if (!this.items.has(menuItemId)) return false;
    this.availabilityOverrides.set(menuItemId, available);
    return true;
  }

  public clearAvailabilityOverrides(): void {
    this.availabilityOverrides.clear();
  }

  /**
   * Picks a realistic suggested menu item weighted by customerPopularity.
   */
  public pickPopularItem(category?: MenuCategoryId): MenuItem | null {
    const pool = category
      ? this.getItemsByCategory(category, true)
      : this.getAvailableItems();
    if (pool.length === 0) return null;
    const totalWeight = pool.reduce((sum, item) => sum + Math.max(1, item.customerPopularity), 0);
    let r = Math.random() * totalWeight;
    for (const item of pool) {
      r -= Math.max(1, item.customerPopularity);
      if (r <= 0) return item;
    }
    return pool[0];
  }

  public notifyMenuOpened(tableId: string, waiterId: string, nowMs = Date.now()): void {
    this.events?.emit('MENU_OPENED', { tableId, waiterId }, nowMs);
  }

  public notifyMenuClosed(tableId: string, waiterId: string, nowMs = Date.now()): void {
    this.events?.emit('MENU_CLOSED', { tableId, waiterId }, nowMs);
  }

  public notifyMenuItemSelected(menuItemId: string, nowMs = Date.now()): boolean {
    const item = this.getItemById(menuItemId);
    if (!item) return false;
    this.events?.emit('MENU_ITEM_SELECTED', { menuItemId: item.id, category: item.category }, nowMs);
    return true;
  }

  private withResolvedAvailability(item: MenuItem): MenuItem {
    const override = this.availabilityOverrides.get(item.id);
    const unlocked = item.unlockLevel <= this.config.restaurantLevel;
    const effectiveAvailable = (override !== undefined ? override : item.available) && unlocked;
    if (effectiveAvailable === item.available) {
      return item;
    }
    return { ...item, available: effectiveAvailable };
  }
}
