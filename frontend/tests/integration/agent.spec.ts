import { expect, test, type Page } from '@playwright/test';
import { editor, emit, menu, openApp, openPage, openSpace } from '../helpers';

// The user's own agent, played by the stand-in for Go: it asks the page what
// Go's plug asks (`agent:ask`) and tells it the claims (`agent:claims`).

type AgentHarness = {
  __bava: {
    fakes: {
      harness: {
        agentAsk(kind: string, args: unknown): Promise<{ result: unknown; failure: string }>;
        agentClaims(pages: string[]): void;
        stopped: string[];
      };
    };
  };
};

const ask = (page: Page, kind: string, args: unknown) =>
  page.evaluate(([k, a]) => (window as unknown as AgentHarness).__bava.fakes.harness.agentAsk(k as string, a), [kind, args] as const);

const claims = (page: Page, pages: string[]) => page.evaluate((p) => (window as unknown as AgentHarness).__bava.fakes.harness.agentClaims(p), pages);

const versionIn = (text: string) => /^Version: ([0-9a-f]{8})$/m.exec(text)?.[1] ?? '';

test.describe('the agent changes the open page', () => {
  test('claim, change, release, then ⌘Z takes it back', async ({ page }) => {
    await openApp(page, 'light');
    await openSpace(page);
    await openPage(page, 'Roadmap.md');
    await menu(page, 'view.ai');
    await emit(page, 'agent:status', { on: true, address: 'http://127.0.0.1:7341/bava', code: 'K7Q2-9XFM-T4WD-3HNP', codeKept: true, connected: 1, editing: true, problem: '' });

    // Claiming waits for a pause in typing, then the page is read-only.
    const claimed = await ask(page, 'claim', { path: 'Roadmap.md', file: null });
    expect(claimed).toEqual({ result: { locked: false }, failure: '' });
    await claims(page, ['Roadmap.md']);
    await expect(page.locator('[data-claim-bar]')).toBeVisible();
    await expect(page.locator('[data-agent-editing]')).toContainText('Roadmap');
    await expect(page.locator('.space-tree [data-path="Roadmap.md"] .claim-mark')).toBeVisible();
    await expect(editor(page).locator('[contenteditable="true"]')).toHaveCount(0);

    // The agent reads the page as on screen, then changes it against that version.
    const read = await ask(page, 'pageText', { path: 'Roadmap.md', file: null });
    const text = (read.result as { text: string }).text;
    expect(text).toContain('[b1]');
    const applied = await ask(page, 'apply', {
      path: 'Roadmap.md',
      file: null,
      edit: {
        version: versionIn(text),
        document: [{ op: 'insert', after: 'b1', markdown: 'Added by the agent.' }],
        canvas: [{ op: 'add', element: { id: 'agent-box', type: 'rect', x: 0, y: 0, w: 120, h: 60, label: 'From the agent' } }],
      },
    });
    const report = (applied.result as { report: { applied: string[]; refused: string[] } }).report;
    expect(report.refused).toEqual([]);
    expect(report.applied).toEqual(['inserted a block after b1', 'added agent-box']);
    await expect(editor(page)).toContainText('Added by the agent.');

    // A stale version changes nothing.
    const stale = await ask(page, 'apply', { path: 'Roadmap.md', file: null, edit: { version: '00000000', document: [{ op: 'remove', block: 'b1' }] } });
    expect((stale.result as { stale: boolean }).stale).toBe(true);

    // Released, the round's summary shows, and the page is the user's again.
    await claims(page, []);
    await expect(page.locator('[data-claim-bar]')).toHaveCount(0);
    await expect(page.locator('[data-agent-summary]')).toContainText('Roadmap');
    await expect(page.locator('[data-agent-summary]')).toContainText('2 changes');

    // ⌘Z on the page takes the agent's words back.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor(page)).not.toContainText('Added by the agent.');
  });

  test('Stop on the bar ends the claim', async ({ page }) => {
    await openApp(page, 'light');
    await openSpace(page);
    await openPage(page, 'Roadmap.md');
    await ask(page, 'claim', { path: 'Roadmap.md', file: null });
    await claims(page, ['Roadmap.md']);
    await page.locator('[data-claim-bar]').getByRole('button', { name: 'Stop' }).click();
    await expect(page.locator('[data-claim-bar]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as AgentHarness).__bava.fakes.harness.stopped)).toEqual(['Roadmap.md']);
  });
});

test.describe('the agent changes a page not on screen', () => {
  test('the worker changes its file and sizes its text', async ({ page }) => {
    await openApp(page, 'light');
    await openSpace(page);
    const source = '# Handbook\n\nHow we work.\n';
    const read = await ask(page, 'pageText', { path: 'Team handbook.md', file: { source, scene: { version: 1, elements: [] } } });
    const text = (read.result as { text: string }).text;
    expect(text).toContain('[b2]\nHow we work.');
    await claims(page, ['Team handbook.md']);
    const applied = await ask(page, 'apply', {
      path: 'Team handbook.md',
      file: { source, scene: { version: 1, elements: [] } },
      edit: {
        version: versionIn(text),
        document: [{ op: 'replace', block: 'b2', markdown: 'How we work, rewritten.' }],
        canvas: [{ op: 'add', element: { id: 'note', type: 'text', text: 'Sized in the worker', x: 0, y: 0 } }],
      },
    });
    const answer = applied.result as { file: { source: string; scene: { elements: { id: string; measuredWidth: number }[] } } };
    expect(answer.file.source).toBe('# Handbook\n\nHow we work, rewritten.\n');
    expect(answer.file.scene.elements[0].measuredWidth).toBeGreaterThan(0);
  });
});
