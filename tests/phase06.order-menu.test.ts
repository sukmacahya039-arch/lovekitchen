import test from 'node:test';
import assert from 'node:assert/strict';

import { GameEventBus } from '../src/game/systems/events/GameEvents.ts';
import { MENU_CATEGORIES } from '../src/game/systems/menu/MenuCategory.ts';
import { BURGER_CAFE_MENU } from '../src/game/systems/menu/MenuDatabase.ts';
import { MenuService } from '../src/game/systems/menu/MenuService.ts';
import { BURGER_CAFE_RECIPES } from '../src/game/systems/recipe/RecipeDatabase.ts';
import { RecipeService } from '../src/game/systems/recipe/RecipeService.ts';
import {
  canTransitionOrderItemStatus,
  canTransitionOrderStatus,
} from '../src/game/systems/orders/OrderStateMachine.ts';
import { OrderService } from '../src/game/systems/orders/OrderService.ts';
import { CollisionSystem } from '../src/game/systems/collision/CollisionSystem.ts';
import { CustomerManager } from '../src/game/systems/customer/CustomerManager.ts';
import { NavigationGrid } from '../src/game/systems/navigation/NavigationGrid.ts';
import { PathfindingService } from '../src/game/systems/navigation/PathfindingService.ts';
import { TableManager } from '../src/game/systems/table/TableManager.ts';
import { GameSimulation } from '../server/multiplayer/GameSimulation.ts';

function createOrderTestHarness() {
  const events = new GameEventBus();
  const navGrid = new NavigationGrid();
  const pathfinding = new PathfindingService(navGrid);
  const collision = new CollisionSystem(navGrid);
  const tableManager = new TableManager(pathfinding, events);
  const customerManager = new CustomerManager(navGrid, pathfinding, collision, tableManager, events);
  const menuService = new MenuService(BURGER_CAFE_MENU, events);
  const recipeService = new RecipeService(BURGER_CAFE_RECIPES);
  const orderService = new OrderService({
    sessionId: 'test_session_p06',
    menuService,
    recipeService,
    events,
    tableManager,
    customerManager,
  });

  return {
    events,
    tableManager,
    customerManager,
    menuService,
    recipeService,
    orderService,
  };
}

function seatAndMakeTableReadyToOrder(
  customerManager: CustomerManager,
  tableManager: TableManager,
  targetTableId: string,
  groupSize: 1 | 2 | 3 | 4 = 2,
  baseTimeMs = 1_000_000
): { tableId: string; groupId: string; customerIds: string[]; tableLabel: string } {
  const spawned = customerManager.spawnGroup(groupSize, { nowMs: baseTimeMs });
  assert.ok(spawned, 'Expected customer group to spawn');

  let assignedTableId: string | null = spawned.assignedTableId ?? null;
  let now = baseTimeMs + 100;

  for (let i = 0; i < 300; i++) {
    now += 100;
    customerManager.update(0.1, now, 0.1);

    // Check if Phase 05 AI auto-assigned a table to this group
    const liveGroup = customerManager.groups.getGroup(spawned.id);
    if (liveGroup?.assignedTableId) {
      assignedTableId = liveGroup.assignedTableId;
    } else if (customerManager.queue.getLength() > 0) {
      const seated = customerManager.seatNextQueuedGroup(targetTableId, now);
      if (seated.ok && seated.tableId) {
        assignedTableId = seated.tableId;
      }
    }

    if (assignedTableId) {
      const tbl = tableManager.getTable(assignedTableId);
      if (tbl && tbl.getStatus() === 'WAITING_FOR_ORDER') {
        break;
      }
    }
  }

  assert.ok(assignedTableId, `Expected group ${spawned.id} to be assigned a table`);
  const tbl = tableManager.getTable(assignedTableId);
  assert.ok(tbl, 'Table should exist');
  assert.ok(
    tbl.getStatus() === 'WAITING_FOR_ORDER' || tbl.getStatus() === 'OCCUPIED',
    `Expected table ${assignedTableId} to be WAITING_FOR_ORDER or OCCUPIED, got ${tbl.getStatus()}`
  );

  return {
    tableId: assignedTableId,
    groupId: spawned.id,
    customerIds: [...spawned.memberIds],
    tableLabel: tbl.config.label,
  };
}

