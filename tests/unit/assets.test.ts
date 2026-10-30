import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSETS, ATLAS_ASSETS } from '../../src/game/assets';

describe('shipped artwork', () => {
  for (const [key, asset] of Object.entries(ASSETS)) {
    it(`${key} is a valid PNG with usable silhouette bounds`, () => {
      const file = readFileSync(resolve('public/assets', asset.file));
      expect(file.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      const width = file.readUInt32BE(16);
      const height = file.readUInt32BE(20);
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      if ('bounds' in asset) {
        expect(file[25], 'machine sprites must carry an alpha channel').toBe(6);
        expect(asset.bounds.x).toBeGreaterThanOrEqual(0);
        expect(asset.bounds.y).toBeGreaterThanOrEqual(0);
        expect(asset.bounds.width).toBeGreaterThan(0);
        expect(asset.bounds.height).toBeGreaterThan(0);
        expect(asset.bounds.x + asset.bounds.width).toBeLessThanOrEqual(width);
        expect(asset.bounds.y + asset.bounds.height).toBeLessThanOrEqual(height);
      }
    });
  }

  for (const [key, asset] of Object.entries(ATLAS_ASSETS)) it(`${key} has sixteen aligned directional frames inside its source sheet`, () => {
    const file = readFileSync(resolve('public/assets', asset.file));
    const width = file.readUInt32BE(16);
    const height = file.readUInt32BE(20);
    expect(file[25]).toBe(6);
    const atlas = JSON.parse(readFileSync(resolve('public/assets', asset.atlas), 'utf8').replace(/^\uFEFF/, ''));
    expect(Object.keys(atlas.frames)).toHaveLength(16);
    const canvas = atlas.frames['down-0'].sourceSize;
    expect(canvas.w).toBeGreaterThan(0);
    expect(canvas.h).toBeGreaterThan(0);
    for (const direction of ['down', 'left', 'right', 'up']) {
      for (let i = 0; i < 4; i++) {
        const { frame, sourceSize, spriteSourceSize } = atlas.frames[`${direction}-${i}`];
        expect(frame.x).toBeGreaterThanOrEqual(0);
        expect(frame.y).toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.w).toBeLessThanOrEqual(width);
        expect(frame.y + frame.h).toBeLessThanOrEqual(height);
        expect(frame.w).toBeGreaterThan(0);
        expect(frame.h).toBeGreaterThan(0);
        expect(sourceSize).toEqual(canvas);
        expect(spriteSourceSize.x).toBeGreaterThanOrEqual(0);
        expect(spriteSourceSize.y).toBeGreaterThanOrEqual(0);
        expect(spriteSourceSize.x + frame.w).toBeLessThanOrEqual(canvas.w);
        expect(spriteSourceSize.y + frame.h).toBeLessThanOrEqual(canvas.h);
      }
    }
  });
});
