import { describe, expect, it } from 'vitest';
import { createBefore } from './before';

describe('pages as they were before the AI changed them', () => {
  it('keeps the first state only, until it is taken', () => {
    const before = createBefore();
    before.remember('Notes.md', { source: 'one', scene: { version: 1, elements: [] } });
    before.remember('Notes.md', { source: 'two', scene: { version: 1, elements: [] } });
    expect(before.take('Notes.md')?.source).toBe('one');
    expect(before.take('Notes.md')).toBeNull();
  });

  it('follows a page renamed or moved', () => {
    const before = createBefore();
    before.remember('Notes.md', { source: 'one', scene: { version: 1, elements: [] } });
    before.moved('Notes.md', 'Archive/Notes.md');
    expect(before.take('Notes.md')).toBeNull();
    expect(before.take('Archive/Notes.md')?.source).toBe('one');
  });
});
