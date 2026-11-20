import Phaser from 'phaser';
import {
  CHAR_SHADOW_KEY,
  CHEF_SHEET_KEY,
  WAITER_SHEET_KEY,
} from '../systems/character/CharacterAnimations.ts';
import { CharacterAnimator } from '../systems/character/CharacterAnimator.ts';
import { gameBridge } from '../systems/ui/GameBridge.ts';

export class CharacterSelectionScene extends Phaser.Scene {
  private chefAnimator?: CharacterAnimator;
  private waiterAnimator?: CharacterAnimator;
  private unsubBridge?: () => void;

  constructor() {
    super('CharacterSelectionScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#FFF6EC');
    gameBridge.patch({ activeScene: 'CharacterSelectionScene' });

    const g = this.add.graphics();
    g.fillGradientStyle(0xfff4e6, 0xffeef3, 0xffdfcf, 0xffd4e4, 1);
    g.fillRect(0, 0, 1280, 720);

    // Subtle kitchen (left) vs dining (right) split isometric floor pedestals
    if (this.textures.exists('tile_kitchen_a') && this.textures.exists('tile_dining_a')) {
      for (let i = 0; i < 6; i++) {
        this.add.image(90 + i * 95, 650, 'tile_kitchen_a').setAlpha(0.36);
        this.add.image(710 + i * 95, 650, 'tile_dining_a').setAlpha(0.36);
      }
    }

    // Soft spotlight pedestals behind the two live Phaser 3 characters
    const spotlight = this.add.graphics();
    spotlight.fillStyle(0xfef3c7, 0.72);
    spotlight.fillEllipse(152, 578, 170, 56);
    spotlight.fillStyle(0xfce7f3, 0.78);
    spotlight.fillEllipse(1128, 578, 170, 56);

    if (this.textures.exists(CHAR_SHADOW_KEY)) {
      this.add.image(152, 578, CHAR_SHADOW_KEY).setScale(1.45).setAlpha(0.82).setDepth(5);
      this.add.image(1128, 578, CHAR_SHADOW_KEY).setScale(1.45).setAlpha(0.82).setDepth(5);
    }

    if (this.textures.exists(CHEF_SHEET_KEY) && this.textures.exists(WAITER_SHEET_KEY)) {
      const chefSprite = this.add
        .sprite(152, 582, CHEF_SHEET_KEY, 0)
        .setOrigin(0.5, 0.94)
        .setDepth(12);
      const waiterSprite = this.add
        .sprite(1128, 582, WAITER_SHEET_KEY, 0)
        .setOrigin(0.5, 0.94)
        .setDepth(12);

      this.chefAnimator = new CharacterAnimator(this, 'chef', chefSprite, 1.48);
      this.waiterAnimator = new CharacterAnimator(this, 'waiter', waiterSprite, 1.48);

      // Sync live animations whenever the user tests animations in CharacterSelectionOverlay
      this.unsubBridge = gameBridge.subscribe((state) => {
        this.chefAnimator?.playState(state.previewAnims.chef, false);
        this.waiterAnimator?.playState(state.previewAnims.waiter, false);
      });
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubBridge?.();
      this.chefAnimator?.destroy();
      this.waiterAnimator?.destroy();
    });
  }
}
