import Phaser from 'phaser';
import { generateProceduralTextures } from '../assets/ProceduralAssets.ts';
import { registerCharacterAnimations } from '../systems/character/CharacterAnimations.ts';
import { generateCharacterSpritesheets } from '../systems/character/CharacterSpritesheetGenerator.ts';
import { gameBridge } from '../systems/ui/GameBridge.ts';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    this.cameras.main.setBackgroundColor('#FFF6EC');
    gameBridge.patch({ activeScene: 'PreloadScene', preloadProgress: 0.25 });

    this.load.on('progress', (val: number) => {
      gameBridge.patch({ preloadProgress: 0.25 + val * 0.5 });
    });

    // Preload generated character key art into Phaser texture cache
    this.load.image('art_hero', '/src/assets/images/love_kitchen_hero_1795146589383.jpg');
    this.load.image('art_chef', '/src/assets/images/chef_character_card_1795146589720.jpg');
    this.load.image('art_waiter', '/src/assets/images/waiter_character_card_1795146589105.jpg');
  }

  create(): void {
    generateProceduralTextures(this);
    gameBridge.patch({ preloadProgress: 0.85 });

    // Generate Android-optimized 2.5D character spritesheets + separate shadow & register 34 animations
    generateCharacterSpritesheets(this);
    registerCharacterAnimations(this);
    gameBridge.patch({ preloadProgress: 1 });

    this.time.delayedCall(350, () => {
      this.scene.start('MainMenuScene');
      gameBridge.patch({ activeScene: 'MainMenuScene' });
    });
  }
}
