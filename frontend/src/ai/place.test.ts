import { describe, expect, it } from 'vitest';
import type { SceneElement } from '../canvas/scene';
import { PLACE_GAP, placeBeside } from './place';

const rect = (id: string, x: number, y: number, w = 100, h = 50) => ({ id, type: 'rect', x, y, w, h, z: 1 }) as SceneElement;

describe('placeBeside', () => {
  it('puts what arrives to the right of what is there, level with its top, overlapping nothing', () => {
    const existing = [rect('a', 0, 40), rect('b', 300, 200)];
    const placed = placeBeside(existing, [rect('n1', -50, -20), rect('n2', 100, 60)]);
    expect(placed.map((e) => [e.x, e.y])).toEqual([
      [400 + PLACE_GAP, 40],
      [400 + PLACE_GAP + 150, 120],
    ]);
    for (const p of placed) for (const e of existing) expect(p.x >= e.x + e.w || p.y >= e.y + e.h || p.x + p.w <= e.x || p.y + p.h <= e.y).toBe(true);
  });

  it('starts at the origin on an empty canvas', () => {
    expect(placeBeside([], [rect('n', -40, -40)])[0]).toMatchObject({ x: 0, y: 0 });
  });
});
