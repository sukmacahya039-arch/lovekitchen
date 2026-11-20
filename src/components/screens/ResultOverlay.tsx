import React from 'react';
import { Home, RotateCcw, Star, Trophy } from 'lucide-react';
import type { MatchSummary } from '../../shared/types.ts';
import type { LeaderboardRow } from '../../services/playerDataService.ts';

interface Props {
  summary: MatchSummary;
  leaderboard: LeaderboardRow[];
  isSignedIn: boolean;
  onRematch: () => void;
  onMainMenu: () => void;
}

export const ResultOverlay: React.FC<Props> = ({
  summary,
  leaderboard,
  isSignedIn,
  onRematch,
  onMainMenu,
}) => {
  const headline =
    summary.stars === 3
      ? 'Luar Biasa! Restoran Bintang 3!'
      : summary.stars === 2
        ? 'Kerja Sama Hebat!'
        : summary.stars === 1
          ? 'Shift Selesai!'
          : 'Ayo Coba Lebih Cepat Lagi!';

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-[#FFFDF9]/96 border border-[#3B2318]/15 p-5 sm:p-7 shadow-2xl">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3].map((n) => (
              <Star
                key={n}
                className={`w-10 h-10 sm:w-12 sm:h-12 transition-transform ${
                  n <= summary.stars
                    ? 'fill-[#F59E0B] text-[#D97706] scale-105'
                    : 'text-[#E6D5C7]'
                }`}
              />
            ))}
          </div>

          <h2 className="mt-3 font-display text-2xl sm:text-3xl font-bold text-[#3B2318]">
            {headline}
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-[#7C5340]">
            Chef: <strong>{summary.chefName}</strong> · Waiter:{' '}
            <strong>{summary.waiterName}</strong>
          </p>
        </div>

        {/* Score & Key Shift Metrics */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-[#FFF6EC] p-3 text-center">
            <p className="text-xs font-medium text-[#7C5340]">Total Pendapatan</p>
            <p className="mt-1 font-mono-num text-xl font-bold text-[#15803D]">
              ${summary.score}
            </p>
          </div>
          <div className="rounded-2xl bg-[#FFF6EC] p-3 text-center">
            <p className="text-xs font-medium text-[#7C5340]">Pesanan Sukses</p>
            <p className="mt-1 font-mono-num text-xl font-bold text-[#3B2318]">
              {summary.ordersCompleted}
            </p>
          </div>
          <div className="rounded-2xl bg-[#FFF6EC] p-3 text-center">
            <p className="text-xs font-medium text-[#7C5340]">Bonus Tip</p>
            <p className="mt-1 font-mono-num text-xl font-bold text-[#D97706]">
              +${summary.tipsEarned}
            </p>
          </div>
          <div className="rounded-2xl bg-[#FFF6EC] p-3 text-center">
            <p className="text-xs font-medium text-[#7C5340]">Gosong / Gagal</p>
            <p className="mt-1 font-mono-num text-xl font-bold text-[#DC2626]">
              {summary.ordersBurned} / {summary.customersLost}
            </p>
          </div>
        </div>

        {/* Firestore Top Co-Op Leaderboard */}
        {isSignedIn && leaderboard.length > 0 && (
          <div className="mt-5 rounded-2xl bg-[#FFF6EC]/70 border border-[#3B2318]/10 p-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[#3B2318] mb-2">
              <Trophy className="w-4 h-4 text-[#D97706]" />
              <span>Papan Skor Global Love Kitchen</span>
            </div>
            <div className="space-y-1.5 max-h-28 overflow-y-auto">
              {leaderboard.slice(0, 5).map((row, idx) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between text-xs text-[#5C3A28]"
                >
                  <span className="truncate">
                    <strong className="font-mono-num mr-1.5">{idx + 1}.</strong>
                    {row.displayName} &amp; {row.partnerName}
                  </span>
                  <span className="font-mono-num font-bold text-[#3B2318] shrink-0">
                    ${row.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onRematch}
            className="flex-1 min-h-[48px] rounded-2xl bg-[#FF5A6E] text-white font-display text-base font-bold hover:bg-[#E8485C] transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" />
            <span>Main Lagi (Rematch)</span>
          </button>

          <button
            type="button"
            onClick={onMainMenu}
            className="flex-1 min-h-[48px] rounded-2xl bg-[#FFF6EC] border border-[#3B2318]/15 text-[#3B2318] font-display text-base font-bold hover:bg-[#FDEBD6] transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home className="w-5 h-5" />
            <span>Menu Utama</span>
          </button>
        </div>
      </div>
    </div>
  );
};
