import type { PlayerRole } from '../../../shared/types.ts';

export type InteractableType =
  | 'CookingStation'
  | 'PreparationTable'
  | 'IngredientStorage'
  | 'FoodCounter'
  | 'Customer'
  | 'DiningTable'
  | 'Cashier'
  | 'CleaningStation'
  | 'TrashBin';

export type AllowedRoles = PlayerRole | 'both';

export interface RolePermissionRule {
  allowedRoles: AllowedRoles;
  defaultLabel: string;
  roleLabels?: Partial<Record<PlayerRole, string>>;
  priority: number;
  defaultRadius: number;
}

/**
 * Centralized, configurable role permission table for all restaurant interactable types.
 * Future gameplay phases can adjust or extend rules in one place without modifying
 * MovementController, InputController, or scene code.
 */
export const ROLE_PERMISSION_RULES: Record<InteractableType, RolePermissionRule> = {
  CookingStation: {
    allowedRoles: 'chef',
    defaultLabel: 'COOK',
    priority: 90,
    defaultRadius: 1.55,
  },
  PreparationTable: {
    allowedRoles: 'chef',
    defaultLabel: 'PREPARE',
    priority: 85,
    defaultRadius: 1.55,
  },
  IngredientStorage: {
    allowedRoles: 'chef',
    defaultLabel: 'GET ITEM',
    priority: 80,
    defaultRadius: 1.55,
  },
  FoodCounter: {
    allowedRoles: 'both',
    defaultLabel: 'COUNTER',
    roleLabels: {
      chef: 'PLACE FOOD',
      waiter: 'TAKE FOOD',
    },
    priority: 88,
    defaultRadius: 1.55,
  },
  TrashBin: {
    allowedRoles: 'chef',
    defaultLabel: 'TRASH',
    priority: 70,
    defaultRadius: 1.5,
  },
  DiningTable: {
    allowedRoles: 'waiter',
    defaultLabel: 'SERVE',
    priority: 92,
    defaultRadius: 1.65,
  },
  Customer: {
    allowedRoles: 'waiter',
    defaultLabel: 'SEAT',
    priority: 95,
    defaultRadius: 1.75,
  },
  Cashier: {
    allowedRoles: 'waiter',
    defaultLabel: 'PAY',
    priority: 86,
    defaultRadius: 1.6,
  },
  CleaningStation: {
    allowedRoles: 'waiter',
    defaultLabel: 'CLEAN',
    priority: 82,
    defaultRadius: 1.6,
  },
};

export function canRoleInteractWithType(
  role: PlayerRole,
  type: InteractableType,
  overrideRole?: AllowedRoles
): boolean {
  const effective = overrideRole ?? ROLE_PERMISSION_RULES[type].allowedRoles;
  return effective === 'both' || effective === role;
}

export function getInteractionLabel(
  role: PlayerRole,
  type: InteractableType,
  customLabel?: string
): string {
  if (customLabel) return customLabel;
  const rule = ROLE_PERMISSION_RULES[type];
  return rule.roleLabels?.[role] ?? rule.defaultLabel;
}
