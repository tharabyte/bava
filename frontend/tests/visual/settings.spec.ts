import { expect, test } from '@playwright/test';
import { THEMES, emit, menu, openApp, openDialog, restPointer, savedSettings, shot, shotDialog } from '../helpers';

for (const theme of THEMES) {
  test.describe(`Settings, ${theme}`, () => {
    for (const section of ['Appearance', 'Files', 'Canvas', 'AI', 'Advanced']) {
      test(section, async ({ page }) => {
        await openApp(page, theme);
        await menu(page, 'app.settings');
        await expect(openDialog(page)).toBeVisible();
        await page.getByRole('tab', { name: section }).click();
        await restPointer(page);
        await expect(page.getByRole('tab', { name: section })).toHaveAttribute('aria-selected', 'true');
        await shotDialog(page, shot('settings', 'tab', section.toLowerCase(), theme));
      });
    }
  });
}

for (const theme of THEMES) {
  test(`Settings, AI, an agent connected, ${theme}`, async ({ page }) => {
    await openApp(page, theme);
    await menu(page, 'app.settings');
    await page.getByRole('tab', { name: 'AI' }).click();
    const dialog = openDialog(page);
    await dialog.getByText('Allow agents', { exact: true }).click();
    await expect(dialog.locator('[data-agent-address]')).toHaveText('http://127.0.0.1:7341/bava');
    await expect(dialog.locator('[data-agent-code]')).toHaveText('K7Q2-9XFM-T4WD-3HNP');
    expect(await savedSettings(page)).toMatchObject({ allowAgents: true, allowAIEdits: false });
    await emit(page, 'agent:status', { on: true, address: 'http://127.0.0.1:7341/bava', code: 'K7Q2-9XFM-T4WD-3HNP', codeKept: true, connected: 1, editing: false, problem: '' });
    await expect(dialog.getByText('1 connected')).toBeVisible();
    await restPointer(page);
    await shotDialog(page, shot('settings', 'ai', 'connected', theme));
  });
}
