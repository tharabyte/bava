/**
 * The pages the AI holds, as Go says in `agent:claims`: each is read-only
 * for the user until the AI releases it or the user presses Stop. A page
 * being claimed is held at once, before Go's list arrives, so nothing typed
 * in between is lost.
 */

/** The quiet time that counts as a pause in typing, and the longest wait for one. */
export const TYPING_PAUSE = { quietMs: 600, maxMs: 5000 };

/** Resolves once nothing has been typed for `quietMs`, or after `maxMs` at most. */
export function waitForPause(lastEdit: () => number, { quietMs, maxMs }: { quietMs: number; maxMs: number }): Promise<void> {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const now = Date.now();
      const quiet = now - lastEdit();
      if (quiet >= quietMs || now - start >= maxMs) {
        resolve();
        return;
      }
      setTimeout(check, Math.min(quietMs - quiet, maxMs - (now - start)));
    };
    check();
  });
}

export function createClaims() {
  let held = $state.raw<string[]>([]);

  return {
    /** The pages held now, sorted. */
    get pages(): string[] {
      return held;
    },
    holds(page: string | null): boolean {
      return page !== null && held.includes(page);
    },
    /** Go's list: the pages held now. */
    set(pages: string[]): void {
      held = [...pages].sort();
    },
    /** A page being claimed, held before Go's list arrives. */
    holdNow(page: string): void {
      if (!held.includes(page)) held = [...held, page].sort();
    },
  };
}

export type Claims = ReturnType<typeof createClaims>;
