import Phaser from 'phaser';
import { ISO_TILE_H, ISO_TILE_W } from '../systems/restaurant/IsometricGrid.ts';

/**
 * Generates crisp 2.5D Pastel Cartoon isometric tiles, Burger Cafe furniture,
 * and dish textures onto HTML5 Canvases for sharp 60fps Android rendering.
 */
export function generateProceduralTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('tile_kitchen_a')) return;

  // Isometric floor tiles with subtle texture grain & 2.5D thickness slab
  createIsoTile(scene, 'tile_kitchen_a', '#FFF8EE', '#EFD9C2', '#D8BC9E', 'ceramic');
  createIsoTile(scene, 'tile_kitchen_b', '#F5EAE0', '#E4CCB5', '#D8BC9E', 'ceramic');
  createIsoTile(scene, 'tile_dining_a', '#F8DFB9', '#E6C290', '#C99E6B', 'wood');
  createIsoTile(scene, 'tile_dining_b', '#F2D4A8', '#DFB682', '#C99E6B', 'wood');
  createIsoTile(scene, 'tile_pass_floor', '#F7B4A2', '#E2927E', '#BD6A56', 'ceramic');
  createIsoTile(scene, 'tile_wait_mat', '#FF7B95', '#E25976', '#B33B56', 'carpet');
  createIsoTile(scene, 'tile_queue_carpet', '#FFD1DC', '#F4AFC0', '#D97C94', 'carpet');

  // Kitchen & Dining 2.5D Interactive Props
  createCounterTexture(scene, 'prop_counter_pass', '#FF998A', '#EE766B', '#FFF9F2', 'pass');
  createCounterTexture(scene, 'prop_counter_solid', '#F4A698', '#E08476', '#FFF5EC', 'solid');
  createPantryTexture(scene, 'prop_pantry');
  createCounterTexture(scene, 'prop_stove_grill', '#7C8EA6', '#5B6E87', '#334155', 'grill');
  createCounterTexture(scene, 'prop_stove_pot', '#E88B6F', '#CC6A4E', '#475569', 'pot');
  createCounterTexture(scene, 'prop_stove_oven', '#F4C08A', '#DA9C60', '#5C3A28', 'oven');
  createCounterTexture(scene, 'prop_stove_wok', '#6CA08E', '#4C7E6D', '#334155', 'wok');
  createPrepTableTexture(scene, 'prop_prep_table');
  createDiningTableTexture(scene, 'prop_table');
  createTrashBinTexture(scene, 'prop_trash');
  createRegisterTexture(scene, 'prop_register');
  createCleaningStationTexture(scene, 'prop_cleaning_station');
  createPlantTexture(scene, 'prop_plant');
  createStanchionTexture(scene, 'prop_stanchion');

  // Legacy static fallback icons (used if needed outside spritesheet scenes)
  createChefSprite(scene, 'char_chef');
  createWaiterSprite(scene, 'char_waiter');

  // Dishes
  createDishSprite(scene, 'dish_heart_burger_raw', '#C77D55', false, true);
  createDishSprite(scene, 'dish_heart_burger_cooked', '#E06D3B', true, false);
  createDishSprite(scene, 'dish_love_pasta_raw', '#F5D598', false, true);
  createDishSprite(scene, 'dish_love_pasta_cooked', '#E84A5F', true, false);
  createDishSprite(scene, 'dish_berry_cake_raw', '#FAD4DF', false, true);
  createDishSprite(scene, 'dish_berry_cake_cooked', '#F27999', true, false);
  createDishSprite(scene, 'dish_golden_ramen_raw', '#F2D07D', false, true);
  createDishSprite(scene, 'dish_golden_ramen_cooked', '#F4A62A', true, false);
  createDishSprite(scene, 'dish_burned', '#2D2726', false, false, true);

  // Soft particle dot
  createParticleDot(scene, 'fx_dot');
}

function makeCanvas(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void
): void {
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);
  draw(ctx);
  tex.refresh();
}

