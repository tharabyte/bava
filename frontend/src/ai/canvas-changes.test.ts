import { describe, expect, it } from 'vitest';
import { createHistory } from '../canvas/history';
import type { SceneElement } from '../canvas/scene';
import { canvasChanges, type CanvasOp, type Sizing } from './page-edits';

const sizing: Sizing = { measureText: (_e, text) => ({ width: text.length * 7, height: 18 }), refit: () => {} };
const at = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({ id, type: 'rect', x, y, w: 100, h: 60, z: 1, ...extra }) as SceneElement;

function scene() {
  return [
    at('a', 0, 0, { label: 'Writer' }),
    at('b', 300, 0, { label: 'Queue' }),
    { id: 't', type: 'table', name: 'events', rows: 'id uuid\nat time', x: 0, y: 300, w: 160, h: 80, z: 1 },
    { id: 'link', type: 'arrow', x: 160, y: 320, w: 140, h: 0, z: 2, points: [0, 0, 140, 0], startBinding: 't', startRow: 'id', endBinding: 'b' },
    { id: 'pic', type: 'image', file: 'logo.png', x: 600, y: 0, w: 80, h: 80, z: 1 },
    { id: 'pen', type: 'stroke', stroke: 'red', x: 0, y: 500, w: 50, h: 20, z: 1, points: [0, 0, 50, 20] },
    at('fixed', 600, 300, { locked: true }),
  ] as SceneElement[];
}

function run(ops: CanvasOp[]) {
  const history = createHistory({ elements: scene() });
  const report = canvasChanges(history, ops, sizing);
  const byId = new Map(history.current.elements.map((e) => [e.id, e as SceneElement & Record<string, unknown>]));
  return { history, report, byId };
}

describe('canvas changes the AI may make', () => {
  it('connects two shapes with a new arrow, bound by ids', () => {
    const { byId, report } = run([{ op: 'connect', id: 'w2q', from: 'a', to: 'b', label: 'writes' }]);
    expect(byId.get('w2q')).toMatchObject({ type: 'arrow', startBinding: 'a', endBinding: 'b', label: 'writes' });
    expect(report.refused).toEqual([]);
  });

  it('moves a shape and its bound arrow follows', () => {
    const { byId } = run([{ op: 'update', id: 'b', set: { y: 200 } }]);
    const arrow = byId.get('link') as unknown as { y: number; points: number[] };
    // The arrow's far end is re-aimed at the moved shape.
    expect(arrow.y + arrow.points[arrow.points.length - 1]).toBeGreaterThan(150);
  });

  it('groups, frames and lines elements up', () => {
    const { byId, history } = run([
      { op: 'group', ids: ['a', 'b'] },
      { op: 'frame', ids: ['a', 'b'], label: 'Ingest' },
      { op: 'arrange', ids: ['a', 'b'], how: 'top' },
    ]);
    const group = history.current.elements.find((e) => e.type === 'group') as SceneElement & { children: string[] };
    const frame = history.current.elements.find((e) => e.type === 'frame')!;
    expect(group.children).toEqual(['a', 'b']);
    expect(byId.get('a')!.frame).toBe(frame.id);
    expect(byId.get('b')!.y).toBe(byId.get('a')!.y);
  });

  it('removing a group removes its members; removing a frame keeps them', () => {
    const grouped = run([{ op: 'group', ids: ['a', 'b'] }]);
    const groupId = grouped.history.current.elements.find((e) => e.type === 'group')!.id;
    canvasChanges(grouped.history, [{ op: 'remove', id: groupId }], sizing);
    expect(grouped.history.current.elements.some((e) => e.id === 'a' || e.id === 'b')).toBe(false);

    const framed = run([{ op: 'frame', ids: ['a'] }]);
    const frameId = framed.history.current.elements.find((e) => e.type === 'frame')!.id;
    canvasChanges(framed.history, [{ op: 'remove', id: frameId }], sizing);
    const a = framed.history.current.elements.find((e) => e.id === 'a')!;
    expect(a.frame).toBeUndefined();
  });

  it('a row renamed away lets its arrow fall back to the whole table, and says so', () => {
    const { byId, report } = run([{ op: 'update', id: 't', set: { rows: 'key uuid\nat time' } }]);
    expect(byId.get('link')!.startRow).toBeUndefined();
    expect(byId.get('link')!.startBinding).toBe('t');
    expect(report.applied).toContain('link was tied to row "id", now gone, and attaches to t as a whole');
  });

  it('is one undo step, all of it', () => {
    const { history } = run([
      { op: 'update', id: 'a', set: { label: 'Producer', fill: 'blue' } },
      { op: 'connect', from: 'a', to: 'b' },
      { op: 'remove', id: 'pen' },
    ]);
    history.undo();
    expect(history.current.elements).toEqual(createHistory({ elements: scene() }).current.elements);
  });
});

describe('canvas changes refused, saying which and why', () => {
  const refusal = (ops: CanvasOp[]) => run(ops).report.refused;

  it('a new pen stroke or picture', () => {
    expect(refusal([{ op: 'add', element: { type: 'stroke', points: [0, 0, 1, 1] } }])).toEqual(['add stroke: the AI never draws pen strokes']);
    expect(refusal([{ op: 'add', element: { type: 'image', file: 'x.png' } }])[0]).toMatch(/never added/);
  });

  it('a picture changed beyond its layout, a pen stroke beyond move and style', () => {
    expect(refusal([{ op: 'update', id: 'pic', set: { file: 'other.png' } }])[0]).toMatch(/pic: a picture is never added or changed/);
    expect(refusal([{ op: 'update', id: 'pic', set: { x: 10, y: 10 } }])).toEqual([]);
    expect(refusal([{ op: 'update', id: 'pen', set: { points: [0, 0, 9, 9] } }])[0]).toMatch(/pen stroke can only be moved/);
    expect(refusal([{ op: 'update', id: 'pen', set: { stroke: 'blue', strokeWidth: 4 } }])).toEqual([]);
  });

  it('a literal colour or a size off Bava’s steps', () => {
    expect(refusal([{ op: 'update', id: 'a', set: { fill: '#ff0000' } }])[0]).toMatch(/fill must be one of Bava's colours/);
    expect(refusal([{ op: 'update', id: 'a', set: { fontSize: 17 } }])[0]).toMatch(/fontSize must be one of 16, 20, 28, 36/);
    expect(refusal([{ op: 'update', id: 'a', set: { strokeWidth: 3 } }])[0]).toMatch(/strokeWidth must be one of 1, 2, 4/);
  });

  it('an element that is locked, or not there, and locking itself', () => {
    expect(refusal([{ op: 'update', id: 'fixed', set: { x: 0 } }])).toEqual(['fixed: it is locked; ask the user to unlock it']);
    expect(refusal([{ op: 'update', id: 'a', set: { locked: true } }])).toEqual(['a: the AI never locks or unlocks; ask the user']);
    expect(refusal([{ op: 'remove', id: 'ghost' }])).toEqual(['ghost: no such element']);
    expect(refusal([{ op: 'connect', from: 'a', to: 'ghost' }])).toEqual(['connect: ghost: no such element']);
  });
});

describe('a frame or group never takes in a locked element', () => {
  it('is refused, saying which', () => {
    const { report, history } = run([{ op: 'frame', ids: ['a', 'fixed'] }, { op: 'group', ids: ['fixed', 'b'] }]);
    expect(report.refused).toEqual(['fixed: it is locked; ask the user to unlock it', 'fixed: it is locked; ask the user to unlock it']);
    expect(history.current.elements.some((e) => e.type === 'frame' || e.type === 'group')).toBe(false);
  });
});
