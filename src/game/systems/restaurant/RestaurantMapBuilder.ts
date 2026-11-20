import Phaser from 'phaser';
import {
  DECOR_PLANTS,
  DIVIDER_COL,
  DIVIDER_DECOR_ROWS,
  ENTRANCE_DOOR_POS,
  GRID_COLS,
  GRID_ROWS,
  QUEUE_SLOTS,
  WAIT_MAT_POS,
} from '../../../shared/layout.ts';
import { computeIsoDepth, gridToIso } from './IsometricGrid.ts';

interface AmbientSteam {
  sprite: Phaser.GameObjects.Arc;
  baseX: number;
  baseY: number;
  phase: number;
}

/**
 * Builds the 2.5D Isometric Pastel Burger Cafe interior:
 * - Textured kitchen & dining floor + queue carpet
 * - Wainscoted pastel walls, sunlit cafe windows with diagonal light beams
 * - Striped Burger Cafe entrance glass door & awning
 * - Glowing signboard, chalkboard menu, animated ticking wall clock,
 *   hanging warm pendant lamps, swaying potted plants, and rising kitchen steam.
 */
export class RestaurantMapBuilder {
  private scene: Phaser.Scene;
  private lampHalos: Phaser.GameObjects.Ellipse[] = [];
  private swayingPlants: Array<{ img: Phaser.GameObjects.Image; phase: number }> = [];
  private steamPuffs: AmbientSteam[] = [];
  private clockHandMinute?: Phaser.GameObjects.Line;
  private clockHandHour?: Phaser.GameObjects.Line;
  private openSignText?: Phaser.GameObjects.Text;
  private animTime = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.buildWallsAndWindows();
    this.buildFloorTiles();
    this.buildDividerArchitecture();
    this.buildEntranceAndQueueDecor();
    this.buildWarmLightingAndDecor();
  }

  private buildWallsAndWindows(): void {
    const topCorner = gridToIso(-0.5, -0.5);
    const leftCorner = gridToIso(-0.5, GRID_ROWS - 0.5);
    const rightCorner = gridToIso(GRID_COLS - 0.5, -0.5);
    const dividerWallTop = gridToIso(DIVIDER_COL - 0.5, -0.5);
    const wallHeight = 96;

    const wall = this.scene.add.graphics();
    wall.setDepth(1);

    // 1. Left Kitchen Back Wall (soft cream-peach with mint wainscoting)
    wall.fillStyle(0xffefe0, 1);
    wall.lineStyle(2.5, 0x7c4a32, 0.72);
    wall.beginPath();
    wall.moveTo(leftCorner.x, leftCorner.y);
    wall.lineTo(topCorner.x, topCorner.y);
    wall.lineTo(topCorner.x, topCorner.y - wallHeight);
    wall.lineTo(leftCorner.x, leftCorner.y - wallHeight);
    wall.closePath();
    wall.fillPath();
    wall.strokePath();

    // Lower mint pastel backsplash along left kitchen wall
    wall.fillStyle(0xd8f3e3, 0.85);
    wall.beginPath();
    wall.moveTo(leftCorner.x, leftCorner.y);
    wall.lineTo(topCorner.x, topCorner.y);
    wall.lineTo(topCorner.x, topCorner.y - 34);
    wall.lineTo(leftCorner.x, leftCorner.y - 34);
    wall.closePath();
    wall.fillPath();

    // 2. Right-Top Kitchen Wall Segment (0..DIVIDER_COL)
    wall.fillStyle(0xffe8d2, 1);
    wall.beginPath();
    wall.moveTo(topCorner.x, topCorner.y);
    wall.lineTo(dividerWallTop.x, dividerWallTop.y);
    wall.lineTo(dividerWallTop.x, dividerWallTop.y - wallHeight);
    wall.lineTo(topCorner.x, topCorner.y - wallHeight);
    wall.closePath();
    wall.fillPath();
    wall.strokePath();

    // 3. Right-Top Dining Wall Segment (DIVIDER_COL..GRID_COLS) — pastel strawberry cream
    wall.fillStyle(0xffe4ec, 1);
    wall.beginPath();
    wall.moveTo(dividerWallTop.x, dividerWallTop.y);
    wall.lineTo(rightCorner.x, rightCorner.y);
    wall.lineTo(rightCorner.x, rightCorner.y - wallHeight);
    wall.lineTo(dividerWallTop.x, dividerWallTop.y - wallHeight);
    wall.closePath();
    wall.fillPath();
    wall.strokePath();

    // Warm honey-wood wainscoting along Dining back wall
    wall.fillStyle(0xf5cfa4, 0.9);
    wall.beginPath();
    wall.moveTo(dividerWallTop.x, dividerWallTop.y);
    wall.lineTo(rightCorner.x, rightCorner.y);
    wall.lineTo(rightCorner.x, rightCorner.y - 32);
    wall.lineTo(dividerWallTop.x, dividerWallTop.y - 32);
    wall.closePath();
    wall.fillPath();

    // Pastel top molding stripe along full roof rim
    wall.lineStyle(5, 0xff8fa3, 0.9);
    wall.beginPath();
    wall.moveTo(leftCorner.x, leftCorner.y - wallHeight);
    wall.lineTo(topCorner.x, topCorner.y - wallHeight);
    wall.lineTo(rightCorner.x, rightCorner.y - wallHeight);
    wall.strokePath();

    // 4. Sunlit Cafe Windows along Dining back wall (cols 7.2..8.8 and 10.2..11.8)
    this.drawIsoWindow(wall, 7.1, 8.7);
    this.drawIsoWindow(wall, 10.1, 11.7);

    // 5. Kitchen Chalkboard Menu & Shelf on Kitchen back wall
    const menuL = gridToIso(1.1, -0.45);
    const menuR = gridToIso(3.5, -0.45);
    wall.fillStyle(0x3b2f2f, 0.92);
    wall.lineStyle(3, 0xd99b58, 1);
    wall.beginPath();
    wall.moveTo(menuL.x, menuL.y - 40);
    wall.lineTo(menuR.x, menuR.y - 40);
    wall.lineTo(menuR.x, menuR.y - 78);
    wall.lineTo(menuL.x, menuL.y - 78);
    wall.closePath();
    wall.fillPath();
    wall.strokePath();

    const menuMid = gridToIso(2.3, -0.45);
    this.scene.add
      .text(menuMid.x, menuMid.y - 60, 'BURGER CAFE MENU', {
        fontFamily: '"Fredoka", sans-serif',
        fontSize: '11px',
        color: '#FEF3C7',
      })
      .setOrigin(0.5)
      .setRotation(0.46)
      .setDepth(2);

    // 6. Love Burger Cafe Wall Emblem above Dining Area
    const signCenter = gridToIso(9.4, -0.45);
    const signGfx = this.scene.add.graphics().setDepth(2);
    signGfx.fillStyle(0xfffdf8, 0.96);
    signGfx.lineStyle(2.5, 0xff5a6e, 1);
    signGfx.fillRoundedRect(signCenter.x - 66, signCenter.y - 102, 132, 26, 10);
    signGfx.strokeRoundedRect(signCenter.x - 66, signCenter.y - 102, 132, 26, 10);

    this.scene.add
      .text(signCenter.x, signCenter.y - 89, 'LOVE BURGER CAFE', {
        fontFamily: '"Fredoka", sans-serif',
        fontSize: '12px',
        color: '#BE185D',
      })
      .setOrigin(0.5)
      .setDepth(2);

    // 7. Animated Wall Clock on Kitchen Left Wall
    const clockPos = gridToIso(-0.45, 2.4);
    const clockGfx = this.scene.add.graphics().setDepth(2);
    clockGfx.fillStyle(0xfffdf9, 1);
    clockGfx.lineStyle(2.5, 0x8c5338, 1);
    clockGfx.fillCircle(clockPos.x, clockPos.y - 58, 13);
    clockGfx.strokeCircle(clockPos.x, clockPos.y - 58, 13);
    this.clockHandHour = this.scene.add
      .line(clockPos.x, clockPos.y - 58, 0, 0, 0, -6, 0x3b2318, 1)
      .setLineWidth(2)
      .setOrigin(0, 0)
      .setDepth(2);
    this.clockHandMinute = this.scene.add
      .line(clockPos.x, clockPos.y - 58, 0, 0, 0, -9, 0xff5a6e, 1)
      .setLineWidth(1.5)
      .setOrigin(0, 0)
      .setDepth(2);
  }

  private drawIsoWindow(g: Phaser.GameObjects.Graphics, colA: number, colB: number): void {
    const a = gridToIso(colA, -0.48);
    const b = gridToIso(colB, -0.48);
    const bottomOffset = 38;
    const topOffset = 82;

    // Sky glass pane
    g.fillStyle(0xbfe9ff, 0.95);
    g.lineStyle(3, 0xffffff, 1);
    g.beginPath();
    g.moveTo(a.x, a.y - bottomOffset);
    g.lineTo(b.x, b.y - bottomOffset);
    g.lineTo(b.x, b.y - topOffset);
    g.lineTo(a.x, a.y - topOffset);
    g.closePath();
    g.fillPath();
    g.strokePath();

    // Soft white sky cloud highlight inside window
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2 - 64;
    g.fillStyle(0xffffff, 0.72);
    g.fillEllipse(midX - 6, midY, 18, 7);
    g.fillEllipse(midX + 8, midY + 4, 14, 6);

    // Window cross muntin bars
    g.lineStyle(2, 0xffffff, 0.95);
    g.beginPath();
    g.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - bottomOffset);
    g.lineTo((a.x + b.x) / 2, (a.y + b.y) / 2 - topOffset);
    g.moveTo(a.x, a.y - (bottomOffset + topOffset) / 2);
    g.lineTo(b.x, b.y - (bottomOffset + topOffset) / 2);
    g.strokePath();

    // Diagonal warm sunlight shaft cast softly onto dining floor
    const floorA = gridToIso(colA - 0.5, 1.3);
    const floorB = gridToIso(colB - 0.5, 1.3);
    const beam = this.scene.add.graphics().setDepth(4);
    beam.fillStyle(0xfff3b0, 0.14);
    beam.beginPath();
    beam.moveTo(a.x, a.y - bottomOffset + 2);
    beam.lineTo(b.x, b.y - bottomOffset + 2);
    beam.lineTo(floorB.x, floorB.y);
    beam.lineTo(floorA.x, floorA.y);
    beam.closePath();
    beam.fillPath();
  }

  private buildFloorTiles(): void {
    const queueSet = new Set(QUEUE_SLOTS.map((q) => `${q.col},${q.row}`));

    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        const pos = gridToIso(col, row);
        let tileKey = (col + row) % 2 === 0 ? 'tile_dining_a' : 'tile_dining_b';
        if (col < DIVIDER_COL) {
          tileKey = (col + row) % 2 === 0 ? 'tile_kitchen_a' : 'tile_kitchen_b';
        } else if (col === DIVIDER_COL) {
          tileKey = 'tile_pass_floor';
        }
        if (col === WAIT_MAT_POS.col && row === WAIT_MAT_POS.row) {
          tileKey = 'tile_wait_mat';
        } else if (queueSet.has(`${col},${row}`)) {
          tileKey = 'tile_queue_carpet';
        }

        const tile = this.scene.add.image(pos.x, pos.y + 4, tileKey);
        tile.setDepth(3);
      }
    }
  }

  private buildDividerArchitecture(): void {
    // Solid divider counter segments on non-slot rows of DIVIDER_COL
    for (const row of DIVIDER_DECOR_ROWS) {
      const pos = gridToIso(DIVIDER_COL, row);
      const counter = this.scene.add.image(pos.x, pos.y - 16, 'prop_counter_solid');
      counter.setDepth(computeIsoDepth(DIVIDER_COL, row, 15));
    }

    // Pastel striped mini-awning hanging above the Food Pickup Counter
    const archTop = gridToIso(DIVIDER_COL, 1);
    const archBot = gridToIso(DIVIDER_COL, 5);
    const awning = this.scene.add.graphics();
    awning.setDepth(computeIsoDepth(DIVIDER_COL, 5, 45));
    const stripes = 6;
    for (let i = 0; i < stripes; i++) {
      const t0 = i / stripes;
      const t1 = (i + 1) / stripes;
      const x0 = Phaser.Math.Linear(archTop.x, archBot.x, t0);
      const y0 = Phaser.Math.Linear(archTop.y - 86, archBot.y - 86, t0);
      const x1 = Phaser.Math.Linear(archTop.x, archBot.x, t1);
      const y1 = Phaser.Math.Linear(archTop.y - 86, archBot.y - 86, t1);

      awning.fillStyle(i % 2 === 0 ? 0xff758f : 0xfff8f0, 0.92);
      awning.lineStyle(1.5, 0x7c4a32, 0.6);
      awning.beginPath();
      awning.moveTo(x0 - 12, y0 - 8);
      awning.lineTo(x1 - 12, y1 - 8);
      awning.lineTo(x1 + 14, y1 + 8);
      awning.lineTo(x0 + 14, y0 + 8);
      awning.closePath();
      awning.fillPath();
      awning.strokePath();
    }
  }

  private buildEntranceAndQueueDecor(): void {
    // Glass Entrance Door & Pastel Striped Awning on the right entrance edge
    const doorTop = gridToIso(ENTRANCE_DOOR_POS.col + 0.55, ENTRANCE_DOOR_POS.row - 0.35);
    const doorBot = gridToIso(ENTRANCE_DOOR_POS.col + 0.55, ENTRANCE_DOOR_POS.row + 1.15);

    const doorGfx = this.scene.add.graphics();
    doorGfx.setDepth(computeIsoDepth(ENTRANCE_DOOR_POS.col, ENTRANCE_DOOR_POS.row + 1, 20));

    // Wooden door frame
    doorGfx.fillStyle(0xbfe9ff, 0.65);
    doorGfx.lineStyle(3.5, 0x8c5338, 1);
    doorGfx.beginPath();
    doorGfx.moveTo(doorTop.x, doorTop.y);
    doorGfx.lineTo(doorBot.x, doorBot.y);
    doorGfx.lineTo(doorBot.x, doorBot.y - 72);
    doorGfx.lineTo(doorTop.x, doorTop.y - 72);
    doorGfx.closePath();
    doorGfx.fillPath();
    doorGfx.strokePath();

    // Door center mullion & gold handles
    const midX = (doorTop.x + doorBot.x) / 2;
    const midY = (doorTop.y + doorBot.y) / 2;
    doorGfx.lineStyle(2.5, 0x8c5338, 1);
    doorGfx.beginPath();
    doorGfx.moveTo(midX, midY);
    doorGfx.lineTo(midX, midY - 72);
    doorGfx.strokePath();

    // Red-and-cream entrance awning above door
    for (let i = 0; i < 4; i++) {
      const t0 = i / 4;
      const t1 = (i + 1) / 4;
      const ax0 = Phaser.Math.Linear(doorTop.x, doorBot.x, t0);
      const ay0 = Phaser.Math.Linear(doorTop.y - 74, doorBot.y - 74, t0);
      const ax1 = Phaser.Math.Linear(doorTop.x, doorBot.x, t1);
      const ay1 = Phaser.Math.Linear(doorTop.y - 74, doorBot.y - 74, t1);
      doorGfx.fillStyle(i % 2 === 0 ? 0xff5a6e : 0xfffdf9, 1);
      doorGfx.lineStyle(1.6, 0x7c4a32, 0.8);
      doorGfx.beginPath();
      doorGfx.moveTo(ax0, ay0);
      doorGfx.lineTo(ax1, ay1);
      doorGfx.lineTo(ax1 + 14, ay1 + 12);
      doorGfx.lineTo(ax0 + 14, ay0 + 12);
      doorGfx.closePath();
      doorGfx.fillPath();
      doorGfx.strokePath();
    }

    // Glowing "OPEN" sign next to entrance
    this.openSignText = this.scene.add
      .text(midX + 6, midY - 46, 'OPEN', {
        fontFamily: '"Fredoka", sans-serif',
        fontSize: '10px',
        color: '#FFFFFF',
        backgroundColor: '#16A34A',
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5)
      .setDepth(computeIsoDepth(ENTRANCE_DOOR_POS.col, ENTRANCE_DOOR_POS.row + 1, 24));

    // Velvet Queue Stanchion Rope separating dining tables from waiting queue
    const postA = gridToIso(12.45, 3.3);
    const postB = gridToIso(12.45, 5.7);
    this.scene.add
      .image(postA.x, postA.y - 16, 'prop_stanchion')
      .setDepth(computeIsoDepth(12.45, 3.3, 18));
    this.scene.add
      .image(postB.x, postB.y - 16, 'prop_stanchion')
      .setDepth(computeIsoDepth(12.45, 5.7, 18));

    const rope = this.scene.add.graphics();
    rope.setDepth(computeIsoDepth(12.45, 5.5, 17));
    rope.lineStyle(3, 0xff5a6e, 0.92);
    rope.beginPath();
    rope.moveTo(postA.x, postA.y - 26);
    rope.lineTo((postA.x + postB.x) / 2 - 4, (postA.y + postB.y) / 2 - 20);
    rope.lineTo(postB.x, postB.y - 26);
    rope.strokePath();
  }

  private buildWarmLightingAndDecor(): void {
    // 1. Swaying Potted Pastel Monstera Plants (matched to collision grid)
    DECOR_PLANTS.forEach((p, idx) => {
      const pos = gridToIso(p.col, p.row);
      const img = this.scene.add.image(pos.x, pos.y - 22, 'prop_plant');
      img.setOrigin(0.5, 0.85);
      img.setDepth(computeIsoDepth(p.col, p.row, 18));
      this.swayingPlants.push({ img, phase: idx * 1.4 });
    });

    // 2. Warm Hanging Pendant Light Halos over Dining & Kitchen
    const lampSpots = [
      { col: 2, row: 2.5 },
      { col: 8, row: 2.2 },
      { col: 10, row: 5.0 },
    ];
    for (const spot of lampSpots) {
      const pos = gridToIso(spot.col, spot.row);
      const halo = this.scene.add.ellipse(pos.x, pos.y, 130, 68, 0xffdf91, 0.13);
      halo.setDepth(4);
      this.lampHalos.push(halo);
    }

    // 3. Soft Rising Kitchen Steam Motes near cooking stations
    const steamOrigins = [
      gridToIso(2, 1),
      gridToIso(2, 3),
      gridToIso(2, 5),
    ];
    steamOrigins.forEach((pt, idx) => {
      for (let k = 0; k < 2; k++) {
        const puff = this.scene.add.circle(pt.x, pt.y - 44, 4.5, 0xffffff, 0.35);
        puff.setDepth(computeIsoDepth(2, 1 + idx * 2, 24));
        this.steamPuffs.push({
          sprite: puff,
          baseX: pt.x + (k === 0 ? -6 : 6),
          baseY: pt.y - 42,
          phase: idx * 1.9 + k * 3.1,
        });
      }
    });
  }

  public update(dtSeconds: number): void {
    this.animTime += dtSeconds;

    // Gentle warm light breathing
    this.lampHalos.forEach((halo, idx) => {
      halo.setAlpha(0.11 + Math.sin(this.animTime * 2.1 + idx * 1.5) * 0.035);
    });

    // Subtle plant leaf sway
    for (const plant of this.swayingPlants) {
      plant.img.setRotation(Math.sin(this.animTime * 1.8 + plant.phase) * 0.035);
    }

    // Rising kitchen steam
    for (const steam of this.steamPuffs) {
      const cycle = ((this.animTime * 0.55 + steam.phase) % 1 + 1) % 1;
      steam.sprite.x = steam.baseX + Math.sin(cycle * Math.PI * 2) * 5;
      steam.sprite.y = steam.baseY - cycle * 28;
      steam.sprite.setAlpha(Math.sin(cycle * Math.PI) * 0.42);
      steam.sprite.setScale(0.7 + cycle * 0.85);
    }

    // Wall clock ticking gently
    if (this.clockHandMinute && this.clockHandHour) {
      this.clockHandMinute.setRotation(this.animTime * 0.8);
      this.clockHandHour.setRotation(this.animTime * 0.12);
    }

    // Subtle OPEN sign warmth
    if (this.openSignText) {
      this.openSignText.setAlpha(0.86 + Math.sin(this.animTime * 3.2) * 0.14);
    }
  }

  public destroy(): void {
    this.lampHalos.forEach((h) => h.destroy());
    this.swayingPlants.forEach((p) => p.img.destroy());
    this.steamPuffs.forEach((s) => s.sprite.destroy());
    this.clockHandMinute?.destroy();
    this.clockHandHour?.destroy();
    this.openSignText?.destroy();
    this.lampHalos = [];
    this.swayingPlants = [];
    this.steamPuffs = [];
  }
}
