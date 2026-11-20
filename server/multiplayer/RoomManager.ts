import type { Server, Socket } from 'socket.io';
import type {
  CharacterAnimState,
  FacingDirection,
  OrderDraftSubmissionItem,
  OrderPriority,
  PlayerRole,
  RoomMember,
  RoomState,
} from '../../src/shared/types.ts';
import { GameSimulation } from './GameSimulation.ts';

interface ActiveRoom {
  state: RoomState;
  simulation: GameSimulation | null;
  tickInterval: ReturnType<typeof setInterval> | null;
}

interface MatchmakingEntry {
  socketId: string;
  name: string;
  joinedAt: number;
}

export class RoomManager {
  private io: Server;
  private rooms = new Map<string, ActiveRoom>();
  private socketToRoom = new Map<string, string>();
  private matchmakingQueue: MatchmakingEntry[] = [];

  constructor(io: Server) {
    this.io = io;
  }

  public getStats() {
    return {
      activeRooms: this.rooms.size,
      playersInQueue: this.matchmakingQueue.length,
    };
  }

  public registerSocket(socket: Socket): void {
    socket.on('room:create', (payload: { playerName?: string; mode?: 'coop' | 'practice' }, cb) => {
      try {
        this.leaveCurrentRoom(socket);
        const cleanName = this.sanitizeName(payload?.playerName);
        const mode = payload?.mode === 'practice' ? 'practice' : 'coop';
        const code = this.generateRoomCode();

        const member: RoomMember = {
          socketId: socket.id,
          name: cleanName,
          role: 'chef',
          ready: mode === 'practice',
          isHost: true,
        };

        const roomState: RoomState = {
          code,
          mode,
          phase: mode === 'practice' ? 'character_select' : 'lobby',
          members: [member],
          hostSocketId: socket.id,
          maxPlayers: mode === 'practice' ? 1 : 2,
          createdAt: Date.now(),
        };

        this.rooms.set(code, {
          state: roomState,
          simulation: null,
          tickInterval: null,
        });
        this.socketToRoom.set(socket.id, code);
        socket.join(code);

        this.broadcastRoomState(code);
        cb?.({ ok: true, room: roomState });
      } catch (err) {
        cb?.({ ok: false, error: 'Failed to create room.' });
      }
    });

    socket.on('room:join', (payload: { code?: string; playerName?: string }, cb) => {
      try {
        const rawCode = String(payload?.code ?? '').trim().toUpperCase();
        const room = this.rooms.get(rawCode);
        if (!room) {
          cb?.({ ok: false, error: `Room "${rawCode}" tidak ditemukan.` });
          return;
        }
        if (room.state.mode === 'practice') {
          cb?.({ ok: false, error: 'Room ini sedang dalam mode Solo Practice.' });
          return;
        }
        if (room.state.members.length >= room.state.maxPlayers) {
          cb?.({ ok: false, error: 'Room sudah penuh (2/2 pemain).' });
          return;
        }
        if (room.state.phase === 'playing') {
          cb?.({ ok: false, error: 'Pertandingan sudah dimulai.' });
          return;
        }

        this.leaveCurrentRoom(socket);
        const cleanName = this.sanitizeName(payload?.playerName);
        const takenRole = room.state.members[0]?.role;
        const assignedRole: PlayerRole = takenRole === 'chef' ? 'waiter' : 'chef';

        room.state.members.push({
          socketId: socket.id,
          name: cleanName,
          role: assignedRole,
          ready: false,
          isHost: false,
        });

        this.socketToRoom.set(socket.id, rawCode);
        socket.join(rawCode);

        this.broadcastRoomState(rawCode);
        cb?.({ ok: true, room: room.state });
      } catch (err) {
        cb?.({ ok: false, error: 'Gagal bergabung ke room.' });
      }
    });

    socket.on('matchmaking:join', (payload: { playerName?: string }, cb) => {
      this.leaveCurrentRoom(socket);
      this.removeFromQueue(socket.id);

      const cleanName = this.sanitizeName(payload?.playerName);
      if (this.matchmakingQueue.length > 0) {
        const partner = this.matchmakingQueue.shift()!;
        const partnerSocket = this.io.sockets.sockets.get(partner.socketId);
        if (partnerSocket && partnerSocket.connected) {
          const code = this.generateRoomCode();
          const roomState: RoomState = {
            code,
            mode: 'coop',
            phase: 'character_select',
            members: [
              {
                socketId: partner.socketId,
                name: partner.name,
                role: 'chef',
                ready: false,
                isHost: true,
              },
              {
                socketId: socket.id,
                name: cleanName,
                role: 'waiter',
                ready: false,
                isHost: false,
              },
            ],
            hostSocketId: partner.socketId,
            maxPlayers: 2,
            createdAt: Date.now(),
          };
          this.rooms.set(code, { state: roomState, simulation: null, tickInterval: null });
          this.socketToRoom.set(partner.socketId, code);
          this.socketToRoom.set(socket.id, code);
          partnerSocket.join(code);
          socket.join(code);

          this.io.to(code).emit('matchmaking:found', roomState);
          this.broadcastRoomState(code);
          cb?.({ ok: true, matched: true, room: roomState });
          return;
        }
      }

      this.matchmakingQueue.push({
        socketId: socket.id,
        name: cleanName,
        joinedAt: Date.now(),
      });
      cb?.({ ok: true, matched: false, queueSize: this.matchmakingQueue.length });
    });

    socket.on('matchmaking:cancel', () => {
      this.removeFromQueue(socket.id);
    });

    socket.on('room:proceed_character_select', () => {
      const room = this.getRoomBySocket(socket.id);
      if (!room) return;
      if (room.state.hostSocketId !== socket.id) return;
      room.state.phase = 'character_select';
      this.broadcastRoomState(room.state.code);
    });

    socket.on('room:select_role', (payload: { role: PlayerRole }, cb) => {
      const room = this.getRoomBySocket(socket.id);
      if (!room) {
        cb?.({ ok: false, error: 'Not in a room.' });
        return;
      }
      const member = room.state.members.find((m) => m.socketId === socket.id);
      if (!member) return;
      const desired = payload?.role;
      if (desired !== 'chef' && desired !== 'waiter') return;

      const other = room.state.members.find((m) => m.socketId !== socket.id);
      if (other && other.role === desired) {
        // Swap roles cleanly if partner is not locked ready
        if (!other.ready) {
          other.role = member.role === 'chef' ? 'waiter' : 'chef';
          member.role = desired;
        } else {
          cb?.({ ok: false, error: 'Peran tersebut sudah dipilih dan Ready oleh partner.' });
          return;
        }
      } else {
        member.role = desired;
      }
      member.ready = false;
      this.broadcastRoomState(room.state.code);
      cb?.({ ok: true });
    });

    socket.on('room:toggle_ready', () => {
      const room = this.getRoomBySocket(socket.id);
      if (!room) return;
      const member = room.state.members.find((m) => m.socketId === socket.id);
      if (!member || !member.role) return;
      member.ready = !member.ready;
      this.broadcastRoomState(room.state.code);
    });

    socket.on('room:start_game', (cb) => {
      const room = this.getRoomBySocket(socket.id);
      if (!room) {
        cb?.({ ok: false, error: 'Room tidak ditemukan.' });
        return;
      }
      if (room.state.hostSocketId !== socket.id) {
        cb?.({ ok: false, error: 'Hanya Host yang dapat memulai shift.' });
        return;
      }

      if (room.state.mode === 'coop') {
        if (room.state.members.length < 2) {
          cb?.({ ok: false, error: 'Butuh 2 pemain (Chef & Waiter) untuk mode Co-Op.' });
          return;
        }
        const chef = room.state.members.find((m) => m.role === 'chef');
        const waiter = room.state.members.find((m) => m.role === 'waiter');
        if (!chef || !waiter) {
          cb?.({ ok: false, error: 'Harus ada 1 Chef dan 1 Waiter.' });
          return;
        }
        if (!room.state.members.every((m) => m.ready)) {
          cb?.({ ok: false, error: 'Kedua pemain harus menekan tombol READY.' });
          return;
        }
        this.launchSimulation(room, chef, waiter);
        cb?.({ ok: true });
      } else {
        const solo = room.state.members[0];
        if (!solo) return;
        const chefInfo = { socketId: solo.socketId, name: solo.role === 'chef' ? solo.name : `${solo.name} (Chef)` };
        const waiterInfo = { socketId: solo.socketId, name: solo.role === 'waiter' ? solo.name : `${solo.name} (Waiter)` };
        this.launchSimulation(room, chefInfo, waiterInfo);
        cb?.({ ok: true });
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

    socket.on('game:emote', (payload: { role: PlayerRole; text: string; anim?: CharacterAnimState }) => {
      const room = this.getRoomBySocket(socket.id);
      if (!room?.simulation) return;
      const member = room.state.members.find((m) => m.socketId === socket.id);
      if (!member) return;
      const allowedRole = room.state.mode === 'practice' ? payload.role : member.role;
      if (!allowedRole) return;
      room.simulation.triggerEmote(allowedRole, String(payload.text ?? ''), payload.anim);
    });

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
          this.io.to(room.state.code).emit('game:state', room.simulation.getSnapshot());
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
        this.io.to(room.state.code).emit('game:state', room.simulation.getSnapshot());
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
        this.io.to(room.state.code).emit('game:state', room.simulation.getSnapshot());
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
      this.io.to(room.state.code).emit('game:state', room.simulation.getSnapshot());
    });

    socket.on('game:rematch', () => {
      const room = this.getRoomBySocket(socket.id);
      if (!room) return;
      if (room.tickInterval) {
        clearInterval(room.tickInterval);
        room.tickInterval = null;
      }
      room.simulation = null;
      room.state.phase = 'character_select';
      room.state.members.forEach((m) => {
        m.ready = room.state.mode === 'practice';
      });
      this.broadcastRoomState(room.state.code);
      this.io.to(room.state.code).emit('room:rematch_ready', room.state);
    });

    socket.on('room:leave', () => {
      this.leaveCurrentRoom(socket);
    });

    socket.on('disconnect', () => {
      this.removeFromQueue(socket.id);
      this.leaveCurrentRoom(socket);
    });
  }

  private launchSimulation(
    room: ActiveRoom,
    chef: { socketId: string; name: string },
    waiter: { socketId: string; name: string }
  ): void {
    if (room.tickInterval) clearInterval(room.tickInterval);
    room.state.phase = 'playing';

    room.simulation = new GameSimulation(
      room.state.code,
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
    this.broadcastRoomState(room.state.code);
    this.io.to(room.state.code).emit('game:started', initialSnapshot);

    // 12.5 Hz authoritative server tick (80ms) — smooth & mobile-bandwidth friendly
    room.tickInterval = setInterval(() => {
      if (!room.simulation) return;
      const snap = room.simulation.tick();
      this.io.to(room.state.code).emit('game:state', snap);
    }, 80);
  }

  private leaveCurrentRoom(socket: Socket): void {
    const code = this.socketToRoom.get(socket.id);
    if (!code) return;
    this.socketToRoom.delete(socket.id);
    socket.leave(code);

    const room = this.rooms.get(code);
    if (!room) return;

    room.state.members = room.state.members.filter((m) => m.socketId !== socket.id);

    if (room.state.members.length === 0) {
      if (room.tickInterval) clearInterval(room.tickInterval);
      this.rooms.delete(code);
      return;
    }

    // Reassign host if needed
    if (room.state.hostSocketId === socket.id) {
      room.state.hostSocketId = room.state.members[0].socketId;
      room.state.members[0].isHost = true;
    }

    // If partner left mid-game in coop mode, pause and notify remaining player
    if (room.state.phase === 'playing' && room.state.mode === 'coop') {
      room.simulation?.setPaused(true, 'Partner disconnected');
      this.io.to(code).emit('room:partner_left', {
        message: 'Partner terputus dari room. Kamu bisa kembali ke Lobby atau menunggu.',
      });
    }

    this.broadcastRoomState(code);
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
    this.io.to(code).emit('room:updated', room.state);
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
      code = 'LK';
      for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
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
}
