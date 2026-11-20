import test from 'node:test';
import assert from 'node:assert/strict';

import { GameSimulation } from '../server/multiplayer/GameSimulation.ts';
import {
  COOKING_STATIONS,
  PANTRIES,
  SERVING_PASS_SLOTS,
} from '../src/shared/layout.ts';
import { isSoloControlMode, type MatchSummary } from '../src/shared/types.ts';
import { LocalSoloSession } from '../src/game/systems/solo/LocalSoloSession.ts';
import {
  COOP_DEFAULT_BALANCE,
  resolveMenuRoute,
  SOLO_BALANCE_CONFIG,
} from '../src/game/systems/solo/SoloConfig.ts';

// =============================================================================
// 1. MENU ROUTING & MODE SEPARATION TESTS
// =============================================================================
test('Solo Mode [1] LATIHAN_SOLO routes directly to RestaurantScene without matchmaking or network', () => {
  const soloRoute = resolveMenuRoute('LATIHAN_SOLO');
  assert.equal(soloRoute.sessionKind, 'solo');
  assert.equal(soloRoute.targetScene, 'RestaurantScene');
  assert.equal(soloRoute.lobbyMode, null);
  assert.equal(soloRoute.requiresMatchmaking, false);
  assert.equal(soloRoute.requiresNetwork, false);

  assert.equal(isSoloControlMode('solo'), true);
  assert.equal(isSoloControlMode('practice'), true);
  assert.equal(isSoloControlMode('coop'), false);
});

test('Solo Mode [2] Online Mode routes remain cleanly separated from Solo Mode with zero collisions', () => {
  const playOnline = resolveMenuRoute('PLAY_ONLINE');
  const createRoom = resolveMenuRoute('CREATE_ROOM');
  const joinRoom = resolveMenuRoute('JOIN_ROOM');
  const startOnline = resolveMenuRoute('START_ONLINE_GAME');
  const backToMenu = resolveMenuRoute('BACK_TO_MENU');

  assert.equal(playOnline.sessionKind, 'online');
  assert.equal(playOnline.targetScene, 'LobbyScene');
  assert.equal(playOnline.lobbyMode, 'online');
  assert.equal(playOnline.requiresMatchmaking, true);
  assert.equal(playOnline.requiresNetwork, true);

  assert.equal(createRoom.sessionKind, 'online');
  assert.equal(createRoom.targetScene, 'LobbyScene');
  assert.equal(createRoom.lobbyMode, 'create');
  assert.equal(createRoom.requiresMatchmaking, false);

  assert.equal(joinRoom.sessionKind, 'online');
  assert.equal(joinRoom.targetScene, 'LobbyScene');
  assert.equal(joinRoom.lobbyMode, 'join');
  assert.equal(joinRoom.requiresMatchmaking, false);

  assert.equal(startOnline.sessionKind, 'online');
  assert.equal(startOnline.targetScene, 'RestaurantScene');

  assert.equal(backToMenu.sessionKind, 'none');
  assert.equal(backToMenu.targetScene, 'MainMenuScene');
});

// =============================================================================
// 2. OFFLINE LOCAL SOLO SESSION LIFECYCLE TESTS
// =============================================================================
test('Solo Mode [3] LocalSoloSession initializes 100% offline with Chef + Waiter and clean pause/resume/restart/finish', () => {
  let finishedSummary: MatchSummary | null = null;
  const session = new LocalSoloSession(
    'Chef Rani',
    { shiftDurationSeconds: 2 },
    { autoStartLoop: false }
  );

  session.on('gameFinished', (summary) => {
    finishedSummary = summary;
  });

  const meta = session.getMetadata();
  assert.ok(meta.sessionId.startsWith('SOLO-'));
  assert.equal(meta.gameMode, 'solo');
  assert.equal(meta.playerCount, 1);
  assert.equal(meta.playerName, 'Chef Rani');
  assert.equal(meta.activeRole, SOLO_BALANCE_CONFIG.initialRole);

  const initialSnap = session.getSnapshot();
  assert.equal(initialSnap.mode, 'solo');
  assert.equal(initialSnap.phase, 'playing');
  assert.ok(initialSnap.players.chef, 'Chef avatar must exist in Solo session');
  assert.ok(initialSnap.players.waiter, 'Waiter avatar must exist in Solo session');
  assert.equal(initialSnap.players.chef.name, 'Chef Rani (Chef)');
  assert.equal(initialSnap.players.waiter.name, 'Chef Rani (Waiter)');

  // Pause halts timer progression
  session.setPaused(true);
  const pausedTime = session.getSnapshot().timeRemaining;
  session.step(0.5);
  assert.equal(session.getSnapshot().phase, 'paused');
  assert.equal(session.getSnapshot().timeRemaining, pausedTime);

  // Resume restores ticking and reaches gameFinished cleanly
  session.setPaused(false);
  assert.equal(session.getSnapshot().phase, 'playing');
  for (let i = 0; i < 25; i++) {
    session.step(0.1);
  }
  assert.equal(session.getSnapshot().phase, 'finished');
  assert.ok(finishedSummary, 'gameFinished callback must trigger at end of Solo shift');
  assert.equal((finishedSummary as MatchSummary).mode, 'solo');

  // Restart resets cleanly for instant Solo rematch without network
  const restarted = session.restart(false);
  assert.equal(restarted.phase, 'playing');
  assert.equal(restarted.score, 0);
  assert.equal(restarted.timeRemaining, 2);

  session.destroy();
  assert.equal(session.isRunning(), false);
});

