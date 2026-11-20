import type { Ingredient, Recipe } from './RecipeTypes.ts';

export const INGREDIENT_CATALOG: ReadonlyMap<string, Ingredient> = new Map(
  (
    [
      { id: 'burger_bun', name: 'Burger bun', unit: 'pc' },
      { id: 'beef_patty', name: 'Beef patty', unit: 'pc' },
      { id: 'cheese', name: 'Cheese', unit: 'slice' },
      { id: 'lettuce', name: 'Lettuce', unit: 'leaf' },
      { id: 'tomato', name: 'Tomato', unit: 'slice' },
      { id: 'sauce', name: 'Sauce', unit: 'tbsp' },
      { id: 'potato', name: 'Potato', unit: 'pc' },
      { id: 'salt', name: 'Salt', unit: 'pinch' },
      { id: 'chicken_nuggets', name: 'Chicken nuggets', unit: 'pack' },
      { id: 'cooking_oil', name: 'Cooking oil', unit: 'cup' },
      { id: 'tea', name: 'Tea', unit: 'bag' },
      { id: 'water', name: 'Water', unit: 'cup' },
      { id: 'ice', name: 'Ice', unit: 'scoop' },
      { id: 'sugar', name: 'Sugar', unit: 'tbsp' },
      { id: 'milk', name: 'Milk', unit: 'cup' },
      { id: 'strawberry', name: 'Strawberry', unit: 'pc' },
      { id: 'chocolate', name: 'Chocolate', unit: 'scoop' },
      { id: 'ice_cream', name: 'Ice cream', unit: 'scoop' },
    ] as const
  ).map((ing) => [ing.id, ing])
);

/**
 * Centralized Recipe Database decoupled from MenuItem UI definitions.
 * Every menu item links via stable `recipeId`.
 */
