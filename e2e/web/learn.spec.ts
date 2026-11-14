import { expect, test, type Page } from '@playwright/test';

import {
  ANIMALS,
  answerLearnQuestion,
  continueLearn,
  createSet,
  definitionOf,
  reloadWhenSaved,
  shown,
} from './helpers';

const CARDS = ANIMALS.slice(0, 5);

async function openLearn(page: Page) {
  await createSet(page, 'Animals', CARDS);
  await page.getByTestId('study-learn').click();
  await expect(page.getByTestId('learn-screen')).toBeVisible();
}

test('masters every card when all answers are right', async ({ page }) => {
  await openLearn(page);
  await expect(page.getByTestId('learn-progress-text')).toHaveText(
    'New 5 · Learning 0 · Mastered 0',
  );

  // Two right answers per card: one recognition, one written.
  for (let question = 0; question < CARDS.length * 2; question++) {
    await answerLearnQuestion(page, CARDS);
    await expect(page.getByTestId('learn-result')).toHaveText('Correct');
    await continueLearn(page);
  }

  await expect(page.getByTestId('learn-finished')).toBeVisible();
  await expect(page.getByTestId('learn-mastered-count')).toHaveText('Mastered: 5 of 5');

  // The set screen shows the progress.
  await shown(page, 'back-button').click();
  await expect(page.getByTestId('learn-progress')).toHaveText('Learn: 5 of 5 mastered');
});

test('shows the answer after a miss and asks the card again', async ({ page }) => {
  await openLearn(page);

  const prompt = (await page.getByTestId('learn-prompt').innerText()).trim();
  await answerLearnQuestion(page, CARDS, false);
  await expect(page.getByTestId('learn-result')).toHaveText('Here is the answer');
  await expect(page.getByTestId('learn-expected')).toHaveText(definitionOf(CARDS, prompt));
  await continueLearn(page);

  // The missed card is not the very next question, but returns this round.
  await expect(page.getByTestId('learn-prompt')).not.toHaveText(prompt);
  const seen: string[] = [];
  for (let i = 0; i < 6 && !seen.includes(prompt); i++) {
    seen.push((await page.getByTestId('learn-prompt').innerText()).trim());
    await answerLearnQuestion(page, CARDS);
    await continueLearn(page);
  }
  expect(seen).toContain(prompt);
});

test('resumes after a reload', async ({ page }) => {
  await openLearn(page);
  for (let i = 0; i < 3; i++) {
    await answerLearnQuestion(page, CARDS);
    await continueLearn(page);
  }
  await expect(page.getByTestId('learn-progress-text')).toHaveText(
    'New 2 · Learning 3 · Mastered 0',
  );
  const prompt = await page.getByTestId('learn-prompt').innerText();

  await reloadWhenSaved(page);
  await expect(page.getByTestId('learn-progress-text')).toHaveText(
    'New 2 · Learning 3 · Mastered 0',
  );
  await expect(page.getByTestId('learn-prompt')).toHaveText(prompt);
});

test('"I was correct" turns a rejected typed answer into a right one', async ({ page }) => {
  await openLearn(page);
  // Turn off recognition questions so the first question is written.
  await page.getByTestId('learn-options-button').click();
  await page.getByRole('switch', { name: 'Multiple choice' }).click({ force: true });
  await page.getByRole('switch', { name: 'True / false' }).click({ force: true });
  await page.getByTestId('learn-options-done').click();

  await page.getByTestId('learn-written-input').fill('something else entirely');
  await page.getByTestId('learn-written-submit').click();
  await expect(page.getByTestId('learn-result')).toHaveText('Not quite');

  await page.getByTestId('learn-override').click();
  await expect(page.getByTestId('learn-result')).toHaveText('Marked as correct');
  await expect(page.getByTestId('learn-progress-text')).toHaveText(
    'New 4 · Learning 1 · Mastered 0',
  );
});

test('accepts a small typo with lenient grading', async ({ page }) => {
  await openLearn(page);
  await page.getByTestId('learn-options-button').click();
  await page.getByRole('switch', { name: 'Multiple choice' }).click({ force: true });
  await page.getByRole('switch', { name: 'True / false' }).click({ force: true });
  await page.getByTestId('learn-options-done').click();

  const prompt = (await page.getByTestId('learn-prompt').innerText()).trim();
  const answer = definitionOf(CARDS, prompt);
  // One wrong letter in an answer of seven or more letters.
  const typo = `${answer.slice(0, -1)}x`;
  await page.getByTestId('learn-written-input').fill(typo.toUpperCase());
  await page.getByTestId('learn-written-submit').click();
  await expect(page.getByTestId('learn-result')).toHaveText('Correct');
});

test('reset progress starts over', async ({ page }) => {
  await openLearn(page);
  for (let i = 0; i < 2; i++) {
    await answerLearnQuestion(page, CARDS);
    await continueLearn(page);
  }
  await page.getByTestId('learn-options-button').click();
  await page.getByTestId('learn-reset').click();
  await page.getByTestId('confirm-accept').click();

  await expect(page.getByTestId('learn-progress-text')).toHaveText(
    'New 5 · Learning 0 · Mastered 0',
  );
});
