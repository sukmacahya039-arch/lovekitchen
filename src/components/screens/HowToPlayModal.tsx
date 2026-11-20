import React from 'react';
import { ChefHat, Smartphone, UtensilsCrossed, X } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export const HowToPlayModal: React.FC<Props> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#3B2318]/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[#FFFDF9] border border-[#3B2318]/15 p-5 sm:p-7 shadow-2xl text-[#3B2318]">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl font-bold">Cara Bermain Love Kitchen</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-[#3B2318]/10 transition cursor-pointer"
            aria-label="Tutup panduan"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="mt-2 text-sm text-[#6B4432]">
          Bekerja sama sebagai <strong>Chef</strong> dan <strong>Waiter</strong> selama shift 2 menit 30 detik untuk melayani sebanyak mungkin pelanggan dengan cepat dan meraih 3 Bintang!
        </p>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-[#FFF8EB] border border-[#D97706]/25 p-4">
            <div className="flex items-center gap-2 font-display text-lg font-bold text-[#B45309]">
              <ChefHat className="w-5 h-5" />
              <span>Tugas Player 1 — Chef</span>
            </div>
            <ol className="mt-2.5 space-y-1.5 text-xs sm:text-sm text-[#5C3A28] list-decimal list-inside">
              <li>Lihat tiket pesanan di bagian atas layar.</li>
              <li>Ambil bahan mentah dari rak Pantry (Burger, Pasta, Cake, Ramen).</li>
              <li>Masak di alat yang sesuai (Grill, Pot, Oven, atau Wok serbaguna).</li>
              <li>Angkat segera saat indikator hijau <strong>READY</strong> sebelum gosong!</li>
              <li>Letakkan hidangan matang di meja <strong>Serving Pass</strong> tengah.</li>
            </ol>
          </div>

          <div className="rounded-2xl bg-[#FFF0F6] border border-[#EC4899]/25 p-4">
            <div className="flex items-center gap-2 font-display text-lg font-bold text-[#BE185D]">
              <UtensilsCrossed className="w-5 h-5" />
              <span>Tugas Player 2 — Waiter</span>
            </div>
            <ol className="mt-2.5 space-y-1.5 text-xs sm:text-sm text-[#5C3A28] list-decimal list-inside">
              <li>Sambut tamu di karpet pintu masuk untuk mendudukkan mereka di meja kosong.</li>
              <li>Ketuk meja saat muncul balon <strong>Order!</strong> untuk mengirim pesanan ke dapur.</li>
              <li>Ambil makanan matang dari meja <strong>Serving Pass</strong> ke nampan.</li>
              <li>Antarkan ke meja yang sesuai, lalu terima pembayaran (<strong>Pay $</strong>).</li>
              <li>Bersihkan meja kotor (<strong>Clean!</strong>) agar tamu baru bisa duduk.</li>
            </ol>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-[#FFF6EC] border border-[#3B2318]/12 p-4 flex items-start gap-3">
          <Smartphone className="w-5 h-5 text-[#FF5A6E] shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-[#5C3A28]">
            <strong>Kontrol HP Android &amp; Desktop:</strong> Ketuk langsung meja, kompor, bahan, atau tamu untuk berjalan &amp; berinteraksi otomatis! Kamu juga bisa memakai <strong>Thumbstick Virtual + Tombol AKSI</strong> di HP, atau <strong>WASD / Panah + Spasi / E</strong> di keyboard (tekan <strong>Tab</strong> untuk tukar peran di mode Solo Practice).
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full min-h-[46px] rounded-2xl bg-[#FF5A6E] text-white font-display text-base font-bold hover:bg-[#E8485C] transition cursor-pointer"
        >
          Siap Bermain!
        </button>
      </div>
    </div>
  );
};
