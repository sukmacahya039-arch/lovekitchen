import Phaser from 'phaser';
import type { CharacterAnimState, PlayerRole } from '../../../shared/types.ts';
import {
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  CHAR_SHADOW_KEY,
  CHEF_ANIM_SPECS,
  CHEF_SHEET_KEY,
  FRAMES_PER_ANIM,
  SHEET_COLS,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  WAITER_ANIM_SPECS,
  WAITER_SHEET_KEY,
  type AnimSpec,
} from './CharacterAnimations.ts';

type Expression =
  | 'friendly'
  | 'cheerful'
  | 'focused'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'tired'
  | 'shocked'
  | 'blink';

type ViewAngle = 'front' | 'back' | 'left' | 'right';

interface PoseParams {
  view: ViewAngle;
  expression: Expression;
  bobY: number;
  leanX: number;
  headTilt: number;
  leftFootY: number;
  rightFootY: number;
  leftFootX: number;
  rightFootX: number;
  leftArmX: number;
  leftArmY: number;
  rightArmX: number;
  rightArmY: number;
  ponytailSwing: number;
  hatTilt: number;
  prop:
    | 'none'
    | 'tray_idle'
    | 'tray_high'
    | 'tray_serve'
    | 'carry_hands'
    | 'cooking_ladle'
    | 'frying_pan'
    | 'chopping_knife'
    | 'serve_plate'
    | 'burnt_smoke'
    | 'notepad'
    | 'clean_cloth'
    | 'gold_coins'
    | 'work_sparkle'
    | 'happy_hearts'
    | 'sad_tears'
    | 'angry_puff'
    | 'tired_sweat';
  phase: number; // 0..3 frame index
}

const OUTLINE = '#4A2B1D';

/**
 * Generates high-craft 2.5D isometric cartoon spritesheets for Chef Male & Waiter Female,
 * plus a separate soft dynamic ground shadow texture (`char_shadow`).
 */
export function generateCharacterSpritesheets(scene: Phaser.Scene): void {
  generateSeparateShadowTexture(scene);
  generateRoleSpritesheet(scene, 'chef', CHEF_SHEET_KEY, CHEF_ANIM_SPECS);
  generateRoleSpritesheet(scene, 'waiter', WAITER_SHEET_KEY, WAITER_ANIM_SPECS);
}

function generateSeparateShadowTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(CHAR_SHADOW_KEY)) return;
  const w = 72;
  const h = 34;
  const tex = scene.textures.createCanvas(CHAR_SHADOW_KEY, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  const grad = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2 - 4);
  grad.addColorStop(0, 'rgba(59, 35, 24, 0.34)');
  grad.addColorStop(0.6, 'rgba(59, 35, 24, 0.20)');
  grad.addColorStop(1, 'rgba(59, 35, 24, 0)');

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(1, 0.48);
  ctx.beginPath();
  ctx.arc(0, 0, w / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
  tex.refresh();
}

function generateRoleSpritesheet(
  scene: Phaser.Scene,
  role: PlayerRole,
  sheetKey: string,
  specs: AnimSpec[]
): void {
  if (scene.textures.exists(sheetKey)) return;

  const tex = scene.textures.createCanvas(sheetKey, SHEET_WIDTH, SHEET_HEIGHT);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);

  for (const spec of specs) {
    for (let f = 0; f < FRAMES_PER_ANIM; f++) {
      const frameIndex = spec.slotIndex * FRAMES_PER_ANIM + f;
      const gridCol = frameIndex % SHEET_COLS;
      const gridRow = Math.floor(frameIndex / SHEET_COLS);
      const ox = gridCol * CHAR_FRAME_W;
      const oy = gridRow * CHAR_FRAME_H;

      ctx.save();
      ctx.beginPath();
      ctx.rect(ox, oy, CHAR_FRAME_W, CHAR_FRAME_H);
      ctx.clip();
      ctx.translate(ox, oy);

      const pose = buildPose(role, spec.state, f);
      if (role === 'chef') {
        drawChefFrame(ctx, pose);
      } else {
        drawWaiterFrame(ctx, pose);
      }

      ctx.restore();
      tex.add(frameIndex, 0, ox, oy, CHAR_FRAME_W, CHAR_FRAME_H);
    }
  }

  tex.refresh();
}

