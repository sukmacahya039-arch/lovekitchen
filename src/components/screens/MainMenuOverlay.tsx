import React, { useState } from 'react';
import {
  BookOpen,
  ChefHat,
  Globe,
  Heart,
  LogIn,
  LogOut,
  PlusCircle,
  Settings,
  Users,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { PlayerProfileData } from '../../shared/types.ts';
import { PWAInstallButton } from '../PWAInstallButton.tsx';

interface Props {
  user: User | null;
  profile: PlayerProfileData | null;
  playerName: string;
  onPlayerNameChange: (name: string) => void;
  onPlayOnline: () => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onOpenSettings: () => void;
  onOpenHowToPlay: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

const HERO_ART_SRC = '/src/assets/images/love_kitchen_hero_1795146589383.jpg';

export const MainMenuOverlay: React.FC<Props> = ({
  user,
  profile,
  playerName,
  onPlayerNameChange,
  onPlayOnline,
  onCreateRoom,
  onJoinRoom,
  onOpenSettings,
  onOpenHowToPlay,
  onSignIn,
  onSignOut,
}) => {
  const [heroError, setHeroError] = useState(false);

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-between overflow-y-auto px-4 py-3 sm:px-8 sm:py-5">
      {/* Top 3-Zone Header Bar */}
      <header className="w-full max-w-6xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-[#FF5A6E] text-white flex items-center justify-center shadow-sm">
            <ChefHat className="w-5 h-5" />
          </div>
          <span className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[#3B2318] whitespace-nowrap">
            LOVE KITCHEN
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <PWAInstallButton compact />
          {user ? (
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-2 px-3 py-2 min-h-[40px] rounded-xl bg-white/90 border border-[#3B2318]/15 text-xs sm:text-sm font-semibold text-[#3B2318] hover:bg-white transition whitespace-nowrap shrink-0 cursor-pointer"
              title="Keluar akun Google"
            >
              <span className="max-w-[110px] truncate">{profile?.displayName || user.displayName || 'Player'}</span>
              <LogOut className="w-4 h-4 text-[#7C5340]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-white/90 border border-[#3B2318]/15 text-xs sm:text-sm font-semibold text-[#3B2318] hover:bg-white transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="w-4 h-4 text-[#FF5A6E]" />
              <span>Simpan Progres</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Centered Split Showcase */}
      <main className="w-full max-w-6xl mx-auto my-auto py-3 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-center">
        {/* Left: Hero Character Art & Logo */}
        <section className="lg:col-span-7 flex flex-col gap-3">
          <div className="relative w-full aspect-16/9 rounded-3xl overflow-hidden border-2 border-[#3B2318]/15 bg-[#FFE8D8] shadow-xl">
            {!heroError ? (
              <img
                src={HERO_ART_SRC}
                alt="Chef dan Waiter Love Kitchen 2.5D Isometric Cartoon"
                referrerPolicy="no-referrer"
                onError={() => setHeroError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#FF8A7A] to-[#FF5A6E] text-white p-6 text-center">
                <Heart className="w-12 h-12 fill-white" />
                <p className="mt-2 font-display text-2xl font-bold">LOVE KITCHEN</p>
                <p className="text-sm opacity-90">Chef Cowok & Waiter Wanita Co-Op Rush</p>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#2A160E]/85 via-[#2A160E]/40 to-transparent px-5 pb-4 pt-10 text-white">
              <h1 className="font-display text-2xl sm:text-4xl font-bold leading-tight text-balance">
                LOVE KITCHEN
              </h1>
              <p className="text-xs sm:text-sm text-[#FFF0E6]/90 mt-0.5">
                2.5D Co-Op Restaurant Rush · 2 Pemain (Chef &amp; Waiter)
              </p>
            </div>
          </div>

          {profile && profile.gamesPlayed > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs sm:text-sm font-medium text-[#6B4432]">
              <span>
                Skor Terbaik:{' '}
                <strong className="font-mono-num text-[#3B2318]">${profile.bestScore}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Shift Selesai:{' '}
                <strong className="font-mono-num text-[#3B2318]">{profile.gamesPlayed}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Total Pesanan:{' '}
                <strong className="font-mono-num text-[#3B2318]">{profile.totalOrdersServed}</strong>
              </span>
            </div>
          )}
        </section>

        {/* Right: Name Input + 5 Core Menu Actions */}
        <section className="lg:col-span-5 rounded-3xl bg-[#FFFDF9]/95 border border-[#3B2318]/12 p-5 sm:p-6 shadow-xl">
          <div className="mb-4">
            <label
              htmlFor="player-name-input"
              className="block text-xs font-semibold text-[#7C5340] mb-1.5"
            >
              Nama Pemain
            </label>
            <input
              id="player-name-input"
              type="text"
              maxLength={18}
              value={playerName}
              onChange={(e) => onPlayerNameChange(e.target.value)}
              placeholder="Contoh: Chef Leo"
              className="w-full rounded-xl bg-[#FFF6EC] border border-[#3B2318]/15 px-3.5 py-2.5 text-sm font-semibold text-[#3B2318] focus:outline-none focus:ring-2 focus:ring-[#FF5A6E]"
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onPlayOnline}
              className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-[#FF5A6E] text-white font-display text-base sm:text-lg font-bold shadow-md hover:bg-[#EB465B] active:scale-[0.98] transition flex items-center justify-center gap-2.5 whitespace-nowrap cursor-pointer"
            >
              <Globe className="w-5 h-5 shrink-0" />
              <span>PLAY ONLINE</span>
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onCreateRoom}
                className="min-h-[46px] px-3 py-2.5 rounded-2xl bg-[#F59E0B] text-white font-display text-sm sm:text-base font-bold shadow-sm hover:bg-[#D97706] active:scale-[0.98] transition flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <PlusCircle className="w-4 h-4 shrink-0" />
                <span>CREATE ROOM</span>
              </button>

              <button
                type="button"
                onClick={onJoinRoom}
                className="min-h-[46px] px-3 py-2.5 rounded-2xl bg-[#3B2318] text-white font-display text-sm sm:text-base font-bold shadow-sm hover:bg-[#523224] active:scale-[0.98] transition flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>JOIN ROOM</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={onOpenSettings}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-[#FFF6EC] border border-[#3B2318]/15 text-[#3B2318] font-semibold text-sm hover:bg-[#FDEBD6] active:scale-[0.98] transition flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <Settings className="w-4 h-4 text-[#8C5338] shrink-0" />
                <span>SETTINGS</span>
              </button>

              <button
                type="button"
                onClick={onOpenHowToPlay}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-[#FFF6EC] border border-[#3B2318]/15 text-[#3B2318] font-semibold text-sm hover:bg-[#FDEBD6] active:scale-[0.98] transition flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <BookOpen className="w-4 h-4 text-[#FF5A6E] shrink-0" />
                <span>HOW TO PLAY</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full max-w-6xl mx-auto text-center text-xs text-[#7C5340]/85 pt-1">
        Love Kitchen · Phaser 3 2.5D Isometric Co-Op · Optimized for Android Landscape 16:9
      </footer>
    </div>
  );
};
