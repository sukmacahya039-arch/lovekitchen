import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHEF_SPAWN,
  CLEANING_STATION_POS,
  COOKING_STATIONS,
  DINING_TABLES,
  DIVIDER_COL,
  GRID_COLS,
  GRID_ROWS,
  PANTRIES,
  PREP_TABLE_POS,
  REGISTER_POS,
  SERVING_PASS_SLOTS,
  TRASH_BIN_POS,
  WAITER_SPAWN,
  WAIT_MAT_POS,
} from '../src/shared/layout.ts';
import { CollisionSystem } from '../src/game/systems/collision/CollisionSystem.ts';
import { InteractionSystem } from '../src/game/systems/interaction/InteractionSystem.ts';
import { MovementController } from '../src/game/systems/movement/MovementController.ts';
import { NavigationGrid } from '../src/game/systems/navigation/NavigationGrid.ts';
import { PathfindingService } from '../src/game/systems/navigation/PathfindingService.ts';

interface TestHarness {
  grid: NavigationGrid;
  pathfinding: PathfindingService;
  collision: CollisionSystem;
  interactions: InteractionSystem;
  chef: MovementController;
  waiter: MovementController;
  firedLog: Array<{ characterId: string; role: string; objectId: string }>;
  cancelledLog: Array<{ characterId: string; objectId: string }>;
}

function createRestaurantHarness(interactionDurationMs = 0): TestHarness {
  const grid = new NavigationGrid();
  const pathfinding = new PathfindingService(grid);
  const collision = new CollisionSystem(grid);
  const interactions = new InteractionSystem();
  const firedLog: Array<{ characterId: string; role: string; objectId: string }> = [];
  const cancelledLog: Array<{ characterId: string; objectId: string }> = [];

  const registerObj = (
    id: string,
    type:
      | 'CookingStation'
      | 'PreparationTable'
      | 'IngredientStorage'
      | 'FoodCounter'
      | 'Customer'
      | 'DiningTable'
      | 'Cashier'
      | 'CleaningStation'
      | 'TrashBin',
    col: number,
    row: number
  ) => {
    interactions.register({
      id,
      type,
      col,
      row,
      interactionDurationMs,
      onInteract: (ctx) => {
        firedLog.push({
          characterId: ctx.characterId,
          role: ctx.role,
          objectId: ctx.object.id,
        });
      },
      onCancel: (ctx) => {
        cancelledLog.push({
          characterId: ctx.characterId,
          objectId: ctx.object.id,
        });
      },
    });
  };

  for (const p of PANTRIES) registerObj(p.id, 'IngredientStorage', p.col, p.row);
  for (const s of COOKING_STATIONS) registerObj(s.id, 'CookingStation', s.col, s.row);
  registerObj(PREP_TABLE_POS.id, 'PreparationTable', PREP_TABLE_POS.col, PREP_TABLE_POS.row);
  for (const slot of SERVING_PASS_SLOTS) registerObj(slot.id, 'FoodCounter', slot.col, slot.row);
  registerObj(TRASH_BIN_POS.id, 'TrashBin', TRASH_BIN_POS.col, TRASH_BIN_POS.row);
  for (const t of DINING_TABLES) registerObj(t.id, 'DiningTable', t.col, t.row);
  registerObj(REGISTER_POS.id, 'Cashier', REGISTER_POS.col, REGISTER_POS.row);
  registerObj(
    CLEANING_STATION_POS.id,
    'CleaningStation',
    CLEANING_STATION_POS.col,
    CLEANING_STATION_POS.row
  );
  registerObj(WAIT_MAT_POS.id, 'Customer', WAIT_MAT_POS.col, WAIT_MAT_POS.row);

  const chef = new MovementController(
    {
      characterId: 'chef_male',
      playerId: 'p1',
      role: 'chef',
      startPosition: CHEF_SPAWN,
    },
    pathfinding,
    collision,
    interactions
  );

  const waiter = new MovementController(
    {
      characterId: 'waiter_female',
      playerId: 'p2',
      role: 'waiter',
      startPosition: WAITER_SPAWN,
    },
    pathfinding,
    collision,
    interactions
  );

  return { grid, pathfinding, collision, interactions, chef, waiter, firedLog, cancelledLog };
}

