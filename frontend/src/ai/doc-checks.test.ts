import { describe, expect, it } from 'vitest';
import { screenDocument, type Checkers } from './doc-checks';
import type { PageEdit } from './page-edits';

const checkers: Checkers = {
  d2: async (source) => (source.includes('{') && !source.includes('}') ? ['line 2: maps must be terminated with }'] : []),
  tex: (tex) => (tex.includes('\\frac{') && !tex.includes('}{') ? 'Expected group' : null),
};

const broken: PageEdit = { version: 'v', document: [{ op: 'insert', markdown: '```d2\na -> b\nc: {\n```' }, { op: 'remove', block: 'b1' }] };

describe('D2 and equations checked before they go in', () => {
  it('goes back twice with its errors, then goes in as written, named', async () => {
    const tries = new Map<string, number>();
    for (let i = 0; i < 2; i++) {
      const { edit, refused } = await screenDocument(broken, 'P.md', checkers, tries);
      expect(refused).toEqual(['insert at the start: does not compile, fix and send again: D2: line 2: maps must be terminated with }']);
      expect(edit.document).toEqual([{ op: 'remove', block: 'b1' }]);
    }
    const third = await screenDocument(broken, 'P.md', checkers, tries);
    expect(third.refused).toEqual([]);
    expect(third.edit.document).toHaveLength(2);
    expect(third.notes[0]).toMatch(/went in as written, with its errors: D2: line 2/);
  });

  it('a clean change starts the count again', async () => {
    const tries = new Map<string, number>();
    await screenDocument(broken, 'P.md', checkers, tries);
    await screenDocument({ version: 'v', document: [{ op: 'insert', markdown: '```d2\na -> b\n```' }] }, 'P.md', checkers, tries);
    expect(tries.has('P.md')).toBe(false);
  });

  it('checks equations the same way', async () => {
    const { refused } = await screenDocument({ version: 'v', document: [{ op: 'insert', markdown: '$$\n\\frac{1\n$$' }] }, 'P.md', checkers, new Map());
    expect(refused[0]).toMatch(/equation: Expected group/);
  });
});
