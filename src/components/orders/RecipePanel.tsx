import React, { useMemo } from 'react';
import { ChefHat, Clock, Flame, Layers, ListChecks, X } from 'lucide-react';
import { MenuService } from '../../game/systems/menu/MenuService.ts';
import { RecipeService } from '../../game/systems/recipe/RecipeService.ts';
import type { RecipeStationType } from '../../game/systems/recipe/RecipeTypes.ts';
import { MenuFoodIcon } from './MenuFoodIcon.tsx';

interface Props {
  recipeId: string;
  onClose: () => void;
}

const STATION_LABELS: Record<RecipeStationType, string> = {
  GRILL: 'Grill Station',
  FRYER: 'Deep Fryer',
  PREP_COUNTER: 'Prep Table',
  DRINK_STATION: 'Drink Station',
  BLENDER: 'Milkshake Blender',
};

export const RecipePanel: React.FC<Props> = ({ recipeId, onClose }) => {
  const menuService = useMemo(() => new MenuService(), []);
  const recipeService = useMemo(() => new RecipeService(), []);

  const preview = useMemo(
    () => recipeService.getRecipePreview(recipeId, menuService),
    [recipeId, recipeService, menuService]
  );

  const stopPropagation = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  if (!preview) {
    return null;
  }

  return (
    <div
      onPointerDown={stopPropagation}
      className="fixed inset-0 z-50 bg-[#2C1810]/60 backdrop-blur-xs flex items-center justify-center p-3"
      role="dialog"
      aria-modal="true"
      aria-label={`Resep ${preview.name}`}
    >
      <div className="w-full max-w-xl max-h-[88vh] rounded-3xl bg-[#FFFDF9] border-2 border-[#3B2318]/20 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 bg-[#FFF6EC] border-b border-[#3B2318]/10 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-white border border-[#3B2318]/10 flex items-center justify-center shrink-0">
              <MenuFoodIcon iconKey={preview.menuIcon} size={40} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#D97706] uppercase tracking-wide">
                <ChefHat className="w-3.5 h-3.5" />
                <span>Panduan Resep Chef · v{preview.recipeVersion}</span>
              </div>
              <h3 className="font-display text-base sm:text-lg font-extrabold text-[#3B2318] truncate">
                {preview.name}
              </h3>
              <div className="text-xs font-semibold text-[#7C5340] flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 font-mono-num">
                  <Clock className="w-3.5 h-3.5" />
                  {preview.preparationTime}s
                </span>
                <span aria-hidden="true">·</span>
                <span>Kesulitan: {preview.difficulty}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">Hasil: {preview.yield} porsi</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Panel Resep"
            className="min-w-[44px] min-h-[44px] rounded-2xl bg-white border border-[#3B2318]/12 text-[#5C3A28] hover:bg-[#FEE2E2] hover:text-[#DC2626] flex items-center justify-center transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {/* Station Requirements */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#5C3A28] uppercase tracking-wider mb-1.5">
              <Flame className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>Stasiun Dapur</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {preview.stationRequirements.map((station) => (
                <span
                  key={station}
                  className="px-2.5 py-1 rounded-lg bg-[#FFF3E3] border border-[#EA580C]/25 text-xs font-bold text-[#9A3412]"
                >
                  {STATION_LABELS[station] ?? station}
                </span>
              ))}
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#5C3A28] uppercase tracking-wider mb-2">
              <Layers className="w-3.5 h-3.5 text-[#16A34A]" />
              <span>Bahan ({preview.ingredients.length})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {preview.ingredients.map((ing) => (
                <div
                  key={ing.ingredientId}
                  className="rounded-xl bg-[#FFFBF6] border border-[#3B2318]/10 px-3 py-2 flex items-center justify-between gap-2 text-xs"
                >
                  <span className="font-semibold text-[#3B2318]">{ing.name}</span>
                  <span className="font-mono-num font-bold text-[#15803D] whitespace-nowrap">
                    {ing.quantity} {ing.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Cooking Steps */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#5C3A28] uppercase tracking-wider mb-2">
              <ListChecks className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Langkah Memasak ({preview.cookingSteps.length} tahap)</span>
            </div>
            <ol className="space-y-2">
              {preview.cookingSteps.map((step) => (
                <li
                  key={step.stepNumber}
                  className="rounded-xl bg-[#FFFBF6] border border-[#3B2318]/10 px-3 py-2.5 flex items-start gap-2.5 text-xs"
                >
                  <span className="w-6 h-6 rounded-lg bg-[#3B2318] text-white font-mono-num font-bold flex items-center justify-center shrink-0">
                    {step.stepNumber}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#3B2318] leading-snug">
                      {step.instruction}
                    </p>
                    <div className="text-[11px] text-[#7C5340] mt-0.5 font-medium">
                      {STATION_LABELS[step.station] ?? step.station} ·{' '}
                      <span className="font-mono-num">{step.durationSeconds}s</span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-[#FFF6EC] border-t border-[#3B2318]/10 flex items-center justify-between gap-3 shrink-0">
          <p className="text-[11px] font-medium text-[#7C5340]">
            Data resep ini terhubung langsung ke RecipeDatabase (eksekusi masak penuh di Fase 07).
          </p>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 rounded-xl bg-[#3B2318] text-white font-display text-xs font-bold hover:bg-[#5C3A28] transition cursor-pointer shrink-0"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
