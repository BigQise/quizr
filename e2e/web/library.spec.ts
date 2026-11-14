import { expect, test } from '@playwright/test';

import { ANIMALS, createSet, gotoWhenSaved, reloadWhenSaved, shown } from './helpers';

test('starts with an empty library and no page errors', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/');
  await expect(shown(page, 'home-screen')).toBeVisible();
  // This only appears after SQLite has opened, migrated, and been queried.
  await expect(shown(page, 'library-empty')).toContainText('No study sets yet.');
  expect(pageErrors).toEqual([]);
});

test('creates a set, imports cards, and keeps them after a reload', async ({ page }) => {
  await createSet(page, 'Animals', ANIMALS);
  await expect(page.getByTestId('card-row')).toHaveCount(ANIMALS.length);
  await expect(page.getByTestId('card-row').first()).toContainText('el perro');

  await reloadWhenSaved(page);
  await expect(shown(page, 'card-count')).toHaveText('8 cards');

  await gotoWhenSaved(page, '/');
  await expect(page.getByTestId('set-tile-Animals')).toContainText('8 cards');
});

test('a set needs a title', async ({ page }) => {
  await page.goto('/sets/new');
  await page.getByTestId('create-set').click();
  await expect(page.getByText('Give the set a title.')).toBeVisible();
});

test('adds, edits, stars, reorders, and deletes cards', async ({ page }) => {
  await createSet(page, 'Small', [
    ['uno', 'one'],
    ['dos', 'two'],
  ]);

  // Add two cards in a row.
  await page.getByTestId('add-card').click();
  await page.getByTestId('card-term-input').fill('tres');
  await page.getByTestId('card-definition-input').fill('three');
  await page.getByTestId('save-card-add').click();
  await expect(page.getByTestId('cards-added')).toHaveText('1 card added.');
  await page.getByTestId('card-term-input').fill('cuatro');
  await page.getByTestId('card-definition-input').fill('four');
  await page.getByTestId('save-card').click();
  await expect(shown(page, 'card-count')).toHaveText('4 cards');

  // A card needs both sides.
  await page.getByTestId('add-card').click();
  await page.getByTestId('card-term-input').fill('cinco');
  await page.getByTestId('save-card').click();
  await expect(page.getByText('A card needs both a term and a definition.')).toBeVisible();
  await shown(page, 'back-button').click();

  // Edit the first card.
  await page.getByRole('button', { name: 'Edit card: uno' }).click();
  await page.getByTestId('card-definition-input').fill('one (1)');
  await page.getByTestId('save-card').click();
  await expect(page.getByTestId('card-row').first()).toContainText('one (1)');

  // Star it, and move it down.
  await page.getByRole('button', { name: 'Star uno' }).click();
  await expect(page.getByRole('button', { name: 'Unstar uno' })).toBeVisible();
  await page.getByRole('button', { name: 'Move uno down' }).click();
  await expect(page.getByTestId('card-row').first()).toContainText('dos');
  await expect(page.getByTestId('card-row').nth(1)).toContainText('uno');

  // Delete a card.
  await page.getByRole('button', { name: 'Edit card: dos' }).click();
  await page.getByTestId('delete-card').click();
  await page.getByTestId('confirm-accept').click();
  await expect(shown(page, 'card-count')).toHaveText('3 cards');
});

test('the import preview reports lines it cannot read', async ({ page }) => {
  await createSet(page, 'Import', []);
  await page.getByTestId('import-cards').click();
  await page.getByTestId('import-text').fill('a, b\nno separator\nc, d');

  await expect(page.getByTestId('import-count')).toHaveText('2 cards ready');
  await expect(page.getByTestId('import-skipped')).toContainText('1 line');
  await page.getByTestId('import-submit').click();
  await expect(shown(page, 'card-count')).toHaveText('2 cards');
});

test('Learn and Test are unavailable below four cards', async ({ page }) => {
  await createSet(page, 'Tiny', [
    ['uno', 'one'],
    ['dos', 'two'],
  ]);
  await expect(page.getByTestId('study-learn')).toBeDisabled();
  await expect(page.getByTestId('study-test')).toBeDisabled();
  await expect(page.getByTestId('study-flashcards')).toBeEnabled();
  await expect(page.getByTestId('study-hint')).toContainText('at least 4 cards');
});

test('renames and deletes a set', async ({ page }) => {
  await createSet(page, 'Old name', ANIMALS.slice(0, 4));

  await page.getByTestId('rename-set').click();
  await page.getByTestId('rename-title-input').fill('New name');
  await page.getByTestId('rename-save').click();
  await expect(page.getByRole('heading', { name: 'New name' })).toBeVisible();

  await page.getByTestId('delete-set').click();
  await page.getByTestId('confirm-accept').click();
  await expect(shown(page, 'library-empty')).toBeVisible();
});

test('does not scroll sideways on the library or a set', async ({ page }) => {
  await createSet(page, 'Animals with a rather long title to wrap', ANIMALS);
  const overflows = () =>
    page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(await overflows()).toBe(false);

  await gotoWhenSaved(page, '/');
  await expect(shown(page, 'home-screen')).toBeVisible();
  expect(await overflows()).toBe(false);
});
