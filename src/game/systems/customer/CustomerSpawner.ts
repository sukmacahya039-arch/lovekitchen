import type { GridCoord } from '../../../shared/layout.ts';
import { DISH_IDS } from '../../../shared/recipes.ts';
import type { DishId } from '../../../shared/types.ts';
import type { NavigationGrid } from '../navigation/NavigationGrid.ts';
import {
  CUSTOMER_PROFILES,
  type CustomerProfile,
  type CustomerSystemConfig,
} from './CustomerConfig.ts';

export interface SpawnBatchRequest {
  groupSize: number;
  profiles: CustomerProfile[];
  dishId: DishId;
  spawnPositions: GridCoord[];
  customerIds: string[];
}

/**
 * Configurable CustomerSpawner with cooldown, difficulty progression,
 * entrance walkability validation, anti-stacking spacing, and capacity gating.
 */
export class CustomerSpawner {
  private config: CustomerSystemConfig;
  private grid: NavigationGrid;
  private enabled = true;
  private cooldownRemainingSec: number;
  private nextCustomerNum = 1;
  private profileCursor = 0;

  constructor(grid: NavigationGrid, config: CustomerSystemConfig, initialDelaySec = 1.4) {
    this.grid = grid;
    this.config = config;
    this.enabled = config.spawningEnabled;
    this.cooldownRemainingSec = Math.max(0, initialDelaySec);
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public getCooldownRemaining(): number {
    return this.cooldownRemainingSec;
  }

  public setCooldown(seconds: number): void {
    this.cooldownRemainingSec = Math.max(0, seconds);
  }

  public allocateCustomerId(): string {
    return `cust_${this.nextCustomerNum++}`;
  }

  /**
   * Resolves a guaranteed walkable entrance coordinate (never inside walls or blocked tiles).
   */
  public resolveWalkableEntrance(): GridCoord {
    const desired = this.config.entrancePos;
    if (this.grid.isWalkable(desired.col, desired.row, 'waiter')) {
      return { col: desired.col, row: desired.row };
    }
    const fallback = this.grid.findNearestWalkableTile('waiter', desired.col, desired.row);
    return fallback ?? { col: 13, row: 2 };
  }

  /**
   * Checks whether the entrance tile is currently free enough to spawn without stacking.
   */
  public isEntranceClear(activePositions: GridCoord[], minSeparation = 0.65): boolean {
    const entrance = this.resolveWalkableEntrance();
    for (const pos of activePositions) {
      if (Math.hypot(pos.col - entrance.col, pos.row - entrance.row) < minSeparation) {
        return false;
      }
    }
    return true;
  }

  /**
   * Ticks the spawn cooldown timer and produces a SpawnBatchRequest when capacity,
   * entrance clearance, and queue rules permit.
   */
  public update(
    dtSeconds: number,
    activeCustomerCount: number,
    queueIsFull: boolean,
    hasAvailableTable: boolean,
    maxTableCapacity: number,
    activePositions: GridCoord[],
    difficultyProgress = 0
  ): SpawnBatchRequest | null {
    if (!this.enabled) return null;

    this.cooldownRemainingSec = Math.max(0, this.cooldownRemainingSec - Math.max(0, dtSeconds));
    if (this.cooldownRemainingSec > 0) return null;

    if (activeCustomerCount >= this.config.maxCustomers) return null;
    if (queueIsFull && !hasAvailableTable && this.config.queueOverflowPolicy === 'block_spawn') {
      return null;
    }
    if (!this.isEntranceClear(activePositions)) {
      // Wait briefly until entering guest clears the doorway
      return null;
    }

    const remainingCapacity = this.config.maxCustomers - activeCustomerCount;
    const desiredSize = this.rollGroupSize(Math.min(remainingCapacity, Math.max(1, maxTableCapacity)));
    const batch = this.createBatch(desiredSize);

    // Scale next spawn cooldown smoothly with match progression
    const clampedProg = Math.max(0, Math.min(1, difficultyProgress));
    const nextInterval =
      this.config.spawnInterval -
      (this.config.spawnInterval - this.config.minSpawnInterval) * clampedProg;
    this.cooldownRemainingSec = Math.max(this.config.minSpawnInterval, nextInterval);

    return batch;
  }

  /**
   * Builds a deterministic/explicit batch for manual or test spawns.
   */
  public createBatch(
    groupSize: number,
    explicitProfiles?: CustomerProfile[],
    explicitDishId?: DishId
  ): SpawnBatchRequest {
    const safeSize = Math.max(1, Math.min(4, Math.round(groupSize)));
    const entrance = this.resolveWalkableEntrance();

    const profiles: CustomerProfile[] = [];
    const customerIds: string[] = [];
    const spawnPositions: GridCoord[] = [];

    // Spread multi-member party slightly along valid adjacent walkable tiles near doorway
    const memberOffsets: GridCoord[] = [
      { col: 0, row: 0 },
      { col: -0.38, row: 0.25 },
      { col: -0.18, row: 0.58 },
      { col: -0.58, row: 0.52 },
    ];

    for (let i = 0; i < safeSize; i++) {
      const profile =
        explicitProfiles?.[i] ??
        CUSTOMER_PROFILES[(this.profileCursor++) % CUSTOMER_PROFILES.length];
      profiles.push(profile);
      customerIds.push(this.allocateCustomerId());

      const off = memberOffsets[i] ?? { col: 0, row: 0 };
      const candCol = entrance.col + off.col;
      const candRow = entrance.row + off.row;
      if (this.grid.isWalkable(Math.round(candCol), Math.round(candRow), 'waiter')) {
        spawnPositions.push({ col: candCol, row: candRow });
      } else {
        spawnPositions.push({ col: entrance.col, row: entrance.row });
      }
    }

    const dishId =
      explicitDishId ?? DISH_IDS[Math.floor(Math.random() * DISH_IDS.length)];

    return {
      groupSize: safeSize,
      profiles,
      dishId,
      spawnPositions,
      customerIds,
    };
  }

  private rollGroupSize(maxAllowed: number): number {
    const candidates = this.config.groupSizeWeights.filter((w) => w.size <= maxAllowed && w.weight > 0);
    if (candidates.length === 0) return Math.max(1, maxAllowed);
    const totalWeight = candidates.reduce((sum, item) => sum + item.weight, 0);
    let r = Math.random() * totalWeight;
    for (const item of candidates) {
      r -= item.weight;
      if (r <= 0) return item.size;
    }
    return candidates[0].size;
  }
}