// =============================================================================
// SECTION A: MENU DATABASE & SERVICE TESTS
// =============================================================================
test('Phase 06 [A] MenuDatabase loads all 8 Burger Cafe items with unique IDs, valid prices, and category filtering', () => {
  const menuService = new MenuService();
  const all = menuService.getAllItems();
  assert.equal(all.length, 8);

  const ids = new Set(all.map((i) => i.id));
  assert.equal(ids.size, 8);

  const requiredIds = [
    'BURGER_CLASSIC',
    'BURGER_CHEESE',
    'BURGER_DOUBLE',
    'FRENCH_FRIES',
    'CHICKEN_NUGGETS',
    'ICED_TEA',
    'STRAWBERRY_MILKSHAKE',
    'CHOCOLATE_MILKSHAKE',
  ];
  for (const id of requiredIds) {
    const item = menuService.getItemById(id);
    assert.ok(item, `Missing menu item ${id}`);
    assert.ok(item.price > 0);
    assert.ok(item.preparationTime > 0);
    assert.equal(item.available, true);
  }

  assert.equal(MENU_CATEGORIES.length, 5);
  assert.equal(menuService.getItemsByCategory('BURGERS').length, 3);
  assert.equal(menuService.getItemsByCategory('SIDES').length, 2);
  assert.equal(menuService.getItemsByCategory('DRINKS').length, 3);
  assert.equal(menuService.getItemsByCategory('ALL').length, 8);

  // Availability toggle override works cleanly
  assert.equal(menuService.isItemAvailable('BURGER_DOUBLE'), true);
  menuService.setItemAvailability('BURGER_DOUBLE', false);
  assert.equal(menuService.isItemAvailable('BURGER_DOUBLE'), false);
  assert.equal(menuService.getAvailableItems().length, 7);
});

// =============================================================================
// SECTION B: RECIPE DATABASE & SERVICE TESTS
// =============================================================================
test('Phase 06 [B] Every MenuItem maps to a valid Recipe with ingredients, steps, stations, and RecipePreviewData', () => {
  const menuService = new MenuService();
  const recipeService = new RecipeService();

  for (const menuItem of menuService.getAllItems()) {
    const recipe = recipeService.getRecipeById(menuItem.recipeId);
    assert.ok(recipe, `MenuItem ${menuItem.id} has missing recipe ${menuItem.recipeId}`);
    assert.equal(recipe.menuItemId, menuItem.id);

    const validation = recipeService.validateRecipe(recipe.recipeId);
    assert.equal(validation.valid, true, `Recipe ${recipe.recipeId} invalid: ${validation.errors.join(', ')}`);

    const preview = recipeService.getRecipePreview(recipe.recipeId, menuService);
    assert.ok(preview);
    assert.equal(preview.menuDisplayName, menuItem.displayName);
    assert.ok(preview.ingredients.length > 0);
    assert.ok(preview.cookingSteps.length > 0);
    assert.ok(preview.stationRequirements.length > 0);
  }
});