function buildPose(role: PlayerRole, state: CharacterAnimState, phase: number): PoseParams {
  const sin = [0, 1, 0, -1][phase];
  const cos = [1, 0, -1, 0][phase];
  const bounce = [0, -3.5, 0, -3.5][phase];
  const baseExpr: Expression = role === 'chef' ? 'friendly' : 'cheerful';

  const base: PoseParams = {
    view: 'front',
    expression: baseExpr,
    bobY: 0,
    leanX: 0,
    headTilt: 0,
    leftFootY: 0,
    rightFootY: 0,
    leftFootX: 0,
    rightFootX: 0,
    leftArmX: 0,
    leftArmY: 0,
    rightArmX: 0,
    rightArmY: 0,
    ponytailSwing: 0,
    hatTilt: 0,
    prop: role === 'waiter' ? 'tray_idle' : 'none',
    phase,
  };

  switch (state) {
    case 'idle':
      return {
        ...base,
        bobY: [0, -1.6, -2.2, -0.8][phase],
        expression: phase === 3 ? 'blink' : baseExpr,
        ponytailSwing: sin * 2.2,
        hatTilt: sin * 0.025,
      };

    case 'walk_front':
      return {
        ...base,
        view: 'front',
        bobY: bounce,
        leftFootY: sin > 0 ? -4.5 : 1.5,
        rightFootY: sin < 0 ? -4.5 : 1.5,
        leftArmY: -sin * 4,
        rightArmY: sin * 4,
        ponytailSwing: sin * 4,
        hatTilt: sin * 0.04,
      };

    case 'walk_back':
      return {
        ...base,
        view: 'back',
        bobY: bounce,
        leftFootY: sin > 0 ? -4.5 : 1.5,
        rightFootY: sin < 0 ? -4.5 : 1.5,
        leftArmY: -sin * 4,
        rightArmY: sin * 4,
        ponytailSwing: sin * 5.5,
        hatTilt: sin * 0.04,
      };

    case 'walk_left':
      return {
        ...base,
        view: 'left',
        bobY: bounce,
        leftFootX: sin * 5,
        rightFootX: -sin * 5,
        leftFootY: sin > 0 ? -3.5 : 1,
        rightFootY: sin < 0 ? -3.5 : 1,
        leftArmX: -sin * 5,
        rightArmX: sin * 5,
        ponytailSwing: 3 + sin * 4,
        hatTilt: -0.04 + sin * 0.03,
      };

    case 'walk_right':
      return {
        ...base,
        view: 'right',
        bobY: bounce,
        leftFootX: -sin * 5,
        rightFootX: sin * 5,
        leftFootY: sin < 0 ? -3.5 : 1,
        rightFootY: sin > 0 ? -3.5 : 1,
        leftArmX: sin * 5,
        rightArmX: -sin * 5,
        ponytailSwing: -3 - sin * 4,
        hatTilt: 0.04 + sin * 0.03,
      };

    case 'run':
      return {
        ...base,
        view: 'right',
        bobY: [0, -7, -1, -7][phase],
        leanX: 4.5,
        headTilt: 0.06,
        leftFootX: -sin * 9,
        rightFootX: sin * 9,
        leftFootY: sin < 0 ? -7 : 1,
        rightFootY: sin > 0 ? -7 : 1,
        leftArmX: sin * 8,
        rightArmX: -sin * 8,
        leftArmY: -3,
        rightArmY: -3,
        ponytailSwing: -7 + sin * 4,
        hatTilt: -0.1 + sin * 0.04,
        expression: 'focused',
      };

    case 'work':
      return {
        ...base,
        view: 'front',
        bobY: sin * 2,
        leftArmY: -7 + sin * 3.5,
        rightArmY: -7 - sin * 3.5,
        leftArmX: 4,
        rightArmX: -4,
        expression: 'focused',
        prop: 'work_sparkle',
      };

    case 'carry_item':
      return {
        ...base,
        view: 'front',
        bobY: bounce * 0.85,
        leftFootY: sin > 0 ? -3.5 : 1,
        rightFootY: sin < 0 ? -3.5 : 1,
        leftArmY: -10,
        rightArmY: -10,
        leftArmX: 6,
        rightArmX: -6,
        prop: role === 'waiter' ? 'tray_high' : 'carry_hands',
      };

    case 'happy':
      return {
        ...base,
        bobY: [0, -10, -12, -4][phase],
        leftArmY: -16 - Math.abs(sin) * 3,
        rightArmY: -16 - Math.abs(sin) * 3,
        leftArmX: -4,
        rightArmX: 4,
        headTilt: sin * 0.07,
        ponytailSwing: sin * 6,
        expression: 'happy',
        prop: 'happy_hearts',
      };

    case 'sad':
      return {
        ...base,
        bobY: [1.5, 2.8, 3.2, 2.2][phase],
        headTilt: -0.08 + sin * 0.02,
        leftArmY: 4,
        rightArmY: 4,
        expression: 'sad',
        prop: 'sad_tears',
      };

    case 'angry':
      return {
        ...base,
        bobY: [0, -2.5, 0, -2.5][phase],
        leanX: sin * 1.6,
        leftFootY: phase === 1 ? -4 : 0,
        rightFootY: phase === 3 ? -4 : 0,
        leftArmY: -5 + sin * 4,
        rightArmY: -5 - sin * 4,
        expression: 'angry',
        prop: 'angry_puff',
      };

    case 'tired':
      return {
        ...base,
        bobY: [2, 4, 4.5, 2.5][phase],
        headTilt: 0.07 + cos * 0.03,
        leftArmY: 5,
        rightArmY: 5,
        hatTilt: 0.08,
        ponytailSwing: -2,
        expression: 'tired',
        prop: 'tired_sweat',
      };

    // --- Chef Specific ---
    case 'cooking':
      return {
        ...base,
        view: 'front',
        bobY: sin * 1.5,
        rightArmX: cos * 4,
        rightArmY: -8 + sin * 3,
        leftArmY: -4,
        expression: 'focused',
        prop: 'cooking_ladle',
      };

    case 'frying':
      return {
        ...base,
        view: 'right',
        bobY: [0, -3.5, -1, 0][phase],
        rightArmY: [-4, -14, -10, -4][phase],
        rightArmX: [4, 7, 5, 4][phase],
        hatTilt: [0, -0.08, -0.04, 0][phase],
        expression: phase === 1 ? 'happy' : 'focused',
        prop: 'frying_pan',
      };

    case 'chopping':
      return {
        ...base,
        view: 'front',
        bobY: [0, 1.5, 0, 1.5][phase],
        rightArmY: [-13, -3, -13, -3][phase],
        leftArmY: -5,
        expression: 'focused',
        prop: 'chopping_knife',
      };

    case 'serving_counter':
      return {
        ...base,
        view: 'right',
        bobY: [0, -2, -2, 0][phase],
        leanX: [1, 4, 4, 2][phase],
        leftArmX: 7,
        rightArmX: 9,
        leftArmY: -8,
        rightArmY: -8,
        expression: 'happy',
        prop: 'serve_plate',
      };

    case 'burnt_reaction':
      return {
        ...base,
        view: 'front',
        bobY: [0, -5, -1, -4][phase],
        leanX: sin * 2.5,
        leftArmY: -14 + sin * 5,
        rightArmY: -14 - sin * 5,
        hatTilt: sin * 0.14,
        expression: 'shocked',
        prop: 'burnt_smoke',
      };

    // --- Waiter Specific ---
    case 'taking_order':
      return {
        ...base,
        view: 'front',
        bobY: sin * 1.2,
        leftArmX: 6,
        leftArmY: -7,
        rightArmX: -4 + cos * 2.5,
        rightArmY: -8 + sin * 2.5,
        expression: 'focused',
        prop: 'notepad',
      };

    case 'carrying_tray':
      return {
        ...base,
        view: 'right',
        bobY: bounce * 0.85,
        leftFootX: -sin * 4.5,
        rightFootX: sin * 4.5,
        leftFootY: sin < 0 ? -3.5 : 1,
        rightFootY: sin > 0 ? -3.5 : 1,
        rightArmY: -13,
        rightArmX: 5,
        ponytailSwing: -4 + sin * 3.5,
        expression: 'cheerful',
        prop: 'tray_high',
      };

    case 'serving_food':
      return {
        ...base,
        view: 'left',
        bobY: [0, 2, 2.5, 0.5][phase],
        leanX: [-1, -4, -4, -1][phase],
        headTilt: -0.06,
        rightArmX: -6,
        rightArmY: -6,
        expression: 'happy',
        prop: 'tray_serve',
      };

    case 'cleaning_table':
      return {
        ...base,
        view: 'front',
        bobY: [1, 2.5, 1, 2.5][phase],
        leanX: sin * 2.5,
        rightArmX: sin * 9,
        rightArmY: -5 + cos * 2,
        leftArmY: -2,
        ponytailSwing: -sin * 5,
        expression: 'focused',
        prop: 'clean_cloth',
      };

    case 'collecting_payment':
      return {
        ...base,
        view: 'front',
        bobY: [0, -3.5, -2, 0][phase],
        rightArmY: -10 + sin * 2,
        rightArmX: 5,
        leftArmY: -6,
        expression: 'happy',
        prop: 'gold_coins',
      };

    default:
      return base;
  }
}

