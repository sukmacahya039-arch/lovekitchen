import { io, type Socket } from 'socket.io-client';
import {
  DEFAULT_SELECTED_MAP,
  normalizeRoomCode,
  type ConnectionStatus,
} from '../../../shared/roomProtocol.ts';
import type {
  CharacterAnimState,
  FacingDirection,
  GameSnapshot,
  MatchSummary,
  Order,
  OrderDraftSubmissionItem,
  OrderPriority,
  PlayerRole,
  RoomClosedPayload,
  RoomHostChangedPayload,
  RoomPlayerEventPayload,
  RoomReadyChangedPayload,
  RoomState,
  RoomStateChangedPayload,
} from '../../../shared/types.ts';

const PLAYER_ID_STORAGE_KEY = 'love_kitchen_player_id_v1';
const DEFAULT_CONNECT_TIMEOUT_MS = 7000;
const DEFAULT_ACK_TIMEOUT_MS = 8000;

export interface ConnectionSnapshot {
  status: ConnectionStatus;
  socketId: string | null;
  playerId: string;
  error: string | null;
}

export interface RoomActionResult {
  ok: boolean;
  room?: RoomState;
  reconnected?: boolean;
  gameSessionId?: string | null;
  errorCode?: string;
  error?: string;
}

type ListenerMap = {
  connected: (socketId: string) => void;
  disconnected: (reason: string) => void;
  connectionStatusChanged: (snapshot: ConnectionSnapshot) => void;
  roomUpdated: (room: RoomState) => void;
  playerJoined: (payload: RoomPlayerEventPayload) => void;
  playerLeft: (payload: RoomPlayerEventPayload) => void;
  playerDisconnected: (payload: RoomPlayerEventPayload) => void;
  playerReconnected: (payload: RoomPlayerEventPayload) => void;
  roomStateChanged: (payload: RoomStateChangedPayload) => void;
  readyChanged: (payload: RoomReadyChangedPayload) => void;
  hostChanged: (payload: RoomHostChangedPayload) => void;
  roomClosed: (payload: RoomClosedPayload) => void;
  matchFound: (room: RoomState) => void;
  gameStarted: (snapshot: GameSnapshot) => void;
  gameState: (snapshot: GameSnapshot) => void;
  gameFinished: (summary: MatchSummary) => void;
  rematchReady: (room: RoomState) => void;
  partnerLeft: (message: string) => void;
};

