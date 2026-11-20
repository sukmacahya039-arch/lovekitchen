import Phaser from 'phaser';
import type {
  CustomerRuntimeSnapshot,
  DiningTableState,
  PlayerRole,
} from '../../../shared/types.ts';
import { MOVEMENT_CONFIG } from '../../config/movementConfig.ts';
import type { InteractableObject } from '../interaction/InteractionSystem.ts';
import type { CharacterMovementSnapshot } from '../movement/MovementController.ts';
import { NavigationGrid } from '../navigation/NavigationGrid.ts';
import { gridToIso, ISO_TILE_H, ISO_TILE_W } from '../restaurant/IsometricGrid.ts';

/**
 * Developer-only movement, navigation grid, collision, interaction, customer AI,
 * and table management debug overlay.
 * Automatically disabled in production builds; in development toggle with F3 or `?debug=1`.
 */
export class MovementDebugOverlay {
  private scene: Phaser.Scene;
  private gfx: Phaser.GameObjects.Graphics;
  private infoText: Phaser.GameObjects.Text;
  private worldLabels: Phaser.GameObjects.Text[] = [];
  private enabled = false;
  private readonly productionLocked: boolean;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.productionLocked = Boolean(import.meta.env?.PROD);

    // Auto-enable only in non-production builds if developer explicitly passes ?debug=1 in URL
    if (
      !this.productionLocked &&
      typeof window !== 'undefined' &&
      window.location.search.includes('debug=1')
    ) {
      this.enabled = true;
    }

    this.gfx = scene.add.graphics();
    this.gfx.setDepth(2400);
    this.gfx.setVisible(this.enabled);

