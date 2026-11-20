import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ClipboardPaste,
  Globe,
  KeyRound,
  Loader2,
  PlusCircle,
  RefreshCw,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  getConnectionStatusLabel,
  isValidRoomCode,
  normalizeRoomCode,
  type ConnectionStatus,
} from '../../shared/roomProtocol.ts';
import type { RoomState } from '../../shared/types.ts';
import type { LobbyMode } from '../../game/systems/ui/GameBridge.ts';
import { WaitingRoomPanel } from './WaitingRoomPanel.tsx';

interface Props {
  mode: LobbyMode;
  room: RoomState | null;
  playerName: string;
  myPlayerId: string;
  mySocketId: string | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  isCreatingRoom: boolean;
  isJoiningRoom: boolean;
  isStartingGame: boolean;
  isTogglingReady: boolean;
  isSearchingMatch: boolean;
  errorText: string | null;
  onPlayerNameChange: (name: string) => void;
  onBack: () => void;
  onRetryConnection: () => void;
  onCreateCoopRoom: () => void;
  onJoinCode: (code: string) => void;
  onStartMatchmaking: () => void;
  onCancelMatchmaking: () => void;
  onToggleReady: () => void;
  onStartGame: () => void;
  onProceedCharacterSelect: () => void;
  onLeaveRoom: () => void;
  onNotifyToast: (msg: string) => void;
  onClearError: () => void;
}

type LobbySubView = 'hub' | 'join';