function createIsoTile(
  scene: Phaser.Scene,
  key: string,
  topColor: string,
  sideColor: string,
  strokeColor: string,
  pattern: 'ceramic' | 'wood' | 'carpet'
): void {
  const w = ISO_TILE_W + 4;
  const h = ISO_TILE_H + 14;
  makeCanvas(scene, key, w, h, (ctx) => {
    const cx = w / 2;
    const cy = ISO_TILE_H / 2 + 2;
    const hw = ISO_TILE_W / 2;
    const hh = ISO_TILE_H / 2;

    // 2.5D thickness slab
    ctx.beginPath();
    ctx.moveTo(cx - hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx + hw, cy + 8);
    ctx.lineTo(cx, cy + hh + 8);
    ctx.lineTo(cx - hw, cy + 8);
    ctx.closePath();
    ctx.fillStyle = sideColor;
    ctx.fill();

    // Top diamond
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.fillStyle = topColor;
    ctx.fill();

    // Subtle surface texture inside diamond
    ctx.save();
    ctx.clip();
    if (pattern === 'wood') {
      ctx.strokeStyle = 'rgba(139, 90, 43, 0.14)';
      ctx.lineWidth = 1.2;
      for (let i = -hw; i <= hw; i += 10) {
        ctx.beginPath();
        ctx.moveTo(cx + i - 14, cy - hh);
        ctx.lineTo(cx + i + 18, cy + hh);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.beginPath();
      ctx.ellipse(cx - 6, cy - 3, 14, 5, -0.35, 0, Math.PI * 2);
      ctx.fill();
    } else if (pattern === 'ceramic') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.beginPath();
      ctx.moveTo(cx, cy - hh + 4);
      ctx.lineTo(cx + hw - 10, cy);
      ctx.lineTo(cx, cy - 2);
      ctx.lineTo(cx - hw + 10, cy);
      ctx.closePath();
      ctx.fill();
    } else if (pattern === 'carpet') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy - hh + 5);
      ctx.lineTo(cx + hw - 10, cy);
      ctx.lineTo(cx, cy + hh - 5);
      ctx.lineTo(cx - hw + 10, cy);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.25;
    ctx.stroke();
  });
}

function drawIsoBox(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  hw: number,
  hh: number,
  boxH: number,
  leftColor: string,
  rightColor: string,
  topColor: string
): void {
  // Soft ambient ground shadow
  ctx.fillStyle = 'rgba(74, 43, 29, 0.16)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY + hh * 0.58, hw + 4, hh + 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#4A2B1D';
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';

  // Left face
  ctx.beginPath();
  ctx.moveTo(cx - hw, baseY - boxH);
  ctx.lineTo(cx, baseY + hh - boxH);
  ctx.lineTo(cx, baseY + hh);
  ctx.lineTo(cx - hw, baseY);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();
  ctx.stroke();

  // Right face
  ctx.beginPath();
  ctx.moveTo(cx + hw, baseY - boxH);
  ctx.lineTo(cx, baseY + hh - boxH);
  ctx.lineTo(cx, baseY + hh);
  ctx.lineTo(cx + hw, baseY);
  ctx.closePath();
  ctx.fillStyle = rightColor;
  ctx.fill();
  ctx.stroke();

  // Top face
  ctx.beginPath();
  ctx.moveTo(cx, baseY - hh - boxH);
  ctx.lineTo(cx + hw, baseY - boxH);
  ctx.lineTo(cx, baseY + hh - boxH);
  ctx.lineTo(cx - hw, baseY - boxH);
  ctx.closePath();
  ctx.fillStyle = topColor;
  ctx.fill();
  ctx.stroke();
}

