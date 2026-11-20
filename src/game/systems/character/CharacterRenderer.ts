import Phaser from 'phaser';
import type {
  CarriedItem,
  FacingDirection,
  PlayerAvatarState,
  PlayerRole,
} from '../../../shared/types.ts';
import { computeIsoDepth, gridToIso } from '../restaurant/IsometricGrid.ts';
import { CHAR_SHADOW_KEY, getSheetKey } from './CharacterAnimations.ts';
import { CharacterAnimator } from './CharacterAnimator.ts';

export interface LocalCharacterMotion {
  col: number;
  row: number;
  facing: FacingDirection;
  isMoving: boolean;
  isRunning: boolean;
}

export class CharacterRenderer {
  private scene: Phaser.Scene;
  private containers: Record<PlayerRole, Phaser.GameObjects.Container>;
  private shadows: Record<PlayerRole, Phaser.GameObjects.Image>;
  private sprites: Record<PlayerRole, Phaser.GameObjects.Sprite>;
  private animators: Record<PlayerRole, CharacterAnimator>;
  private itemIcons: Record<PlayerRole, Phaser.GameObjects.Image>;
  private nameTags: Record<PlayerRole, Phaser.GameObjects.Text>;
  private emoteTexts: Record<PlayerRole, Phaser.GameObjects.Text>;
  private activeRing: Phaser.GameObjects.Ellipse;
  private elapsedSec = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Ground selection ring sits just above floor tiles
    this.activeRing = scene.add.ellipse(0, 0, 60, 30, 0xff6b6b, 0.2);
    this.activeRing.setStrokeStyle(3, 0xff5a6e, 0.9);
    this.activeRing.setDepth(5);

    // Separate soft ground shadows for crisp 2.5D depth sorting
    this.shadows = {
      chef: scene.add.image(0, 0, CHAR_SHADOW_KEY).setAlpha(0.84).setDepth(10),
      waiter: scene.add.image(0, 0, CHAR_SHADOW_KEY).setAlpha(0.84).setDepth(10),
    };

    this.containers = {
      chef: this.createAvatar('chef', '#D97706'),
      waiter: this.createAvatar('waiter', '#EC4899'),
    };

    this.sprites = {
      chef: this.containers.chef.getByName('sprite') as Phaser.GameObjects.Sprite,
      waiter: this.containers.waiter.getByName('sprite') as Phaser.GameObjects.Sprite,
    };

    this.animators = {
      chef: new CharacterAnimator(scene, 'chef', this.sprites.chef, 0.8),
      waiter: new CharacterAnimator(scene, 'waiter', this.sprites.waiter, 0.8),
    };

    this.itemIcons = {
      chef: this.containers.chef.getByName('item') as Phaser.GameObjects.Image,
      waiter: this.containers.waiter.getByName('item') as Phaser.GameObjects.Image,
    };

    this.nameTags = {
      chef: this.containers.chef.getByName('nameTag') as Phaser.GameObjects.Text,
      waiter: this.containers.waiter.getByName('nameTag') as Phaser.GameObjects.Text,
    };

    this.emoteTexts = {
      chef: this.containers.chef.getByName('emote') as Phaser.GameObjects.Text,
      waiter: this.containers.waiter.getByName('emote') as Phaser.GameObjects.Text,
    };

