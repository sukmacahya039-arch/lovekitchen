import type { CustomerRuntimeSnapshot } from '../game/systems/customer/CustomerAI.ts';
import type { RestaurantMetrics } from '../game/systems/customer/CustomerManager.ts';
import type {
  Order,
  OrderDraftSubmissionItem,
  OrderPriority,
  OrderSystemSnapshot,
} from '../game/systems/orders/OrderTypes.ts';
import type { RestaurantTableState } from '../game/systems/table/TableState.ts';
import type { ConnectionStatus, RoomStatus } from './roomProtocol.ts';

export type {
  ConnectionStatus,
  CustomerRuntimeSnapshot,
  Order,
  OrderDraftSubmissionItem,
  OrderPriority,
  OrderSystemSnapshot,
  RestaurantMetrics,
  RestaurantTableState,
  RoomStatus,
};

export type PlayerRole = 'chef' | 'waiter';

export type FacingDirection = 'front' | 'back' | 'left' | 'right';

export type SharedAnimState =
  | 'idle'
  | 'walk_front'
  | 'walk_back'
  | 'walk_left'
  | 'walk_right'
  | 'run'
  | 'work'
  | 'carry_item'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'tired';

export type ChefSpecificAnimState =
  | 'cooking'
  | 'frying'
  | 'chopping'
  | 'serving_counter'
  | 'burnt_reaction';

export type WaiterSpecificAnimState =
  | 'taking_order'
  | 'carrying_tray'
  | 'serving_food'
  | 'cleaning_table'
  | 'collecting_payment';

export type ChefAnimState = SharedAnimState | ChefSpecificAnimState;
export type WaiterAnimState = SharedAnimState | WaiterSpecificAnimState;
export type CharacterAnimState = ChefAnimState | WaiterAnimState;

export type SceneKey =
  | 'BootScene'
  | 'PreloadScene'
  | 'MainMenuScene'
  | 'LobbyScene'
  | 'CharacterSelectionScene'
  | 'RestaurantScene'
  | 'PauseScene'
  | 'ResultScene'
  | 'SettingsScene';

export type DishId = 'heart_burger' | 'love_pasta' | 'berry_cake' | 'golden_ramen';

export type ItemState = 'raw' | 'cooked' | 'burned';

export interface CarriedItem {
  dishId: DishId;
  state: ItemState;
  prepped?: boolean;
}

export type CookingStationStatus = 'empty' | 'cooking' | 'ready' | 'burned';

export type ApplianceType = 'grill' | 'pot' | 'oven' | 'wok';

export interface CookingStationState {
  id: string;
  appliance: ApplianceType;
  col: number;
  row: number;
  status: CookingStationStatus;
  dishId: DishId | null;
  progress: number; // 0..1 cook progress
  burnProgress: number; // 0..1 burn progress after ready
}

export interface ServingSlotState {
  id: string;
  col: number;
  row: number;
  item: CarriedItem | null;
}

export type TableStatus =
  | 'empty'
  | 'browsing'
  | 'ready_to_order'
  | 'waiting_food'
  | 'eating'
  | 'waiting_bill'
  | 'dirty';

export interface CustomerVisual {
  id: string;
  name: string;
  hairColor: number;
  shirtColor: number;
  skinTone: number;
}

export interface WaitingCustomer {
  id: string;
  visual: CustomerVisual;
  dishId: DishId;
  patience: number; // 0..1
  arrivedAt: number;
}

export interface DiningTableState {
  id: string;
  label: string;
  col: number;
  row: number;
  status: TableStatus;
  phase05Status: RestaurantTableState;
  capacity: number;
  occupancy: number;
  assignedGroupId: string | null;
  cleaningProgress: number; // 0..1 when CLEANING
  reservationRemainingMs: number;
  customer: CustomerVisual | null;
  dishId: DishId | null;
  patience: number; // 0..1
  actionTimer: number; // 0..1 (for browsing, eating, cleaning)
  orderId: string | null;
}

export interface KitchenOrder {
  id: string;
  tableId: string;
  tableLabel: string;
  dishId: DishId;
  status: 'queued' | 'cooking' | 'on_pass';
  patience: number; // synced from table
  createdAt: number;
}

