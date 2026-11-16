import { describe, expect, it, vi } from 'vitest';
import { parsePage } from '../docs/markdown';
import type { SceneElement } from '../canvas/scene';
import type { IconEntry } from '../canvas/icons/sets';
import { AnswerError } from './answers';
import { pageAnswers, type PageAnswerDeps } from './page-answers';
import { pageText } from './page-text';

const ELEMENTS = [
  { id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10, z: 1, label: 'Writer' },
  { id: 'e2', type: 'rect', x: 20, y: 0, w: 10, h: 10, z: 2, label: 'Queue' },
] as SceneElement[];

const OPEN = { path: 'Notes.md', source: '# Notes\n\nUnsaved.\n', scene: { version: 1, elements: ELEMENTS } };

function deps(over: Partial<PageAnswerDeps> = {}): PageAnswerDeps {
  return {
    root: () => '/work/Space',
    open: () => OPEN,
    openDoc: () => parsePage(OPEN.source).doc,
    elements: () => ELEMENTS,
    selectedIds: () => [],
    selectedText: () => '',
    icons: async () =>
      [
        { set: 'line', name: 'database', title: 'Database', keywords: [] },
        { set: 'logo', name: 'postgresql', title: 'PostgreSQL', keywords: ['database'] },
        { set: 'line', name: 'cloud', title: 'Cloud', keywords: [] },
      ] as IconEntry[],
    readClosed: vi.fn(async () => 'from the worker'),
    claimOpen: vi.fn(async () => false),
    holds: () => true,
    applyOpen: vi.fn(async () => ({ text: 'open', report: { applied: [], refused: [] } })),
    applyClosed: vi.fn(async () => ({ text: 'closed', report: { applied: [], refused: [] } })),
    ...over,
  };
}

describe('pageAnswers', () => {
  it('space: the root and the open page as on screen, or null', async () => {
    expect(await pageAnswers(deps()).space(null)).toEqual({ root: '/work/Space', open: OPEN });
    expect(await pageAnswers(deps({ root: () => null })).space(null)).toBeNull();
  });

  it('pageText: the open page from its editor and scene', async () => {
    const d = deps();
    const answer = await pageAnswers(d).pageText({ path: 'Notes.md', file: null });
    expect(answer).toEqual({ text: pageText({ path: 'Notes.md', doc: d.openDoc()!, elements: ELEMENTS }) });
    expect(d.readClosed).not.toHaveBeenCalled();
  });

  it('pageText: a closed page through the worker, with the file Go read', async () => {
    const d = deps();
    const file = { source: '# Other\n', scene: { version: 1, elements: [ELEMENTS[0]] } };
    expect(await pageAnswers(d).pageText({ path: 'Other.md', file })).toEqual({ text: 'from the worker' });
    expect(d.readClosed).toHaveBeenCalledWith({ kind: 'read', path: 'Other.md', source: '# Other\n', elements: [ELEMENTS[0]] });
  });

  it('pageText: a page closed since Go looked is refused, to be read again', async () => {
    await expect(pageAnswers(deps({ open: () => null })).pageText({ path: 'Notes.md', file: null })).rejects.toBeInstanceOf(AnswerError);
  });

  it('selection: the selected elements, else the selected words', async () => {
    expect(await pageAnswers(deps({ selectedIds: () => ['e2'] })).selection(null)).toEqual({ text: 'e2 rect "Queue" box 20,0 10x10' });
    expect(await pageAnswers(deps({ selectedText: () => 'the queue' })).selection(null)).toEqual({ text: 'the queue' });
    expect(await pageAnswers(deps()).selection(null)).toEqual({ text: '' });
  });

  it('claim: the open page is claimed by the window, saved first', async () => {
    const d = deps({ claimOpen: vi.fn(async () => false) });
    expect(await pageAnswers(d).claim({ path: 'Notes.md', file: null })).toEqual({ locked: false });
    expect(d.claimOpen).toHaveBeenCalledWith('Notes.md');
  });

  it('claim: a closed page says from its file whether it is locked', async () => {
    const d = deps();
    const locked = { source: '---\nbava:\n  locked: true\n---\n# Other\n', scene: { version: 1, elements: [] } };
    expect(await pageAnswers(d).claim({ path: 'Other.md', file: locked })).toEqual({ locked: true });
    const open = { source: '# Other\n', scene: { version: 1, elements: [] } };
    expect(await pageAnswers(d).claim({ path: 'Other.md', file: open })).toEqual({ locked: false });
    expect(d.claimOpen).not.toHaveBeenCalled();
  });

  it('apply: the open page in the window, a closed page in the worker', async () => {
    const d = deps();
    const change = { version: 'v', document: [] };
    expect(await pageAnswers(d).apply({ path: 'Notes.md', edit: change, file: null })).toMatchObject({ text: 'open' });
    const file = { source: '# Other\n', scene: { version: 1, elements: [] } };
    expect(await pageAnswers(d).apply({ path: 'Other.md', edit: change, file })).toMatchObject({ text: 'closed' });
    expect(d.applyClosed).toHaveBeenCalledWith('Other.md', file, change);
    await expect(pageAnswers(deps({ open: () => null })).apply({ path: 'Notes.md', edit: change, file: null })).rejects.toBeInstanceOf(AnswerError);
    // Stopped while the change was on its way: nothing is applied.
    const stopped = deps({ holds: () => false });
    await expect(pageAnswers(stopped).apply({ path: 'Notes.md', edit: change, file: null })).rejects.toBeInstanceOf(AnswerError);
    expect(stopped.applyOpen).not.toHaveBeenCalled();
  });

  it('icons: names as a canvas stores them, best first', async () => {
    expect(await pageAnswers(deps()).icons({ query: 'database' })).toEqual({ names: ['line/database', 'logo/postgresql'] });
  });
});