function getOrCreatePlayerId(): string {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const existing = sessionStorage.getItem(PLAYER_ID_STORAGE_KEY);
      if (existing && existing.length >= 6) return existing;
      const generated = `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, generated);
      return generated;
    }
  } catch {
    // Fallback when storage is unavailable
  }
  return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

class SocketServiceImpl {
  private socket: Socket | null = null;
  private listeners: { [K in keyof ListenerMap]: Set<ListenerMap[K]> } = {
    connected: new Set(),
    disconnected: new Set(),
    connectionStatusChanged: new Set(),
    roomUpdated: new Set(),
    playerJoined: new Set(),
    playerLeft: new Set(),
    playerDisconnected: new Set(),
    playerReconnected: new Set(),
    roomStateChanged: new Set(),
    readyChanged: new Set(),
    hostChanged: new Set(),
    roomClosed: new Set(),
    matchFound: new Set(),
    gameStarted: new Set(),
    gameState: new Set(),
    gameFinished: new Set(),
    rematchReady: new Set(),
    partnerLeft: new Set(),
  };

  private playerId: string = getOrCreatePlayerId();
  private connectionStatus: ConnectionStatus = 'DISCONNECTED';
  private lastConnectionError: string | null = null;
  private currentRoom: RoomState | null = null;
  private latestSnapshot: GameSnapshot | null = null;
  private lastMoveSentAt = 0;
  private networkListenersBound = false;

  public connect(): Socket {
    if (this.socket) {
      if (!this.socket.connected && !this.socket.active) {
        this.setConnectionStatus('CONNECTING', null);
        this.socket.connect();
      }
      return this.socket;
    }

    this.bindBrowserNetworkListeners();
    this.setConnectionStatus('CONNECTING', null);

    const url = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    this.socket = io(url, {
      transports: ['polling', 'websocket'],
      timeout: DEFAULT_CONNECT_TIMEOUT_MS,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      const id = this.socket?.id ?? null;
      this.setConnectionStatus('CONNECTED', null);
      if (id) {
        this.listeners.connected.forEach((fn) => fn(id));
      }

      // Attempt seamless room rebind if the player had an active room before a brief drop
      if (this.currentRoom && this.currentRoom.roomStatus !== 'CLOSED') {
        const roomCode = this.currentRoom.roomCode || this.currentRoom.code;
        this.socket?.emit(
          'room:reconnect',
          { code: roomCode, playerId: this.playerId },
          (res: RoomActionResult) => {
            if (res?.ok && res.room) {
              this.currentRoom = res.room;
              this.listeners.roomUpdated.forEach((fn) => fn(res.room!));
            }
          }
        );
      }
    });

    this.socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') {
        this.setConnectionStatus('DISCONNECTED', null);
      } else {
        this.setConnectionStatus(
          'DISCONNECTED',
          'Koneksi ke server terputus. Mencoba menyambung kembali...'
        );
      }
      this.listeners.disconnected.forEach((fn) => fn(reason));
    });

    this.socket.on('connect_error', () => {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      this.setConnectionStatus(
        'ERROR',
        offline
          ? 'Koneksi internet terputus. Periksa jaringan kamu lalu coba lagi.'
          : 'Tidak dapat terhubung ke server multiplayer. Coba sambungkan ulang.'
      );
    });

    this.socket.io.on('reconnect_attempt', () => {
      this.setConnectionStatus('CONNECTING', null);
    });

    this.socket.io.on('reconnect_failed', () => {
      this.setConnectionStatus(
        'ERROR',
        'Gagal menyambung ulang ke server multiplayer. Tekan coba lagi.'
      );
    });

    this.socket.on('room:updated', (room: RoomState) => {
      this.currentRoom = room;
      this.listeners.roomUpdated.forEach((fn) => fn(room));
    });

    this.socket.on('room:player_joined', (payload: RoomPlayerEventPayload) => {
      if (payload?.room) this.currentRoom = payload.room;
      this.listeners.playerJoined.forEach((fn) => fn(payload));
    });

    this.socket.on('room:player_left', (payload: RoomPlayerEventPayload) => {
      if (payload?.room) this.currentRoom = payload.room;
      this.listeners.playerLeft.forEach((fn) => fn(payload));
    });

    this.socket.on('room:player_disconnected', (payload: RoomPlayerEventPayload) => {
      if (payload?.room) this.currentRoom = payload.room;
      this.listeners.playerDisconnected.forEach((fn) => fn(payload));
    });

    this.socket.on('room:player_reconnected', (payload: RoomPlayerEventPayload) => {
      if (payload?.room) this.currentRoom = payload.room;
      this.listeners.playerReconnected.forEach((fn) => fn(payload));
    });

    this.socket.on('room:state_changed', (payload: RoomStateChangedPayload) => {
      if (payload?.room) this.currentRoom = payload.room;
      this.listeners.roomStateChanged.forEach((fn) => fn(payload));
    });

    this.socket.on('room:ready_changed', (payload: RoomReadyChangedPayload) => {
      if (payload?.room) this.currentRoom = payload.room;
      this.listeners.readyChanged.forEach((fn) => fn(payload));
    });

    this.socket.on('room:host_changed', (payload: RoomHostChangedPayload) => {
      if (payload?.room) this.currentRoom = payload.room;
      this.listeners.hostChanged.forEach((fn) => fn(payload));
    });

    this.socket.on('room:closed', (payload: RoomClosedPayload) => {
      this.currentRoom = null;
      this.latestSnapshot = null;
      this.listeners.roomClosed.forEach((fn) => fn(payload));
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

  public reconnect(): void {
    const s = this.connect();
    if (!s.connected) {
      this.setConnectionStatus('CONNECTING', null);
      s.connect();
    }
  }

  public getPlayerId(): string {
    return this.playerId;
  }

  public getSocketId(): string | null {
    return this.socket?.connected ? this.socket.id ?? null : null;
  }

  public isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  public getConnectionSnapshot(): ConnectionSnapshot {
    const actualStatus: ConnectionStatus =
      this.socket?.connected
        ? 'CONNECTED'
        : this.connectionStatus === 'CONNECTED'
          ? 'DISCONNECTED'
          : this.connectionStatus;

    return {
      status: actualStatus,
      socketId: this.getSocketId(),
      playerId: this.playerId,
      error: this.lastConnectionError,
    };
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

  public async ensureConnected(
    timeoutMs = DEFAULT_CONNECT_TIMEOUT_MS
  ): Promise<{ ok: boolean; error?: string }> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const msg = 'Koneksi internet terputus. Periksa jaringan kamu lalu coba lagi.';
      this.setConnectionStatus('ERROR', msg);
      return { ok: false, error: msg };
    }

    const s = this.connect();
    if (s.connected) {
      this.setConnectionStatus('CONNECTED', null);
      return { ok: true };
    }

    this.setConnectionStatus('CONNECTING', null);
    if (!s.active) {
      s.connect();
    }

    return new Promise((resolve) => {
      let settled = false;

      const cleanup = () => {
        clearTimeout(timer);
        s.off('connect', onConnect);
        s.off('connect_error', onError);
      };

      const onConnect = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ ok: true });
      };

      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({
          ok: false,
          error: 'Server multiplayer tidak dapat dijangkau. Coba lagi beberapa saat.',
        });
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        this.setConnectionStatus('ERROR', 'Waktu koneksi ke server habis. Silakan coba lagi.');
        resolve({
          ok: false,
          error: 'Waktu koneksi ke server habis. Periksa koneksi internet dan coba lagi.',
        });
      }, timeoutMs);

      s.once('connect', onConnect);
      s.once('connect_error', onError);
    });
  }

  public async createRoom(
    playerName: string,
    mode: 'coop' | 'practice' = 'coop',
    selectedMap = DEFAULT_SELECTED_MAP
  ): Promise<RoomActionResult> {
    const conn = await this.ensureConnected();
    if (!conn.ok) {
      return { ok: false, errorCode: 'CONNECTION_FAILED', error: conn.error };
    }

    const res = await this.emitWithAck<RoomActionResult>(
      'room:create',
      { playerName, playerId: this.playerId, mode, selectedMap },
      'Gagal membuat room karena server tidak merespons. Coba lagi.'
    );
    if (res.ok && res.room) {
      this.currentRoom = res.room;
    }
    return res;
  }

  public async joinRoom(code: string, playerName: string): Promise<RoomActionResult> {
    const normalizedCode = normalizeRoomCode(code);
    if (!normalizedCode) {
      return {
        ok: false,
        errorCode: 'EMPTY_CODE',
        error: 'Masukkan kode room terlebih dahulu.',
      };
    }

    const conn = await this.ensureConnected();
    if (!conn.ok) {
      return { ok: false, errorCode: 'CONNECTION_FAILED', error: conn.error };
    }

    const res = await this.emitWithAck<RoomActionResult>(
      'room:join',
      { code: normalizedCode, playerName, playerId: this.playerId },
      'Gagal bergabung ke room karena server tidak merespons. Coba lagi.'
    );
    if (res.ok && res.room) {
      this.currentRoom = res.room;
    }
    return res;
  }

  public async joinMatchmaking(
    playerName: string
  ): Promise<{ ok: boolean; matched?: boolean; room?: RoomState; queueSize?: number; error?: string }> {
    const conn = await this.ensureConnected();
    if (!conn.ok) {
      return { ok: false, error: conn.error };
    }

    const res = await this.emitWithAck<{
      ok: boolean;
      matched?: boolean;
      room?: RoomState;
      queueSize?: number;
      error?: string;
    }>(
      'matchmaking:join',
      { playerName, playerId: this.playerId },
      'Server matchmaking tidak merespons. Coba lagi.'
    );
    if (res.room) {
      this.currentRoom = res.room;
    }
    return res;
  }

  public cancelMatchmaking(): void {
    this.socket?.emit('matchmaking:cancel');
  }

  public proceedToCharacterSelect(): void {
    this.socket?.emit('room:proceed_character_select');
  }

  public async selectRole(role: PlayerRole): Promise<RoomActionResult> {
    const conn = await this.ensureConnected();
    if (!conn.ok) return { ok: false, error: conn.error };
    return this.emitWithAck<RoomActionResult>(
      'room:select_role',
      { role },
      'Gagal mengubah peran.'
    );
  }

  public async toggleReady(): Promise<{ ok: boolean; ready?: boolean; room?: RoomState; error?: string }> {
    const conn = await this.ensureConnected();
    if (!conn.ok) return { ok: false, error: conn.error };
    return this.emitWithAck<{ ok: boolean; ready?: boolean; room?: RoomState; error?: string }>(
      'room:toggle_ready',
      undefined,
      'Gagal memperbarui status siap.'
    );
  }

  public async startGame(): Promise<RoomActionResult> {
    const conn = await this.ensureConnected();
    if (!conn.ok) return { ok: false, error: conn.error };
    return this.emitWithAck<RoomActionResult>(
      'room:start_game',
      undefined,
      'Gagal memulai game karena server tidak merespons. Coba lagi.'
    );
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
    if (!this.socket?.connected) return Promise.resolve({ ok: false });
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
    if (!this.socket?.connected) {
      return Promise.resolve({ ok: false, errors: ['Tidak terhubung ke server.'] });
    }
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
    if (!this.socket?.connected) {
      return Promise.resolve({ ok: false, error: 'Tidak terhubung ke server.' });
    }
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
    if (!this.socket?.connected) {
      return Promise.resolve({ ok: false, error: 'Tidak terhubung ke server.' });
    }
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
    if (this.socket?.connected) {
      this.socket.emit('room:leave');
    }
    this.currentRoom = null;
    this.latestSnapshot = null;
  }

  private emitWithAck<T extends { ok: boolean; error?: string }>(
    event: string,
    payload: unknown,
    timeoutMessage: string,
    timeoutMs = DEFAULT_ACK_TIMEOUT_MS
  ): Promise<T> {
    if (!this.socket?.connected) {
      return Promise.resolve({
        ok: false,
        error: 'Belum terhubung ke server multiplayer. Coba lagi.',
      } as T);
    }

    return new Promise<T>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, error: timeoutMessage } as T);
      }, timeoutMs);

      const handleAck = (res: T | undefined) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(
          res ??
            ({
              ok: false,
              error: 'Respons server tidak valid. Silakan coba lagi.',
            } as T)
        );
      };

      if (payload === undefined) {
        this.socket!.emit(event, handleAck);
      } else {
        this.socket!.emit(event, payload, handleAck);
      }
    });
  }

  private setConnectionStatus(status: ConnectionStatus, error: string | null): void {
    this.connectionStatus = status;
    this.lastConnectionError = error;
    const snap = this.getConnectionSnapshot();
    this.listeners.connectionStatusChanged.forEach((fn) => fn(snap));
  }

  private bindBrowserNetworkListeners(): void {
    if (this.networkListenersBound || typeof window === 'undefined') return;
    this.networkListenersBound = true;

    window.addEventListener('offline', () => {
      this.setConnectionStatus(
        'ERROR',
        'Koneksi internet terputus. Periksa jaringan kamu lalu coba lagi.'
      );
    });

    window.addEventListener('online', () => {
      if (this.socket && !this.socket.connected) {
        this.setConnectionStatus('CONNECTING', null);
        this.socket.connect();
      }
    });
  }
}

export const socketService = new SocketServiceImpl();
