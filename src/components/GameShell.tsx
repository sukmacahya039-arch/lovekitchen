import React, { useCallback, useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { createPhaserConfig } from '../game/config/phaserConfig.ts';
import { audioManager } from '../game/systems/audio/AudioManager.ts';
import { socketService } from '../game/systems/multiplayer/SocketService.ts';
import { gameSessionManager } from '../game/systems/session/GameSessionManager.ts';
import { resolveMenuRoute, SOLO_BALANCE_CONFIG } from '../game/systems/solo/SoloConfig.ts';
import { gameBridge, type BridgeState } from '../game/systems/ui/GameBridge.ts';
import { auth, signInWithGoogle, signOutUser } from '../services/firebase.ts';
import { pwaInstallManager } from '../services/pwaInstallManager.ts';
import {
  fetchTopLeaderboard,
  loadOrCreatePlayerProfile,
  recordMatchResult,
  savePlayerPreferences,
  type LeaderboardRow,
} from '../services/playerDataService.ts';
import type {
  AudioSettings,
  ConnectionStatus,
  PlayerProfileData,
  PlayerRole,
  RoomState,
  SceneKey,
} from '../shared/types.ts';
import { CharacterSelectionOverlay } from './screens/CharacterSelectionOverlay.tsx';
import { HowToPlayModal } from './screens/HowToPlayModal.tsx';
import { LobbyOverlay } from './screens/LobbyOverlay.tsx';
import { MainMenuOverlay } from './screens/MainMenuOverlay.tsx';
import { PauseOverlay } from './screens/PauseOverlay.tsx';
import { PreloadOverlay } from './screens/PreloadOverlay.tsx';
import { RestaurantHUD } from './screens/RestaurantHUD.tsx';
import { ResultOverlay } from './screens/ResultOverlay.tsx';
import { SettingsOverlay } from './screens/SettingsOverlay.tsx';
import { KitchenOrderBoard } from './orders/KitchenOrderBoard.tsx';
import { OrderTakingUI } from './orders/OrderTakingUI.tsx';
import { RecipePanel } from './orders/RecipePanel.tsx';

const LOCAL_NAME_KEY = 'love_kitchen_player_name_v1';

export const GameShell: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  const [bridge, setBridge] = useState<BridgeState>(() => gameBridge.getState());
  const [audio, setAudio] = useState<AudioSettings>(() => audioManager.getSettings());
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PlayerProfileData | null>(null);
  const [playerName, setPlayerName] = useState<string>(() => {
    try {
      return localStorage.getItem(LOCAL_NAME_KEY) || 'Chef Leo';
    } catch {
      return 'Chef Leo';
    }
  });
  const [preferredRole, setPreferredRole] = useState<PlayerRole>('chef');

  const [room, setRoom] = useState<RoomState | null>(null);
  const [mySocketId, setMySocketId] = useState<string | null>(() => socketService.getSocketId());
  const [myPlayerId] = useState<string>(() => socketService.getPlayerId());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    () => socketService.getConnectionSnapshot().status
  );
  const [connectionError, setConnectionError] = useState<string | null>(
    () => socketService.getConnectionSnapshot().error
  );
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [isTogglingReady, setIsTogglingReady] = useState(false);
  const [isSearchingMatch, setIsSearchingMatch] = useState(false);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);

  const userRef = useRef<User | null>(null);
  const profileRef = useRef<PlayerProfileData | null>(null);
  userRef.current = user;
  profileRef.current = profile;

  const switchPhaserScene = useCallback((target: SceneKey) => {
    const game = gameRef.current;
    if (!game) return;
    const manager = game.scene;

    if (target === 'PauseScene') {
      if (!manager.isActive('PauseScene')) {
        manager.start('PauseScene');
      }
      return;
    }

    if (target === 'SettingsScene' && manager.isActive('RestaurantScene')) {
      if (manager.isActive('PauseScene')) manager.stop('PauseScene');
      if (!manager.isActive('SettingsScene')) manager.start('SettingsScene');
      return;
    }

    // Standard full scene transition
    manager.getScenes(true).forEach((s) => {
      if (s.scene.key !== target) {
        manager.stop(s.scene.key);
      }
    });
    if (!manager.isActive(target)) {
      manager.start(target);
    }
  }, []);

  // Mount Phaser 3 engine once
  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const game = new Phaser.Game(createPhaserConfig(containerRef.current));
    gameRef.current = game;
    gameBridge.registerSceneRouter((scene) => switchPhaserScene(scene));

    return () => {
      gameBridge.registerSceneRouter(() => {});
      audioManager.stopMusic();
      game.destroy(true);
      gameRef.current = null;
    };
  }, [switchPhaserScene]);

  // Subscribe to GameBridge, AudioManager & real PWA appinstalled confirmation
  useEffect(() => {
    const unsubBridge = gameBridge.subscribe(setBridge);
    const unsubAudio = audioManager.subscribe(setAudio);
    const unsubInstalled = pwaInstallManager.onInstalled(() => {
      audioManager.playSfx('ready');
      gameBridge.showToast('Love Kitchen berhasil di-install!', 4000);
    });
    return () => {
      unsubBridge();
      unsubAudio();
      unsubInstalled();
    };
  }, []);

  // Connect Firebase Auth + load profile from Firestore
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        void loadOrCreatePlayerProfile(firebaseUser, audioManager.getSettings())
          .then((loaded) => {
            setProfile(loaded);
            setPlayerName(loaded.displayName);
            setPreferredRole(loaded.preferredRole);
            audioManager.updateSettings({
              masterVolume: loaded.masterVolume,
              musicVolume: loaded.musicVolume,
              sfxVolume: loaded.sfxVolume,
              muted: loaded.muted,
            });
          })
          .catch(() => {});
      } else {
        setProfile(null);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to unified GameSessionManager (works identically for Offline Solo & Online Co-Op)
  useEffect(() => {
    const unsubState = gameSessionManager.on('gameState', (snapshot) => {
      if (snapshot.phase === 'paused' && gameBridge.getState().activeScene === 'RestaurantScene') {
        gameBridge.navigateTo('PauseScene');
      } else if (snapshot.phase === 'playing' && gameBridge.getState().activeScene === 'PauseScene') {
        gameRef.current?.scene.stop('PauseScene');
        gameBridge.patch({ activeScene: 'RestaurantScene' });
      }
    });

    const unsubFinished = gameSessionManager.on('gameFinished', (summary) => {
      gameBridge.patch({ lastMatchSummary: summary });
      gameBridge.navigateTo('ResultScene');

      if (userRef.current && profileRef.current) {
        void recordMatchResult(userRef.current, profileRef.current, summary)
          .then((nextProf) => {
            setProfile(nextProf);
            return fetchTopLeaderboard();
          })
          .then((rows) => setLeaderboard(rows))
          .catch(() => {});
      }
    });

    return () => {
      unsubState();
      unsubFinished();
    };
  }, []);

  // Connect real Socket.IO multiplayer client strictly for Online Co-Op lobby/room events
  useEffect(() => {
    socketService.connect();
    const initialConn = socketService.getConnectionSnapshot();
    setMySocketId(initialConn.socketId);
    setConnectionStatus(initialConn.status);
    setConnectionError(initialConn.error);

    const unsubs = [
      socketService.on('connected', (id) => setMySocketId(id)),
      socketService.on('connectionStatusChanged', (snap) => {
        setConnectionStatus(snap.status);
        setConnectionError(snap.error);
        setMySocketId(snap.socketId);
      }),
      socketService.on('roomUpdated', (updatedRoom) => {
        if (gameSessionManager.isSoloSession()) return;
        setRoom(updatedRoom);
        if (
          updatedRoom.phase === 'character_select' &&
          gameBridge.getState().activeScene === 'LobbyScene'
        ) {
          gameBridge.navigateTo('CharacterSelectionScene');
        }
      }),
      socketService.on('playerJoined', (payload) => {
        if (gameSessionManager.isSoloSession()) return;
        setRoom(payload.room);
        if (payload.player.playerId !== socketService.getPlayerId()) {
          audioManager.playSfx('ready');
          const roleLabel = payload.player.role === 'chef' ? 'Chef' : 'Waiter';
          gameBridge.showToast(`${payload.player.name} bergabung sebagai ${roleLabel}!`, 2800);
        }
      }),
      socketService.on('playerLeft', (payload) => {
        if (gameSessionManager.isSoloSession()) return;
        setRoom(payload.room);
        if (payload.player.playerId !== socketService.getPlayerId()) {
          gameBridge.showToast(`${payload.player.name} meninggalkan room.`, 2800);
        }
      }),
      socketService.on('playerDisconnected', (payload) => {
        if (gameSessionManager.isSoloSession()) return;
        setRoom(payload.room);
        if (payload.player.playerId !== socketService.getPlayerId()) {
          gameBridge.showToast(
            `${payload.player.name} terputus. Menunggu sambung ulang...`,
            3200
          );
        }
      }),
      socketService.on('playerReconnected', (payload) => {
        if (gameSessionManager.isSoloSession()) return;
        setRoom(payload.room);
        if (payload.player.playerId !== socketService.getPlayerId()) {
          audioManager.playSfx('ready');
          gameBridge.showToast(`${payload.player.name} tersambung kembali!`, 2600);
        }
      }),
      socketService.on('hostChanged', (payload) => {
        if (gameSessionManager.isSoloSession()) return;
        setRoom(payload.room);
        gameBridge.showToast(`${payload.newHostName} sekarang menjadi Host room.`, 2800);
      }),
      socketService.on('roomClosed', (payload) => {
        if (gameSessionManager.isSoloSession()) return;
        setRoom(null);
        setIsStartingGame(false);
        setLobbyError(payload.reason || 'Room telah ditutup.');
        gameBridge.showToast(payload.reason || 'Room telah ditutup.', 3200);
        if (gameBridge.getState().activeScene === 'CharacterSelectionScene') {
          gameBridge.navigateTo('LobbyScene');
        }
      }),
      socketService.on('matchFound', (matchedRoom) => {
        if (gameSessionManager.isSoloSession()) return;
        setIsSearchingMatch(false);
        setRoom(matchedRoom);
        audioManager.playSfx('ready');
        gameBridge.showToast(`Partner ditemukan! Room ${matchedRoom.roomCode} siap.`, 2600);
      }),
      socketService.on('gameStarted', (snapshot) => {
        if (gameSessionManager.isSoloSession()) return;
        setIsStartingGame(false);
        gameBridge.patch({ lastSnapshot: snapshot });
        gameBridge.navigateTo('RestaurantScene');
      }),
      socketService.on('rematchReady', (rematchRoom) => {
        if (gameSessionManager.isSoloSession()) return;
        setRoom(rematchRoom);
        gameBridge.navigateTo('LobbyScene');
      }),
      socketService.on('partnerLeft', (msg) => {
        if (gameSessionManager.isSoloSession()) return;
        gameBridge.showToast(msg, 4000);
      }),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, []);

  const handleNameChange = (next: string) => {
    setPlayerName(next);
    try {
      localStorage.setItem(LOCAL_NAME_KEY, next);
    } catch {
      // ignore
    }
  };

  const persistPrefsIfSignedIn = (
    nextName: string,
    nextRole: PlayerRole,
    nextAudio: AudioSettings
  ) => {
    if (user) {
      void savePlayerPreferences(user, nextName, nextRole, nextAudio).catch(() => {});
    }
  };

  const handleUpdateAudio = (patch: Partial<AudioSettings>) => {
    audioManager.unlock();
    const updated = audioManager.updateSettings(patch);
    persistPrefsIfSignedIn(playerName, preferredRole, updated);
  };

  // --- Main Menu Handlers (Strictly Separated Solo vs Online Flows) ---
  const handleStartSolo = () => {
    audioManager.unlock();
    audioManager.playSfx('ready');
    setIsSearchingMatch(false);
    setRoom(null);
    setLobbyError(null);

    const route = resolveMenuRoute('LATIHAN_SOLO');
    const initialSnapshot = gameSessionManager.startSoloSession(playerName);
    gameBridge.patch({
      lastSnapshot: initialSnapshot,
      activeControlRole: SOLO_BALANCE_CONFIG.initialRole,
      orderMenuTableId: null,
      showKitchenBoard: false,
      selectedRecipeId: null,
    });
    gameBridge.navigateTo(route.targetScene);
    gameBridge.showToast('Latihan Solo dimulai · Ganti Chef & Waiter kapan saja!', 2400);
  };

  const handlePlayOnline = () => {
    audioManager.unlock();
    audioManager.playSfx('click');
    setLobbyError(null);
    setRoom(null);
    setIsSearchingMatch(false);
    setIsCreatingRoom(false);
    setIsJoiningRoom(false);
    gameSessionManager.enterOnlineMode();
    socketService.connect();

    const route = resolveMenuRoute('PLAY_ONLINE');
    gameBridge.patch({ lobbyMode: route.lobbyMode ?? 'online' });
    gameBridge.navigateTo(route.targetScene);
  };

  const handleStartMatchmaking = async () => {
    if (isSearchingMatch || isCreatingRoom || isJoiningRoom) return;
    audioManager.unlock();
    audioManager.playSfx('click');
    setLobbyError(null);
    setRoom(null);
    gameSessionManager.enterOnlineMode();
    setIsSearchingMatch(true);

    const res = await socketService.joinMatchmaking(playerName);
    if (!res.ok) {
      setIsSearchingMatch(false);
      setLobbyError(res.error || 'Gagal tersambung ke server matchmaking. Coba lagi.');
    } else if (res.matched && res.room) {
      setIsSearchingMatch(false);
      setRoom(res.room);
      audioManager.playSfx('ready');
    }
  };

  const handleCreateRoom = async () => {
    if (isCreatingRoom || isJoiningRoom) return;
    audioManager.unlock();
    audioManager.playSfx('click');
    setLobbyError(null);
    setIsSearchingMatch(false);
    gameSessionManager.enterOnlineMode();

    const route = resolveMenuRoute('CREATE_ROOM');
    gameBridge.patch({ lobbyMode: route.lobbyMode ?? 'create' });
    if (gameBridge.getState().activeScene !== route.targetScene) {
      gameBridge.navigateTo(route.targetScene);
    }

    setIsCreatingRoom(true);
    try {
      const res = await socketService.createRoom(playerName, 'coop');
      if (res.ok && res.room) {
        setRoom(res.room);
        audioManager.playSfx('ready');
        gameBridge.showToast(`Room ${res.room.roomCode} berhasil dibuat!`, 2400);
      } else {
        setRoom(null);
        setLobbyError(res.error || 'Gagal membuat room. Periksa koneksi dan coba lagi.');
      }
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleOpenJoinRoom = () => {
    audioManager.unlock();
    audioManager.playSfx('click');
    setLobbyError(null);
    setRoom(null);
    setIsSearchingMatch(false);
    gameSessionManager.enterOnlineMode();
    socketService.connect();

    const route = resolveMenuRoute('JOIN_ROOM');
    gameBridge.patch({ lobbyMode: route.lobbyMode ?? 'join' });
    gameBridge.navigateTo(route.targetScene);
  };

  const handleJoinCode = async (code: string) => {
    if (isJoiningRoom || isCreatingRoom) return;
    audioManager.unlock();
    audioManager.playSfx('click');
    setLobbyError(null);
    setIsSearchingMatch(false);
    gameSessionManager.enterOnlineMode();

    setIsJoiningRoom(true);
    try {
      const res = await socketService.joinRoom(code, playerName);
      if (res.ok && res.room) {
        setRoom(res.room);
        audioManager.playSfx('ready');
        gameBridge.showToast(`Berhasil bergabung ke room ${res.room.roomCode}!`, 2400);
      } else {
        setLobbyError(res.error || 'Room tidak ditemukan. Periksa kode room dan coba lagi.');
      }
    } finally {
      setIsJoiningRoom(false);
    }
  };

  const handleLeaveRoomToLobby = () => {
    audioManager.playSfx('click');
    socketService.cancelMatchmaking();
    socketService.leaveRoom();
    setIsSearchingMatch(false);
    setIsCreatingRoom(false);
    setIsJoiningRoom(false);
    setIsStartingGame(false);
    setRoom(null);
    setLobbyError(null);
    gameBridge.patch({ lobbyMode: 'online' });
  };

  const handleLeaveToMenu = () => {
    audioManager.playSfx('click');
    gameSessionManager.leaveActiveSession();
    setIsSearchingMatch(false);
    setIsCreatingRoom(false);
    setIsJoiningRoom(false);
    setIsStartingGame(false);
    setRoom(null);
    setLobbyError(null);
    gameBridge.patch({
      lastSnapshot: null,
      orderMenuTableId: null,
      showKitchenBoard: false,
      selectedRecipeId: null,
    });
    gameBridge.navigateTo(resolveMenuRoute('BACK_TO_MENU').targetScene);
  };

  const handleSelectRole = async (role: PlayerRole) => {
    audioManager.playSfx('click');
    setLobbyError(null);
    const res = await socketService.selectRole(role);
    if (!res.ok && res.error) {
      setLobbyError(res.error);
    }
  };

  const handleToggleReady = async () => {
    if (isTogglingReady) return;
    audioManager.playSfx('click');
    setLobbyError(null);
    setIsTogglingReady(true);
    try {
      const res = await socketService.toggleReady();
      if (!res.ok && res.error) {
        setLobbyError(res.error);
      }
    } finally {
      setIsTogglingReady(false);
    }
  };

  const handleStartGame = async () => {
    if (isStartingGame) return;
    audioManager.unlock();
    audioManager.playSfx('ready');
    setLobbyError(null);
    setIsStartingGame(true);
    try {
      const res = await socketService.startGame();
      if (!res.ok) {
        setIsStartingGame(false);
        setLobbyError(res.error || 'Gagal memulai game. Pastikan kedua pemain sudah siap.');
      }
    } catch {
      setIsStartingGame(false);
      setLobbyError('Gagal memulai game. Coba lagi.');
    }
  };

  const handlePause = () => {
    audioManager.playSfx('click');
    gameBridge.patch({
      orderMenuTableId: null,
      showKitchenBoard: false,
      selectedRecipeId: null,
    });
    gameSessionManager.setPaused(true);
    gameBridge.navigateTo('PauseScene');
  };

  const handleResume = () => {
    audioManager.playSfx('click');
    gameSessionManager.setPaused(false);
    gameRef.current?.scene.stop('PauseScene');
    gameBridge.patch({ activeScene: 'RestaurantScene' });
  };

  const handleSelectSoloControlRole = (nextRole: PlayerRole) => {
    if (bridge.activeControlRole === nextRole) return;
    audioManager.playSfx('click');
    gameSessionManager.setSoloActiveRole(nextRole);
    gameBridge.patch({ activeControlRole: nextRole });
    gameBridge.showToast(nextRole === 'chef' ? 'Chef Aktif' : 'Waiter Aktif', 1100);
  };

  const handleRematch = () => {
    audioManager.playSfx('ready');
    if (gameSessionManager.isSoloSession()) {
      const freshSnap = gameSessionManager.requestRematch();
      if (freshSnap) {
        gameBridge.patch({
          lastSnapshot: freshSnap,
          activeControlRole: SOLO_BALANCE_CONFIG.initialRole,
          orderMenuTableId: null,
          showKitchenBoard: false,
          selectedRecipeId: null,
        });
        gameBridge.navigateTo('RestaurantScene');
      }
      return;
    }
    gameSessionManager.requestRematch();
  };

  const handleOpenSettings = (returnScene: SceneKey) => {
    audioManager.unlock();
    audioManager.playSfx('click');
    gameBridge.patch({ settingsReturnScene: returnScene });
    gameBridge.navigateTo('SettingsScene');
  };

  const handleCloseSettings = () => {
    audioManager.playSfx('click');
    persistPrefsIfSignedIn(playerName, preferredRole, audio);
    if (bridge.settingsReturnScene === 'PauseScene') {
      gameRef.current?.scene.stop('SettingsScene');
      gameBridge.navigateTo('PauseScene');
    } else {
      gameBridge.navigateTo('MainMenuScene');
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#FFF6EC] select-none">
      {/* Phaser 3 Responsive 16:9 Canvas Container */}
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center"
      />

      {/* Scene 1 & 2: Boot / Preload */}
      {(bridge.activeScene === 'BootScene' || bridge.activeScene === 'PreloadScene') && (
        <PreloadOverlay progress={bridge.preloadProgress} />
      )}

      {/* Scene 3: Main Menu */}
      {bridge.activeScene === 'MainMenuScene' && (
        <MainMenuOverlay
          user={user}
          profile={profile}
          playerName={playerName}
          onPlayerNameChange={handleNameChange}
          onStartSolo={handleStartSolo}
          onPlayOnline={() => void handlePlayOnline()}
          onCreateRoom={() => void handleCreateRoom()}
          onJoinRoom={handleOpenJoinRoom}
          onOpenSettings={() => handleOpenSettings('MainMenuScene')}
          onOpenHowToPlay={() => {
            audioManager.unlock();
            audioManager.playSfx('click');
            gameBridge.patch({ showHowToPlay: true });
          }}
          onSignIn={() => {
            audioManager.unlock();
            void signInWithGoogle();
          }}
          onSignOut={() => void signOutUser()}
        />
      )}

      {/* Scene 4: Lobby & Real Multiplayer Waiting Room */}
      {bridge.activeScene === 'LobbyScene' && (
        <LobbyOverlay
          mode={bridge.lobbyMode}
          room={room}
          playerName={playerName}
          myPlayerId={myPlayerId}
          mySocketId={mySocketId}
          connectionStatus={connectionStatus}
          connectionError={connectionError}
          isCreatingRoom={isCreatingRoom}
          isJoiningRoom={isJoiningRoom}
          isStartingGame={isStartingGame}
          isTogglingReady={isTogglingReady}
          isSearchingMatch={isSearchingMatch}
          errorText={lobbyError}
          onPlayerNameChange={handleNameChange}
          onBack={handleLeaveToMenu}
          onRetryConnection={() => {
            setLobbyError(null);
            socketService.reconnect();
          }}
          onJoinCode={(code) => void handleJoinCode(code)}
          onCreateCoopRoom={() => void handleCreateRoom()}
          onStartMatchmaking={() => void handleStartMatchmaking()}
          onCancelMatchmaking={() => {
            socketService.cancelMatchmaking();
            setIsSearchingMatch(false);
          }}
          onToggleReady={() => void handleToggleReady()}
          onStartGame={() => void handleStartGame()}
          onProceedCharacterSelect={() => {
            audioManager.playSfx('click');
            socketService.proceedToCharacterSelect();
            gameBridge.navigateTo('CharacterSelectionScene');
          }}
          onLeaveRoom={handleLeaveRoomToLobby}
          onNotifyToast={(msg) => gameBridge.showToast(msg, 2400)}
          onClearError={() => setLobbyError(null)}
        />
      )}

      {/* Scene 5: Character Selection */}
      {bridge.activeScene === 'CharacterSelectionScene' && room && (
        <CharacterSelectionOverlay
          room={room}
          mySocketId={mySocketId}
          errorText={lobbyError}
          previewAnims={bridge.previewAnims}
          onChangePreviewAnim={(role, anim) => {
            audioManager.playSfx('click');
            gameBridge.patch({
              previewAnims: {
                ...bridge.previewAnims,
                [role]: anim,
              },
            });
          }}
          onSelectRole={(role) => void handleSelectRole(role)}
          onToggleReady={() => void handleToggleReady()}
          onStartGame={() => void handleStartGame()}
          onLeave={handleLeaveToMenu}
        />
      )}

      {/* Scene 6: Restaurant Active HUD */}
      {bridge.activeScene === 'RestaurantScene' && (
        <RestaurantHUD
          snapshot={bridge.lastSnapshot}
          activeRole={bridge.activeControlRole}
          isCharacterMoving={bridge.isCharacterMoving}
          onPause={handlePause}
          onSelectRole={handleSelectSoloControlRole}
          onSendEmote={(text, anim) =>
            gameSessionManager.sendEmote(bridge.activeControlRole, text, anim)
          }
        />
      )}

      {/* Phase 06: Waiter Order Taking UI */}
      {bridge.activeScene === 'RestaurantScene' &&
        bridge.orderMenuTableId &&
        bridge.lastSnapshot && (
          <OrderTakingUI
            tableId={bridge.orderMenuTableId}
            snapshot={bridge.lastSnapshot}
            onClose={() => gameBridge.closeOrderMenu()}
            onViewRecipe={(recipeId) => gameBridge.openRecipePreview(recipeId)}
          />
        )}

      {/* Phase 06: Chef Kitchen Order Queue Board */}
      {bridge.activeScene === 'RestaurantScene' &&
        bridge.showKitchenBoard &&
        bridge.lastSnapshot && (
          <KitchenOrderBoard
            snapshot={bridge.lastSnapshot}
            activeRole={bridge.activeControlRole}
            onClose={() => gameBridge.setKitchenBoardOpen(false)}
            onViewRecipe={(recipeId) => gameBridge.openRecipePreview(recipeId)}
          />
        )}

      {/* Phase 06: Chef Recipe Preview Panel */}
      {bridge.activeScene === 'RestaurantScene' && bridge.selectedRecipeId && (
        <RecipePanel
          recipeId={bridge.selectedRecipeId}
          onClose={() => gameBridge.openRecipePreview(null)}
        />
      )}

      {/* Scene 7: Pause Overlay */}
      {bridge.activeScene === 'PauseScene' && (
        <PauseOverlay
          pausedBy={bridge.lastSnapshot?.pausedBy ?? null}
          onResume={handleResume}
          onOpenSettings={() => handleOpenSettings('PauseScene')}
          onLeaveToMenu={handleLeaveToMenu}
        />
      )}

      {/* Scene 8: Result Overlay */}
      {bridge.activeScene === 'ResultScene' && bridge.lastMatchSummary && (
        <ResultOverlay
          summary={bridge.lastMatchSummary}
          leaderboard={leaderboard}
          isSignedIn={Boolean(user)}
          onRematch={handleRematch}
          onMainMenu={handleLeaveToMenu}
        />
      )}

      {/* Scene 9: Settings Overlay */}
      {bridge.activeScene === 'SettingsScene' && (
        <SettingsOverlay
          audio={audio}
          playerName={playerName}
          preferredRole={preferredRole}
          isSignedIn={Boolean(user)}
          onUpdateAudio={handleUpdateAudio}
          onTestSound={() => {
            audioManager.unlock();
            audioManager.playSfx('serve');
          }}
          onChangeName={handleNameChange}
          onChangePreferredRole={(r) => {
            setPreferredRole(r);
            persistPrefsIfSignedIn(playerName, r, audio);
          }}
          onBack={handleCloseSettings}
        />
      )}

      {/* How To Play Modal */}
      {bridge.showHowToPlay && (
        <HowToPlayModal onClose={() => gameBridge.patch({ showHowToPlay: false })} />
      )}

      {/* Non-intrusive Toast Notification */}
      {bridge.toastMessage && (
        <div
          role="status"
          className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-50 rounded-2xl bg-[#3B2318]/92 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xl"
        >
          {bridge.toastMessage}
        </div>
      )}
    </div>
  );
};
