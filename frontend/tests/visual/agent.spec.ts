import { expect, test } from '@playwright/test';
import { THEMES, emit, menu, openApp, openPage, openSpace, restPointer, shot, shotPane } from '../helpers';

const CONNECTED = { on: true, address: 'http://127.0.0.1:7341/bava', code: 'K7Q2-9XFM-T4WD-3HNP', codeKept: true, connected: 1, editing: false, problem: '' };

const steps = [
  { id: 'call-1', tool: 'list_pages', state: 'done', subject: '' },
  { id: 'call-2', tool: 'read_page', state: 'done', subject: 'Payments' },
  { id: 'call-3', tool: 'read_page', state: 'done', subject: 'Orders' },
  { id: 'call-4', tool: 'read_page', state: 'done', subject: 'Ledger' },
  { id: 'call-5', tool: 'search', state: 'failed', subject: 'billing' },
  { id: 'call-6', tool: 'send_email', state: 'unavailable', subject: '' },
  { id: 'call-7', tool: 'find_icon', state: 'running', subject: 'database' },
];

for (const theme of THEMES) {
  test.describe(`The agent view, ${theme}`, () => {
    test('agents off', async ({ page }) => {
      await openApp(page, theme);
      await openSpace(page);
      await menu(page, 'view.ai');
      const pane = page.locator('[data-agent-pane]');
      await expect(pane.getByText('Agents are not allowed.', { exact: false })).toBeVisible();
      await restPointer(page);
      await shotPane(pane, shot('ai', 'agent', 'off', theme));
    });

    test('connected, with steps', async ({ page }) => {
      await openApp(page, theme);
      await openSpace(page);
      await menu(page, 'view.ai');
      await emit(page, 'agent:status', CONNECTED);
      for (const step of steps) await emit(page, 'agent:step', step);
      const pane = page.locator('[data-agent-pane]');
      await expect(pane.getByText('Connected')).toBeVisible();
      // Three reads in a row fold into one line.
      await expect(pane.getByRole('button', { name: 'Read 3 pages' })).toBeVisible();
      await expect(pane.locator('[data-tool="send_email"]')).toContainText("send_email isn't available in Bava");
      // The spinner is stopped for the picture: a running step is a still frame.
      await page.addStyleTag({ content: '[data-agent-pane] .spin { animation: none !important; }' });
      await restPointer(page);
      await shotPane(pane, shot('ai', 'agent', 'connected', theme));
      await pane.getByRole('button', { name: 'Read 3 pages' }).click();
      await expect(pane.getByText('Ledger')).toBeVisible();
      await restPointer(page);
      await shotPane(pane, shot('ai', 'agent', 'run-open', theme));
    });

    test('Open AI settings lands on AI', async ({ page }) => {
      await openApp(page, theme);
      await openSpace(page);
      await menu(page, 'view.ai');
      await page.locator('[data-agent-pane]').getByRole('button', { name: 'Open AI settings' }).first().click();
      await expect(page.getByRole('tab', { name: 'AI' })).toHaveAttribute('aria-selected', 'true');
    });
  });
}

type AskHarness = { __bava: { fakes: { harness: { agentAsk(kind: string, args: unknown): Promise<unknown>; agentClaims(pages: string[]): void } } } };

for (const theme of THEMES) {
  test.describe(`A page the agent holds, ${theme}`, () => {
    for (const side of ['document', 'canvas'] as const) {
      test(`the bar over the ${side}`, async ({ page }) => {
        await openApp(page, theme);
        await openSpace(page);
        await openPage(page, 'Roadmap.md');
        await menu(page, side === 'document' ? 'view.document' : 'view.canvas');
        await page.evaluate(() => (window as unknown as AskHarness).__bava.fakes.harness.agentAsk('claim', { path: 'Roadmap.md', file: null }));
        await page.evaluate(() => (window as unknown as AskHarness).__bava.fakes.harness.agentClaims(['Roadmap.md']));
        const bar = page.locator('[data-claim-bar]').filter({ visible: true });
        await expect(bar).toBeVisible();
        await restPointer(page);
        await shotPane(page.locator(`[data-side="${side}"]`), shot('ai', 'claimed', side, theme));
      });
    }

    test('the pane lists the page, and the summary when released', async ({ page }) => {
      await openApp(page, theme);
      await openSpace(page);
      await openPage(page, 'Roadmap.md');
      await menu(page, 'view.ai');
      await emit(page, 'agent:status', CONNECTED);
      const harness = (kind: string, args: unknown) =>
        page.evaluate(([k, a]) => (window as unknown as AskHarness).__bava.fakes.harness.agentAsk(k as string, a), [kind, args] as const);
      await harness('claim', { path: 'Roadmap.md', file: null });
      await page.evaluate(() => (window as unknown as AskHarness).__bava.fakes.harness.agentClaims(['Roadmap.md']));
      await emit(page, 'agent:step', { id: 'c1', tool: 'claim_page', state: 'done', subject: 'Roadmap' });
      const pane = page.locator('[data-agent-pane]');
      await expect(pane.locator('[data-agent-editing]')).toContainText('Roadmap');
      await restPointer(page);
      await shotPane(pane, shot('ai', 'agent', 'editing', theme));

      const read = (await harness('pageText', { path: 'Roadmap.md', file: null })) as { result: { text: string } };
      const version = /^Version: ([0-9a-f]{8})$/m.exec(read.result.text)?.[1];
      await harness('apply', {
        path: 'Roadmap.md',
        file: null,
        edit: { version, document: [{ op: 'remove', block: 'b99' }, { op: 'insert', after: 'b1', markdown: 'Added by the agent.' }] },
      });
      await emit(page, 'agent:step', { id: 'c2', tool: 'change_document', state: 'done', subject: 'Roadmap' });
      await emit(page, 'agent:step', { id: 'c3', tool: 'release_page', state: 'done', subject: 'Roadmap' });
      await page.evaluate(() => (window as unknown as AskHarness).__bava.fakes.harness.agentClaims([]));
      await expect(pane.locator('[data-agent-summary]')).toContainText('b99: no such block');
      await restPointer(page);
      await shotPane(pane, shot('ai', 'agent', 'summary', theme));
    });
  });
}
