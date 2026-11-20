import Phaser from 'phaser';
import type { CookingStationState } from '../../../shared/types.ts';
import { computeIsoDepth, gridToIso } from '../restaurant/IsometricGrid.ts';

interface StationVisual {
  container: Phaser.GameObjects.Container;
  dishIcon: Phaser.GameObjects.Image;
  ringGfx: Phaser.GameObjects.Graphics;
  statusText: Phaser.GameObjects.Text;
}

export class CookingSystem {
  private scene: Phaser.Scene;
  private visuals = new Map<string, StationVisual>();
  private pulseTime = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public sync(stations: CookingStationState[], dtSeconds: number): void {
    this.pulseTime += dtSeconds;

    for (const st of stations) {
      let vis = this.visuals.get(st.id);
      if (!vis) {
        vis = this.createVisual(st);
        this.visuals.set(st.id, vis);
      }
      this.updateVisual(vis, st);
    }
  }

  private createVisual(st: CookingStationState): StationVisual {
    const pos = gridToIso(st.col, st.row);
    const container = this.scene.add.container(pos.x, pos.y - 38);
    container.setDepth(computeIsoDepth(st.col, st.row, 26));

    const dishIcon = this.scene.add.image(0, 0, 'dish_heart_burger_raw');
    dishIcon.setScale(0.7);
    dishIcon.setVisible(false);

    const ringGfx = this.scene.add.graphics();
    const statusText = this.scene.add.text(0, -28, '', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '11px',
      color: '#FFFFFF',
      backgroundColor: '#16A34A',
      padding: { x: 5, y: 1 },
    });
    statusText.setOrigin(0.5);
    statusText.setVisible(false);

    container.add([dishIcon, ringGfx, statusText]);
    return { container, dishIcon, ringGfx, statusText };
  }

  private updateVisual(vis: StationVisual, st: CookingStationState): void {
    vis.ringGfx.clear();

    if (st.status === 'empty' || !st.dishId) {
      vis.dishIcon.setVisible(false);
      vis.statusText.setVisible(false);
      return;
    }

    vis.dishIcon.setVisible(true);

    if (st.status === 'cooking') {
      vis.dishIcon.setTexture(`dish_${st.dishId}_raw`);
      vis.dishIcon.y = Math.sin(this.pulseTime * 16) * 2;
      this.drawProgressArc(vis.ringGfx, 0, -20, 14, st.progress, 0xf97316);
      vis.statusText.setVisible(false);
    } else if (st.status === 'ready') {
      vis.dishIcon.setTexture(`dish_${st.dishId}_cooked`);
      vis.dishIcon.y = Math.sin(this.pulseTime * 8) * 2.5;
      const urgent = st.burnProgress > 0.55;
      this.drawProgressArc(vis.ringGfx, 0, -20, 14, 1 - st.burnProgress, urgent ? 0xef4444 : 0x22c55e);

      vis.statusText.setVisible(true);
      vis.statusText.setText(urgent ? 'HURRY!' : 'READY');
      vis.statusText.setBackgroundColor(urgent ? '#DC2626' : '#16A34A');
      vis.statusText.setScale(urgent ? 1 + Math.sin(this.pulseTime * 18) * 0.1 : 1);
    } else if (st.status === 'burned') {
      vis.dishIcon.setTexture('dish_burned');
      vis.dishIcon.y = 0;
      vis.statusText.setVisible(true);
      vis.statusText.setText('BURNED');
      vis.statusText.setBackgroundColor('#292524');
      vis.statusText.setScale(1);
    }
  }

  private drawProgressArc(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    radius: number,
    ratio: number,
    color: number
  ): void {
    const clamped = Math.max(0.02, Math.min(1, ratio));
    g.fillStyle(0x3b2318, 0.78);
    g.fillCircle(cx, cy, radius + 3);
    g.lineStyle(4, color, 1);
    g.beginPath();
    g.arc(
      cx,
      cy,
      radius,
      Phaser.Math.DegToRad(-90),
      Phaser.Math.DegToRad(-90 + 360 * clamped),
      false
    );
    g.strokePath();
  }

  public destroy(): void {
    this.visuals.forEach((v) => v.container.destroy());
    this.visuals.clear();
  }
}
