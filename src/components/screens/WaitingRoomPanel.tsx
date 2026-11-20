import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChefHat,
  Clock,
  Copy,
  Loader2,
  LogOut,
  Play,
  Share2,
  Sparkles,
  UtensilsCrossed,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  buildInviteMessage,
  getRoomStatusLabel,
} from '../../shared/roomProtocol.ts';
import type { RoomMember, RoomState } from '../../shared/types.ts';

interface Props {
  room: RoomState;
  myPlayerId: string;
  mySocketId: string | null;
  isStartingGame: boolean;
  isTogglingReady: boolean;
  onCopySuccess: (message: string) => void;
  onToggleReady: () => void;
  onStartGame: () => void;
  onOpenCharacterPreview: () => void;
  onLeaveRoom: () => void;
}

async function copyTextSafely(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to execCommand fallback
  }

  try {
    if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    }
  } catch {
    return false;
  }
  return false;
}

export const WaitingRoomPanel: React.FC<Props> = ({
  room,
  myPlayerId,
  mySocketId,
  isStartingGame,
  isTogglingReady,
  onCopySuccess,
  onToggleReady,
  onStartGame,
  onOpenCharacterPreview,
  onLeaveRoom,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [sharedInvite, setSharedInvite] = useState(false);

  const players = room.players?.length ? room.players : room.members;
  const me = players.find(
    (p) => p.playerId === myPlayerId || (mySocketId !== null && p.socketId === mySocketId)
  );
  const isHost = Boolean(
    me?.isHost ||
      room.hostId === myPlayerId ||
      (mySocketId !== null && room.hostSocketId === mySocketId)
  );

  const player1: RoomMember | undefined = players.find((p) => p.slot === 1) ?? players[0];
  const player2: RoomMember | undefined = players.find((p) => p.slot === 2) ?? players[1];

  const allConnected = players.length === 2 && players.every((p) => p.connected);
  const allReady = players.length === 2 && players.every((p) => p.ready);
  const hasDistinctRoles =
    Boolean(players.find((p) => p.role === 'chef')) &&
    Boolean(players.find((p) => p.role === 'waiter'));

  const canHostStart =
    isHost &&
    room.roomStatus === 'READY' &&
    allConnected &&
    allReady &&
    hasDistinctRoles &&
    !isStartingGame;

  const displayCode = room.roomCode || room.code;
  const inviteText = buildInviteMessage(displayCode);

  const handleCopyCode = async () => {
    const ok = await copyTextSafely(displayCode);
    if (ok) {
      setCopiedCode(true);
      onCopySuccess(`Kode room ${displayCode} disalin!`);
      window.setTimeout(() => setCopiedCode(false), 2000);
    } else {
      onCopySuccess(`Kode room kamu: ${displayCode}`);
    }
  };

  const handleInvitePartner = async () => {
    // Use Web Share API on Android/mobile browsers when available; never crash if unavailable/cancelled
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Love Kitchen Co-Op',
          text: inviteText,
        });
        setSharedInvite(true);
        onCopySuccess('Undangan room berhasil dibagikan!');
        window.setTimeout(() => setSharedInvite(false), 2000);
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        // Fallback to clipboard copy below
      }
    }

    const ok = await copyTextSafely(inviteText);
    if (ok) {
      setSharedInvite(true);
      onCopySuccess('Teks undangan berhasil disalin! Kirim ke partner kamu.');
      window.setTimeout(() => setSharedInvite(false), 2200);
    } else {
      onCopySuccess(`Kirim kode ${displayCode} ke partner kamu.`);
    }
  };

  const statusTone =
    room.roomStatus === 'READY'
      ? 'bg-[#DCFCE7] text-[#166534] border-[#86EFAC]'
      : room.roomStatus === 'STARTING' || room.roomStatus === 'IN_GAME'
        ? 'bg-[#FFE4E8] text-[#BE123C] border-[#FDA4AF]'
        : 'bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]';

  const renderPlayerCard = (slotNum: 1 | 2, member?: RoomMember) => {
    const isMe = Boolean(
      member &&
        (member.playerId === myPlayerId ||
          (mySocketId !== null && member.socketId === mySocketId))
    );
    const isChef = (member?.role ?? (slotNum === 1 ? 'chef' : 'waiter')) === 'chef';

    if (!member) {
      return (
        <div
          key={slotNum}
          data-testid={`waiting-slot-${slotNum}`}
          className="rounded-2xl border-2 border-dashed border-[#3B2318]/18 bg-[#FFF6EC]/70 p-3.5 flex flex-col justify-between gap-2 min-h-[112px]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C6754]">
              PLAYER {slotNum}
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-[#FCE7F3] px-2 py-0.5 text-[11px] font-bold text-[#BE185D]">
              <UtensilsCrossed className="w-3 h-3" />
              WAITER
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm font-semibold text-[#7C5340]">
            <Loader2 className="w-4 h-4 animate-spin text-[#FF5A6E] shrink-0" />
            <span>Waiting for partner...</span>
          </div>

          <p className="text-[11px] text-[#8C6754] leading-snug">
            Bagikan kode <strong className="font-mono-num text-[#3B2318]">{displayCode}</strong> ke
            partner kamu.
          </p>
        </div>
      );
    }

    return (
      <div
        key={slotNum}
        data-testid={`waiting-slot-${slotNum}`}
        className={`rounded-2xl border-2 p-3.5 flex flex-col justify-between gap-2.5 min-h-[112px] transition ${
          isChef
            ? 'border-[#F59E0B]/45 bg-[#FFFBF2]'
            : 'border-[#EC4899]/40 bg-[#FFF5FA]'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#7C5340]">
              PLAYER {slotNum}
            </span>
            <span className="rounded-md bg-[#3B2318]/8 px-1.5 py-0.5 text-[10px] font-bold text-[#5C3A28]">
              {member.isHost ? 'Host' : 'Guest'}
            </span>
          </div>

          <span
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-bold shrink-0 ${
              isChef
                ? 'bg-[#FEF3C7] text-[#B45309]'
                : 'bg-[#FCE7F3] text-[#BE185D]'
            }`}
          >
            {isChef ? <ChefHat className="w-3 h-3" /> : <UtensilsCrossed className="w-3 h-3" />}
            {isChef ? 'CHEF' : 'WAITER'}
          </span>
        </div>

        <div className="min-w-0">
          <p className="font-display text-base font-bold text-[#3B2318] truncate">
            {member.name}
            {isMe ? ' (Kamu)' : ''}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#3B2318]/10 text-xs font-semibold">
          <span
            className={`inline-flex items-center gap-1 ${
              member.connected ? 'text-[#15803D]' : 'text-[#B45309]'
            }`}
          >
            {member.connected ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span>Reconnecting...</span>
              </>
            )}
          </span>

          <span
            className={`inline-flex items-center gap-1 ${
              member.ready ? 'text-[#15803D]' : 'text-[#8C6754]'
            }`}
          >
            {member.ready ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Siap</span>
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5" />
                <span>Belum Siap</span>
              </>
            )}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-4 flex flex-col gap-3.5" data-testid="waiting-room-panel">
      {/* Room Header Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#FF5A6E]">
            LOVE KITCHEN CO-OP
          </p>
          <p className="text-xs font-medium text-[#7C5340]">
            Map: <strong className="text-[#3B2318]">Burger Cafe</strong> · Pemain{' '}
            <strong className="font-mono-num text-[#3B2318]">
              {players.length}/{room.maxPlayers}
            </strong>
          </p>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold ${statusTone}`}
        >
          {getRoomStatusLabel(room.roomStatus)}
        </span>
      </div>

      {/* Prominent Room Code & Share Card */}
      <div className="rounded-2xl bg-[#FFF6EC] border border-[#3B2318]/14 p-3.5 sm:p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#7C5340]">
              ROOM CODE
            </p>
            <p
              data-testid="room-code-display"
              className="font-mono-num text-2xl sm:text-3xl font-extrabold tracking-[0.16em] text-[#3B2318] select-all"
            >
              {displayCode}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleCopyCode()}
            data-testid="btn-copy-room-code"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl bg-white border border-[#3B2318]/15 text-xs sm:text-sm font-bold text-[#3B2318] hover:bg-[#FDEBD6] active:scale-[0.98] transition shrink-0 cursor-pointer"
          >
            {copiedCode ? (
              <>
                <Check className="w-4 h-4 text-[#16A34A]" />
                <span>TERSALIN</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-[#FF5A6E]" />
                <span>COPY</span>
              </>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => void handleInvitePartner()}
          data-testid="btn-invite-partner"
          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-white border border-[#FF5A6E]/35 text-[#D93D52] font-display text-sm font-bold hover:bg-[#FFF0F2] active:scale-[0.99] transition flex items-center justify-center gap-2 cursor-pointer"
        >
          {sharedInvite ? (
            <>
              <Check className="w-4 h-4 text-[#16A34A]" />
              <span>UNDANGAN SIAP DIBAGIKAN!</span>
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4" />
              <span>INVITE PARTNER</span>
            </>
          )}
        </button>
      </div>

      {/* Real-Time 2-Player Roster */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {renderPlayerCard(1, player1)}
        {renderPlayerCard(2, player2)}
      </div>

      {/* Primary Action Controls */}
      <div className="flex flex-col gap-2.5 pt-1">
        {isHost ? (
          <button
            type="button"
            onClick={onStartGame}
            disabled={!canHostStart}
            data-testid="btn-start-game"
            className="w-full min-h-[50px] px-5 py-3 rounded-2xl bg-[#FF5A6E] text-white font-display text-base font-bold shadow-md hover:bg-[#E8485C] disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.99] transition flex items-center justify-center gap-2 cursor-pointer"
          >
            {isStartingGame || room.roomStatus === 'STARTING' ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>MEMULAI GAME...</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-white" />
                <span>
                  {players.length < 2
                    ? 'START GAME (MENUNGGU PARTNER)'
                    : !allConnected
                      ? 'START GAME (PARTNER TERPUTUS)'
                      : !allReady
                        ? 'START GAME (MENUNGGU SIAP)'
                        : 'START GAME'}
                </span>
              </>
            )}
          </button>
        ) : (
          <div className="w-full rounded-2xl bg-[#FFF6EC] border border-[#3B2318]/12 px-4 py-3 text-center text-xs sm:text-sm font-semibold text-[#5C3A28]">
            {allReady && allConnected
              ? 'Semua pemain siap! Menunggu Host menekan START GAME...'
              : 'Tekan tombol SIAP di bawah agar Host dapat memulai permainan.'}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onToggleReady}
            disabled={isTogglingReady || room.roomStatus === 'STARTING'}
            data-testid="btn-toggle-ready"
            className={`min-h-[44px] px-3 py-2 rounded-xl font-display text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 ${
              me?.ready
                ? 'bg-[#DCFCE7] border border-[#16A34A]/35 text-[#166534] hover:bg-[#BBF7D0]'
                : 'bg-[#FFF6EC] border border-[#3B2318]/18 text-[#3B2318] hover:bg-[#FDEBD6]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{me?.ready ? 'SIAP ✓' : 'TANDAI SIAP'}</span>
          </button>

          {isHost && players.length === 2 ? (
            <button
              type="button"
              onClick={onOpenCharacterPreview}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-[#FFF6EC] border border-[#3B2318]/15 text-[#3B2318] font-display text-xs sm:text-sm font-bold hover:bg-[#FDEBD6] transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[#D97706] shrink-0" />
              <span>ATUR PERAN</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onLeaveRoom}
              data-testid="btn-leave-room"
              className="min-h-[44px] px-3 py-2 rounded-xl bg-[#FFF6EC] border border-[#3B2318]/15 text-[#7C5340] font-display text-xs sm:text-sm font-bold hover:bg-[#FEE2E2] hover:text-[#991B1B] transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>KELUAR ROOM</span>
            </button>
          )}
        </div>

        {isHost && players.length === 2 && (
          <button
            type="button"
            onClick={onLeaveRoom}
            data-testid="btn-leave-room"
            className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-transparent border border-[#3B2318]/12 text-[#7C5340] text-xs font-semibold hover:bg-[#FEE2E2] hover:text-[#991B1B] transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar dari Room</span>
          </button>
        )}
      </div>
    </div>
  );
};