function advanceController(
  ctrl: MovementController,
  steps: number,
  dt = 1 / 60,
  startTimeMs = 10_000
): number {
  let now = startTimeMs;
  for (let i = 0; i < steps; i++) {
    now += Math.round(dt * 1000);
    ctrl.update(dt, now);
  }
  return now;
}

describe('Phase 04 — Core Movement System', () => {
  it('moves to a valid walkable destination and stops cleanly in Idle', () => {
    const { chef } = createRestaurantHarness();
    const res = chef.moveTo(4, 5, false);
    assert.equal(res.accepted, true);
    assert.equal(chef.getState(), 'Moving');

    advanceController(chef, 180);
    const snap = chef.getSnapshot();
    assert.equal(snap.movementState, 'Idle');
    assert.equal(snap.isMoving, false);
    assert.ok(Math.hypot(snap.position.col - 4, snap.position.row - 5) < 0.2);
  });

  it('replaces active destination immediately when a new destination is commanded', () => {
    const { waiter } = createRestaurantHarness();
    waiter.moveTo(12, 6, false);
    advanceController(waiter, 20);
    assert.equal(waiter.getState(), 'Moving');

    const replaceRes = waiter.moveTo(6, 1, false);
    assert.equal(replaceRes.accepted, true);
    advanceController(waiter, 260);
    const snap = waiter.getSnapshot();
    assert.equal(snap.movementState, 'Idle');
    assert.ok(Math.hypot(snap.position.col - 6, snap.position.row - 1) < 0.25);
  });

  it('normalizes diagonal manual movement speed to match cardinal speed', () => {
    const h1 = createRestaurantHarness();
    const h2 = createRestaurantHarness();

    // Place both waiters in open dining aisle (8,3):
    // (0, 1) travels toward (9,4) [open], (1, 1) travels toward (9,3) [open]
    h1.waiter.setManualInput(0, 1, false); // Cardinal down
    h2.waiter.setManualInput(1, 1, false); // Diagonal down-right

    advanceController(h1.waiter, 24);
    advanceController(h2.waiter, 24);

    const distCardinal = Math.hypot(
      h1.waiter.getPosition().col - WAITER_SPAWN.col,
      h1.waiter.getPosition().row - WAITER_SPAWN.row
    );
    const distDiagonal = Math.hypot(
      h2.waiter.getPosition().col - WAITER_SPAWN.col,
      h2.waiter.getPosition().row - WAITER_SPAWN.row
    );

    assert.ok(distCardinal > 0.5);
    assert.ok(
      Math.abs(distCardinal - distDiagonal) < 0.08,
      `Expected normalized diagonal speed (${distDiagonal.toFixed(3)}) to match cardinal (${distCardinal.toFixed(3)})`
    );
  });

  it('never allows characters to exit walkable map bounds', () => {
    const { chef, waiter } = createRestaurantHarness();

    chef.setManualInput(-1, -1, true);
    waiter.setManualInput(1, 1, true);
    advanceController(chef, 240);
    advanceController(waiter, 240);

    const cp = chef.getPosition();
    const wp = waiter.getPosition();

    assert.ok(cp.col >= 0 && cp.col < DIVIDER_COL);
    assert.ok(cp.row >= 0 && cp.row < GRID_ROWS);
    assert.ok(wp.col > DIVIDER_COL && wp.col < GRID_COLS);
    assert.ok(wp.row >= 0 && wp.row < GRID_ROWS);
  });
});

