import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EMPTY_FRONT, parsePage, writePage } from '../docs/markdown';
import { createHistory } from '../canvas/history';
import type { SceneElement } from '../canvas/scene';
import { canvasChanges, documentChanges, type Sizing } from './page-edits';
import { versionOf } from './page-text';

const PAGE = '# Notes\n\nFirst paragraph.\n\nSecond paragraph.\n';

function runDocument(markdown: string, ops: Parameters<typeof documentChanges>[1]) {
  const state = EditorState.create({ doc: parsePage(markdown).doc });
  const { tr, report } = documentChanges(state, ops);
  return { text: writePage(tr.doc, EMPTY_FRONT), report };
}

describe('document changes, by block number', () => {
  it('replaces, inserts after, inserts at the start and removes', () => {
    const { text, report } = runDocument(PAGE, [
      { op: 'replace', block: 'b2', markdown: 'First, *rewritten*.' },
      { op: 'insert', after: 'b3', markdown: '- one\n- two' },
      { op: 'insert', markdown: '> Opening quote' },
      { op: 'remove', block: 'b1' },
    ]);
    expect(text).toBe('> Opening quote\n\nFirst, *rewritten*.\n\nSecond paragraph.\n\n- one\n- two\n');
    expect(report.refused).toEqual([]);
    expect(report.applied).toHaveLength(4);
  });

  it('numbers blocks as the page was read, whatever the order of the changes', () => {
    const { text } = runDocument(PAGE, [
      { op: 'remove', block: 'b1' },
      { op: 'replace', block: 'b3', markdown: 'Second, rewritten.' },
    ]);
    expect(text).toBe('First paragraph.\n\nSecond, rewritten.\n');
  });

  it('moves a block after another, or to the start', () => {
    expect(runDocument(PAGE, [{ op: 'move', block: 'b3', after: 'b1' }]).text).toBe('# Notes\n\nSecond paragraph.\n\nFirst paragraph.\n');
    expect(runDocument(PAGE, [{ op: 'move', block: 'b3' }]).text).toBe('Second paragraph.\n\n# Notes\n\nFirst paragraph.\n');
  });

  it('refuses a block that is not there, or one already removed, saying which', () => {
    const { text, report } = runDocument(PAGE, [
      { op: 'remove', block: 'b2' },
      { op: 'replace', block: 'b2', markdown: 'again' },
      { op: 'remove', block: 'b9' },
      { op: 'insert', after: 'b1', markdown: '   ' },
    ]);
    expect(text).toBe('# Notes\n\nSecond paragraph.\n');
    expect(report.refused).toEqual(['b2: it was removed earlier in this change', 'b9: no such block', 'insert after b1: nothing to insert']);
  });
});

const box = { z: 1, x: 0, y: 0, w: 100, h: 60 };
const SCENE = [
  { ...box, id: 'e1', type: 'rect', label: 'Writer' },
  { ...box, id: 'e2', type: 'rect', x: 300, label: 'Queue', locked: true },
] as SceneElement[];

const sizing: Sizing = {
  measureText: (_element, text) => ({ width: text.length * 7, height: 18 }),
  refit: () => {},
};

describe('canvas changes, by element id', () => {
  it('adds a text measured as drawn, updates a label, removes an element, as one step', () => {
    const history = createHistory({ elements: structuredClone(SCENE) });
    const report = canvasChanges(
      history,
      [
        { op: 'add', element: { id: 'note', type: 'text', text: 'Hello', x: 10, y: 200 } },
        { op: 'update', id: 'e1', set: { label: 'Producer' } },
        { op: 'remove', id: 'note-missing' },
      ],
      sizing,
    );
    const byId = new Map(history.current.elements.map((e) => [e.id, e]));
    expect(byId.get('note')).toMatchObject({ type: 'text', text: 'Hello', w: 35, h: 18, measuredWidth: 35, measuredHeight: 18 });
    expect(byId.get('e1')).toMatchObject({ label: 'Producer' });
    expect(report.refused).toEqual(['note-missing: no such element']);
    history.undo();
    expect(history.current.elements.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('refuses a change to a locked element', () => {
    const history = createHistory({ elements: structuredClone(SCENE) });
    const report = canvasChanges(history, [{ op: 'update', id: 'e2', set: { label: 'X' } }, { op: 'remove', id: 'e2' }], sizing);
    expect(report.refused).toEqual(['e2: it is locked; ask the user to unlock it', 'e2: it is locked; ask the user to unlock it']);
    expect(history.current.elements[1]).toMatchObject({ label: 'Queue' });
  });

  it('gives a new element an id of its own when the one asked for is taken', () => {
    const history = createHistory({ elements: structuredClone(SCENE) });
    const report = canvasChanges(history, [{ op: 'add', element: { id: 'e1', type: 'rect', x: 0, y: 300, w: 80, h: 40 } }], sizing);
    const added = history.current.elements[2];
    expect(added.id).not.toBe('e1');
    expect(report.applied).toEqual([`added ${added.id} (e1 was taken)`]);
  });

  it('goes in while the page is held for the user', () => {
    const history = createHistory({ elements: structuredClone(SCENE) });
    history.hold(true);
    canvasChanges(history, [{ op: 'update', id: 'e1', set: { label: 'Held' } }], sizing);
    expect(history.current.elements[0]).toMatchObject({ label: 'Held' });
  });
});

describe('the version', () => {
  it('is what the reading said, so a stale change can be refused', () => {
    const { doc } = parsePage(PAGE);
    expect(versionOf({ doc, elements: SCENE })).toBe(versionOf({ doc: parsePage(PAGE).doc, elements: structuredClone(SCENE) }));
  });
});

describe('a drawn diagram, put in', () => {
  it('keeps its arrows and frames pointing at its own elements under new ids', () => {
    const history = createHistory({ elements: structuredClone(SCENE) });
    const report = canvasChanges(
      history,
      [
        {
          op: 'insert',
          elements: [
            { id: 'e1', type: 'frame', x: 0, y: 0, w: 10, h: 10, z: 1 },
            { id: 'd2', type: 'rect', x: 0, y: 0, w: 10, h: 10, z: 2, frame: 'e1' },
            { id: 'd3', type: 'arrow', x: 0, y: 0, w: 10, h: 0, z: 3, points: [0, 0, 10, 0], startBinding: 'd2', endBinding: 'e2' },
          ] as SceneElement[],
        },
      ],
      sizing,
    );
    expect(report.applied).toEqual(['added a diagram of 3 elements']);
    const [frame, shape, arrow] = history.current.elements.slice(2) as (SceneElement & Record<string, unknown>)[];
    expect(frame.id).not.toBe('e1');
    expect(shape.frame).toBe(frame.id);
    expect(arrow.startBinding).toBe(shape.id);
    // A binding to something outside the diagram is left as it was.
    expect(arrow.endBinding).toBe('e2');
  });
});
