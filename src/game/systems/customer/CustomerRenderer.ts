import Phaser from 'phaser';
import { WAIT_MAT_POS } from '../../../shared/layout.ts';
import { RECIPES } from '../../../shared/recipes.ts';
import type {
  CustomerRuntimeSnapshot,
  DiningTableState,
  RestaurantMetrics,
} from '../../../shared/types.ts';
import { computeIsoDepth, gridToIso } from '../restaurant/IsometricGrid.ts';

interface TableVisualNode {
  container: Phaser.GameObjects.Container;
  tabletopGfx: Phaser.GameObjects.Graphics;
  bubbleBg: Phaser.GameObjects.Graphics;
  bubbleText: Phaser.GameObjects.Text;
  dishIcon: Phaser.GameObjects.Image;
  patienceBar: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
}

interface CustomerVisualNode {
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Image;
  bodyGfx: Phaser.GameObjects.Graphics;
  bubbleBg: Phaser.GameObjects.Graphics;
  bubbleText: Phaser.GameObjects.Text;
  patienceBar: Phaser.GameObjects.Graphics;
  currentCol: number;
  currentRow: number;
  targetCol: number;
  targetRow: number;
  phaseOffset: number;
  lastSnapshot: CustomerRuntimeSnapshot;
}

/**
 * 2.5D Isometric Customer & Table Visual Renderer.
 * Smoothly interpolates server-authoritative customer positions at 60fps,
 * renders distinct chibi customer variations, procedural animations, thought bubbles,
 * 4-stage patience meters, dirty-table clutter, and cleaning progress bars.
 */
