import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';

import { RoomManager, type RoomManagerOptions } from '../server/multiplayer/RoomManager.ts';
import {
  buildInviteMessage,
  canTransitionRoomStatus,
  isValidRoomCode,
  normalizeRoomCode,
} from '../src/shared/roomProtocol.ts';
import type {
  GameSnapshot,
  RoomClosedPayload,
  RoomHostChangedPayload,
  RoomPlayerEventPayload,
  RoomReadyChangedPayload,
  RoomState,
  RoomStateChangedPayload,
} from '../src/shared/types.ts';
import { resolveMenuRoute } from '../src/game/systems/solo/SoloConfig.ts';

interface TestHarness {
  url: string;
  roomManager: RoomManager;
  connectClient: () => Promise<ClientSocket>;
  close: () => Promise<void>;
}

async function createMultiplayerHarness(
  options: RoomManagerOptions = {}
): Promise<TestHarness> {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    transports: ['polling', 'websocket'],
    cors: { origin: '*' },
  });

  const roomManager = new RoomManager(io, {
    cleanupIntervalMs: 0,
    ...options,
  });

  io.on('connection', (socket) => {
    roomManager.registerSocket(socket);
  });

  app.get('/api/rooms/:code', (req, res) => {
    const info = roomManager.getPublicRoomInfo(req.params.code);
    if (!info.exists) {
      res.status(404).json({ ok: false, exists: false });
      return;
    }
    res.json({ ok: true, ...info });
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = httpServer.address();
  assert.ok(addr && typeof addr === 'object');
  const url = `http://127.0.0.1:${addr.port}`;
  const clients: ClientSocket[] = [];

  const connectClient = (): Promise<ClientSocket> =>
    new Promise((resolve, reject) => {
      const client = ioClient(url, {
        transports: ['polling', 'websocket'],
        reconnection: false,
        timeout: 4000,
      });
      clients.push(client);
      client.once('connect', () => resolve(client));
      client.once('connect_error', (err) => reject(err));
    });

  const close = async () => {
    for (const c of clients) {
      c.disconnect();
    }
    roomManager.destroy();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    if (httpServer.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  };

  return { url, roomManager, connectClient, close };
}

function emitAck<T>(socket: ClientSocket, event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve) => {
    if (payload === undefined) {
      socket.emit(event, (res: T) => resolve(res));
    } else {
      socket.emit(event, payload, (res: T) => resolve(res));
    }
  });
}