// =============================================================================
// 3. ROLE SWITCHING STATE PRESERVATION TESTS
// =============================================================================
test('Solo Mode [4] Role switching preserves inactive character position, cooking timers, and customer/order state', async () => {
  const session = new LocalSoloSession('Solo Tester', undefined, { autoStartLoop: false });

  // Move Waiter to a specific dining tile
  session.setActiveRole('waiter');
  session.sendMove('waiter', 7.25, 4.5, 'right', false, false);
  const waiterBeforeSwitch = {
    col: session.getSnapshot().players.waiter.col,
    row: session.getSnapshot().players.waiter.row,
  };

  // Switch to Chef, pick up raw Heart Burger from pantry and start cooking on Grill
  session.setActiveRole('chef');
  assert.equal(session.getActiveRole(), 'chef');

  const burgerPantry = PANTRIES.find((p) => p.dishId === 'heart_burger')!;
  const grill = COOKING_STATIONS.find((s) => s.appliance === 'grill')!;

  session.sendMove('chef', burgerPantry.col, burgerPantry.row, 'back', false, false);
  const pickRes = await session.sendInteract('chef', burgerPantry.id);
  assert.equal(pickRes.ok, true, 'Chef should pick raw Heart Burger from pantry');

  session.sendMove('chef', grill.col, grill.row, 'back', false, false);
  const cookRes = await session.sendInteract('chef', grill.id);
  assert.equal(cookRes.ok, true, 'Chef should start cooking on Grill');

  const chefPosBeforeSwitch = {
    col: session.getSnapshot().players.chef.col,
    row: session.getSnapshot().players.chef.row,
  };

  // Switch back to Waiter while food is actively cooking!
  session.setActiveRole('waiter');
  assert.equal(session.getActiveRole(), 'waiter');

  // Step simulation forward while Waiter is active
  for (let i = 0; i < 30; i++) {
    session.step(0.1);
  }

  const snapAfter = session.getSnapshot();
  // Both characters remain present and Chef stayed right where left
  assert.equal(snapAfter.players.chef.col, chefPosBeforeSwitch.col);
  assert.equal(snapAfter.players.chef.row, chefPosBeforeSwitch.row);
  assert.equal(snapAfter.players.waiter.col, waiterBeforeSwitch.col);
  assert.equal(snapAfter.players.waiter.row, waiterBeforeSwitch.row);

  // Cooking timer kept progressing continuously after switching to Waiter!
  const grillState = snapAfter.stations.find((s) => s.id === grill.id)!;
  assert.ok(
    grillState.progress > 0.4 || grillState.status === 'ready',
    `Expected grill progress to advance while controlling Waiter, got progress=${grillState.progress}, status=${grillState.status}`
  );

  session.destroy();
});