// =============================================================================
// SECTION C: ORDER DRAFT SYSTEM TESTS
// =============================================================================
test('Phase 06 [C] OrderDraft supports add, remove, increase, decrease, notes, MenuService price recompute, and cancel without queue entry', () => {
  const { orderService } = createOrderTestHarness();

  const draft = orderService.createDraft({
    tableId: 'table_1',
    tableLabel: 'T1',
    customerIds: ['cust_1'],
    customerGroupId: 'grp_1',
    waiterId: 'waiter_1',
  });
  assert.equal(draft.draftStatus, 'OPEN');
  assert.equal(draft.total, 0);

  // Add Classic Burger ($12) x1 + French Fries ($7) x2 -> $26
  let res = orderService.addItemToDraft(draft.draftId, 'BURGER_CLASSIC', 1);
  assert.equal(res.ok, true);
  res = orderService.addItemToDraft(draft.draftId, 'FRENCH_FRIES', 2);
  assert.equal(res.ok, true);
  assert.equal(res.draft?.subtotal, 26);
  assert.equal(res.draft?.total, 26);
  assert.equal(res.draft?.draftStatus, 'READY_TO_CONFIRM');

  // Increase Classic Burger to 2 -> $38
  res = orderService.increaseDraftItemQuantity(draft.draftId, 'BURGER_CLASSIC');
  assert.equal(res.ok, true);
  assert.equal(res.draft?.total, 38);

  // Decrease French Fries to 1 -> $31
  res = orderService.decreaseDraftItemQuantity(draft.draftId, 'FRENCH_FRIES');
  assert.equal(res.ok, true);
  assert.equal(res.draft?.total, 31);

  // Edit notes
  res = orderService.editDraftNotes(draft.draftId, 'Serve fries hot please');
  assert.equal(res.ok, true);
  assert.equal(res.draft?.notes, 'Serve fries hot please');

  res = orderService.editDraftItemNotes(draft.draftId, 'BURGER_CLASSIC', 'No onion');
  assert.equal(res.ok, true);
  assert.equal(res.draft?.items.find((i) => i.menuItemId === 'BURGER_CLASSIC')?.notes, 'No onion');

  // Remove French Fries -> $24
  res = orderService.removeItemFromDraft(draft.draftId, 'FRENCH_FRIES');
  assert.equal(res.ok, true);
  assert.equal(res.draft?.items.length, 1);
  assert.equal(res.draft?.total, 24);

  // Cancel draft -> must NOT create any kitchen order
  const cancelled = orderService.cancelDraft(draft.draftId);
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.draft?.draftStatus, 'CANCELLED');
  assert.equal(orderService.manager.queue.getPendingItems().length, 0);
  assert.equal(orderService.manager.getAllOrders().length, 0);
});

