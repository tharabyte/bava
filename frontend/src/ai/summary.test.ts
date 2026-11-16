import { describe, expect, it } from 'vitest';
import { createSummary } from './summary.svelte';

describe('the round summary', () => {
  it('gathers a round and shows it when the last claim ends', () => {
    const summary = createSummary();
    summary.claims(['Notes.md']);
    summary.created('Overview');
    summary.record('Notes.md', { applied: ['replaced b2', 'added e3'], refused: ['b9: no such block'] });
    summary.record('Overview.md', { applied: ['inserted a block at the start'], refused: [] });
    summary.record('Notes.md', { applied: ['removed e1'], refused: ['e2: it is locked; ask the user to unlock it'] });
    expect(summary.shown).toBeNull();
    summary.claims(['Notes.md', 'Overview.md']);
    summary.claims([]);
    expect(summary.shown).toEqual({
      created: [{ name: 'Overview', what: 'new page' }],
      changed: [
        { name: 'Notes', what: '3 changes' },
        { name: 'Overview', what: '1 change' },
      ],
      skipped: [
        { name: 'Notes', what: 'b9: no such block' },
        { name: 'Notes', what: 'e2: it is locked; ask the user to unlock it' },
      ],
    });
  });

  it('shows nothing for a round that changed nothing, and starts afresh', () => {
    const summary = createSummary();
    summary.claims(['Notes.md']);
    summary.claims([]);
    expect(summary.shown).toBeNull();
    summary.claims(['A.md']);
    summary.record('A.md', { applied: ['removed e1'], refused: [] });
    summary.claims([]);
    expect(summary.shown?.changed).toEqual([{ name: 'A', what: '1 change' }]);
    summary.claims(['B.md']);
    expect(summary.shown).not.toBeNull();
    summary.clear();
    expect(summary.shown).toBeNull();
  });
});
