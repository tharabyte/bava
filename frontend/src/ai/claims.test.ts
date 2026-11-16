import { describe, expect, it, vi } from 'vitest';
import { createClaims, waitForPause } from './claims.svelte';

describe('claims in the window', () => {
  it('holds the pages Go says, and only those', () => {
    const claims = createClaims();
    claims.set(['Notes.md', 'Designs/Ingest.md']);
    expect(claims.holds('Notes.md')).toBe(true);
    expect(claims.holds('Other.md')).toBe(false);
    claims.set([]);
    expect(claims.holds('Notes.md')).toBe(false);
  });

  it('holds a page at once while Go is asked, until Go’s list says otherwise', () => {
    const claims = createClaims();
    claims.holdNow('Notes.md');
    expect(claims.holds('Notes.md')).toBe(true);
    claims.set([]);
    expect(claims.holds('Notes.md')).toBe(false);
  });

  it('lists the pages held, in order', () => {
    const claims = createClaims();
    claims.set(['B.md', 'A.md']);
    expect(claims.pages).toEqual(['A.md', 'B.md']);
  });
});

describe('waitForPause', () => {
  it('waits until the user has not typed for the quiet time', async () => {
    vi.useFakeTimers();
    let lastEdit = 0;
    const now = () => Date.now();
    lastEdit = now();
    let done = false;
    const waiting = waitForPause(() => lastEdit, { quietMs: 500, maxMs: 5000 }).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(300);
    lastEdit = now(); // still typing
    await vi.advanceTimersByTimeAsync(400);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    await waiting;
    expect(done).toBe(true);
    vi.useRealTimers();
  });

  it('gives up waiting after the longest wait', async () => {
    vi.useFakeTimers();
    let done = false;
    const waiting = waitForPause(() => Date.now(), { quietMs: 500, maxMs: 2000 }).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(2100);
    await waiting;
    expect(done).toBe(true);
    vi.useRealTimers();
  });

  it('returns at once when nothing was typed lately', async () => {
    let done = false;
    await waitForPause(() => 0, { quietMs: 500, maxMs: 2000 }).then(() => (done = true));
    expect(done).toBe(true);
  });
});