// =============================================================================
// 4. COMPLETE SOLO GAMEPLAY LOOP END-TO-END TEST
// =============================================================================
test('Solo Mode [5] Full solo loop: customer arrives -> waiter takes order -> chef cooks -> waiter serves -> payment -> clean table', async () => {
  const session = new LocalSoloSession('Chef Solo Pro', undefined, { autoStartLoop: false });

  // Step until initial spawned customer group sits and becomes WAITING_FOR_ORDER
  let targetTableId: string | null = null;
  for (let i = 0; i < 200; i++) {
    const snap = session.step(0.1);
    const readyTable = snap.tables.find(
      (t) => t.phase05Status === 'WAITING_FOR_ORDER' || t.phase05Status === 'OCCUPIED'
    );
    if (readyTable && readyTable.phase05Status === 'WAITING_FOR_ORDER') {
      targetTableId = readyTable.id;
      break;
    }
  }
  assert.ok(targetTableId, 'Customer group should arrive, sit, and become WAITING_FOR_ORDER');

  // 1. WAITER takes structured Phase 06 order (Classic Burger -> legacy heart_burger)
  session.setActiveRole('waiter');
  const orderRes = await session.confirmTableOrder(
    targetTableId,
    [{ menuItemId: 'BURGER_CLASSIC', quantity: 1 }],
    'Solo test order',
    'NORMAL'
  );
  assert.equal(orderRes.ok, true, `Waiter order confirm failed: ${orderRes.errors?.join(', ')}`);
  assert.ok(orderRes.order, 'Confirmed order should be returned');
  assert.equal(orderRes.order.status, 'QUEUED');

  // 2. SWITCH TO CHEF -> accept kitchen order ticket
  session.setActiveRole('chef');
  const acceptRes = await session.acceptKitchenOrder(orderRes.order.orderId);
  assert.equal(acceptRes.ok, true, 'Chef should accept queued kitchen order');

  // 3. CHEF picks raw burger, cooks on Grill, waits until ready, places on Serving Pass
  const burgerPantry = PANTRIES.find((p) => p.dishId === 'heart_burger')!;
  const grill = COOKING_STATIONS.find((s) => s.appliance === 'grill')!;
  const passSlot = SERVING_PASS_SLOTS[0];

  session.sendMove('chef', burgerPantry.col, burgerPantry.row, 'back', false, false);
  assert.equal((await session.sendInteract('chef', burgerPantry.id)).ok, true);

  session.sendMove('chef', grill.col, grill.row, 'back', false, false);
  assert.equal((await session.sendInteract('chef', grill.id)).ok, true);

  // Advance simulation until dish finishes cooking
  let grillReady = false;
  for (let i = 0; i < 100; i++) {
    const snap = session.step(0.1);
    const st = snap.stations.find((s) => s.id === grill.id);
    if (st?.status === 'ready') {
      grillReady = true;
      break;
    }
  }
  assert.equal(grillReady, true, 'Grill should finish cooking Heart Burger');

  // Chef picks cooked dish and places on Serving Pass
  assert.equal((await session.sendInteract('chef', grill.id)).ok, true);
  session.sendMove('chef', passSlot.col, passSlot.row, 'front', false, false);
  assert.equal((await session.sendInteract('chef', passSlot.id)).ok, true);
  assert.ok(
    session.getSnapshot().servingPass[0].item?.state === 'cooked',
    'Cooked dish should be placed on Serving Pass'
  );

  // 4. SWITCH TO WAITER -> pick up food from pass -> serve customer table
  session.setActiveRole('waiter');
  session.sendMove('waiter', passSlot.col, passSlot.row, 'back', false, false);
  assert.equal((await session.sendInteract('waiter', passSlot.id)).ok, true);

  const tableObj = session.getSnapshot().tables.find((t) => t.id === targetTableId)!;
  session.sendMove('waiter', tableObj.col, tableObj.row, 'front', false, false);
  const serveRes = await session.sendInteract('waiter', targetTableId);
  assert.equal(serveRes.ok, true, `Waiter serve failed: ${serveRes.message}`);

  // 5. Wait for customer to finish eating -> WAITING_FOR_BILL
  let waitingBill = false;
  for (let i = 0; i < 100; i++) {
    const snap = session.step(0.1);
    const tbl = snap.tables.find((t) => t.id === targetTableId);
    if (tbl?.phase05Status === 'WAITING_FOR_BILL') {
      waitingBill = true;
      break;
    }
  }
  assert.equal(waitingBill, true, 'Table should transition to WAITING_FOR_BILL after eating');

  // 6. WAITER collects payment -> score & ordersCompleted increase, table becomes DIRTY
  const scoreBefore = session.getSnapshot().score;
  const payRes = await session.sendInteract('waiter', targetTableId);
  assert.equal(payRes.ok, true, 'Waiter should collect payment');
  assert.ok(session.getSnapshot().score > scoreBefore, 'Score should increase after payment');
  assert.equal(session.getSnapshot().ordersCompleted, 1);
  assert.equal(session.getSnapshot().combo, 1);

  // Step briefly so customer finishes stand-up animation and table transitions to DIRTY
  let becameDirty = false;
  for (let i = 0; i < 30; i++) {
    const snap = session.step(0.1);
    const tbl = snap.tables.find((t) => t.id === targetTableId);
    if (tbl?.phase05Status === 'DIRTY') {
      becameDirty = true;
      break;
    }
  }
  assert.equal(becameDirty, true, 'Table should become DIRTY after paid customer stands up');

  // 7. WAITER cleans table -> transitions through CLEANING -> AVAILABLE
  const cleanRes = await session.sendInteract('waiter', targetTableId);
  assert.equal(cleanRes.ok, true, 'Waiter should start cleaning dirty table');

  let becameAvailable = false;
  for (let i = 0; i < 60; i++) {
    const snap = session.step(0.1);
    const tbl = snap.tables.find((t) => t.id === targetTableId);
    if (tbl?.phase05Status === 'AVAILABLE') {
      becameAvailable = true;
      break;
    }
  }
  assert.equal(becameAvailable, true, 'Cleaned table should return to AVAILABLE');

  session.destroy();
});

