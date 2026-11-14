import { expect, test, type Page } from '@playwright/test';

import { ANIMALS, createSet, reloadWhenSaved } from './helpers';

const CARDS = ANIMALS.slice(0, 4);

async function openFlashcards(page: Page) {
  await createSet(page, 'Animals', CARDS);
  await page.getByTestId('study-flashcards').click();
  await expect(page.getByTestId('flashcards-screen')).toBeVisible();
}

async function chooseMethod(page: Page, method: 'browse' | 'sort' | 'srs') {
  await page.getByTestId('flashcards-options').click();
  await page.getByTestId(`method-${method}`).click();
  await page.getByTestId('options-done').click();
}

test('flips a card and walks through the deck to the end', async ({ page }) => {
  await openFlashcards(page);

  await expect(page.getByTestId('deck-progress')).toHaveText('1 / 4');
  await expect(page.getByTestId('flashcard')).toHaveAccessibleName('Term: el perro');

  await page.getByTestId('deck-flip').click();
  await expect(page.getByTestId('flashcard')).toHaveAccessibleName('Definition: the dog');

  // The next card starts front side up.
  await page.getByTestId('deck-next').click();
  await expect(page.getByTestId('flashcard')).toHaveAccessibleName('Term: el gato');
  await page.getByTestId('deck-previous').click();
  await expect(page.getByTestId('flashcard')).toHaveAccessibleName('Term: el perro');

  for (let i = 0; i < 4; i++) await page.getByTestId('deck-next').click();
  await expect(page.getByTestId('flashcards-summary')).toContainText('You have seen every card');

  await page.getByTestId('restart-deck').click();
  await expect(page.getByTestId('deck-progress')).toHaveText('1 / 4');
});

test('tapping the card and the keyboard both work', async ({ page }) => {
  await openFlashcards(page);

  await page.getByTestId('flashcard').click();
  await expect(page.getByTestId('flashcard')).toHaveAccessibleName('Definition: the dog');

  await page.keyboard.press('Space');
  await expect(page.getByTestId('flashcard')).toHaveAccessibleName('Term: el perro');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('deck-progress')).toHaveText('2 / 4');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('deck-progress')).toHaveText('1 / 4');
});

test('reopens where it was left', async ({ page }) => {
  await openFlashcards(page);
  await page.getByTestId('deck-next').click();
  await page.getByTestId('deck-next').click();
  await expect(page.getByTestId('deck-progress')).toHaveText('3 / 4');

  await reloadWhenSaved(page);
  await expect(page.getByTestId('deck-progress')).toHaveText('3 / 4');
  await expect(page.getByTestId('flashcard')).toHaveAccessibleName('Term: el caballo');
});

test('can show the definition first', async ({ page }) => {
  await openFlashcards(page);
  await page.getByTestId('flashcards-options').click();
  await page.getByTestId('front-side-definition').click();
  await page.getByTestId('options-done').click();
  await expect(page.getByTestId('flashcard')).toHaveAccessibleName('Definition: the dog');
});

test('sorts cards, undoes, and reviews the ones still being learned', async ({ page }) => {
  await openFlashcards(page);
  await chooseMethod(page, 'sort');

  await page.getByTestId('sort-know').click();
  await page.getByTestId('sort-still-learning').click();
  await expect(page.getByTestId('deck-progress')).toHaveText('3 / 4');

  // Undo the last sort and sort it the other way.
  await page.getByTestId('sort-undo').click();
  await expect(page.getByTestId('deck-progress')).toHaveText('2 / 4');
  await page.getByTestId('sort-know').click();

  await page.getByTestId('sort-still-learning').click();
  await page.getByTestId('sort-still-learning').click();

  await expect(page.getByTestId('summary-know')).toHaveText('Know: 2');
  await expect(page.getByTestId('summary-still-learning')).toHaveText('Still learning: 2');

  await page.getByTestId('review-still-learning').click();
  await expect(page.getByTestId('deck-progress')).toHaveText('1 / 2');
  await expect(page.getByTestId('flashcard')).toHaveAccessibleName('Term: el caballo');
});

test('spaced repetition: rates cards until nothing is due, and remembers it', async ({ page }) => {
  await openFlashcards(page);
  await chooseMethod(page, 'srs');

  await expect(page.getByTestId('srs-counts')).toContainText('Due 0 · New 4 · Later 0');

  // Ratings only appear after the answer is shown.
  await expect(page.getByTestId('srs-ratings')).toBeHidden();
  await page.getByTestId('srs-show').click();
  await expect(page.getByTestId('srs-rate-again')).toContainText('Again');
  await expect(page.getByTestId('srs-rate-easy')).toContainText('d');
  await page.getByTestId('srs-rate-easy').click();

  for (let i = 0; i < 3; i++) {
    await page.getByTestId('srs-show').click();
    await page.getByTestId('srs-rate-good').click();
  }

  await expect(page.getByTestId('srs-done')).toBeVisible();
  await expect(page.getByTestId('srs-reviewed')).toHaveText('Reviewed this session: 4');
  await expect(page.getByTestId('srs-next-due')).toBeVisible();

  // Nothing is due after a reload either: the schedule was saved.
  await reloadWhenSaved(page);
  await expect(page.getByTestId('srs-done')).toBeVisible();
});

test('spaced repetition: a forgotten card comes back within minutes', async ({ page }) => {
  await openFlashcards(page);
  await chooseMethod(page, 'srs');

  await page.getByTestId('srs-show').click();
  await page.getByTestId('srs-rate-again').click();
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('srs-show').click();
    await page.getByTestId('srs-rate-easy').click();
  }

  await expect(page.getByTestId('srs-next-due')).toContainText(/in (<1|\d+)m\./);
});

test('only one face of the card is ever showing', async ({ page }) => {
  await openFlashcards(page);

  // Effective opacity of a face: the product of opacity up the tree.
  const opacityOf = (testId: string) =>
    page.getByTestId(testId).evaluate((element) => {
      let opacity = 1;
      for (let node: Element | null = element; node; node = node.parentElement) {
        opacity *= Number(getComputedStyle(node).opacity);
      }
      return opacity;
    });

  await expect.poll(() => opacityOf('flashcard-front')).toBe(1);
  await expect.poll(() => opacityOf('flashcard-back')).toBe(0);

  await page.getByTestId('deck-flip').click();
  await expect.poll(() => opacityOf('flashcard-back')).toBe(1);
  await expect.poll(() => opacityOf('flashcard-front')).toBe(0);
});
