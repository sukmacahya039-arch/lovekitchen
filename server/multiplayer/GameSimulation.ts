import {
  CHEF_SPAWN,
  CLEANING_STATION_POS,
  COOKING_STATIONS,
  PANTRIES,
  PREP_TABLE_POS,
  REGISTER_POS,
  SERVING_PASS_SLOTS,
  TRASH_BIN_POS,
  WAIT_MAT_POS,
  WAITER_SPAWN,
} from '../../src/shared/layout.ts';
import { resolveSlideMovement } from '../../src/shared/pathfinding.ts';
import { RECIPES } from '../../src/shared/recipes.ts';
import type {
  CarriedItem,
  CharacterAnimState,
  CookingStationState,
  DiningTableState,
  DishId,
  FacingDirection,
  GameEffectEvent,
  GameMode,
  GameSnapshot,
  KitchenOrder,
  MatchSummary,
  Order,
  OrderDraftSubmissionItem,
  OrderPriority,
  PlayerAvatarState,
  PlayerRole,
  RestaurantTableState,
  RoomPhase,
  ServingSlotState,
  TableStatus,
  WaitingCustomer,
} from '../../src/shared/types.ts';
import { CollisionSystem } from '../../src/game/systems/collision/CollisionSystem.ts';
import type { CustomerSystemConfig } from '../../src/game/systems/customer/CustomerConfig.ts';
import { CustomerManager } from '../../src/game/systems/customer/CustomerManager.ts';
import { GameEventBus } from '../../src/game/systems/events/GameEvents.ts';
import { MenuService } from '../../src/game/systems/menu/MenuService.ts';
import { NavigationGrid } from '../../src/game/systems/navigation/NavigationGrid.ts';
import { PathfindingService } from '../../src/game/systems/navigation/PathfindingService.ts';
import { OrderService } from '../../src/game/systems/orders/OrderService.ts';
import { RecipeService } from '../../src/game/systems/recipe/RecipeService.ts';
import {
  COOP_DEFAULT_BALANCE,
  SOLO_BALANCE_CONFIG,
} from '../../src/game/systems/solo/SoloConfig.ts';
import { TableManager } from '../../src/game/systems/table/TableManager.ts';

export interface SimulationBalanceOptions {
  shiftDurationSeconds?: number;
  targetScores?: [number, number, number];
  activeTableCount?: number;
  cookDurationMultiplier?: number;
  burnDurationMultiplier?: number;
  customerConfig?: Partial<CustomerSystemConfig>;
}

function mapPhase05ToLegacyTableStatus(status: RestaurantTableState): TableStatus {
  switch (status) {
    case 'AVAILABLE':
    case 'DISABLED':
      return 'empty';
    case 'RESERVED':
    case 'OCCUPIED':
      return 'browsing';
    case 'WAITING_FOR_ORDER':
      return 'ready_to_order';
    case 'WAITING_FOR_FOOD':
      return 'waiting_food';
    case 'EATING':
      return 'eating';
    case 'WAITING_FOR_BILL':
      return 'waiting_bill';
    case 'DIRTY':
    case 'CLEANING':
      return 'dirty';
  }
}

export class GameSimulation {
  private roomCode: string;
  private mode: GameMode;
  private phase: RoomPhase = 'playing';
  private shiftDurationSeconds: number;
  private targetScores: [number, number, number];
  private activeTableCount: number;
  private cookDurationMultiplier: number;
  private burnDurationMultiplier: number;
  private timeRemaining: number;
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private ordersCompleted = 0;
  private ordersBurned = 0;
  private customersLost = 0;
  private tipsEarned = 0;
  private pausedBy: string | null = null;

  private players: Record<PlayerRole, PlayerAvatarState>;
  private stations: CookingStationState[];
  private stationPrepped = new Map<string, boolean>();
  private prepTableItem: CarriedItem | null = null;
  private servingPass: ServingSlotState[];
  private tables: DiningTableState[] = [];
  private waitingQueue: WaitingCustomer[] = [];
  private orders: KitchenOrder[] = [];
  private cashierTips = 0;
  private waiterCleanBuffUntil = 0;
  private recentEvents: GameEffectEvent[] = [];

  // Phase 04, 05 & 06 authoritative simulation systems (shared single source of truth for Co-Op & Solo)
  private navGrid: NavigationGrid;
  private pathfinding: PathfindingService;
  private collision: CollisionSystem;
  private eventBus: GameEventBus;
  private tableManager: TableManager;
  private customerManager: CustomerManager;
  private menuService: MenuService;
  private recipeService: RecipeService;
  private orderService: OrderService;

  private nextId = 1;
  private lastTickMs = Date.now();
  private onFinish?: (summary: MatchSummary) => void;

