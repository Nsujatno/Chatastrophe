import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSETS } from '../../src/game/assets';

describe('shipped preview artwork', () => {
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
});
