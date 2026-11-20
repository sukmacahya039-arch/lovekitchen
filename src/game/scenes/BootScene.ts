import Phaser from 'phaser';
import { gameBridge } from '../systems/ui/GameBridge.ts';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#FFF6EC');
    gameBridge.patch({ activeScene: 'BootScene', preloadProgress: 0.1 });
    this.scene.start('PreloadScene');
  }
}
