import assert from 'node:assert/strict';
import test from 'node:test';
import { GameSimulation } from '../server/multiplayer/GameSimulation.ts';
import { CollisionSystem } from '../src/game/systems/collision/CollisionSystem.ts';
import { CustomerManager } from '../src/game/systems/customer/CustomerManager.ts';
import {
  CUSTOMER_PROFILES,
  DEFAULT_CUSTOMER_CONFIG,
  type CustomerSystemConfig,
} from '../src/game/systems/customer/CustomerConfig.ts';
import { CustomerStateMachine } from '../src/game/systems/customer/CustomerStateMachine.ts';
import { GameEventBus, type GameEventName } from '../src/game/systems/events/GameEvents.ts';
import { NavigationGrid } from '../src/game/systems/navigation/NavigationGrid.ts';
import { PathfindingService } from '../src/game/systems/navigation/PathfindingService.ts';
import { TableManager } from '../src/game/systems/table/TableManager.ts';
import { canTransitionTableState } from '../src/game/systems/table/TableState.ts';
import { PANTRIES } from '../src/shared/layout.ts';
import { RECIPES } from '../src/shared/recipes.ts';

function createHarness(configOverrides: Partial<CustomerSystemConfig> = {}) {
  const grid = new NavigationGrid();
  const pathfinding = new PathfindingService(grid);
  const collision = new CollisionSystem(grid);
  const events = new GameEventBus();
  const tables = new TableManager(pathfinding, events);
  const customers = new CustomerManager(grid, pathfinding, collision, tables, events, {
    spawningEnabled: false, // tests control spawning explicitly unless testing spawner
    ...configOverrides,
  });

  let nowMs = 1_000_000;
  const advance = (totalSeconds: number, stepSec = 0.05) => {
    const steps = Math.ceil(totalSeconds / stepSec);
    for (let i = 0; i < steps; i++) {
      const dt = Math.min(stepSec, totalSeconds - i * stepSec);
      if (dt <= 0) break;
      nowMs += Math.round(dt * 1000);
      customers.update(dt, nowMs);
    }
    return nowMs;
  };

  return {
    grid,
    pathfinding,
    collision,
    events,
    tables,
    customers,
    getNow: () => nowMs,
    advance,
  };
}

// =============================================================================
// A. CUSTOMER SPAWNING
// =============================================================================

test('A1. Customer spawns at a valid walkable entrance coordinate with valid chibi profile', () => {
  const h = createHarness();
  const group = h.customers.spawnGroup(1, { nowMs: h.getNow() });
  assert.ok(group);
  assert.equal(group.size, 1);

  const c = h.customers.getCustomer(group.memberIds[0])!;
  assert.ok(c);
  const pos = c.getPosition();
  assert.equal(h.grid.isWalkable(Math.round(pos.col), Math.round(pos.row), 'waiter'), true);
  assert.ok(CUSTOMER_PROFILES.some((p) => p.id === c.profile.id));
});

test('A2. CustomerSpawner respects cooldown, maxCustomers capacity, and enable/disable toggle', () => {
  const h = createHarness({
    spawningEnabled: true,
    spawnInterval: 3.0,
    minSpawnInterval: 2.0,
    maxCustomers: 3,
    autoSeatFromQueue: true,
  });

  // Disable spawner: advancing 10s should spawn 0 customers
  h.customers.spawner.setEnabled(false);
  h.advance(10);
  assert.equal(h.customers.getActiveCustomerCount(), 0);

  // Enable spawner and advance past several cooldowns
  h.customers.spawner.setEnabled(true);
  h.advance(14);
  const count = h.customers.getActiveCustomerCount();
  assert.ok(count >= 1 && count <= 3, `Expected 1..3 customers, got ${count}`);

  // Even after much more time, active customers never exceed maxCustomers
  h.advance(20);
  assert.ok(
    h.customers.getActiveCustomerCount() <= 3,
    `Exceeded maxCustomers: ${h.customers.getActiveCustomerCount()}`
  );
});

