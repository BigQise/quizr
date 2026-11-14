import { expect, test, type Page } from '@playwright/test';

import { ANIMALS, createSet, definitionOf, shown } from './helpers';

async function openTest(page: Page) {
  await createSet(page, 'Animals', ANIMALS);
  await page.getByTestId('study-test').click();
  await expect(page.getByTestId('test-setup')).toBeVisible();
}

/** Answers every question on the test correctly. Returns how many items there were. */
async function answerEverything(page: Page): Promise<number> {
  const items = await page.locator('[data-testid^="test-item-"]').count();

  for (let i = 0; i < items; i++) {
    const item = page.getByTestId(`test-item-${i}`);

    if (await page.getByTestId(`test-true-${i}`).isVisible()) {
      const prompt = (await page.getByTestId(`test-prompt-${i}`).innerText()).trim();
      const shown = (await page.getByTestId(`test-shown-${i}`).innerText()).trim();
      const isTrue = shown === definitionOf(ANIMALS, prompt);
      await page.getByTestId(isTrue ? `test-true-${i}` : `test-false-${i}`).click();
    } else if (await page.getByTestId(`test-written-${i}`).isVisible()) {
      const prompt = (await page.getByTestId(`test-prompt-${i}`).innerText()).trim();
      await page.getByTestId(`test-written-${i}`).fill(definitionOf(ANIMALS, prompt));
    } else if (await page.getByTestId(`match-${i}-0`).isVisible()) {
      const pairs = await item.locator(`[data-testid^="match-prompt-${i}-"]`).count();
      for (let pair = 0; pair < pairs; pair++) {
        const prompt = (await page.getByTestId(`match-prompt-${i}-${pair}`).innerText()).trim();
        await page.getByTestId(`match-${i}-${pair}`).click();
        await page
          .getByTestId('match-dialog')
          .getByText(definitionOf(ANIMALS, prompt), { exact: true })
          .click();
        await expect(page.getByTestId('match-dialog')).toBeHidden();
      }
    } else {
      const prompt = (await page.getByTestId(`test-prompt-${i}`).innerText()).trim();
      await item.getByText(definitionOf(ANIMALS, prompt), { exact: true }).click();
    }
  }
  return items;
}

test('a fully correct test scores 100% and is kept in the history', async ({ page }) => {
  await openTest(page);
  await expect(page.getByTestId('test-count')).toHaveValue('8');
  await page.getByTestId('test-start').click();
  await expect(page.getByTestId('test-answered')).toHaveText('0 of 8 answered');

  const items = await answerEverything(page);
  // Eight cards over four types: 2 true/false, 2 multiple choice, 1 matching block, 2 written.
  expect(items).toBe(7);
  await expect(page.getByTestId('test-answered')).toHaveText('8 of 8 answered');

  await page.getByTestId('test-submit').click();
  await expect(page.getByTestId('test-score')).toHaveText('100%');
  await expect(page.getByTestId('test-score-detail')).toHaveText('8 of 8 correct');
  await expect(page.getByTestId('result-correct')).toHaveCount(8);
  await expect(page.getByTestId('test-breakdown')).toContainText('Matching');
  await expect(page.getByTestId('retest-missed')).toHaveCount(0);

  await shown(page, 'back-button').click();
  await expect(page.getByTestId('test-history')).toContainText('100%');
  await expect(page.getByTestId('test-history')).toContainText('8/8');
});

test('warns about unanswered questions, then offers to retest and learn the missed cards', async ({
  page,
}) => {
  await openTest(page);
  await page.getByTestId('test-count').fill('4');
  await page.getByTestId('test-start').click();

  await page.getByTestId('test-submit').click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('4 questions have no answer');
  await page.getByTestId('confirm-cancel').click();
  await expect(page.getByTestId('test-taking')).toBeVisible();

  await page.getByTestId('test-submit').click();
  await page.getByTestId('confirm-accept').click();
  await expect(page.getByTestId('test-score')).toHaveText('0%');
  await expect(page.getByTestId('result-wrong')).toHaveCount(4);
  await expect(page.getByText('No answer').first()).toBeVisible();

  // Retest only the missed cards.
  await page.getByTestId('retest-missed').click();
  await expect(page.getByTestId('test-setup')).toBeVisible();
  await expect(page.getByTestId('test-count')).toHaveValue('4');
  await page.getByTestId('test-start').click();
  await answerEverything(page);
  await page.getByTestId('test-submit').click();
  await expect(page.getByTestId('test-score')).toHaveText('100%');
});

test('Learn can be limited to the cards a test missed', async ({ page }) => {
  await openTest(page);
  await page.getByTestId('test-count').fill('4');
  await page.getByTestId('test-start').click();
  await page.getByTestId('test-submit').click();
  await page.getByTestId('confirm-accept').click();

  await page.getByTestId('learn-missed').click();
  await expect(page.getByTestId('learn-screen')).toBeVisible();
  await expect(page.getByTestId('learn-progress-text')).toHaveText(
    'New 4 · Learning 0 · Mastered 0',
  );
});

test('rejects a question count outside the set', async ({ page }) => {
  await openTest(page);
  await page.getByTestId('test-count').fill('99');
  await expect(page.getByText('Enter a number from 1 to 8.')).toBeVisible();
  await expect(page.getByTestId('test-start')).toBeDisabled();
});

test('asks before leaving a test in progress', async ({ page }) => {
  await openTest(page);
  await page.getByTestId('test-start').click();
  await shown(page, 'back-button').click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('thrown away');

  await page.getByTestId('confirm-cancel').click();
  await expect(page.getByTestId('test-taking')).toBeVisible();

  await shown(page, 'back-button').click();
  await page.getByTestId('confirm-accept').click();
  await expect(shown(page, 'set-screen')).toBeVisible();
});

test('a timed test shows a countdown', async ({ page }) => {
  await openTest(page);
  await page.getByTestId('test-minutes').fill('5');
  await page.getByTestId('test-start').click();
  await expect(page.getByTestId('test-timer')).toHaveText(/^[45]:\d\d$/);
});