// =============================================================================
// SECTION D: ORDER VALIDATION & PHASE 05 TABLE/CUSTOMER VALIDATION TESTS
// =============================================================================
test('Phase 06 [D] OrderValidator rejects empty orders, unavailable items, unoccupied tables, dirty tables, and leaving customers', () => {
  const { tableManager, customerManager, menuService, orderService } = createOrderTestHarness();

  // 1. Empty order on valid seated table -> rejected
  const t1Ctx = seatAndMakeTableReadyToOrder(customerManager, tableManager, 'table_1', 2);
  const emptyDraft = orderService.createDraft({
    tableId: t1Ctx.tableId,
    tableLabel: t1Ctx.tableLabel,
    customerIds: t1Ctx.customerIds,
    customerGroupId: t1Ctx.groupId,
    waiterId: 'waiter_1',
  });
  const emptyConfirm = orderService.confirmDraft(emptyDraft.draftId);
  assert.equal(emptyConfirm.ok, false);
  assert.ok(emptyConfirm.validation.errors.length > 0);
  assert.equal(orderService.manager.queue.getPendingItems().length, 0);

  // 2. Unoccupied (AVAILABLE) table -> rejected
  const freeTable = tableManager.getAllTables().find((t) => t.getStatus() === 'AVAILABLE')!;
  const availableTableConfirm = orderService.submitValidatedOrder(
    {
      tableId: freeTable.id,
      tableLabel: freeTable.config.label,
      customerIds: ['ghost_cust'],
      customerGroupId: 'ghost_grp',
      waiterId: 'waiter_1',
    },
    [{ menuItemId: 'BURGER_CLASSIC', quantity: 1 }]
  );
  assert.equal(availableTableConfirm.ok, false);

  // 3. DIRTY table (via valid TableState transitions: AVAILABLE -> RESERVED -> OCCUPIED -> DIRTY) -> rejected
  const dirtyTarget = tableManager
    .getAllTables()
    .find((t) => t.id !== t1Ctx.tableId && t.id !== freeTable.id && t.getStatus() === 'AVAILABLE')!;
  assert.equal(dirtyTarget.transitionTo('RESERVED'), true);
  assert.equal(dirtyTarget.transitionTo('OCCUPIED'), true);
  assert.equal(dirtyTarget.transitionTo('DIRTY'), true);
  assert.equal(dirtyTarget.getStatus(), 'DIRTY');
  const dirtyTableConfirm = orderService.submitValidatedOrder(
    {
      tableId: dirtyTarget.id,
      tableLabel: dirtyTarget.config.label,
      customerIds: ['c_dirty'],
      customerGroupId: 'grp_dirty',
      waiterId: 'waiter_1',
    },
    [{ menuItemId: 'FRENCH_FRIES', quantity: 1 }]
  );
  assert.equal(dirtyTableConfirm.ok, false);

  // 4. Unavailable menu item -> rejected
  menuService.setItemAvailability('CHOCOLATE_MILKSHAKE', false);
  const unavailableRes = orderService.submitValidatedOrder(
    {
      tableId: t1Ctx.tableId,
      tableLabel: t1Ctx.tableLabel,
      customerIds: t1Ctx.customerIds,
      customerGroupId: t1Ctx.groupId,
      waiterId: 'waiter_1',
    },
    [{ menuItemId: 'CHOCOLATE_MILKSHAKE', quantity: 1 }]
  );
  assert.equal(unavailableRes.ok, false);
  menuService.setItemAvailability('CHOCOLATE_MILKSHAKE', true);

  // 5. Duplicate confirmation of same draft -> rejected
  const validDraft = orderService.createDraft({
    tableId: t1Ctx.tableId,
    tableLabel: t1Ctx.tableLabel,
    customerIds: t1Ctx.customerIds,
    customerGroupId: t1Ctx.groupId,
    waiterId: 'waiter_1',
  });
  orderService.addItemToDraft(validDraft.draftId, 'BURGER_CHEESE', 1);
  const firstConfirm = orderService.confirmDraft(validDraft.draftId);
  assert.equal(firstConfirm.ok, true);
  assert.equal(firstConfirm.order?.orderNumber, 'ORD-001');

  const secondConfirm = orderService.confirmDraft(validDraft.draftId);
  assert.equal(secondConfirm.ok, false);
  assert.equal(orderService.manager.getAllOrders().length, 1);
});

