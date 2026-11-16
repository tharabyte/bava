// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parsePage } from '../docs/markdown';
import { openEditor } from '../docs/test-editor';
import type { SceneElement } from '../canvas/scene';
import { blockCount, numberedBlocks, pageText, versionOf } from './page-text';

const PAGE = `# Ingest pipeline

Events arrive over **HTTP** and are written to the queue.

> [!warning]
> The queue drops events older than a day.

| Field | Type |
| --- | --- |
| id | uuid |
| at | time |

![Diagram](.bava/attachments/ingest.png)
`;

const box = { z: 1, x: 0, y: 0, w: 0, h: 0 };
const SCENE = [
  { ...box, id: 'f1', type: 'frame', label: 'Ingest', x: 0, y: 0, w: 600, h: 400, z: 0 },
  { ...box, id: 'e1', type: 'rect', label: 'Writer', x: 40.4, y: 24, w: 160, h: 90, frame: 'f1', fill: 'blue' },
  { ...box, id: 'e2', type: 'cylinder', label: 'Queue', x: 320, y: 24, w: 120, h: 90, frame: 'f1', locked: true },
  { ...box, id: 'e3', type: 'arrow', x: 200, y: 69, w: 120, h: 0, points: [0, 0, 120, 0], startBinding: 'e1', endBinding: 'e2', label: 'writes' },
  { ...box, id: 'e4', type: 'icon', icon: 'aws/rds', label: 'Orders', x: 40, y: 200, w: 64, h: 64 },
  { ...box, id: 'e5', type: 'stroke', stroke: 'red', x: 300, y: 10, w: 180, h: 60, points: [0, 0, 180, 60] },
  { ...box, id: 'e6', type: 'table', name: 'events', rows: 'id uuid\nat time', x: 480, y: 200, w: 160, h: 80 },
  { ...box, id: 'e7', type: 'arrow', x: 640, y: 240, w: 60, h: 0, points: [0, 0, 60, 0], startBinding: 'e6', startRow: 'id' },
  { ...box, id: 'g1', type: 'group', children: ['e1', 'e2'] },
  { ...box, id: 'e8', type: 'text', text: 'Night\nbatch', x: 40, y: 300, w: 80, h: 40, measuredWidth: 50, measuredHeight: 40 },
  { ...box, id: 'e9', type: 'image', file: 'logo.png', x: 700, y: 0, w: 100, h: 100 },
  { ...box, id: 'e10', type: 'code', code: 'select 1;', language: 'sql', x: 700, y: 200, w: 100, h: 40, measuredWidth: 1, measuredHeight: 1 },
] as SceneElement[];

describe('pageText', () => {
  it('writes the document by numbered block and the canvas by element', () => {
    const { doc } = parsePage(PAGE);
    const text = pageText({ path: 'Designs/Ingest.md', doc, elements: SCENE });
    const version = versionOf({ doc, elements: SCENE });
    expect(text).toBe(`Page: Designs/Ingest.md
Version: ${version}

Document (blocks numbered b1, b2, ...; the numbers hold until the page changes):
[b1]
# Ingest pipeline

[b2]
Events arrive over **HTTP** and are written to the queue.

[b3]
> [!warning]
> The queue drops events older than a day.

[b4]
| Field | Type |
|-------|------|
| id    | uuid |
| at    | time |

[b5]
![Diagram](.bava/attachments/ingest.png)

Canvas (one element a line, by id):
f1 frame "Ingest" box 0,0 600x400 holds e1, e2
e1 rect "Writer" box 40,24 160x90 fill=blue in f1
e2 cylinder "Queue" box 320,24 120x90 in f1 locked
e3 arrow e1 -> e2 "writes"
e4 icon aws/rds "Orders" box 40,200 64x64
e5 stroke red box 300,10 180x60 over e2
e6 table "events" rows ["id uuid","at time"] box 480,200 160x80
e7 arrow e6 (row "id") -> 700,240
g1 group of e1, e2
e8 text "Night\\nbatch" box 40,300 80x40
e9 picture box 700,0 100x100
e10 code sql "select 1;" box 700,200 100x40
`);
  });

  it('says when the document or the canvas is empty', () => {
    const { doc } = parsePage('');
    const text = pageText({ path: 'Empty.md', doc, elements: [] });
    expect(text).toContain('Document: empty\n');
    expect(text).toContain('Canvas: empty\n');
  });

  it('gives the same text from the editor as from reading the file', () => {
    const { editor } = openEditor(PAGE);
    const fromEditor = pageText({ path: 'Ingest.md', doc: editor.view!.state.doc, elements: SCENE });
    const fromFile = pageText({ path: 'Ingest.md', doc: parsePage(PAGE).doc, elements: SCENE });
    expect(fromEditor).toBe(fromFile);
  });

  it('numbers the top-level blocks that write something', () => {
    const { doc } = parsePage(PAGE);
    expect(blockCount(doc)).toBe(5);
    expect(numberedBlocks(doc)).toEqual([0, 1, 2, 3, 4]);
    const { editor } = openEditor(PAGE);
    const onScreen = editor.view!.state.doc;
    expect(onScreen.childCount).toBeGreaterThan(5);
    expect(numberedBlocks(onScreen)).toEqual([0, 1, 2, 3, 4]);
  });

  it('moves the version on any change, and keeps it otherwise', () => {
    const { doc } = parsePage(PAGE);
    const a = versionOf({ doc, elements: SCENE });
    expect(versionOf({ doc: parsePage(PAGE).doc, elements: SCENE })).toBe(a);
    expect(versionOf({ doc: parsePage(PAGE + '\nMore.\n').doc, elements: SCENE })).not.toBe(a);
    const moved = SCENE.map((e) => (e.id === 'e1' ? { ...e, x: 41 } : e));
    expect(versionOf({ doc, elements: moved })).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });
});
