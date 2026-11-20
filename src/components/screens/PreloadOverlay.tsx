import React from 'react';
import { ChefHat, Heart } from 'lucide-react';

interface Props {
  progress: number;
}

export const PreloadOverlay: React.FC<Props> = ({ progress }) => {
  const pct = Math.min(100, Math.max(8, Math.round(progress * 100)));

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#FFF6EC] px-6 text-center">
      <div className="relative flex items-center justify-center w-20 h-20 rounded-3xl bg-[#FF5A6E] text-white shadow-lg">
        <ChefHat className="w-10 h-10" />
        <Heart className="w-5 h-5 fill-[#FFE082] text-[#FFE082] absolute -bottom-1 -right-1" />
      </div>

      <h1 className="mt-5 font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#3B2318]">
        LOVE KITCHEN
      </h1>
      <p className="mt-1 text-sm font-medium text-[#7C5340]">
        2.5D Co-Op Restaurant Rush
      </p>

      <div className="mt-7 w-full max-w-xs">
        <div className="h-3.5 w-full rounded-full bg-[#F2DEC8] overflow-hidden border border-[#3B2318]/15">
          <div
            className="h-full rounded-full bg-[#FF5A6E] transition-all duration-200 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs font-semibold text-[#7C5340]">
          <span>Memanaskan kompor dapur...</span>
          <span className="font-mono-num">{pct}%</span>
        </div>
      </div>
    </div>
  );
};
