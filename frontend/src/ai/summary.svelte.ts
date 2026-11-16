/**
 * The record of a round of the agent's changes, shown in the AI pane when
 * its last claim ends: pages created, pages changed, and changes refused
 * with why. Everything in it is already done; taking something back is ⌘Z
 * on the page. Why a change was refused is shown as Bava told the agent, in
 * English, as the step lines are.
 */
import { t } from '../i18n/t';
import type { Report } from './page-edits';

export type SummaryRow = { name: string; what: string };
export type Summary = { created: SummaryRow[]; changed: SummaryRow[]; skipped: SummaryRow[] };

const nameOf = (path: string) => path.replace(/^.*\//, '').replace(/\.md$/i, '');

export function createSummary() {
  let shown = $state.raw<Summary | null>(null);
  let held = false;
  let created: string[] = [];
  let changes: Record<string, number> = {};
  let skipped: SummaryRow[] = [];

  const reset = () => {
    created = [];
    changes = {};
    skipped = [];
  };

  return {
    /** The last round's record, until the next one ends or it is cleared. */
    get shown(): Summary | null {
      return shown;
    },
    /** The pages held now: the round ends when the last claim does. */
    claims(pages: string[]): void {
      if (pages.length > 0) {
        held = true;
        return;
      }
      if (!held) return;
      held = false;
      if (created.length > 0 || Object.keys(changes).length > 0 || skipped.length > 0) {
        shown = {
          created: created.map((name) => ({ name, what: t('agent.summary.newPage') })),
          changed: Object.entries(changes).map(([path, n]) => ({
            name: nameOf(path),
            what: n === 1 ? t('agent.summary.oneChange') : t('agent.summary.changes').replace('{count}', String(n)),
          })),
          skipped,
        };
      }
      reset();
    },
    created(name: string): void {
      created.push(name);
    },
    record(path: string, report: Report): void {
      if (report.applied.length > 0) changes[path] = (changes[path] ?? 0) + report.applied.length;
      for (const why of report.refused) skipped.push({ name: nameOf(path), what: why });
    },
    clear(): void {
      shown = null;
    },
  };
}

export type RoundSummary = ReturnType<typeof createSummary>;