    // Start in idle animation cleanly
    this.animators.chef.playState('idle', false);
    this.animators.waiter.playState('idle', false);
  }

  private createAvatar(role: PlayerRole, badgeColor: string): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);

    // Animated spritesheet character anchored at bottom-center feet
    const sprite = this.scene.add.sprite(0, 8, getSheetKey(role), 0);
    sprite.setName('sprite');
    sprite.setOrigin(0.5, 0.94);

    const item = this.scene.add.image(
      role === 'waiter' ? 24 : 20,
      -34,
      'dish_heart_burger_cooked'
    );
    item.setName('item');
    item.setScale(0.72);
    item.setVisible(false);

    const nameTag = this.scene.add.text(0, -102, role === 'chef' ? 'Chef' : 'Waiter', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '13px',
      color: '#FFFFFF',
      backgroundColor: badgeColor,
      padding: { x: 8, y: 2 },
    });
    nameTag.setName('nameTag');
    nameTag.setOrigin(0.5, 0.5);

    const emote = this.scene.add.text(0, -124, '', {
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#3B2318',
      backgroundColor: '#FFFDF9',
      padding: { x: 8, y: 3 },
    });
    emote.setName('emote');
    emote.setOrigin(0.5, 0.5);
    emote.setVisible(false);

    container.add([sprite, item, nameTag, emote]);
    return container;
  }

  public sync(
    players: Record<PlayerRole, PlayerAvatarState>,
    localRole: PlayerRole,
    localMotion: LocalCharacterMotion,
    dtSeconds: number,
    timeRemaining = 120
  ): void {
    this.elapsedSec += dtSeconds;
    const nowMs = Date.now();

    (['chef', 'waiter'] as PlayerRole[]).forEach((role) => {
      const state = players[role];
      const container = this.containers[role];
      const shadow = this.shadows[role];
      const animator = this.animators[role];
      const itemIcon = this.itemIcons[role];
      const nameTag = this.nameTags[role];
      const emoteText = this.emoteTexts[role];

      const isLocal = role === localRole;
      const targetCol = isLocal ? localMotion.col : state.col;
      const targetRow = isLocal ? localMotion.row : state.row;
      const iso = gridToIso(targetCol, targetRow);

      if (container.x === 0 && container.y === 0) {
        container.setPosition(iso.x, iso.y);
      } else {
        const lerpFactor = isLocal ? 0.45 : 0.25;
        container.x = Phaser.Math.Linear(container.x, iso.x, lerpFactor);
        container.y = Phaser.Math.Linear(container.y, iso.y, lerpFactor);
      }

      // Ground/feet-based 2.5D depth sorting:
      // floor (0..5) < ground shadow (offset 8) < furniture (15..18) < character feet (offset 24).
      // Because tile sum scales by 100 per tile, walking behind a table (smaller col+row) renders
      // behind it, while walking in front of a table (larger col+row) renders cleanly in front!
      const bodyDepth = computeIsoDepth(targetCol, targetRow, 24);
      const shadowDepth = computeIsoDepth(targetCol, targetRow, 8);
      container.setDepth(bodyDepth);

      const moving = isLocal ? localMotion.isMoving : state.isMoving;
      const running = isLocal ? localMotion.isRunning : state.isRunning;
      const facing: FacingDirection = isLocal ? localMotion.facing : state.facing;

      const feedback = animator.update(
        {
          state,
          facing,
          isMoving: moving,
          isRunning: running,
          timeRemaining,
          nowMs,
        },
        this.elapsedSec
      );

      // Update separate dynamic ground shadow
      shadow.setPosition(container.x, container.y + 4);
      shadow.setDepth(shadowDepth);
      shadow.setScale(feedback.shadowScaleX, feedback.shadowScaleY);
      shadow.setAlpha(feedback.shadowAlpha);

      if (isLocal) {
        this.activeRing.setPosition(container.x, container.y + 4);
        this.activeRing.setDepth(computeIsoDepth(targetCol, targetRow, 4));
        this.activeRing.setScale(1 + Math.sin(this.elapsedSec * 5) * 0.05);
      }

      nameTag.setText(state.name);
      this.syncCarriedItem(role, itemIcon, state.carriedItem, facing, feedback.flipX);

      if (state.emote) {
        emoteText.setText(state.emote);
        emoteText.setVisible(true);
      } else {
        emoteText.setVisible(false);
      }
    });
  }

  private syncCarriedItem(
    role: PlayerRole,
    icon: Phaser.GameObjects.Image,
    item: CarriedItem | null,
    facing: FacingDirection,
    flipX: boolean
  ): void {
    if (!item) {
      icon.setVisible(false);
      return;
    }
    const key =
      item.state === 'burned'
        ? 'dish_burned'
        : `dish_${item.dishId}_${item.state === 'raw' ? 'raw' : 'cooked'}`;
    if (this.scene.textures.exists(key)) {
      icon.setTexture(key);
    }
    icon.setVisible(true);

    const bob = Math.sin(this.elapsedSec * 9) * 2.2;
    if (role === 'waiter') {
      // Positioned cleanly atop Waiter's raised silver serving tray
      const trayX = flipX || facing === 'left' ? -24 : 24;
      icon.setPosition(trayX, -42 + bob);
    } else {
      // Positioned in Chef's hands / serving plate
      const holdX = flipX || facing === 'left' ? -18 : facing === 'right' ? 18 : 0;
      icon.setPosition(holdX, -32 + bob);
    }
  }

  public destroy(): void {
    this.animators.chef.destroy();
    this.animators.waiter.destroy();
    this.activeRing.destroy();
    this.shadows.chef.destroy();
    this.shadows.waiter.destroy();
    this.containers.chef.destroy();
    this.containers.waiter.destroy();
  }
}
