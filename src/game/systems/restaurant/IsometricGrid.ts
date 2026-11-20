import { GRID_COLS, GRID_ROWS } from '../../../shared/layout.ts';

export const ISO_TILE_W = 74;
export const ISO_TILE_H = 38;

// Centered cleanly inside 1280x720 16:9 canvas with room for walls, windows & top HUD
export const ISO_ORIGIN_X = 564;
export const ISO_ORIGIN_Y = 168;

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface GridPoint {
  col: number;
  row: number;
}

export function gridToIso(col: number, row: number): ScreenPoint {
  return {
    x: ISO_ORIGIN_X + (col - row) * (ISO_TILE_W / 2),
    y: ISO_ORIGIN_Y + (col + row) * (ISO_TILE_H / 2),
  };
}

export function isoToGrid(screenX: number, screenY: number): GridPoint {
  const dx = screenX - ISO_ORIGIN_X;
  const dy = screenY - ISO_ORIGIN_Y;
  const halfW = ISO_TILE_W / 2;
  const halfH = ISO_TILE_H / 2;
  const col = (dx / halfW + dy / halfH) / 2;
  const row = (dy / halfH - dx / halfW) / 2;
  return {
    col: Math.max(0, Math.min(GRID_COLS - 0.1, col)),
    row: Math.max(0, Math.min(GRID_ROWS - 0.1, row)),
  };
}

export function computeIsoDepth(col: number, row: number, layerBoost = 0): number {
  return Math.round((col + row) * 100 + layerBoost);
}