describe('Phase 04 — Navigation Grid & Pathfinding Service', () => {
  it('finds an obstacle-free path around dining tables and counters', () => {
    const { grid, pathfinding } = createRestaurantHarness();
    // Waiter going from (6, 2) to (12, 5) passes around tables T1(7,2), T2(9,2), T3(11,2), T4(7,5), T5(9,5), T6(11,5)
    const result = pathfinding.findPath('waiter', { col: 6, row: 2 }, { col: 12, row: 5 }, false);
    assert.equal(result.reachable, true);
    assert.ok(result.path.length > 0);
    assert.equal(pathfinding.isPathClear('waiter', { col: 6, row: 2 }, result.path), true);

    for (const node of result.path) {
      assert.equal(grid.isWalkable(node.col, node.row, 'waiter'), true);
    }
  });

  it('handles unreachable destinations cleanly both with and without nearest fallback', () => {
    const { pathfinding } = createRestaurantHarness();

    // Chef cannot reach dining table T2 at (9, 2)
    const strict = pathfinding.findPath('chef', CHEF_SPAWN, { col: 9, row: 2 }, false);
    assert.equal(strict.reachable, false);
    assert.equal(strict.path.length, 0);

    // With fallback enabled, Chef stops at closest reachable kitchen tile near divider
    const fallback = pathfinding.findPath('chef', CHEF_SPAWN, { col: 9, row: 2 }, true);
    assert.equal(fallback.reachable, true);
    assert.equal(fallback.usedFallbackGoal, true);
    assert.ok(fallback.resolvedGoal && fallback.resolvedGoal.col < DIVIDER_COL);
  });

  it('recalculates path dynamically when a runtime obstacle blocks the current path', () => {
    const { grid, waiter } = createRestaurantHarness();
    // Waiter starts at (8,3), walks to (8,1) straight up through (8,2)
    waiter.moveTo(8, 1, false);
    advanceController(waiter, 6);
    assert.equal(waiter.getState(), 'Moving');

    // Dynamically block tile (8,2) mid-walk!
    grid.addDynamicObstacle({ id: 'spill_temp', col: 8, row: 2, width: 1, height: 1 });

    // Advance — controller must detect grid version bump, reroute around (8,2), and still arrive at (8,1)
    advanceController(waiter, 240);
    const snap = waiter.getSnapshot();
    assert.equal(snap.movementState, 'Idle');
    assert.ok(Math.hypot(snap.position.col - 8, snap.position.row - 1) < 0.25);

    // Clean up obstacle
    assert.equal(grid.removeDynamicObstacle('spill_temp'), true);
  });
});

describe('Phase 04 — Ground Feet Collision System', () => {
  it('blocks walls, dining tables, cooking stations, and divider counter', () => {
    const { collision } = createRestaurantHarness();

    assert.equal(collision.canOccupy('chef', 2, 1), false); // stove_1
    assert.equal(collision.canOccupy('chef', DIVIDER_COL, 3), false); // divider counter
    assert.equal(collision.canOccupy('waiter', 7, 2), false); // dining table T1
    assert.equal(collision.canOccupy('waiter', -1, 3), false); // out of bounds wall
    assert.equal(collision.canOccupy('waiter', 8, 3), true); // open dining walkway
  });

  it('recovers smoothly if trapped inside a newly added dynamic obstacle', () => {
    const { grid, collision } = createRestaurantHarness();
    // Place dynamic obstacle directly on Waiter's current tile (8,3)
    grid.addDynamicObstacle({ id: 'box_trap', col: 8, row: 3, width: 1, height: 1 });
    assert.equal(collision.canOccupy('waiter', 8, 3), false);

    // Smooth recovery nudges character out over a few frames without teleporting
    let pos = { col: 8, row: 3 };
    for (let i = 0; i < 12; i++) {
      const resolved = collision.resolveMovement('waiter', pos, { col: pos.col + 0.05, row: pos.row });
      pos = resolved.position;
      if (collision.canOccupy('waiter', pos.col, pos.row)) break;
    }
    assert.equal(collision.canOccupy('waiter', pos.col, pos.row), true);
  });
});