export interface PlayerAvatarState {
  socketId: string;
  name: string;
  role: PlayerRole;
  col: number;
  row: number;
  facing: FacingDirection;
  isMoving: boolean;
  isRunning: boolean;
  carriedItem: CarriedItem | null;
  actionAnim: CharacterAnimState | null;
  actionAnimUntil: number;
  emote: string | null;
  emoteUntil: number;
}

export interface RoomMember {
  socketId: string;
  playerId: string;
  slot: 1 | 2;
  name: string;
  role: PlayerRole | null;
  ready: boolean;
  isHost: boolean;
  connected: boolean;
  joinedAt: number;
  disconnectedAt?: number | null;
}

export type RoomPhase = 'lobby' | 'character_select' | 'playing' | 'paused' | 'finished';

export type GameMode = 'coop' | 'practice' | 'solo';

export function isSoloControlMode(mode?: GameMode | null): boolean {
  return mode === 'solo' || mode === 'practice';
}

export interface RoomState {
  roomId: string;
  roomCode: string;
  /** Legacy alias kept identical to roomCode for backward compatibility across scenes. */
  code: string;
  hostId: string;
  hostName: string;
  hostSocketId: string;
  mode: GameMode;
  gameMode: GameMode;
  selectedMap: string;
  phase: RoomPhase;
  roomStatus: RoomStatus;
  playerCount: number;
  maxPlayers: number;
  members: RoomMember[];
  /** Canonical player roster matching members. */
  players: RoomMember[];
  gameSessionId: string | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface RoomPlayerEventPayload {
  roomId: string;
  roomCode: string;
  player: RoomMember;
  room: RoomState;
}

export interface RoomStateChangedPayload {
  roomId: string;
  roomCode: string;
  previousStatus: RoomStatus;
  roomStatus: RoomStatus;
  room: RoomState;
}

export interface RoomReadyChangedPayload {
  roomId: string;
  roomCode: string;
  playerId: string;
  ready: boolean;
  room: RoomState;
}

export interface RoomHostChangedPayload {
  roomId: string;
  roomCode: string;
  previousHostId: string;
  newHostId: string;
  newHostName: string;
  room: RoomState;
}

export interface RoomClosedPayload {
  roomId: string;
  roomCode: string;
  reason: string;
}

export interface GameEffectEvent {
  id: string;
  type: 'score' | 'serve' | 'burn' | 'order' | 'clean' | 'leave_angry' | 'combo';
  col: number;
  row: number;
  text: string;
  color: string;
}

export interface GameSnapshot {
  roomCode: string;
  mode: GameMode;
  phase: RoomPhase;
  timeRemaining: number;
  totalDuration: number;
  score: number;
  combo: number;
  maxCombo: number;
  ordersCompleted: number;
  ordersBurned: number;
  customersLost: number;
  tipsEarned: number;
  targetScores: [number, number, number]; // 1-star, 2-star, 3-star thresholds
  players: Record<PlayerRole, PlayerAvatarState>;
  stations: CookingStationState[];
  prepTableItem: CarriedItem | null;
  servingPass: ServingSlotState[];
  tables: DiningTableState[];
  waitingQueue: WaitingCustomer[];
  customers: CustomerRuntimeSnapshot[];
  restaurantMetrics: RestaurantMetrics;
  orders: KitchenOrder[];
  orderSystem: OrderSystemSnapshot;
  cashierTips: number;
  waiterCleanBuffUntil: number;
  recentEvents: GameEffectEvent[];
  pausedBy: string | null;
}

export interface MatchSummary {
  roomCode: string;
  mode: GameMode;
  score: number;
  stars: number;
  ordersCompleted: number;
  ordersBurned: number;
  customersLost: number;
  tipsEarned: number;
  maxCombo: number;
  durationSeconds: number;
  chefName: string;
  waiterName: string;
  myRole: PlayerRole;
}

export interface AudioSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
}

export interface PlayerProfileData {
  uid: string;
  displayName: string;
  preferredRole: PlayerRole;
  bestScore: number;
  gamesPlayed: number;
  totalOrdersServed: number;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
}
