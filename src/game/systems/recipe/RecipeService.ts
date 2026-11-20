import type { MenuService } from '../menu/MenuService.ts';
import { BURGER_CAFE_RECIPES, INGREDIENT_CATALOG } from './RecipeDatabase.ts';
import type { Recipe, RecipePreviewData } from './RecipeTypes.ts';

export interface RecipeIntegrityResult {
  valid: boolean;
  errors: string[];
}

/**
 * Centralized RecipeService managing recipe lookups, ingredient integrity validation,
 * and structured RecipePreviewData assembly for Chef UI.
 */
export class RecipeService {
  private recipesById = new Map<string, Recipe>();
  private recipesByMenuItemId = new Map<string, Recipe>();

  constructor(recipes: readonly Recipe[] = BURGER_CAFE_RECIPES) {
    for (const recipe of recipes) {
      if (this.recipesById.has(recipe.recipeId)) {
        throw new Error(`Duplicate recipeId detected: ${recipe.recipeId}`);
      }
      this.recipesById.set(recipe.recipeId, recipe);
      this.recipesByMenuItemId.set(recipe.menuItemId, recipe);
    }
  }

  public getAllRecipes(): Recipe[] {
    return Array.from(this.recipesById.values());
  }

  public getRecipeById(recipeId: string): Recipe | null {
    return this.recipesById.get(recipeId) ?? null;
  }

  public getRecipeForMenuItem(menuItemId: string): Recipe | null {
    return this.recipesByMenuItemId.get(menuItemId) ?? null;
  }

  public validateRecipe(recipeId: string): RecipeIntegrityResult {
    const recipe = this.getRecipeById(recipeId);
    if (!recipe) {
      return { valid: false, errors: [`Recipe not found: ${recipeId}`] };
    }

    const errors: string[] = [];
    if (!recipe.ingredients || recipe.ingredients.length === 0) {
      errors.push(`Recipe ${recipeId} has no ingredients.`);
    }
    for (const ing of recipe.ingredients) {
      if (!INGREDIENT_CATALOG.has(ing.ingredientId)) {
        errors.push(`Unknown ingredient "${ing.ingredientId}" in recipe ${recipeId}.`);
      }
      if (!Number.isFinite(ing.quantity) || ing.quantity <= 0) {
        errors.push(`Invalid quantity for ingredient "${ing.ingredientId}" in recipe ${recipeId}.`);
      }
    }
    if (!recipe.cookingSteps || recipe.cookingSteps.length === 0) {
      errors.push(`Recipe ${recipeId} has no cooking steps.`);
    }
    if (!recipe.stationRequirements || recipe.stationRequirements.length === 0) {
      errors.push(`Recipe ${recipeId} has no station requirements.`);
    }
    if (!Number.isFinite(recipe.preparationTime) || recipe.preparationTime <= 0) {
      errors.push(`Invalid preparationTime in recipe ${recipeId}.`);
    }

    return { valid: errors.length === 0, errors };
  }

  public getRecipePreview(recipeId: string, menuService: MenuService): RecipePreviewData | null {
    const recipe = this.getRecipeById(recipeId);
    if (!recipe) return null;
    const menuItem = menuService.getItemById(recipe.menuItemId);
    if (!menuItem) return null;

    return {
      recipeId: recipe.recipeId,
      name: recipe.name,
      menuItemId: recipe.menuItemId,
      menuDisplayName: menuItem.displayName,
      menuIcon: menuItem.icon,
      price: menuItem.price,
      preparationTime: recipe.preparationTime,
      difficulty: recipe.difficulty,
      yield: recipe.yield,
      recipeVersion: recipe.recipeVersion,
      stationRequirements: [...recipe.stationRequirements],
      ingredients: recipe.ingredients.map((i) => ({ ...i })),
      cookingSteps: recipe.cookingSteps.map((s) => ({ ...s })),
    };
  }
}