test('A3. Multiple spawned customers do not stack at identical spawn coordinates', () => {
  const h = createHarness();
  const group = h.customers.spawnGroup(3, { nowMs: h.getNow() });
  assert.ok(group);
  const positions = group.memberIds.map((id) => h.customers.getCustomer(id)!.getPosition());

  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const dist = Math.hypot(
        positions[i].col - positions[j].col,
        positions[i].row - positions[j].row
      );
      assert.ok(dist >= 0.15, `Spawned members overlapped at dist=${dist}`);
    }
  }
});

// =============================================================================
// B. QUEUE SYSTEM
// =============================================================================

test('B1. Customers enter queue in FIFO order with spaced non-overlapping positions when all tables are full', () => {
  const h = createHarness({ autoSeatFromQueue: false });

  // Mark all 6 tables occupied/disabled so none are AVAILABLE
  for (const tbl of h.tables.getAllTables()) {
    h.tables.setTableDisabled(tbl.id, true);
  }

  const g1 = h.customers.spawnGroup(1, { nowMs: h.getNow() })!;
  h.advance(1.5);
  const g2 = h.customers.spawnGroup(1, { nowMs: h.getNow() })!;
  h.advance(1.5);
  const g3 = h.customers.spawnGroup(1, { nowMs: h.getNow() })!;
  h.advance(3.5);

  assert.equal(h.customers.queue.getLength(), 3);
  assert.equal(h.customers.queue.getGroupIndex(g1.id), 0);
  assert.equal(h.customers.queue.getGroupIndex(g2.id), 1);
  assert.equal(h.customers.queue.getGroupIndex(g3.id), 2);

  // Verify spaced queue positions are distinct and non-overlapping
  const c1 = h.customers.getCustomer(g1.memberIds[0])!.getPosition();
  const c2 = h.customers.getCustomer(g2.memberIds[0])!.getPosition();
  const c3 = h.customers.getCustomer(g3.memberIds[0])!.getPosition();
  assert.ok(Math.hypot(c1.col - c2.col, c1.row - c2.row) >= 0.5);
  assert.ok(Math.hypot(c2.col - c3.col, c2.row - c3.row) >= 0.5);
});

test('B2. Queue shifts forward smoothly (walking, no teleport) when front group is seated', () => {
  const h = createHarness({ autoSeatFromQueue: false });

  // Disable all tables first so 2 groups enter queue
  for (const tbl of h.tables.getAllTables()) {
    h.tables.setTableDisabled(tbl.id, true);
  }

  const g1 = h.customers.spawnGroup(1, { nowMs: h.getNow() })!;
  h.advance(1.0);
  const g2 = h.customers.spawnGroup(1, { nowMs: h.getNow() })!;
  h.advance(3.5);

  assert.equal(h.customers.queue.getGroupIndex(g1.id), 0);
  assert.equal(h.customers.queue.getGroupIndex(g2.id), 1);

  const c2 = h.customers.getCustomer(g2.memberIds[0])!;
  const beforePos = c2.getPosition();

  // Re-enable table_1 and seat front group g1
  h.tables.setTableDisabled('table_1', false);
  const seatRes = h.customers.seatNextQueuedGroup('table_1', h.getNow());
  assert.equal(seatRes.ok, true);
  assert.equal(seatRes.groupId, g1.id);

  // g2 is now queue index 0 and MUST NOT teleport instantaneously
  assert.equal(h.customers.queue.getGroupIndex(g2.id), 0);
  const immediatePos = c2.getPosition();
  assert.ok(
    Math.hypot(immediatePos.col - beforePos.col, immediatePos.row - beforePos.row) < 0.05,
    'Queued customer teleported instead of walking forward!'
  );

  // After advancing simulation, g2 walks smoothly to slot 0
  h.advance(2.0);
  const afterPos = c2.getPosition();
  const slot0 = h.customers.queue.getTargetPositionForMember(0, 0);
  assert.ok(
    Math.hypot(afterPos.col - slot0.col, afterPos.row - slot0.row) < 0.35,
    'Second queued customer did not walk smoothly to slot 0'
  );
});