  constructor(
    roomCode: string,
    mode: GameMode,
    chefInfo: { socketId: string; name: string },
    waiterInfo: { socketId: string; name: string },
    onFinish?: (summary: MatchSummary) => void,
    balanceOptions?: SimulationBalanceOptions
  ) {
    this.roomCode = roomCode;
    this.mode = mode;
    this.onFinish = onFinish;

    const isSoloBalanced = mode === 'solo';
    const baseBalance = isSoloBalanced ? SOLO_BALANCE_CONFIG : COOP_DEFAULT_BALANCE;

    this.shiftDurationSeconds =
      balanceOptions?.shiftDurationSeconds ?? baseBalance.shiftDurationSeconds;
    this.targetScores = balanceOptions?.targetScores
      ? [...balanceOptions.targetScores] as [number, number, number]
      : [...baseBalance.targetScores] as [number, number, number];
    this.activeTableCount =
      balanceOptions?.activeTableCount ?? baseBalance.activeTableCount;
    this.cookDurationMultiplier =
      balanceOptions?.cookDurationMultiplier ?? baseBalance.cookDurationMultiplier;
    this.burnDurationMultiplier =
      balanceOptions?.burnDurationMultiplier ?? baseBalance.burnDurationMultiplier;
    this.timeRemaining = this.shiftDurationSeconds;

    this.players = {
      chef: {
        socketId: chefInfo.socketId,
        name: chefInfo.name,
        role: 'chef',
        col: CHEF_SPAWN.col,
        row: CHEF_SPAWN.row,
        facing: 'front',
        isMoving: false,
        isRunning: false,
        actionAnim: 'happy',
        actionAnimUntil: Date.now() + 1800,
        carriedItem: null,
        emote: 'Ready to cook!',
        emoteUntil: Date.now() + 2600,
      },
      waiter: {
        socketId: waiterInfo.socketId,
        name: waiterInfo.name,
        role: 'waiter',
        col: WAITER_SPAWN.col,
        row: WAITER_SPAWN.row,
        facing: 'front',
        isMoving: false,
        isRunning: false,
        actionAnim: 'happy',
        actionAnimUntil: Date.now() + 1800,
        carriedItem: null,
        emote: 'Welcome guests!',
        emoteUntil: Date.now() + 2600,
      },
    };

    this.stations = COOKING_STATIONS.map((s) => ({
      id: s.id,
      appliance: s.appliance,
      col: s.col,
      row: s.row,
      status: 'empty',
      dishId: null,
      progress: 0,
      burnProgress: 0,
    }));

    this.servingPass = SERVING_PASS_SLOTS.map((p) => ({
      id: p.id,
      col: p.col,
      row: p.row,
      item: null,
    }));

    // Initialize authoritative Phase 04 navigation/collision + Phase 05 table & customer systems
    this.navGrid = new NavigationGrid();
    this.pathfinding = new PathfindingService(this.navGrid);
    this.collision = new CollisionSystem(this.navGrid);
    this.eventBus = new GameEventBus();
    this.tableManager = new TableManager(this.pathfinding, this.eventBus);

    // Apply active table count balance (e.g., 4 active tables out of 6 in Solo Training Mode)
    const allTables = this.tableManager.getAllTables();
    if (this.activeTableCount > 0 && this.activeTableCount < allTables.length) {
      for (let i = this.activeTableCount; i < allTables.length; i += 1) {
        allTables[i].setDisabled(true);
      }
    }

    const customerConfigOverrides: Partial<CustomerSystemConfig> = {
      ...(isSoloBalanced ? SOLO_BALANCE_CONFIG.customerConfig : {}),
      ...(balanceOptions?.customerConfig ?? {}),
    };

    this.customerManager = new CustomerManager(
      this.navGrid,
      this.pathfinding,
      this.collision,
      this.tableManager,
      this.eventBus,
      customerConfigOverrides,
      {
        onCustomerAngryLeave: ({ tableId, col, row, memberCount }) => {
          this.customersLost += memberCount;
          this.combo = 0;
          if (tableId) {
            this.orders = this.orders.filter((o) => o.tableId !== tableId);
            // Cancel any open Phase 06 orders for this table cleanly
            for (const ord of this.orderService.manager.getOrdersByTable(tableId, true)) {
              this.orderService.cancelOrder(ord.orderId, 'customer_left_angry');
            }
            this.score = Math.max(0, this.score - 40);
            this.pushEvent('leave_angry', col, row, 'Too slow! -$40', '#EF4444');
          } else {
            this.pushEvent('leave_angry', col, row, 'Guest Left!', '#EF4444');
          }
          this.setActionAnim('waiter', 'sad', 1500);
        },
      }
    );

    // Initialize Phase 06 MenuService, RecipeService, and centralized OrderService
    this.menuService = new MenuService(undefined, this.eventBus);
    this.recipeService = new RecipeService();
    this.orderService = new OrderService({
      sessionId: `${roomCode}_${Date.now()}`,
      menuService: this.menuService,
      recipeService: this.recipeService,
      events: this.eventBus,
      tableManager: this.tableManager,
      customerManager: this.customerManager,
    });

    // Award sparkle cleaning bonus automatically when a table finishes CLEANING -> AVAILABLE
    this.eventBus.on('TABLE_CLEANED', ({ tableId }) => {
      const tbl = this.tableManager.getTable(tableId);
      if (!tbl) return;
      const hasSparkle = Date.now() < this.waiterCleanBuffUntil;
      const cleanBonus = hasSparkle ? 35 : 15;
      this.score += cleanBonus;
      this.pushEvent(
        'clean',
        tbl.config.col,
        tbl.config.row,
        hasSparkle ? `2x Sparkling! +$${cleanBonus}` : `Sparkling! +$${cleanBonus}`,
        '#0EA5E9'
      );
    });

    // Spawn first customer group right away so the restaurant opens lively!
    this.customerManager.spawnGroup(1);
    this.syncViewsFromManagers(Date.now());
  }

