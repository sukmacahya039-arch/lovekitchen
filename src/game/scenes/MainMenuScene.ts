import Phaser from 'phaser';
import type { ChefAnimState, WaiterAnimState } from '../../shared/types.ts';
import { audioManager } from '../systems/audio/AudioManager.ts';
import {
  CHAR_SHADOW_KEY,
  CHEF_SHEET_KEY,
  WAITER_SHEET_KEY,
} from '../systems/character/CharacterAnimations.ts';
import { CharacterAnimator } from '../systems/character/CharacterAnimator.ts';
import { gameBridge } from '../systems/ui/GameBridge.ts';

const CHEF_MENU_CYCLE: ChefAnimState[] = ['idle', 'frying', 'chopping', 'happy'];
const WAITER_MENU_CYCLE: WaiterAnimState[] = ['idle', 'carrying_tray', 'serving_food', 'happy'];

export class MainMenuScene extends Phaser.Scene {
  private chefAnimator?: CharacterAnimator;
  private waiterAnimator?: CharacterAnimator;
  private cycleTimer?: Phaser.Time.TimerEvent;
  private cycleIndex = 0;

  constructor() {
    super('MainMenuScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#FFF6EC');
    gameBridge.patch({ activeScene: 'MainMenuScene' });
    audioManager.startMusic('menu');

    // Warm sunlit isometric cafe tile backdrop in Phaser canvas
    const g = this.add.graphics();
    g.fillGradientStyle(0xfff6ec, 0xfff6ec, 0xffdfd4, 0xffd5dc, 1);
    g.fillRect(0, 0, 1280, 720);

    for (let x = -80; x < 1380; x += 130) {
      for (let y = 380; y < 780; y += 66) {
        const key = ((x + y) / 2) % 2 === 0 ? 'tile_kitchen_a' : 'tile_dining_a';
        if (this.textures.exists(key)) {
          this.add.image(x, y, key).setAlpha(0.32);
        }
      }
    }

    // Separate ground shadows + live animated 2.5D chibi Chef & Waiter sprites
    if (this.textures.exists(CHAR_SHADOW_KEY)) {
      this.add.image(116, 652, CHAR_SHADOW_KEY).setScale(1.35).setAlpha(0.78).setDepth(5);
      this.add.image(1164, 652, CHAR_SHADOW_KEY).setScale(1.35).setAlpha(0.78).setDepth(5);
    }

    if (this.textures.exists(CHEF_SHEET_KEY) && this.textures.exists(WAITER_SHEET_KEY)) {
      const chef = this.add.sprite(116, 656, CHEF_SHEET_KEY, 0).setOrigin(0.5, 0.94).setDepth(10);
      const waiter = this.add.sprite(1164, 656, WAITER_SHEET_KEY, 0).setOrigin(0.5, 0.94).setDepth(10);

      this.chefAnimator = new CharacterAnimator(this, 'chef', chef, 1.24);
      this.waiterAnimator = new CharacterAnimator(this, 'waiter', waiter, 1.24);

      this.chefAnimator.playState('frying', false);
      this.waiterAnimator.playState('carrying_tray', true);

      this.cycleTimer = this.time.addEvent({
        delay: 2800,
        loop: true,
        callback: () => {
          this.cycleIndex = (this.cycleIndex + 1) % CHEF_MENU_CYCLE.length;
          this.chefAnimator?.playState(CHEF_MENU_CYCLE[this.cycleIndex], false);
          this.waiterAnimator?.playState(WAITER_MENU_CYCLE[this.cycleIndex], true);
        },
      });
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cycleTimer?.remove(false);
      this.chefAnimator?.destroy();
      this.waiterAnimator?.destroy();
    });
  }
}