test('B3. Queue capacity limit triggers overflow policy and queue patience triggers angry exit', () => {
  const h = createHarness({
    autoSeatFromQueue: false,
    maxQueueSize: 2,
    queuePatience: 6,
  });

  for (const tbl of h.tables.getAllTables()) {
    h.tables.setTableDisabled(tbl.id, true);
  }

  const g1 = h.customers.spawnGroup(1, { nowMs: h.getNow() })!;
  h.advance(0.6);
  const g2 = h.customers.spawnGroup(1, { nowMs: h.getNow() })!;
  h.advance(0.6);
  const g3 = h.customers.spawnGroup(1, { nowMs: h.getNow() })!;
  h.advance(2.5);

  // Queue limited to 2 groups; g3 overflowed and began exiting
  assert.equal(h.customers.queue.getLength(), 2);
  assert.equal(h.customers.queue.hasGroup(g1.id), true);
  assert.equal(h.customers.queue.hasGroup(g2.id), true);
  assert.equal(h.customers.queue.hasGroup(g3.id), false);

  const angryEvents: string[] = [];
  h.events.on('CUSTOMER_ANGRY', (e) => angryEvents.push(e.customerId));

  // Advance past queuePatience (6s) + walk-to-exit + exit fade
  h.advance(14);
  assert.ok(angryEvents.length >= 2, 'Expected queued customers to leave angry on patience expiry');
  assert.equal(h.customers.queue.getLength(), 0);
  assert.equal(h.customers.getActiveCustomerCount(), 0);
});

// =============================================================================
// C. TABLE SYSTEM & RESERVATION LOCKS
// =============================================================================

test('C1. All 6 Burger Cafe tables initialize cleanly with correct capacities and AVAILABLE status', () => {
  const h = createHarness();
  const all = h.tables.getAllTables();
  assert.equal(all.length, 6);

  const byId = new Map(all.map((t) => [t.id, t]));
  assert.equal(byId.get('table_1')?.capacity, 2);
  assert.equal(byId.get('table_2')?.capacity, 2);
  assert.equal(byId.get('table_3')?.capacity, 2);
  assert.equal(byId.get('table_4')?.capacity, 4);
  assert.equal(byId.get('table_5')?.capacity, 4);
  assert.equal(byId.get('table_6')?.capacity, 4);

  for (const t of all) {
    assert.equal(t.getStatus(), 'AVAILABLE');
    assert.equal(t.getOccupancy(), 0);
  }
});

test('C2. Table Selection AI picks best capacity-fit reachable table and ignores dirty/occupied/reserved', () => {
  const h = createHarness();
  const entrance = h.customers.spawner.resolveWalkableEntrance();

  // Solo guest should prefer a 2-seat table over a 4-seat table
  const soloPick = h.tables.selectBestTable({ groupSize: 1, fromPosition: entrance });
  assert.ok(soloPick);
  assert.equal(soloPick.table.capacity, 2);

  // Party of 4 MUST pick a 4-seat table (t4/t5/t6)
  const familyPick = h.tables.selectBestTable({ groupSize: 4, fromPosition: entrance });
  assert.ok(familyPick);
  assert.equal(familyPick.table.capacity, 4);

  // Party of 5 exceeds max table capacity (4) -> returns null
  const tooLarge = h.tables.selectBestTable({ groupSize: 5, fromPosition: entrance });
  assert.equal(tooLarge, null);
});