function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for socket event "${event}"`));
    }, timeoutMs);
    const onEvent = (data: T) => {
      clearTimeout(timer);
      resolve(data);
    };
    socket.once(event, onEvent);
  });
}

// =============================================================================
// PROTOCOL & STATE MACHINE UNIT TESTS
// =============================================================================
test('Lobby Protocol [0] Room code normalization, validation, invite text, and state machine transitions', () => {
  assert.equal(normalizeRoomCode('lk7k2p'), 'LK-7K2P');
  assert.equal(normalizeRoomCode('LK 7K2P'), 'LK-7K2P');
  assert.equal(normalizeRoomCode('  lk-7k2p  '), 'LK-7K2P');
  assert.equal(
    normalizeRoomCode('Yuk main Love Kitchen bareng! Join room aku dengan kode LK-8F2K.'),
    'LK-8F2K'
  );

  assert.equal(isValidRoomCode('LK-7K2P'), true);
  assert.equal(isValidRoomCode('lk7k2p'), true);
  assert.equal(isValidRoomCode('LK-0000'), false, 'Ambiguous 0 should be rejected');
  assert.equal(isValidRoomCode('LK-IIII'), false, 'Ambiguous I should be rejected');
  assert.equal(isValidRoomCode('BAD'), false);

  assert.equal(
    buildInviteMessage('lk-7k2p'),
    'Yuk main Love Kitchen bareng! Join room aku dengan kode LK-7K2P.'
  );

  // Valid room state transitions
  assert.equal(canTransitionRoomStatus('CREATING', 'WAITING'), true);
  assert.equal(canTransitionRoomStatus('WAITING', 'READY'), true);
  assert.equal(canTransitionRoomStatus('READY', 'STARTING'), true);
  assert.equal(canTransitionRoomStatus('STARTING', 'IN_GAME'), true);
  assert.equal(canTransitionRoomStatus('WAITING', 'CLOSED'), true);

  // Invalid transitions must be rejected
  assert.equal(canTransitionRoomStatus('WAITING', 'IN_GAME'), false);
  assert.equal(canTransitionRoomStatus('CLOSED', 'WAITING'), false);
  assert.equal(canTransitionRoomStatus('CLOSED', 'IN_GAME'), false);
});

// =============================================================================
// TEST A & B & C & D — CREATE, JOIN, CAPACITY, INVALID CODE & DUPLICATE GUARD
// =============================================================================
test('Multiplayer Lobby [A-D] Real create-room, join-room, capacity enforcement, invalid code & duplicate player rejection', async () => {
  const harness = await createMultiplayerHarness();
  try {
    const host = await harness.connectClient();
    const guest = await harness.connectClient();
    const thirdPlayer = await harness.connectClient();

    // TEST A — Create Room
    const createRes = await emitAck<{ ok: boolean; room?: RoomState; error?: string }>(
      host,
      'room:create',
      { playerName: 'Chef Dimas', playerId: 'player_host_1', mode: 'coop' }
    );

    assert.equal(createRes.ok, true);
    assert.ok(createRes.room, 'Server must return real RoomState');
    const created = createRes.room!;
    assert.ok(created.roomId.startsWith('rm_'));
    assert.equal(isValidRoomCode(created.roomCode), true);
    assert.equal(created.code, created.roomCode);
    assert.equal(created.hostId, 'player_host_1');
    assert.equal(created.hostName, 'Chef Dimas');
    assert.equal(created.roomStatus, 'WAITING');
    assert.equal(created.playerCount, 1);
    assert.equal(created.maxPlayers, 2);
    assert.equal(created.gameMode, 'coop');
    assert.equal(created.selectedMap, 'burger_cafe');
    assert.equal(created.gameSessionId, null);
    assert.equal(created.players.length, 1);
    assert.equal(created.players[0].slot, 1);
    assert.equal(created.players[0].isHost, true);
    assert.equal(created.players[0].role, 'chef');
    assert.equal(created.players[0].connected, true);

    // Verify room really exists via REST lookup
    const apiRes = await fetch(`${harness.url}/api/rooms/${created.roomCode}`);
    assert.equal(apiRes.status, 200);
    const apiJson = (await apiRes.json()) as {
      ok: boolean;
      exists: boolean;
      roomStatus: string;
      playerCount: number;
      joinable: boolean;
    };
    assert.equal(apiJson.exists, true);
    assert.equal(apiJson.roomStatus, 'WAITING');
    assert.equal(apiJson.playerCount, 1);
    assert.equal(apiJson.joinable, true);

    // TEST D — Invalid / nonexistent room code
    const invalidRes = await emitAck<{ ok: boolean; error?: string }>(guest, 'room:join', {
      code: 'LK-ZZZZ',
      playerName: 'Waiter Ayu',
      playerId: 'player_guest_2',
    });
    assert.equal(invalidRes.ok, false);
    assert.equal(
      invalidRes.error,
      'Room tidak ditemukan. Periksa kode room dan coba lagi.'
    );

    // Duplicate player attempt by host joining own room must be rejected
    const dupHostRes = await emitAck<{ ok: boolean; errorCode?: string }>(host, 'room:join', {
      code: created.roomCode,
      playerName: 'Chef Dimas',
      playerId: 'player_host_1',
    });
    assert.equal(dupHostRes.ok, false);
    assert.equal(dupHostRes.errorCode, 'DUPLICATE_PLAYER');

    // TEST B — Real Join Room (case-insensitive & without hyphen) + realtime event on Host
    const hostJoinedPromise = waitForEvent<RoomPlayerEventPayload>(host, 'room:player_joined');
    const hostStatePromise = waitForEvent<RoomStateChangedPayload>(host, 'room:state_changed');

    const compactCode = created.roomCode.replace('-', '').toLowerCase();
    const joinRes = await emitAck<{ ok: boolean; room?: RoomState; error?: string }>(
      guest,
      'room:join',
      { code: compactCode, playerName: 'Waiter Ayu', playerId: 'player_guest_2' }
    );

    assert.equal(joinRes.ok, true);
    assert.ok(joinRes.room);
    assert.equal(joinRes.room!.roomCode, created.roomCode);
    assert.equal(joinRes.room!.playerCount, 2);
    assert.equal(joinRes.room!.roomStatus, 'READY');
    assert.equal(joinRes.room!.players[1].slot, 2);
    assert.equal(joinRes.room!.players[1].isHost, false);
    assert.equal(joinRes.room!.players[1].role, 'waiter');

    const [joinedEvent, stateChangedEvent] = await Promise.all([
      hostJoinedPromise,
      hostStatePromise,
    ]);
    assert.equal(joinedEvent.player.name, 'Waiter Ayu');
    assert.equal(joinedEvent.player.role, 'waiter');
    assert.equal(stateChangedEvent.previousStatus, 'WAITING');
    assert.equal(stateChangedEvent.roomStatus, 'READY');

    // TEST C — Room Capacity (3rd player rejected)
    const fullRes = await emitAck<{ ok: boolean; errorCode?: string; error?: string }>(
      thirdPlayer,
      'room:join',
      { code: created.roomCode, playerName: 'Third Player', playerId: 'player_3' }
    );
    assert.equal(fullRes.ok, false);
    assert.equal(fullRes.errorCode, 'ROOM_FULL');
    assert.equal(fullRes.error, 'Room sudah penuh.');
  } finally {
    await harness.close();
  }
});

// =============================================================================
// TEST E & F — READY TOGGLE, HOST AUTHORIZATION, START GAME & JOIN AFTER START
// =============================================================================
test('Multiplayer Lobby [E-F] Realtime ready toggle, host-only Start Game validation, shared game launch & post-start join block', async () => {
  const harness = await createMultiplayerHarness();
  try {
    const host = await harness.connectClient();
    const guest = await harness.connectClient();
    const lateJoiner = await harness.connectClient();

    const createRes = await emitAck<{ ok: boolean; room: RoomState }>(host, 'room:create', {
      playerName: 'Host Chef',
      playerId: 'host_f',
    });
    const code = createRes.room.roomCode;

    // Host cannot start game alone
    const soloStartAttempt = await emitAck<{ ok: boolean; errorCode?: string }>(
      host,
      'room:start_game'
    );
    assert.equal(soloStartAttempt.ok, false);
    assert.equal(soloStartAttempt.errorCode, 'NOT_ENOUGH_PLAYERS');

    // Guest joins
    await emitAck(guest, 'room:join', {
      code,
      playerName: 'Guest Waiter',
      playerId: 'guest_f',
    });

    // Unauthorized Guest start attempt must be rejected
    const guestStartAttempt = await emitAck<{ ok: boolean; errorCode?: string; error?: string }>(
      guest,
      'room:start_game'
    );
    assert.equal(guestStartAttempt.ok, false);
    assert.equal(guestStartAttempt.errorCode, 'UNAUTHORIZED');

    // Guest toggles Ready -> false => roomStatus returns to WAITING & host receives room:ready_changed
    const readyEventPromise = waitForEvent<RoomReadyChangedPayload>(host, 'room:ready_changed');
    const toggleOff = await emitAck<{ ok: boolean; ready: boolean; room: RoomState }>(
      guest,
      'room:toggle_ready'
    );
    assert.equal(toggleOff.ok, true);
    assert.equal(toggleOff.ready, false);
    assert.equal(toggleOff.room.roomStatus, 'WAITING');
    const readyEvt = await readyEventPromise;
    assert.equal(readyEvt.playerId, 'guest_f');
    assert.equal(readyEvt.ready, false);

    // Host cannot start while guest is not ready
    const startNotReady = await emitAck<{ ok: boolean; errorCode?: string }>(
      host,
      'room:start_game'
    );
    assert.equal(startNotReady.ok, false);
    assert.equal(startNotReady.errorCode, 'NOT_READY');

    // Guest toggles Ready -> true => roomStatus returns to READY
    const toggleOn = await emitAck<{ ok: boolean; ready: boolean; room: RoomState }>(
      guest,
      'room:toggle_ready'
    );
    assert.equal(toggleOn.ready, true);
    assert.equal(toggleOn.room.roomStatus, 'READY');

    // Host starts game => BOTH host and guest receive game:started with identical roomCode
    const hostGameStarted = waitForEvent<GameSnapshot>(host, 'game:started');
    const guestGameStarted = waitForEvent<GameSnapshot>(guest, 'game:started');

    const startRes = await emitAck<{ ok: boolean; gameSessionId?: string; room?: RoomState }>(
      host,
      'room:start_game'
    );
    assert.equal(startRes.ok, true);
    assert.ok(startRes.gameSessionId?.startsWith('sess_'));
    assert.equal(startRes.room?.roomStatus, 'IN_GAME');

    const [hostSnap, guestSnap] = await Promise.all([hostGameStarted, guestGameStarted]);
    assert.equal(hostSnap.roomCode, code);
    assert.equal(guestSnap.roomCode, code);
    assert.equal(hostSnap.phase, 'playing');
    assert.equal(guestSnap.players.chef.name, 'Host Chef');
    assert.equal(guestSnap.players.waiter.name, 'Guest Waiter');

    // Joining after game started is rejected with exact Indonesian message
    const joinAfterStart = await emitAck<{ ok: boolean; errorCode?: string; error?: string }>(
      lateJoiner,
      'room:join',
      { code, playerName: 'Late Comer', playerId: 'late_1' }
    );
    assert.equal(joinAfterStart.ok, false);
    assert.equal(joinAfterStart.errorCode, 'GAME_ALREADY_STARTED');
    assert.equal(joinAfterStart.error, 'Game sudah dimulai. Kamu tidak dapat bergabung.');
  } finally {
    await harness.close();
  }
});

// =============================================================================
// TEST G — DISCONNECT, RECONNECT, HOST MIGRATION & ABANDONED ROOM CLEANUP
// =============================================================================
test('Multiplayer Lobby [G] Disconnect grace window, seamless reconnect, explicit leave host transfer & expired room cleanup', async () => {
  const harness = await createMultiplayerHarness({
    disconnectGraceMs: 400,
    roomTtlMs: 2000,
  });
  try {
    const host = await harness.connectClient();
    const guest1 = await harness.connectClient();

    const createRes = await emitAck<{ ok: boolean; room: RoomState }>(host, 'room:create', {
      playerName: 'Host Rani',
      playerId: 'pid_rani',
    });
    const code = createRes.room.roomCode;

    await emitAck(guest1, 'room:join', {
      code,
      playerName: 'Guest Budi',
      playerId: 'pid_budi',
    });

    // 1. Unexpected disconnect -> host receives room:player_disconnected & room reverts to WAITING
    const discPromise = waitForEvent<RoomPlayerEventPayload>(host, 'room:player_disconnected');
    guest1.disconnect();
    const discEvent = await discPromise;
    assert.equal(discEvent.player.playerId, 'pid_budi');
    assert.equal(discEvent.player.connected, false);
    assert.equal(discEvent.room.roomStatus, 'WAITING');

    // 2. Guest reconnects within grace window with same playerId -> restored cleanly!
    const guestReconnectedSocket = await harness.connectClient();
    const reconPromise = waitForEvent<RoomPlayerEventPayload>(host, 'room:player_reconnected');
    const reconRes = await emitAck<{ ok: boolean; room: RoomState }>(
      guestReconnectedSocket,
      'room:reconnect',
      { code, playerId: 'pid_budi' }
    );
    assert.equal(reconRes.ok, true);
    assert.equal(reconRes.room.roomStatus, 'READY');
    const reconEvent = await reconPromise;
    assert.equal(reconEvent.player.connected, true);

    // 3. Explicit Host leave -> Guest promoted to Host (Chef) & receives room:host_changed + room:player_left
    const hostChangedPromise = waitForEvent<RoomHostChangedPayload>(
      guestReconnectedSocket,
      'room:host_changed'
    );
    const leftPromise = waitForEvent<RoomPlayerEventPayload>(
      guestReconnectedSocket,
      'room:player_left'
    );
    await emitAck(host, 'room:leave');

    const [hostChanged, leftEvt] = await Promise.all([hostChangedPromise, leftPromise]);
    assert.equal(hostChanged.newHostId, 'pid_budi');
    assert.equal(leftEvt.player.playerId, 'pid_rani');
    assert.equal(leftEvt.room.playerCount, 1);
    assert.equal(leftEvt.room.players[0].isHost, true);
    assert.equal(leftEvt.room.players[0].role, 'chef');
    assert.equal(leftEvt.room.roomStatus, 'WAITING');

    // 4. Abandoned room expiration cleanup closes room & notifies client
    const closedPromise = waitForEvent<RoomClosedPayload>(guestReconnectedSocket, 'room:closed');
    const cleanedCount = harness.roomManager.cleanupExpiredRooms(Date.now() + 5000);
    assert.equal(cleanedCount, 1);
    const closedEvt = await closedPromise;
    assert.equal(closedEvt.roomCode, code);
    assert.equal(harness.roomManager.getPublicRoomInfo(code).exists, false);
  } finally {
    await harness.close();
  }
});

// =============================================================================
// TEST H — SOLO MODE INDEPENDENCE REGRESSION CHECK
// =============================================================================
test('Multiplayer Lobby [H] Solo Mode remains completely separate from multiplayer lobby', () => {
  const soloRoute = resolveMenuRoute('LATIHAN_SOLO');
  assert.equal(soloRoute.sessionKind, 'solo');
  assert.equal(soloRoute.targetScene, 'RestaurantScene');
  assert.equal(soloRoute.lobbyMode, null);
  assert.equal(soloRoute.requiresMatchmaking, false);
  assert.equal(soloRoute.requiresNetwork, false);
});
