import type { PlayerRole, SceneKey } from '../../../shared/types.ts';
import type { CustomerSystemConfig } from '../customer/CustomerConfig.ts';
import type { LobbyMode } from '../ui/GameBridge.ts';

/**
 * Centralized Solo Training Mode balance configuration.
 * All Solo-specific pacing, table count, patience, and cooking speed knobs live here
 * instead of being hardcoded across gameplay managers.
 */
export interface SoloBalanceConfig {
  /** Total duration of one Solo shift in seconds. */
  shiftDurationSeconds: number;
  /** 1-star, 2-star, and 3-star score thresholds tuned for 1 player switching roles. */
  targetScores: [number, number, number];
  /** Active dining tables in Solo Mode (remaining tables are cleanly disabled). */
  activeTableCount: number;
  /** Multiplier applied to recipe cookSeconds (< 1.0 = faster cooking for solo rhythm). */
  cookDurationMultiplier: number;
  /** Multiplier applied to recipe burnSeconds (> 1.0 = more forgiving burn window). */
  burnDurationMultiplier: number;
  /** Starting controlled character role when entering Solo Mode. */
  initialRole: PlayerRole;
  /** CustomerManager overrides tuned for fair, progressively challenging solo gameplay. */
  customerConfig: Partial<CustomerSystemConfig>;
}

export const COOP_DEFAULT_BALANCE = {
  shiftDurationSeconds: 150,
  targetScores: [450, 950, 1550] as [number, number, number],
  activeTableCount: 6,
  cookDurationMultiplier: 1.0,
  burnDurationMultiplier: 1.0,
} as const;

export const SOLO_BALANCE_CONFIG: SoloBalanceConfig = {
  shiftDurationSeconds: 180,
  targetScores: [350, 750, 1250],
  activeTableCount: 4,
  cookDurationMultiplier: 0.78,
  burnDurationMultiplier: 1.55,
  initialRole: 'waiter',
  customerConfig: {
    spawningEnabled: true,
    spawnInterval: 11.5,
    minSpawnInterval: 6.5,
    maxCustomers: 7,
    maxQueueSize: 3,
    customerPatience: 64,
    queuePatience: 58,
    waiterPatience: 56,
    foodPatience: 72,
    billPatience: 46,
    eatingDuration: 4.8,
    groupSizeWeights: [
      { size: 1, weight: 54 },
      { size: 2, weight: 34 },
      { size: 3, weight: 8 },
      { size: 4, weight: 4 },
    ],
  },
};

export type MenuRouteAction =
  | 'LATIHAN_SOLO'
  | 'PLAY_ONLINE'
  | 'CREATE_ROOM'
  | 'JOIN_ROOM'
  | 'START_ONLINE_GAME'
  | 'BACK_TO_MENU';

export interface ResolvedMenuRoute {
  action: MenuRouteAction;
  sessionKind: 'solo' | 'online' | 'none';
  targetScene: SceneKey;
  lobbyMode: LobbyMode | null;
  requiresMatchmaking: boolean;
  requiresNetwork: boolean;
}

/**
 * Pure, deterministic navigation router separating Solo Training Mode from Online Co-Op Mode.
 * Guarantees "Latihan Solo" never routes into online matchmaking, lobby queues, or partner waiting screens.
 */
export function resolveMenuRoute(action: MenuRouteAction): ResolvedMenuRoute {
  switch (action) {
    case 'LATIHAN_SOLO':
      return {
        action,
        sessionKind: 'solo',
        targetScene: 'RestaurantScene',
        lobbyMode: null,
        requiresMatchmaking: false,
        requiresNetwork: false,
      };
    case 'PLAY_ONLINE':
      return {
        action,
        sessionKind: 'online',
        targetScene: 'LobbyScene',
        lobbyMode: 'online',
        requiresMatchmaking: true,
        requiresNetwork: true,
      };
    case 'CREATE_ROOM':
      return {
        action,
        sessionKind: 'online',
        targetScene: 'LobbyScene',
        lobbyMode: 'create',
        requiresMatchmaking: false,
        requiresNetwork: true,
      };
    case 'JOIN_ROOM':
      return {
        action,
        sessionKind: 'online',
        targetScene: 'LobbyScene',
        lobbyMode: 'join',
        requiresMatchmaking: false,
        requiresNetwork: true,
      };
    case 'START_ONLINE_GAME':
      return {
        action,
        sessionKind: 'online',
        targetScene: 'RestaurantScene',
        lobbyMode: null,
        requiresMatchmaking: false,
        requiresNetwork: true,
      };
    case 'BACK_TO_MENU':
      return {
        action,
        sessionKind: 'none',
        targetScene: 'MainMenuScene',
        lobbyMode: null,
        requiresMatchmaking: false,
        requiresNetwork: false,
      };
  }
}
