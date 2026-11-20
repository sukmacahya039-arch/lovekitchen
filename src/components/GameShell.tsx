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
import {
  fetchTopLeaderboard,
  loadOrCreatePlayerProfile,
  recordMatchResult,
  savePlayerPreferences,
  type LeaderboardRow,
} from '../services/playerDataService.ts';
import type {
  AudioSettings,
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
  const [mySocketId, setMySocketId] = useState<string | null>(null);
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

  // Subscribe to GameBridge & AudioManager
  useEffect(() => {
    const unsubBridge = gameBridge.subscribe(setBridge);
    const unsubAudio = audioManager.subscribe(setAudio);
    return () => {
      unsubBridge();
      unsubAudio();
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
    setMySocketId(socketService.getSocketId());

    const u1 = socketService.on('connected', (id) => setMySocketId(id));
    const u2 = socketService.on('roomUpdated', (updatedRoom) => {
      if (gameSessionManager.isSoloSession()) return;
      setRoom(updatedRoom);
      if (updatedRoom.phase === 'character_select' && gameBridge.getState().activeScene === 'LobbyScene') {
        gameBridge.navigateTo('CharacterSelectionScene');
      }
    });
    const u3 = socketService.on('matchFound', (matchedRoom) => {
      if (gameSessionManager.isSoloSession()) return;
      setIsSearchingMatch(false);
      setRoom(matchedRoom);
      audioManager.playSfx('ready');
      gameBridge.navigateTo('CharacterSelectionScene');
    });
    const u4 = socketService.on('gameStarted', (snapshot) => {
      if (gameSessionManager.isSoloSession()) return;
      gameBridge.patch({ lastSnapshot: snapshot });
      gameBridge.navigateTo('RestaurantScene');
    });
    const u7 = socketService.on('rematchReady', (rematchRoom) => {
      if (gameSessionManager.isSoloSession()) return;
      setRoom(rematchRoom);
      gameBridge.navigateTo('CharacterSelectionScene');
    });
    const u8 = socketService.on('partnerLeft', (msg) => {
      if (gameSessionManager.isSoloSession()) return;
      gameBridge.showToast(msg, 4000);
    });

    return () => {
      u1();
      u2();
      u3();
      u4();
      u7();
      u8();
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

  const handlePlayOnline = async () => {
    audioManager.unlock();
    audioManager.playSfx('click');
    setLobbyError(null);
    setRoom(null);
    gameSessionManager.enterOnlineMode();

    const route = resolveMenuRoute('PLAY_ONLINE');
    gameBridge.patch({ lobbyMode: route.lobbyMode ?? 'online' });
    gameBridge.navigateTo(route.targetScene);
    setIsSearchingMatch(true);
    const res = await socketService.joinMatchmaking(playerName);
    if (!res.ok) {
      setIsSearchingMatch(false);
      setLobbyError('Gagal tersambung ke server matchmaking.');
    } else if (res.matched && res.room) {
      setIsSearchingMatch(false);
      setRoom(res.room);
      gameBridge.navigateTo('CharacterSelectionScene');
    }
  };

  const handleCreateRoom = async () => {
    audioManager.unlock();
    audioManager.playSfx('click');
    setLobbyError(null);
    gameSessionManager.enterOnlineMode();

    const route = resolveMenuRoute('CREATE_ROOM');
    gameBridge.patch({ lobbyMode: route.lobbyMode ?? 'create' });
    gameBridge.navigateTo(route.targetScene);
    const res = await socketService.createRoom(playerName, 'coop');
    if (res.ok && res.room) {
      setRoom(res.room);
    } else {
      setLobbyError(res.error || 'Gagal membuat room.');
    }
  };

  const handleOpenJoinRoom = () => {
    audioManager.unlock();
    audioManager.playSfx('click');
    setLobbyError(null);
    setRoom(null);
    gameSessionManager.enterOnlineMode();

    const route = resolveMenuRoute('JOIN_ROOM');
    gameBridge.patch({ lobbyMode: route.lobbyMode ?? 'join' });
    gameBridge.navigateTo(route.targetScene);
  };

  const handleJoinCode = async (code: string) => {
    audioManager.unlock();
    audioManager.playSfx('click');
    setLobbyError(null);
    gameSessionManager.enterOnlineMode();
    const res = await socketService.joinRoom(code, playerName);
    if (res.ok && res.room) {
      setRoom(res.room);
    } else {
      setLobbyError(res.error || 'Kode room tidak valid.');
    }
  };

  const handleLeaveToMenu = () => {
    audioManager.playSfx('click');
    gameSessionManager.leaveActiveSession();
    setIsSearchingMatch(false);
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

  const handleStartGame = async () => {
    audioManager.unlock();
    audioManager.playSfx('ready');
    setLobbyError(null);
    const res = await socketService.startGame();
    if (!res.ok && res.error) {
      setLobbyError(res.error);
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

      {/* Scene 4: Lobby */}
      {bridge.activeScene === 'LobbyScene' && (
        <LobbyOverlay
          mode={bridge.lobbyMode}
          room={room}
          mySocketId={mySocketId}
          isSearchingMatch={isSearchingMatch}
          errorText={lobbyError}
          onBack={handleLeaveToMenu}
          onJoinCode={(code) => void handleJoinCode(code)}
          onCreateCoopRoom={() => void handleCreateRoom()}
          onStartSoloPractice={handleStartSolo}
          onStartMatchmaking={() => void handlePlayOnline()}
          onCancelMatchmaking={() => {
            socketService.cancelMatchmaking();
            setIsSearchingMatch(false);
          }}
          onProceedCharacterSelect={() => {
            audioManager.playSfx('click');
            socketService.proceedToCharacterSelect();
            gameBridge.navigateTo('CharacterSelectionScene');
          }}
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
          onToggleReady={() => {
            audioManager.playSfx('click');
            socketService.toggleReady();
          }}
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