/* ============================================================================
 * PLAYER 1 — CHEF MALE (2.5D Isometric Cartoon Chibi)
 * Topi koki putih, jaket koki putih, apron cokelat, celana gelap, sepatu koki,
 * mata besar, ekspresi lucu & ramah.
 * ==========================================================================*/
function drawChefFrame(ctx: CanvasRenderingContext2D, p: PoseParams): void {
  const cx = CHAR_FRAME_W / 2 + p.leanX;
  const footBaseY = 114;
  const bodyY = 74 + p.bobY;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTLINE;

  // 1. Dark Chef Pants & Sturdy Chef Shoes (drawn separately so legs animate crisply)
  const leftLegX = cx - 9 + p.leftFootX;
  const rightLegX = cx + 9 + p.rightFootX;

  // Pants legs (dark charcoal-slate #333B48 with shading)
  drawRoundedLimb(ctx, leftLegX, bodyY + 24, 11, 15 + p.leftFootY * 0.3, '#333B48', '#252B36');
  drawRoundedLimb(ctx, rightLegX, bodyY + 24, 11, 15 + p.rightFootY * 0.3, '#333B48', '#252B36');

  // Chef shoes (dark mahogany-black clogs with glossy highlight)
  drawShoe(ctx, leftLegX - 1, footBaseY + p.leftFootY, '#3F271E', p.view === 'left');
  drawShoe(ctx, rightLegX + 1, footBaseY + p.rightFootY, '#3F271E', p.view === 'right');

  // 2. Back arm if angled
  if (p.view === 'right') {
    drawChefArm(ctx, cx - 17 + p.leftArmX, bodyY + 12 + p.leftArmY, false);
  } else if (p.view === 'left') {
    drawChefArm(ctx, cx + 17 + p.rightArmX, bodyY + 12 + p.rightArmY, true);
  }

  // 3. White Double-Breasted Chef Jacket (2.5D curved torso with cel shadow)
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.roundRect(cx - 19, bodyY - 4, 38, 34, 12);
  ctx.fill();

  // Soft cel shading on right edge of jacket
  ctx.fillStyle = '#EAE2DB';
  ctx.beginPath();
  ctx.roundRect(cx + 8, bodyY - 2, 10, 30, 6);
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(cx - 19, bodyY - 4, 38, 34, 12);
  ctx.stroke();

  if (p.view !== 'back') {
    // Double-breasted lapel seam & buttons
    const lapShift = p.view === 'left' ? -4 : p.view === 'right' ? 4 : 0;
    ctx.strokeStyle = '#C9BCB0';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx + lapShift - 2, bodyY + 2);
    ctx.lineTo(cx + lapShift - 2, bodyY + 18);
    ctx.stroke();

    ctx.fillStyle = OUTLINE;
    for (const by of [bodyY + 7, bodyY + 13]) {
      ctx.beginPath();
      ctx.arc(cx + lapShift - 6, by, 1.8, 0, Math.PI * 2);
      ctx.arc(cx + lapShift + 4, by, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crisp red chef neckerchief
    ctx.fillStyle = '#EF4444';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + lapShift - 8, bodyY - 3);
    ctx.lineTo(cx + lapShift + 8, bodyY - 3);
    ctx.lineTo(cx + lapShift + 2, bodyY + 6);
    ctx.lineTo(cx + lapShift - 3, bodyY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // 4. Warm Chocolate Brown Apron (#8C5338 with deeper pocket shade & waist sash)
  ctx.save();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = OUTLINE;
  ctx.fillStyle = '#8C5338';
  ctx.beginPath();
  ctx.roundRect(cx - 17, bodyY + 14, 34, 21, 6);
  ctx.fill();
  ctx.fillStyle = '#73422B';
  ctx.beginPath();
  ctx.roundRect(cx + 6, bodyY + 15, 10, 19, 4);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(cx - 17, bodyY + 14, 34, 21, 6);
  ctx.stroke();

  // Waist belt band
  ctx.fillStyle = '#6D3E28';
  ctx.fillRect(cx - 18, bodyY + 13, 36, 4.5);
  ctx.strokeRect(cx - 18, bodyY + 13, 36, 4.5);

  if (p.view === 'back') {
    // Tied apron bow at the back!
    ctx.fillStyle = '#A06243';
    ctx.beginPath();
    ctx.ellipse(cx - 5, bodyY + 17, 5, 3.2, -0.3, 0, Math.PI * 2);
    ctx.ellipse(cx + 5, bodyY + 17, 5, 3.2, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // Cute front apron pockets
    ctx.strokeStyle = '#57301E';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(cx - 12, bodyY + 21, 9, 9);
    ctx.strokeRect(cx + 3, bodyY + 21, 9, 9);
  }
  ctx.restore();

  // 5. Front / Side Arms
  if (p.view === 'front' || p.view === 'back') {
    drawChefArm(ctx, cx - 21 + p.leftArmX, bodyY + 11 + p.leftArmY, false);
    drawChefArm(ctx, cx + 21 + p.rightArmX, bodyY + 11 + p.rightArmY, true);
  } else if (p.view === 'right') {
    drawChefArm(ctx, cx + 14 + p.rightArmX, bodyY + 12 + p.rightArmY, true);
  } else {
    drawChefArm(ctx, cx - 14 + p.leftArmX, bodyY + 12 + p.leftArmY, false);
  }

  // 6. Chibi Head, Expressive Face & Puffy White Chef Hat
  ctx.save();
  ctx.translate(cx, bodyY - 22);
  ctx.rotate(p.headTilt);

  // Cute ears
  ctx.fillStyle = '#FFD9BD';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(-21, 1, 5.5, 0, Math.PI * 2);
  ctx.arc(21, 1, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Slightly large round chibi head
  ctx.fillStyle = p.expression === 'shocked' ? '#F3D2B8' : '#FFE2CA';
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();
  // Warm cheek/chin shading
  ctx.fillStyle = 'rgba(224, 155, 114, 0.25)';
  ctx.beginPath();
  ctx.arc(4, 5, 18, 0.2, Math.PI * 0.9);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.stroke();

  // Brown chestnut hair
  ctx.fillStyle = '#5C3724';
  if (p.view === 'back') {
    ctx.beginPath();
    ctx.arc(0, 0, 22.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // Friendly layered bangs
    ctx.beginPath();
    ctx.arc(0, -4, 22, Math.PI * 0.96, Math.PI * 2.04);
    ctx.lineTo(18, -4);
    ctx.quadraticCurveTo(9, -12, 3, -5);
    ctx.quadraticCurveTo(-2, -13, -9, -6);
    ctx.quadraticCurveTo(-15, -10, -20, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Expressive big cartoon eyes & face
    const faceOffsetX = p.view === 'left' ? -5 : p.view === 'right' ? 5 : 0;
    drawChibiFace(ctx, faceOffsetX, 2, p.expression, false);
  }

  // Tall Pleated Puffy White Chef Hat (Toque)
  ctx.save();
  ctx.rotate(p.hatTilt);
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(-13, -29, 11.5, 0, Math.PI * 2);
  ctx.arc(0, -35, 14, 0, Math.PI * 2);
  ctx.arc(13, -29, 11.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Soft interior puffs & shading
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(0, -28, 17, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#DFD5CC';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-6, -34);
  ctx.lineTo(-5, -24);
  ctx.moveTo(6, -34);
  ctx.lineTo(5, -24);
  ctx.stroke();

  // Warm chocolate-brown hat band
  ctx.fillStyle = '#6B4230';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.roundRect(-18, -23, 36, 9, 4);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.restore();

  // 7. Role Props & Expressive FX Overlays
  drawActionProp(ctx, cx, bodyY, p, 'chef');
}

function drawChefArm(ctx: CanvasRenderingContext2D, x: number, y: number, isRight: boolean): void {
  ctx.save();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.2;
  // White sleeve puff
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(x + (isRight ? -2 : 2), y - 3, 6.5, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Cute round chibi hand
  ctx.fillStyle = '#FFE0C8';
  ctx.beginPath();
  ctx.arc(x, y + 3, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/* ============================================================================
 * PLAYER 2 — WAITER FEMALE (2.5D Isometric Cartoon Chibi)
 * Rambut ponytail + pita pink, seragam pink pastel, apron putih, sepatu kerja,
 * membawa nampan, mata besar, ekspresi ceria.
 * ==========================================================================*/
function drawWaiterFrame(ctx: CanvasRenderingContext2D, p: PoseParams): void {
  const cx = CHAR_FRAME_W / 2 + p.leanX;
  const footBaseY = 114;
  const bodyY = 74 + p.bobY;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTLINE;

  // 1. Bouncy Ponytail behind head when facing front/left/right
  if (p.view !== 'back') {
    drawPonytail(
      ctx,
      cx + (p.view === 'left' ? 19 : p.view === 'right' ? -18 : 18),
      bodyY - 26,
      p.ponytailSwing,
      p.view === 'right'
    );
  }

  // 2. White Ankle Socks & Neat Work Shoes (Mary-Jane style)
  const leftLegX = cx - 8 + p.leftFootX;
  const rightLegX = cx + 8 + p.rightFootX;

  drawRoundedLimb(ctx, leftLegX, bodyY + 25, 8.5, 13 + p.leftFootY * 0.3, '#FFFFFF', '#E5DCE0');
  drawRoundedLimb(ctx, rightLegX, bodyY + 25, 8.5, 13 + p.rightFootY * 0.3, '#FFFFFF', '#E5DCE0');

  drawShoe(ctx, leftLegX - 1, footBaseY + p.leftFootY, '#6B3B2B', p.view === 'left');
  drawShoe(ctx, rightLegX + 1, footBaseY + p.rightFootY, '#6B3B2B', p.view === 'right');

  // 3. Back arm if side view
  if (p.view === 'right') {
    drawWaiterArm(ctx, cx - 16 + p.leftArmX, bodyY + 11 + p.leftArmY);
  } else if (p.view === 'left') {
    drawWaiterArm(ctx, cx + 16 + p.rightArmX, bodyY + 11 + p.rightArmY);
  }

  // 4. Pastel Pink Uniform Dress (#FFB5C8 with cel shade & crisp white collar)
  ctx.save();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = OUTLINE;
  ctx.fillStyle = '#FFB5C8';
  ctx.beginPath();
  ctx.moveTo(cx - 14, bodyY - 3);
  ctx.lineTo(cx + 14, bodyY - 3);
  ctx.lineTo(cx + 23, bodyY + 32);
  ctx.quadraticCurveTo(cx, bodyY + 37, cx - 23, bodyY + 32);
  ctx.closePath();
  ctx.fill();

  // Cel shading pleat on right side of skirt
  ctx.fillStyle = '#F597B0';
  ctx.beginPath();
  ctx.moveTo(cx + 6, bodyY - 2);
  ctx.lineTo(cx + 14, bodyY - 2);
  ctx.lineTo(cx + 22, bodyY + 31);
  ctx.lineTo(cx + 10, bodyY + 34);
  ctx.closePath();
  ctx.fill();

  // Re-stroke dress outline
  ctx.beginPath();
  ctx.moveTo(cx - 14, bodyY - 3);
  ctx.lineTo(cx + 14, bodyY - 3);
  ctx.lineTo(cx + 23, bodyY + 32);
  ctx.quadraticCurveTo(cx, bodyY + 37, cx - 23, bodyY + 32);
  ctx.closePath();
  ctx.stroke();

  // White Peter-Pan collar
  ctx.fillStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx - 5, bodyY, 6.5, 3.8, 0.25, 0, Math.PI * 2);
  ctx.ellipse(cx + 5, bodyY, 6.5, 3.8, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 5. Crisp White Ruffled Apron
  ctx.fillStyle = '#FFFFFF';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.roundRect(cx - 14, bodyY + 12, 28, 21, 9);
  ctx.fill();
  ctx.stroke();

  // Waist ribbon & back bow
  ctx.fillStyle = '#FFF5F8';
  ctx.fillRect(cx - 16, bodyY + 10, 32, 4.5);
  ctx.strokeRect(cx - 16, bodyY + 10, 32, 4.5);

  if (p.view === 'back') {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(cx - 6, bodyY + 14, 6, 4, -0.3, 0, Math.PI * 2);
    ctx.ellipse(cx + 6, bodyY + 14, 6, 4, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // 6. Front Arms
  if (p.view === 'front' || p.view === 'back') {
    drawWaiterArm(ctx, cx - 19 + p.leftArmX, bodyY + 10 + p.leftArmY);
    drawWaiterArm(ctx, cx + 19 + p.rightArmX, bodyY + 10 + p.rightArmY);
  } else if (p.view === 'right') {
    drawWaiterArm(ctx, cx + 13 + p.rightArmX, bodyY + 11 + p.rightArmY);
  } else {
    drawWaiterArm(ctx, cx - 13 + p.leftArmX, bodyY + 11 + p.leftArmY);
  }

  // 7. Chibi Head, Chestnut Hair & Expressive Cheerful Face
  ctx.save();
  ctx.translate(cx, bodyY - 22);
  ctx.rotate(p.headTilt);

  // Cute ears
  ctx.fillStyle = '#FFDFC6';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(-20.5, 1, 5, 0, Math.PI * 2);
  ctx.arc(20.5, 1, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Head
  ctx.fillStyle = '#FFE4CE';
  ctx.beginPath();
  ctx.arc(0, 0, 21.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 21.5, 0, Math.PI * 2);
  ctx.stroke();

  // Chestnut hair
  ctx.fillStyle = '#6A3E2A';
  if (p.view === 'back') {
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Hair glossy shine arc
    ctx.strokeStyle = '#8F5B42';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -2, 15, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    // Prominent ponytail centered on back!
    drawPonytail(ctx, 2, -6, p.ponytailSwing, false);
  } else {
    // Swept cute bangs + side locks
    ctx.beginPath();
    ctx.arc(0, -3, 22.5, Math.PI * 0.92, Math.PI * 2.08);
    ctx.lineTo(20, 6);
    ctx.quadraticCurveTo(16, -8, 6, -6);
    ctx.quadraticCurveTo(0, -14, -7, -6);
    ctx.quadraticCurveTo(-16, -8, -20, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Soft glossy hair highlight
    ctx.fillStyle = '#925E44';
    ctx.beginPath();
    ctx.ellipse(-7, -14, 5.5, 2.2, -0.3, 0, Math.PI * 2);
    ctx.ellipse(6, -14, 4.5, 2, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Cute pastel pink hair bow on top-right
    ctx.fillStyle = '#FF7597';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(11, -19, 6.5, 4, -0.35, 0, Math.PI * 2);
    ctx.ellipse(18, -14, 6, 3.8, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(14.5, -16.5, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const faceOffsetX = p.view === 'left' ? -5 : p.view === 'right' ? 5 : 0;
    drawChibiFace(ctx, faceOffsetX, 2, p.expression, true);
  }
  ctx.restore();

  // 8. Serving Tray & Action Props
  drawActionProp(ctx, cx, bodyY, p, 'waiter');
}

function drawPonytail(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  swing: number,
  flippedLeft: boolean
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((swing * 0.05) + (flippedLeft ? 0.35 : -0.35));
  ctx.fillStyle = '#6A3E2A';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(
    flippedLeft ? -16 : 16,
    -6,
    flippedLeft ? -22 : 22,
    18,
    flippedLeft ? -6 : 6,
    26
  );
  ctx.bezierCurveTo(
    flippedLeft ? -2 : 2,
    22,
    flippedLeft ? -8 : 8,
    10,
    0,
    4
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Pink hair tie ribbon
  ctx.fillStyle = '#FF7597';
  ctx.beginPath();
  ctx.arc(0, 2, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawWaiterArm(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.1;
  // Pastel pink puff sleeve
  ctx.fillStyle = '#FFB5C8';
  ctx.beginPath();
  ctx.arc(x, y - 4, 6.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Cute chibi hand
  ctx.fillStyle = '#FFE2CC';
  ctx.beginPath();
  ctx.arc(x, y + 3, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/* ============================================================================
 * SHARED FACIAL EXPRESSIONS, LIMBS & ANIMATED PROPS
 * ==========================================================================*/
function drawRoundedLimb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  shade: string
): void {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y, w, h, 4);
  ctx.fill();
  ctx.fillStyle = shade;
  ctx.fillRect(x + 1, y + 1, w / 2 - 2, h - 2);
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y, w, h, 4);
  ctx.stroke();
  ctx.restore();
}

function drawShoe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  elongated: boolean
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.ellipse(x, y, elongated ? 10 : 8.5, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Gloss highlight on toe
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.ellipse(x - 2, y - 1.5, 3, 1.4, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawChibiFace(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  expr: Expression,
  withLashes: boolean
): void {
  ctx.save();
  ctx.translate(ox, oy);

  const eyeLX = -7.5;
  const eyeRX = 7.5;
  const eyeY = 0;

  // Rosy blush cheeks
  ctx.fillStyle = expr === 'angry' ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255, 118, 145, 0.45)';
  ctx.beginPath();
  ctx.ellipse(eyeLX - 5, eyeY + 5.5, 4.4, 2.5, 0, 0, Math.PI * 2);
  ctx.ellipse(eyeRX + 5, eyeY + 5.5, 4.4, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (expr === 'happy') {
    // Joyful curved smiling eyes (^ ^)
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.6;
    for (const ex of [eyeLX, eyeRX]) {
      ctx.beginPath();
      ctx.arc(ex, eyeY + 2, 4.8, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
  } else if (expr === 'blink') {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.4;
    for (const ex of [eyeLX, eyeRX]) {
      ctx.beginPath();
      ctx.moveTo(ex - 4.2, eyeY + 0.5);
      ctx.lineTo(ex + 4.2, eyeY + 0.5);
      ctx.stroke();
    }
  } else {
    // Big expressive chibi eyes
    for (const ex of [eyeLX, eyeRX]) {
      ctx.fillStyle = '#361F15';
      const ry = expr === 'tired' ? 3.2 : expr === 'shocked' ? 5.6 : 5.0;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, 4.4, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      // Warm iris bottom tint
      ctx.fillStyle = withLashes ? '#7A422B' : '#6A3B23';
      ctx.beginPath();
      ctx.ellipse(ex, eyeY + 1.5, 3.0, Math.max(1.5, ry * 0.45), 0, 0, Math.PI * 2);
      ctx.fill();

      // Twin glossy anime catchlights
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(ex - 1.4, eyeY - 1.8, 1.7, 0, Math.PI * 2);
      ctx.arc(ex + 1.5, eyeY + 1.2, 0.9, 0, Math.PI * 2);
      ctx.fill();

      if (withLashes) {
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(ex + (ex < 0 ? -4 : 4), eyeY - 2.5);
        ctx.lineTo(ex + (ex < 0 ? -6.5 : 6.5), eyeY - 4.5);
        ctx.stroke();
      }
    }

    // Sleepy eyelids for tired
    if (expr === 'tired') {
      ctx.fillStyle = '#FFE2CA';
      ctx.fillRect(eyeLX - 5, eyeY - 6, 10, 4.5);
      ctx.fillRect(eyeRX - 5, eyeY - 6, 10, 4.5);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(eyeLX - 4.8, eyeY - 1.5);
      ctx.lineTo(eyeLX + 4.8, eyeY - 1.5);
      ctx.moveTo(eyeRX - 4.8, eyeY - 1.5);
      ctx.lineTo(eyeRX + 4.8, eyeY - 1.5);
      ctx.stroke();
    }
  }

  // Expressive Eyebrows
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.1;
  if (expr === 'angry') {
    ctx.beginPath();
    ctx.moveTo(eyeLX - 4, eyeY - 8);
    ctx.lineTo(eyeLX + 4, eyeY - 5);
    ctx.moveTo(eyeRX + 4, eyeY - 8);
    ctx.lineTo(eyeRX - 4, eyeY - 5);
    ctx.stroke();
  } else if (expr === 'sad') {
    ctx.beginPath();
    ctx.moveTo(eyeLX - 4, eyeY - 5);
    ctx.lineTo(eyeLX + 3.5, eyeY - 8);
    ctx.moveTo(eyeRX + 4, eyeY - 5);
    ctx.lineTo(eyeRX - 3.5, eyeY - 8);
    ctx.stroke();
  } else if (expr === 'focused') {
    ctx.beginPath();
    ctx.moveTo(eyeLX - 3.5, eyeY - 7);
    ctx.lineTo(eyeLX + 3.5, eyeY - 6);
    ctx.moveTo(eyeRX + 3.5, eyeY - 7);
    ctx.lineTo(eyeRX - 3.5, eyeY - 6);
    ctx.stroke();
  }

  // Mouths
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.1;
  if (expr === 'happy' || expr === 'cheerful') {
    ctx.fillStyle = '#E85D75';
    ctx.beginPath();
    ctx.arc(0, 6.2, 5.2, 0.05 * Math.PI, 0.95 * Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (expr === 'sad') {
    ctx.beginPath();
    ctx.arc(0, 11.5, 4.5, Math.PI * 1.18, Math.PI * 1.82);
    ctx.stroke();
  } else if (expr === 'angry') {
    ctx.beginPath();
    ctx.moveTo(-4.5, 9.5);
    ctx.lineTo(0, 7.5);
    ctx.lineTo(4.5, 9.5);
    ctx.stroke();
  } else if (expr === 'tired') {
    ctx.fillStyle = '#D87A80';
    ctx.beginPath();
    ctx.ellipse(0, 9, 3.2, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (expr === 'shocked') {
    ctx.fillStyle = '#991B1B';
    ctx.beginPath();
    ctx.ellipse(0, 9.5, 4.5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // Friendly smile
    ctx.beginPath();
    ctx.arc(0, 5.5, 5, 0.16 * Math.PI, 0.84 * Math.PI);
    ctx.stroke();
  }

  ctx.restore();
}

function drawActionProp(
  ctx: CanvasRenderingContext2D,
  cx: number,
  bodyY: number,
  p: PoseParams,
  role: PlayerRole
): void {
  ctx.save();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.2;

  switch (p.prop) {
    case 'tray_idle': {
      const tx = p.view === 'left' ? cx - 23 : cx + 23;
      const ty = bodyY + 11 + p.rightArmY * 0.6;
      drawSilverTray(ctx, tx, ty, 15, 6);
      break;
    }

    case 'tray_high': {
      const tx = p.view === 'left' ? cx - 20 : cx + 20;
      const ty = bodyY - 2 + (p.phase % 2 === 0 ? 0 : -1.5);
      drawSilverTray(ctx, tx, ty, 17, 6.5);
      break;
    }

    case 'tray_serve': {
      const tx = cx - 22;
      const ty = bodyY + 6;
      drawSilverTray(ctx, tx, ty, 17, 6.5);
      // Cloche sparkle
      ctx.fillStyle = '#FBBF24';
      drawStar4(ctx, tx, ty - 14, 6);
      break;
    }

    case 'cooking_ladle': {
      // Wooden spoon stirring + aroma wisps
      const sx = cx + 22 + p.rightArmX;
      const sy = bodyY + 4 + p.rightArmY * 0.5;
      ctx.strokeStyle = '#92400E';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sx, sy + 12);
      ctx.lineTo(sx + 8, sy - 10);
      ctx.stroke();
      ctx.fillStyle = '#B45309';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(sx + 9, sy - 12, 5, 3.5, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Rising steam curl
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2;
      const stY = bodyY - 12 - p.phase * 3;
      ctx.beginPath();
      ctx.moveTo(sx + 6, stY + 8);
      ctx.quadraticCurveTo(sx + 12, stY + 2, sx + 7, stY - 4);
      ctx.stroke();
      break;
    }

    case 'frying_pan': {
      const px = cx + 22 + p.rightArmX * 0.6;
      const py = bodyY + 10 + p.rightArmY * 0.7;
      // Handle
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(px - 10, py + 2);
      ctx.lineTo(px + 2, py);
      ctx.stroke();
      // Pan body
      ctx.fillStyle = '#1E293B';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(px + 11, py - 1, 13, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Tossing sizzling food & flame spark!
      const hop = [0, -14, -8, -1][p.phase];
      ctx.fillStyle = '#E06D3B';
      ctx.beginPath();
      ctx.ellipse(px + 11, py - 4 + hop, 7, 4.5, p.phase * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (p.phase === 1 || p.phase === 2) {
        ctx.fillStyle = '#F97316';
        drawStar4(ctx, px + 11, py + 7, 5);
      }
      break;
    }

    case 'chopping_knife': {
      const kx = cx + 19;
      const ky = bodyY + 9 + p.rightArmY * 0.6;
      // Steel chef blade
      ctx.fillStyle = '#E2E8F0';
      ctx.beginPath();
      ctx.moveTo(kx - 2, ky);
      ctx.lineTo(kx - 16, ky + 6);
      ctx.lineTo(kx - 15, ky - 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Wooden handle
      ctx.fillStyle = '#7C4A2D';
      ctx.fillRect(kx - 2, ky - 3, 8, 5);
      ctx.strokeRect(kx - 2, ky - 3, 8, 5);
      // Fast motion arcs
      if (p.phase % 2 === 1) {
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(kx - 18, ky - 8);
        ctx.lineTo(kx - 12, ky - 14);
        ctx.stroke();
      }
      break;
    }

    case 'serve_plate': {
      const px = cx + 22;
      const py = bodyY + 5;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(px, py, 14, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FBBF24';
      drawStar4(ctx, px + 6, py - 12, 6);
      break;
    }

    case 'burnt_smoke': {
      // Comical cartoon soot clouds puffing around shocked chef
      ctx.fillStyle = 'rgba(68, 64, 60, 0.72)';
      const lift = p.phase * 4;
      ctx.beginPath();
      ctx.arc(cx - 24, bodyY - 26 - lift, 8, 0, Math.PI * 2);
      ctx.arc(cx + 25, bodyY - 30 - lift, 9, 0, Math.PI * 2);
      ctx.arc(cx - 12, bodyY - 46 - lift * 0.7, 7, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'notepad': {
      // Pink order notepad in left hand + pencil writing in right hand
      const nx = cx - 14;
      const ny = bodyY + 7;
      ctx.fillStyle = '#FFF0F5';
      ctx.beginPath();
      ctx.roundRect(nx - 7, ny - 9, 14, 17, 3);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#FF5A6E';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(nx - 4, ny - 4);
      ctx.lineTo(nx + 4, ny - 4);
      ctx.moveTo(nx - 4, ny);
      ctx.lineTo(nx + 3, ny);
      ctx.stroke();
      // Yellow pencil tip moving
      const px = cx + 10 + p.rightArmX;
      const py = bodyY + 5 + p.rightArmY * 0.4;
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(nx + 2, ny + 1);
      ctx.stroke();
      break;
    }

    case 'clean_cloth': {
      // Sky-blue cloth swiping + soapy sparkles
      const wx = cx + 14 + p.rightArmX;
      const wy = bodyY + 12 + p.rightArmY * 0.5;
      ctx.fillStyle = '#38BDF8';
      ctx.beginPath();
      ctx.roundRect(wx - 8, wy - 5, 16, 11, 4);
      ctx.fill();
      ctx.stroke();
      // Soap bubbles
      ctx.fillStyle = '#E0F2FE';
      ctx.strokeStyle = '#0284C7';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(wx - 12, wy - 10 - p.phase * 2, 3.5, 0, Math.PI * 2);
      ctx.arc(wx + 10, wy - 14 - (3 - p.phase) * 2, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'gold_coins': {
      const gx = cx + 22;
      const gy = bodyY + 2 - p.phase * 2.5;
      for (const [dx, dy] of [
        [0, 0],
        [7, -8],
        [-5, -12],
      ]) {
        ctx.fillStyle = '#FBBF24';
        ctx.strokeStyle = '#B45309';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(gx + dx, gy + dy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }

    case 'happy_hearts': {
      const hy = bodyY - 52 - p.phase * 3;
      drawMiniHeart(ctx, cx - 22, hy, 6, '#FF5A6E');
      drawMiniHeart(ctx, cx + 22, hy + 4, 5, '#FBBF24');
      break;
    }

    case 'sad_tears': {
      ctx.fillStyle = '#38BDF8';
      const ty = bodyY - 14 + p.phase * 3.5;
      ctx.beginPath();
      ctx.arc(cx - 10, ty, 2.5, 0, Math.PI * 2);
      ctx.arc(cx + 10, ty + 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'angry_puff': {
      const ax = cx + 24;
      const ay = bodyY - 40 - (p.phase % 2) * 3;
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(ax - 5, ay - 2);
      ctx.lineTo(ax - 1, ay - 2);
      ctx.lineTo(ax - 1, ay - 6);
      ctx.moveTo(ax + 5, ay + 2);
      ctx.lineTo(ax + 1, ay + 2);
      ctx.lineTo(ax + 1, ay + 6);
      ctx.stroke();
      break;
    }

    case 'tired_sweat': {
      // Classic cartoon blue sweat drop
      const sx = cx + 22;
      const sy = bodyY - 30 + p.phase * 2.5;
      ctx.fillStyle = '#38BDF8';
      ctx.strokeStyle = '#0369A1';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 6);
      ctx.quadraticCurveTo(sx + 5, sy + 2, sx, sy + 5);
      ctx.quadraticCurveTo(sx - 5, sy + 2, sx, sy - 6);
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'work_sparkle': {
      ctx.fillStyle = role === 'chef' ? '#F59E0B' : '#EC4899';
      const s = p.phase % 2 === 0 ? 6 : 4;
      drawStar4(ctx, cx - 22, bodyY - 8, s);
      drawStar4(ctx, cx + 22, bodyY - 12, 8 - s);
      break;
    }

    default:
      break;
  }

  ctx.restore();
}

function drawSilverTray(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number
): void {
  ctx.save();
  ctx.fillStyle = '#CBD5E1';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(x, y + 2, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#F8FAFC';
  ctx.beginPath();
  ctx.ellipse(x, y, rx - 1.5, ry - 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawStar4(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rad = i % 2 === 0 ? r : r * 0.35;
    const ang = (i * Math.PI) / 4;
    const px = x + Math.cos(ang) * rad;
    const py = y + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawMiniHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.6);
  ctx.bezierCurveTo(x - size, y, x - size, y - size * 0.8, x, y - size * 0.2);
  ctx.bezierCurveTo(x + size, y - size * 0.8, x + size, y, x, y + size * 0.6);
  ctx.fill();
  ctx.restore();
}
