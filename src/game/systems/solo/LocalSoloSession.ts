import {
  GameSimulation,
  type SimulationBalanceOptions,
} from '../../../../server/multiplayer/GameSimulation.ts';
import type {
  CharacterAnimState,
  FacingDirection,
  GameSnapshot,
  MatchSummary,
  Order,
  OrderDraftSubmissionItem,
  OrderPriority,
  PlayerRole,
} from '../../../shared/types.ts';
import { SOLO_BALANCE_CONFIG } from './SoloConfig.ts';

export interface LocalSoloSessionMetadata {
  sessionId: string;
  gameMode: 'solo';
  playerCount: 1;
  playerName: string;
  activeRole: PlayerRole;
  createdAt: number;
}

type SoloListenerMap = {
  gameState: (snapshot: GameSnapshot) => void;
  gameFinished: (summary: MatchSummary) => void;
};

/**
 * Offline-capable LocalSoloSession managing a complete single-player Love Kitchen shift.
 *
 * Strictly decoupled from online matchmaking and Socket.IO:
 * - Zero internet or Socket.IO dependency.
 * - Reuses the exact authoritative GameSimulation (CustomerManager, TableManager,
 *   OrderService, MenuService, RecipeService) without duplicating gameplay managers.
 * - Both Chef Cowok and Waiter Wanita exist simultaneously in the restaurant;
 *   switching active role preserves positions, timers, orders, and customer AI seamlessly.
 */
export class LocalSoloSession {
  public readonly sessionId: string;
  public readonly gameMode = 'solo' as const;
  public readonly playerCount = 1 as const;
  public readonly playerName: string;
  public readonly createdAt: number;

  private activeRole: PlayerRole;
  private simulation: GameSimulation;
  private latestSnapshot: GameSnapshot;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private balanceOverrides?: SimulationBalanceOptions;

  private listeners: { [K in keyof SoloListenerMap]: Set<SoloListenerMap[K]> } = {
    gameState: new Set(),
    gameFinished: new Set(),
  };

  constructor(
    playerName: string,
    balanceOverrides?: SimulationBalanceOptions,
    options?: { autoStartLoop?: boolean; tickIntervalMs?: number }
  ) {
    const cleanName = playerName.trim().slice(0, 18) || 'Chef Solo';
    this.playerName = cleanName;
    this.createdAt = Date.now();
    this.sessionId = `SOLO-${this.createdAt.toString(36).slice(-5).toUpperCase()}`;
    this.activeRole = SOLO_BALANCE_CONFIG.initialRole;
    this.balanceOverrides = balanceOverrides;

    this.simulation = this.createSimulation();
    this.latestSnapshot = this.simulation.getSnapshot();

    if (options?.autoStartLoop !== false) {
      this.startLoop(options?.tickIntervalMs ?? 50);
    }
  }

  private createSimulation(): GameSimulation {
    return new GameSimulation(
      this.sessionId,
      'solo',
      { socketId: `${this.sessionId}_chef`, name: `${this.playerName} (Chef)` },
      { socketId: `${this.sessionId}_waiter`, name: `${this.playerName} (Waiter)` },
      (summary) => {
        const enriched: MatchSummary = {
          ...summary,
          myRole: this.activeRole,
        };
        this.stopLoop();
        this.listeners.gameFinished.forEach((fn) => fn(enriched));
      },
      this.balanceOverrides
    );
  }

  public getMetadata(): LocalSoloSessionMetadata {
    return {
      sessionId: this.sessionId,
      gameMode: this.gameMode,
      playerCount: this.playerCount,
      playerName: this.playerName,
      activeRole: this.activeRole,
      createdAt: this.createdAt,
    };
  }

  public getActiveRole(): PlayerRole {
    return this.activeRole;
  }

  public setActiveRole(role: PlayerRole): PlayerRole {
    this.activeRole = role;
    return this.activeRole;
  }

  public toggleRole(): PlayerRole {
    this.activeRole = this.activeRole === 'chef' ? 'waiter' : 'chef';
    return this.activeRole;
  }

  public getSimulation(): GameSimulation {
    return this.simulation;
  }

  public getSnapshot(): GameSnapshot {
    return this.latestSnapshot;
  }

  public isRunning(): boolean {
    return !this.destroyed && this.tickTimer !== null;
  }

  public on<K extends keyof SoloListenerMap>(event: K, fn: SoloListenerMap[K]): () => void {
    this.listeners[event].add(fn);
    return () => {
      this.listeners[event].delete(fn);
    };
  }