describe('Phase 04 — Generic Interaction & Role Permissions', () => {
  it('enforces Chef vs Waiter role permissions and shared FoodCounter access', () => {
    const { interactions } = createRestaurantHarness();

    // Chef allowed on kitchen stations, blocked on dining tables/cashier
    assert.equal(interactions.validateAccess('chef', 'stove_1').allowed, true);
    assert.equal(interactions.validateAccess('chef', 'prep_table').allowed, true);
    assert.equal(interactions.validateAccess('chef', 'pass_1').allowed, true);
    assert.equal(interactions.validateAccess('chef', 'table_1').reason, 'role_restricted');
    assert.equal(interactions.validateAccess('chef', 'cashier').reason, 'role_restricted');

    // Waiter allowed on dining objects & shared FoodCounter, blocked on stoves/prep
    assert.equal(interactions.validateAccess('waiter', 'table_1').allowed, true);
    assert.equal(interactions.validateAccess('waiter', 'cashier').allowed, true);
    assert.equal(interactions.validateAccess('waiter', 'cleaning_station').allowed, true);
    assert.equal(interactions.validateAccess('waiter', 'pass_1').allowed, true);
    assert.equal(interactions.validateAccess('waiter', 'stove_1').reason, 'role_restricted');
    assert.equal(interactions.validateAccess('waiter', 'prep_table').reason, 'role_restricted');
  });

  it('rejects disabled interactable objects cleanly', () => {
    const { interactions, chef } = createRestaurantHarness();
    interactions.setEnabled('stove_1', false);

    const res = chef.moveToInteract('stove_1');
    assert.equal(res.accepted, false);
    assert.equal(res.reason, 'object_disabled');
  });
});

