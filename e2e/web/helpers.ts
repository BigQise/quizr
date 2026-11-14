import { expect, type Page } from '@playwright/test';

export type Pair = [term: string, definition: string];

export const ANIMALS: Pair[] = [
  ['el perro', 'the dog'],
  ['el gato', 'the cat'],
  ['el caballo', 'the horse'],
  ['la vaca', 'the cow'],
  ['el pájaro', 'the bird'],
  ['el pez', 'the fish'],
  ['la oveja', 'the sheep'],
  ['el cerdo', 'the pig'],
];

/** Creates a set through the UI and imports cards by pasting. Ends on the set screen. */
export async function createSet(page: Page, title: string, pairs: Pair[]) {
  await page.goto('/');
  await page.getByTestId('new-set').click();
  await page.getByTestId('set-title-input').fill(title);
  await page.getByTestId('create-set').click();
  await expect(shown(page, 'set-screen')).toBeVisible();

  if (pairs.length > 0) {
    await page.getByTestId('import-cards').click();
    await page
      .getByTestId('import-text')
      .fill(pairs.map(([term, definition]) => `${term}\t${definition}`).join('\n'));
    await expect(page.getByTestId('import-count')).toContainText(`${pairs.length} card`);
    await page.getByTestId('import-submit').click();
    await expect(shown(page, 'card-count')).toHaveText(
      pairs.length === 1 ? '1 card' : `${pairs.length} cards`,
    );
  }
}

/**
 * The visible element with this test id. Expo Router keeps earlier screens
 * mounted but hidden, so an id used on several screens (like the back button)
 * can match more than once.
 */
export function shown(page: Page, testId: string) {
  return page.getByTestId(testId).filter({ visible: true });
}

/** Waits until every storage operation the app has started is finished. */
export async function saved(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-quizr-busy', 'false');
}

/** Reloads the page once nothing is still being written. */
export async function reloadWhenSaved(page: Page) {
  await saved(page);
  await page.reload();
}

/** Opens a URL with a full page load, once nothing is still being written. */
export async function gotoWhenSaved(page: Page, url: string) {
  await saved(page);
  await page.goto(url);
}

export function definitionOf(pairs: Pair[], term: string): string {
  const pair = pairs.find(([candidate]) => candidate === term);
  if (!pair) throw new Error(`No card with term "${term}"`);
  return pair[1];
}

async function visible(page: Page, testId: string): Promise<boolean> {
  return page.getByTestId(testId).isVisible();
}

/**
 * Answers the Learn question on screen, correctly or not, and stops on the
 * feedback panel. Assumes the default "answer with definition".
 */
export async function answerLearnQuestion(page: Page, pairs: Pair[], correctly = true) {
  await expect(page.getByTestId('learn-prompt')).toBeVisible();
  const expected = definitionOf(pairs, (await page.getByTestId('learn-prompt').innerText()).trim());

  if (!correctly) {
    await page.getByTestId('learn-dont-know').click();
  } else if (await visible(page, 'learn-written-input')) {
    await page.getByTestId('learn-written-input').fill(expected);
    await page.getByTestId('learn-written-submit').click();
  } else if (await visible(page, 'learn-true')) {
    const shown = (await page.getByTestId('learn-shown-answer').innerText()).trim();
    await page.getByTestId(shown === expected ? 'learn-true' : 'learn-false').click();
  } else {
    await page.getByTestId('learn-options').getByText(expected, { exact: true }).click();
  }
  await expect(page.getByTestId('learn-feedback')).toBeVisible();
}

/** Moves on from the feedback panel, through a checkpoint if one appears. */
export async function continueLearn(page: Page) {
  await page.getByTestId('learn-continue').click();
  await expect(page.getByTestId('learn-feedback')).toBeHidden();
  if (await visible(page, 'learn-next-round')) {
    await page.getByTestId('learn-next-round').click();
  }
}
