import crypto from 'crypto';
import type { Server, Socket } from 'socket.io';
import {
  canTransitionRoomStatus,
  DEFAULT_SELECTED_MAP,
  generateFormattedRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  type RoomStatus,
} from '../../src/shared/roomProtocol.ts';
import type {
  CharacterAnimState,
  FacingDirection,
  OrderDraftSubmissionItem,
  OrderPriority,
  PlayerRole,
  RoomClosedPayload,
  RoomHostChangedPayload,
  RoomMember,
  RoomPlayerEventPayload,
  RoomReadyChangedPayload,
  RoomState,
  RoomStateChangedPayload,
} from '../../src/shared/types.ts';
import { GameSimulation } from './GameSimulation.ts';

export interface RoomManagerOptions {
  roomTtlMs?: number;
  disconnectGraceMs?: number;
  cleanupIntervalMs?: number;
}

interface ActiveRoom {
  state: RoomState;
  simulation: GameSimulation | null;
  tickInterval: ReturnType<typeof setInterval> | null;
  disconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
}

interface MatchmakingEntry {
  socketId: string;
  playerId: string;
  name: string;
  joinedAt: number;
}

const DEFAULT_ROOM_TTL_MS = 30 * 60 * 1000; // 30 minutes idle lobby expiration
const DEFAULT_DISCONNECT_GRACE_MS = 20 * 1000; // 20 seconds mobile reconnect window
const DEFAULT_CLEANUP_INTERVAL_MS = 30 * 1000;

