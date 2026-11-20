import Phaser from 'phaser';
import { audioManager } from '../systems/audio/AudioManager.ts';
import { gameBridge } from '../systems/ui/GameBridge.ts';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#FFF6EC');
    gameBridge.patch({ activeScene: 'ResultScene' });
    audioManager.startMusic('menu');
    audioManager.playSfx('win');

    const g = this.add.graphics();
    g.fillGradientStyle(0xfff5e4, 0xfff0f5, 0xffd6c9, 0xffcce0, 1);
    g.fillRect(0, 0, 1280, 720);

    // Celebratory gentle floating sparkles
    for (let i = 0; i < 18; i++) {
      const dot = this.add.image(
        Phaser.Math.Between(80, 1200),
        Phaser.Math.Between(60, 660),
        'fx_dot'
      );
      dot.setTint(Phaser.Utils.Array.GetRandom([0xff6b6b, 0xfbbf24, 0x34d399, 0xf472b6]));
      dot.setScale(Phaser.Math.FloatBetween(0.6, 1.4));
      dot.setAlpha(0.45);
      this.tweens.add({
        targets: dot,
        y: dot.y - Phaser.Math.Between(25, 65),
        alpha: 0.1,
        duration: Phaser.Math.Between(1600, 3200),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }
}
