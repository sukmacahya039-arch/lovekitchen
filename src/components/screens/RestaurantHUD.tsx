import React, { useEffect, useRef, useState } from 'react';
import {
  ChefHat,
  Clock,
  Gamepad2,
  Hand,
  MessageCircle,
  Pause,
  ReceiptText,
  RotateCw,
  Star,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { RECIPES } from '../../shared/recipes.ts';
import {
  isSoloControlMode,
  type CharacterAnimState,
  type GameSnapshot,
  type PlayerRole,
} from '../../shared/types.ts';
import { gameBridge } from '../../game/systems/ui/GameBridge.ts';

interface Props {
  snapshot: GameSnapshot | null;
  activeRole: PlayerRole;
  isCharacterMoving: boolean;
  onPause: () => void;
  onSelectRole: (role: PlayerRole) => void;
  onSendEmote: (text: string, anim?: CharacterAnimState) => void;
}

export const RestaurantHUD: React.FC<Props> = ({
  snapshot,
  activeRole,
  isCharacterMoving,
  onPause,
  onSelectRole,
  onSendEmote,
}) => {
  const [showPortraitTip, setShowPortraitTip] = useState(false);
  const [dismissedPortraitTip, setDismissedPortraitTip] = useState(false);
  // Tap-to-move is the primary default mode; virtual joystick is optional and hidden initially
  const [showJoystick, setShowJoystick] = useState(false);
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0 });
  const joyOrigin = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const checkOrientation = () => {
      const isNarrowPortrait = window.innerHeight > window.innerWidth && window.innerWidth < 768;
      setShowPortraitTip(isNarrowPortrait);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  if (!snapshot) return null;

  const mins = Math.floor(snapshot.timeRemaining / 60);
  const secs = Math.floor(snapshot.timeRemaining % 60);
  const timerStr = `${mins}:${secs.toString().padStart(2, '0')}`;
  const isLowTime = snapshot.timeRemaining <= 20;

  const currentStars =
    snapshot.score >= snapshot.targetScores[2]
      ? 3
      : snapshot.score >= snapshot.targetScores[1]
        ? 2
        : snapshot.score >= snapshot.targetScores[0]
          ? 1
          : 0;

  const myAvatar = snapshot.players[activeRole];
  const isSolo = isSoloControlMode(snapshot.mode);
  const nextStarTarget =
    snapshot.score < snapshot.targetScores[0]
      ? snapshot.targetScores[0]
      : snapshot.score < snapshot.targetScores[1]
        ? snapshot.targetScores[1]
        : snapshot.targetScores[2];

  const handleJoyStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    joyOrigin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    updateJoystick(e.clientX, e.clientY);
  };

  const handleJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!joyOrigin.current) return;
    updateJoystick(e.clientX, e.clientY);
  };

  const handleJoyEnd = () => {
    joyOrigin.current = null;
    setJoyKnob({ x: 0, y: 0 });
    gameBridge.emitMoveVector(0, 0);
  };

  const updateJoystick = (clientX: number, clientY: number) => {
    if (!joyOrigin.current) return;
    const maxRadius = 36;
    const dx = clientX - joyOrigin.current.x;
    const dy = clientY - joyOrigin.current.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clamped;
    const ky = Math.sin(angle) * clamped;
    setJoyKnob({ x: kx, y: ky });
    gameBridge.emitMoveVector(kx / maxRadius, ky / maxRadius);
  };

  const stopCanvasLeak = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-2 sm:p-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* Compact Top HUD Strip */}
      <div className="w-full max-w-6xl mx-auto flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          {/* Left: Score, Stars & Solo Objective */}
          <div
            onPointerDown={stopCanvasLeak}
            className="pointer-events-auto flex items-center gap-2.5 sm:gap-3 rounded-2xl bg-[#FFFDF9]/92 border border-[#3B2318]/15 px-3 py-1.5 shadow-sm"
          >
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono-num text-base sm:text-lg font-bold text-[#15803D] leading-tight">
                  ${snapshot.score}
                </span>
                <span className="hidden sm:inline font-mono-num text-[11px] font-semibold text-[#8B5E4B]">
                  / ${nextStarTarget}
                </span>
              </div>
              <div className="flex items-center gap-0.5 mt-0.5">
                {[1, 2, 3].map((n) => (
                  <Star
                    key={n}
                    className={`w-3.5 h-3.5 ${
                      n <= currentStars
                        ? 'fill-[#F59E0B] text-[#D97706]'
                        : 'text-[#D6C2B2]'
                    }`}
                  />
                ))}
                {isSolo && (
                  <span className="ml-1.5 text-[10px] font-extrabold tracking-wider text-[#B45309] uppercase">
                    SOLO
                  </span>
                )}
              </div>
            </div>

            {snapshot.combo >= 2 && (
              <div className="pl-2 border-l border-[#3B2318]/12 font-display text-xs sm:text-sm font-bold text-[#D97706] whitespace-nowrap">
                {snapshot.combo}x Combo
              </div>
            )}
          </div>

          {/* Center: Timer */}
          <div
            className={`pointer-events-auto flex items-center gap-1.5 rounded-2xl px-3.5 py-1.5 shadow-sm border font-mono-num text-base sm:text-lg font-bold ${
              isLowTime
                ? 'bg-[#DC2626] text-white border-[#991B1B]'
                : 'bg-[#FFFDF9]/92 text-[#3B2318] border-[#3B2318]/15'
            }`}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span>{timerStr}</span>
          </div>

          {/* Right: Segmented Role Switcher (Solo) / Role Label (Online) + Order Queue + Pause */}
          <div
            onPointerDown={stopCanvasLeak}
            className="pointer-events-auto flex items-center gap-1.5"
          >
            {isSolo ? (
              <div
                role="group"
                aria-label="Pilih Peran Aktif"
                className="inline-flex items-center p-0.5 rounded-2xl bg-[#FFFDF9]/95 border border-[#3B2318]/18 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => onSelectRole('waiter')}
                  aria-pressed={activeRole === 'waiter'}
                  data-testid="role-switch-waiter"
                  title="Kontrol Waiter (Tombol 2 atau Tab)"
                  className={`inline-flex items-center gap-1.5 min-h-[44px] px-2.5 sm:px-3 rounded-xl font-display text-xs sm:text-sm font-bold transition active:scale-96 whitespace-nowrap cursor-pointer ${
                    activeRole === 'waiter'
                      ? 'bg-[#EC4899] text-white shadow-xs'
                      : 'text-[#6B4432] hover:bg-[#FFF0F6]'
                  }`}
                >
                  <UtensilsCrossed className="w-4 h-4 shrink-0" />
                  <span>Waiter</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectRole('chef')}
                  aria-pressed={activeRole === 'chef'}
                  data-testid="role-switch-chef"
                  title="Kontrol Chef (Tombol 1 atau Tab)"
                  className={`inline-flex items-center gap-1.5 min-h-[44px] px-2.5 sm:px-3 rounded-xl font-display text-xs sm:text-sm font-bold transition active:scale-96 whitespace-nowrap cursor-pointer ${
                    activeRole === 'chef'
                      ? 'bg-[#D97706] text-white shadow-xs'
                      : 'text-[#6B4432] hover:bg-[#FEF3C7]'
                  }`}
                >
                  <ChefHat className="w-4 h-4 shrink-0" />
                  <span>Chef</span>
                </button>
              </div>
            ) : (
              <div className="hidden sm:flex items-center rounded-xl bg-[#FFFDF9]/90 border border-[#3B2318]/15 px-3 py-1.5 text-xs font-bold text-[#3B2318] whitespace-nowrap">
                {activeRole === 'chef' ? 'Chef Cowok' : 'Waiter Wanita'}
              </div>
            )}

            <button
              type="button"
              onClick={() => gameBridge.setKitchenBoardOpen(true)}
              aria-label="Buka Papan Pesanan Dapur"
              className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-xl border font-display text-xs sm:text-sm font-bold shadow-sm transition active:scale-95 whitespace-nowrap cursor-pointer ${
                (snapshot.orderSystem?.metrics.pendingCount ?? 0) > 0
                  ? 'bg-[#FFF3E3] border-[#EA580C]/45 text-[#9A3412]'
                  : 'bg-[#FFFDF9]/92 border-[#3B2318]/15 text-[#3B2318] hover:bg-white'
              }`}
            >
              <ReceiptText className="w-4 h-4 shrink-0 text-[#EA580C]" />
              <span className="hidden sm:inline">Order</span>
              <span className="font-mono-num text-xs font-extrabold px-1.5 py-0.5 rounded-md bg-[#3B2318] text-white">
                {(snapshot.orderSystem?.metrics.pendingCount ?? 0) +
                  (snapshot.orderSystem?.metrics.activeCount ?? 0)}
              </span>
            </button>

            <button
              type="button"
              onClick={onPause}
              aria-label="Pause"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-[#FFFDF9]/92 border border-[#3B2318]/15 text-[#3B2318] hover:bg-white shadow-sm cursor-pointer"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Compact Phase 05 Restaurant Status Strip (Customers, Queue, Table States) */}
        {snapshot.restaurantMetrics && (
          <div className="flex items-center justify-center sm:justify-start gap-1.5 flex-wrap">
            <div
              onPointerDown={stopCanvasLeak}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-xl bg-[#FFFDF9]/90 border border-[#3B2318]/12 px-2.5 py-1 text-[11px] font-semibold text-[#5C3A28] shadow-xs"
            >
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <Users className="w-3.5 h-3.5 text-[#EC4899] shrink-0" />
                <span>
                  Tamu:{' '}
                  <strong className="font-mono-num text-[#3B2318]">
                    {snapshot.restaurantMetrics.activeCustomers}/{snapshot.restaurantMetrics.maxCustomers}
                  </strong>
                </span>
              </span>
              <span aria-hidden="true" className="text-[#D6C2B2]">
                |
              </span>
              <span className="whitespace-nowrap">
                Antre:{' '}
                <strong
                  className={`font-mono-num ${
                    snapshot.restaurantMetrics.queuedCustomers > 0
                      ? 'text-[#D97706]'
                      : 'text-[#3B2318]'
                  }`}
                >
                  {snapshot.restaurantMetrics.queuedCustomers}
                </strong>
              </span>
              <span aria-hidden="true" className="text-[#D6C2B2]">
                |
              </span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <UtensilsCrossed className="w-3 h-3 text-[#16A34A] shrink-0" />
                <span>
                  Meja:{' '}
                  <strong className="font-mono-num text-[#15803D]">
                    {snapshot.restaurantMetrics.tables.available}
                  </strong>
                  <span className="text-[#7C5340]"> kos</span>
                  {' · '}
                  <strong className="font-mono-num text-[#2563EB]">
                    {snapshot.restaurantMetrics.tables.occupied +
                      snapshot.restaurantMetrics.tables.reserved}
                  </strong>
                  <span className="text-[#7C5340]"> isi</span>
                  {snapshot.restaurantMetrics.tables.dirty +
                    snapshot.restaurantMetrics.tables.cleaning >
                    0 && (
                    <>
                      {' · '}
                      <strong className="font-mono-num text-[#0284C7]">
                        {snapshot.restaurantMetrics.tables.dirty +
                          snapshot.restaurantMetrics.tables.cleaning}
                      </strong>
                      <span className="text-[#0369A1]"> kotor</span>
                    </>
                  )}
                </span>
              </span>
              {isSolo && (
                <>
                  <span aria-hidden="true" className="text-[#D6C2B2]">
                    |
                  </span>
                  <span
                    className={`font-bold whitespace-nowrap ${
                      activeRole === 'chef' ? 'text-[#B45309]' : 'text-[#BE185D]'
                    }`}
                  >
                    {activeRole === 'chef' ? 'Chef Aktif' : 'Waiter Aktif'}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Active Kitchen Order Tickets Strip (Phase 06 Queue + Legacy Fallback) */}
        {(() => {
          const livePhase06Tickets = (snapshot.orderSystem?.orders ?? []).filter(
            (o) =>
              o.status === 'QUEUED' ||
              o.status === 'ACCEPTED' ||
              o.status === 'PREPARING' ||
              o.status === 'READY'
          );

          if (livePhase06Tickets.length > 0) {
            return (
              <div
                onPointerDown={stopCanvasLeak}
                className="flex items-center gap-1.5 overflow-x-auto pb-0.5"
              >
                {livePhase06Tickets.map((ord) => {
                  const totalQty = ord.items.reduce((sum, i) => sum + i.quantity, 0);
                  const dotColor =
                    ord.status === 'QUEUED'
                      ? '#EA580C'
                      : ord.status === 'READY'
                        ? '#16A34A'
                        : '#2563EB';
                  const statusText =
                    ord.status === 'QUEUED'
                      ? 'Antre'
                      : ord.status === 'ACCEPTED'
                        ? 'Diterima'
                        : ord.status === 'PREPARING'
                          ? 'Disiapkan'
                          : 'Siap';
                  return (
                    <button
                      key={ord.orderId}
                      type="button"
                      onClick={() => gameBridge.setKitchenBoardOpen(true)}
                      className="pointer-events-auto shrink-0 rounded-xl bg-[#FFFDF9]/94 hover:bg-white border border-[#3B2318]/15 px-2.5 py-1 shadow-xs flex items-center gap-2 text-xs transition cursor-pointer"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: dotColor }}
                      />
                      <span className="font-mono-num font-extrabold text-[#3B2318] whitespace-nowrap">
                        {ord.orderNumber}
                      </span>
                      <span className="font-bold text-[#EA580C] whitespace-nowrap">
                        {ord.tableLabel}
                      </span>
                      <span className="text-[11px] font-semibold text-[#7C5340] whitespace-nowrap">
                        {totalQty} item · {statusText}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          }

          if (snapshot.orders.length === 0) return null;

          return (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {snapshot.orders.map((ord) => {
                const recipe = RECIPES[ord.dishId];
                const statusLabel =
                  ord.status === 'on_pass'
                    ? 'Di Pass'
                    : ord.status === 'cooking'
                      ? 'Dimasak'
                      : 'Antre';
                return (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => gameBridge.setKitchenBoardOpen(true)}
                    className="pointer-events-auto shrink-0 rounded-xl bg-[#FFFDF9]/94 border border-[#3B2318]/15 px-2.5 py-1 shadow-xs flex items-center gap-2 text-xs cursor-pointer"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: recipe.accentHex }}
                    />
                    <span className="font-bold text-[#3B2318] whitespace-nowrap">
                      {ord.tableLabel} · {recipe.shortName}
                    </span>
                    <span className="text-[11px] font-semibold text-[#7C5340] whitespace-nowrap">
                      {statusLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Dismissible Portrait -> Landscape Tip for Android Phones */}
      {showPortraitTip && !dismissedPortraitTip && (
        <div className="pointer-events-auto mx-auto rounded-2xl bg-[#3B2318]/92 text-white px-4 py-2.5 text-xs flex items-center gap-3 shadow-lg">
          <RotateCw className="w-4 h-4 text-[#FBBF24] shrink-0" />
          <span>Putar HP ke mode Landscape 16:9 untuk dapur paling lega!</span>
          <button
            type="button"
            onClick={() => setDismissedPortraitTip(true)}
            className="underline font-bold shrink-0 cursor-pointer"
          >
            OK
          </button>
        </div>
      )}

      {/* Bottom Touch Controls & Quick Co-Op Callouts */}
      <div className="w-full max-w-6xl mx-auto flex items-end justify-between gap-3">
        {/* Left: Tap-to-Move default with optional Virtual Joystick & Contextual Cancel Move */}
        <div
          onPointerDown={stopCanvasLeak}
          className="pointer-events-auto flex items-end gap-2"
        >
          {showJoystick && (
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                handleJoyStart(e);
              }}
              onPointerMove={handleJoyMove}
              onPointerUp={handleJoyEnd}
              onPointerCancel={handleJoyEnd}
              className="touch-game-control relative w-24 h-24 sm:w-26 sm:h-26 rounded-full bg-[#3B2318]/16 border-2 border-[#3B2318]/25 backdrop-blur-xs flex items-center justify-center"
              aria-label="Virtual Joystick"
            >
              <div
                className="w-11 h-11 rounded-full bg-[#FFFDF9]/95 border-2 border-[#3B2318]/40 shadow-md transition-transform duration-75"
                style={{ transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)` }}
              />
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (showJoystick) {
                  handleJoyEnd();
                }
                setShowJoystick((prev) => !prev);
              }}
              aria-label={showJoystick ? 'Sembunyikan Joystick' : 'Tampilkan Joystick'}
              title={showJoystick ? 'Mode Tap-to-Move' : 'Tampilkan Joystick Opsional'}
              className={`min-w-[44px] min-h-[44px] px-2.5 rounded-2xl border shadow-sm transition active:scale-95 flex items-center justify-center gap-1.5 text-xs font-bold whitespace-nowrap cursor-pointer ${
                showJoystick
                  ? 'bg-[#3B2318] text-white border-[#3B2318]'
                  : 'bg-[#FFFDF9]/92 text-[#5C3A28] border-[#3B2318]/18 hover:bg-white'
              }`}
            >
              <Gamepad2 className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{showJoystick ? 'Stick ON' : 'Stick'}</span>
            </button>

            {isCharacterMoving && (
              <button
                type="button"
                onClick={() => gameBridge.emitCancelMove()}
                aria-label="Batalkan Jalan"
                className="min-w-[44px] min-h-[44px] px-3 rounded-2xl bg-[#FFFDF9]/95 border border-[#DC2626]/35 text-[#DC2626] font-display font-bold text-xs shadow-sm active:scale-95 transition flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <X className="w-4 h-4 shrink-0" />
                <span>Batal</span>
              </button>
            )}
          </div>
        </div>

        {/* Center: Carried Item & Quick Co-Op Expressions */}
        <div
          onPointerDown={stopCanvasLeak}
          className="pointer-events-auto hidden md:flex items-center gap-2 rounded-2xl bg-[#FFFDF9]/90 border border-[#3B2318]/12 px-3 py-1.5 text-xs text-[#5C3A28] shadow-xs"
        >
          <span>
            Tangan:{' '}
            <strong className="text-[#3B2318]">
              {myAvatar?.carriedItem
                ? `${RECIPES[myAvatar.carriedItem.dishId].shortName} (${myAvatar.carriedItem.state})`
                : 'Kosong'}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() =>
              onSendEmote(activeRole === 'chef' ? 'Order Up!' : 'Semangat!', 'happy')
            }
            className="inline-flex items-center gap-1 font-semibold text-[#16A34A] hover:underline cursor-pointer"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Senang</span>
          </button>
          <button
            type="button"
            onClick={() => onSendEmote('Ayo cepat!', 'angry')}
            className="font-semibold text-[#DC2626] hover:underline cursor-pointer"
          >
            Cepat!
          </button>
          <button
            type="button"
            onClick={() => onSendEmote('Hufft...', 'tired')}
            className="font-semibold text-[#D97706] hover:underline cursor-pointer"
          >
            Lelah
          </button>
          <button
            type="button"
            onClick={() => onSendEmote('Yah...', 'sad')}
            className="font-semibold text-[#2563EB] hover:underline cursor-pointer"
          >
            Sedih
          </button>
        </div>

        {/* Right: Big Touch Interact Button */}
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            gameBridge.emitActionPress();
          }}
          className="pointer-events-auto touch-game-control w-20 h-20 sm:w-22 sm:h-22 rounded-full bg-[#FF5A6E] border-4 border-[#FFFDF9] text-white font-display font-bold text-xs sm:text-sm shadow-xl active:scale-92 transition flex flex-col items-center justify-center gap-0.5 cursor-pointer"
        >
          <Hand className="w-6 h-6" />
          <span>AKSI</span>
        </button>
      </div>
    </div>
  );
};