export const BURGER_CAFE_RECIPES: readonly Recipe[] = [
  {
    recipeId: 'CLASSIC_BURGER_RECIPE',
    name: 'Classic Burger Recipe',
    menuItemId: 'BURGER_CLASSIC',
    ingredients: [
      { ingredientId: 'burger_bun', name: 'Burger bun', quantity: 1, unit: 'pc' },
      { ingredientId: 'beef_patty', name: 'Beef patty', quantity: 1, unit: 'pc' },
      { ingredientId: 'lettuce', name: 'Lettuce', quantity: 1, unit: 'leaf' },
      { ingredientId: 'tomato', name: 'Tomato', quantity: 1, unit: 'slice' },
      { ingredientId: 'sauce', name: 'Sauce', quantity: 1, unit: 'tbsp' },
    ],
    preparationTime: 5,
    cookingSteps: [
      { stepNumber: 1, instruction: 'Sear 1 beef patty on the hot grill until juicy.', station: 'GRILL', durationSeconds: 3 },
      { stepNumber: 2, instruction: 'Assemble patty, crisp lettuce, tomato, and sauce inside toasted bun.', station: 'PREP_COUNTER', durationSeconds: 2 },
    ],
    stationRequirements: ['GRILL', 'PREP_COUNTER'],
    difficulty: 'EASY',
    yield: 1,
    recipeVersion: 1,
  },
  {
    recipeId: 'CHEESE_BURGER_RECIPE',
    name: 'Cheese Burger Recipe',
    menuItemId: 'BURGER_CHEESE',
    ingredients: [
      { ingredientId: 'burger_bun', name: 'Burger bun', quantity: 1, unit: 'pc' },
      { ingredientId: 'beef_patty', name: 'Beef patty', quantity: 1, unit: 'pc' },
      { ingredientId: 'cheese', name: 'Cheese', quantity: 1, unit: 'slice' },
      { ingredientId: 'lettuce', name: 'Lettuce', quantity: 1, unit: 'leaf' },
      { ingredientId: 'sauce', name: 'Sauce', quantity: 1, unit: 'tbsp' },
    ],
    preparationTime: 6,
    cookingSteps: [
      { stepNumber: 1, instruction: 'Grill 1 beef patty and melt 1 slice of golden cheddar on top.', station: 'GRILL', durationSeconds: 4 },
      { stepNumber: 2, instruction: 'Layer cheesy patty with lettuce and sauce on burger bun.', station: 'PREP_COUNTER', durationSeconds: 2 },
    ],
    stationRequirements: ['GRILL', 'PREP_COUNTER'],
    difficulty: 'EASY',
    yield: 1,
    recipeVersion: 1,
  },
  {
    recipeId: 'DOUBLE_BURGER_RECIPE',
    name: 'Double Burger Recipe',
    menuItemId: 'BURGER_DOUBLE',
    ingredients: [
      { ingredientId: 'burger_bun', name: 'Burger bun', quantity: 1, unit: 'pc' },
      { ingredientId: 'beef_patty', name: 'Beef patty', quantity: 2, unit: 'pc' },
      { ingredientId: 'cheese', name: 'Cheese', quantity: 1, unit: 'slice' },
      { ingredientId: 'lettuce', name: 'Lettuce', quantity: 1, unit: 'leaf' },
      { ingredientId: 'sauce', name: 'Sauce', quantity: 1, unit: 'tbsp' },
    ],
    preparationTime: 8,
    cookingSteps: [
      { stepNumber: 1, instruction: 'Grill 2 beef patties thoroughly and melt cheese between layers.', station: 'GRILL', durationSeconds: 5 },
      { stepNumber: 2, instruction: 'Stack double patties with fresh lettuce and signature sauce on bun.', station: 'PREP_COUNTER', durationSeconds: 3 },
    ],
    stationRequirements: ['GRILL', 'PREP_COUNTER'],
    difficulty: 'MEDIUM',
    yield: 1,
    recipeVersion: 1,
  },
  {
    recipeId: 'FRENCH_FRIES_RECIPE',
    name: 'French Fries Recipe',
    menuItemId: 'FRENCH_FRIES',
    ingredients: [
      { ingredientId: 'potato', name: 'Potato', quantity: 2, unit: 'pc' },
      { ingredientId: 'salt', name: 'Salt', quantity: 1, unit: 'pinch' },
    ],
    preparationTime: 4,
    cookingSteps: [
      { stepNumber: 1, instruction: 'Cut 2 potatoes into crisp batons on the prep board.', station: 'PREP_COUNTER', durationSeconds: 1 },
      { stepNumber: 2, instruction: 'Deep-fry until golden crisp and toss lightly with sea salt.', station: 'FRYER', durationSeconds: 3 },
    ],
    stationRequirements: ['PREP_COUNTER', 'FRYER'],
    difficulty: 'EASY',
    yield: 1,
    recipeVersion: 1,
  },
  {
    recipeId: 'CHICKEN_NUGGETS_RECIPE',
    name: 'Chicken Nuggets Recipe',
    menuItemId: 'CHICKEN_NUGGETS',
    ingredients: [
      { ingredientId: 'chicken_nuggets', name: 'Chicken nuggets', quantity: 1, unit: 'pack' },
      { ingredientId: 'cooking_oil', name: 'Cooking oil', quantity: 1, unit: 'cup' },
    ],
    preparationTime: 5,
    cookingSteps: [
      { stepNumber: 1, instruction: 'Heat cooking oil in the fryer basket.', station: 'FRYER', durationSeconds: 2 },
      { stepNumber: 2, instruction: 'Fry chicken nuggets until golden brown and drain cleanly.', station: 'FRYER', durationSeconds: 3 },
    ],
    stationRequirements: ['FRYER'],
    difficulty: 'EASY',
    yield: 1,
    recipeVersion: 1,
  },
  {
    recipeId: 'ICED_TEA_RECIPE',
    name: 'Iced Tea Recipe',
    menuItemId: 'ICED_TEA',
    ingredients: [
      { ingredientId: 'tea', name: 'Tea', quantity: 1, unit: 'bag' },
      { ingredientId: 'water', name: 'Water', quantity: 1, unit: 'cup' },
      { ingredientId: 'ice', name: 'Ice', quantity: 1, unit: 'scoop' },
      { ingredientId: 'sugar', name: 'Sugar', quantity: 1, unit: 'tbsp' },
    ],
    preparationTime: 3,
    cookingSteps: [
      { stepNumber: 1, instruction: 'Steep tea bag in water and dissolve sugar cleanly.', station: 'DRINK_STATION', durationSeconds: 2 },
      { stepNumber: 2, instruction: 'Pour over sparkling ice scoop and stir.', station: 'DRINK_STATION', durationSeconds: 1 },
    ],
    stationRequirements: ['DRINK_STATION'],
    difficulty: 'EASY',
    yield: 1,
    recipeVersion: 1,
  },
  {
    recipeId: 'STRAWBERRY_MILKSHAKE_RECIPE',
    name: 'Strawberry Milkshake Recipe',
    menuItemId: 'STRAWBERRY_MILKSHAKE',
    ingredients: [
      { ingredientId: 'milk', name: 'Milk', quantity: 1, unit: 'cup' },
      { ingredientId: 'strawberry', name: 'Strawberry', quantity: 2, unit: 'pc' },
      { ingredientId: 'ice_cream', name: 'Ice cream', quantity: 1, unit: 'scoop' },
      { ingredientId: 'sugar', name: 'Sugar', quantity: 1, unit: 'tbsp' },
    ],
    preparationTime: 4,
    cookingSteps: [
      { stepNumber: 1, instruction: 'Combine cold milk, 2 fresh strawberries, ice cream, and sugar.', station: 'BLENDER', durationSeconds: 2 },
      { stepNumber: 2, instruction: 'Blend until velvety smooth and pour into chilled glass.', station: 'BLENDER', durationSeconds: 2 },
    ],
    stationRequirements: ['BLENDER'],
    difficulty: 'EASY',
    yield: 1,
    recipeVersion: 1,
  },
  {
    recipeId: 'CHOCOLATE_MILKSHAKE_RECIPE',
    name: 'Chocolate Milkshake Recipe',
    menuItemId: 'CHOCOLATE_MILKSHAKE',
    ingredients: [
      { ingredientId: 'milk', name: 'Milk', quantity: 1, unit: 'cup' },
      { ingredientId: 'chocolate', name: 'Chocolate', quantity: 1, unit: 'scoop' },
      { ingredientId: 'ice_cream', name: 'Ice cream', quantity: 1, unit: 'scoop' },
    ],
    preparationTime: 4,
    cookingSteps: [
      { stepNumber: 1, instruction: 'Add chilled milk, rich chocolate, and ice cream scoop to blender.', station: 'BLENDER', durationSeconds: 2 },
      { stepNumber: 2, instruction: 'Blend until thick and frothy, then serve chilled.', station: 'BLENDER', durationSeconds: 2 },
    ],
    stationRequirements: ['BLENDER'],
    difficulty: 'EASY',
    yield: 1,
    recipeVersion: 1,
  },
] as const;

export const RECIPE_MAP: ReadonlyMap<string, Recipe> = new Map(
  BURGER_CAFE_RECIPES.map((r) => [r.recipeId, r])
);