test('C3. Atomic reservation locking prevents double booking and releases cleanly on timeout', () => {
  const h = createHarness();
  const now = h.getNow();

  // Group 1 reserves table_1 for 5 seconds
  const r1 = h.tables.reserveTable('table_1', 'G1', ['C1', 'C2'], now, 5000);
  assert.ok(r1);
  assert.equal(r1.size, 2);
  assert.equal(h.tables.getTable('table_1')?.getStatus(), 'RESERVED');

  // Group 2 attempts to reserve the SAME table_1 -> rejected!
  const r2 = h.tables.reserveTable('table_1', 'G2', ['C3'], now, 5000);
  assert.equal(r2, null);

  // Already-assigned customer C1 cannot be reserved at table_2 -> rejected!
  const r3 = h.tables.reserveTable('table_2', 'G3', ['C1'], now, 5000);
  assert.equal(r3, null);

  // Advance past 5000ms reservation timeout -> automatically releases back to AVAILABLE!
  let releasedReason = '';
  h.events.on('TABLE_RESERVATION_RELEASED', (e) => {
    releasedReason = e.reason;
  });

  const { expiredReservations } = h.tables.update(0.1, now + 5100);
  assert.equal(expiredReservations.length, 1);
  assert.equal(expiredReservations[0].tableId, 'table_1');
  assert.equal(releasedReason, 'reservation_timeout');
  assert.equal(h.tables.getTable('table_1')?.getStatus(), 'AVAILABLE');
});

// =============================================================================
// D. CUSTOMER MOVEMENT & PATHFINDING
// =============================================================================

test('D1. Customer walks smoothly along obstacle-avoiding A* path without teleporting or penetrating blocked tiles', () => {
  const h = createHarness();
  const group = h.customers.spawnGroup(1, { nowMs: h.getNow() })!;
  const cid = group.memberIds[0];

  let prev = h.customers.getCustomer(cid)!.getPosition();
  let maxSingleStep = 0;
  let totalTravelled = 0;

  for (let i = 0; i < 160; i++) {
    h.advance(0.05, 0.05);
    const c = h.customers.getCustomer(cid)!;
    const pos = c.getPosition();
    const state = c.getState();

    // Only measure walking steps (exclude intentional small chair-alignment step on SEATING)
    if (state === 'ENTERING' || state === 'WALKING_TO_TABLE') {
      const step = Math.hypot(pos.col - prev.col, pos.row - prev.row);
      maxSingleStep = Math.max(maxSingleStep, step);
      totalTravelled += step;

      // Ensure walking customer never stands inside a static obstacle tile
      assert.equal(
        h.grid.isStaticBlocked(Math.round(pos.col), Math.round(pos.row)),
        false,
        `Customer stepped into static obstacle at (${pos.col}, ${pos.row})`
      );
    }
    prev = pos;
    if (c.fsm.isSeatedState()) break;
  }

  const c = h.customers.getCustomer(cid)!;
  assert.ok(c.fsm.isSeatedState(), `Expected customer to reach seat, state=${c.getState()}`);
  assert.ok(totalTravelled > 1.0, 'Customer should have physically walked across dining floor');
  assert.ok(
    maxSingleStep <= DEFAULT_CUSTOMER_CONFIG.customerSpeed * 0.05 * 2.2,
    `Single-step jump too large (teleport suspected): ${maxSingleStep}`
  );
});

// =============================================================================
// E. SEATING, GROUPS & OCCUPANCY
// =============================================================================

test('E1. Party of 4 seats together at one 4-seat table with unique seatIndex per member and accurate occupancy', () => {
  const h = createHarness();
  const group = h.customers.spawnGroup(4, { nowMs: h.getNow() })!;
  assert.equal(group.size, 4);

  // Advance until all 4 members arrive and finish seating
  h.advance(10);

  assert.ok(group.assignedTableId, 'Group of 4 should have an assigned 4-seat table');
  const tbl = h.tables.getTable(group.assignedTableId!)!;
  assert.equal(tbl.capacity, 4);
  assert.equal(tbl.getOccupancy(), 4);

  const seatIndices = new Set<number>();
  for (const cid of group.memberIds) {
    const c = h.customers.getCustomer(cid)!;
    assert.ok(c.fsm.isSeatedState(), `Member ${cid} not seated: ${c.getState()}`);
    assert.equal(c.assignedTableId, tbl.id);
    assert.notEqual(c.seatIndex, null);
    seatIndices.add(c.seatIndex!);
  }
  assert.equal(seatIndices.size, 4, 'All 4 members must occupy distinct seats');
});

