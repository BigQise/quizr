import { expect, test } from '@playwright/test';

test.describe('home screen', () => {
  test('opens the database and shows an empty library', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    await page.goto('/');

    await expect(page.getByTestId('home-screen')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Quizr' })).toBeVisible();
    // This text only appears after SQLite has opened, migrated, and been queried.
    await expect(page.getByTestId('set-count')).toHaveText('No study sets yet.');
    expect(pageErrors).toEqual([]);
  });

  test('still works after a reload, when the database already exists', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('set-count')).toHaveText('No study sets yet.');

    await page.reload();
    await expect(page.getByTestId('set-count')).toHaveText('No study sets yet.');
  });

  test('does not scroll sideways', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-screen')).toBeVisible();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
  });
});