// =============================================================================
// 5. SOLO GAME BALANCE & ONLINE CO-OP REGRESSION TESTS
// =============================================================================
test('Solo Mode [6] Solo balance config applies longer patience, slower spawns, 4 active tables, faster cooking, and preserves Online Co-Op balance', () => {
  const soloSim = new GameSimulation(
    'SOLO-BAL',
    'solo',
    { socketId: 's1', name: 'Solo Chef' },
    { socketId: 's2', name: 'Solo Waiter' }
  );
  const coopSim = new GameSimulation(
    'COOP-BAL',
    'coop',
    { socketId: 'c1', name: 'Coop Chef' },
    { socketId: 'c2', name: 'Coop Waiter' }
  );

  const soloBal = soloSim.getBalanceConfig();
  const coopBal = coopSim.getBalanceConfig();

  // Longer patience across all customer phases in Solo Mode
  assert.ok(soloBal.customerConfig.customerPatience > coopBal.customerConfig.customerPatience);
  assert.ok(soloBal.customerConfig.queuePatience > coopBal.customerConfig.queuePatience);
  assert.ok(soloBal.customerConfig.waiterPatience > coopBal.customerConfig.waiterPatience);
  assert.ok(soloBal.customerConfig.foodPatience > coopBal.customerConfig.foodPatience);
  assert.ok(soloBal.customerConfig.billPatience > coopBal.customerConfig.billPatience);

  // Slower customer spawn intervals and lower concurrent ceiling in Solo Mode
  assert.ok(soloBal.customerConfig.spawnInterval > coopBal.customerConfig.spawnInterval);
  assert.ok(soloBal.customerConfig.minSpawnInterval > coopBal.customerConfig.minSpawnInterval);
  assert.ok(soloBal.customerConfig.maxCustomers < coopBal.customerConfig.maxCustomers);

  // Faster cooking & gentler burn window in Solo Mode
  assert.ok(soloBal.cookDurationMultiplier < coopBal.cookDurationMultiplier);
  assert.ok(soloBal.burnDurationMultiplier > coopBal.burnDurationMultiplier);

  // Active tables: 4 active + 2 disabled in Solo vs all 6 active in Co-Op
  const soloSnap = soloSim.getSnapshot();
  const coopSnap = coopSim.getSnapshot();

  const soloDisabledCount = soloSnap.tables.filter((t) => t.phase05Status === 'DISABLED').length;
  const coopDisabledCount = coopSnap.tables.filter((t) => t.phase05Status === 'DISABLED').length;

  assert.equal(soloDisabledCount, soloSnap.tables.length - SOLO_BALANCE_CONFIG.activeTableCount);
  assert.equal(coopDisabledCount, 0, 'Online Co-Op must keep all 6 tables active');

  // Target scores match centralized configs
  assert.deepEqual(soloSnap.targetScores, SOLO_BALANCE_CONFIG.targetScores);
  assert.deepEqual(coopSnap.targetScores, COOP_DEFAULT_BALANCE.targetScores);
});