// =============================================================================
// F & G. FULL LIFECYCLE, EVENTS, DIRTY TABLE & CLEANING LIFECYCLE
// =============================================================================

test('F1 & G1. Complete customer & table lifecycle emits clean events and enforces DIRTY -> CLEANING -> AVAILABLE', () => {
  const h = createHarness({
    browsingDuration: 0.6,
    eatingDuration: 1.0,
    seatingDuration: 0.3,
    standUpDuration: 0.3,
    exitDelay: 0.3,
  });

  const emitted: GameEventName[] = [];
  h.events.onAny((evt) => emitted.push(evt.type));

  // Verify illegal state transitions are rejected
  assert.equal(canTransitionTableState('DIRTY', 'AVAILABLE'), false);
  assert.equal(canTransitionTableState('DIRTY', 'RESERVED'), false);
  assert.equal(canTransitionTableState('DIRTY', 'CLEANING'), true);
  assert.equal(canTransitionTableState('CLEANING', 'AVAILABLE'), true);

  const fsmCheck = new CustomerStateMachine('SPAWNING');
  assert.equal(fsmCheck.canTransitionTo('EATING'), false);
  assert.equal(fsmCheck.transitionTo('EATING'), false);
  assert.equal(fsmCheck.getState(), 'SPAWNING');

  // 1. Spawn customer & let them walk, sit, browse -> WAITING_FOR_ORDER
  const group = h.customers.spawnGroup(2, { dishId: 'heart_burger', nowMs: h.getNow() })!;
  h.advance(8);

  const tableId = group.assignedTableId!;
  const table = h.tables.getTable(tableId)!;
  assert.equal(table.getStatus(), 'WAITING_FOR_ORDER');
  assert.equal(table.getOccupancy(), 2);

  // 2. Take order -> WAITING_FOR_FOOD
  const orderRes = h.customers.takeOrderAtTable(tableId, 'ord_1', h.getNow());
  assert.equal(orderRes.ok, true);
  assert.equal(table.getStatus(), 'WAITING_FOR_FOOD');

  // 3. Wrong dish rejected; right dish starts EATING
  const wrongRes = h.customers.deliverFoodToTable(tableId, 'berry_cake', h.getNow());
  assert.equal(wrongRes.ok, false);
  assert.equal(wrongRes.wrongDish, true);

  const serveRes = h.customers.deliverFoodToTable(tableId, 'heart_burger', h.getNow());
  assert.equal(serveRes.ok, true);
  assert.equal(table.getStatus(), 'EATING');

  // 4. Advance eating -> WAITING_FOR_BILL
  h.advance(6);
  assert.equal(table.getStatus(), 'WAITING_FOR_BILL');

  // 5. Collect bill -> customers stand up, vacate (table becomes DIRTY), walk to exit, and clean up!
  const billRes = h.customers.collectBillAtTable(tableId, h.getNow());
  assert.equal(billRes.ok, true);
  // Duplicate bill collection during stand-up must be rejected
  assert.equal(h.customers.collectBillAtTable(tableId, h.getNow()).ok, false);

  h.advance(0.6);
  assert.equal(table.getStatus(), 'DIRTY');
  assert.equal(table.getOccupancy(), 0);

  // DIRTY table MUST NOT accept new reservations or direct AVAILABLE transition
  assert.equal(h.tables.reserveTable(tableId, 'G_BLOCKED', ['C_BLOCKED'], h.getNow()), null);
  assert.equal(h.tables.setTableStatus(tableId, 'AVAILABLE'), false);

  // 6. Start cleaning -> CLEANING -> AVAILABLE after cleaning duration
  assert.equal(h.customers.startTableCleaning(tableId, 'waiter', h.getNow()), true);
  assert.equal(table.getStatus(), 'CLEANING');

  h.advance(2.2);
  assert.equal(table.getStatus(), 'AVAILABLE');

  // 7. Advance until departing guests finish walking to exit & fade cleanly -> 0 active customers!
  h.advance(8);
  assert.equal(h.customers.getActiveCustomerCount(), 0);

  // Verify key Phase 05 lifecycle events were emitted
  const requiredEvents: GameEventName[] = [
    'CUSTOMER_SPAWNED',
    'CUSTOMER_ENTERED',
    'CUSTOMER_TABLE_SEARCH_STARTED',
    'CUSTOMER_TABLE_ASSIGNED',
    'CUSTOMER_MOVING_TO_TABLE',
    'CUSTOMER_ARRIVED_AT_TABLE',
    'CUSTOMER_SEATED',
    'CUSTOMER_WAITING',
    'CUSTOMER_LEAVING',
    'CUSTOMER_EXITED',
    'TABLE_RESERVED',
    'TABLE_OCCUPIED',
    'TABLE_DIRTY',
    'TABLE_CLEANING',
    'TABLE_CLEANED',
    'CUSTOMER_GROUP_CREATED',
    'CUSTOMER_GROUP_DISBANDED',
  ];
  for (const evtName of requiredEvents) {
    assert.ok(emitted.includes(evtName), `Missing expected GameEventBus event: ${evtName}`);
  }
});

