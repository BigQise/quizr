import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { ANIMALS, createSet, gotoWhenSaved, shown } from './helpers';

test('exports a backup and restores it after the data is deleted', async ({ page }) => {
  await createSet(page, 'Animals', ANIMALS);
  await page.getByRole('button', { name: 'Star el perro' }).click();

  await gotoWhenSaved(page, '/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-backup').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^quizr-backup-\d{4}-\d\d-\d\d\.json$/);
  const backup = await readFile(await download.path(), 'utf8');
  expect(JSON.parse(backup).tables.cards).toHaveLength(8);

  // Delete the set.
  await gotoWhenSaved(page, '/');
  await page.getByTestId('set-tile-Animals').click();
  await page.getByTestId('delete-set').click();
  await page.getByTestId('confirm-accept').click();
  await expect(shown(page, 'library-empty')).toBeVisible();

  // Restore it.
  await gotoWhenSaved(page, '/settings');
  await page.getByTestId('restore-text').fill(backup);
  await page.getByTestId('restore-backup').click();
  await page.getByTestId('confirm-accept').click();
  await expect(page.getByTestId('settings-notice')).toHaveText('Backup restored.');

  await gotoWhenSaved(page, '/');
  await page.getByTestId('set-tile-Animals').click();
  await expect(shown(page, 'card-count')).toHaveText('8 cards');
  await expect(page.getByRole('button', { name: 'Unstar el perro' })).toBeVisible();
});

test('refuses text that is not a backup and keeps the data', async ({ page }) => {
  await createSet(page, 'Animals', ANIMALS.slice(0, 4));

  await gotoWhenSaved(page, '/settings');
  await page.getByTestId('restore-text').fill('{"hello": "world"}');
  await page.getByTestId('restore-backup').click();
  await page.getByTestId('confirm-accept').click();
  await expect(page.getByTestId('settings-notice')).toHaveText('This is not a Quizr backup file.');

  await page.getByTestId('restore-text').fill('not json at all');
  await page.getByTestId('restore-backup').click();
  await page.getByTestId('confirm-accept').click();
  await expect(page.getByTestId('settings-notice')).toContainText('not valid JSON');

  await gotoWhenSaved(page, '/');
  await expect(page.getByTestId('set-tile-Animals')).toBeVisible();
});

test('the daily new-card limit applies to spaced repetition', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('new-cards-per-day').fill('2');
  await page.getByTestId('save-new-cards').click();
  await expect(page.getByTestId('settings-notice')).toHaveText('Saved.');

  await createSet(page, 'Animals', ANIMALS.slice(0, 4));
  await page.getByTestId('study-flashcards').click();
  await page.getByTestId('flashcards-options').click();
  await page.getByTestId('method-srs').click();
  await page.getByTestId('options-done').click();

  await expect(page.getByTestId('srs-counts')).toContainText('New 2');
  for (let i = 0; i < 2; i++) {
    await page.getByTestId('srs-show').click();
    await page.getByTestId('srs-rate-easy').click();
  }
  // Two of four introduced; the other two wait for tomorrow.
  await expect(page.getByTestId('srs-done')).toContainText('2 new cards are waiting for tomorrow');
});
