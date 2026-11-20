import Phaser from 'phaser';
import {
  CLEANING_STATION_POS,
  COOKING_STATIONS,
  DINING_TABLES,
  PANTRIES,
  PREP_TABLE_POS,
  REGISTER_POS,
  SERVING_PASS_SLOTS,
  TRASH_BIN_POS,
  WAIT_MAT_POS,
} from '../../../shared/layout.ts';
import type { CarriedItem, ServingSlotState } from '../../../shared/types.ts';
import { computeIsoDepth, gridToIso } from '../restaurant/IsometricGrid.ts';
import { RestaurantMapBuilder } from '../restaurant/RestaurantMapBuilder.ts';
import type { InteractableType } from '../interaction/RolePermissions.ts';

export interface InteractiveHotspot {
  id: string;
  interactableType: InteractableType;
  col: number;
  row: number;
  roleAllowed: 'chef' | 'waiter' | 'both';
  x: number;
  y: number;
}

export class KitchenSystem {
  private scene: Phaser.Scene;
  private mapBuilder: RestaurantMapBuilder;
  private passIcons = new Map<string, Phaser.GameObjects.Image>();
  private prepIcon!: Phaser.GameObjects.Image;
  private cashierBadge!: Phaser.GameObjects.Text;
  private cleanBadge!: Phaser.GameObjects.Text;
  private hotspots: InteractiveHotspot[] = [];

  constructor(
    scene: Phaser.Scene,
    onTapHotspot: (spot: InteractiveHotspot, pointer?: Phaser.Input.Pointer) => void
  ) {
    this.scene = scene;
    this.mapBuilder = new RestaurantMapBuilder(scene);

    this.buildInteractiveProps(onTapHotspot);
  }

  public getHotspots(): InteractiveHotspot[] {
    return this.hotspots;
  }

  public update(dtSeconds: number): void {
    this.mapBuilder.update(dtSeconds);
  }

