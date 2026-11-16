// Runs where there is no DOM, as the page worker does.
import { describe, expect, it } from 'vitest';
import { parsePage } from '../docs/markdown';
import type { SceneElement } from '../canvas/scene';
import { pageText } from './page-text';
import { handleWork } from './page-work';

const SOURCE = '# Notes\n\nThe queue drains at night.\n';
const ELEMENTS = [{ id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10, z: 1, label: 'Queue' }] as SceneElement[];

describe('the page worker', () => {
  it('reads a closed page as the editor would write it', async () => {
    const reply = await handleWork({ id: 7, kind: 'read', path: 'Notes.md', source: SOURCE, elements: ELEMENTS });
    expect(reply).toEqual({ id: 7, text: pageText({ path: 'Notes.md', doc: parsePage(SOURCE).doc, elements: ELEMENTS }) });
  });

  it('answers a failure with its id, never throwing', async () => {
    const reply = await handleWork({ id: 8, kind: 'read', path: 'Bad.md', source: SOURCE, elements: [null] as unknown as SceneElement[] });
    expect(reply.id).toBe(8);
    expect(reply.error).toBe('Bad.md could not be read.');
  });
});
