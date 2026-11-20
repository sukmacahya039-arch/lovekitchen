import type { SimulationBalanceOptions } from '../../../../server/multiplayer/GameSimulation.ts';
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
import { socketService } from '../multiplayer/SocketService.ts';
import { LocalSoloSession } from '../solo/LocalSoloSession.ts';

export type ActiveSessionKind = 'none' | 'solo' | 'online';

type SessionListenerMap = {
  gameState: (snapshot: GameSnapshot) => void;
  gameFinished: (summary: MatchSummary) => void;
};

/**
 * Unified gameplay transport facade enforcing strict separation between:
 * - LocalSoloSession ('solo'): 100% offline local simulation, zero Socket.IO dependency.
 * - SocketService ('online'): Real-time Socket.IO Co-Op multiplayer room.
 *
 * RestaurantScene, OrderTakingUI, KitchenOrderBoard, and GameShell talk to this
 * single manager so Solo and Online share identical restaurant mechanics cleanly.
 */
class GameSessionManagerImpl {
  private sessionKind: ActiveSessionKind = 'none';
  private soloSession: LocalSoloSession | null = null;
  private soloUnsubs: Array<() => void> = [];
  private socketWired = false;

  private listeners: { [K in keyof SessionListenerMap]: Set<SessionListenerMap[K]> } = {
    gameState: new Set(),
    gameFinished: new Set(),
  };

  private ensureSocketForwarding(): void {
    if (this.socketWired) return;
    this.socketWired = true;

    socketService.on('gameState', (snap) => {
      if (this.sessionKind === 'online') {
        this.listeners.gameState.forEach((fn) => fn(snap));
      }
    });

    socketService.on('gameFinished', (summary) => {
      if (this.sessionKind === 'online') {
        this.listeners.gameFinished.forEach((fn) => fn(summary));
      }
    });
  }

  public getSessionKind(): ActiveSessionKind {
    return this.sessionKind;
  }

  public isSoloSession(): boolean {
    return this.sessionKind === 'solo' && this.soloSession !== null;
  }

  public getSoloSession(): LocalSoloSession | null {
    return this.soloSession;
  }

  public getLocalIdentityId(): string {
    if (this.sessionKind === 'solo' && this.soloSession) {
      return this.soloSession.sessionId;
    }
    return socketService.getSocketId() ?? 'local';
  }

  public getLatestSnapshot(): GameSnapshot | null {
    if (this.sessionKind === 'solo' && this.soloSession) {
      return this.soloSession.getSnapshot();
    }
    if (this.sessionKind === 'online') {
      return socketService.getLatestSnapshot();
    }
    return null;
  }

  public on<K extends keyof SessionListenerMap>(
    event: K,
    fn: SessionListenerMap[K]
  ): () => void {
    this.ensureSocketForwarding();
    this.listeners[event].add(fn);
    return () => {
      this.listeners[event].delete(fn);
    };
  }

  /**
   * Starts a fresh offline-capable LocalSoloSession immediately.
   * Explicitly cancels any online matchmaking or room state without calling Socket.IO.
   */
  public startSoloSession(
    playerName: string,
    balanceOverrides?: SimulationBalanceOptions
  ): GameSnapshot {
    this.destroySoloInternal();

    // Ensure no residual online matchmaking or room remains active
    if (socketService.isConnected()) {
      socketService.cancelMatchmaking();
      if (socketService.getCurrentRoom()) {
        socketService.leaveRoom();
      }
    }

    this.sessionKind = 'solo';
    const session = new LocalSoloSession(playerName, balanceOverrides);
    this.soloSession = session;

    this.soloUnsubs = [
      session.on('gameState', (snap) => {
        if (this.sessionKind === 'solo') {
          this.listeners.gameState.forEach((fn) => fn(snap));
        }
      }),
      session.on('gameFinished', (summary) => {
        if (this.sessionKind === 'solo') {
          this.listeners.gameFinished.forEach((fn) => fn(summary));
        }
      }),
    ];

    return session.getSnapshot();
  }

