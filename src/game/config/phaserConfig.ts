import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene.ts';
import { CharacterSelectionScene } from '../scenes/CharacterSelectionScene.ts';
import { LobbyScene } from '../scenes/LobbyScene.ts';
import { MainMenuScene } from '../scenes/MainMenuScene.ts';
import { PauseScene } from '../scenes/PauseScene.ts';
import { PreloadScene } from '../scenes/PreloadScene.ts';
import { RestaurantScene } from '../scenes/RestaurantScene.ts';
import { ResultScene } from '../scenes/ResultScene.ts';
import { SettingsScene } from '../scenes/SettingsScene.ts';

export function createPhaserConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: 1280,
    height: 720,
    backgroundColor: '#FFF6EC',
    antialias: true,
    roundPixels: false,
    fps: {
      target: 60,
      forceSetTimeOut: false,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 1280,
      height: 720,
    },
    scene: [
      BootScene,
      PreloadScene,
      MainMenuScene,
      LobbyScene,
      CharacterSelectionScene,
      RestaurantScene,
      PauseScene,
      ResultScene,
      SettingsScene,
    ],
  };
}
