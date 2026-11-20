import type { MenuDifficulty, MenuItemId } from '../menu/MenuConfig.ts';

export type RecipeStationType =
  | 'GRILL'
  | 'FRYER'
  | 'PREP_COUNTER'
  | 'DRINK_STATION'
  | 'BLENDER';

export interface Ingredient {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
}

export interface RecipeIngredient {
  readonly ingredientId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unit: string;
}

export interface RecipeCookingStep {
  readonly stepNumber: number;
  readonly instruction: string;
  readonly station: RecipeStationType;
  readonly durationSeconds: number;
}

export interface Recipe {
  readonly recipeId: string;
  readonly name: string;
  readonly menuItemId: MenuItemId;
  readonly ingredients: readonly RecipeIngredient[];
  readonly preparationTime: number; // seconds
  readonly cookingSteps: readonly RecipeCookingStep[];
  readonly stationRequirements: readonly RecipeStationType[];
  readonly difficulty: MenuDifficulty;
  readonly yield: number;
  readonly recipeVersion: number;
}

export interface RecipePreviewData {
  recipeId: string;
  name: string;
  menuItemId: MenuItemId;
  menuDisplayName: string;
  menuIcon: string;
  price: number;
  preparationTime: number;
  difficulty: MenuDifficulty;
  yield: number;
  recipeVersion: number;
  stationRequirements: RecipeStationType[];
  ingredients: RecipeIngredient[];
  cookingSteps: RecipeCookingStep[];
}
