import type { ApplianceType, DishId } from './types.ts';

export interface RecipeDefinition {
  id: DishId;
  name: string;
  shortName: string;
  cookSeconds: number;
  burnSeconds: number;
  basePrice: number;
  allowedAppliances: ApplianceType[];
  accentHex: string;
  accentColor: number;
  badgeText: string;
}

export const RECIPES: Record<DishId, RecipeDefinition> = {
  heart_burger: {
    id: 'heart_burger',
    name: 'Heart Burger',
    shortName: 'Burger',
    cookSeconds: 4.5,
    burnSeconds: 9.0,
    basePrice: 120,
    allowedAppliances: ['grill', 'oven', 'wok'],
    accentHex: '#E06D3B',
    accentColor: 0xe06d3b,
    badgeText: 'BGR',
  },
  love_pasta: {
    id: 'love_pasta',
    name: 'Love Pasta',
    shortName: 'Pasta',
    cookSeconds: 5.5,
    burnSeconds: 9.5,
    basePrice: 150,
    allowedAppliances: ['pot', 'wok'],
    accentHex: '#E84A5F',
    accentColor: 0xe84a5f,
    badgeText: 'PST',
  },
  berry_cake: {
    id: 'berry_cake',
    name: 'Berry Cake',
    shortName: 'Cake',
    cookSeconds: 5.0,
    burnSeconds: 8.5,
    basePrice: 140,
    allowedAppliances: ['oven', 'wok'],
    accentHex: '#F27999',
    accentColor: 0xf27999,
    badgeText: 'CKE',
  },
  golden_ramen: {
    id: 'golden_ramen',
    name: 'Golden Ramen',
    shortName: 'Ramen',
    cookSeconds: 6.0,
    burnSeconds: 10.0,
    basePrice: 170,
    allowedAppliances: ['pot', 'grill', 'wok'],
    accentHex: '#F4A62A',
    accentColor: 0xf4a62a,
    badgeText: 'RMN',
  },
};

export const DISH_IDS: DishId[] = ['heart_burger', 'love_pasta', 'berry_cake', 'golden_ramen'];

export function getApplianceLabel(appliance: ApplianceType): string {
  switch (appliance) {
    case 'grill':
      return 'Grill Pan';
    case 'pot':
      return 'Soup Pot';
    case 'oven':
      return 'Pastry Oven';
    case 'wok':
      return 'Master Wok';
  }
}
