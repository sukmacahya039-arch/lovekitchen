import type { DishId } from '../../../shared/types.ts';
import type { MenuCategoryId } from './MenuCategory.ts';

export type MenuDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type MenuItemId =
  | 'BURGER_CLASSIC'
  | 'BURGER_CHEESE'
  | 'BURGER_DOUBLE'
  | 'FRENCH_FRIES'
  | 'CHICKEN_NUGGETS'
  | 'ICED_TEA'
  | 'STRAWBERRY_MILKSHAKE'
  | 'CHOCOLATE_MILKSHAKE';

export interface MenuCustomizationOption {
  id: string;
  label: string;
  priceDelta: number;
}

export interface MenuItem {
  readonly id: MenuItemId;
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly category: MenuCategoryId;
  readonly price: number;
  readonly icon: string;
  readonly spriteRef: string;
  readonly recipeId: string;
  readonly preparationTime: number; // seconds
  readonly difficulty: MenuDifficulty;
  readonly available: boolean;
  readonly unlockLevel: number;
  readonly ingredients: readonly string[];
  readonly tags: readonly string[];
  readonly customerPopularity: number; // 1..100 weight
  readonly allowedCustomizations?: readonly MenuCustomizationOption[];
  /** Maps to Phase 03/05 legacy DishId for seamless compatibility with kitchen pass */
  readonly legacyDishId?: DishId;
}

export interface MenuSystemConfig {
  restaurantLevel: number;
  currencySymbol: string;
  allowUnavailableSelection: boolean;
}

export const DEFAULT_MENU_CONFIG: MenuSystemConfig = {
  restaurantLevel: 1,
  currencySymbol: '$',
  allowUnavailableSelection: false,
};