  private buildInteractiveProps(
    onTapHotspot: (spot: InteractiveHotspot, pointer?: Phaser.Input.Pointer) => void
  ): void {
    // 1. Ingredient Storage (Chef)
    for (const p of PANTRIES) {
      const pos = gridToIso(p.col, p.row);
      const img = this.scene.add.image(pos.x, pos.y - 18, 'prop_pantry');
      img.setDepth(computeIsoDepth(p.col, p.row, 15));

      const dishPreview = this.scene.add.image(pos.x, pos.y - 38, `dish_${p.dishId}_cooked`);
      dishPreview.setScale(0.64);
      dishPreview.setDepth(computeIsoDepth(p.col, p.row, 17));

      this.addPropLabel(pos.x, pos.y + 8, p.label, '#4A2B1D', '#FFF6EC', computeIsoDepth(p.col, p.row, 18));

      this.registerHotspot(
        img,
        {
          id: p.id,
          interactableType: 'IngredientStorage',
          col: p.col,
          row: p.row,
          roleAllowed: 'chef',
          x: pos.x,
          y: pos.y,
        },
        onTapHotspot
      );
    }

    // 2. 3 Cooking Stations (Chef)
    for (const s of COOKING_STATIONS) {
      const pos = gridToIso(s.col, s.row);
      const img = this.scene.add.image(pos.x, pos.y - 16, `prop_stove_${s.appliance}`);
      img.setDepth(computeIsoDepth(s.col, s.row, 15));

      this.addPropLabel(pos.x, pos.y + 10, s.label, '#FFFFFF', '#5C3A28', computeIsoDepth(s.col, s.row, 18));

      this.registerHotspot(
        img,
        {
          id: s.id,
          interactableType: 'CookingStation',
          col: s.col,
          row: s.row,
          roleAllowed: 'chef',
          x: pos.x,
          y: pos.y,
        },
        onTapHotspot
      );
    }

    // 3. Preparation Table (Chef — chop/prep raw ingredients for faster cooking & bonus)
    {
      const pos = gridToIso(PREP_TABLE_POS.col, PREP_TABLE_POS.row);
      const img = this.scene.add.image(pos.x, pos.y - 16, 'prop_prep_table');
      img.setDepth(computeIsoDepth(PREP_TABLE_POS.col, PREP_TABLE_POS.row, 15));

      this.prepIcon = this.scene.add.image(pos.x, pos.y - 34, 'dish_heart_burger_raw');
      this.prepIcon.setScale(0.66);
      this.prepIcon.setVisible(false);
      this.prepIcon.setDepth(computeIsoDepth(PREP_TABLE_POS.col, PREP_TABLE_POS.row, 22));

      this.addPropLabel(
        pos.x,
        pos.y + 10,
        PREP_TABLE_POS.label,
        '#FFFFFF',
        '#B45309',
        computeIsoDepth(PREP_TABLE_POS.col, PREP_TABLE_POS.row, 18)
      );

      this.registerHotspot(
        img,
        {
          id: PREP_TABLE_POS.id,
          interactableType: 'PreparationTable',
          col: PREP_TABLE_POS.col,
          row: PREP_TABLE_POS.row,
          roleAllowed: 'chef',
          x: pos.x,
          y: pos.y,
        },
        onTapHotspot
      );
    }

    // 4. Food Pickup Counter (Both Chef & Waiter)
    for (const slot of SERVING_PASS_SLOTS) {
      const pos = gridToIso(slot.col, slot.row);
      const img = this.scene.add.image(pos.x, pos.y - 16, 'prop_counter_pass');
      img.setDepth(computeIsoDepth(slot.col, slot.row, 15));

      const dishImg = this.scene.add.image(pos.x, pos.y - 38, 'dish_heart_burger_cooked');
      dishImg.setScale(0.72);
      dishImg.setVisible(false);
      dishImg.setDepth(computeIsoDepth(slot.col, slot.row, 22));
      this.passIcons.set(slot.id, dishImg);

      this.registerHotspot(
        img,
        {
          id: slot.id,
          interactableType: 'FoodCounter',
          col: slot.col,
          row: slot.row,
          roleAllowed: 'both',
          x: pos.x,
          y: pos.y,
        },
        onTapHotspot
      );
    }

    // 5. Trash Bin (Chef)
    {
      const pos = gridToIso(TRASH_BIN_POS.col, TRASH_BIN_POS.row);
      const img = this.scene.add.image(pos.x, pos.y - 16, 'prop_trash');
      img.setDepth(computeIsoDepth(TRASH_BIN_POS.col, TRASH_BIN_POS.row, 15));

      this.addPropLabel(
        pos.x,
        pos.y + 12,
        TRASH_BIN_POS.label,
        '#FFFFFF',
        '#64748B',
        computeIsoDepth(TRASH_BIN_POS.col, TRASH_BIN_POS.row, 18)
      );

      this.registerHotspot(
        img,
        {
          id: TRASH_BIN_POS.id,
          interactableType: 'TrashBin',
          col: TRASH_BIN_POS.col,
          row: TRASH_BIN_POS.row,
          roleAllowed: 'chef',
          x: pos.x,
          y: pos.y,
        },
        onTapHotspot
      );
    }

    // 6. 6 Dining Tables with Chairs (Waiter)
    for (const t of DINING_TABLES) {
      const pos = gridToIso(t.col, t.row);
      const img = this.scene.add.image(pos.x, pos.y - 14, 'prop_table');
      img.setScale(0.92);
      img.setDepth(computeIsoDepth(t.col, t.row, 15));

      this.registerHotspot(
        img,
        {
          id: t.id,
          interactableType: 'DiningTable',
          col: t.col,
          row: t.row,
          roleAllowed: 'waiter',
          x: pos.x,
          y: pos.y,
        },
        onTapHotspot
      );
    }

    // 7. Interactive Cashier Counter (Waiter)
    {
      const pos = gridToIso(REGISTER_POS.col, REGISTER_POS.row);
      const img = this.scene.add.image(pos.x, pos.y - 18, 'prop_register');
      img.setDepth(computeIsoDepth(REGISTER_POS.col, REGISTER_POS.row, 15));

      this.addPropLabel(
        pos.x,
        pos.y + 10,
        REGISTER_POS.label,
        '#FFFFFF',
        '#D97706',
        computeIsoDepth(REGISTER_POS.col, REGISTER_POS.row, 18)
      );

      this.cashierBadge = this.scene.add
        .text(pos.x, pos.y - 54, '', {
          fontFamily: '"Fredoka", sans-serif',
          fontSize: '11px',
          color: '#FFFFFF',
          backgroundColor: '#16A34A',
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5)
        .setVisible(false)
        .setDepth(computeIsoDepth(REGISTER_POS.col, REGISTER_POS.row, 26));

      this.registerHotspot(
        img,
        {
          id: REGISTER_POS.id,
          interactableType: 'Cashier',
          col: REGISTER_POS.col,
          row: REGISTER_POS.row,
          roleAllowed: 'waiter',
          x: pos.x,
          y: pos.y,
        },
        onTapHotspot
      );
    }

    // 8. Interactive Cleaning Station (Waiter)
    {
      const pos = gridToIso(CLEANING_STATION_POS.col, CLEANING_STATION_POS.row);
      const img = this.scene.add.image(pos.x, pos.y - 18, 'prop_cleaning_station');
      img.setDepth(computeIsoDepth(CLEANING_STATION_POS.col, CLEANING_STATION_POS.row, 15));

      this.addPropLabel(
        pos.x,
        pos.y + 10,
        CLEANING_STATION_POS.label,
        '#FFFFFF',
        '#0284C7',
        computeIsoDepth(CLEANING_STATION_POS.col, CLEANING_STATION_POS.row, 18)
      );

      this.cleanBadge = this.scene.add
        .text(pos.x, pos.y - 54, '2x Sparkle!', {
          fontFamily: '"Fredoka", sans-serif',
          fontSize: '10px',
          color: '#FFFFFF',
          backgroundColor: '#0EA5E9',
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5)
        .setVisible(false)
        .setDepth(computeIsoDepth(CLEANING_STATION_POS.col, CLEANING_STATION_POS.row, 26));

      this.registerHotspot(
        img,
        {
          id: CLEANING_STATION_POS.id,
          interactableType: 'CleaningStation',
          col: CLEANING_STATION_POS.col,
          row: CLEANING_STATION_POS.row,
          roleAllowed: 'waiter',
          x: pos.x,
          y: pos.y,
        },
        onTapHotspot
      );
    }

    // 9. Entrance Waiting Queue Mat Hotspot (Waiter)
    {
      const pos = gridToIso(WAIT_MAT_POS.col, WAIT_MAT_POS.row);
      const zone = this.scene.add
        .zone(pos.x, pos.y, 84, 58)
        .setInteractive({ useHandCursor: true });
      const spot: InteractiveHotspot = {
        id: WAIT_MAT_POS.id,
        interactableType: 'Customer',
        col: WAIT_MAT_POS.col,
        row: WAIT_MAT_POS.row,
        roleAllowed: 'waiter',
        x: pos.x,
        y: pos.y,
      };
      this.hotspots.push(spot);
      zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => onTapHotspot(spot, pointer));
    }
  }

  private addPropLabel(
    x: number,
    y: number,
    text: string,
    color: string,
    backgroundColor: string,
    depth: number
  ): void {
    this.scene.add
      .text(x, y, text, {
        fontFamily: '"Fredoka", sans-serif',
        fontSize: '10px',
        color,
        backgroundColor,
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5)
      .setDepth(depth);
  }

  private registerHotspot(
    target: Phaser.GameObjects.Image,
    spot: InteractiveHotspot,
    onTap: (spot: InteractiveHotspot, pointer?: Phaser.Input.Pointer) => void
  ): void {
    this.hotspots.push(spot);
    target.setInteractive({ useHandCursor: true });
    target.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      onTap(spot, pointer);
    });
  }