export class CustomerRenderer {
  private scene: Phaser.Scene;
  private tableNodes = new Map<string, TableVisualNode>();
  private customerNodes = new Map<string, CustomerVisualNode>();
  private queueHintContainer: Phaser.GameObjects.Container;
  private queueHint: Phaser.GameObjects.Text;
  private animTime = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.queueHintContainer = scene.add.container(0, 0);
    this.queueHint = scene.add.text(0, 0, '', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '12px',
      color: '#FFFFFF',
      backgroundColor: '#FF5A6E',
      padding: { x: 8, y: 3 },
    });
    this.queueHint.setOrigin(0.5, 0.5);
    this.queueHintContainer.add(this.queueHint);
    this.queueHintContainer.setVisible(false);
  }

  public sync(
    tables: DiningTableState[],
    customers: CustomerRuntimeSnapshot[],
    metrics?: RestaurantMetrics
  ): void {
    // 1. Sync all 6 dining table overlays
    for (const table of tables) {
      let node = this.tableNodes.get(table.id);
      if (!node) {
        node = this.createTableNode(table);
        this.tableNodes.set(table.id, node);
      }
      this.updateTableNode(node, table);
    }

    // 2. Sync active customers (create new, update targets, destroy completed/exited)
    const activeIds = new Set<string>();
    for (const cust of customers) {
      activeIds.add(cust.id);
      let node = this.customerNodes.get(cust.id);
      if (!node) {
        node = this.createCustomerNode(cust);
        this.customerNodes.set(cust.id, node);
      } else {
        node.targetCol = cust.col;
        node.targetRow = cust.row;
        node.lastSnapshot = cust;
      }
    }

    for (const [id, node] of this.customerNodes.entries()) {
      if (!activeIds.has(id)) {
        node.container.destroy();
        this.customerNodes.delete(id);
      }
    }

    // 3. Queue hint at entrance welcome mat
    const queuedCount =
      metrics?.queuedCustomers ?? customers.filter((c) => c.state === 'QUEUING').length;
    const base = gridToIso(WAIT_MAT_POS.col, WAIT_MAT_POS.row);
    this.queueHintContainer.setDepth(computeIsoDepth(WAIT_MAT_POS.col, WAIT_MAT_POS.row + 2, 34));
    if (queuedCount > 0) {
      this.queueHint.setPosition(base.x, base.y - 62);
      this.queueHint.setText(`Antre (${queuedCount}) · Tap Meja`);
      this.queueHintContainer.setVisible(true);
    } else {
      this.queueHintContainer.setVisible(false);
    }
  }

  /**
   * Called every render frame (60fps) for silky walking interpolation, procedural bounce/eat/angry
   * animations, and ground-contact isometric depth sorting.
   */
  public update(dtSeconds: number): void {
    this.animTime += dtSeconds;
    const lerpFactor = Math.min(1, dtSeconds * 13);

    for (const node of this.customerNodes.values()) {
      const snap = node.lastSnapshot;
      const dist = Math.hypot(node.targetCol - node.currentCol, node.targetRow - node.currentRow);
      if (dist > 2.2) {
        node.currentCol = node.targetCol;
        node.currentRow = node.targetRow;
      } else {
        node.currentCol = Phaser.Math.Linear(node.currentCol, node.targetCol, lerpFactor);
        node.currentRow = Phaser.Math.Linear(node.currentRow, node.targetRow, lerpFactor);
      }

      const iso = gridToIso(node.currentCol, node.currentRow);
      node.container.setPosition(iso.x, iso.y);
      node.container.setDepth(computeIsoDepth(node.currentCol, node.currentRow, 22));
      node.container.setAlpha(snap.exitAlpha);

      this.drawCustomerVisual(node, snap);
    }
  }

  private createTableNode(table: DiningTableState): TableVisualNode {
    const pos = gridToIso(table.col, table.row);
    const container = this.scene.add.container(pos.x, pos.y);
    // Floating table UI & tabletop clutter sit cleanly above table prop (+15)
    container.setDepth(computeIsoDepth(table.col, table.row, 28));

    const tabletopGfx = this.scene.add.graphics();
    const bubbleBg = this.scene.add.graphics();
    const dishIcon = this.scene.add.image(0, -68, 'dish_heart_burger_cooked');
    dishIcon.setScale(0.64);
    dishIcon.setVisible(false);

    const bubbleText = this.scene.add.text(0, -68, '', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '12px',
      color: '#3B2318',
    });
    bubbleText.setOrigin(0.5, 0.5);

    const patienceBar = this.scene.add.graphics();

    const label = this.scene.add.text(0, 18, table.label, {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '11px',
      color: '#5C3A28',
      backgroundColor: '#FFF6EC',
      padding: { x: 5, y: 1 },
    });
    label.setOrigin(0.5, 0.5);

    container.add([tabletopGfx, bubbleBg, dishIcon, bubbleText, patienceBar, label]);
    return { container, tabletopGfx, bubbleBg, bubbleText, dishIcon, patienceBar, label };
  }

  private updateTableNode(node: TableVisualNode, table: DiningTableState): void {
    node.tabletopGfx.clear();
    node.bubbleBg.clear();
    node.patienceBar.clear();
    node.dishIcon.setVisible(false);
    node.bubbleText.setText('');

    // Occupancy badge on table label
    const cap = table.capacity || 2;
    if (table.phase05Status === 'RESERVED') {
      node.label.setText(`${table.label} · RSV`);
      node.label.setColor('#92400E');
      node.label.setBackgroundColor('#FEF3C7');
    } else if (table.occupancy > 0) {
      node.label.setText(`${table.label} · ${table.occupancy}/${cap}`);
      node.label.setColor('#1E3A8A');
      node.label.setBackgroundColor('#EFF6FF');
    } else if (table.phase05Status === 'DIRTY' || table.phase05Status === 'CLEANING') {
      node.label.setText(`${table.label} · Dirty`);
      node.label.setColor('#0369A1');
      node.label.setBackgroundColor('#E0F2FE');
    } else {
      node.label.setText(`${table.label} (${cap}p)`);
      node.label.setColor('#5C3A28');
      node.label.setBackgroundColor('#FFF6EC');
    }

    // Tabletop visuals & status bubble
    if (table.phase05Status === 'RESERVED') {
      this.drawSpeechPill(node.bubbleBg, 0, -54, 72, 22, 0xfef3c7, 0xd97706);
      node.bubbleText.setText('Reserved');
      node.bubbleText.setColor('#92400E');
      node.bubbleText.setPosition(0, -54);
    } else if (table.phase05Status === 'OCCUPIED') {
      this.drawSpeechPill(node.bubbleBg, 0, -68, 60, 24, 0xfff8ef, 0x8c5338);
      node.bubbleText.setText('Menu...');
      node.bubbleText.setColor('#5C3A28');
      node.bubbleText.setPosition(0, -68);
    } else if (table.phase05Status === 'WAITING_FOR_ORDER') {
      this.drawSpeechPill(node.bubbleBg, 0, -72, 74, 28, 0xfff0f3, 0xff5a6e);
      node.bubbleText.setText('Order!');
      node.bubbleText.setColor('#BE123C');
      node.bubbleText.setPosition(0, -72);
      this.drawPatienceBar(node.patienceBar, -22, -48, table.patience);
    } else if (table.phase05Status === 'WAITING_FOR_FOOD' && table.dishId) {
      const recipe = RECIPES[table.dishId];
      this.drawSpeechPill(node.bubbleBg, 0, -74, 80, 34, 0xffffff, recipe.accentColor);
      node.dishIcon.setTexture(`dish_${table.dishId}_cooked`);
      node.dishIcon.setPosition(-16, -74);
      node.dishIcon.setVisible(true);
      node.bubbleText.setText(recipe.shortName);
      node.bubbleText.setColor('#3B2318');
      node.bubbleText.setPosition(14, -74);
      this.drawPatienceBar(node.patienceBar, -22, -48, table.patience);
    } else if (table.phase05Status === 'EATING' && table.dishId) {
      node.dishIcon.setTexture(`dish_${table.dishId}_cooked`);
      node.dishIcon.setPosition(0, -14);
      node.dishIcon.setVisible(true);
      this.drawSpeechPill(node.bubbleBg, 0, -66, 58, 22, 0xecfdf5, 0x10b981);
      node.bubbleText.setText('Yum!');
      node.bubbleText.setColor('#047857');
      node.bubbleText.setPosition(0, -66);
    } else if (table.phase05Status === 'WAITING_FOR_BILL') {
      this.drawSpeechPill(node.bubbleBg, 0, -72, 68, 28, 0xfef3c7, 0xd97706);
      node.bubbleText.setText('Pay $');
      node.bubbleText.setColor('#92400E');
      node.bubbleText.setPosition(0, -72);
      this.drawPatienceBar(node.patienceBar, -22, -48, table.patience);
    } else if (table.phase05Status === 'DIRTY') {
      this.drawDirtyClutter(node.tabletopGfx, 1);
      this.drawSpeechPill(node.bubbleBg, 0, -56, 68, 26, 0xe0f2fe, 0x0284c7);
      node.bubbleText.setText('Clean!');
      node.bubbleText.setColor('#0369A1');
      node.bubbleText.setPosition(0, -56);
    } else if (table.phase05Status === 'CLEANING') {
      const remainingClutter = Math.max(0.15, 1 - table.cleaningProgress);
      this.drawDirtyClutter(node.tabletopGfx, remainingClutter);
      this.drawCleaningSparkles(node.tabletopGfx, table.cleaningProgress);
      this.drawSpeechPill(node.bubbleBg, 0, -58, 76, 24, 0xe0f2fe, 0x0284c7);
      node.bubbleText.setText('Cleaning');
      node.bubbleText.setColor('#0369A1');
      node.bubbleText.setPosition(0, -58);
      this.drawProgressBar(node.patienceBar, -24, -40, table.cleaningProgress, 0x0ea5e9);
    }
  }

  private createCustomerNode(snap: CustomerRuntimeSnapshot): CustomerVisualNode {
    const iso = gridToIso(snap.col, snap.row);
    const container = this.scene.add.container(iso.x, iso.y);
    container.setDepth(computeIsoDepth(snap.col, snap.row, 22));

    const shadow = this.scene.add.image(0, 3, 'char_shadow');
    shadow.setScale(snap.genderPresentation === 'child' ? 0.62 : 0.78);
    shadow.setAlpha(0.72);

    const bodyGfx = this.scene.add.graphics();
    const bubbleBg = this.scene.add.graphics();
    const bubbleText = this.scene.add.text(0, -64, '', {
      fontFamily: '"Fredoka", sans-serif',
      fontSize: '10px',
      color: '#3B2318',
    });
    bubbleText.setOrigin(0.5, 0.5);

    const patienceBar = this.scene.add.graphics();

    container.add([shadow, bodyGfx, bubbleBg, bubbleText, patienceBar]);

    const node: CustomerVisualNode = {
      container,
      shadow,
      bodyGfx,
      bubbleBg,
      bubbleText,
      patienceBar,
      currentCol: snap.col,
      currentRow: snap.row,
      targetCol: snap.col,
      targetRow: snap.row,
      phaseOffset: (snap.id.charCodeAt(snap.id.length - 1) % 7) * 0.9,
      lastSnapshot: snap,
    };

    this.drawCustomerVisual(node, snap);
    return node;
  }

  private drawCustomerVisual(node: CustomerVisualNode, snap: CustomerRuntimeSnapshot): void {
    const g = node.bodyGfx;
    g.clear();
    node.bubbleBg.clear();
    node.patienceBar.clear();

    const t = this.animTime + node.phaseOffset;
    const scale = snap.genderPresentation === 'child' ? 0.82 : 1.0;

    const isSeated =
      snap.animState === 'SIT' ||
      snap.animState === 'SITTING_IDLE' ||
      snap.animState === 'EAT' ||
      snap.state === 'SEATED' ||
      snap.state === 'WAITING_FOR_WAITER' ||
      snap.state === 'WAITING_FOR_ORDER' ||
      snap.state === 'WAITING_FOR_FOOD' ||
      snap.state === 'WAITING_FOR_BILL';

    let bounceY = 0;
    let shakeX = 0;
    let legSwing = 0;

    if (snap.animState === 'WALK') {
      bounceY = -Math.abs(Math.sin(t * 11)) * 4.2;
      legSwing = Math.sin(t * 11) * 3.8;
    } else if (snap.animState === 'EAT') {
      bounceY = -Math.abs(Math.sin(t * 7)) * 2.2;
    } else if (snap.animState === 'IMPATIENT' || snap.animState === 'ANGRY') {
      shakeX = Math.sin(t * 28) * (snap.animState === 'ANGRY' ? 1.8 : 0.9);
      bounceY = -Math.abs(Math.sin(t * 9)) * 1.5;
    } else {
      bounceY = Math.sin(t * 3.2) * 0.9;
    }

    const baseY = (isSeated ? 4 : 0) + bounceY;
    const cx = shakeX;
    const outline = 0x3b2318;

    // Legs / Shoes (tucked cleanly when seated)
    if (!isSeated) {
      g.fillStyle(snap.pantsColor, 1);
      g.lineStyle(1.8, outline, 1);
      g.fillRoundedRect(cx - 7 * scale, baseY - 6 * scale + legSwing * 0.5, 5.5 * scale, 8 * scale, 2.5);
      g.strokeRoundedRect(cx - 7 * scale, baseY - 6 * scale + legSwing * 0.5, 5.5 * scale, 8 * scale, 2.5);
      g.fillRoundedRect(cx + 1.5 * scale, baseY - 6 * scale - legSwing * 0.5, 5.5 * scale, 8 * scale, 2.5);
      g.strokeRoundedRect(cx + 1.5 * scale, baseY - 6 * scale - legSwing * 0.5, 5.5 * scale, 8 * scale, 2.5);
    } else {
      g.fillStyle(snap.pantsColor, 1);
      g.lineStyle(1.6, outline, 1);
      g.fillRoundedRect(cx - 9 * scale, baseY - 7 * scale, 18 * scale, 6 * scale, 3);
      g.strokeRoundedRect(cx - 9 * scale, baseY - 7 * scale, 18 * scale, 6 * scale, 3);
    }

    // Torso / Outfit
    const torsoY = baseY - 22 * scale;
    g.fillStyle(snap.shirtColor, 1);
    g.lineStyle(2.1, outline, 1);
    g.fillRoundedRect(cx - 10.5 * scale, torsoY, 21 * scale, 18 * scale, 7 * scale);
    g.strokeRoundedRect(cx - 10.5 * scale, torsoY, 21 * scale, 18 * scale, 7 * scale);

    // Subtle collar detail
    g.fillStyle(0xffffff, 0.72);
    g.fillTriangle(
      cx - 3.5 * scale,
      torsoY + 1,
      cx + 3.5 * scale,
      torsoY + 1,
      cx,
      torsoY + 5.5 * scale
    );

    // Accessory: Scarf
    if (snap.accessories === 'scarf') {
      g.fillStyle(0xef4444, 1);
      g.fillRoundedRect(cx - 9 * scale, torsoY - 1 * scale, 18 * scale, 4.5 * scale, 2);
      g.fillRoundedRect(cx + 3 * scale, torsoY + 2 * scale, 4 * scale, 7 * scale, 1.5);
    }

    // Chibi Head
    const headY = baseY - 32 * scale;
    const headR = 12.2 * scale;
    g.fillStyle(snap.skinTone, 1);
    g.lineStyle(2.1, outline, 1);
    g.fillCircle(cx, headY, headR);
    g.strokeCircle(cx, headY, headR);

    // Hair style variations
    this.drawHairStyle(g, cx, headY, headR, snap);

    // Facial expression (hidden slightly only if facing back)
    if (snap.facing !== 'back') {
      const lookOffset = snap.facing === 'left' ? -2.2 : snap.facing === 'right' ? 2.2 : 0;
      const eyeY = headY + 0.8 * scale;

      if (snap.expression === 'HAPPY' || snap.expression === 'SATISFIED') {
        // Cheerful arched eyes
        g.lineStyle(2, outline, 1);
        g.beginPath();
        g.arc(cx - 4.2 * scale + lookOffset, eyeY + 1, 2.4 * scale, Math.PI, Math.PI * 2, false);
        g.strokePath();
        g.beginPath();
        g.arc(cx + 4.2 * scale + lookOffset, eyeY + 1, 2.4 * scale, Math.PI, Math.PI * 2, false);
        g.strokePath();
      } else {
        // Big expressive cartoon eyes with white catchlight
        g.fillStyle(outline, 1);
        g.fillCircle(cx - 4.2 * scale + lookOffset, eyeY, 2.2 * scale);
        g.fillCircle(cx + 4.2 * scale + lookOffset, eyeY, 2.2 * scale);
        g.fillStyle(0xffffff, 1);
        g.fillCircle(cx - 4.8 * scale + lookOffset, eyeY - 0.8 * scale, 0.8 * scale);
        g.fillCircle(cx + 3.6 * scale + lookOffset, eyeY - 0.8 * scale, 0.8 * scale);
      }

      // Angry or Impatient eyebrows
      if (snap.expression === 'ANGRY' || snap.expression === 'IMPATIENT') {
        g.lineStyle(1.9, outline, 1);
        g.lineBetween(
          cx - 7 * scale + lookOffset,
          eyeY - 4.5 * scale,
          cx - 2 * scale + lookOffset,
          eyeY - 2.6 * scale
        );
        g.lineBetween(
          cx + 7 * scale + lookOffset,
          eyeY - 4.5 * scale,
          cx + 2 * scale + lookOffset,
          eyeY - 2.6 * scale
        );
      }

      // Blush cheeks
      g.fillStyle(snap.expression === 'ANGRY' ? 0xef4444 : 0xff758f, 0.45);
      g.fillCircle(cx - 7.2 * scale + lookOffset, eyeY + 3.2 * scale, 2.0 * scale);
      g.fillCircle(cx + 7.2 * scale + lookOffset, eyeY + 3.2 * scale, 2.0 * scale);

      // Accessory: Glasses
      if (snap.accessories === 'glasses') {
        g.lineStyle(1.5, 0x334155, 1);
        g.strokeCircle(cx - 4.2 * scale + lookOffset, eyeY, 3.6 * scale);
        g.strokeCircle(cx + 4.2 * scale + lookOffset, eyeY, 3.6 * scale);
        g.lineBetween(cx - 0.6 * scale + lookOffset, eyeY, cx + 0.6 * scale + lookOffset, eyeY);
      }
    }

    // Queue / Walking / Angry Thought Bubble (only shown when not overridden by table bubble)
    const showSelfBubble =
      Boolean(snap.thoughtBubble) &&
      (snap.state === 'QUEUING' ||
        snap.state === 'ANGRY' ||
        snap.state === 'WALKING_TO_EXIT' ||
        snap.state === 'SEARCHING_TABLE');

    if (showSelfBubble && snap.thoughtBubble) {
      const bubbleY = headY - 24 * scale;
      const fill = snap.isAngry ? 0xfee2e2 : 0xfffdf9;
      const stroke = snap.isAngry ? 0xdc2626 : 0x8c5338;
      this.drawSpeechPill(node.bubbleBg, cx, bubbleY, 44, 18, fill, stroke);
      node.bubbleText.setText(snap.thoughtBubble);
      node.bubbleText.setColor(snap.isAngry ? '#B91C1C' : '#3B2318');
      node.bubbleText.setPosition(cx, bubbleY);
      node.bubbleText.setVisible(true);
    } else {
      node.bubbleText.setVisible(false);
    }

    // Queue patience bar directly over queued guests
    if (snap.state === 'QUEUING' && !snap.isMoving) {
      this.drawPatienceBar(node.patienceBar, cx - 18, headY - 16 * scale, snap.patience, 36);
    }
  }

  private drawHairStyle(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    headY: number,
    headR: number,
    snap: CustomerRuntimeSnapshot
  ): void {
    const outline = 0x3b2318;
    g.fillStyle(snap.hairColor, 1);
    g.lineStyle(1.6, outline, 1);

    if (snap.hairStyle === 'ponytail') {
      // Side ponytail puff + bangs
      g.fillCircle(cx + headR * 0.85, headY - headR * 0.35, headR * 0.45);
      g.strokeCircle(cx + headR * 0.85, headY - headR * 0.35, headR * 0.45);
      g.slice(cx, headY - 1, headR + 0.8, Phaser.Math.DegToRad(185), Phaser.Math.DegToRad(355), false);
      g.fillPath();
    } else if (snap.hairStyle === 'bob') {
      g.fillRoundedRect(cx - headR - 1, headY - headR, (headR + 1) * 2, headR * 1.15, 7);
      g.fillCircle(cx - headR * 0.82, headY + headR * 0.25, headR * 0.36);
      g.fillCircle(cx + headR * 0.82, headY + headR * 0.25, headR * 0.36);
    } else if (snap.hairStyle === 'curly') {
      g.fillCircle(cx - headR * 0.55, headY - headR * 0.72, headR * 0.46);
      g.fillCircle(cx, headY - headR * 0.88, headR * 0.48);
      g.fillCircle(cx + headR * 0.55, headY - headR * 0.72, headR * 0.46);
    } else if (snap.hairStyle === 'cap') {
      g.fillStyle(0x2563eb, 1);
      g.slice(cx, headY - 2, headR + 1.2, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false);
      g.fillPath();
      g.fillRoundedRect(cx - headR - 1, headY - 5, headR * 2.4, 4, 2);
    } else {
      // Short hair cap
      g.slice(cx, headY - 1.5, headR + 0.8, Phaser.Math.DegToRad(185), Phaser.Math.DegToRad(355), false);
      g.fillPath();
    }

    // Accessories: Bow or Hat
    if (snap.accessories === 'bow') {
      g.fillStyle(0xf43f5e, 1);
      g.fillCircle(cx + headR * 0.45, headY - headR * 0.82, 3.4);
      g.fillCircle(cx + headR * 0.75, headY - headR * 0.72, 3.0);
    } else if (snap.accessories === 'hat' && snap.hairStyle !== 'cap') {
      g.fillStyle(0xd97706, 1);
      g.fillEllipse(cx, headY - headR * 0.78, headR * 2.1, 6);
      g.fillRoundedRect(cx - headR * 0.62, headY - headR * 1.35, headR * 1.24, headR * 0.65, 3);
    }
  }

  private drawDirtyClutter(g: Phaser.GameObjects.Graphics, alpha: number): void {
    // Stacked used plates, tipped cup & crumbs right on top of the dining table
    g.fillStyle(0xf1f5f9, alpha);
    g.lineStyle(1.4, 0x64748b, alpha);
    g.fillEllipse(-8, -14, 14, 8);
    g.strokeEllipse(-8, -14, 14, 8);
    g.fillEllipse(-6, -17, 12, 7);
    g.strokeEllipse(-6, -17, 12, 7);

    // Used cup
    g.fillStyle(0xfef3c7, alpha);
    g.fillRoundedRect(6, -21, 7, 9, 2);
    g.strokeRoundedRect(6, -21, 7, 9, 2);

    // Crumbs
    g.fillStyle(0xb45309, alpha * 0.8);
    g.fillCircle(0, -10, 1.8);
    g.fillCircle(4, -12, 1.4);
    g.fillCircle(-12, -10, 1.5);
  }

  private drawCleaningSparkles(g: Phaser.GameObjects.Graphics, progress: number): void {
    const pulse = 0.6 + 0.4 * Math.sin(this.animTime * 12);
    g.fillStyle(0x38bdf8, pulse);
    const dx = Math.cos(progress * Math.PI * 4) * 14;
    const dy = Math.sin(progress * Math.PI * 4) * 6;
    g.fillCircle(dx, -16 + dy, 3.5);
    g.fillCircle(-dx * 0.7, -20 - dy * 0.5, 2.5);
  }

  private drawSpeechPill(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    w: number,
    h: number,
    fill: number,
    stroke: number
  ): void {
    g.fillStyle(fill, 0.96);
    g.lineStyle(2.2, stroke, 1);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 9);
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 9);
  }

  private drawPatienceBar(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    ratio: number,
    width = 44
  ): void {
    const clamped = Math.max(0, Math.min(1, ratio));
    g.fillStyle(0x3b2318, 0.78);
    g.fillRoundedRect(x, y, width, 7, 3);
    // 4-stage patience colors: Green -> Yellow -> Orange -> Red
    const color =
      clamped > 0.6
        ? 0x22c55e
        : clamped > 0.4
          ? 0xeab308
          : clamped > 0.2
            ? 0xf97316
            : 0xef4444;
    g.fillStyle(color, 1);
    g.fillRoundedRect(x + 1, y + 1, Math.max(2, (width - 2) * clamped), 5, 2);
  }

  private drawProgressBar(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    ratio: number,
    color: number
  ): void {
    const clamped = Math.max(0, Math.min(1, ratio));
    const width = 48;
    g.fillStyle(0x0f172a, 0.72);
    g.fillRoundedRect(x, y, width, 7, 3);
    g.fillStyle(color, 1);
    g.fillRoundedRect(x + 1, y + 1, Math.max(2, (width - 2) * clamped), 5, 2);
  }

  public destroy(): void {
    this.queueHintContainer.destroy();
    this.tableNodes.forEach((n) => n.container.destroy());
    this.tableNodes.clear();
    this.customerNodes.forEach((n) => n.container.destroy());
    this.customerNodes.clear();
  }
}