  public getCustomerManager(): CustomerManager {
    return this.customerManager;
  }

  public getTableManager(): TableManager {
    return this.tableManager;
  }

  public getMenuService(): MenuService {
    return this.menuService;
  }

  public getRecipeService(): RecipeService {
    return this.recipeService;
  }

  public getOrderService(): OrderService {
    return this.orderService;
  }

  public getBalanceConfig() {
    return {
      mode: this.mode,
      shiftDurationSeconds: this.shiftDurationSeconds,
      targetScores: [...this.targetScores] as [number, number, number],
      activeTableCount: this.activeTableCount,
      cookDurationMultiplier: this.cookDurationMultiplier,
      burnDurationMultiplier: this.burnDurationMultiplier,
      customerConfig: { ...this.customerManager.config },
    };
  }

  public getEventBus(): GameEventBus {
    return this.eventBus;
  }

  /**
   * Phase 06 Authoritative Waiter Order Confirmation API.
   * Rebuilds and validates the draft on the server against MenuDatabase, RecipeDatabase,
   * and Phase 05 TableManager/CustomerManager before creating the kitchen ticket.
   */
  public confirmTableOrder(
    tableId: string,
    waiterId: string,
    items: OrderDraftSubmissionItem[],
    orderNotes = '',
    priority: OrderPriority = 'NORMAL'
  ): { ok: boolean; order?: Order; errors?: string[] } {
    if (this.phase !== 'playing') {
      return { ok: false, errors: ['Game is not currently playing.'] };
    }

    const table = this.tableManager.getTable(tableId);
    if (!table) {
      return { ok: false, errors: [`Table "${tableId}" not found.`] };
    }

    const groupId = table.getAssignedGroupId() ?? '';
    const group = groupId ? this.customerManager.groups.getGroup(groupId) : null;
    const customerIds = group ? [...group.memberIds] : [];
    const now = Date.now();

    const submitRes = this.orderService.submitValidatedOrder(
      {
        tableId: table.id,
        tableLabel: table.config.label,
        customerIds,
        customerGroupId: groupId,
        waiterId: waiterId || this.players.waiter.socketId,
      },
      items,
      orderNotes,
      priority,
      now
    );

    if (!submitRes.ok || !submitRes.order) {
      return { ok: false, errors: submitRes.validation.errors };
    }

    const order = submitRes.order;

    // Advance Phase 05 table state (OCCUPIED / WAITING_FOR_ORDER -> WAITING_FOR_FOOD)
    const tblStatus = table.getStatus();
    if (tblStatus === 'OCCUPIED' || tblStatus === 'WAITING_FOR_ORDER') {
      const firstMenu = this.menuService.getItemById(order.items[0].menuItemId);
      if (firstMenu?.legacyDishId) {
        table.dishId = firstMenu.legacyDishId;
        if (group) {
          group.dishId = firstMenu.legacyDishId;
        }
      }
      const takeRes = this.customerManager.takeOrderAtTable(table.id, order.orderId, now);
      if (takeRes.ok && takeRes.dishId) {
        this.orders.push({
          id: order.orderId,
          tableId: table.id,
          tableLabel: table.config.label,
          dishId: takeRes.dishId,
          status: 'queued',
          patience: table.patience,
          createdAt: now,
        });
      }
    }

    this.setActionAnim('waiter', 'taking_order', 1450);
    this.pushEvent(
      'order',
      table.config.col,
      table.config.row,
      `ORDER ${order.orderNumber} SENT!`,
      '#3B82F6'
    );
    this.syncViewsFromManagers(now);
    return { ok: true, order };
  }

  /**
   * Phase 06 Authoritative Chef Order Acceptance API (QUEUED -> ACCEPTED).
   */
  public acceptKitchenOrder(
    orderId: string,
    chefId: string
  ): { ok: boolean; order?: Order; error?: string } {
    if (this.phase !== 'playing') {
      return { ok: false, error: 'Game is not currently playing.' };
    }
    const now = Date.now();
    const res = this.orderService.acceptOrder(orderId, chefId || this.players.chef.socketId, now);
    if (!res.ok || !res.order) {
      return { ok: false, error: res.error };
    }

    const legacyOrd = this.orders.find((o) => o.id === orderId);
    if (legacyOrd && legacyOrd.status === 'queued') {
      legacyOrd.status = 'cooking';
    }

    this.setActionAnim('chef', 'work', 900);
    this.pushEvent(
      'serve',
      this.players.chef.col,
      this.players.chef.row,
      `Chef Accepted ${res.order.orderNumber}!`,
      '#10B981'
    );
    this.syncViewsFromManagers(now);
    return { ok: true, order: res.order };
  }

  /**
   * Phase 06 Authoritative Order Cancellation API.
   */
  public cancelKitchenOrder(
    orderId: string,
    reason = 'cancelled_by_staff'
  ): { ok: boolean; order?: Order; error?: string } {
    const now = Date.now();
    const res = this.orderService.cancelOrder(orderId, reason, now);
    if (!res.ok || !res.order) {
      return { ok: false, error: res.error };
    }
    this.orders = this.orders.filter((o) => o.id !== orderId);
    this.syncViewsFromManagers(now);
    return { ok: true, order: res.order };
  }

  public getPhase(): RoomPhase {
    return this.phase;
  }