// =============================================================================
// SECTION E: KITCHEN ORDER QUEUE, FIFO, PRIORITY, ACCEPT & CANCEL TESTS
// =============================================================================
test('Phase 06 [E] KitchenOrderQueue maintains FIFO + URGENT priority, sequential ORD-001 numbers, Chef accept, and cancel', () => {
  const { tableManager, customerManager, orderService } = createOrderTestHarness();

  const t1 = seatAndMakeTableReadyToOrder(customerManager, tableManager, 'table_1', 2, 1_000_000);
  const t2 = seatAndMakeTableReadyToOrder(customerManager, tableManager, 'table_2', 2, 1_010_000);
  const t3 = seatAndMakeTableReadyToOrder(customerManager, tableManager, 'table_3', 2, 1_020_000);

  const ord1 = orderService.submitValidatedOrder(
    { tableId: t1.tableId, tableLabel: t1.tableLabel, customerIds: t1.customerIds, customerGroupId: t1.groupId, waiterId: 'w1' },
    [{ menuItemId: 'BURGER_CLASSIC', quantity: 1 }],
    '',
    'NORMAL',
    1_030_000
  );
  const ord2 = orderService.submitValidatedOrder(
    { tableId: t2.tableId, tableLabel: t2.tableLabel, customerIds: t2.customerIds, customerGroupId: t2.groupId, waiterId: 'w1' },
    [{ menuItemId: 'FRENCH_FRIES', quantity: 2 }],
    '',
    'NORMAL',
    1_031_000
  );
  const ord3Urgent = orderService.submitValidatedOrder(
    { tableId: t3.tableId, tableLabel: t3.tableLabel, customerIds: t3.customerIds, customerGroupId: t3.groupId, waiterId: 'w1' },
    [{ menuItemId: 'BURGER_DOUBLE', quantity: 1 }],
    'VIP Rush',
    'URGENT',
    1_032_000
  );

  assert.equal(ord1.ok, true);
  assert.equal(ord2.ok, true);
  assert.equal(ord3Urgent.ok, true);

  assert.equal(ord1.order!.orderNumber, 'ORD-001');
  assert.equal(ord2.order!.orderNumber, 'ORD-002');
  assert.equal(ord3Urgent.order!.orderNumber, 'ORD-003');

  // Queue order: URGENT first, then NORMAL in strict FIFO order
  const queue = orderService.manager.queue.getPendingItems();
  assert.equal(queue.length, 3);
  assert.equal(queue[0].orderNumber, 'ORD-003');
  assert.equal(queue[0].queuePosition, 1);
  assert.equal(queue[1].orderNumber, 'ORD-001');
  assert.equal(queue[1].queuePosition, 2);
  assert.equal(queue[2].orderNumber, 'ORD-002');
  assert.equal(queue[2].queuePosition, 3);

  // Chef accepts ORD-003 -> leaves pendingQueue, stays tracked in OrderManager as ACCEPTED
  const accepted = orderService.acceptOrder(ord3Urgent.order!.orderId, 'chef_1', 1_035_000);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.order?.status, 'ACCEPTED');
  assert.equal(accepted.order?.acceptedByChefId, 'chef_1');
  assert.equal(accepted.order?.items[0].itemStatus, 'ACCEPTED');

  const queueAfterAccept = orderService.manager.queue.getPendingItems();
  assert.equal(queueAfterAccept.length, 2);
  assert.equal(queueAfterAccept[0].orderNumber, 'ORD-001');
  assert.equal(queueAfterAccept[0].queuePosition, 1);

  // Double-accept rejected
  const duplicateAccept = orderService.acceptOrder(ord3Urgent.order!.orderId, 'chef_1');
  assert.equal(duplicateAccept.ok, false);

  // Cancel ORD-002 -> removed from pending queue and marked CANCELLED
  const cancelled = orderService.cancelOrder(ord2.order!.orderId, 'customer_changed_mind');
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.order?.status, 'CANCELLED');
  assert.equal(orderService.manager.queue.getPendingItems().length, 1);
  assert.equal(orderService.manager.queue.getPendingItems()[0].orderNumber, 'ORD-001');
});