  public syncServingPass(slots: ServingSlotState[]): void {
    for (const slot of slots) {
      const icon = this.passIcons.get(slot.id);
      if (!icon) continue;
      if (!slot.item) {
        icon.setVisible(false);
      } else {
        const key =
          slot.item.state === 'burned' ? 'dish_burned' : `dish_${slot.item.dishId}_cooked`;
        if (this.scene.textures.exists(key)) icon.setTexture(key);
        icon.setVisible(true);
      }
    }
  }

  public syncCafeProps(
    prepTableItem: CarriedItem | null,
    cashierTips: number,
    waiterCleanBuffActive: boolean
  ): void {
    if (!prepTableItem) {
      this.prepIcon.setVisible(false);
    } else {
      const key =
        prepTableItem.state === 'burned'
          ? 'dish_burned'
          : `dish_${prepTableItem.dishId}_${prepTableItem.state === 'raw' ? 'raw' : 'cooked'}`;
      if (this.scene.textures.exists(key)) this.prepIcon.setTexture(key);
      this.prepIcon.setVisible(true);
    }

    if (cashierTips > 0) {
      this.cashierBadge.setText(`Collect $${cashierTips}`);
      this.cashierBadge.setVisible(true);
    } else {
      this.cashierBadge.setVisible(false);
    }

    this.cleanBadge.setVisible(waiterCleanBuffActive);
  }

  public destroy(): void {
    this.mapBuilder.destroy();
    this.prepIcon?.destroy();
    this.cashierBadge?.destroy();
    this.cleanBadge?.destroy();
    this.passIcons.forEach((i) => i.destroy());
    this.passIcons.clear();
  }
}
