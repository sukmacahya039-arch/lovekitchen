import React, { useEffect, useState } from 'react';
import { Download, Loader2, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';
import { PWAInstallModal } from './PWAInstallModal.tsx';

/**
 * Direct-install PWA button for header & settings.
 * - Completely hidden when app is already installed / running in standalone mode.
 * - Triggers the real native browser install dialog directly on tap when `beforeinstallprompt` is available.
 * - Prevents duplicate clicks while installing.
 * - Opens honest fallback modal ONLY when native prompt is unavailable.
 */
export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { state, isInstalled, canPromptNative, isInstalling, install } = usePWAInstall();
  const [modalOpen, setModalOpen] = useState(false);

  // Close modal automatically once real installation completes
  useEffect(() => {
    if (state === 'INSTALLED' || state === 'ALREADY_INSTALLED') {
      setModalOpen(false);
    }
  }, [state]);

  // Never show browser install UI when already installed / standalone
  if (isInstalled) {
    return null;
  }

  // Installing state: prevent duplicate prompts
  if (isInstalling) {
    return (
      <button
        type="button"
        disabled
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#3B2318]/80 text-white font-semibold shadow-sm whitespace-nowrap shrink-0 cursor-wait ${
          compact ? 'px-3 py-2 text-xs min-h-[40px]' : 'px-4 py-2.5 text-sm min-h-[44px]'
        }`}
      >
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        <span>Menyiapkan Love Kitchen...</span>
      </button>
    );
  }

  // Native installation available: 1-tap triggers real browser prompt directly
  if (canPromptNative && state === 'INSTALL_AVAILABLE') {
    return (
      <button
        type="button"
        onClick={() => void install()}
        data-testid="pwa-direct-install-btn"
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5A6E] text-white font-display font-bold shadow-sm hover:bg-[#EB465B] active:scale-95 transition whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'px-3.5 py-2 text-xs sm:text-sm min-h-[40px]' : 'px-4 py-2.5 text-sm min-h-[44px]'
        }`}
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>Install Love Kitchen</span>
      </button>
    );
  }

  // Fallback entry button when native prompt is unavailable or previously dismissed
  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        data-testid="pwa-fallback-install-btn"
        className={`inline-flex items-center justify-center gap-2 rounded-xl border border-[#3B2318]/18 bg-white/90 text-[#3B2318] font-semibold hover:bg-white active:scale-95 transition whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'px-3 py-2 text-xs min-h-[40px]' : 'px-4 py-2.5 text-sm min-h-[44px]'
        }`}
      >
        <Smartphone className="w-4 h-4 text-[#FF5A6E] shrink-0" />
        <span>Install App</span>
      </button>

      <PWAInstallModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};

/**
 * Non-intrusive Main Menu install card shown ONLY when the browser confirms
 * real native installability (`INSTALL_AVAILABLE`) and the user has not dismissed it
 * in the current session. Never forces a modal on load and hides instantly when installed.
 */
export const PWAInstallBanner: React.FC = () => {
  const {
    state,
    isInstalled,
    canPromptNative,
    isInstalling,
    dismissedInSession,
    install,
    dismiss,
  } = usePWAInstall();

  if (isInstalled || dismissedInSession) {
    return null;
  }

  if (state !== 'INSTALL_AVAILABLE' && state !== 'INSTALLING') {
    return null;
  }

  if (!canPromptNative && !isInstalling) {
    return null;
  }

  return (
    <div
      data-testid="pwa-install-banner"
      className="rounded-2xl bg-[#FFFDF9]/95 border border-[#FF5A6E]/25 px-4 py-3 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <img
          src="/pwa-192x192.png"
          alt="Ikon Love Kitchen"
          width={44}
          height={44}
          className="w-11 h-11 rounded-xl border border-[#3B2318]/12 bg-[#FFF6EC] shrink-0"
        />
        <div className="min-w-0">
          <p className="font-display text-sm sm:text-base font-bold text-[#3B2318] leading-tight">
            INSTALL LOVE KITCHEN
          </p>
          <p className="text-xs text-[#6B4432] leading-snug mt-0.5">
            Masak, layani pelanggan, dan main bareng pasangan langsung dari HP.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          disabled={isInstalling}
          onClick={() => void install()}
          data-testid="pwa-banner-install-now"
          className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 rounded-xl bg-[#FF5A6E] text-white font-display text-xs sm:text-sm font-bold shadow-xs hover:bg-[#EB465B] active:scale-[0.98] disabled:opacity-75 transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          {isInstalling ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Menyiapkan Love Kitchen...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4 shrink-0" />
              <span>INSTALL SEKARANG</span>
            </>
          )}
        </button>

        {!isInstalling && (
          <button
            type="button"
            onClick={dismiss}
            data-testid="pwa-banner-later"
            className="min-h-[44px] px-3 py-2 rounded-xl bg-[#FFF6EC] border border-[#3B2318]/12 text-[#6B4432] font-display text-xs font-bold hover:bg-[#FDEBD6] transition whitespace-nowrap cursor-pointer"
          >
            NANTI SAJA
          </button>
        )}
      </div>
    </div>
  );
};
