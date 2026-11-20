import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Play,
  UtensilsCrossed,
} from 'lucide-react';
import {
  CHEF_ANIM_SPECS,
  WAITER_ANIM_SPECS,
} from '../../game/systems/character/CharacterAnimations.ts';
import type { CharacterAnimState, PlayerRole, RoomState } from '../../shared/types.ts';

interface Props {
  room: RoomState;
  mySocketId: string | null;
  errorText: string | null;
  previewAnims: Record<PlayerRole, CharacterAnimState>;
  onChangePreviewAnim: (role: PlayerRole, anim: CharacterAnimState) => void;
  onSelectRole: (role: PlayerRole) => void;
  onToggleReady: () => void;
  onStartGame: () => void;
  onLeave: () => void;
}

const CHEF_PORTRAIT = '/src/assets/images/chef_character_card_1795146589720.jpg';
const WAITER_PORTRAIT = '/src/assets/images/waiter_character_card_1795146589105.jpg';

export const CharacterSelectionOverlay: React.FC<Props> = ({
  room,
  mySocketId,
  errorText,
  previewAnims,
  onChangePreviewAnim,
  onSelectRole,
  onToggleReady,
  onStartGame,
  onLeave,
}) => {
  const [chefImgErr, setChefImgErr] = useState(false);
  const [waiterImgErr, setWaiterImgErr] = useState(false);

  const me = room.members.find((m) => m.socketId === mySocketId);
  const chefMember = room.members.find((m) => m.role === 'chef');
  const waiterMember = room.members.find((m) => m.role === 'waiter');

  const isHost = Boolean(mySocketId && room.hostSocketId === mySocketId);
  const allReady =
    room.mode === 'practice'
      ? true
      : room.members.length === 2 &&
        Boolean(chefMember) &&
        Boolean(waiterMember) &&
        room.members.every((m) => m.ready);

  const cycleAnim = (role: PlayerRole, delta: number) => {
    const specs = role === 'chef' ? CHEF_ANIM_SPECS : WAITER_ANIM_SPECS;
    const currentIdx = Math.max(
      0,
      specs.findIndex((s) => s.state === previewAnims[role])
    );
    const nextIdx = (currentIdx + delta + specs.length) % specs.length;
    onChangePreviewAnim(role, specs[nextIdx].state);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="pointer-events-auto w-full max-w-3xl rounded-3xl bg-[#FFFDF9]/92 border border-[#3B2318]/15 p-4 sm:p-5 shadow-2xl backdrop-blur-xs">
        {/* Top Row */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onLeave}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-[#FFF6EC] border border-[#3B2318]/12 text-sm font-semibold text-[#3B2318] hover:bg-[#FDEBD6] transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Keluar</span>
          </button>

          <div className="text-center">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#3B2318]">
              Pilih Peran Karakter
            </h2>
            <p className="text-xs text-[#7C5340]">
              Room <strong className="font-mono-num">{room.code}</strong> ·{' '}
              {room.mode === 'practice' ? 'Mode Solo Practice (Bisa Swap Peran)' : 'Mode Co-Op 2 Pemain'}
            </p>
          </div>

          <div className="w-20" />
        </div>

        {errorText && (
          <div className="mt-3 rounded-xl bg-[#FEE2E2] px-4 py-2 text-xs sm:text-sm font-medium text-[#991B1B]">
            {errorText}
          </div>
        )}

        {/* Two Character Cards */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* PLAYER 1 — CHEF COWOK */}
          <div
            className={`rounded-3xl p-4 border-2 transition ${
              me?.role === 'chef'
                ? 'border-[#D97706] bg-[#FFF8EB] shadow-md'
                : 'border-[#3B2318]/12 bg-white hover:border-[#D97706]/50'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectRole('chef')}
              className="w-full text-left cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border border-[#3B2318]/15 bg-[#FDEBD2] shrink-0">
                  {!chefImgErr ? (
                    <img
                      src={CHEF_PORTRAIT}
                      alt="Player 1 Chef Cowok"
                      referrerPolicy="no-referrer"
                      onError={() => setChefImgErr(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#D97706]">
                      <ChefHat className="w-9 h-9" />
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#B45309]">Player 1 · Dapur</p>
                  <h3 className="font-display text-lg sm:text-xl font-bold text-[#3B2318]">
                    CHEF COWOK
                  </h3>
                  <p className="mt-1 text-xs text-[#6B4432] leading-relaxed">
                    Topi &amp; jaket koki putih, apron cokelat, celana gelap. Masak, goreng, potong &amp; sajikan ke counter.
                  </p>
                </div>
              </div>
            </button>

            {/* Live Phaser 3 Animation Preview Selector */}
            <div className="mt-3 pt-2.5 border-t border-[#3B2318]/10">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => cycleAnim('chef', -1)}
                  aria-label="Animasi Chef sebelumnya"
                  className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg bg-[#FFF6EC] border border-[#3B2318]/12 text-[#3B2318] hover:bg-[#FDEBD6] cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <select
                  aria-label="Pilih animasi Chef"
                  value={previewAnims.chef}
                  onChange={(e) =>
                    onChangePreviewAnim('chef', e.target.value as CharacterAnimState)
                  }
                  className="flex-1 min-h-[34px] rounded-lg bg-[#FFF6EC] border border-[#3B2318]/12 px-2.5 text-xs font-semibold text-[#3B2318] outline-none"
                >
                  {CHEF_ANIM_SPECS.map((spec) => (
                    <option key={spec.state} value={spec.state}>
                      Animasi: {spec.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => cycleAnim('chef', 1)}
                  aria-label="Animasi Chef berikutnya"
                  className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg bg-[#FFF6EC] border border-[#3B2318]/12 text-[#3B2318] hover:bg-[#FDEBD6] cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="mt-2.5 pt-2.5 border-t border-[#3B2318]/10 flex items-center justify-between text-xs font-semibold">
              <span className="text-[#5C3A28]">
                {chefMember
                  ? `${chefMember.name}${chefMember.socketId === mySocketId ? ' (Kamu)' : ''}`
                  : room.mode === 'practice'
                    ? 'Tersedia (Kontrol Bersama)'
                    : 'Belum dipilih'}
              </span>
              {chefMember?.ready && (
                <span className="inline-flex items-center gap-1 text-[#16A34A]">
                  <CheckCircle2 className="w-4 h-4" />
                  READY
                </span>
              )}
            </div>
          </div>

          {/* PLAYER 2 — WAITER WANITA */}
          <div
            className={`rounded-3xl p-4 border-2 transition ${
              me?.role === 'waiter'
                ? 'border-[#EC4899] bg-[#FFF0F6] shadow-md'
                : 'border-[#3B2318]/12 bg-white hover:border-[#EC4899]/50'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectRole('waiter')}
              className="w-full text-left cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border border-[#3B2318]/15 bg-[#FCE7F3] shrink-0">
                  {!waiterImgErr ? (
                    <img
                      src={WAITER_PORTRAIT}
                      alt="Player 2 Waiter Wanita"
                      referrerPolicy="no-referrer"
                      onError={() => setWaiterImgErr(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#EC4899]">
                      <UtensilsCrossed className="w-9 h-9" />
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#BE185D]">Player 2 · Ruang Makan</p>
                  <h3 className="font-display text-lg sm:text-xl font-bold text-[#3B2318]">
                    WAITER WANITA
                  </h3>
                  <p className="mt-1 text-xs text-[#6B4432] leading-relaxed">
                    Rambut ponytail, seragam pink pastel, apron putih &amp; nampan. Catat order, antar makanan, tagih &amp; bersihkan meja.
                  </p>
                </div>
              </div>
            </button>

            {/* Live Phaser 3 Animation Preview Selector */}
            <div className="mt-3 pt-2.5 border-t border-[#3B2318]/10">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => cycleAnim('waiter', -1)}
                  aria-label="Animasi Waiter sebelumnya"
                  className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg bg-[#FFF0F6] border border-[#3B2318]/12 text-[#3B2318] hover:bg-[#FCE7F3] cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <select
                  aria-label="Pilih animasi Waiter"
                  value={previewAnims.waiter}
                  onChange={(e) =>
                    onChangePreviewAnim('waiter', e.target.value as CharacterAnimState)
                  }
                  className="flex-1 min-h-[34px] rounded-lg bg-[#FFF0F6] border border-[#3B2318]/12 px-2.5 text-xs font-semibold text-[#3B2318] outline-none"
                >
                  {WAITER_ANIM_SPECS.map((spec) => (
                    <option key={spec.state} value={spec.state}>
                      Animasi: {spec.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => cycleAnim('waiter', 1)}
                  aria-label="Animasi Waiter berikutnya"
                  className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg bg-[#FFF0F6] border border-[#3B2318]/12 text-[#3B2318] hover:bg-[#FCE7F3] cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="mt-2.5 pt-2.5 border-t border-[#3B2318]/10 flex items-center justify-between text-xs font-semibold">
              <span className="text-[#5C3A28]">
                {waiterMember
                  ? `${waiterMember.name}${waiterMember.socketId === mySocketId ? ' (Kamu)' : ''}`
                  : room.mode === 'practice'
                    ? 'Tersedia (Kontrol Bersama)'
                    : 'Belum dipilih'}
              </span>
              {waiterMember?.ready && (
                <span className="inline-flex items-center gap-1 text-[#16A34A]">
                  <CheckCircle2 className="w-4 h-4" />
                  READY
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Action Row */}
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          {room.mode === 'coop' && (
            <button
              type="button"
              onClick={onToggleReady}
              className={`w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-2xl font-display text-base font-bold transition cursor-pointer ${
                me?.ready
                  ? 'bg-[#16A34A] text-white hover:bg-[#15803D]'
                  : 'bg-[#FFF6EC] border-2 border-[#3B2318]/20 text-[#3B2318] hover:bg-[#FDEBD6]'
              }`}
            >
              {me?.ready ? 'SIAP (Batalkan Ready)' : 'KLIK READY'}
            </button>
          )}

          {isHost ? (
            <button
              type="button"
              onClick={onStartGame}
              disabled={!allReady}
              className="w-full sm:flex-1 min-h-[48px] px-6 py-3 rounded-2xl bg-[#FF5A6E] text-white font-display text-base font-bold shadow-md hover:bg-[#E8485C] disabled:opacity-45 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-5 h-5" />
              <span>
                {allReady ? 'MULAI BUKA RESTORAN!' : 'Menunggu Semua Pemain READY...'}
              </span>
            </button>
          ) : (
            <div className="text-sm font-semibold text-[#7C5340]">
              {allReady ? 'Semua siap! Menunggu Host memulai...' : 'Pilih peran lalu tekan READY.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
