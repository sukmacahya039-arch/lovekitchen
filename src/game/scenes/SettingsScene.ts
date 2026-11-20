import Phaser from 'phaser';
import { gameBridge } from '../systems/ui/GameBridge.ts';

export class SettingsScene extends Phaser.Scene {
  constructor() {
    super('SettingsScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#FFF6EC');
    gameBridge.patch({ activeScene: 'SettingsScene' });

    const g = this.add.graphics();
    g.fillGradientStyle(0xfff6ec, 0xfff6ec, 0xfee2d5, 0xfde2ec, 1);
    g.fillRect(0, 0, 1280, 720);
  }
}
