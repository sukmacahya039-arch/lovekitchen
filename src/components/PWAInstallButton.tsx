import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#3B2318] text-white font-semibold shadow-sm hover:bg-[#563526] active:scale-95 transition whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'px-3 py-2 text-xs min-h-[40px]' : 'px-4 py-2.5 text-sm min-h-[44px]'
        }`}
      >
        <Download className="w-4 h-4" />
        <span>Install PWA</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border border-[#3B2318]/20 bg-white/90 text-[#3B2318] font-semibold hover:bg-white active:scale-95 transition whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'px-3 py-2 text-xs min-h-[40px]' : 'px-4 py-2.5 text-sm min-h-[44px]'
        }`}
      >
        <Smartphone className="w-4 h-4 text-[#FF5A6E]" />
        <span>{isIOS ? 'Install iOS' : 'Install App'}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#3B2318]/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#FFFDF9] border-2 border-[#3B2318]/15 p-6 shadow-2xl text-[#3B2318]">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-display text-xl font-bold">Install Love Kitchen</h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-2 rounded-lg hover:bg-[#3B2318]/5 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {isIOS ? (
              <p className="mt-3 text-sm leading-relaxed text-[#5C3A28]">
                1. Ketuk tombol <strong>Share</strong> di bilah Safari.<br />
                2. Gulir ke bawah lalu pilih <strong>Add to Home Screen</strong>.<br />
                3. Luncurkan Love Kitchen layar penuh seperti aplikasi native.
              </p>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-[#5C3A28]">
                Di Chrome Android / Desktop, buka menu browser (ikon ⋮) lalu pilih{' '}
                <strong>Install App</strong> atau <strong>Add to Home screen</strong> untuk
                memainkan Love Kitchen sebagai aplikasi PWA layar penuh.
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full rounded-xl bg-[#FF5A6E] py-2.5 text-sm font-bold text-white hover:bg-[#E8485C] transition cursor-pointer"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
};
