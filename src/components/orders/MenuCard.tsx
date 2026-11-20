import React from 'react';
import { BookOpen, Clock, Plus } from 'lucide-react';
import type { MenuItem } from '../../game/systems/menu/MenuConfig.ts';
import { MenuFoodIcon } from './MenuFoodIcon.tsx';

interface Props {
  item: MenuItem;
  selectedQuantity: number;
  currencySymbol?: string;
  onAdd: (item: MenuItem) => void;
  onViewRecipe: (recipeId: string) => void;
}

export const MenuCard: React.FC<Props> = ({
  item,
  selectedQuantity,
  currencySymbol = '$',
  onAdd,
  onViewRecipe,
}) => {
  const isSelected = selectedQuantity > 0;
  const isDisabled = !item.available;

  return (
    <div
      className={`group relative flex flex-col justify-between rounded-2xl border p-2.5 sm:p-3 transition ${
        isDisabled
          ? 'bg-[#F5ECE4]/70 border-[#3B2318]/10 opacity-60'
          : isSelected
            ? 'bg-[#FFF7ED] border-[#F97316] shadow-sm'
            : 'bg-[#FFFDF9] border-[#3B2318]/12 hover:border-[#F97316]/60 shadow-xs'
      }`}
    >
      {/* Top Row: Icon + Title + Recipe Preview Button */}
      <div className="flex items-start gap-2.5">
        <div className="shrink-0 w-12 h-12 rounded-xl bg-[#FFF3E3] border border-[#3B2318]/8 flex items-center justify-center">
          <MenuFoodIcon iconKey={item.icon} size={40} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <h4 className="font-display text-sm font-bold text-[#3B2318] leading-snug truncate">
              {item.displayName}
            </h4>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewRecipe(item.recipeId);
              }}
              aria-label={`Lihat resep ${item.displayName}`}
              title="Lihat Resep"
              className="shrink-0 w-8 h-8 -mt-1 -mr-1 rounded-lg flex items-center justify-center text-[#8B5E4B] hover:text-[#3B2318] hover:bg-[#3B2318]/8 transition cursor-pointer"
            >
              <BookOpen className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-[#7C5340] leading-snug line-clamp-2 mt-0.5">
            {item.description}
          </p>
        </div>
      </div>

      {/* Bottom Row: Price · Prep Time + Touch-Friendly Add Button */}
      <div className="mt-2.5 pt-2 border-t border-[#3B2318]/8 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-mono-num font-extrabold text-sm text-[#15803D]">
            {currencySymbol}
            {item.price}
          </span>
          <span aria-hidden="true" className="text-[#C7AE9B]">
            ·
          </span>
          <span className="inline-flex items-center gap-0.5 font-mono-num text-[11px] font-semibold text-[#7C5340]">
            <Clock className="w-3 h-3" />
            {item.preparationTime}s
          </span>
        </div>

        <button
          type="button"
          disabled={isDisabled}
          onClick={() => onAdd(item)}
          className={`min-h-[38px] min-w-[76px] px-3 rounded-xl font-display text-xs font-bold flex items-center justify-center gap-1 transition active:scale-95 whitespace-nowrap ${
            isDisabled
              ? 'bg-[#D6C2B2] text-[#7C5340] cursor-not-allowed'
              : isSelected
                ? 'bg-[#EA580C] text-white hover:bg-[#DC2626] cursor-pointer shadow-xs'
                : 'bg-[#FF6B81] text-white hover:bg-[#EC4899] cursor-pointer shadow-xs'
          }`}
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span>{isDisabled ? 'Habis' : isSelected ? `Tambah (${selectedQuantity})` : 'Tambah'}</span>
        </button>
      </div>
    </div>
  );
};