    this.infoText = scene.add.text(14, 118, '', {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '11px',
      color: '#F8FAFC',
      backgroundColor: '#0F172ACC',
      padding: { x: 8, y: 6 },
    });
    this.infoText.setDepth(2450);
    this.infoText.setVisible(this.enabled);
  }

  public isEnabled(): boolean {
    return this.enabled && !this.productionLocked;
  }

  public setEnabled(next: boolean): void {
    if (this.productionLocked) {
      this.enabled = false;
      return;
    }
    this.enabled = next;
    this.gfx.setVisible(next);
    this.infoText.setVisible(next);
    if (!next) {
      this.gfx.clear();
      this.clearWorldLabels();
    }
  }

  public toggle(): boolean {
    if (this.productionLocked) return false;
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  public render(
    grid: NavigationGrid,
    activeRole: PlayerRole,
    snapshots: Record<PlayerRole, CharacterMovementSnapshot>,
    interactables: InteractableObject[],
    customers: CustomerRuntimeSnapshot[] = [],
    tables: DiningTableState[] = []
  ): void {
    if (!this.isEnabled()) return;

    this.gfx.clear();
    this.clearWorldLabels();

    const halfW = ISO_TILE_W / 2;
    const halfH = ISO_TILE_H / 2;

    // 1. Navigation Grid Tiles (walkable / static blocked / dynamic obstacle)
    for (let c = 0; c < grid.cols; c++) {
      for (let r = 0; r < grid.rows; r++) {
        const pt = gridToIso(c, r);
        let fill = 0x22c55e;
        let alpha = 0.14;
        let stroke = 0x16a34a;

        if (grid.isDynamicBlocked(c, r)) {
          fill = 0xf97316;
          alpha = 0.36;
          stroke = 0xea580c;
        } else if (grid.isStaticBlocked(c, r)) {
          fill = 0xef4444;
          alpha = 0.24;
          stroke = 0xdc2626;
        } else if (!grid.isRoleZoneAllowed(activeRole, c)) {
          fill = 0x94a3b8;
          alpha = 0.1;
          stroke = 0x64748b;
        }

        this.gfx.fillStyle(fill, alpha);
        this.gfx.lineStyle(1, stroke, 0.45);
        this.gfx.beginPath();
        this.gfx.moveTo(pt.x, pt.y - halfH);
        this.gfx.lineTo(pt.x + halfW, pt.y);
        this.gfx.lineTo(pt.x, pt.y + halfH);
        this.gfx.lineTo(pt.x - halfW, pt.y);
        this.gfx.closePath();
        this.gfx.fillPath();
        this.gfx.strokePath();
      }
    }

    // 2. Interaction Radii for registered interactables
    for (const obj of interactables) {
      const pt = gridToIso(obj.col, obj.row);
      const rx = obj.interactionRadius * ISO_TILE_W * 0.56;
      const ry = obj.interactionRadius * ISO_TILE_H * 0.56;
      const color = obj.enabled ? 0x38bdf8 : 0x64748b;
      this.gfx.lineStyle(1.4, color, 0.55);
      this.gfx.strokeEllipse(pt.x, pt.y, rx * 2, ry * 2);
      this.gfx.fillStyle(color, 0.7);
      this.gfx.fillCircle(pt.x, pt.y, 3);
    }

    // 3. Player Characters: ground feet collider, active path, waypoints, destination
    (['chef', 'waiter'] as PlayerRole[]).forEach((role) => {
      const snap = snapshots[role];
      const feetPt = gridToIso(snap.position.col, snap.position.row);
      const color = role === 'chef' ? 0xf59e0b : 0xec4899;

      if (snap.path.length > 0) {
        this.gfx.lineStyle(2.5, color, 0.92);
        let prev = feetPt;
        for (const node of snap.path) {
          const next = gridToIso(node.col, node.row);
          this.gfx.lineBetween(prev.x, prev.y, next.x, next.y);
          this.gfx.fillStyle(0xffffff, 0.95);
          this.gfx.fillCircle(next.x, next.y, 3.5);
          prev = next;
        }
      }

      if (snap.destination) {
        const destPt = gridToIso(snap.destination.col, snap.destination.row);
        this.gfx.lineStyle(2, 0xfef08a, 0.95);
        this.gfx.strokeCircle(destPt.x, destPt.y, 7);
      }

      const feetRx = MOVEMENT_CONFIG.avatarFeetRadius * ISO_TILE_W * 0.85;
      const feetRy = MOVEMENT_CONFIG.avatarFeetRadius * ISO_TILE_H * 0.85;
      this.gfx.lineStyle(2, color, 0.95);
      this.gfx.strokeEllipse(feetPt.x, feetPt.y, feetRx * 2, feetRy * 2);
    });

    // 4. Phase 05 Customers: active A* path, destination, ID, FSM state, group, table, queue, patience
    for (const c of customers) {
      const pt = gridToIso(c.col, c.row);

      if (c.path.length > 0) {
        this.gfx.lineStyle(2, 0x38bdf8, 0.88);
        let prev = pt;
        for (const wp of c.path) {
          const next = gridToIso(wp.col, wp.row);
          this.gfx.lineBetween(prev.x, prev.y, next.x, next.y);
          this.gfx.fillStyle(0x7dd3fc, 0.9);
          this.gfx.fillCircle(next.x, next.y, 2.8);
          prev = next;
        }
      }

      if (c.destination) {
        const dPt = gridToIso(c.destination.col, c.destination.row);
        this.gfx.lineStyle(1.8, 0x38bdf8, 0.95);
        this.gfx.strokeCircle(dPt.x, dPt.y, 5);
      }

      const meta = `${c.id}[${c.groupId}] ${c.state}\n${c.assignedTableId ?? (c.queueIndex !== null ? `Q#${c.queueIndex}` : '-')} | P:${Math.round(c.patience * 100)}%`;
      this.spawnWorldLabel(pt.x, pt.y - 54, meta, '#BAE6FD');
    }

    // 5. Phase 05 Tables: status, occupancy, reservation timeout
    for (const tbl of tables) {
      const pt = gridToIso(tbl.col, tbl.row);
      const rsvStr =
        tbl.reservationRemainingMs > 0
          ? ` rsv:${(tbl.reservationRemainingMs / 1000).toFixed(1)}s`
          : '';
      this.spawnWorldLabel(
        pt.x,
        pt.y + 30,
        `${tbl.label}:${tbl.phase05Status} (${tbl.occupancy}/${tbl.capacity})${rsvStr}`,
        '#FDE68A'
      );
    }

    // 6. Compact telemetry readout for active character + Phase 05 customer/table counts
    const active = snapshots[activeRole];
    const avail = tables.filter((t) => t.phase05Status === 'AVAILABLE').length;
    const dirty = tables.filter((t) => t.phase05Status === 'DIRTY' || t.phase05Status === 'CLEANING').length;
    const queued = customers.filter((c) => c.state === 'QUEUING').length;

    this.infoText.setText(
      [
        `[DEBUG F3] Role: ${active.role.toUpperCase()} | State: ${active.movementState}`,
        `Pos: (${active.position.col.toFixed(2)}, ${active.position.row.toFixed(2)}) | Facing: ${active.facing}`,
        `Speed: ${active.currentSpeed.toFixed(2)} t/s | Path: ${active.path.length} | Grid v${grid.getVersion()}`,
        `Customers: ${customers.length} (Queue: ${queued}) | Tables Avail: ${avail}/${tables.length} Dirty: ${dirty}`,
      ].join('\n')
    );
  }

  private spawnWorldLabel(x: number, y: number, text: string, color: string): void {
    const lbl = this.scene.add.text(x, y, text, {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '9px',
      color,
      backgroundColor: '#0F172ACC',
      padding: { x: 3, y: 2 },
    });
    lbl.setOrigin(0.5, 0.5);
    lbl.setDepth(2440);
    this.worldLabels.push(lbl);
  }

  private clearWorldLabels(): void {
    for (const lbl of this.worldLabels) {
      lbl.destroy();
    }
    this.worldLabels = [];
  }

  public destroy(): void {
    this.clearWorldLabels();
    this.gfx.destroy();
    this.infoText.destroy();
  }
}
