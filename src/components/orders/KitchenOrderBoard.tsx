import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  BookOpen,
  CheckCircle2,
  ChefHat,
  Clock,
  Flame,
  ReceiptText,
  X,
} from 'lucide-react';
import { audioManager } from '../../game/systems/audio/AudioManager.ts';
import { MenuService } from '../../game/systems/menu/MenuService.ts';
import { socketService } from '../../game/systems/multiplayer/SocketService.ts';
import type { Order, OrderStatus } from '../../game/systems/orders/OrderTypes.ts';
import { gameBridge } from '../../game/systems/ui/GameBridge.ts';
import type { GameSnapshot, PlayerRole } from '../../shared/types.ts';
import { MenuFoodIcon } from './MenuFoodIcon.tsx';

type BoardTab = 'PENDING' | 'ACTIVE' | 'HISTORY';

interface Props {
  snapshot: GameSnapshot;
  activeRole: PlayerRole;
  onClose: () => void;
  onViewRecipe: (recipeId: string) => void;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: 'Draft',
  CONFIRMED: 'Terkonfirmasi',
  QUEUED: 'Menunggu Chef',
  ACCEPTED: 'Diterima Chef',
  PREPARING: 'Disiapkan',
  READY: 'Siap Antar',
  SERVED: 'Disajikan',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

function formatOrderAge(createdAt: number, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((nowMs - createdAt) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const KitchenOrderBoard: React.FC<Props> = ({
  snapshot,
  activeRole,
  onClose,
  onViewRecipe,
}) => {
  const [tab, setTab] = useState<BoardTab>('PENDING');
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const menuService = useMemo(() => new MenuService(), []);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const orderSystem = snapshot.orderSystem;
  const allOrders = orderSystem?.orders ?? [];

  const pendingOrders = useMemo(() => {
    const orderById = new Map(allOrders.map((o) => [o.orderId, o]));
    if (orderSystem?.pendingQueue && orderSystem.pendingQueue.length > 0) {
      return orderSystem.pendingQueue
        .map((q) => ({ queueItem: q, order: orderById.get(q.orderId) }))
        .filter((pair): pair is { queueItem: typeof pair.queueItem; order: Order } =>
          Boolean(pair.order)
        );
    }
    return allOrders
      .filter((o) => o.status === 'QUEUED')
      .map((order, idx) => ({
        queueItem: {
          queueId: order.orderId,
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          tableId: order.tableId,
          tableLabel: order.tableLabel,
          createdAt: order.createdAt,
          queuePosition: idx + 1,
          priority: order.priority,
          status: order.status,
          sequence: idx + 1,
        },
        order,
      }));
  }, [allOrders, orderSystem?.pendingQueue]);

  const activeOrders = useMemo(
    () =>
      allOrders
        .filter(
          (o) =>
            o.status === 'ACCEPTED' ||
            o.status === 'PREPARING' ||
            o.status === 'READY' ||
            o.status === 'SERVED'
        )
        .sort((a, b) => (a.acceptedAt ?? a.createdAt) - (b.acceptedAt ?? b.createdAt)),
    [allOrders]
  );

  const historyOrders = useMemo(
    () =>
      allOrders
        .filter((o) => o.status === 'COMPLETED' || o.status === 'CANCELLED')
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [allOrders]
  );

  const canAcceptAsChef = activeRole === 'chef' || snapshot.mode === 'practice';

  const handleAccept = async (order: Order) => {
    if (!canAcceptAsChef) {
      gameBridge.showToast('Hanya Chef yang dapat menerima tiket pesanan!');
      return;
    }
    setBusyOrderId(order.orderId);
    try {
      const res = await socketService.acceptKitchenOrder(order.orderId);
      if (res.ok) {
        audioManager.playSfx('ready');
        gameBridge.showToast(`CHEF MENERIMA ${order.orderNumber} (${order.tableLabel})!`, 2600);
      } else {
        audioManager.playSfx('burn');
        gameBridge.showToast(res.error || 'Gagal menerima pesanan.');
      }
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleCancel = async (order: Order) => {
    setBusyOrderId(order.orderId);
    try {
      const res = await socketService.cancelKitchenOrder(order.orderId, 'cancelled_from_kitchen_board');
      if (res.ok) {
        audioManager.playSfx('click');
        gameBridge.showToast(`Pesanan ${order.orderNumber} dibatalkan.`);
      } else {
        gameBridge.showToast(res.error || 'Pesanan tidak dapat dibatalkan.');
      }
    } finally {
      setBusyOrderId(null);
    }
  };

  const stopPropagation = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  const renderOrderCard = (order: Order, queuePosition?: number) => {
    const isUrgent = order.priority === 'URGENT';
    const isBusy = busyOrderId === order.orderId;
    const isPending = order.status === 'QUEUED';
    const isCancellable =
      order.status === 'QUEUED' ||
      order.status === 'ACCEPTED' ||
      order.status === 'PREPARING';

    return (
      <div
        key={order.orderId}
        className={`rounded-2xl bg-[#FFFDF9] border p-3.5 flex flex-col justify-between gap-3 shadow-xs ${
          isUrgent && isPending
            ? 'border-[#EF4444]/60 bg-[#FFFBFB]'
            : 'border-[#3B2318]/14'
        }`}
      >
        <div>
          {/* Ticket Header */}
          <div className="flex items-start justify-between gap-2 pb-2 border-b border-[#3B2318]/10">
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono-num text-sm font-extrabold text-[#3B2318]">
                  {order.orderNumber}
                </span>
                <span aria-hidden="true" className="text-[#C7AE9B]">
                  ·
                </span>
                <span className="font-display text-sm font-bold text-[#EA580C]">
                  Meja {order.tableLabel}
                </span>
                {queuePosition !== undefined && (
                  <span className="font-mono-num text-[11px] font-bold text-[#7C5340]">
                    (#{queuePosition})
                  </span>
                )}
              </div>
              <div className="text-[11px] font-semibold text-[#7C5340] flex items-center gap-2 mt-0.5">
                <span>{STATUS_LABEL[order.status]}</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-0.5 font-mono-num">
                  <Clock className="w-3 h-3" />
                  {formatOrderAge(order.createdAt, nowMs)}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num font-bold text-[#15803D]">${order.total}</span>
              </div>
            </div>

            {isUrgent && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#FEE2E2] text-[#DC2626] text-[11px] font-extrabold shrink-0">
                <Flame className="w-3 h-3" />
                URGENT
              </span>
            )}
          </div>

          {/* Line Items */}
          <ul className="mt-2.5 space-y-2">
            {order.items.map((item) => {
              const menu = menuService.getItemById(item.menuItemId);
              return (
                <li
                  key={item.itemId}
                  className="flex items-center justify-between gap-2 rounded-xl bg-[#FFF8F0] border border-[#3B2318]/8 px-2.5 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0">
                      <MenuFoodIcon iconKey={menu?.icon ?? 'burger_classic'} size={26} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#3B2318] truncate">
                        <span className="font-mono-num text-[#EA580C] mr-1">
                          {item.quantity}×
                        </span>
                        {item.menuNameSnapshot}
                      </div>
                      {item.notes && (
                        <div className="text-[11px] font-medium text-[#B45309] truncate">
                          Catatan: {item.notes}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      audioManager.playSfx('click');
                      onViewRecipe(item.recipeId);
                    }}
                    className="min-h-[32px] px-2 rounded-lg bg-white border border-[#3B2318]/12 text-[11px] font-bold text-[#5C3A28] hover:border-[#EA580C] hover:text-[#EA580C] inline-flex items-center gap-1 transition cursor-pointer shrink-0"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Resep</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {order.notes && (
            <div className="mt-2 rounded-xl bg-[#FEF3C7]/60 border border-[#F59E0B]/30 px-2.5 py-1.5 text-[11px] font-semibold text-[#92400E]">
              Catatan Meja: {order.notes}
            </div>
          )}

          {order.cancelReason && (
            <div className="mt-2 text-[11px] font-semibold text-[#DC2626]">
              Alasan batal: {order.cancelReason}
            </div>
          )}
        </div>

        {/* Action Row */}
        {(isPending || isCancellable) && (
          <div className="pt-2 border-t border-[#3B2318]/8 flex items-center gap-2">
            {isPending && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleAccept(order)}
                className={`flex-1 min-h-[42px] px-3 rounded-xl font-display text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-1.5 transition active:scale-97 cursor-pointer shadow-xs ${
                  canAcceptAsChef
                    ? 'bg-[#16A34A] hover:bg-[#15803D]'
                    : 'bg-[#9CA3AF]'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{isBusy ? 'Memproses...' : 'Terima Order'}</span>
              </button>
            )}

            {isCancellable && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleCancel(order)}
                className="min-h-[42px] px-3 rounded-xl bg-white border border-[#EF4444]/30 text-[#DC2626] hover:bg-[#FEF2F2] font-display text-xs font-bold inline-flex items-center justify-center gap-1 transition cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5 shrink-0" />
                <span>Batalkan</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      onPointerDown={stopPropagation}
      className="fixed inset-0 z-40 bg-[#2C1810]/55 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Papan Antrean Pesanan Dapur"
    >
      <div className="w-full max-w-5xl h-[90vh] max-h-[660px] rounded-3xl bg-[#FFF6EC] border-2 border-[#3B2318]/18 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 bg-[#FFFDF9] border-b border-[#3B2318]/10 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#FEF3C7] border border-[#D97706]/30 flex items-center justify-center text-[#B45309] shrink-0">
              <ChefHat className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-extrabold text-[#3B2318] leading-tight truncate">
                Papan Pesanan Dapur
              </h2>
              <p className="text-xs font-semibold text-[#7C5340]">
                Antrean: <strong className="font-mono-num text-[#EA580C]">{pendingOrders.length}</strong>
                {' · '}
                Aktif: <strong className="font-mono-num text-[#15803D]">{activeOrders.length}</strong>
                {' · '}
                Total Sesi:{' '}
                <strong className="font-mono-num text-[#3B2318]">
                  {orderSystem?.metrics.totalOrders ?? allOrders.length}
                </strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Papan Pesanan"
            className="min-w-[44px] min-h-[44px] rounded-2xl bg-[#FFF6EC] border border-[#3B2318]/12 text-[#5C3A28] hover:bg-[#FEE2E2] hover:text-[#DC2626] flex items-center justify-center transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Queue Tabs */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-2 shrink-0">
          {(
            [
              { id: 'PENDING', label: `Antrean (${pendingOrders.length})` },
              { id: 'ACTIVE', label: `Diterima / Aktif (${activeOrders.length})` },
              { id: 'HISTORY', label: `Riwayat (${historyOrders.length})` },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                audioManager.playSfx('click');
                setTab(item.id);
              }}
              className={`min-h-[40px] px-4 rounded-xl font-display text-xs sm:text-sm font-bold transition whitespace-nowrap cursor-pointer ${
                tab === item.id
                  ? 'bg-[#3B2318] text-white shadow-xs'
                  : 'bg-[#FFFDF9] border border-[#3B2318]/12 text-[#5C3A28] hover:bg-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Order Ticket Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          {tab === 'PENDING' &&
            (pendingOrders.length === 0 ? (
              <div className="h-full min-h-[180px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#3B2318]/15 bg-[#FFFDF9]/70 text-center p-6">
                <ReceiptText className="w-9 h-9 text-[#C7AE9B] mb-2" />
                <p className="font-display text-base font-bold text-[#5C3A28]">
                  Belum ada tiket menunggu di dapur
                </p>
                <p className="text-xs text-[#8B5E4B] mt-1 max-w-sm">
                  Saat Waiter mengetuk meja tamu dan mengonfirmasi pesanan, tiket akan muncul otomatis di sini secara FIFO.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {pendingOrders.map(({ order, queueItem }) =>
                  renderOrderCard(order, queueItem.queuePosition)
                )}
              </div>
            ))}

          {tab === 'ACTIVE' &&
            (activeOrders.length === 0 ? (
              <div className="h-full min-h-[180px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#3B2318]/15 bg-[#FFFDF9]/70 text-center p-6">
                <p className="font-display text-base font-bold text-[#5C3A28]">
                  Belum ada pesanan aktif yang diterima Chef
                </p>
                <p className="text-xs text-[#8B5E4B] mt-1">
                  Ketuk "Terima Order" pada tab Antrean untuk memindahkan tiket ke dapur aktif.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeOrders.map((order) => renderOrderCard(order))}
              </div>
            ))}

          {tab === 'HISTORY' &&
            (historyOrders.length === 0 ? (
              <div className="h-full min-h-[180px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#3B2318]/15 bg-[#FFFDF9]/70 text-center p-6">
                <p className="font-display text-base font-bold text-[#5C3A28]">
                  Riwayat pesanan sesi masih kosong
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {historyOrders.map((order) => renderOrderCard(order))}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