  public setPaused(paused: boolean, byName: string | null): void {
    if (this.phase === 'finished') return;
    this.phase = paused ? 'paused' : 'playing';
    this.pausedBy = paused ? byName : null;
    this.lastTickMs = Date.now();
  }

  public updatePlayerPosition(
    role: PlayerRole,
    col: number,
    row: number,
    facing: FacingDirection,
    isMoving: boolean,
    isRunning = false
  ): void {
    const player = this.players[role];
    if (!player) return;
    const resolved = resolveSlideMovement(role, player.col, player.row, col, row);
    player.col = resolved.col;
    player.row = resolved.row;
    player.facing = facing;
    player.isMoving = isMoving;
    player.isRunning = isMoving && isRunning;
  }

  public setActionAnim(role: PlayerRole, anim: CharacterAnimState, durationMs: number): void {
    const player = this.players[role];
    if (!player) return;
    player.actionAnim = anim;
    player.actionAnimUntil = Date.now() + durationMs;
  }

  public triggerEmote(role: PlayerRole, text: string, anim?: CharacterAnimState): void {
    const player = this.players[role];
    if (!player) return;
    if (text) {
      player.emote = text.slice(0, 24);
      player.emoteUntil = Date.now() + 2200;
    }
    if (anim) {
      this.setActionAnim(role, anim, 1700);
    }
  }

  public interact(role: PlayerRole, targetId?: string): { ok: boolean; message?: string } {
    if (this.phase !== 'playing') return { ok: false };
    const player = this.players[role];
    if (!player) return { ok: false };

    const result =
      role === 'chef'
        ? this.handleChefInteract(player, targetId)
        : this.handleWaiterInteract(player, targetId);

    this.syncViewsFromManagers(Date.now());
    return result;
  }

  private handleChefInteract(player: PlayerAvatarState, targetId?: string): { ok: boolean; message?: string } {
    const candidates: Array<{
      id: string;
      kind: 'pantry' | 'station' | 'prep' | 'pass' | 'trash';
      col: number;
      row: number;
    }> = [
      ...PANTRIES.map((p) => ({ id: p.id, kind: 'pantry' as const, col: p.col, row: p.row })),
      ...this.stations.map((s) => ({ id: s.id, kind: 'station' as const, col: s.col, row: s.row })),
      { id: PREP_TABLE_POS.id, kind: 'prep' as const, col: PREP_TABLE_POS.col, row: PREP_TABLE_POS.row },
      ...this.servingPass.map((p) => ({ id: p.id, kind: 'pass' as const, col: p.col, row: p.row })),
      { id: TRASH_BIN_POS.id, kind: 'trash' as const, col: TRASH_BIN_POS.col, row: TRASH_BIN_POS.row },
    ];

    const chosen = this.pickTarget(player, candidates, targetId, 2.4);
    if (!chosen) return { ok: false };

    // 1. Trash bin
    if (chosen.kind === 'trash') {
      if (player.carriedItem) {
        const wasBurned = player.carriedItem.state === 'burned';
        player.carriedItem = null;
        this.setActionAnim('chef', wasBurned ? 'sad' : 'work', 950);
        this.pushEvent('clean', TRASH_BIN_POS.col, TRASH_BIN_POS.row, 'Tossed', '#78716C');
        return { ok: true };
      }
      return { ok: false };
    }

    // 2. Ingredient Storage
    if (chosen.kind === 'pantry') {
      const pantry = PANTRIES.find((p) => p.id === chosen.id);
      if (!pantry) return { ok: false };
      if (!player.carriedItem) {
        player.carriedItem = { dishId: pantry.dishId, state: 'raw', prepped: false };
        this.setActionAnim('chef', 'work', 650);
        this.pushEvent('order', pantry.col, pantry.row, `Picked ${RECIPES[pantry.dishId].shortName}`, '#D97706');
        return { ok: true };
      }
      if (player.carriedItem.state === 'raw') {
        player.carriedItem = { dishId: pantry.dishId, state: 'raw', prepped: false };
        this.setActionAnim('chef', 'work', 650);
        return { ok: true };
      }
      this.setActionAnim('chef', 'tired', 800);
      return { ok: false, message: 'Hands full!' };
    }

    // 3. Preparation Table
    if (chosen.kind === 'prep') {
      if (player.carriedItem?.state === 'raw' && !player.carriedItem.prepped) {
        player.carriedItem.prepped = true;
        this.setActionAnim('chef', 'chopping', 1200);
        this.pushEvent('serve', PREP_TABLE_POS.col, PREP_TABLE_POS.row, 'Prepped! Fast Cook', '#F59E0B');
        return { ok: true };
      }
      if (!this.prepTableItem && player.carriedItem) {
        this.prepTableItem = player.carriedItem;
        player.carriedItem = null;
        this.setActionAnim('chef', 'work', 700);
        this.pushEvent('order', PREP_TABLE_POS.col, PREP_TABLE_POS.row, 'Placed on Prep', '#D97706');
        return { ok: true };
      }
      if (this.prepTableItem && !player.carriedItem) {
        player.carriedItem = this.prepTableItem;
        this.prepTableItem = null;
        this.setActionAnim('chef', 'carry_item', 650);
        return { ok: true };
      }
      return { ok: false };
    }

    // 4. Cooking Stations
    if (chosen.kind === 'station') {
      const station = this.stations.find((s) => s.id === chosen.id);
      if (!station) return { ok: false };

      if (station.status === 'empty' && player.carriedItem?.state === 'raw') {
        const recipe = RECIPES[player.carriedItem.dishId];
        if (!recipe.allowedAppliances.includes(station.appliance)) {
          this.triggerEmote('chef', `Use ${recipe.allowedAppliances[0]}!`, 'angry');
          return { ok: false, message: 'Wrong appliance!' };
        }
        station.dishId = player.carriedItem.dishId;
        station.status = 'cooking';
        station.progress = 0;
        station.burnProgress = 0;
        this.stationPrepped.set(station.id, Boolean(player.carriedItem.prepped));
        player.carriedItem = null;
        this.syncOrderStatus(station.dishId, 'cooking');
        const cookAnim: CharacterAnimState =
          station.appliance === 'grill' || station.appliance === 'wok' ? 'frying' : 'cooking';
        this.setActionAnim('chef', cookAnim, 1650);
        this.pushEvent(
          'order',
          station.col,
          station.row,
          cookAnim === 'frying' ? 'Frying!' : 'Cooking!',
          '#F97316'
        );
        return { ok: true };
      }

      if (station.status === 'ready' && !player.carriedItem && station.dishId) {
        const wasPrepped = this.stationPrepped.get(station.id) ?? false;
        player.carriedItem = { dishId: station.dishId, state: 'cooked', prepped: wasPrepped };
        station.status = 'empty';
        station.dishId = null;
        station.progress = 0;
        station.burnProgress = 0;
        this.stationPrepped.delete(station.id);
        this.setActionAnim('chef', 'work', 750);
        this.pushEvent('serve', station.col, station.row, wasPrepped ? 'Gourmet Plated!' : 'Plated!', '#10B981');
        return { ok: true };
      }

      if (station.status === 'burned' && !player.carriedItem && station.dishId) {
        player.carriedItem = { dishId: station.dishId, state: 'burned' };
        station.status = 'empty';
        station.dishId = null;
        station.progress = 0;
        station.burnProgress = 0;
        this.stationPrepped.delete(station.id);
        this.setActionAnim('chef', 'burnt_reaction', 1750);
        this.pushEvent('burn', station.col, station.row, 'Burnt! Trash it', '#EF4444');
        return { ok: true };
      }
      return { ok: false };
    }

    // 5. Food Pickup Counter
    if (chosen.kind === 'pass') {
      const slot = this.servingPass.find((p) => p.id === chosen.id);
      if (!slot) return { ok: false };
      if (!slot.item && player.carriedItem?.state === 'cooked') {
        slot.item = player.carriedItem;
        this.syncOrderStatus(player.carriedItem.dishId, 'on_pass');
        player.carriedItem = null;
        this.setActionAnim('chef', 'serving_counter', 1200);
        this.pushEvent('serve', slot.col, slot.row, 'Order Up!', '#10B981');
        return { ok: true };
      }
      if (slot.item && !player.carriedItem) {
        player.carriedItem = slot.item;
        slot.item = null;
        this.setActionAnim('chef', 'carry_item', 650);
        return { ok: true };
      }
      return { ok: false };
    }

    return { ok: false };
  }