function createCounterTexture(
  scene: Phaser.Scene,
  key: string,
  leftColor: string,
  rightColor: string,
  topColor: string,
  kind: 'grill' | 'pot' | 'oven' | 'wok' | 'pass' | 'solid'
): void {
  const w = 90;
  const h = 92;
  makeCanvas(scene, key, w, h, (ctx) => {
    const cx = w / 2;
    const baseY = 66;
    const hw = 34;
    const hh = 17;
    const boxH = 29;

    drawIsoBox(ctx, cx, baseY, hw, hh, boxH, leftColor, rightColor, topColor);

    // Subtle cabinet panel lines on front-left & front-right faces
    ctx.strokeStyle = 'rgba(74, 43, 29, 0.25)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - hw + 6, baseY - boxH + 10);
    ctx.lineTo(cx - 5, baseY + hh - boxH + 4);
    ctx.stroke();

    if (kind === 'pass') {
      // Brass heat lamp rail & tiny pickup bell on top
      ctx.fillStyle = '#FDE68A';
      ctx.strokeStyle = '#4A2B1D';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(cx + 12, baseY - boxH - 2, 6, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.arc(cx + 12, baseY - boxH - 4, 3.5, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'solid') {
      // Decorative napkin dispenser + ketchup/mustard bottles
      ctx.fillStyle = '#EF4444';
      ctx.strokeStyle = '#4A2B1D';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(cx - 10, baseY - boxH - 13, 6, 12, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FACC15';
      ctx.beginPath();
      ctx.roundRect(cx - 2, baseY - boxH - 11, 6, 10, 2);
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'grill') {
      // Cast-iron flat burger grill with warm embers & dials
      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.ellipse(cx, baseY - boxH, 19, 9.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FB923C';
      ctx.lineWidth = 2;
      for (let i = -9; i <= 9; i += 6) {
        ctx.beginPath();
        ctx.moveTo(cx + i - 5, baseY - boxH - 4);
        ctx.lineTo(cx + i + 5, baseY - boxH + 4);
        ctx.stroke();
      }
      // Control knobs on right face
      ctx.fillStyle = '#F8FAFC';
      ctx.beginPath();
      ctx.arc(cx + 12, baseY - 17, 2.5, 0, Math.PI * 2);
      ctx.arc(cx + 22, baseY - 22, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'pot') {
      // Stainless stockpot with warm simmering soup
      ctx.fillStyle = '#E2E8F0';
      ctx.strokeStyle = '#4A2B1D';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(cx - 15, baseY - boxH - 12, 30, 14, 5);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, baseY - boxH - 11, 15, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.ellipse(cx, baseY - boxH - 11, 11.5, 5.2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'oven') {
      // Pastel bakery oven with glowing warm glass window on right face
      ctx.fillStyle = '#FEF08A';
      ctx.strokeStyle = '#4A2B1D';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + 6, baseY - 12);
      ctx.lineTo(cx + 27, baseY - 22);
      ctx.lineTo(cx + 27, baseY - 6);
      ctx.lineTo(cx + 6, baseY + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Oven handle
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(cx + 9, baseY - 15);
      ctx.lineTo(cx + 24, baseY - 22);
      ctx.stroke();
    } else if (kind === 'wok') {
      ctx.fillStyle = '#1F2937';
      ctx.strokeStyle = '#4A2B1D';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, baseY - boxH - 2, 17, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#92400E';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(cx + 14, baseY - boxH - 4);
      ctx.lineTo(cx + 28, baseY - boxH - 11);
      ctx.stroke();
    }
  });
}

function createPantryTexture(scene: Phaser.Scene, key: string): void {
  const w = 90;
  const h = 96;
  makeCanvas(scene, key, w, h, (ctx) => {
    const cx = w / 2;
    const baseY = 69;
    drawIsoBox(ctx, cx, baseY, 34, 17, 34, '#CBEAD8', '#A8D8BE', '#FFFDF7');

    // Pastel wooden crate rim & handle on right face
    ctx.fillStyle = '#E8B87D';
    ctx.strokeStyle = '#4A2B1D';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx + 6, baseY - 18);
    ctx.lineTo(cx + 28, baseY - 28);
    ctx.lineTo(cx + 28, baseY - 10);
    ctx.lineTo(cx + 6, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Fresh produce crate inset on top
    ctx.fillStyle = '#F6D6A5';
    ctx.beginPath();
    ctx.moveTo(cx, baseY - 46);
    ctx.lineTo(cx + 22, baseY - 35);
    ctx.lineTo(cx, baseY - 24);
    ctx.lineTo(cx - 22, baseY - 35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

function createPrepTableTexture(scene: Phaser.Scene, key: string): void {
  const w = 92;
  const h = 92;
  makeCanvas(scene, key, w, h, (ctx) => {
    const cx = w / 2;
    const baseY = 66;
    drawIsoBox(ctx, cx, baseY, 34, 17, 29, '#F2C99A', '#DFA970', '#FFF4E2');

    // Wooden chopping board on top
    ctx.fillStyle = '#D99B58';
    ctx.strokeStyle = '#4A2B1D';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx - 2, baseY - 39);
    ctx.lineTo(cx + 18, baseY - 29);
    ctx.lineTo(cx + 2, baseY - 21);
    ctx.lineTo(cx - 18, baseY - 31);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Crisp lettuce leaf + tomato slices on board
    ctx.fillStyle = '#4ADE80';
    ctx.beginPath();
    ctx.arc(cx - 5, baseY - 31, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(cx + 3, baseY - 29, 3.6, 0, Math.PI * 2);
    ctx.fill();

    // Stainless chef knife resting cleanly on right edge
    ctx.fillStyle = '#E2E8F0';
    ctx.strokeStyle = '#4A2B1D';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + 8, baseY - 36);
    ctx.lineTo(cx + 20, baseY - 30);
    ctx.lineTo(cx + 17, baseY - 27);
    ctx.lineTo(cx + 7, baseY - 33);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

function createDiningTableTexture(scene: Phaser.Scene, key: string): void {
  const w = 104;
  const h = 94;
  makeCanvas(scene, key, w, h, (ctx) => {
    const cx = w / 2;
    const cy = 56;

    // Soft layered ground shadow for table + both chairs
    ctx.fillStyle = 'rgba(74, 43, 29, 0.16)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 15, 42, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#4A2B1D';
    ctx.lineWidth = 2.1;
    ctx.lineJoin = 'round';

    // Back-left cushioned pastel pink cafe chair
    ctx.fillStyle = '#B8764B';
    ctx.fillRect(cx - 35, cy + 3, 4, 12);
    ctx.fillRect(cx - 24, cy + 5, 4, 12);
    ctx.fillStyle = '#FFA8C0';
    ctx.beginPath();
    ctx.roundRect(cx - 39, cy - 16, 18, 22, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FFD3DF';
    ctx.beginPath();
    ctx.ellipse(cx - 30, cy + 2, 10, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Back-right cushioned pastel mint cafe chair
    ctx.fillStyle = '#B8764B';
    ctx.fillRect(cx + 21, cy + 5, 4, 12);
    ctx.fillRect(cx + 31, cy + 3, 4, 12);
    ctx.fillStyle = '#A7E3C9';
    ctx.beginPath();
    ctx.roundRect(cx + 21, cy - 16, 18, 22, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#D1F5E5';
    ctx.beginPath();
    ctx.ellipse(cx + 30, cy + 2, 10, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Turned wooden pedestal leg
    ctx.fillStyle = '#8C5338';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 14, 13, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(cx - 5, cy - 4, 10, 18);
    ctx.strokeRect(cx - 5, cy - 4, 10, 18);

    // Warm oak tabletop depth rim
    ctx.fillStyle = '#C98350';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 6, 31, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Cream pastel tablecloth top
    ctx.fillStyle = '#FFFDF9';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 11, 30, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Pastel rose center runner
    ctx.fillStyle = '#FF90A8';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 11, 15, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tiny table flower vase centerpiece
    ctx.fillStyle = '#93C5FD';
    ctx.beginPath();
    ctx.roundRect(cx - 3, cy - 18, 6, 7, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.arc(cx, cy - 20, 3.2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function createTrashBinTexture(scene: Phaser.Scene, key: string): void {
  makeCanvas(scene, key, 64, 72, (ctx) => {
    const cx = 32;
    ctx.fillStyle = 'rgba(74, 43, 29, 0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, 58, 17, 8.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#94A3B8';
    ctx.strokeStyle = '#4A2B1D';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.roundRect(17, 24, 30, 33, 6);
    ctx.fill();
    ctx.stroke();

    // Pedal bar
    ctx.fillStyle = '#475569';
    ctx.fillRect(cx - 6, 54, 12, 4);

    // Lid
    ctx.fillStyle = '#64748B';
    ctx.beginPath();
    ctx.ellipse(cx, 24, 17, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

function createRegisterTexture(scene: Phaser.Scene, key: string): void {
  const w = 90;
  const h = 96;
  makeCanvas(scene, key, w, h, (ctx) => {
    const cx = w / 2;
    const baseY = 69;
    // Pastel mint-cream cashier counter base
    drawIsoBox(ctx, cx, baseY, 34, 17, 28, '#A9DEC8', '#83C7AC', '#FFFDF8');

    // Retro golden-amber cash register on top
    ctx.strokeStyle = '#4A2B1D';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.roundRect(cx - 16, baseY - 46, 32, 18, 5);
    ctx.fill();
    ctx.stroke();

    // Register digital display screen
    ctx.fillStyle = '#DCFCE7';
    ctx.beginPath();
    ctx.roundRect(cx - 11, baseY - 56, 22, 11, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#15803D';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$$$', cx, baseY - 48);

    // Glass tip jar next to register
    ctx.fillStyle = 'rgba(254, 240, 138, 0.85)';
    ctx.beginPath();
    ctx.roundRect(cx + 15, baseY - 38, 9, 10, 3);
    ctx.fill();
    ctx.stroke();
  });
}

function createCleaningStationTexture(scene: Phaser.Scene, key: string): void {
  const w = 90;
  const h = 96;
  makeCanvas(scene, key, w, h, (ctx) => {
    const cx = w / 2;
    const baseY = 69;
    // Pastel sky-blue utility cabinet
    drawIsoBox(ctx, cx, baseY, 33, 16, 26, '#BAE6FD', '#7DD3FC', '#F8FAFC');

    ctx.strokeStyle = '#4A2B1D';
    ctx.lineWidth = 2;

    // Yellow mop bucket on top-left
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.roundRect(cx - 18, baseY - 44, 18, 16, 4);
    ctx.fill();
    ctx.stroke();

    // Wooden mop handle leaning out of bucket
    ctx.strokeStyle = '#92400E';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(cx - 10, baseY - 42);
    ctx.lineTo(cx - 22, baseY - 64);
    ctx.stroke();

    // Pastel pink sanitizer spray bottle & folded white towels
    ctx.strokeStyle = '#4A2B1D';
    ctx.lineWidth = 1.8;
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.roundRect(cx + 4, baseY - 42, 10, 13, 3);
    ctx.fill();
    ctx.stroke();

    // Sparkling foam bubbles
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx - 4, baseY - 48, 3.2, 0, Math.PI * 2);
    ctx.arc(cx + 3, baseY - 52, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function createPlantTexture(scene: Phaser.Scene, key: string): void {
  makeCanvas(scene, key, 64, 84, (ctx) => {
    const cx = 32;
    // Soft shadow
    ctx.fillStyle = 'rgba(74, 43, 29, 0.16)';
    ctx.beginPath();
    ctx.ellipse(cx, 70, 17, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#4A2B1D';
    ctx.lineWidth = 2.1;

    // Terracotta pastel pot
    ctx.fillStyle = '#E89068';
    ctx.beginPath();
    ctx.moveTo(cx - 13, 46);
    ctx.lineTo(cx + 13, 46);
    ctx.lineTo(cx + 10, 68);
    ctx.lineTo(cx - 10, 68);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Pot rim
    ctx.fillStyle = '#F2A982';
    ctx.beginPath();
    ctx.roundRect(cx - 15, 42, 30, 7, 3);
    ctx.fill();
    ctx.stroke();

    // Lush pastel green leaves
    const leaves = [
      { x: cx - 12, y: 30, rx: 11, ry: 7, rot: -0.5, col: '#6EE7B7' },
      { x: cx + 12, y: 31, rx: 11, ry: 7, rot: 0.5, col: '#34D399' },
      { x: cx - 6, y: 20, rx: 10, ry: 7, rot: -0.25, col: '#4ADE80' },
      { x: cx + 7, y: 21, rx: 10, ry: 7, rot: 0.25, col: '#86EFAC' },
      { x: cx, y: 15, rx: 9, ry: 11, rot: 0, col: '#34D399' },
    ];
    for (const lf of leaves) {
      ctx.save();
      ctx.translate(lf.x, lf.y);
      ctx.rotate(lf.rot);
      ctx.fillStyle = lf.col;
      ctx.beginPath();
      ctx.ellipse(0, 0, lf.rx, lf.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  });
}

function createStanchionTexture(scene: Phaser.Scene, key: string): void {
  makeCanvas(scene, key, 32, 54, (ctx) => {
    const cx = 16;
    ctx.fillStyle = 'rgba(74, 43, 29, 0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, 46, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#4A2B1D';
    ctx.lineWidth = 1.8;
    ctx.fillStyle = '#FBBF24';
    ctx.beginPath();
    ctx.ellipse(cx, 44, 7.5, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillRect(cx - 2.2, 16, 4.4, 28);
    ctx.strokeRect(cx - 2.2, 16, 4.4, 28);

    ctx.beginPath();
    ctx.arc(cx, 14, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

function createChefSprite(scene: Phaser.Scene, key: string): void {
  makeCanvas(scene, key, 88, 116, (ctx) => {
    const cx = 44;
    ctx.fillStyle = 'rgba(59, 35, 24, 0.22)';
    ctx.beginPath();
    ctx.ellipse(cx, 105, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#4A2B1D';
    ctx.lineWidth = 2.8;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(cx - 18, 62, 36, 36, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8C5338';
    ctx.beginPath();
    ctx.roundRect(cx - 15, 78, 30, 21, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FFE0C8';
    ctx.beginPath();
    ctx.arc(cx, 44, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx, 16, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

function createWaiterSprite(scene: Phaser.Scene, key: string): void {
  makeCanvas(scene, key, 96, 116, (ctx) => {
    const cx = 44;
    ctx.fillStyle = 'rgba(59, 35, 24, 0.22)';
    ctx.beginPath();
    ctx.ellipse(cx, 105, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#4A2B1D';
    ctx.lineWidth = 2.8;
    ctx.fillStyle = '#FFB3C6';
    ctx.beginPath();
    ctx.roundRect(cx - 18, 63, 36, 35, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(cx - 13, 75, 26, 22, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FFE2CC';
    ctx.beginPath();
    ctx.arc(cx, 44, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

function createDishSprite(
  scene: Phaser.Scene,
  key: string,
  color: string,
  withPlate: boolean,
  isRaw: boolean,
  isBurned = false
): void {
  makeCanvas(scene, key, 48, 42, (ctx) => {
    const cx = 24;
    const cy = 24;

    if (withPlate || isBurned) {
      ctx.fillStyle = isBurned ? '#44403C' : '#FFFFFF';
      ctx.strokeStyle = '#4A2B1D';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 5, 19, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = color;
    ctx.strokeStyle = '#4A2B1D';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, isRaw ? 12 : 14, isRaw ? 8 : 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (isBurned) {
      ctx.strokeStyle = '#78716C';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy - 8);
      ctx.quadraticCurveTo(cx - 9, cy - 15, cx - 3, cy - 19);
      ctx.moveTo(cx + 5, cy - 7);
      ctx.quadraticCurveTo(cx + 9, cy - 14, cx + 4, cy - 18);
      ctx.stroke();
    } else if (!isRaw) {
      ctx.fillStyle = '#FFF5F7';
      ctx.beginPath();
      ctx.arc(cx - 4, cy - 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(cx + 3, cy - 3, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function createParticleDot(scene: Phaser.Scene, key: string): void {
  makeCanvas(scene, key, 16, 16, (ctx) => {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(8, 8, 6, 0, Math.PI * 2);
    ctx.fill();
  });
}
