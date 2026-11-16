// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { openEditor } from '../docs/test-editor';
import { createHistory } from '../canvas/history';
import type { SceneElement } from '../canvas/scene';
import { applyToFile, applyToOpen } from './apply';
import type { PageEdit, Sizing } from './page-edits';
import { versionOf } from './page-text';
import { parsePage } from '../docs/markdown';
import { handleWork } from './page-work';

const PAGE = '---\ntags: [ops]\n---\n# Notes\n\nFirst paragraph.\n\n- a\n- b\n';
const SCENE = [{ id: 'e1', type: 'rect', x: 0, y: 0, w: 100, h: 60, z: 1, label: 'Writer' }] as SceneElement[];
const sizing: Sizing = { measureText: (_e, text) => ({ width: text.length * 7, height: 18 }), refit: () => {} };

const versionFor = (source: string, elements: SceneElement[]) => versionOf({ doc: parsePage(source).doc, elements });

function edit(version: string): PageEdit {
  return {
    version,
    document: [
      { op: 'replace', block: 'b2', markdown: 'First, **rewritten**.' },
      { op: 'insert', after: 'b3', markdown: '> A note' },
    ],
    canvas: [
      { op: 'add', element: { id: 'note', type: 'text', text: 'Hi', x: 0, y: 100 } },
      { op: 'update', id: 'e1', set: { label: 'Producer' } },
    ],
  };
}

describe('applying a change', () => {
  it('gives the same file through the editor as through the worker', () => {
    const version = versionFor(PAGE, SCENE);
    const { editor, view } = openEditor(PAGE);
    const history = createHistory({ elements: structuredClone(SCENE) });
    editor.setHeld(true);
    history.hold(true);
    const onScreen = applyToOpen('Notes.md', { view, history, pageLocked: false }, edit(version), sizing);
    const closed = applyToFile('Notes.md', { source: PAGE, scene: { version: 1, elements: structuredClone(SCENE) } }, edit(version), sizing);
    expect(onScreen.report).toEqual(closed.report);
    expect(editor.markdown()).toBe(closed.file!.source);
    expect(history.current.elements).toEqual(closed.file!.scene.elements);
    expect(onScreen.text).toBe(closed.text);
    expect(closed.file!.source).toBe('---\ntags: [ops]\n---\n# Notes\n\nFirst, **rewritten**.\n\n- a\n- b\n\n> A note\n');
  });

  it('is one undo step in the editor and one in the canvas', () => {
    const { editor, view } = openEditor(PAGE);
    const history = createHistory({ elements: structuredClone(SCENE) });
    applyToOpen('Notes.md', { view, history, pageLocked: false }, edit(versionFor(PAGE, SCENE)), sizing);
    editor.undo();
    expect(editor.markdown()).toBe(PAGE);
    history.undo();
    expect(history.current.elements).toEqual(SCENE);
  });

  it('refuses a stale version whole, with the fresh text', () => {
    const answer = applyToFile('Notes.md', { source: PAGE, scene: { version: 1, elements: SCENE } }, edit('00000000'), sizing);
    expect(answer.stale).toBe(true);
    expect(answer.file).toBeUndefined();
    expect(answer.text).toContain(`Version: ${versionFor(PAGE, SCENE)}`);
  });

  it('refuses a page the user locked', () => {
    const locked = '---\nbava:\n  locked: true\n---\n# Notes\n';
    const answer = applyToFile('Notes.md', { source: locked, scene: { version: 1, elements: [] } }, edit(versionFor(locked, [])), sizing);
    expect(answer.locked).toBe(true);
    expect(answer.file).toBeUndefined();
  });

  it('keeps a page whose prose was not changed byte for byte', () => {
    const odd = '# Notes\n\n*  hand   written*\n';
    const canvasOnly: PageEdit = { version: versionFor(odd, []), canvas: [{ op: 'add', element: { type: 'rect', x: 0, y: 0, w: 10, h: 10 } }] };
    expect(applyToFile('Notes.md', { source: odd, scene: { version: 1 } }, canvasOnly, sizing).file!.source).toBe(odd);
  });

  it('in the worker, answers the change with its new file', async () => {
    const reply = await handleWork({
      id: 3,
      kind: 'apply',
      path: 'Notes.md',
      file: { source: PAGE, scene: { version: 1, elements: structuredClone(SCENE) } },
      edit: edit(versionFor(PAGE, SCENE)),
      theme: { '--font-ui': 'Geist', '--leading-tight': '1.25' },
      fonts: {},
    });
    expect(reply.id).toBe(3);
    expect(reply.answer?.report.refused).toEqual([]);
    expect(reply.answer?.file?.source).toContain('First, **rewritten**.');
  });
});

describe('a drawn diagram', () => {
  it('needs no version: it points at nothing already on the page', () => {
    const change: PageEdit = { version: '', canvas: [{ op: 'insert', elements: [{ id: 'n', type: 'rect', x: 0, y: 0, w: 10, h: 10, z: 1 } as SceneElement] }] };
    const answer = applyToFile('Notes.md', { source: PAGE, scene: { version: 1, elements: SCENE } }, change, sizing);
    expect(answer.stale).toBeUndefined();
    expect(answer.file?.scene.elements).toHaveLength(2);
  });

  it('but a change that names blocks or ids still does', () => {
    const change: PageEdit = { version: '', canvas: [{ op: 'remove', id: 'e1' }] };
    expect(applyToFile('Notes.md', { source: PAGE, scene: { version: 1, elements: SCENE } }, change, sizing).stale).toBe(true);
  });
});
