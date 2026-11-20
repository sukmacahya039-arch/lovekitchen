import Phaser from 'phaser';
import { gameBridge } from '../systems/ui/GameBridge.ts';

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super('LobbyScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#FFF6EC');
    gameBridge.patch({ activeScene: 'LobbyScene' });

    const g = this.add.graphics();
    g.fillGradientStyle(0xfff6ec, 0xfff2e6, 0xffe0d6, 0xffd7e3, 1);
    g.fillRect(0, 0, 1280, 720);

    for (let i = 0; i < 6; i++) {
      const x = 140 + i * 200;
      const y = 620 + (i % 2) * 28;
      if (this.textures.exists('prop_table')) {
        this.add.image(x, y, 'prop_table').setAlpha(0.28).setScale(1.1);
      }
    }
  }
}
