import Phaser from 'phaser';
import type { GameEffectEvent } from '../../../shared/types.ts';
import { audioManager } from '../audio/AudioManager.ts';
import { gridToIso } from '../restaurant/IsometricGrid.ts';

/**
 * Displays floating score/order/burn feedback in the 2.5D Phaser world
 * and plays corresponding tactile cartoon audio cues.
 */
export class OrderSystem {
  private scene: Phaser.Scene;
  private seenEventIds = new Set<string>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public processEvents(events: GameEffectEvent[]): void {
    for (const evt of events) {
      if (this.seenEventIds.has(evt.id)) continue;
      this.seenEventIds.add(evt.id);

      const pos = gridToIso(evt.col, evt.row);
      this.spawnFloatingText(pos.x, pos.y - 54, evt.text, evt.color);
      this.playEventSound(evt.type);
    }

    // Keep seen set bounded
    if (this.seenEventIds.size > 120) {
      const keep = Array.from(this.seenEventIds).slice(-60);
      this.seenEventIds = new Set(keep);
    }
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string): void {
    const label = this.scene.add.text(x, y, text, {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      backgroundColor: color,
      padding: { x: 8, y: 3 },
    });
    label.setOrigin(0.5);
    label.setDepth(5000);

    this.scene.tweens.add({
      targets: label,
      y: y - 44,
      alpha: 0,
      duration: 1150,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  private playEventSound(type: GameEffectEvent['type']): void {
    switch (type) {
      case 'score':
      case 'combo':
        audioManager.playSfx('coin');
        break;
      case 'serve':
        audioManager.playSfx('serve');
        break;
      case 'order':
        audioManager.playSfx('order');
        break;
      case 'clean':
        audioManager.playSfx('clean');
        break;
      case 'burn':
      case 'leave_angry':
        audioManager.playSfx('burn');
        break;
    }
  }
}