export class RoomManager {
  private io: Server;
  private rooms = new Map<string, ActiveRoom>();
  private socketToRoom = new Map<string, string>();
  private matchmakingQueue: MatchmakingEntry[] = [];
  private roomTtlMs: number;
  private disconnectGraceMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(io: Server, options: RoomManagerOptions = {}) {
    this.io = io;
    this.roomTtlMs = options.roomTtlMs ?? DEFAULT_ROOM_TTL_MS;
    this.disconnectGraceMs = options.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS;

    const cleanupMs = options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
    if (cleanupMs > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanupExpiredRooms();
      }, cleanupMs);
      this.cleanupTimer.unref?.();
    }
  }

  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const room of this.rooms.values()) {
      if (room.tickInterval) clearInterval(room.tickInterval);
      for (const timer of room.disconnectTimers.values()) clearTimeout(timer);
      room.disconnectTimers.clear();
    }
    this.rooms.clear();
    this.socketToRoom.clear();
    this.matchmakingQueue = [];
  }

  public getStats() {
    return {
      activeRooms: this.rooms.size,
      playersInQueue: this.matchmakingQueue.length,
    };
  }

  public getPublicRoomInfo(rawCode: string): {
    exists: boolean;
    roomCode?: string;
    roomStatus?: RoomStatus;
    playerCount?: number;
    maxPlayers?: number;
    selectedMap?: string;
    joinable?: boolean;
  } {
    const normalized = normalizeRoomCode(rawCode);
    if (!isValidRoomCode(normalized)) {
      return { exists: false };
    }
    const room = this.rooms.get(normalized);
    if (!room) return { exists: false };

    if (this.isRoomExpired(room)) {
      this.closeRoom(normalized, 'Room kedaluwarsa karena tidak aktif.');
      return { exists: false };
    }

    return {
      exists: true,
      roomCode: room.state.roomCode,
      roomStatus: room.state.roomStatus,
      playerCount: room.state.members.length,
      maxPlayers: room.state.maxPlayers,
      selectedMap: room.state.selectedMap,
      joinable:
        room.state.mode === 'coop' &&
        (room.state.roomStatus === 'WAITING' || room.state.roomStatus === 'READY') &&
        room.state.members.length < room.state.maxPlayers,
    };
  }

  public cleanupExpiredRooms(now = Date.now()): number {
    let cleaned = 0;
    for (const [code, room] of Array.from(this.rooms.entries())) {
      if (this.isRoomExpired(room, now)) {
        this.closeRoom(code, 'Room ditutup otomatis karena tidak aktif.');
        cleaned += 1;
      }
    }
    return cleaned;
  }

  public registerSocket(socket: Socket): void {
    socket.on(
      'room:create',
      (
        payload: {
          playerName?: string;
          playerId?: string;
          mode?: 'coop' | 'practice';
          selectedMap?: string;
        },
        cb
      ) => {
        try {
          this.removeFromQueue(socket.id);
          this.leaveCurrentRoom(socket, true);

          const cleanName = this.sanitizeName(payload?.playerName);
          const cleanPlayerId = this.sanitizePlayerId(payload?.playerId, socket.id);
          const mode = payload?.mode === 'practice' ? 'practice' : 'coop';
          const selectedMap = this.sanitizeMap(payload?.selectedMap);
          const roomCode = this.generateUniqueRoomCode();
          const roomId = `rm_${crypto.randomBytes(6).toString('hex')}`;
          const now = Date.now();

          const hostMember: RoomMember = {
            socketId: socket.id,
            playerId: cleanPlayerId,
            slot: 1,
            name: cleanName,
            role: 'chef',
            ready: true,
            isHost: true,
            connected: true,
            joinedAt: now,
            disconnectedAt: null,
          };

          const roomState: RoomState = {
            roomId,
            roomCode,
            code: roomCode,
            hostId: cleanPlayerId,
            hostName: cleanName,
            hostSocketId: socket.id,
            mode,
            gameMode: mode,
            selectedMap,
            phase: mode === 'practice' ? 'character_select' : 'lobby',
            roomStatus: 'CREATING',
            playerCount: 1,
            maxPlayers: mode === 'practice' ? 1 : 2,
            members: [hostMember],
            players: [hostMember],
            gameSessionId: null,
            createdAt: now,
            updatedAt: now,
            expiresAt: now + this.roomTtlMs,
          };

          const activeRoom: ActiveRoom = {
            state: roomState,
            simulation: null,
            tickInterval: null,
            disconnectTimers: new Map(),
          };

          this.transitionRoomStatus(activeRoom, 'WAITING', false);
          this.rooms.set(roomCode, activeRoom);
          this.socketToRoom.set(socket.id, roomCode);
          socket.join(roomCode);

          const snapshot = this.syncDerivedFields(activeRoom);
          this.broadcastRoomState(roomCode);
          cb?.({ ok: true, room: snapshot });
        } catch {
          cb?.({
            ok: false,
            errorCode: 'CREATE_FAILED',
            error: 'Gagal membuat room di server. Silakan coba lagi.',
          });
        }
      }
    );

    socket.on(
      'room:join',
      (payload: { code?: string; playerName?: string; playerId?: string }, cb) => {
        try {
          const normalizedCode = normalizeRoomCode(String(payload?.code ?? ''));
          if (!normalizedCode || !isValidRoomCode(normalizedCode)) {
            cb?.({
              ok: false,
              errorCode: 'INVALID_CODE',
              error: 'Room tidak ditemukan. Periksa kode room dan coba lagi.',
            });
            return;
          }

          const room = this.rooms.get(normalizedCode);
          if (!room) {
            cb?.({
              ok: false,
              errorCode: 'ROOM_NOT_FOUND',
              error: 'Room tidak ditemukan. Periksa kode room dan coba lagi.',
            });
            return;
          }

          if (this.isRoomExpired(room)) {
            this.closeRoom(normalizedCode, 'Room sudah kedaluwarsa.');
            cb?.({
              ok: false,
              errorCode: 'ROOM_EXPIRED',
              error: 'Room sudah kedaluwarsa. Minta Host membuat room baru.',
            });
            return;
          }

          if (room.state.roomStatus === 'CLOSED' || room.state.roomStatus === 'ERROR') {
            cb?.({
              ok: false,
              errorCode: 'ROOM_CLOSED',
              error: 'Room sudah ditutup.',
            });
            return;
          }

          const cleanName = this.sanitizeName(payload?.playerName);
          const cleanPlayerId = this.sanitizePlayerId(payload?.playerId, socket.id);

          // Check duplicate player or seamless reconnect by playerId
          const existingMember = room.state.members.find(
            (m) => m.playerId === cleanPlayerId || m.socketId === socket.id
          );
          if (existingMember) {
            if (!existingMember.connected) {
              const reconnectedRoom = this.handleMemberReconnect(socket, room, existingMember);
              cb?.({ ok: true, reconnected: true, room: reconnectedRoom });
              return;
            }
            cb?.({
              ok: false,
              errorCode: 'DUPLICATE_PLAYER',
              error: 'Kamu sudah bergabung di room ini.',
            });
            return;
          }

          if (
            room.state.roomStatus === 'IN_GAME' ||
            room.state.roomStatus === 'STARTING' ||
            room.state.phase === 'playing'
          ) {
            cb?.({
              ok: false,
              errorCode: 'GAME_ALREADY_STARTED',
              error: 'Game sudah dimulai. Kamu tidak dapat bergabung.',
            });
            return;
          }

          if (room.state.mode === 'practice') {
            cb?.({
              ok: false,
              errorCode: 'PRACTICE_ONLY',
              error: 'Room ini sedang dalam mode Solo Practice.',
            });
            return;
          }

          if (room.state.members.length >= room.state.maxPlayers) {
            cb?.({
              ok: false,
              errorCode: 'ROOM_FULL',
              error: 'Room sudah penuh.',
            });
            return;
          }

          // Leave any prior room before joining the new room
          this.removeFromQueue(socket.id);
          this.leaveCurrentRoom(socket, true);

          const hostMember = room.state.members[0];
          const assignedRole: PlayerRole = hostMember?.role === 'chef' ? 'waiter' : 'chef';
          const now = Date.now();

          const guestMember: RoomMember = {
            socketId: socket.id,
            playerId: cleanPlayerId,
            slot: 2,
            name: cleanName,
            role: assignedRole,
            ready: true,
            isHost: false,
            connected: true,
            joinedAt: now,
            disconnectedAt: null,
          };

          room.state.members.push(guestMember);
          room.state.expiresAt = now + this.roomTtlMs;
          this.socketToRoom.set(socket.id, normalizedCode);
          socket.join(normalizedCode);

          this.recomputeLobbyRoomStatus(room);
          const snapshot = this.syncDerivedFields(room);

          const joinEvent: RoomPlayerEventPayload = {
            roomId: snapshot.roomId,
            roomCode: snapshot.roomCode,
            player: { ...guestMember },
            room: snapshot,
          };
          this.io.to(normalizedCode).emit('room:player_joined', joinEvent);
          this.broadcastRoomState(normalizedCode);
          cb?.({ ok: true, room: snapshot });
        } catch {
          cb?.({
            ok: false,
            errorCode: 'JOIN_FAILED',
            error: 'Gagal bergabung ke room. Coba lagi beberapa saat.',
          });
        }
      }
    );

    socket.on('room:reconnect', (payload: { code?: string; playerId?: string }, cb) => {
      try {
        const normalizedCode = normalizeRoomCode(String(payload?.code ?? ''));
        const playerId = String(payload?.playerId ?? '').trim();
        if (!normalizedCode || !playerId) {
          cb?.({ ok: false, error: 'Data reconnect tidak valid.' });
          return;
        }
        const room = this.rooms.get(normalizedCode);
        if (!room || room.state.roomStatus === 'CLOSED') {
          cb?.({ ok: false, error: 'Room sudah tidak tersedia.' });
          return;
        }
        const member = room.state.members.find((m) => m.playerId === playerId);
        if (!member) {
          cb?.({ ok: false, error: 'Pemain tidak ditemukan di room ini.' });
          return;
        }
        const snapshot = this.handleMemberReconnect(socket, room, member);
        cb?.({ ok: true, room: snapshot });
      } catch {
        cb?.({ ok: false, error: 'Gagal menyambung ulang ke room.' });
      }
    });

    socket.on(
      'matchmaking:join',
      (payload: { playerName?: string; playerId?: string }, cb) => {
        this.leaveCurrentRoom(socket, true);
        this.removeFromQueue(socket.id);

        const cleanName = this.sanitizeName(payload?.playerName);
        const cleanPlayerId = this.sanitizePlayerId(payload?.playerId, socket.id);

        while (this.matchmakingQueue.length > 0) {
          const partner = this.matchmakingQueue.shift()!;
          const partnerSocket = this.io.sockets.sockets.get(partner.socketId);
          if (partnerSocket && partnerSocket.connected && partner.playerId !== cleanPlayerId) {
            const roomCode = this.generateUniqueRoomCode();
            const roomId = `rm_${crypto.randomBytes(6).toString('hex')}`;
            const now = Date.now();

            const hostMember: RoomMember = {
              socketId: partner.socketId,
              playerId: partner.playerId,
              slot: 1,
              name: partner.name,
              role: 'chef',
              ready: true,
              isHost: true,
              connected: true,
              joinedAt: now,
              disconnectedAt: null,
            };
            const guestMember: RoomMember = {
              socketId: socket.id,
              playerId: cleanPlayerId,
              slot: 2,
              name: cleanName,
              role: 'waiter',
              ready: true,
              isHost: false,
              connected: true,
              joinedAt: now,
              disconnectedAt: null,
            };

            const roomState: RoomState = {
              roomId,
              roomCode,
              code: roomCode,
              hostId: hostMember.playerId,
              hostName: hostMember.name,
              hostSocketId: partner.socketId,
              mode: 'coop',
              gameMode: 'coop',
              selectedMap: DEFAULT_SELECTED_MAP,
              phase: 'lobby',
              roomStatus: 'CREATING',
              playerCount: 2,
              maxPlayers: 2,
              members: [hostMember, guestMember],
              players: [hostMember, guestMember],
              gameSessionId: null,
              createdAt: now,
              updatedAt: now,
              expiresAt: now + this.roomTtlMs,
            };

            const activeRoom: ActiveRoom = {
              state: roomState,
              simulation: null,
              tickInterval: null,
              disconnectTimers: new Map(),
            };
            this.transitionRoomStatus(activeRoom, 'WAITING', false);
            this.transitionRoomStatus(activeRoom, 'READY', false);

            this.rooms.set(roomCode, activeRoom);
            this.socketToRoom.set(partner.socketId, roomCode);
            this.socketToRoom.set(socket.id, roomCode);
            partnerSocket.join(roomCode);
            socket.join(roomCode);

            const snapshot = this.syncDerivedFields(activeRoom);
            this.io.to(roomCode).emit('matchmaking:found', snapshot);
            this.broadcastRoomState(roomCode);
            cb?.({ ok: true, matched: true, room: snapshot });
            return;
          }
        }

        this.matchmakingQueue.push({
          socketId: socket.id,
          playerId: cleanPlayerId,
          name: cleanName,
          joinedAt: Date.now(),
        });
        cb?.({ ok: true, matched: false, queueSize: this.matchmakingQueue.length });
      }
    );

    socket.on('matchmaking:cancel', () => {
      this.removeFromQueue(socket.id);
    });

    socket.on('room:proceed_character_select', () => {
      const room = this.getRoomBySocket(socket.id);
      if (!room) return;
      if (room.state.hostSocketId !== socket.id) return;
      if (room.state.roomStatus === 'IN_GAME' || room.state.roomStatus === 'CLOSED') return;
      room.state.phase = 'character_select';
      this.broadcastRoomState(room.state.roomCode);
    });

    socket.on('room:select_role', (payload: { role: PlayerRole }, cb) => {
      const room = this.getRoomBySocket(socket.id);
      if (!room) {
        cb?.({ ok: false, error: 'Kamu tidak berada di dalam room.' });
        return;
      }
      if (room.state.roomStatus === 'IN_GAME' || room.state.roomStatus === 'STARTING') {
        cb?.({ ok: false, error: 'Tidak dapat mengganti peran saat game berlangsung.' });
        return;
      }
      const member = room.state.members.find((m) => m.socketId === socket.id);
      if (!member) {
        cb?.({ ok: false, error: 'Pemain tidak ditemukan di room.' });
        return;
      }
      const desired = payload?.role;
      if (desired !== 'chef' && desired !== 'waiter') {
        cb?.({ ok: false, error: 'Peran tidak valid.' });
        return;
      }

      const other = room.state.members.find((m) => m.socketId !== socket.id);
      if (other && other.role === desired) {
        // Swap roles cleanly while preventing role conflicts
        other.role = member.role === 'chef' ? 'waiter' : 'chef';
        member.role = desired;
      } else {
        member.role = desired;
      }

      this.recomputeLobbyRoomStatus(room);
      const snapshot = this.syncDerivedFields(room);
      this.broadcastRoomState(room.state.roomCode);
      cb?.({ ok: true, room: snapshot });
    });

    socket.on('room:toggle_ready', (cb?: (res: { ok: boolean; ready?: boolean; room?: RoomState; error?: string }) => void) => {
      const room = this.getRoomBySocket(socket.id);
      if (!room) {
        if (typeof cb === 'function') cb({ ok: false, error: 'Room tidak ditemukan.' });
        return;
      }
      if (room.state.roomStatus !== 'WAITING' && room.state.roomStatus !== 'READY') {
        if (typeof cb === 'function') cb({ ok: false, error: 'Status siap tidak dapat diubah saat ini.' });
        return;
      }
      const member = room.state.members.find((m) => m.socketId === socket.id);
      if (!member || !member.role) {
        if (typeof cb === 'function') cb({ ok: false, error: 'Pemain tidak valid.' });
        return;
      }

      member.ready = !member.ready;
      room.state.expiresAt = Date.now() + this.roomTtlMs;
      this.recomputeLobbyRoomStatus(room);
      const snapshot = this.syncDerivedFields(room);

      const readyPayload: RoomReadyChangedPayload = {
        roomId: snapshot.roomId,
        roomCode: snapshot.roomCode,
        playerId: member.playerId,
        ready: member.ready,
        room: snapshot,
      };
      this.io.to(snapshot.roomCode).emit('room:ready_changed', readyPayload);
      this.broadcastRoomState(snapshot.roomCode);

      if (typeof cb === 'function') {
        cb({ ok: true, ready: member.ready, room: snapshot });
      }
    });

    socket.on('room:start_game', (cb) => {
      const room = this.getRoomBySocket(socket.id);
      if (!room) {
        cb?.({ ok: false, errorCode: 'ROOM_NOT_FOUND', error: 'Room tidak ditemukan.' });
        return;
      }
      const caller = room.state.members.find((m) => m.socketId === socket.id);
      if (!caller || room.state.hostSocketId !== socket.id || !caller.isHost) {
        cb?.({
          ok: false,
          errorCode: 'UNAUTHORIZED',
          error: 'Hanya Host yang dapat memulai permainan.',
        });
        return;
      }

      if (room.state.roomStatus === 'IN_GAME' || room.state.roomStatus === 'STARTING') {
        cb?.({
          ok: false,
          errorCode: 'ALREADY_STARTED',
          error: 'Game sudah dimulai.',
        });
        return;
      }

      if (room.state.mode === 'coop') {
        if (room.state.members.length < 2) {
          cb?.({
            ok: false,
            errorCode: 'NOT_ENOUGH_PLAYERS',
            error: 'Menunggu Pemain 2 bergabung sebelum memulai game.',
          });
          return;
        }
        if (!room.state.members.every((m) => m.connected)) {
          cb?.({
            ok: false,
            errorCode: 'PLAYER_DISCONNECTED',
            error: 'Partner sedang terputus. Tunggu hingga tersambung kembali.',
          });
          return;
        }
        const chef = room.state.members.find((m) => m.role === 'chef');
        const waiter = room.state.members.find((m) => m.role === 'waiter');
        if (!chef || !waiter || chef.playerId === waiter.playerId) {
          cb?.({
            ok: false,
            errorCode: 'INVALID_ROLES',
            error: 'Harus ada 1 Chef dan 1 Waiter yang berbeda.',
          });
          return;
        }
        if (!room.state.members.every((m) => m.ready)) {
          cb?.({
            ok: false,
            errorCode: 'NOT_READY',
            error: 'Kedua pemain harus berstatus Siap sebelum memulai game.',
          });
          return;
        }
        if (room.state.roomStatus !== 'READY') {
          cb?.({
            ok: false,
            errorCode: 'INVALID_STATE',
            error: 'Status room belum siap untuk memulai permainan.',
          });
          return;
        }

        if (!this.transitionRoomStatus(room, 'STARTING')) {
          cb?.({
            ok: false,
            errorCode: 'INVALID_TRANSITION',
            error: 'Transisi status room tidak valid.',
          });
          return;
        }

        this.launchSimulation(room, chef, waiter);
        cb?.({
          ok: true,
          gameSessionId: room.state.gameSessionId,
          room: this.syncDerivedFields(room),
        });
      } else {
        const solo = room.state.members[0];
        if (!solo) return;
        const chefInfo = {
          socketId: solo.socketId,
          name: solo.role === 'chef' ? solo.name : `${solo.name} (Chef)`,
        };
        const waiterInfo = {
          socketId: solo.socketId,
          name: solo.role === 'waiter' ? solo.name : `${solo.name} (Waiter)`,
        };
        this.transitionRoomStatus(room, 'READY', false);
        this.transitionRoomStatus(room, 'STARTING');
        this.launchSimulation(room, chefInfo, waiterInfo);
        cb?.({
          ok: true,
          gameSessionId: room.state.gameSessionId,
          room: this.syncDerivedFields(room),
        });
      }
    });

    socket.on(
      'game:move',
      (payload: {
        role: PlayerRole;
        col: number;
        row: number;
        facing: FacingDirection;
        isMoving: boolean;
        isRunning?: boolean;
      }) => {
        const room = this.getRoomBySocket(socket.id);
        if (!room?.simulation) return;
        const member = room.state.members.find((m) => m.socketId === socket.id);
        if (!member) return;
        const allowedRole = room.state.mode === 'practice' ? payload.role : member.role;
        if (!allowedRole || allowedRole !== payload.role) return;

        const validFacing: FacingDirection =
          payload.facing === 'front' ||
          payload.facing === 'back' ||
          payload.facing === 'left' ||
          payload.facing === 'right'
            ? payload.facing
            : 'front';

        room.simulation.updatePlayerPosition(
          allowedRole,
          payload.col,
          payload.row,
          validFacing,
          Boolean(payload.isMoving),
          Boolean(payload.isRunning)
        );
      }
    );

    socket.on('game:interact', (payload: { role: PlayerRole; targetId?: string }, cb) => {
      const room = this.getRoomBySocket(socket.id);
      if (!room?.simulation) {
        cb?.({ ok: false });
        return;
      }
      const member = room.state.members.find((m) => m.socketId === socket.id);
      if (!member) return;
      const allowedRole = room.state.mode === 'practice' ? payload.role : member.role;
      if (!allowedRole || allowedRole !== payload.role) {
        cb?.({ ok: false });
        return;
      }
      const result = room.simulation.interact(allowedRole, payload.targetId);
      cb?.(result);
    });

    socket.on(
      'game:emote',
      (payload: { role: PlayerRole; text: string; anim?: CharacterAnimState }) => {
        const room = this.getRoomBySocket(socket.id);
        if (!room?.simulation) return;
        const member = room.state.members.find((m) => m.socketId === socket.id);
        if (!member) return;
        const allowedRole = room.state.mode === 'practice' ? payload.role : member.role;
        if (!allowedRole) return;
        room.simulation.triggerEmote(allowedRole, String(payload.text ?? ''), payload.anim);
      }
    );

    // Phase 06: Authoritative Order Confirmation (Waiter or Solo Practice)
    socket.on(
      'order:confirm',
      (
        payload: {
          tableId: string;
          items: OrderDraftSubmissionItem[];
          notes?: string;
          priority?: OrderPriority;
        },
        cb
      ) => {
        const room = this.getRoomBySocket(socket.id);
        if (!room?.simulation) {
          cb?.({ ok: false, errors: ['Game belum aktif.'] });
          return;
        }
        const member = room.state.members.find((m) => m.socketId === socket.id);
        if (!member) {
          cb?.({ ok: false, errors: ['Player tidak ditemukan di room.'] });
          return;
        }
        if (room.state.mode === 'coop' && member.role !== 'waiter') {
          cb?.({ ok: false, errors: ['Hanya Waiter yang dapat mengambil pesanan meja.'] });
          return;
        }

        const result = room.simulation.confirmTableOrder(
          String(payload?.tableId ?? ''),
          member.socketId,
          Array.isArray(payload?.items) ? payload.items : [],
          String(payload?.notes ?? ''),
          payload?.priority === 'URGENT' ? 'URGENT' : 'NORMAL'
        );
        if (result.ok) {
          this.io.to(room.state.roomCode).emit('game:state', room.simulation.getSnapshot());
        }
        cb?.(result);
      }
    );

    // Phase 06: Authoritative Chef Order Acceptance (Chef or Solo Practice)
    socket.on('order:accept', (payload: { orderId: string }, cb) => {
      const room = this.getRoomBySocket(socket.id);
      if (!room?.simulation) {
        cb?.({ ok: false, error: 'Game belum aktif.' });
        return;
      }
      const member = room.state.members.find((m) => m.socketId === socket.id);
      if (!member) {
        cb?.({ ok: false, error: 'Player tidak ditemukan di room.' });
        return;
      }
      if (room.state.mode === 'coop' && member.role !== 'chef') {
        cb?.({ ok: false, error: 'Hanya Chef yang dapat menerima pesanan di dapur.' });
        return;
      }

      const result = room.simulation.acceptKitchenOrder(
        String(payload?.orderId ?? ''),
        member.socketId
      );
      if (result.ok) {
        this.io.to(room.state.roomCode).emit('game:state', room.simulation.getSnapshot());
      }
      cb?.(result);
    });

    // Phase 06: Authoritative Order Cancellation
    socket.on('order:cancel', (payload: { orderId: string; reason?: string }, cb) => {
      const room = this.getRoomBySocket(socket.id);
      if (!room?.simulation) {
        cb?.({ ok: false, error: 'Game belum aktif.' });
        return;
      }
      const member = room.state.members.find((m) => m.socketId === socket.id);
      if (!member) {
        cb?.({ ok: false, error: 'Player tidak ditemukan di room.' });
        return;
      }

      const result = room.simulation.cancelKitchenOrder(
        String(payload?.orderId ?? ''),
        String(payload?.reason ?? 'cancelled_by_staff')
      );
      if (result.ok) {
        this.io.to(room.state.roomCode).emit('game:state', room.simulation.getSnapshot());
      }
      cb?.(result);
    });

    socket.on('game:pause', (payload: { paused: boolean }) => {
      const room = this.getRoomBySocket(socket.id);
      if (!room?.simulation) return;
      const member = room.state.members.find((m) => m.socketId === socket.id);
      if (!member) return;
      room.simulation.setPaused(Boolean(payload.paused), member.name);
      room.state.phase = room.simulation.getPhase();
      this.io.to(room.state.roomCode).emit('game:state', room.simulation.getSnapshot());
    });

    socket.on('game:rematch', () => {
      const room = this.getRoomBySocket(socket.id);
      if (!room) return;
      if (room.tickInterval) {
        clearInterval(room.tickInterval);
        room.tickInterval = null;
      }
      room.simulation = null;
      room.state.gameSessionId = null;
      room.state.phase = 'lobby';
      room.state.members.forEach((m) => {
        m.ready = true;
      });
      this.recomputeLobbyRoomStatus(room);
      const snapshot = this.syncDerivedFields(room);
      this.broadcastRoomState(snapshot.roomCode);
      this.io.to(snapshot.roomCode).emit('room:rematch_ready', snapshot);
    });

    socket.on('room:leave', (cb?: (res: { ok: boolean }) => void) => {
      this.leaveCurrentRoom(socket, true);
      if (typeof cb === 'function') cb({ ok: true });
    });

    socket.on('disconnect', () => {
      this.removeFromQueue(socket.id);
      this.handleSocketDisconnect(socket);
    });
  }

  private handleMemberReconnect(
    socket: Socket,
    room: ActiveRoom,
    member: RoomMember
  ): RoomState {
    const existingTimer = room.disconnectTimers.get(member.playerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      room.disconnectTimers.delete(member.playerId);
    }

    // Rebind socket mapping cleanly
    this.socketToRoom.delete(member.socketId);
    member.socketId = socket.id;
    member.connected = true;
    member.disconnectedAt = null;
    if (member.isHost) {
      room.state.hostSocketId = socket.id;
    }

    this.socketToRoom.set(socket.id, room.state.roomCode);
    socket.join(room.state.roomCode);
    room.state.expiresAt = Date.now() + this.roomTtlMs;

    if (room.state.roomStatus === 'WAITING' || room.state.roomStatus === 'READY') {
      this.recomputeLobbyRoomStatus(room);
    } else if (room.state.roomStatus === 'IN_GAME' && room.simulation) {
      room.simulation.setPaused(false, member.name);
      this.io.to(room.state.roomCode).emit('game:state', room.simulation.getSnapshot());
    }

    const snapshot = this.syncDerivedFields(room);
    const payload: RoomPlayerEventPayload = {
      roomId: snapshot.roomId,
      roomCode: snapshot.roomCode,
      player: { ...member },
      room: snapshot,
    };
    this.io.to(snapshot.roomCode).emit('room:player_reconnected', payload);
    this.broadcastRoomState(snapshot.roomCode);
    return snapshot;
  }

  private handleSocketDisconnect(socket: Socket): void {
    const code = this.socketToRoom.get(socket.id);
    if (!code) return;
    this.socketToRoom.delete(socket.id);

    const room = this.rooms.get(code);
    if (!room) return;

    const member = room.state.members.find((m) => m.socketId === socket.id);
    if (!member) return;

    member.connected = false;
    member.disconnectedAt = Date.now();

    if (room.state.roomStatus === 'READY') {
      this.transitionRoomStatus(room, 'WAITING');
    }

    if (room.state.roomStatus === 'IN_GAME' && room.state.mode === 'coop') {
      room.simulation?.setPaused(true, 'Partner disconnected');
      this.io.to(code).emit('room:partner_left', {
        message: 'Partner terputus dari room. Menunggu penyambungan ulang...',
      });
    }

    const snapshot = this.syncDerivedFields(room);
    const payload: RoomPlayerEventPayload = {
      roomId: snapshot.roomId,
      roomCode: snapshot.roomCode,
      player: { ...member },
      room: snapshot,
    };
    this.io.to(code).emit('room:player_disconnected', payload);
    this.broadcastRoomState(code);

    // Grace period for mobile network drops before permanently removing player
    const prevTimer = room.disconnectTimers.get(member.playerId);
    if (prevTimer) clearTimeout(prevTimer);

    const timer = setTimeout(() => {
      room.disconnectTimers.delete(member.playerId);
      this.finalizeMemberRemoval(code, member.playerId);
    }, this.disconnectGraceMs);
    timer.unref?.();
    room.disconnectTimers.set(member.playerId, timer);
  }

  private leaveCurrentRoom(socket: Socket, explicit: boolean): void {
    const code = this.socketToRoom.get(socket.id);
    if (!code) return;
    this.socketToRoom.delete(socket.id);
    socket.leave(code);

    const room = this.rooms.get(code);
    if (!room) return;

    const member = room.state.members.find((m) => m.socketId === socket.id);
    if (!member) return;

    const timer = room.disconnectTimers.get(member.playerId);
    if (timer) {
      clearTimeout(timer);
      room.disconnectTimers.delete(member.playerId);
    }

    if (explicit) {
      this.finalizeMemberRemoval(code, member.playerId);
    }
  }

  private finalizeMemberRemoval(code: string, playerId: string): void {
    const room = this.rooms.get(code);
    if (!room) return;

    const leavingMember = room.state.members.find((m) => m.playerId === playerId);
    if (!leavingMember) return;

    // If the player already reconnected before the timer fired, abort removal
    if (leavingMember.connected && this.socketToRoom.get(leavingMember.socketId) === code) {
      return;
    }

    room.state.members = room.state.members.filter((m) => m.playerId !== playerId);

    // Clean up empty room immediately
    if (room.state.members.length === 0) {
      this.closeRoom(code, 'Semua pemain telah meninggalkan room.');
      return;
    }

    // Reassign host & normalize slot 1 / Chef if the Host left
    const previousHostId = room.state.hostId;
    if (room.state.hostId === leavingMember.playerId) {
      const nextHost = room.state.members[0];
      nextHost.isHost = true;
      nextHost.slot = 1;
      if (room.state.roomStatus !== 'IN_GAME') {
        nextHost.role = 'chef';
      }
      room.state.hostId = nextHost.playerId;
      room.state.hostName = nextHost.name;
      room.state.hostSocketId = nextHost.socketId;

      const snapshotAfterHost = this.syncDerivedFields(room);
      const hostChangedPayload: RoomHostChangedPayload = {
        roomId: snapshotAfterHost.roomId,
        roomCode: snapshotAfterHost.roomCode,
        previousHostId,
        newHostId: nextHost.playerId,
        newHostName: nextHost.name,
        room: snapshotAfterHost,
      };
      this.io.to(code).emit('room:host_changed', hostChangedPayload);
    } else {
      // Ensure remaining host retains slot 1
      room.state.members[0].slot = 1;
    }

    if (room.state.roomStatus === 'IN_GAME' && room.state.mode === 'coop') {
      room.simulation?.setPaused(true, 'Partner left');
      this.io.to(code).emit('room:partner_left', {
        message: 'Partner keluar dari room. Kamu bisa kembali ke Lobby.',
      });
    } else {
      this.recomputeLobbyRoomStatus(room);
    }

    const snapshot = this.syncDerivedFields(room);
    const leftPayload: RoomPlayerEventPayload = {
      roomId: snapshot.roomId,
      roomCode: snapshot.roomCode,
      player: { ...leavingMember, connected: false },
      room: snapshot,
    };
    this.io.to(code).emit('room:player_left', leftPayload);
    this.broadcastRoomState(code);
  }

  private closeRoom(code: string, reason: string): void {
    const room = this.rooms.get(code);
    if (!room) return;

    if (room.tickInterval) {
      clearInterval(room.tickInterval);
      room.tickInterval = null;
    }
    for (const timer of room.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    room.disconnectTimers.clear();

    this.transitionRoomStatus(room, 'CLOSED', false);
    const closedPayload: RoomClosedPayload = {
      roomId: room.state.roomId,
      roomCode: room.state.roomCode,
      reason,
    };
    this.io.to(code).emit('room:closed', closedPayload);

    for (const member of room.state.members) {
      if (this.socketToRoom.get(member.socketId) === code) {
        this.socketToRoom.delete(member.socketId);
      }
      const s = this.io.sockets.sockets.get(member.socketId);
      s?.leave(code);
    }

    this.rooms.delete(code);
  }

  private launchSimulation(
    room: ActiveRoom,
    chef: { socketId: string; name: string },
    waiter: { socketId: string; name: string }
  ): void {
    if (room.tickInterval) clearInterval(room.tickInterval);

    const gameSessionId = `sess_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
    room.state.gameSessionId = gameSessionId;
    room.state.phase = 'playing';
    this.transitionRoomStatus(room, 'IN_GAME');

    room.simulation = new GameSimulation(
      room.state.roomCode,
      room.state.mode,
      chef,
      waiter,
      () => {
        room.state.phase = 'finished';
        if (room.tickInterval) {
          clearInterval(room.tickInterval);
          room.tickInterval = null;
        }
        // Emit personalized MatchSummary to each player with their role
        for (const member of room.state.members) {
          const summary = room.simulation!.buildSummary(member.role ?? 'chef');
          this.io.to(member.socketId).emit('game:finished', summary);
        }
      }
    );

    const initialSnapshot = room.simulation.getSnapshot();
    this.broadcastRoomState(room.state.roomCode);
    this.io.to(room.state.roomCode).emit('game:started', initialSnapshot);

    // 12.5 Hz authoritative server tick (80ms) — smooth & mobile-bandwidth friendly
    room.tickInterval = setInterval(() => {
      if (!room.simulation) return;
      const snap = room.simulation.tick();
      this.io.to(room.state.roomCode).emit('game:state', snap);
    }, 80);
  }

  private recomputeLobbyRoomStatus(room: ActiveRoom): void {
    if (room.state.roomStatus === 'IN_GAME' || room.state.roomStatus === 'CLOSED') return;

    const isReadyToStart =
      room.state.mode === 'coop' &&
      room.state.members.length === room.state.maxPlayers &&
      room.state.members.every((m) => m.connected && m.ready) &&
      Boolean(room.state.members.find((m) => m.role === 'chef')) &&
      Boolean(room.state.members.find((m) => m.role === 'waiter'));

    const desired: RoomStatus = isReadyToStart ? 'READY' : 'WAITING';
    this.transitionRoomStatus(room, desired);
  }

  private transitionRoomStatus(
    room: ActiveRoom,
    nextStatus: RoomStatus,
    emitEvent = true
  ): boolean {
    const previousStatus = room.state.roomStatus;
    if (previousStatus === nextStatus) return true;
    if (!canTransitionRoomStatus(previousStatus, nextStatus)) {
      return false;
    }

    room.state.roomStatus = nextStatus;
    room.state.updatedAt = Date.now();
    const snapshot = this.syncDerivedFields(room);

    if (emitEvent) {
      const payload: RoomStateChangedPayload = {
        roomId: snapshot.roomId,
        roomCode: snapshot.roomCode,
        previousStatus,
        roomStatus: nextStatus,
        room: snapshot,
      };
      this.io.to(snapshot.roomCode).emit('room:state_changed', payload);
    }

    return true;
  }

  private syncDerivedFields(room: ActiveRoom): RoomState {
    const now = Date.now();
    room.state.code = room.state.roomCode;
    room.state.gameMode = room.state.mode;
    room.state.playerCount = room.state.members.length;
    room.state.players = room.state.members.map((m) => ({ ...m }));
    room.state.updatedAt = now;
    return {
      ...room.state,
      members: room.state.members.map((m) => ({ ...m })),
      players: room.state.members.map((m) => ({ ...m })),
    };
  }

  private isRoomExpired(room: ActiveRoom, now = Date.now()): boolean {
    if (room.state.roomStatus === 'IN_GAME') return false;
    return now > room.state.expiresAt;
  }

  private removeFromQueue(socketId: string): void {
    this.matchmakingQueue = this.matchmakingQueue.filter((e) => e.socketId !== socketId);
  }

  private getRoomBySocket(socketId: string): ActiveRoom | null {
    const code = this.socketToRoom.get(socketId);
    if (!code) return null;
    return this.rooms.get(code) ?? null;
  }

  private broadcastRoomState(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    const snapshot = this.syncDerivedFields(room);
    this.io.to(code).emit('room:updated', snapshot);
  }

  private generateUniqueRoomCode(): string {
    let code = '';
    do {
      code = generateFormattedRoomCode();
    } while (this.rooms.has(code));
    return code;
  }

  private sanitizeName(raw?: string): string {
    const cleaned = String(raw ?? '')
      .replace(/[^a-zA-Z0-9 _\-]/g, '')
      .trim()
      .slice(0, 18);
    return cleaned || `Player${Math.floor(100 + Math.random() * 899)}`;
  }

  private sanitizePlayerId(raw: string | undefined, fallbackSocketId: string): string {
    const cleaned = String(raw ?? '')
      .replace(/[^a-zA-Z0-9_\-]/g, '')
      .trim()
      .slice(0, 48);
    return cleaned || `pid_${fallbackSocketId}`;
  }

  private sanitizeMap(raw?: string): string {
    const cleaned = String(raw ?? '')
      .replace(/[^a-zA-Z0-9_\-]/g, '')
      .trim()
      .slice(0, 32);
    return cleaned || DEFAULT_SELECTED_MAP;
  }
}