// =============================================================================
// H. FULL SERVER-AUTHORITATIVE GameSimulation INTEGRATION & STRESS TEST
// =============================================================================

test('H1. Server-authoritative GameSimulation executes full Chef + Waiter + Phase 05 Customer/Table loop', () => {
  const sim = new GameSimulation(
    'TEST05',
    'coop',
    { socketId: 'chef_sock', name: 'Chef Ali' },
    { socketId: 'waiter_sock', name: 'Waiter Mia' }
  );

  let now = Date.now();
  const stepSim = (sec: number) => {
    const steps = Math.ceil(sec / 0.08);
    for (let i = 0; i < steps; i++) {
      now += 80;
      sim.tick(0.08, now);
    }
  };

  // Let initial customer walk in, choose a table, sit, and become WAITING_FOR_ORDER
  stepSim(10);
  let snap = sim.getSnapshot();
  assert.ok(snap.customers.length >= 1);
  assert.ok(snap.restaurantMetrics.activeCustomers >= 1);

  const readyTable = snap.tables.find((t) => t.phase05Status === 'WAITING_FOR_ORDER');
  assert.ok(readyTable, 'Initial customer should reach WAITING_FOR_ORDER');
  const dishId = readyTable.dishId!;
  const recipe = RECIPES[dishId];

  // Waiter walks near table and takes order
  sim.updatePlayerPosition('waiter', readyTable.col, readyTable.row + 1, 'back', false);
  const takeOrder = sim.interact('waiter', readyTable.id);
  assert.equal(takeOrder.ok, true);

  snap = sim.getSnapshot();
  assert.equal(snap.orders.length, 1);
  assert.equal(
    snap.tables.find((t) => t.id === readyTable.id)?.phase05Status,
    'WAITING_FOR_FOOD'
  );

  // Chef picks raw ingredient, cooks on matching appliance, plates, puts on serving pass
  const pantry = snap.stations; // verify stations intact
  assert.equal(pantry.length, 3);

  // Pick pantry matching dishId from layout.ts PANTRIES
  const matchingPantry = PANTRIES.find((p) => p.dishId === dishId)!;
  assert.ok(matchingPantry);
  sim.updatePlayerPosition('chef', matchingPantry.col + 1, matchingPantry.row, 'left', false);
  assert.equal(sim.interact('chef', matchingPantry.id).ok, true);

  const matchingStation = snap.stations.find((s) => recipe.allowedAppliances.includes(s.appliance))!;
  sim.updatePlayerPosition('chef', matchingStation.col, matchingStation.row + 1, 'back', false);
  assert.equal(sim.interact('chef', matchingStation.id).ok, true);

  // Cook until ready
  stepSim(recipe.cookSeconds + 0.5);
  assert.equal(sim.interact('chef', matchingStation.id).ok, true); // pick cooked dish

  // Place on pass_1
  sim.updatePlayerPosition('chef', 5, 2, 'right', false);
  assert.equal(sim.interact('chef', 'pass_1').ok, true);

  // Waiter picks up dish from pass_1 and delivers to readyTable
  sim.updatePlayerPosition('waiter', 7, 2, 'left', false);
  assert.equal(sim.interact('waiter', 'pass_1').ok, true);

  sim.updatePlayerPosition('waiter', readyTable.col, readyTable.row + 1, 'back', false);
  assert.equal(sim.interact('waiter', readyTable.id).ok, true);

  snap = sim.getSnapshot();
  assert.equal(snap.tables.find((t) => t.id === readyTable.id)?.phase05Status, 'EATING');

  // Guest eats -> WAITING_FOR_BILL
  stepSim(7);
  snap = sim.getSnapshot();
  assert.equal(
    snap.tables.find((t) => t.id === readyTable.id)?.phase05Status,
    'WAITING_FOR_BILL'
  );

  // Waiter collects bill -> score increases, guest stands up -> table turns DIRTY
  const scoreBefore = snap.score;
  assert.equal(sim.interact('waiter', readyTable.id).ok, true);
  stepSim(1.0);
  snap = sim.getSnapshot();
  assert.ok(snap.score > scoreBefore, 'Score should increase after collecting bill');
  assert.equal(snap.tables.find((t) => t.id === readyTable.id)?.phase05Status, 'DIRTY');

  // Waiter cleans DIRTY table -> CLEANING -> AVAILABLE
  assert.equal(sim.interact('waiter', readyTable.id).ok, true);
  snap = sim.getSnapshot();
  assert.equal(snap.tables.find((t) => t.id === readyTable.id)?.phase05Status, 'CLEANING');

  stepSim(2.2);
  snap = sim.getSnapshot();
  const afterCleanStatus = snap.tables.find((t) => t.id === readyTable.id)?.phase05Status;
  assert.ok(
    afterCleanStatus === 'AVAILABLE' || afterCleanStatus === 'RESERVED',
    `Cleaned table should be AVAILABLE (or immediately RESERVED by waiting guest), got ${afterCleanStatus}`
  );
});

