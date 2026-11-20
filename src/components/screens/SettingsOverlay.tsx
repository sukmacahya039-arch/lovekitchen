import React from 'react';
import { ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import type { AudioSettings, PlayerRole } from '../../shared/types.ts';
import { usePWAInstall } from '../../hooks/usePWAInstall.ts';
import { PWAInstallButton } from '../PWAInstallButton.tsx';

interface Props {
  audio: AudioSettings;
  playerName: string;
  preferredRole: PlayerRole;
  isSignedIn: boolean;
  onUpdateAudio: (patch: Partial<AudioSettings>) => void;
  onTestSound: () => void;
  onChangeName: (name: string) => void;
  onChangePreferredRole: (role: PlayerRole) => void;
  onBack: () => void;
}

export const SettingsOverlay: React.FC<Props> = ({
  audio,
  playerName,
  preferredRole,
  isSignedIn,
  onUpdateAudio,
  onTestSound,
  onChangeName,
  onChangePreferredRole,
  onBack,
}) => {
  const { isInstalled } = usePWAInstall();

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-[#FFFDF9]/96 border border-[#3B2318]/15 p-5 sm:p-7 shadow-2xl">
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
            Pengaturan
          </h2>

          <button
            type="button"
            onClick={() => onUpdateAudio({ muted: !audio.muted })}
            className={`p-2.5 min-w-[42px] min-h-[42px] rounded-xl border transition cursor-pointer ${
              audio.muted
                ? 'bg-[#FEE2E2] border-[#EF4444]/30 text-[#991B1B]'
                : 'bg-[#FFF6EC] border-[#3B2318]/12 text-[#3B2318]'
            }`}
            aria-label={audio.muted ? 'Bunyikan suara' : 'Bisukan suara'}
          >
            {audio.muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>

        {/* Audio Sliders */}
        <div className="mt-5 space-y-4">
          <VolumeSlider
            label="Master Volume"
            value={audio.masterVolume}
            disabled={audio.muted}
            onChange={(v) => onUpdateAudio({ masterVolume: v })}
          />
          <VolumeSlider
            label="Musik Latar (BGM)"
            value={audio.musicVolume}
            disabled={audio.muted}
            onChange={(v) => onUpdateAudio({ musicVolume: v })}
          />
          <VolumeSlider
            label="Efek Suara (SFX)"
            value={audio.sfxVolume}
            disabled={audio.muted}
            onChange={(v) => onUpdateAudio({ sfxVolume: v })}
          />

          <button
            type="button"
            onClick={onTestSound}
            className="w-full min-h-[42px] rounded-xl bg-[#FFF6EC] border border-[#3B2318]/15 text-xs sm:text-sm font-semibold text-[#3B2318] hover:bg-[#FDEBD6] transition cursor-pointer"
          >
            Uji Efek Suara Dapur
          </button>
        </div>

        {/* Player Profile Preferences */}
        <div className="mt-6 pt-5 border-t border-[#3B2318]/10 space-y-3.5">
          <div>
            <label htmlFor="settings-name" className="block text-xs font-semibold text-[#7C5340] mb-1">
              Nama Tampilan {isSignedIn ? '(Tersimpan di Cloud)' : '(Lokal)'}
            </label>
            <input
              id="settings-name"
              type="text"
              maxLength={18}
              value={playerName}
              onChange={(e) => onChangeName(e.target.value)}
              className="w-full rounded-xl bg-[#FFF6EC] border border-[#3B2318]/15 px-3.5 py-2.5 text-sm font-semibold text-[#3B2318]"
            />
          </div>

          <div>
            <span className="block text-xs font-semibold text-[#7C5340] mb-1.5">
              Peran Favorit
            </span>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#FFF6EC] border border-[#3B2318]/12">
              <button
                type="button"
                onClick={() => onChangePreferredRole('chef')}
                className={`min-h-[40px] rounded-lg text-sm font-bold transition cursor-pointer ${
                  preferredRole === 'chef'
                    ? 'bg-[#D97706] text-white shadow-xs'
                    : 'text-[#5C3A28] hover:text-[#3B2318]'
                }`}
              >
                Chef Cowok
              </button>
              <button
                type="button"
                onClick={() => onChangePreferredRole('waiter')}
                className={`min-h-[40px] rounded-lg text-sm font-bold transition cursor-pointer ${
                  preferredRole === 'waiter'
                    ? 'bg-[#EC4899] text-white shadow-xs'
                    : 'text-[#5C3A28] hover:text-[#3B2318]'
                }`}
              >
                Waiter Wanita
              </button>
            </div>
          </div>

          {!isInstalled && (
            <div className="pt-2 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-[#7C5340]">
                Aplikasi Android / iOS PWA
              </span>
              <PWAInstallButton compact />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const VolumeSlider: React.FC<{
  label: string;
  value: number;
  disabled: boolean;
  onChange: (val: number) => void;
}> = ({ label, value, disabled, onChange }) => (
  <div className={disabled ? 'opacity-45' : ''}>
    <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-[#3B2318] mb-1">
      <span>{label}</span>
      <span className="font-mono-num text-[#7C5340]">{Math.round(value * 100)}%</span>
    </div>
    <input
      type="range"
      min={0}
      max={1}
      step={0.05}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-[#FF5A6E] h-2 bg-[#F2DEC8] rounded-lg cursor-pointer"
    />
  </div>
);
