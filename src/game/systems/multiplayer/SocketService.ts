import { io, type Socket } from 'socket.io-client';
import type {
  CharacterAnimState,
  FacingDirection,
  GameSnapshot,
  MatchSummary,
  Order,
  OrderDraftSubmissionItem,
  OrderPriority,
  PlayerRole,
  RoomState,
} from '../../../shared/types.ts';

type ListenerMap = {
  connected: (socketId: string) => void;
  disconnected: (reason: string) => void;
  roomUpdated: (room: RoomState) => void;
  matchFound: (room: RoomState) => void;
  gameStarted: (snapshot: GameSnapshot) => void;
  gameState: (snapshot: GameSnapshot) => void;
  gameFinished: (summary: MatchSummary) => void;
  rematchReady: (room: RoomState) => void;
  partnerLeft: (message: string) => void;
};

class SocketServiceImpl {
  private socket: Socket | null = null;
  private listeners: { [K in keyof ListenerMap]: Set<ListenerMap[K]> } = {
    connected: new Set(),
    disconnected: new Set(),
    roomUpdated: new Set(),
    matchFound: new Set(),
    gameStarted: new Set(),
    gameState: new Set(),
    gameFinished: new Set(),
    rematchReady: new Set(),
    partnerLeft: new Set(),
  };

  private currentRoom: RoomState | null = null;
  private latestSnapshot: GameSnapshot | null = null;
  private lastMoveSentAt = 0;

