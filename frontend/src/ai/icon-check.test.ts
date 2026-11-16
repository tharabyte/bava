import { describe, expect, it } from 'vitest';
import { screenIcons } from './icon-check';

describe('icon names in a change', () => {
  it('keeps names a set holds and refuses the rest, saying which', () => {
    const known = (name: string) => name === 'line/database';
    const { edit, refused } = screenIcons(
      {
        version: 'v',
        canvas: [
          { op: 'add', element: { type: 'icon', icon: 'line/database', x: 0, y: 0, w: 48, h: 48 } },
          { op: 'add', element: { type: 'icon', icon: 'https://example.com/x.svg', x: 0, y: 0, w: 48, h: 48 } },
          { op: 'update', id: 'i1', set: { icon: 'line/nothing' } },
          { op: 'update', id: 'a', set: { label: 'kept' } },
        ],
      },
      known,
    );
    expect(edit.canvas).toHaveLength(2);
    expect(refused).toEqual([
      'add icon: no icon set holds https://example.com/x.svg; find one with find_icon',
      'i1: no icon set holds line/nothing; find one with find_icon',
    ]);
  });
});