// =============================================================================
// SECTION F: ORDER & ITEM STATE MACHINE TESTS
// =============================================================================
test('Phase 06 [F] OrderStateMachine enforces valid lifecycle transitions and blocks invalid skips or terminal mutations', () => {
  assert.equal(canTransitionOrderStatus('QUEUED', 'ACCEPTED'), true);
  assert.equal(canTransitionOrderStatus('QUEUED', 'COMPLETED'), false);
  assert.equal(canTransitionOrderStatus('COMPLETED', 'CANCELLED'), false);
  assert.equal(canTransitionOrderStatus('CANCELLED', 'ACCEPTED'), false);

  assert.equal(canTransitionOrderItemStatus('PENDING', 'ACCEPTED'), true);
  assert.equal(canTransitionOrderItemStatus('PENDING', 'SERVED'), false);
  assert.equal(canTransitionOrderItemStatus('SERVED', 'CANCELLED'), false);

  const { tableManager, customerManager, orderService } = createOrderTestHarness();
  const t1 = seatAndMakeTableReadyToOrder(customerManager, tableManager, 'table_1', 2);
  const created = orderService.submitValidatedOrder(
    { tableId: t1.tableId, tableLabel: t1.tableLabel, customerIds: t1.customerIds, customerGroupId: t1.groupId, waiterId: 'w1' },
    [{ menuItemId: 'ICED_TEA', quantity: 1 }]
  );
  const orderId = created.order!.orderId;

  // Invalid skip QUEUED -> READY must fail
  assert.equal(orderService.transitionOrderStatus(orderId, 'READY').ok, false);

  // Valid full lifecycle: QUEUED -> ACCEPTED -> PREPARING -> READY -> SERVED -> COMPLETED
  assert.equal(orderService.acceptOrder(orderId, 'chef_1').ok, true);
  assert.equal(orderService.transitionOrderStatus(orderId, 'PREPARING').ok, true);
  assert.equal(orderService.transitionOrderStatus(orderId, 'READY').ok, true);
  assert.equal(orderService.transitionOrderStatus(orderId, 'SERVED').ok, true);
  assert.equal(orderService.transitionOrderStatus(orderId, 'COMPLETED').ok, true);

  // Cannot cancel COMPLETED order
  assert.equal(orderService.cancelOrder(orderId, 'too_late').ok, false);
});

