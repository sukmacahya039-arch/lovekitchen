import React from 'react';
import { Home, Play, Settings } from 'lucide-react';

interface Props {
  pausedBy: string | null;
  onResume: () => void;
  onOpenSettings: () => void;
  onLeaveToMenu: () => void;
}

export const PauseOverlay: React.FC<Props> = ({
  pausedBy,
  onResume,
  onOpenSettings,
  onLeaveToMenu,
}) => {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-[#FFFDF9] border border-[#3B2318]/15 p-6 shadow-2xl text-center">
        <h2 className="font-display text-2xl font-bold text-[#3B2318]">Permainan Dijeda</h2>
        {pausedBy && (
          <p className="mt-1 text-xs font-medium text-[#7C5340]">
            Dijeda oleh {pausedBy}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full min-h-[48px] rounded-2xl bg-[#FF5A6E] text-white font-display text-base font-bold hover:bg-[#E8485C] transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-5 h-5" />
            <span>Lanjutkan Shift</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full min-h-[46px] rounded-2xl bg-[#FFF6EC] border border-[#3B2318]/15 text-[#3B2318] font-semibold text-sm hover:bg-[#FDEBD6] transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Settings className="w-4 h-4 text-[#8C5338]" />
            <span>Pengaturan Suara</span>
          </button>

          <button
            type="button"
            onClick={onLeaveToMenu}
            className="w-full min-h-[46px] rounded-2xl bg-white border border-[#3B2318]/15 text-[#7C5340] font-semibold text-sm hover:bg-[#FEE2E2] hover:text-[#991B1B] transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Kembali ke Menu Utama</span>
          </button>
        </div>
      </div>
    </div>
  );
};
