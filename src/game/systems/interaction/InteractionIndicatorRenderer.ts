import Phaser from 'phaser';
import type { GridCoord } from '../../../shared/layout.ts';
import type { PlayerRole } from '../../../shared/types.ts';
import { computeIsoDepth, gridToIso } from '../restaurant/IsometricGrid.ts';
import type { InteractableObject } from './InteractionSystem.ts';

interface RippleEffect {
  col: number;
  row: number;
  color: number;
  age: number;
  duration: number;
}

/**
 * Renders lightweight, mobile-readable visual cues for Phase 04 movement & interaction:
 * - Subtle highlight outline + short action label (COOK, PREPARE, SERVE, PAY, CLEAN, etc.)
 * - Animated tap-to-move destination marker & subtle path breadcrumbs
 * - Brief arrival / blocked-tap feedback ripples that fade cleanly
 */
export class InteractionIndicatorRenderer {
  private scene: Phaser.Scene;
  private pathGfx: Phaser.GameObjects.Graphics;
  private highlightRing: Phaser.GameObjects.Ellipse;
  private labelBadge: Phaser.GameObjects.Text;
  private ripples: RippleEffect[] = [];
  private elapsedSec = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Ground-level destination marker, breadcrumbs, and tap feedback ripples
    this.pathGfx = scene.add.graphics();
    this.pathGfx.setDepth(6);

    // Subtle ground highlight ellipse around the focused interactable
    this.highlightRing = scene.add.ellipse(0, 0, 70, 36, 0xfef08a, 0.24);
    this.highlightRing.setStrokeStyle(2.5, 0xf59e0b, 0.92);
    this.highlightRing.setVisible(false);
    this.highlightRing.setDepth(12);

    // Compact, high-contrast mobile-friendly interaction prompt label
    this.labelBadge = scene.add.text(0, 0, '', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      backgroundColor: '#3B2318',
      padding: { x: 8, y: 3 },
    });
    this.labelBadge.setOrigin(0.5, 0.5);
    this.labelBadge.setVisible(false);
    this.labelBadge.setDepth(1800);
  }

  public triggerBlockedRipple(col: number, row: number): void {
    this.ripples.push({
      col,
      row,
      color: 0xef4444,
      age: 0,
      duration: 0.48,
    });
  }

  public triggerTapRipple(col: number, row: number, role: PlayerRole): void {
    this.ripples.push({
      col,
      row,
      color: role === 'chef' ? 0xd97706 : 0xec4899,
      age: 0,
      duration: 0.36,
    });
  }

  public update(
    dtSeconds: number,
    activeRole: PlayerRole,
    path: GridCoord[],
    destination: GridCoord | null,
    highlightedObj: InteractableObject | null,
    actionLabel: string | null
  ): void {
    this.elapsedSec += dtSeconds;

    // 1. Render subtle interactable outline + compact action prompt
    if (highlightedObj && highlightedObj.enabled && actionLabel) {
      const iso = gridToIso(highlightedObj.col, highlightedObj.row);
      const pulse = 1 + Math.sin(this.elapsedSec * 5.5) * 0.045;
      const strokeColor = activeRole === 'chef' ? 0xf59e0b : 0xec4899;
      const fillColor = activeRole === 'chef' ? 0xfef08a : 0xfbcfe8;

      this.highlightRing.setPosition(iso.x, iso.y + 3);
      this.highlightRing.setFillStyle(fillColor, 0.24);
      this.highlightRing.setStrokeStyle(2.5, strokeColor, 0.92);
      this.highlightRing.setScale(pulse);
      this.highlightRing.setDepth(computeIsoDepth(highlightedObj.col, highlightedObj.row, 11));
      this.highlightRing.setVisible(true);

      const floatY = Math.sin(this.elapsedSec * 4.2) * 2.5;
      this.labelBadge.setText(actionLabel);
      this.labelBadge.setBackgroundColor(activeRole === 'chef' ? '#B45309' : '#BE185D');
      this.labelBadge.setPosition(iso.x, iso.y - 56 + floatY);
      this.labelBadge.setDepth(computeIsoDepth(highlightedObj.col, highlightedObj.row, 62));
      this.labelBadge.setVisible(true);
    } else {
      this.highlightRing.setVisible(false);
      this.labelBadge.setVisible(false);
    }

    // 2. Render destination marker, subtle breadcrumbs, and fading ripples
    this.pathGfx.clear();

    const accent = activeRole === 'chef' ? 0xd97706 : 0xec4899;

    if (path.length > 0) {
      for (let i = 0; i < path.length; i++) {
        const pt = gridToIso(path[i].col, path[i].row);
        const isLast = i === path.length - 1;
        if (isLast) {
          const pulse = 1 + Math.sin(this.elapsedSec * 7.5) * 0.14;
          this.pathGfx.lineStyle(2.5, accent, 0.88);
          this.pathGfx.strokeEllipse(pt.x, pt.y + 3, 28 * pulse, 15 * pulse);
          this.pathGfx.fillStyle(accent, 0.2);
          this.pathGfx.fillEllipse(pt.x, pt.y + 3, 18 * pulse, 9.5 * pulse);
        } else {
          this.pathGfx.fillStyle(accent, 0.5);
          this.pathGfx.fillCircle(pt.x, pt.y + 3, 3.2);
        }
      }
    } else if (destination) {
      const pt = gridToIso(destination.col, destination.row);
      const pulse = 1 + Math.sin(this.elapsedSec * 7.5) * 0.12;
      this.pathGfx.lineStyle(2, accent, 0.7);
      this.pathGfx.strokeEllipse(pt.x, pt.y + 3, 24 * pulse, 13 * pulse);
    }

    // Update & draw fading tap/blocked ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.age += dtSeconds;
      if (r.age >= r.duration) {
        this.ripples.splice(i, 1);
        continue;
      }
      const progress = r.age / r.duration;
      const alpha = (1 - progress) * 0.85;
      const radiusScale = 0.7 + progress * 1.15;
      const pt = gridToIso(r.col, r.row);

      this.pathGfx.lineStyle(2.5, r.color, alpha);
      this.pathGfx.strokeEllipse(pt.x, pt.y + 3, 30 * radiusScale, 16 * radiusScale);

      // Subtle X cross for blocked feedback
      if (r.color === 0xef4444) {
        const half = 6;
        this.pathGfx.lineStyle(2.2, 0xef4444, alpha);
        this.pathGfx.lineBetween(pt.x - half, pt.y - 3, pt.x + half, pt.y + 7);
        this.pathGfx.lineBetween(pt.x + half, pt.y - 3, pt.x - half, pt.y + 7);
      }
    }
  }

  public destroy(): void {
    this.pathGfx.destroy();
    this.highlightRing.destroy();
    this.labelBadge.destroy();
    this.ripples = [];
  }
}