  private handleWaiterInteract(player: PlayerAvatarState, targetId?: string): { ok: boolean; message?: string } {
    const allTables = this.tableManager.getAllTables();
    const candidates: Array<{
      id: string;
      kind: 'wait_mat' | 'table' | 'pass' | 'cashier' | 'cleaning_station';
      col: number;
      row: number;
    }> = [
      { id: WAIT_MAT_POS.id, kind: 'wait_mat' as const, col: WAIT_MAT_POS.col, row: WAIT_MAT_POS.row },
      ...allTables.map((t) => ({ id: t.id, kind: 'table' as const, col: t.config.col, row: t.config.row })),
      ...this.servingPass.map((p) => ({ id: p.id, kind: 'pass' as const, col: p.col, row: p.row })),
      { id: REGISTER_POS.id, kind: 'cashier' as const, col: REGISTER_POS.col, row: REGISTER_POS.row },
      {
        id: CLEANING_STATION_POS.id,
        kind: 'cleaning_station' as const,
        col: CLEANING_STATION_POS.col,
        row: CLEANING_STATION_POS.row,
      },
    ];

    const chosen = this.pickTarget(player, candidates, targetId, 2.5);
    if (!chosen) return { ok: false };

    const now = Date.now();

    // 1. Cashier Counter — Collect accumulated tips & express-settle waiting bills
    if (chosen.kind === 'cashier') {
      let totalCollected = 0;
      if (this.cashierTips > 0) {
        totalCollected += this.cashierTips;
        this.score += this.cashierTips;
        this.tipsEarned += this.cashierTips;
        this.cashierTips = 0;
      }

      for (const tbl of allTables) {
        if (tbl.getStatus() === 'WAITING_FOR_BILL' && tbl.dishId) {
          totalCollected += this.settleTableBill(tbl.id, 20, now);
        }
      }

      if (totalCollected > 0) {
        this.setActionAnim('waiter', 'collecting_payment', 1500);
        this.pushEvent('score', REGISTER_POS.col, REGISTER_POS.row, `Cashier +$${totalCollected}!`, '#16A34A');
        return { ok: true };
      }
      this.setActionAnim('waiter', 'work', 750);
      this.pushEvent('order', REGISTER_POS.col, REGISTER_POS.row, 'Register Ready', '#D97706');
      return { ok: true };
    }

    // 2. Cleaning Station — Stock 2x sparkle clean buff for 22s
    if (chosen.kind === 'cleaning_station') {
      this.waiterCleanBuffUntil = now + 22000;
      this.setActionAnim('waiter', 'cleaning_table', 1100);
      this.pushEvent(
        'clean',
        CLEANING_STATION_POS.col,
        CLEANING_STATION_POS.row,
        '2x Sparkle Clean Ready!',
        '#0EA5E9'
      );
      return { ok: true };
    }

    // 3. Entrance Waiting Mat — Welcome next queued group to optimal available table
    if (chosen.kind === 'wait_mat') {
      if (this.customerManager.queue.getLength() === 0) return { ok: false };
      const seated = this.customerManager.seatNextQueuedGroup(undefined, now);
      if (!seated.ok || !seated.tableId) {
        this.triggerEmote('waiter', 'No clean table!', 'tired');
        return { ok: false, message: 'No clean table available!' };
      }
      const tbl = this.tableManager.getTable(seated.tableId);
      if (tbl) {
        this.pushEvent('serve', tbl.config.col, tbl.config.row, `Seated at ${tbl.config.label}!`, '#EC4899');
      }
      this.setActionAnim('waiter', 'happy', 1100);
      return { ok: true };
    }

    // 4. Food Pickup Counter — Pick up cooked dish onto tray (or put back)
    if (chosen.kind === 'pass') {
      const slot = this.servingPass.find((p) => p.id === chosen.id);
      if (!slot) return { ok: false };
      if (!player.carriedItem && slot.item) {
        player.carriedItem = slot.item;
        slot.item = null;
        this.setActionAnim('waiter', 'carrying_tray', 850);
        this.pushEvent('serve', slot.col, slot.row, 'Picked up!', '#EC4899');
        return { ok: true };
      }
      if (player.carriedItem && !slot.item) {
        slot.item = player.carriedItem;
        player.carriedItem = null;
        this.setActionAnim('waiter', 'work', 700);
        return { ok: true };
      }
      return { ok: false };
    }

    // 5. Dining Table (All 6 Phase 03/05 Tables) — Seat / Take Order / Deliver Food / Collect Bill / Clean Dirty Table
    if (chosen.kind === 'table') {
      const table = this.tableManager.getTable(chosen.id);
      if (!table) return { ok: false };
      const status = table.getStatus();

      // Seat queued group directly at this AVAILABLE table
      if (status === 'AVAILABLE' && this.customerManager.queue.getLength() > 0 && !player.carriedItem) {
        const res = this.customerManager.seatNextQueuedGroup(table.id, now);
        if (res.ok) {
          this.setActionAnim('waiter', 'happy', 1050);
          this.pushEvent('serve', table.config.col, table.config.row, `Seated at ${table.config.label}!`, '#EC4899');
          return { ok: true };
        }
        return { ok: false, message: 'Table too small for group!' };
      }

      // Take Order
      if (status === 'WAITING_FOR_ORDER' || status === 'OCCUPIED') {
        const orderId = `ord_${this.nextId++}`;
        const res = this.customerManager.takeOrderAtTable(table.id, orderId, now);
        if (res.ok && res.dishId) {
          this.orders.push({
            id: orderId,
            tableId: table.id,
            tableLabel: table.config.label,
            dishId: res.dishId,
            status: 'queued',
            patience: table.patience,
            createdAt: now,
          });
          this.setActionAnim('waiter', 'taking_order', 1450);
          this.pushEvent(
            'order',
            table.config.col,
            table.config.row,
            `Order: ${RECIPES[res.dishId].shortName}`,
            '#3B82F6'
          );
          return { ok: true };
        }
      }

      // Deliver Food
      if (status === 'WAITING_FOR_FOOD' && player.carriedItem?.state === 'cooked') {
        const res = this.customerManager.deliverFoodToTable(table.id, player.carriedItem.dishId, now);
        if (res.wrongDish) {
          this.triggerEmote('waiter', 'Wrong dish!', 'angry');
          return { ok: false, message: 'Wrong dish for this table!' };
        }
        if (res.ok) {
          const preppedBonus = player.carriedItem.prepped ? 25 : 0;
          if (preppedBonus > 0) {
            this.cashierTips += preppedBonus;
          }
          player.carriedItem = null;
          if (table.orderId) {
            this.orders = this.orders.filter((o) => o.id !== table.orderId);
            table.orderId = null;
          }
          this.setActionAnim('waiter', 'serving_food', 1350);
          this.pushEvent(
            'serve',
            table.config.col,
            table.config.row,
            preppedBonus > 0 ? 'Gourmet! +$25 Tip Jar' : 'Enjoy!',
            '#10B981'
          );
          return { ok: true };
        }
      }

      // Collect Bill -> customers happily stand up, walk to exit, and table turns DIRTY
      if (status === 'WAITING_FOR_BILL' && table.dishId) {
        const total = this.settleTableBill(table.id, 0, now);
        if (total > 0) {
          this.setActionAnim('waiter', 'collecting_payment', 1450);
          if (this.combo >= 3) {
            this.setActionAnim('chef', 'happy', 1300);
          }
          this.pushEvent('score', table.config.col, table.config.row, `+$${total}`, '#16A34A');
          if (this.combo >= 2) {
            this.pushEvent('combo', table.config.col, table.config.row - 0.5, `${this.combo}x Combo!`, '#F59E0B');
          }
          return { ok: true };
        }
      }

      // Start Cleaning a DIRTY table (DIRTY -> CLEANING -> AVAILABLE)
      if (status === 'DIRTY' && !player.carriedItem) {
        if (this.customerManager.startTableCleaning(table.id, 'waiter', now)) {
          this.setActionAnim('waiter', 'cleaning_table', 1350);
          this.pushEvent('clean', table.config.col, table.config.row, 'Cleaning...', '#0EA5E9');
          return { ok: true };
        }
      }

      return { ok: false };
    }

    return { ok: false };
  }

