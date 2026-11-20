import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Flame,
  Minus,
  Plus,
  StickyNote,
  Trash2,
} from 'lucide-react';
import type { MenuService } from '../../game/systems/menu/MenuService.ts';
import type { OrderDraft, OrderPriority } from '../../game/systems/orders/OrderTypes.ts';
import { MenuFoodIcon } from './MenuFoodIcon.tsx';

interface Props {
  draft: OrderDraft;
  menuService: MenuService;
  priority: OrderPriority;
  validationErrors: string[];
  isSubmitting: boolean;
  onIncrease: (lineId: string) => void;
  onDecrease: (lineId: string) => void;
  onRemove: (lineId: string) => void;
  onEditItemNotes: (lineId: string, notes: string) => void;
  onEditOrderNotes: (notes: string) => void;
  onTogglePriority: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export const OrderCart: React.FC<Props> = ({
  draft,
  menuService,
  priority,
  validationErrors,
  isSubmitting,
  onIncrease,
  onDecrease,
  onRemove,
  onEditItemNotes,
  onEditOrderNotes,
  onTogglePriority,
  onCancel,
  onConfirm,
}) => {
  const [expandedNoteLineId, setExpandedNoteLineId] = useState<string | null>(null);
  const totalItemCount = draft.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#FFFDF9] rounded-2xl border border-[#3B2318]/12 overflow-hidden">
      {/* Cart Header */}
      <div className="px-3.5 py-2.5 border-b border-[#3B2318]/10 bg-[#FFF7EC] flex items-center justify-between gap-2 shrink-0">
        <div>
          <h3 className="font-display text-sm font-bold text-[#3B2318] leading-tight">
            Keranjang Pesanan
          </h3>
          <p className="text-[11px] font-semibold text-[#7C5340]">
            {totalItemCount === 0
              ? 'Belum ada item dipilih'
              : `${totalItemCount} item · ${draft.items.length} baris`}
          </p>
        </div>

        <button
          type="button"
          onClick={onTogglePriority}
          className={`min-h-[34px] px-2.5 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer whitespace-nowrap ${
            priority === 'URGENT'
              ? 'bg-[#FEF2F2] border-[#EF4444] text-[#DC2626]'
              : 'bg-white border-[#3B2318]/15 text-[#7C5340] hover:border-[#3B2318]/30'
          }`}
        >
          <Flame className="w-3.5 h-3.5 shrink-0" />
          <span>{priority === 'URGENT' ? 'Urgent' : 'Normal'}</span>
        </button>
      </div>

      {/* Line Items List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {draft.items.length === 0 ? (
          <div className="h-full min-h-[120px] flex flex-col items-center justify-center text-center px-4 py-6 rounded-xl border border-dashed border-[#3B2318]/15 bg-[#FFFBF5]">
            <p className="font-display text-sm font-bold text-[#5C3A28]">
              Pilih menu di sebelah kiri
            </p>
            <p className="text-xs text-[#8B5E4B] mt-1">
              Tambahkan burger, kentang, atau minuman sesuai permintaan tamu.
            </p>
          </div>
        ) : (
          draft.items.map((line) => {
            const menu = menuService.getItemById(line.menuItemId);
            const isNoteOpen = expandedNoteLineId === line.lineId;
            return (
              <div
                key={line.lineId}
                className="rounded-xl bg-[#FFFBF6] border border-[#3B2318]/10 p-2.5"
              >
                <div className="flex items-center gap-2">
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-[#FFF3E3] flex items-center justify-center">
                    <MenuFoodIcon iconKey={menu?.icon ?? 'burger_classic'} size={30} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-display text-xs sm:text-sm font-bold text-[#3B2318] truncate">
                      {line.menuNameSnapshot}
                    </div>
                    <div className="text-[11px] font-mono-num text-[#7C5340]">
                      ${line.unitPrice} × {line.quantity} ={' '}
                      <strong className="text-[#15803D]">${line.totalPrice}</strong>
                    </div>
                  </div>

                  {/* Stepper Controls */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onDecrease(line.lineId)}
                      aria-label={`Kurangi ${line.menuNameSnapshot}`}
                      className="w-8 h-8 rounded-lg bg-white border border-[#3B2318]/15 text-[#3B2318] hover:bg-[#FEE2E2] hover:border-[#EF4444]/40 flex items-center justify-center cursor-pointer active:scale-95 transition"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-6 text-center font-mono-num text-xs font-extrabold text-[#3B2318]">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onIncrease(line.lineId)}
                      aria-label={`Tambah ${line.menuNameSnapshot}`}
                      className="w-8 h-8 rounded-lg bg-white border border-[#3B2318]/15 text-[#3B2318] hover:bg-[#DCFCE7] hover:border-[#16A34A]/40 flex items-center justify-center cursor-pointer active:scale-95 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(line.lineId)}
                      aria-label={`Hapus ${line.menuNameSnapshot}`}
                      className="w-8 h-8 rounded-lg text-[#9CA3AF] hover:text-[#DC2626] hover:bg-[#FEF2F2] flex items-center justify-center cursor-pointer transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Line Note Row */}
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  {line.notes ? (
                    <span className="text-[11px] font-medium text-[#B45309] truncate">
                      Catatan: {line.notes}
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#9E7B67]">Tanpa catatan khusus</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setExpandedNoteLineId(isNoteOpen ? null : line.lineId)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#D97706] hover:underline shrink-0 cursor-pointer"
                  >
                    <StickyNote className="w-3 h-3" />
                    <span>{isNoteOpen ? 'Tutup' : 'Catatan'}</span>
                  </button>
                </div>

                {isNoteOpen && (
                  <div className="mt-2 pt-2 border-t border-[#3B2318]/8 space-y-1.5">
                    {menu?.allowedCustomizations && menu.allowedCustomizations.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {menu.allowedCustomizations.map((opt) => {
                          const active = line.notes === opt.label;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() =>
                                onEditItemNotes(line.lineId, active ? '' : opt.label)
                              }
                              className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                                active
                                  ? 'bg-[#FEF3C7] border-[#D97706] text-[#92400E]'
                                  : 'bg-white border-[#3B2318]/12 text-[#5C3A28] hover:border-[#D97706]/50'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <input
                      type="text"
                      value={line.notes}
                      maxLength={80}
                      onChange={(e) => onEditItemNotes(line.lineId, e.target.value)}
                      placeholder="Tulis catatan dapur (mis. Tanpa bawang)..."
                      className="w-full rounded-lg bg-white border border-[#3B2318]/15 px-2.5 py-1.5 text-xs text-[#3B2318] placeholder:text-[#A88A77] focus:outline-none focus:border-[#EA580C]"
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Order-Level Notes + Validation Errors + Totals + CTA */}
      <div className="p-3 border-t border-[#3B2318]/10 bg-[#FFF9F2] space-y-2.5 shrink-0">
        <input
          type="text"
          value={draft.notes}
          maxLength={140}
          onChange={(e) => onEditOrderNotes(e.target.value)}
          placeholder="Catatan meja untuk Chef (opsional)..."
          className="w-full rounded-xl bg-white border border-[#3B2318]/14 px-3 py-2 text-xs text-[#3B2318] placeholder:text-[#A88A77] focus:outline-none focus:border-[#EA580C]"
        />

        {validationErrors.length > 0 && (
          <div
            role="alert"
            className="rounded-xl bg-[#FEF2F2] border border-[#EF4444]/35 px-3 py-2 text-xs text-[#B91C1C] flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              {validationErrors.map((err, idx) => (
                <div key={idx} className="font-semibold">
                  {err}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-sm px-0.5">
          <span className="font-semibold text-[#7C5340]">Total Estimasi</span>
          <span className="font-mono-num text-lg font-extrabold text-[#15803D]">
            ${draft.total}
          </span>
        </div>

        <div className="grid grid-cols-5 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="col-span-2 min-h-[44px] rounded-xl bg-white border border-[#3B2318]/18 text-[#5C3A28] font-display text-xs sm:text-sm font-bold hover:bg-[#FEE2E2]/40 transition active:scale-97 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className={`col-span-3 min-h-[44px] rounded-xl font-display text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-1.5 transition active:scale-97 shadow-sm ${
              draft.items.length === 0 || isSubmitting
                ? 'bg-[#D6B8A6] cursor-pointer'
                : 'bg-[#16A34A] hover:bg-[#15803D] cursor-pointer'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{isSubmitting ? 'Mengirim...' : 'Konfirmasi Order'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
