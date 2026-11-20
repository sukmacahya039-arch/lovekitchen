import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Loader2,
  Play,
  Users,
} from 'lucide-react';
import type { RoomState } from '../../shared/types.ts';
import type { LobbyMode } from '../../game/systems/ui/GameBridge.ts';

interface Props {
  mode: LobbyMode;
  room: RoomState | null;
  mySocketId: string | null;
  isSearchingMatch: boolean;
  errorText: string | null;
  onBack: () => void;
  onJoinCode: (code: string) => void;
  onCreateCoopRoom: () => void;
  onStartSoloPractice: () => void;
  onStartMatchmaking: () => void;
  onCancelMatchmaking: () => void;
  onProceedCharacterSelect: () => void;
}

export const LobbyOverlay: React.FC<Props> = ({
  mode,
  room,
  mySocketId,
  isSearchingMatch,
  errorText,
  onBack,
  onJoinCode,
  onCreateCoopRoom,
  onStartSoloPractice,
  onStartMatchmaking,
  onCancelMatchmaking,
  onProceedCharacterSelect,
}) => {
  const [joinInput, setJoinInput] = useState('');
  const [copied, setCopied] = useState(false);

  const isHost = Boolean(room && mySocketId && room.hostSocketId === mySocketId);
  const canProceed = Boolean(room && room.members.length === 2);

  const handleCopyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-xl rounded-3xl bg-[#FFFDF9]/95 border border-[#3B2318]/15 p-5 sm:p-7 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-[#FFF6EC] border border-[#3B2318]/12 text-sm font-semibold text-[#3B2318] hover:bg-[#FDEBD6] transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali</span>
          </button>

          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#3B2318]">
            {mode === 'online'
              ? 'Play Online'
              : mode === 'join'
                ? 'Join Room'
                : 'Lobby Room'}
          </h2>
          <div className="w-20" />
        </div>

        {errorText && (
          <div
            role="alert"
            className="mt-4 rounded-xl bg-[#FEE2E2] border border-[#EF4444]/30 px-4 py-2.5 text-sm font-medium text-[#991B1B]"
          >
            {errorText}
          </div>
        )}

        {/* Mode: PLAY ONLINE Matchmaking */}
        {mode === 'online' && !room && (
          <div className="mt-6 text-center">
            {isSearchingMatch ? (
              <div className="py-6 flex flex-col items-center">
                <Loader2 className="w-11 h-11 text-[#FF5A6E] animate-spin" />
                <p className="mt-4 font-display text-lg font-bold text-[#3B2318]">
                  Mencari Partner Co-Op Online...
                </p>
                <p className="mt-1 text-sm text-[#7C5340] max-w-sm">
                  Server Socket.IO akan langsung memasangkan kamu dengan pemain lain yang
                  mengantre secara real-time.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={onCancelMatchmaking}
                    className="px-5 py-2.5 min-h-[44px] rounded-xl bg-[#FFF6EC] border border-[#3B2318]/15 text-sm font-semibold text-[#3B2318] hover:bg-[#FDEBD6] cursor-pointer"
                  >
                    Batalkan Antrean
                  </button>
                  <button
                    type="button"
                    onClick={onStartSoloPractice}
                    className="px-5 py-2.5 min-h-[44px] rounded-xl bg-[#F59E0B] text-white text-sm font-bold hover:bg-[#D97706] cursor-pointer"
                  >
                    Latihan Solo (Switch Role)
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-4 flex flex-col items-center gap-3.5">
                <p className="text-sm text-[#6B4432]">
                  Masuk antrean matchmaking real-time untuk dipasangkan dengan 1 partner.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={onStartMatchmaking}
                    className="px-7 py-3 min-h-[48px] rounded-2xl bg-[#FF5A6E] text-white font-display text-base font-bold hover:bg-[#E8485C] transition cursor-pointer"
                  >
                    Cari Partner Sekarang
                  </button>
                  <button
                    type="button"
                    onClick={onStartSoloPractice}
                    className="px-5 py-3 min-h-[48px] rounded-2xl bg-[#F59E0B] text-white font-display text-sm sm:text-base font-bold hover:bg-[#D97706] transition cursor-pointer"
                  >
                    Main Latihan Solo
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mode: JOIN ROOM Form */}
        {mode === 'join' && !room && (
          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (joinInput.trim()) onJoinCode(joinInput.trim().toUpperCase());
            }}
          >
            <div>
              <label
                htmlFor="room-code-input"
                className="block text-xs font-semibold text-[#7C5340] mb-1.5"
              >
                Masukkan Kode Room (6 karakter)
              </label>
              <input
                id="room-code-input"
                type="text"
                maxLength={8}
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                placeholder="Contoh: LK4X9A"
                className="w-full rounded-2xl bg-[#FFF6EC] border-2 border-[#3B2318]/15 px-4 py-3.5 text-center font-mono-num text-2xl font-bold tracking-[0.2em] text-[#3B2318] uppercase focus:outline-none focus:border-[#FF5A6E]"
              />
            </div>

            <button
              type="submit"
              disabled={joinInput.trim().length < 4}
              className="w-full min-h-[48px] rounded-2xl bg-[#FF5A6E] text-white font-display text-base font-bold hover:bg-[#E8485C] disabled:opacity-45 transition cursor-pointer"
            >
              Masuk ke Room
            </button>
          </form>
        )}

        {/* Active Room Waiting View */}
        {room && (
          <div className="mt-5 flex flex-col gap-5">
            <div className="rounded-2xl bg-[#FFF6EC] border border-[#3B2318]/12 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#7C5340]">Kode Room Multiplayer</p>
                <p className="font-mono-num text-3xl font-bold tracking-[0.18em] text-[#3B2318]">
                  {room.code}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleCopyCode()}
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-white border border-[#3B2318]/15 text-sm font-semibold text-[#3B2318] hover:bg-[#FDEBD6] transition cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-[#16A34A]" />
                    <span>Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-[#FF5A6E]" />
                    <span>Salin Kode</span>
                  </>
                )}
              </button>
            </div>

            {/* Real Connected Players */}
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-[#7C5340] mb-2">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  Pemain Terhubung
                </span>
                <span className="font-mono-num">
                  {room.members.length} / {room.maxPlayers}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[0, 1].map((slotIdx) => {
                  const member = room.members[slotIdx];
                  return (
                    <div
                      key={slotIdx}
                      className={`rounded-2xl p-3.5 border ${
                        member
                          ? 'bg-white border-[#3B2318]/15'
                          : 'bg-[#FFF6EC]/60 border-dashed border-[#3B2318]/20'
                      }`}
                    >
                      {member ? (
                        <div>
                          <p className="font-display font-bold text-[#3B2318] truncate">
                            {member.name}
                            {member.socketId === mySocketId ? ' (Kamu)' : ''}
                          </p>
                          <p className="text-xs text-[#7C5340] mt-0.5">
                            {member.isHost ? 'Host Room' : 'Partner Co-Op'} · Terhubung
                          </p>
                        </div>
                      ) : (
                        <div className="text-xs text-[#8C6754] py-1">
                          Menunggu Pemain 2 bergabung menggunakan kode{' '}
                          <strong className="font-mono-num">{room.code}</strong>...
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              {isHost && canProceed && (
                <button
                  type="button"
                  onClick={onProceedCharacterSelect}
                  className="flex-1 min-h-[48px] px-5 py-3 rounded-2xl bg-[#FF5A6E] text-white font-display text-base font-bold hover:bg-[#E8485C] transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Pilih Karakter (Chef &amp; Waiter)</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              )}

              {!canProceed && (
                <button
                  type="button"
                  onClick={onStartSoloPractice}
                  className="flex-1 min-h-[46px] px-4 py-2.5 rounded-2xl bg-[#F59E0B] text-white font-display text-sm sm:text-base font-bold hover:bg-[#D97706] transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  <span>Coba Solo Practice (Kontrol Chef &amp; Waiter)</span>
                </button>
              )}

              {!isHost && canProceed && (
                <div className="flex-1 text-center py-3 text-sm font-semibold text-[#7C5340]">
                  Menunggu Host melanjutkan ke Pemilihan Karakter...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Fallback Create Room button if somehow in create mode without room */}
        {mode === 'create' && !room && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={onCreateCoopRoom}
              className="px-6 py-3 min-h-[48px] rounded-2xl bg-[#FF5A6E] text-white font-display font-bold hover:bg-[#E8485C] cursor-pointer"
            >
              Buat Room Baru
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