  public startLoop(tickIntervalMs = 50): void {
    if (this.destroyed || this.tickTimer !== null) return;
    this.tickTimer = setInterval(() => {
      this.step();
    }, tickIntervalMs);
  }

  public stopLoop(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  /**
   * Advances simulation by dtSeconds (or real elapsed time when omitted)
   * and broadcasts the updated snapshot to subscribers.
   */
  public step(dtSeconds?: number): GameSnapshot {
    const snap = this.simulation.tick(dtSeconds);
    this.latestSnapshot = snap;
    this.emitState(snap);
    return snap;
  }

  private emitState(snap: GameSnapshot): void {
    this.listeners.gameState.forEach((fn) => fn(snap));
  }

  public sendMove(
    role: PlayerRole,
    col: number,
    row: number,
    facing: FacingDirection,
    isMoving: boolean,
    isRunning = false
  ): void {
    if (this.destroyed) return;
    this.simulation.updatePlayerPosition(role, col, row, facing, isMoving, isRunning);
    this.latestSnapshot = this.simulation.getSnapshot();
  }

  public sendInteract(
    role: PlayerRole,
    targetId?: string
  ): Promise<{ ok: boolean; message?: string }> {
    if (this.destroyed) {
      return Promise.resolve({ ok: false, message: 'Sesi solo sudah berakhir.' });
    }
    const result = this.simulation.interact(role, targetId);
    this.latestSnapshot = this.simulation.getSnapshot();
    this.emitState(this.latestSnapshot);
    return Promise.resolve(result);
  }

  public sendEmote(role: PlayerRole, text: string, anim?: CharacterAnimState): void {
    if (this.destroyed) return;
    this.simulation.triggerEmote(role, text, anim);
    this.latestSnapshot = this.simulation.getSnapshot();
    this.emitState(this.latestSnapshot);
  }

  public confirmTableOrder(
    tableId: string,
    items: OrderDraftSubmissionItem[],
    notes = '',
    priority: OrderPriority = 'NORMAL'
  ): Promise<{ ok: boolean; order?: Order; errors?: string[] }> {
    if (this.destroyed) {
      return Promise.resolve({ ok: false, errors: ['Sesi solo sudah berakhir.'] });
    }
    const result = this.simulation.confirmTableOrder(
      tableId,
      `${this.sessionId}_waiter`,
      items,
      notes,
      priority
    );
    this.latestSnapshot = this.simulation.getSnapshot();
    this.emitState(this.latestSnapshot);
    return Promise.resolve(result);
  }

  public acceptKitchenOrder(
    orderId: string
  ): Promise<{ ok: boolean; order?: Order; error?: string }> {
    if (this.destroyed) {
      return Promise.resolve({ ok: false, error: 'Sesi solo sudah berakhir.' });
    }
    const result = this.simulation.acceptKitchenOrder(orderId, `${this.sessionId}_chef`);
    this.latestSnapshot = this.simulation.getSnapshot();
    this.emitState(this.latestSnapshot);
    return Promise.resolve(result);
  }

  public cancelKitchenOrder(
    orderId: string,
    reason = 'cancelled_by_staff'
  ): Promise<{ ok: boolean; order?: Order; error?: string }> {
    if (this.destroyed) {
      return Promise.resolve({ ok: false, error: 'Sesi solo sudah berakhir.' });
    }
    const result = this.simulation.cancelKitchenOrder(orderId, reason);
    this.latestSnapshot = this.simulation.getSnapshot();
    this.emitState(this.latestSnapshot);
    return Promise.resolve(result);
  }

  public setPaused(paused: boolean): void {
    if (this.destroyed) return;
    this.simulation.setPaused(paused, paused ? this.playerName : null);
    this.latestSnapshot = this.simulation.getSnapshot();
    this.emitState(this.latestSnapshot);
  }

  public restart(autoStartLoop = true): GameSnapshot {
    this.stopLoop();
    this.destroyed = false;
    this.activeRole = SOLO_BALANCE_CONFIG.initialRole;
    this.simulation = this.createSimulation();
    this.latestSnapshot = this.simulation.getSnapshot();
    this.emitState(this.latestSnapshot);
    if (autoStartLoop) {
      this.startLoop(50);
    }
    return this.latestSnapshot;
  }

  public destroy(): void {
    this.destroyed = true;
    this.stopLoop();
    this.listeners.gameState.clear();
    this.listeners.gameFinished.clear();
  }
}