  private settleTableBill(tableId: string, expressCashierBonus: number, nowMs: number): number {
    const res = this.customerManager.collectBillAtTable(tableId, nowMs);
    if (!res.ok || !res.dishId) return 0;

    const recipe = RECIPES[res.dishId];
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.ordersCompleted += 1;

    const groupBonus = Math.max(0, (res.groupSize ?? 1) - 1) * 25;
    const tip =
      Math.round((res.patience ?? 0.5) * 60 + Math.min(this.combo - 1, 6) * 20) +
      expressCashierBonus +
      groupBonus;
    const total = recipe.basePrice + tip;
    this.score += total;
    this.tipsEarned += tip;
    this.cashierTips += 15;
    return total;
  }

  private syncOrderStatus(dishId: DishId, nextStatus: 'cooking' | 'on_pass'): void {
    const order = this.orders.find(
      (o) => o.dishId === dishId && (nextStatus === 'cooking' ? o.status === 'queued' : o.status !== 'on_pass')
    );
    if (order) {
      order.status = nextStatus;
    }
  }

  private pickTarget<T extends { id: string; col: number; row: number }>(
    player: PlayerAvatarState,
    candidates: T[],
    targetId: string | undefined,
    maxDist: number
  ): T | null {
    if (targetId) {
      const explicit = candidates.find((c) => c.id === targetId);
      if (explicit) {
        const d = Math.hypot(player.col - explicit.col, player.row - explicit.row);
        if (d <= maxDist + 1.2) return explicit;
      }
    }
    let best: T | null = null;
    let bestDist = maxDist;
    for (const c of candidates) {
      const d = Math.hypot(player.col - c.col, player.row - c.row);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  private pushEvent(
    type: GameEffectEvent['type'],
    col: number,
    row: number,
    text: string,
    color: string
  ): void {
    this.recentEvents.push({
      id: `evt_${this.nextId++}`,
      type,
      col,
      row,
      text,
      color,
    });
    if (this.recentEvents.length > 10) {
      this.recentEvents.shift();
    }
  }

  private syncViewsFromManagers(nowMs: number): void {
    const tableSnaps = this.tableManager.getSnapshots(nowMs);
    this.tables = tableSnaps.map((snap) => {
      let leadCustomerVisual: DiningTableState['customer'] = null;
      const firstSeat = snap.seats.find((s) => s.occupiedByCustomerId || s.reservedByCustomerId);
      const cid = firstSeat?.occupiedByCustomerId ?? firstSeat?.reservedByCustomerId ?? null;
      if (cid) {
        const c = this.customerManager.getCustomer(cid);
        if (c) {
          leadCustomerVisual = {
            id: c.id,
            name: c.profile.name,
            hairColor: c.profile.hairColor,
            shirtColor: c.profile.shirtColor,
            skinTone: c.profile.skinTone,
          };
        }
      }

      return {
        id: snap.id,
        label: snap.label,
        col: snap.col,
        row: snap.row,
        status: mapPhase05ToLegacyTableStatus(snap.status),
        phase05Status: snap.status,
        capacity: snap.capacity,
        occupancy: snap.occupancy,
        assignedGroupId: snap.assignedGroupId,
        cleaningProgress: snap.cleaningProgress,
        reservationRemainingMs: snap.reservationRemainingMs,
        customer: leadCustomerVisual,
        dishId: snap.dishId,
        patience: snap.patience,
        actionTimer: snap.status === 'CLEANING' ? snap.cleaningProgress : snap.actionTimer,
        orderId: snap.orderId,
      };
    });

    // Keep legacy waitingQueue synced from CustomerQueueManager
    const queueEntries = this.customerManager.queue.getEntries();
    const mappedQueue: WaitingCustomer[] = [];
    for (const entry of queueEntries) {
      for (const cid of entry.memberIds) {
        const c = this.customerManager.getCustomer(cid);
        if (!c) continue;
        mappedQueue.push({
          id: c.id,
          visual: {
            id: c.id,
            name: c.profile.name,
            hairColor: c.profile.hairColor,
            shirtColor: c.profile.shirtColor,
            skinTone: c.profile.skinTone,
          },
          dishId: c.dishId,
          patience: c.getPatienceRatio(),
          arrivedAt: entry.enqueuedAtMs,
        });
      }
    }
    this.waitingQueue = mappedQueue;

    // Sync order patience from active tables
    for (const ord of this.orders) {
      const tbl = this.tableManager.getTable(ord.tableId);
      if (tbl) {
        ord.patience = tbl.patience;
      }
    }
  }

  public tick(dtOverrideSeconds?: number, nowOverrideMs?: number): GameSnapshot {
    const now = nowOverrideMs ?? Date.now();
    const dt =
      dtOverrideSeconds !== undefined
        ? Math.max(0, Math.min(0.25, dtOverrideSeconds))
        : Math.min(0.25, (now - this.lastTickMs) / 1000);
    this.lastTickMs = now;

    if (this.phase === 'playing') {
      this.timeRemaining = Math.max(0, this.timeRemaining - dt);

      // Clear expired emotes and action animations
      (['chef', 'waiter'] as PlayerRole[]).forEach((r) => {
        if (this.players[r].emote && now > this.players[r].emoteUntil) {
          this.players[r].emote = null;
        }
        if (this.players[r].actionAnim && now > this.players[r].actionAnimUntil) {
          this.players[r].actionAnim = null;
        }
      });

      // Advance authoritative Phase 05 CustomerManager + TableManager
      const progressRatio = 1 - this.timeRemaining / this.shiftDurationSeconds;
      this.customerManager.update(dt, now, progressRatio);

      // Cooking stations progress & burn timer (prepped dishes cook 35% faster; respects mode multipliers)
      for (const st of this.stations) {
        if (!st.dishId) continue;
        const recipe = RECIPES[st.dishId];
        const prepSpeedMul = this.stationPrepped.get(st.id) ? 1.35 : 1.0;
        const effectiveCookSeconds = Math.max(0.5, recipe.cookSeconds * this.cookDurationMultiplier);
        const effectiveBurnSeconds = Math.max(1.0, recipe.burnSeconds * this.burnDurationMultiplier);
        if (st.status === 'cooking') {
          st.progress += (dt * prepSpeedMul) / effectiveCookSeconds;
          if (st.progress >= 1) {
            st.progress = 1;
            st.status = 'ready';
            this.pushEvent('serve', st.col, st.row, 'Ready!', '#22C55E');
          }
        } else if (st.status === 'ready') {
          st.burnProgress += dt / effectiveBurnSeconds;
          if (st.burnProgress >= 1) {
            st.burnProgress = 1;
            st.status = 'burned';
            this.ordersBurned += 1;
            this.combo = 0;
            this.score = Math.max(0, this.score - 25);
            this.setActionAnim('chef', 'burnt_reaction', 1800);
            this.pushEvent('burn', st.col, st.row, 'BURNED! -$25', '#DC2626');
          }
        }
      }

      this.syncViewsFromManagers(now);

      // End of shift
      if (this.timeRemaining <= 0) {
        this.phase = 'finished';
        if (this.onFinish) {
          this.onFinish(this.buildSummary('chef'));
        }
      }
    }

    const snap = this.getSnapshot();
    this.recentEvents = [];
    return snap;
  }

  public computeStars(): number {
    if (this.score >= this.targetScores[2]) return 3;
    if (this.score >= this.targetScores[1]) return 2;
    if (this.score >= this.targetScores[0]) return 1;
    return 0;
  }

  public buildSummary(myRole: PlayerRole): MatchSummary {
    return {
      roomCode: this.roomCode,
      mode: this.mode,
      score: this.score,
      stars: this.computeStars(),
      ordersCompleted: this.ordersCompleted,
      ordersBurned: this.ordersBurned,
      customersLost: this.customersLost,
      tipsEarned: this.tipsEarned,
      maxCombo: this.maxCombo,
      durationSeconds: Math.round(this.shiftDurationSeconds - this.timeRemaining),
      chefName: this.players.chef.name,
      waiterName: this.players.waiter.name,
      myRole,
    };
  }

  public getSnapshot(): GameSnapshot {
    return {
      roomCode: this.roomCode,
      mode: this.mode,
      phase: this.phase,
      timeRemaining: Number(this.timeRemaining.toFixed(1)),
      totalDuration: this.shiftDurationSeconds,
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      ordersCompleted: this.ordersCompleted,
      ordersBurned: this.ordersBurned,
      customersLost: this.customersLost,
      tipsEarned: this.tipsEarned,
      targetScores: [...this.targetScores] as [number, number, number],
      players: {
        chef: { ...this.players.chef },
        waiter: { ...this.players.waiter },
      },
      stations: this.stations.map((s) => ({ ...s })),
      prepTableItem: this.prepTableItem ? { ...this.prepTableItem } : null,
      servingPass: this.servingPass.map((p) => ({
        ...p,
        item: p.item ? { ...p.item } : null,
      })),
      tables: this.tables.map((t) => ({
        ...t,
        customer: t.customer ? { ...t.customer } : null,
      })),
      waitingQueue: this.waitingQueue.map((w) => ({
        ...w,
        visual: { ...w.visual },
      })),
      customers: this.customerManager.getCustomerSnapshots(),
      restaurantMetrics: this.customerManager.getMetrics(),
      orders: this.orders.map((o) => ({ ...o })),
      orderSystem: this.orderService.getSnapshot(),
      cashierTips: this.cashierTips,
      waiterCleanBuffUntil: this.waiterCleanBuffUntil,
      recentEvents: [...this.recentEvents],
      pausedBy: this.pausedBy,
    };
  }
}