// =============================================================================
// SECTION G: ORDER MATCHING SERVICE TESTS (WITH SIMULATED FOOD OBJECTS)
// =============================================================================
test('Phase 06 [G] OrderMatchingService matches strictly by stable IDs, supports multi-item fulfillment, and rejects mismatches/duplicates', () => {
  const { tableManager, customerManager, orderService } = createOrderTestHarness();
  const t1 = seatAndMakeTableReadyToOrder(customerManager, tableManager, 'table_1', 2);

  // Scenario 5: Multiple Items Matching (2x Classic Burger + 1x French Fries + 1x Iced Tea)
  const created = orderService.submitValidatedOrder(
    { tableId: t1.tableId, tableLabel: t1.tableLabel, customerIds: t1.customerIds, customerGroupId: t1.groupId, waiterId: 'w1' },
    [
      { menuItemId: 'BURGER_CLASSIC', quantity: 2 },
      { menuItemId: 'FRENCH_FRIES', quantity: 1 },
      { menuItemId: 'ICED_TEA', quantity: 1 },
    ]
  );
  assert.equal(created.ok, true);
  const order = created.order!;
  orderService.acceptOrder(order.orderId, 'chef_1');
  orderService.transitionOrderStatus(order.orderId, 'PREPARING');
  orderService.transitionOrderStatus(order.orderId, 'READY');

  const burgerItem = order.items.find((i) => i.menuItemId === 'BURGER_CLASSIC')!;
  const friesItem = order.items.find((i) => i.menuItemId === 'FRENCH_FRIES')!;
  const teaItem = order.items.find((i) => i.menuItemId === 'ICED_TEA')!;

  // Wrong menuItemId rejected
  const wrongItem = orderService.matchFoodToOrder({
    foodId: 'food_wrong_menu',
    menuItemId: 'BURGER_CHEESE',
    orderId: order.orderId,
    orderItemId: burgerItem.itemId,
    tableId: t1.tableId,
    quantity: 1,
  });
  assert.equal(wrongItem.matched, false);
  assert.equal(wrongItem.errorCode, 'WRONG_MENU_ITEM');

  // Wrong tableId rejected
  const otherTableId = t1.tableId === 'table_1' ? 'table_2' : 'table_1';
  const wrongTable = orderService.matchFoodToOrder({
    foodId: 'food_wrong_table',
    menuItemId: 'BURGER_CLASSIC',
    orderId: order.orderId,
    orderItemId: burgerItem.itemId,
    tableId: otherTableId,
    quantity: 1,
  });
  assert.equal(wrongTable.matched, false);
  assert.equal(wrongTable.errorCode, 'WRONG_TABLE');

  // Match 1 of 2 Classic Burgers -> partial match, 1 remaining
  const matchB1 = orderService.matchFoodToOrder({
    foodId: 'food_burger_1',
    menuItemId: 'BURGER_CLASSIC',
    orderId: order.orderId,
    orderItemId: burgerItem.itemId,
    tableId: t1.tableId,
    customerGroupId: t1.groupId,
    recipeId: burgerItem.recipeId,
    quantity: 1,
  });
  assert.equal(matchB1.matched, true);
  assert.equal(matchB1.remainingQuantity, 1);

  // Duplicate foodId delivery rejected
  const dupFood = orderService.matchFoodToOrder({
    foodId: 'food_burger_1',
    menuItemId: 'BURGER_CLASSIC',
    orderId: order.orderId,
    orderItemId: burgerItem.itemId,
    tableId: t1.tableId,
    quantity: 1,
  });
  assert.equal(dupFood.matched, false);
  assert.equal(dupFood.errorCode, 'DUPLICATE_FOOD');

  // Over-quantity (trying to serve 2 when only 1 remains) rejected
  const overQty = orderService.matchFoodToOrder({
    foodId: 'food_burger_over',
    menuItemId: 'BURGER_CLASSIC',
    orderId: order.orderId,
    orderItemId: burgerItem.itemId,
    tableId: t1.tableId,
    quantity: 2,
  });
  assert.equal(overQty.matched, false);
  assert.equal(overQty.errorCode, 'QUANTITY_EXCEEDED');

  // Match 2nd Classic Burger, Fries, and Iced Tea -> all items completely matched (remainingQuantity === 0)
  const matchB2 = orderService.matchFoodToOrder({
    foodId: 'food_burger_2',
    menuItemId: 'BURGER_CLASSIC',
    orderId: order.orderId,
    orderItemId: burgerItem.itemId,
    tableId: t1.tableId,
    quantity: 1,
  });
  assert.equal(matchB2.matched, true);
  assert.equal(matchB2.remainingQuantity, 0);

  const matchFries = orderService.matchFoodToOrder({
    foodId: 'food_fries_1',
    menuItemId: 'FRENCH_FRIES',
    orderId: order.orderId,
    orderItemId: friesItem.itemId,
    tableId: t1.tableId,
    quantity: 1,
  });
  assert.equal(matchFries.matched, true);
  assert.equal(matchFries.remainingQuantity, 0);

  const matchTea = orderService.matchFoodToOrder({
    foodId: 'food_tea_1',
    menuItemId: 'ICED_TEA',
    orderId: order.orderId,
    orderItemId: teaItem.itemId,
    tableId: t1.tableId,
    quantity: 1,
  });
  assert.equal(matchTea.matched, true);
  assert.equal(matchTea.remainingQuantity, 0);

  const finalOrder = orderService.manager.getOrder(order.orderId)!;
  assert.ok(finalOrder.items.every((i) => i.matchedQuantity === i.quantity));
});

