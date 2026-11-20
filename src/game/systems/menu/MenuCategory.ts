export type MenuCategoryId = 'BURGERS' | 'SIDES' | 'DRINKS' | 'DESSERTS' | 'SPECIALS';

export interface MenuCategoryDefinition {
  id: MenuCategoryId;
  displayName: string;
  shortLabel: string;
  description: string;
  sortOrder: number;
  accentHex: string;
  available: boolean;
}

export const MENU_CATEGORIES: readonly MenuCategoryDefinition[] = [
  {
    id: 'BURGERS',
    displayName: 'Burgers',
    shortLabel: 'Burgers',
    description: 'Freshly grilled signature beef burgers on toasted buns.',
    sortOrder: 1,
    accentHex: '#E06D3B',
    available: true,
  },
  {
    id: 'SIDES',
    displayName: 'Sides',
    shortLabel: 'Sides',
    description: 'Crispy golden fries and bite-sized favorites.',
    sortOrder: 2,
    accentHex: '#D97706',
    available: true,
  },
  {
    id: 'DRINKS',
    displayName: 'Drinks',
    shortLabel: 'Drinks',
    description: 'Refreshing iced tea and creamy hand-spun milkshakes.',
    sortOrder: 3,
    accentHex: '#EC4899',
    available: true,
  },
  {
    id: 'DESSERTS',
    displayName: 'Desserts',
    shortLabel: 'Desserts',
    description: 'Sweet cafe treats (unlocks in later cafe tiers).',
    sortOrder: 4,
    accentHex: '#F27999',
    available: false,
  },
  {
    id: 'SPECIALS',
    displayName: 'Specials',
    shortLabel: 'Specials',
    description: 'Seasonal chef specials and combo highlights.',
    sortOrder: 5,
    accentHex: '#8B5CF6',
    available: false,
  },
] as const;

export const VALID_MENU_CATEGORY_IDS: readonly MenuCategoryId[] = MENU_CATEGORIES.map((c) => c.id);

export function isValidMenuCategory(value: string): value is MenuCategoryId {
  return (VALID_MENU_CATEGORY_IDS as readonly string[]).includes(value);
}