  /**
   * Switches active transport into Online Multiplayer mode and destroys any local solo loop.
   */
  public enterOnlineMode(): void {
    this.ensureSocketForwarding();
    this.destroySoloInternal();
    this.sessionKind = 'online';
  }

  public leaveActiveSession(): void {
    this.destroySoloInternal();
    if (socketService.isConnected()) {
      socketService.cancelMatchmaking();
      socketService.leaveRoom();
    }
    this.sessionKind = 'none';
  }

  public restartSoloSession(): GameSnapshot | null {
    if (this.sessionKind !== 'solo' || !this.soloSession) return null;
    return this.soloSession.restart(true);
  }

  public setSoloActiveRole(role: PlayerRole): void {
    if (this.sessionKind === 'solo' && this.soloSession) {
      this.soloSession.setActiveRole(role);
    }
  }

  public sendMove(
    role: PlayerRole,
    col: number,
    row: number,
    facing: FacingDirection,
    isMoving: boolean,
    isRunning = false
  ): void {
    if (this.sessionKind === 'solo' && this.soloSession) {
      this.soloSession.sendMove(role, col, row, facing, isMoving, isRunning);
      return;
    }
    socketService.sendMove(role, col, row, facing, isMoving, isRunning);
  }

  public sendInteract(
    role: PlayerRole,
    targetId?: string
  ): Promise<{ ok: boolean; message?: string }> {
    if (this.sessionKind === 'solo' && this.soloSession) {
      return this.soloSession.sendInteract(role, targetId);
    }
    return socketService.sendInteract(role, targetId);
  }

  public sendEmote(role: PlayerRole, text: string, anim?: CharacterAnimState): void {
    if (this.sessionKind === 'solo' && this.soloSession) {
      this.soloSession.sendEmote(role, text, anim);
      return;
    }
    socketService.sendEmote(role, text, anim);
  }

  public confirmTableOrder(
    tableId: string,
    items: OrderDraftSubmissionItem[],
    notes = '',
    priority: OrderPriority = 'NORMAL'
  ): Promise<{ ok: boolean; order?: Order; errors?: string[] }> {
    if (this.sessionKind === 'solo' && this.soloSession) {
      return this.soloSession.confirmTableOrder(tableId, items, notes, priority);
    }
    return socketService.confirmTableOrder(tableId, items, notes, priority);
  }

  public acceptKitchenOrder(
    orderId: string
  ): Promise<{ ok: boolean; order?: Order; error?: string }> {
    if (this.sessionKind === 'solo' && this.soloSession) {
      return this.soloSession.acceptKitchenOrder(orderId);
    }
    return socketService.acceptKitchenOrder(orderId);
  }

  public cancelKitchenOrder(
    orderId: string,
    reason = 'cancelled_by_staff'
  ): Promise<{ ok: boolean; order?: Order; error?: string }> {
    if (this.sessionKind === 'solo' && this.soloSession) {
      return this.soloSession.cancelKitchenOrder(orderId, reason);
    }
    return socketService.cancelKitchenOrder(orderId, reason);
  }

  public setPaused(paused: boolean): void {
    if (this.sessionKind === 'solo' && this.soloSession) {
      this.soloSession.setPaused(paused);
      return;
    }
    socketService.setPaused(paused);
  }

  public requestRematch(): GameSnapshot | null {
    if (this.sessionKind === 'solo' && this.soloSession) {
      return this.soloSession.restart(true);
    }
    socketService.requestRematch();
    return null;
  }

  private destroySoloInternal(): void {
    this.soloUnsubs.forEach((fn) => fn());
    this.soloUnsubs = [];
    if (this.soloSession) {
      this.soloSession.destroy();
      this.soloSession = null;
    }
  }
}

export const gameSessionManager = new GameSessionManagerImpl();