  public connect(): Socket {
    if (this.socket) return this.socket;

    const url = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      if (this.socket?.id) {
        this.listeners.connected.forEach((fn) => fn(this.socket!.id!));
      }
    });

    this.socket.on('disconnect', (reason) => {
      this.listeners.disconnected.forEach((fn) => fn(reason));
    });

    this.socket.on('room:updated', (room: RoomState) => {
      this.currentRoom = room;
      this.listeners.roomUpdated.forEach((fn) => fn(room));
    });

    this.socket.on('matchmaking:found', (room: RoomState) => {
      this.currentRoom = room;
      this.listeners.matchFound.forEach((fn) => fn(room));
    });

    this.socket.on('game:started', (snapshot: GameSnapshot) => {
      this.latestSnapshot = snapshot;
      this.listeners.gameStarted.forEach((fn) => fn(snapshot));
    });

    this.socket.on('game:state', (snapshot: GameSnapshot) => {
      this.latestSnapshot = snapshot;
      this.listeners.gameState.forEach((fn) => fn(snapshot));
    });

    this.socket.on('game:finished', (summary: MatchSummary) => {
      this.listeners.gameFinished.forEach((fn) => fn(summary));
    });

    this.socket.on('room:rematch_ready', (room: RoomState) => {
      this.currentRoom = room;
      this.latestSnapshot = null;
      this.listeners.rematchReady.forEach((fn) => fn(room));
    });

    this.socket.on('room:partner_left', (payload: { message?: string }) => {
      this.listeners.partnerLeft.forEach((fn) =>
        fn(payload?.message || 'Partner terputus dari permainan.')
      );
    });

    return this.socket;
  }

  public getSocketId(): string | null {
    return this.socket?.id ?? null;
  }

  public isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  public getCurrentRoom(): RoomState | null {
    return this.currentRoom;
  }

  public getLatestSnapshot(): GameSnapshot | null {
    return this.latestSnapshot;
  }

  public on<K extends keyof ListenerMap>(event: K, fn: ListenerMap[K]): () => void {
    this.listeners[event].add(fn);
    return () => {
      this.listeners[event].delete(fn);
    };
  }

  public createRoom(
    playerName: string,
    mode: 'coop' | 'practice' = 'coop'
  ): Promise<{ ok: boolean; room?: RoomState; error?: string }> {
    const s = this.connect();
    return new Promise((resolve) => {
      s.emit('room:create', { playerName, mode }, (res: { ok: boolean; room?: RoomState; error?: string }) => {
        if (res?.room) this.currentRoom = res.room;
        resolve(res ?? { ok: false, error: 'Tidak ada respons dari server.' });
      });
    });
  }

  public joinRoom(
    code: string,
    playerName: string
  ): Promise<{ ok: boolean; room?: RoomState; error?: string }> {
    const s = this.connect();
    return new Promise((resolve) => {
      s.emit('room:join', { code, playerName }, (res: { ok: boolean; room?: RoomState; error?: string }) => {
        if (res?.room) this.currentRoom = res.room;
        resolve(res ?? { ok: false, error: 'Tidak ada respons dari server.' });
      });
    });
  }

  public joinMatchmaking(
    playerName: string
  ): Promise<{ ok: boolean; matched?: boolean; room?: RoomState; queueSize?: number }> {
    const s = this.connect();
    return new Promise((resolve) => {
      s.emit('matchmaking:join', { playerName }, (res: { ok: boolean; matched?: boolean; room?: RoomState; queueSize?: number }) => {
        if (res?.room) this.currentRoom = res.room;
        resolve(res ?? { ok: false });
      });
    });
  }

  public cancelMatchmaking(): void {
    this.socket?.emit('matchmaking:cancel');
  }

  public proceedToCharacterSelect(): void {
    this.socket?.emit('room:proceed_character_select');
  }

  public selectRole(role: PlayerRole): Promise<{ ok: boolean; error?: string }> {
    const s = this.connect();
    return new Promise((resolve) => {
      s.emit('room:select_role', { role }, (res: { ok: boolean; error?: string }) => {
        resolve(res ?? { ok: false });
      });
    });
  }

  public toggleReady(): void {
    this.socket?.emit('room:toggle_ready');
  }

  public startGame(): Promise<{ ok: boolean; error?: string }> {
    const s = this.connect();
    return new Promise((resolve) => {
      s.emit('room:start_game', (res: { ok: boolean; error?: string }) => {
        resolve(res ?? { ok: false });
      });
    });
  }

  public sendMove(
    role: PlayerRole,
    col: number,
    row: number,
    facing: FacingDirection,
    isMoving: boolean,
    isRunning = false
  ): void {
    const now = performance.now();
    if (isMoving && now - this.lastMoveSentAt < 50) return;
    this.lastMoveSentAt = now;
    this.socket?.emit('game:move', { role, col, row, facing, isMoving, isRunning });
  }

  public sendInteract(role: PlayerRole, targetId?: string): Promise<{ ok: boolean; message?: string }> {
    if (!this.socket) return Promise.resolve({ ok: false });
    return new Promise((resolve) => {
      this.socket!.emit('game:interact', { role, targetId }, (res: { ok: boolean; message?: string }) => {
        resolve(res ?? { ok: false });
      });
    });
  }

  public sendEmote(role: PlayerRole, text: string, anim?: CharacterAnimState): void {
    this.socket?.emit('game:emote', { role, text, anim });
  }

  public confirmTableOrder(
    tableId: string,
    items: OrderDraftSubmissionItem[],
    notes = '',
    priority: OrderPriority = 'NORMAL'
  ): Promise<{ ok: boolean; order?: Order; errors?: string[] }> {
    if (!this.socket) return Promise.resolve({ ok: false, errors: ['Tidak terhubung ke server.'] });
    return new Promise((resolve) => {
      this.socket!.emit(
        'order:confirm',
        { tableId, items, notes, priority },
        (res: { ok: boolean; order?: Order; errors?: string[] }) => {
          resolve(res ?? { ok: false, errors: ['Tidak ada respons dari server.'] });
        }
      );
    });
  }

  public acceptKitchenOrder(
    orderId: string
  ): Promise<{ ok: boolean; order?: Order; error?: string }> {
    if (!this.socket) return Promise.resolve({ ok: false, error: 'Tidak terhubung ke server.' });
    return new Promise((resolve) => {
      this.socket!.emit(
        'order:accept',
        { orderId },
        (res: { ok: boolean; order?: Order; error?: string }) => {
          resolve(res ?? { ok: false, error: 'Tidak ada respons dari server.' });
        }
      );
    });
  }

  public cancelKitchenOrder(
    orderId: string,
    reason = 'cancelled_by_staff'
  ): Promise<{ ok: boolean; order?: Order; error?: string }> {
    if (!this.socket) return Promise.resolve({ ok: false, error: 'Tidak terhubung ke server.' });
    return new Promise((resolve) => {
      this.socket!.emit(
        'order:cancel',
        { orderId, reason },
        (res: { ok: boolean; order?: Order; error?: string }) => {
          resolve(res ?? { ok: false, error: 'Tidak ada respons dari server.' });
        }
      );
    });
  }

  public setPaused(paused: boolean): void {
    this.socket?.emit('game:pause', { paused });
  }

  public requestRematch(): void {
    this.socket?.emit('game:rematch');
  }

  public leaveRoom(): void {
    this.socket?.emit('room:leave');
    this.currentRoom = null;
    this.latestSnapshot = null;
  }
}

export const socketService = new SocketServiceImpl();
