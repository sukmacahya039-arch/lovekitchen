import Phaser from 'phaser';
import { gameBridge } from '../systems/ui/GameBridge.ts';

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('PauseScene');
  }

  create(): void {
    gameBridge.patch({ activeScene: 'PauseScene' });
    // Translucent warm dimmer over the live paused RestaurantScene
    this.add.rectangle(640, 360, 1280, 720, 0x3b2318, 0.45);
  }
}
