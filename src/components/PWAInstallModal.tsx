import React from 'react';
import {
  CheckCircle2,
  Download,
  Info,
  Loader2,
  Share,
  Smartphone,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<Props> = ({ open, onClose }) => {
  const {
    state,
    canPromptNative,
    isInstalling,
    platform,
    unavailableReason,
    lastError,
    install,
    dismiss,
  } = usePWAInstall();

  if (!open || state === 'ALREADY_INSTALLED') {
    return null;
  }

  const handleInstallNow = async () => {
    const result = await install();
    if (result === 'dismissed') {
      onClose();
    }
  };

  const handleLater = () => {
    dismiss();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2A160E]/60 backdrop-blur-xs p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isInstalling) {
          handleLater();
        }
      }}
    >
      <div className="w-full max-w-md rounded-3xl bg-[#FFFDF9] border-2 border-[#3B2318]/15 p-5 sm:p-6 shadow-2xl text-[#3B2318]">
        {/* Header with Real App Icon */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <img
              src="/pwa-192x192.png"
              alt="Ikon Aplikasi Love Kitchen"
              width={52}
              height={52}
              className="w-13 h-13 rounded-2xl border border-[#3B2318]/12 shadow-sm shrink-0 bg-[#FFF6EC]"
            />
            <div className="min-w-0">
              <h2
                id="pwa-install-modal-title"
                className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#3B2318] leading-tight"
              >
                INSTALL LOVE KITCHEN
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm text-[#6B4432] leading-snug">
                Masak, layani pelanggan, dan main bareng pasangan langsung dari HP.
              </p>
            </div>
          </div>

          {!isInstalling && (
            <button
              type="button"
              onClick={handleLater}
              aria-label="Tutup"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#7C5340] hover:bg-[#3B2318]/6 transition cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* State: INSTALLED (Confirmed by browser `appinstalled`) */}
        {state === 'INSTALLED' && (
          <div className="mt-5 rounded-2xl bg-[#ECFDF5] border border-[#16A34A]/25 p-4 text-center">
            <CheckCircle2 className="w-10 h-10 text-[#16A34A] mx-auto" />
            <p className="mt-2 font-display text-base font-bold text-[#14532D]">
              Love Kitchen berhasil di-install!
            </p>
            <p className="mt-1 text-xs text-[#166534]">
              Buka Love Kitchen langsung dari layar utama HP kamu kapan saja.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full min-h-[46px] rounded-2xl bg-[#16A34A] text-white font-display text-sm font-bold hover:bg-[#15803D] transition cursor-pointer"
            >
              Mulai Bermain
            </button>
          </div>
        )}

        {/* State: INSTALLING (Native prompt active or awaiting browser confirmation) */}
        {state === 'INSTALLING' && (
          <div className="mt-5 rounded-2xl bg-[#FFF6EC] border border-[#3B2318]/12 p-5 flex flex-col items-center text-center">
            <Loader2 className="w-9 h-9 text-[#FF5A6E] animate-spin" />
            <p className="mt-3 font-display text-base font-bold text-[#3B2318]">
              Menyiapkan Love Kitchen...
            </p>
            <p className="mt-1 text-xs text-[#7C5340]">
              Konfirmasi dialog install browser untuk menyelesaikan pemasangan aplikasi.
            </p>
          </div>
        )}

        {/* State: INSTALL_AVAILABLE (Real native browser prompt ready) */}
        {state === 'INSTALL_AVAILABLE' && canPromptNative && (
          <div className="mt-5 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => void handleInstallNow()}
              data-testid="pwa-modal-install-now"
              className="w-full min-h-[50px] px-5 py-3 rounded-2xl bg-[#FF5A6E] text-white font-display text-base font-bold shadow-md hover:bg-[#EB465B] active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-5 h-5 shrink-0" />
              <span>INSTALL SEKARANG</span>
            </button>

            <button
              type="button"
              onClick={handleLater}
              data-testid="pwa-modal-later"
              className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#FFF6EC] border border-[#3B2318]/15 text-[#5C3A28] font-display text-sm font-bold hover:bg-[#FDEBD6] transition cursor-pointer"
            >
              NANTI SAJA
            </button>
          </div>
        )}

        {/* State: UNAVAILABLE / DISMISSED (Honest fallback — no fake install button) */}
        {(state === 'UNAVAILABLE' || state === 'DISMISSED') && (
          <div className="mt-4 space-y-3.5">
            <div className="rounded-2xl bg-[#FFF6EC] border border-[#3B2318]/12 p-3.5 text-xs sm:text-sm text-[#5C3A28] leading-relaxed flex items-start gap-2.5">
              <Info className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-[#3B2318]">
                  Install langsung belum tersedia di browser ini
                </p>
                <p className="mt-1 text-xs text-[#6B4432]">
                  {lastError || unavailableReason}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-[#3B2318]/12 p-3.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#3B2318] mb-2">
                {platform === 'ios-safari' ? (
                  <Share className="w-4 h-4 text-[#FF5A6E]" />
                ) : (
                  <Smartphone className="w-4 h-4 text-[#FF5A6E]" />
                )}
                <span>
                  {platform === 'ios-safari'
                    ? 'Panduan Pemasangan iOS Safari'
                    : platform === 'android-chrome'
                      ? 'Panduan Alternatif Android Chrome'
                      : 'Panduan Alternatif Browser'}
                </span>
              </div>

              {platform === 'ios-safari' ? (
                <ol className="list-decimal list-inside space-y-1 text-xs text-[#5C3A28] leading-relaxed">
                  <li>
                    Ketuk ikon <strong>Share</strong> di bilah bawah Safari.
                  </li>
                  <li>
                    Gulir ke bawah lalu pilih <strong>Add to Home Screen</strong>.
                  </li>
                  <li>
                    Ketuk <strong>Add</strong> untuk memasang Love Kitchen ke layar utama.
                  </li>
                </ol>
              ) : platform === 'android-chrome' ? (
                <ol className="list-decimal list-inside space-y-1 text-xs text-[#5C3A28] leading-relaxed">
                  <li>
                    Buka menu Chrome (ikon <strong>⋮</strong> di pojok kanan atas).
                  </li>
                  <li>
                    Pilih <strong>Install app</strong> atau <strong>Add to Home screen</strong>.
                  </li>
                  <li>Konfirmasi pemasangan untuk meluncurkan Love Kitchen layar penuh.</li>
                </ol>
              ) : (
                <ol className="list-decimal list-inside space-y-1 text-xs text-[#5C3A28] leading-relaxed">
                  <li>
                    Buka Love Kitchen langsung di tab penuh <strong>Chrome</strong> atau{' '}
                    <strong>Edge</strong>.
                  </li>
                  <li>
                    Klik ikon <strong>Install</strong> di bilah alamat atau menu browser.
                  </li>
                  <li>Konfirmasi pemasangan untuk mode aplikasi standalone.</li>
                </ol>
              )}
            </div>

            <button
              type="button"
              onClick={handleLater}
              data-testid="pwa-modal-later"
              className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-[#3B2318] text-white font-display text-sm font-bold hover:bg-[#523224] transition cursor-pointer"
            >
              NANTI SAJA
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
