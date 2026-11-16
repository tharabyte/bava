/**
 * Pages the AI changed while they were not on screen, as they were before
 * its first change, kept in memory until Bava quits. Opening such a page
 * starts its undo history there, so ⌘Z takes the AI's changes back.
 */
import type { Scene } from '../../bindings/github.com/tharabyte/bava/internal/format/models';

export type PageState = { source: string; scene: Scene | Record<string, unknown> };

export function createBefore() {
  const pages = new Map<string, PageState>();
  return {
    /** The page before the AI's first change; later changes keep the first. */
    remember(path: string, state: PageState): void {
      if (!pages.has(path)) pages.set(path, structuredClone(state));
    },
    /** The page's state from before, once: opening it starts its history there. */
    take(path: string): PageState | null {
      const state = pages.get(path) ?? null;
      pages.delete(path);
      return state;
    },
    /** A page renamed or moved keeps its state from before. */
    moved(from: string, to: string): void {
      const state = pages.get(from);
      if (!state) return;
      pages.delete(from);
      pages.set(to, state);
    },
  };
}

export type Before = ReturnType<typeof createBefore>;