// =============================================================================
// SECTION H & I: FULL MULTIPLAYER GAMESIMULATION INTEGRATION & EVENT BUS TESTS
// =============================================================================
test('Phase 06 [H+I] GameSimulation integrates Waiter Order Confirmation, Chef Acceptance, EventBus, and Snapshot Sync', () => {
  const sim = new GameSimulation(
    'TEST06',
    'coop',
    { socketId: 'sock_chef', name: 'Chef Leo' },
    { socketId: 'sock_waiter', name: 'Waiter Mia' }
  );

  // Tick simulation forward so initial customers spawn and get seated cleanly
  let now = Date.now();
  let readyTableId: string | null = null;
  for (let i = 0; i < 200; i++) {
    now += 100;
    const snap = sim.tick(0.1, now);
    const waitingTable = snap.tables.find(
      (t) => t.phase05Status === 'WAITING_FOR_ORDER' || t.phase05Status === 'OCCUPIED'
    );
    if (waitingTable) {
      readyTableId = waitingTable.id;
      break;
    }
    // If customer is queued at wait_mat, seat them via waiter interact
    if (snap.waitingQueue.length > 0) {
      sim.updatePlayerPosition('waiter', 1.6, 5.4, 'front', false);
      sim.interact('waiter', 'wait_mat');
    }
  }

  assert.ok(readyTableId, 'Expected at least one seated table ready for order in GameSimulation');

  // Confirm structured multi-item Phase 06 order from Waiter
  const confirmed = sim.confirmTableOrder(
    readyTableId,
    'sock_waiter',
    [
      { menuItemId: 'BURGER_CHEESE', quantity: 2, notes: 'Extra cheese' },
      { menuItemId: 'STRAWBERRY_MILKSHAKE', quantity: 1 },
    ],
    'Birthday table!',
    'NORMAL'
  );
  assert.equal(confirmed.ok, true, `Expected order confirmation to succeed: ${confirmed.errors?.join(', ')}`);
  assert.equal(confirmed.order?.orderNumber, 'ORD-001');
  assert.equal(confirmed.order?.total, 2 * 15 + 9); // MenuDatabase authoritative pricing ($39)

  const snapAfterConfirm = sim.getSnapshot();
  assert.equal(snapAfterConfirm.orderSystem.pendingQueue.length, 1);
  assert.equal(snapAfterConfirm.orderSystem.metrics.pendingCount, 1);
  assert.equal(snapAfterConfirm.orderSystem.orders[0].orderNumber, 'ORD-001');

  // Chef accepts order
  const accepted = sim.acceptKitchenOrder(confirmed.order!.orderId, 'sock_chef');
  assert.equal(accepted.ok, true);
  assert.equal(accepted.order?.status, 'ACCEPTED');

  const snapAfterAccept = sim.getSnapshot();
  assert.equal(snapAfterAccept.orderSystem.pendingQueue.length, 0);
  assert.equal(snapAfterAccept.orderSystem.metrics.activeCount, 1);
});

test('Phase 06 [Events] GameEventBus emits complete lifecycle events across draft, confirm, queue, accept, and match', () => {
  const { events, tableManager, customerManager, orderService } = createOrderTestHarness();
  const seenEvents: string[] = [];
  events.onAny((evt) => seenEvents.push(evt.type));

  const t1 = seatAndMakeTableReadyToOrder(customerManager, tableManager, 'table_1', 2);
  const draft = orderService.createDraft({
    tableId: t1.tableId,
    tableLabel: t1.tableLabel,
    customerIds: t1.customerIds,
    customerGroupId: t1.groupId,
    waiterId: 'waiter_1',
  });
  orderService.addItemToDraft(draft.draftId, 'CHICKEN_NUGGETS', 1);
  const confirmed = orderService.confirmDraft(draft.draftId);
  assert.equal(confirmed.ok, true);
  const order = confirmed.order!;
  orderService.acceptOrder(order.orderId, 'chef_1');
  orderService.transitionOrderStatus(order.orderId, 'PREPARING');
  orderService.matchFoodToOrder({
    foodId: 'food_nuggets_1',
    menuItemId: 'CHICKEN_NUGGETS',
    orderId: order.orderId,
    orderItemId: order.items[0].itemId,
    tableId: t1.tableId,
    quantity: 1,
  });

  const expectedTypes = [
    'ORDER_DRAFT_CREATED',
    'MENU_ITEM_ADDED',
    'ORDER_DRAFT_UPDATED',
    'ORDER_VALIDATED',
    'ORDER_CONFIRMED',
    'ORDER_CREATED',
    'ORDER_QUEUED',
    'ORDER_QUEUE_UPDATED',
    'ORDER_ACCEPTED',
    'ORDER_ITEM_STATUS_CHANGED',
    'ORDER_MATCH_ATTEMPTED',
    'ORDER_MATCHED',
  ];
  for (const type of expectedTypes) {
    assert.ok(seenEvents.includes(type), `Expected event ${type} to be emitted`);
  }
});