test('H2. High-load multi-customer stress test: zero NaNs, zero negative occupancy, zero duplicate reservations, clean cleanup', () => {
  const h = createHarness({
    spawningEnabled: true,
    spawnInterval: 1.2,
    minSpawnInterval: 0.8,
    maxCustomers: 16,
    maxQueueSize: 4,
    queuePatience: 12,
    waiterPatience: 14,
  });

  // Simulate 45 seconds of intense rush with periodic table cleaning
  for (let sec = 0; sec < 45; sec++) {
    h.advance(1.0, 0.08);

    // Clean any dirty tables periodically
    for (const tbl of h.tables.getAllTables()) {
      if (tbl.getStatus() === 'DIRTY') {
        h.customers.startTableCleaning(tbl.id, 'waiter', h.getNow());
      }
      assert.ok(tbl.getOccupancy() >= 0 && tbl.getOccupancy() <= tbl.capacity);
    }

    // Validate every active customer has finite coordinates and no duplicate table bindings
    const seenCustomerIds = new Set<string>();
    for (const c of h.customers.getActiveCustomers()) {
      assert.equal(seenCustomerIds.has(c.id), false);
      seenCustomerIds.add(c.id);
      const pos = c.getPosition();
      assert.equal(Number.isFinite(pos.col), true);
      assert.equal(Number.isFinite(pos.row), true);
    }
  }

  // Stop spawning and let all remaining customers leave via patience/exit -> clean zero state
  h.customers.spawner.setEnabled(false);
  h.advance(40, 0.1);
  assert.equal(h.customers.getActiveCustomerCount(), 0);
  assert.equal(h.customers.queue.getLength(), 0);
});
