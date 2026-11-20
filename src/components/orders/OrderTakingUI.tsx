import React, { useMemo, useState } from 'react';
import { Sparkles, Users, UtensilsCrossed, X } from 'lucide-react';
import { audioManager } from '../../game/systems/audio/AudioManager.ts';
import type { MenuCategoryId } from '../../game/systems/menu/MenuCategory.ts';
import type { MenuItem } from '../../game/systems/menu/MenuConfig.ts';
import { MenuService } from '../../game/systems/menu/MenuService.ts';
import { gameSessionManager } from '../../game/systems/session/GameSessionManager.ts';
import { OrderDraftManager } from '../../game/systems/orders/OrderDraft.ts';
import type { OrderDraft, OrderPriority } from '../../game/systems/orders/OrderTypes.ts';
import { gameBridge } from '../../game/systems/ui/GameBridge.ts';
import { RECIPES } from '../../shared/recipes.ts';
import type { GameSnapshot } from '../../shared/types.ts';
import { MenuCard } from './MenuCard.tsx';
import { OrderCart } from './OrderCart.tsx';

interface Props {
  tableId: string;
  snapshot: GameSnapshot;
  onClose: () => void;
  onViewRecipe: (recipeId: string) => void;
}

export const OrderTakingUI: React.FC<Props> = ({
  tableId,
  snapshot,
  onClose,
  onViewRecipe,
}) => {
  const table = snapshot.tables.find((t) => t.id === tableId) ?? null;

  // Client-side MenuService & OrderDraftManager for zero-latency draft editing
  // Authoritative pricing & validation are enforced again on the server at Confirm.
  const menuService = useMemo(() => new MenuService(), []);
  const draftManager = useMemo(() => new OrderDraftManager(menuService), [menuService]);

  const initialDraft = useMemo<OrderDraft>(() => {
    const seatedCustomers = (snapshot.customers ?? []).filter((c) => c.assignedTableId === tableId);
    const customerIds =
      seatedCustomers.length > 0
        ? seatedCustomers.map((c) => c.id)
        : table?.customer?.id
          ? [table.customer.id]
          : [];
    const customerGroupId =
      table?.assignedGroupId ||
      seatedCustomers[0]?.groupId ||
      `group_${tableId}`;

    return draftManager.createDraft({
      tableId,
      tableLabel: table?.label ?? tableId,
      customerIds,
      customerGroupId,
      waiterId: snapshot.players.waiter?.socketId ?? 'waiter_local',
    });
  }, [draftManager, tableId]);

  const [draft, setDraft] = useState<OrderDraft>(initialDraft);
  const [selectedCategory, setSelectedCategory] = useState<MenuCategoryId | 'ALL'>('ALL');
  const [priority, setPriority] = useState<OrderPriority>('NORMAL');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const categories = useMemo(() => menuService.getCategories(false), [menuService]);
  const visibleItems = useMemo(
    () => menuService.getItemsByCategory(selectedCategory, false),
    [menuService, selectedCategory]
  );

  // Quantity badge per menuItemId across all lines in current draft
  const selectedQtyByMenuId = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of draft.items) {
      map.set(line.menuItemId, (map.get(line.menuItemId) ?? 0) + line.quantity);
    }
    return map;
  }, [draft.items]);

  // Suggest matching Phase 06 menu item based on seated customer's craving (helpful visual hint)
  const suggestedMenuItem = useMemo(() => {
    if (!table?.dishId) return null;
    return (
      menuService.getAllItems().find((m) => m.legacyDishId === table.dishId) ?? null
    );
  }, [menuService, table?.dishId]);

  const handleAddItem = (item: MenuItem) => {
    audioManager.playSfx('click');
    setValidationErrors([]);
    const res = draftManager.addItem(draft.draftId, item.id, 1);
    if (res.ok && res.draft) {
      setDraft(res.draft);
    } else if (res.error) {
      setValidationErrors([res.error]);
    }
  };

  const handleIncrease = (lineId: string) => {
    audioManager.playSfx('click');
    setValidationErrors([]);
    const res = draftManager.increaseQuantity(draft.draftId, lineId);
    if (res.ok && res.draft) {
      setDraft(res.draft);
    } else if (res.error) {
      setValidationErrors([res.error]);
    }
  };

  const handleDecrease = (lineId: string) => {
    audioManager.playSfx('click');
    setValidationErrors([]);
    const res = draftManager.decreaseQuantity(draft.draftId, lineId);
    if (res.ok && res.draft) {
      setDraft(res.draft);
    } else if (res.error) {
      setValidationErrors([res.error]);
    }
  };

  const handleRemove = (lineId: string) => {
    audioManager.playSfx('click');
    setValidationErrors([]);
    const res = draftManager.removeItem(draft.draftId, lineId);
    if (res.ok && res.draft) {
      setDraft(res.draft);
    }
  };

  const handleEditItemNotes = (lineId: string, notes: string) => {
    const res = draftManager.editItemNotes(draft.draftId, lineId, notes);
    if (res.ok && res.draft) {
      setDraft(res.draft);
    }
  };

  const handleEditOrderNotes = (notes: string) => {
    const res = draftManager.editOrderNotes(draft.draftId, notes);
    if (res.ok && res.draft) {
      setDraft(res.draft);
    }
  };

  const handleCancelDraft = () => {
    audioManager.playSfx('click');
    draftManager.cancelDraft(draft.draftId, 'cancelled_by_waiter_ui');
    onClose();
  };

  const handleConfirmOrder = async () => {
    setValidationErrors([]);
    if (draft.items.length === 0) {
      audioManager.playSfx('burn');
      setValidationErrors(['Order tidak boleh kosong. Tambahkan minimal 1 menu terlebih dahulu.']);
      return;
    }

    setIsSubmitting(true);
    try {
      const payloadItems = draft.items.map((line) => ({
        menuItemId: line.menuItemId,
        quantity: line.quantity,
        notes: line.notes,
      }));
      const res = await gameSessionManager.confirmTableOrder(
        tableId,
        payloadItems,
        draft.notes,
        priority
      );
      if (res.ok && res.order) {
        draftManager.markConfirmed(draft.draftId);
        audioManager.playSfx('ready');
        gameBridge.showToast(
          `ORDER ${res.order.orderNumber} (${res.order.tableLabel}) DIKIRIM KE DAPUR!`,
          3000
        );
        onClose();
      } else {
        audioManager.playSfx('burn');
        setValidationErrors(
          res.errors && res.errors.length > 0
            ? res.errors
            : ['Order ditolak server. Periksa status meja & item menu.']
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const stopPropagation = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      onPointerDown={stopPropagation}
      className="fixed inset-0 z-40 bg-[#2C1810]/55 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Catat Pesanan Tamu"
    >
      <div className="w-full max-w-5xl h-[92vh] max-h-[680px] rounded-3xl bg-[#FFF6EC] border-2 border-[#3B2318]/18 shadow-2xl flex flex-col overflow-hidden">
        {/* Top Modal Header */}
        <div className="px-4 py-3 bg-[#FFFDF9] border-b border-[#3B2318]/10 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#FCE7F3] border border-[#EC4899]/25 flex items-center justify-center text-[#DB2777] shrink-0">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-base sm:text-lg font-extrabold text-[#3B2318] leading-tight">
                  Catat Pesanan · Meja {table?.label ?? tableId}
                </h2>
                {table && table.occupancy > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#7C5340]">
                    <Users className="w-3.5 h-3.5 text-[#EC4899]" />
                    {table.occupancy} Tamu
                  </span>
                )}
              </div>
              {table?.dishId && (
                <div className="flex items-center gap-2 text-xs text-[#8B5E4B] mt-0.5 flex-wrap">
                  <span className="inline-flex items-center gap-1 font-semibold text-[#D97706]">
                    <Sparkles className="w-3.5 h-3.5" />
                    Tamu ingin:{' '}
                    <strong className="text-[#3B2318]">
                      {suggestedMenuItem?.displayName ?? RECIPES[table.dishId].name}
                    </strong>
                  </span>
                  {suggestedMenuItem && (
                    <button
                      type="button"
                      onClick={() => handleAddItem(suggestedMenuItem)}
                      className="text-[11px] font-bold text-[#15803D] hover:underline cursor-pointer"
                    >
                      + Tambah Cepat
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCancelDraft}
            aria-label="Tutup Menu Pesanan"
            className="min-w-[44px] min-h-[44px] rounded-2xl bg-[#FFF6EC] border border-[#3B2318]/12 text-[#5C3A28] hover:bg-[#FEE2E2] hover:text-[#DC2626] flex items-center justify-center transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main 2-Column Responsive Split */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 gap-3 p-3 overflow-hidden">
          {/* Left Column: Category Tabs + Menu Grid */}
          <div className="md:col-span-7 flex flex-col min-h-0">
            {/* Segmented Category Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  audioManager.playSfx('click');
                  setSelectedCategory('ALL');
                }}
                className={`min-h-[38px] px-3.5 rounded-xl font-display text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  selectedCategory === 'ALL'
                    ? 'bg-[#3B2318] text-white shadow-xs'
                    : 'bg-[#FFFDF9] border border-[#3B2318]/12 text-[#5C3A28] hover:bg-white'
                }`}
              >
                Semua ({menuService.getAllItems().length})
              </button>
              {categories.map((cat) => {
                const count = menuService.getItemsByCategory(cat.id, false).length;
                const active = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      audioManager.playSfx('click');
                      setSelectedCategory(cat.id);
                    }}
                    className={`min-h-[38px] px-3.5 rounded-xl font-display text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-[#EA580C] text-white shadow-xs'
                        : 'bg-[#FFFDF9] border border-[#3B2318]/12 text-[#5C3A28] hover:bg-white'
                    }`}
                  >
                    {cat.displayName} ({count})
                  </button>
                );
              })}
            </div>

            {/* Menu Item Grid */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
              {visibleItems.length === 0 ? (
                <div className="h-full min-h-[140px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#3B2318]/15 bg-[#FFFDF9]/70 text-center p-4">
                  <p className="font-display text-sm font-bold text-[#5C3A28]">
                    Belum ada menu di kategori ini
                  </p>
                  <p className="text-xs text-[#8B5E4B] mt-1">
                    Kategori ini akan terbuka di level restoran berikutnya.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pb-1">
                  {visibleItems.map((item) => (
                    <MenuCard
                      key={item.id}
                      item={item}
                      selectedQuantity={selectedQtyByMenuId.get(item.id) ?? 0}
                      onAdd={handleAddItem}
                      onViewRecipe={onViewRecipe}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Live Order Draft Cart */}
          <div className="md:col-span-5 flex flex-col min-h-0">
            <OrderCart
              draft={draft}
              menuService={menuService}
              priority={priority}
              validationErrors={validationErrors}
              isSubmitting={isSubmitting}
              onIncrease={handleIncrease}
              onDecrease={handleDecrease}
              onRemove={handleRemove}
              onEditItemNotes={handleEditItemNotes}
              onEditOrderNotes={handleEditOrderNotes}
              onTogglePriority={() => {
                audioManager.playSfx('click');
                setPriority((prev) => (prev === 'NORMAL' ? 'URGENT' : 'NORMAL'));
              }}
              onCancel={handleCancelDraft}
              onConfirm={() => void handleConfirmOrder()}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