export const LobbyOverlay: React.FC<Props> = ({
  mode,
  room,
  playerName,
  myPlayerId,
  mySocketId,
  connectionStatus,
  connectionError,
  isCreatingRoom,
  isJoiningRoom,
  isStartingGame,
  isTogglingReady,
  isSearchingMatch,
  errorText,
  onPlayerNameChange,
  onBack,
  onRetryConnection,
  onCreateCoopRoom,
  onJoinCode,
  onStartMatchmaking,
  onCancelMatchmaking,
  onToggleReady,
  onStartGame,
  onProceedCharacterSelect,
  onLeaveRoom,
  onNotifyToast,
  onClearError,
}) => {
  const [subView, setSubView] = useState<LobbySubView>(() =>
    mode === 'join' ? 'join' : 'hub'
  );
  const [joinInput, setJoinInput] = useState('');
  const [localInputError, setLocalInputError] = useState<string | null>(null);

  useEffect(() => {
    if (!room) {
      setSubView(mode === 'join' ? 'join' : 'hub');
    }
  }, [mode, room]);

  const normalizedPreview = normalizeRoomCode(joinInput);
  const canSubmitJoin =
    !isJoiningRoom &&
    !isCreatingRoom &&
    joinInput.trim().length >= 4 &&
    connectionStatus !== 'ERROR';

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalInputError(null);
    onClearError();

    const normalized = normalizeRoomCode(joinInput);
    if (!normalized) {
      setLocalInputError('Masukkan kode room terlebih dahulu (contoh: LK-8F2K).');
      return;
    }
    if (!isValidRoomCode(normalized)) {
      setLocalInputError('Room tidak ditemukan. Periksa kode room dan coba lagi.');
      return;
    }
    setJoinInput(normalized);
    onJoinCode(normalized);
  };

  const handlePasteCode = async () => {
    setLocalInputError(null);
    onClearError();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        const extracted = normalizeRoomCode(text);
        if (extracted) {
          setJoinInput(extracted);
          onNotifyToast(`Kode ${extracted} ditempel.`);
          return;
        }
      }
      setLocalInputError('Clipboard kosong atau tidak berisi kode room.');
    } catch {
      setLocalInputError('Izin tempel clipboard ditolak. Ketik kode room secara manual.');
    }
  };

  const connectionBadgeStyle = (() => {
    switch (connectionStatus) {
      case 'CONNECTED':
        return {
          cls: 'bg-[#DCFCE7] border-[#86EFAC] text-[#166534]',
          dot: 'bg-[#16A34A]',
          icon: <Wifi className="w-3.5 h-3.5 shrink-0" />,
        };
      case 'CONNECTING':
        return {
          cls: 'bg-[#FEF3C7] border-[#FCD34D] text-[#92400E]',
          dot: 'bg-[#D97706] animate-pulse',
          icon: <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />,
        };
      case 'DISCONNECTED':
        return {
          cls: 'bg-[#FFEDD5] border-[#FDBA74] text-[#9A3412]',
          dot: 'bg-[#EA580C]',
          icon: <WifiOff className="w-3.5 h-3.5 shrink-0" />,
        };
      case 'ERROR':
        return {
          cls: 'bg-[#FEE2E2] border-[#FCA5A5] text-[#991B1B]',
          dot: 'bg-[#DC2626]',
          icon: <WifiOff className="w-3.5 h-3.5 shrink-0" />,
        };
    }
  })();

  const displayedError = localInputError || errorText || (connectionStatus === 'ERROR' ? connectionError : null);

  const headerTitle = room
    ? 'Waiting Room'
    : subView === 'join'
      ? 'Join Room'
      : 'Lobby Room';

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-start sm:justify-center overflow-y-auto px-3 py-3 sm:p-5"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      }}
    >
      <div className="w-full max-w-lg my-auto rounded-3xl bg-[#FFFDF9]/96 border-2 border-[#3B2318]/12 p-4 sm:p-6 shadow-2xl">
        {/* HEADER: Back + Title + Real Connection Indicator */}
        <header className="flex items-center justify-between gap-2 pb-3 border-b border-[#3B2318]/10">
          <button
            type="button"
            onClick={() => {
              if (!room && subView === 'join') {
                setLocalInputError(null);
                onClearError();
                setSubView('hub');
                return;
              }
              onBack();
            }}
            data-testid="btn-lobby-back"
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[42px] rounded-xl bg-[#FFF6EC] border border-[#3B2318]/14 text-xs sm:text-sm font-bold text-[#3B2318] hover:bg-[#FDEBD6] active:scale-[0.98] transition shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Kembali</span>
          </button>

          <h2 className="font-display text-lg sm:text-xl font-bold text-[#3B2318] truncate text-center">
            {headerTitle}
          </h2>

          <button
            type="button"
            onClick={() => {
              if (connectionStatus === 'DISCONNECTED' || connectionStatus === 'ERROR') {
                onRetryConnection();
              }
            }}
            title={
              connectionStatus === 'CONNECTED'
                ? 'Terhubung ke server multiplayer'
                : 'Ketuk untuk menyambungkan ulang'
            }
            data-testid="lobby-connection-status"
            data-status={connectionStatus}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-xl border text-[11px] sm:text-xs font-bold shrink-0 transition ${
              connectionBadgeStyle.cls
            } ${
              connectionStatus === 'DISCONNECTED' || connectionStatus === 'ERROR'
                ? 'cursor-pointer hover:opacity-90'
                : 'cursor-default'
            }`}
          >
            {connectionBadgeStyle.icon}
            <span className="hidden xs:inline sm:inline">
              {getConnectionStatusLabel(connectionStatus)}
            </span>
          </button>
        </header>

        {/* Error Alert Banner (Indonesian, human-friendly, with retry when needed) */}
        {displayedError && (
          <div
            role="alert"
            data-testid="lobby-error-banner"
            className="mt-3.5 rounded-2xl bg-[#FEF2F2] border border-[#EF4444]/35 px-3.5 py-3 text-xs sm:text-sm font-semibold text-[#991B1B] flex flex-col gap-2"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#DC2626]" />
              <span className="leading-snug">{displayedError}</span>
            </div>
            {(connectionStatus === 'ERROR' || connectionStatus === 'DISCONNECTED') && (
              <button
                type="button"
                onClick={onRetryConnection}
                className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#EF4444]/35 text-xs font-bold text-[#991B1B] hover:bg-[#FEE2E2] cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Coba Sambungkan Ulang</span>
              </button>
            )}
          </div>
        )}

        {/* ACTIVE WAITING ROOM (Server-confirmed room) */}
        {room ? (
          <WaitingRoomPanel
            room={room}
            myPlayerId={myPlayerId}
            mySocketId={mySocketId}
            isStartingGame={isStartingGame}
            isTogglingReady={isTogglingReady}
            onCopySuccess={onNotifyToast}
            onToggleReady={onToggleReady}
            onStartGame={onStartGame}
            onOpenCharacterPreview={onProceedCharacterSelect}
            onLeaveRoom={onLeaveRoom}
          />
        ) : subView === 'join' ? (
          /* JOIN ROOM VIEW */
          <form
            className="mt-4 flex flex-col gap-3.5"
            onSubmit={handleJoinSubmit}
            data-testid="join-room-form"
          >
            <div className="rounded-2xl bg-[#FFF6EC] border border-[#3B2318]/12 p-3.5 sm:p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="room-code-input"
                  className="text-xs font-bold uppercase tracking-wider text-[#7C5340]"
                >
                  ENTER ROOM CODE
                </label>
                <button
                  type="button"
                  onClick={() => void handlePasteCode()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#3B2318]/14 text-xs font-bold text-[#3B2318] hover:bg-[#FDEBD6] cursor-pointer"
                >
                  <ClipboardPaste className="w-3.5 h-3.5 text-[#FF5A6E]" />
                  <span>Tempel</span>
                </button>
              </div>

              <div className="relative">
                <input
                  id="room-code-input"
                  data-testid="input-room-code"
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={80}
                  value={joinInput}
                  onChange={(e) => {
                    setLocalInputError(null);
                    onClearError();
                    setJoinInput(e.target.value.toUpperCase());
                  }}
                  placeholder="LK-8F2K"
                  className="w-full rounded-2xl bg-white border-2 border-[#3B2318]/16 px-4 pr-11 py-3.5 text-center font-mono-num text-2xl font-extrabold tracking-[0.16em] text-[#3B2318] uppercase placeholder:text-[#3B2318]/25 focus:outline-none focus:border-[#FF5A6E]"
                />
                {joinInput.length > 0 && (
                  <button
                    type="button"
                    aria-label="Hapus kode room"
                    onClick={() => {
                      setJoinInput('');
                      setLocalInputError(null);
                      onClearError();
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-[#FFF6EC] text-[#7C5340] hover:bg-[#FDEBD6] flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <p className="text-[11px] text-[#7C5340] text-center">
                {normalizedPreview && isValidRoomCode(normalizedPreview) ? (
                  <span className="text-[#15803D] font-semibold">
                    Kode terbaca: <strong className="font-mono-num">{normalizedPreview}</strong>
                  </span>
                ) : (
                  <span>Ketik atau tempel kode undangan dari partner (contoh: LK-8F2K)</span>
                )}
              </p>
            </div>

            <button
              type="submit"
              disabled={!canSubmitJoin}
              data-testid="btn-submit-join-room"
              className="w-full min-h-[50px] px-5 py-3 rounded-2xl bg-[#FF5A6E] text-white font-display text-base font-bold shadow-md hover:bg-[#E8485C] disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.99] transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {isJoiningRoom ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>BERGABUNG KE ROOM...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-5 h-5" />
                  <span>JOIN ROOM</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setLocalInputError(null);
                onClearError();
                setSubView('hub');
              }}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#FFF6EC] border border-[#3B2318]/14 text-xs sm:text-sm font-bold text-[#5C3A28] hover:bg-[#FDEBD6] transition cursor-pointer"
            >
              Atau Buat Room Baru
            </button>
          </form>
        ) : (
          /* LOBBY HUB: Create Room + Join Room + Optional Quick Matchmaking */
          <div className="mt-4 flex flex-col gap-3.5" data-testid="lobby-hub-view">
            {/* Compact Player Name Row */}
            <div className="rounded-2xl bg-[#FFF6EC] border border-[#3B2318]/12 px-3.5 py-2.5 flex items-center justify-between gap-3">
              <label
                htmlFor="lobby-player-name"
                className="text-xs font-bold text-[#7C5340] whitespace-nowrap"
              >
                Nama Pemain
              </label>
              <input
                id="lobby-player-name"
                type="text"
                maxLength={18}
                value={playerName}
                onChange={(e) => onPlayerNameChange(e.target.value)}
                placeholder="Chef Leo"
                className="w-full max-w-[200px] rounded-xl bg-white border border-[#3B2318]/14 px-3 py-1.5 text-sm font-bold text-[#3B2318] text-right focus:outline-none focus:border-[#FF5A6E]"
              />
            </div>

            {/* Primary Actions: BUAT ROOM BARU & JOIN ROOM */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isCreatingRoom || isJoiningRoom || isSearchingMatch}
                onClick={() => {
                  onClearError();
                  onCreateCoopRoom();
                }}
                data-testid="btn-create-new-room"
                className="min-h-[84px] sm:min-h-[104px] p-4 rounded-2xl bg-[#FF5A6E] text-white shadow-md hover:bg-[#E8485C] disabled:opacity-55 active:scale-[0.98] transition flex sm:flex-col items-center sm:items-start justify-between gap-3 text-left cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  {isCreatingRoom ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <PlusCircle className="w-5 h-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-base font-bold leading-tight">
                    {isCreatingRoom ? 'MEMBUAT ROOM...' : 'BUAT ROOM BARU'}
                  </p>
                  <p className="text-xs text-white/90 mt-0.5 leading-snug">
                    Jadi Host (Chef) &amp; dapatkan kode undangan.
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={isCreatingRoom || isJoiningRoom || isSearchingMatch}
                onClick={() => {
                  setLocalInputError(null);
                  onClearError();
                  setSubView('join');
                }}
                data-testid="btn-open-join-room"
                className="min-h-[84px] sm:min-h-[104px] p-4 rounded-2xl bg-[#3B2318] text-white shadow-md hover:bg-[#523224] disabled:opacity-55 active:scale-[0.98] transition flex sm:flex-col items-center sm:items-start justify-between gap-3 text-left cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-[#FDE68A]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-base font-bold leading-tight">JOIN ROOM</p>
                  <p className="text-xs text-[#FFF0E6]/85 mt-0.5 leading-snug">
                    Masukkan kode room partner &amp; main sebagai Waiter.
                  </p>
                </div>
              </button>
            </div>

            {/* Optional Quick Online Matchmaking Strip */}
            <div className="rounded-2xl bg-[#FFF6EC]/85 border border-[#3B2318]/12 p-3.5">
              {isSearchingMatch ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-left">
                    <Loader2 className="w-5 h-5 text-[#FF5A6E] animate-spin shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-[#3B2318]">
                        Mencari Partner Online...
                      </p>
                      <p className="text-xs text-[#7C5340]">
                        Menunggu pemain lain di antrean server.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onCancelMatchmaking}
                    className="w-full sm:w-auto px-4 py-2 min-h-[40px] rounded-xl bg-white border border-[#3B2318]/15 text-xs font-bold text-[#3B2318] hover:bg-[#FDEBD6] cursor-pointer"
                  >
                    Batalkan
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 text-left w-full sm:w-auto">
                    <div className="w-9 h-9 rounded-xl bg-[#FFE4E8] text-[#FF5A6E] flex items-center justify-center shrink-0">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-[#3B2318]">
                        Matchmaking Otomatis
                      </p>
                      <p className="text-[11px] text-[#7C5340]">
                        Cari partner acak secara real-time tanpa kode.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isCreatingRoom || isJoiningRoom || connectionStatus === 'ERROR'}
                    onClick={() => {
                      onClearError();
                      onStartMatchmaking();
                    }}
                    className="w-full sm:w-auto px-4 py-2 min-h-[40px] rounded-xl bg-white border border-[#3B2318]/16 text-xs font-bold text-[#3B2318] hover:bg-[#FDEBD6] disabled:opacity-45 shrink-0 cursor-pointer"
                  >
                    Cari Partner
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