describe('Phase 04 — 12 Practical Restaurant Navigation & Interaction Scenarios', () => {
  it('Scenario 01: Chef moves to Cooking Station (stove_1), faces it, and interacts once', () => {
    const { chef, firedLog } = createRestaurantHarness();
    const res = chef.moveToInteract('stove_1');
    assert.equal(res.accepted, true);

    advanceController(chef, 180);
    assert.equal(firedLog.length, 1);
    assert.equal(firedLog[0].objectId, 'stove_1');
    assert.equal(firedLog[0].role, 'chef');
    assert.equal(chef.getState(), 'Idle');
  });

  it('Scenario 02: Chef walks around kitchen Prep Table / obstacle without clipping', () => {
    const { chef, grid } = createRestaurantHarness();
    // Start at (1,7), walk around Prep Table at (2,7) to (3,7)
    chef.syncExternalPosition(1, 7);
    const res = chef.moveTo(3, 7, false);
    assert.equal(res.accepted, true);

    for (let i = 0; i < 200; i++) {
      chef.update(1 / 60, 10_000 + i * 16);
      const pos = chef.getPosition();
      assert.equal(grid.isBlocked(pos.col, pos.row), false);
    }
    assert.ok(Math.hypot(chef.getPosition().col - 3, chef.getPosition().row - 7) < 0.25);
  });

  it('Scenario 03: Chef cannot cross divider counter into dining area', () => {
    const { chef } = createRestaurantHarness();
    const strictMove = chef.moveTo(8, 3, false);
    assert.equal(strictMove.accepted, false);
    assert.equal(strictMove.reason, 'unreachable');

    // Manual push straight toward divider must stay strictly in col < DIVIDER_COL
    chef.setManualInput(1, 0, true);
    advanceController(chef, 150);
    assert.ok(chef.getPosition().col < DIVIDER_COL);
  });

  it('Scenario 04: Waiter moves to Dining Table 1 (T1) and interacts once', () => {
    const { waiter, firedLog } = createRestaurantHarness();
    const res = waiter.moveToInteract('table_1');
    assert.equal(res.accepted, true);

    advanceController(waiter, 180);
    assert.equal(firedLog.length, 1);
    assert.equal(firedLog[0].objectId, 'table_1');
    assert.equal(firedLog[0].role, 'waiter');
  });

  it('Scenario 05: Waiter moves from Table 1 (T1) to Table 2 (T2) around furniture', () => {
    const { waiter, firedLog } = createRestaurantHarness();
    waiter.moveToInteract('table_1');
    advanceController(waiter, 180);
    assert.equal(firedLog.length, 1);

    const res2 = waiter.moveToInteract('table_2');
    assert.equal(res2.accepted, true);
    advanceController(waiter, 180);
    assert.equal(firedLog.length, 2);
    assert.equal(firedLog[1].objectId, 'table_2');
  });

  it('Scenario 06: Waiter moves to Food Pickup Counter (pass_1) and interacts once', () => {
    const { waiter, firedLog } = createRestaurantHarness();
    const res = waiter.moveToInteract('pass_1');
    assert.equal(res.accepted, true);

    advanceController(waiter, 240);
    assert.equal(firedLog.length, 1);
    assert.equal(firedLog[0].objectId, 'pass_1');
  });

  it('Scenario 07: Waiter moves to Cashier and interacts once', () => {
    const { waiter, firedLog } = createRestaurantHarness();
    const res = waiter.moveToInteract('cashier');
    assert.equal(res.accepted, true);

    advanceController(waiter, 240);
    assert.equal(firedLog.length, 1);
    assert.equal(firedLog[0].objectId, 'cashier');
  });

  it('Scenario 08: Move near obstacle settles cleanly without jitter or penetration', () => {
    const { waiter, collision } = createRestaurantHarness();
    // Command waiter to tap directly on solid dining table T5 (9,5) with nearest fallback
    const res = waiter.moveTo(9, 5, true);
    assert.equal(res.accepted, true);
    assert.equal(res.usedFallbackGoal, true);

    advanceController(waiter, 180);
    const snap = waiter.getSnapshot();
    assert.equal(snap.movementState, 'Idle');
    assert.equal(collision.canOccupy('waiter', snap.position.col, snap.position.row), true);
  });

  it('Scenario 09: Cancel destination mid-walk stops character immediately', () => {
    const { waiter } = createRestaurantHarness();
    waiter.moveTo(12, 6, false);
    advanceController(waiter, 25);
    assert.equal(waiter.getState(), 'Moving');

    const posAtCancel = waiter.getPosition();
    waiter.cancelMovementAndInteraction();
    assert.equal(waiter.getState(), 'Idle');

    advanceController(waiter, 30);
    assert.deepEqual(waiter.getPosition(), posAtCancel);
  });

  it('Scenario 10: Timed interaction enters Interacting state and completes cleanly once', () => {
    const { chef, firedLog } = createRestaurantHarness(500);
    chef.moveToInteract('stove_2', 20_000);

    const tAfterArrival = advanceController(chef, 10, 1 / 60, 20_000);
    assert.equal(firedLog.length, 1);
    assert.equal(chef.getState(), 'Interacting');

    // Advance past 500ms duration
    advanceController(chef, 45, 1 / 60, tAfterArrival);
    assert.equal(chef.getState(), 'Idle');
    assert.equal(firedLog.length, 1); // Strictly single-fire
  });

  it('Scenario 11: Moving cancels pending or active interaction without stale callback', () => {
    // 11a: Cancel pending approach before reaching stove
    const hPending = createRestaurantHarness(0);
    hPending.chef.syncExternalPosition(4, 6);
    hPending.chef.moveToInteract('stove_1');
    advanceController(hPending.chef, 15);
    hPending.chef.moveTo(3, 6, false);
    advanceController(hPending.chef, 180);
    assert.equal(hPending.firedLog.length, 0);

    // 11b: Cancel active timed interaction by moving away
    const hActive = createRestaurantHarness(800);
    hActive.chef.moveToInteract('stove_2');
    advanceController(hActive.chef, 90, 1 / 60, 30_000);
    assert.equal(hActive.chef.getState(), 'Interacting');

    hActive.chef.moveTo(4, 3, false);
    assert.equal(hActive.cancelledLog.length, 1);
    assert.equal(hActive.chef.getState(), 'Moving');
  });

  it('Scenario 12: Both Chef and Waiter navigate simultaneously without getting stuck', () => {
    const { chef, waiter, firedLog } = createRestaurantHarness();
    chef.moveToInteract('prep_table');
    waiter.moveToInteract('table_6');

    for (let i = 0; i < 240; i++) {
      const now = 40_000 + i * 16;
      chef.update(1 / 60, now);
      waiter.update(1 / 60, now);
    }

    assert.equal(chef.getState(), 'Idle');
    assert.equal(waiter.getState(), 'Idle');
    assert.equal(firedLog.length, 2);
    assert.ok(firedLog.some((e) => e.role === 'chef' && e.objectId === 'prep_table'));
    assert.ok(firedLog.some((e) => e.role === 'waiter' && e.objectId === 'table_6'));
  });
});
