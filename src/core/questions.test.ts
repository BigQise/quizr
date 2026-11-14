import * as fc from 'fast-check';

import { normalizeAnswer } from './grading';
import { makeMultipleChoice, makeTrueFalse, makeWritten, pickDistractors } from './questions';
import { createRng } from './rng';
import { cardsArbitrary, makeCards } from './testing';

describe('makeMultipleChoice', () => {
  it('shows the other side as the prompt and includes the right answer', () => {
    const cards = makeCards(6);
    const question = makeMultipleChoice(cards[2], cards, 'definition', createRng(1));

    expect(question).not.toBeNull();
    expect(question!.prompt).toBe(cards[2].term);
    expect(question!.options).toHaveLength(4);
    expect(question!.options[question!.correctIndex]).toBe(cards[2].definition);
    expect(question!.answer).toBe(cards[2].definition);
  });

  it('can ask for the term instead', () => {
    const cards = makeCards(6);
    const question = makeMultipleChoice(cards[0], cards, 'term', createRng(1));
    expect(question!.prompt).toBe(cards[0].definition);
    expect(question!.answer).toBe(cards[0].term);
  });

  it('returns null when no other card has a different answer', () => {
    const cards = [
      { id: 'a', term: 'one', definition: 'Same', starred: false },
      { id: 'b', term: 'two', definition: 'same.', starred: false },
    ];
    expect(makeMultipleChoice(cards[0], cards, 'definition', createRng(1))).toBeNull();
  });

  it('has exactly one correct option and no duplicate option text', () => {
    fc.assert(
      fc.property(cardsArbitrary(2, 30), fc.integer(), fc.boolean(), (cards, seed, hard) => {
        const question = makeMultipleChoice(cards[0], cards, 'definition', createRng(seed), hard);
        if (question === null) return;

        const keys = question.options.map((option) => normalizeAnswer(option) || option.trim());
        expect(new Set(keys).size).toBe(keys.length);
        expect(question.options.filter((option) => option === question.answer)).toHaveLength(1);
        expect(question.options[question.correctIndex]).toBe(question.answer);
        expect(question.options.length).toBeGreaterThanOrEqual(2);
        expect(question.options.length).toBeLessThanOrEqual(4);
      }),
    );
  });

  it('is deterministic for a seed', () => {
    const cards = makeCards(20);
    expect(makeMultipleChoice(cards[3], cards, 'definition', createRng(9))).toEqual(
      makeMultipleChoice(cards[3], cards, 'definition', createRng(9)),
    );
  });

  it('stays fast on a 5,000-card set', () => {
    const cards = makeCards(5000);
    const rng = createRng(3);
    const start = performance.now();
    for (let i = 0; i < 100; i++) makeMultipleChoice(cards[i], cards, 'definition', rng);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('pickDistractors', () => {
  it('never returns the card itself or more than asked for', () => {
    const cards = makeCards(10);
    const distractors = pickDistractors(cards[0], cards, 'definition', 3, createRng(5));
    expect(distractors).toHaveLength(3);
    expect(distractors).not.toContain(cards[0].definition);
  });
});

describe('makeTrueFalse', () => {
  it('is true exactly when the shown answer is the right one', () => {
    fc.assert(
      fc.property(cardsArbitrary(1, 20), fc.integer(), (cards, seed) => {
        const question = makeTrueFalse(cards[0], cards, 'definition', createRng(seed));
        expect(question.answer).toBe(cards[0].definition);
        expect(question.isTrue).toBe(question.shownAnswer === question.answer);
      }),
    );
  });

  it('produces both true and false statements over many seeds', () => {
    const cards = makeCards(8);
    const outcomes = new Set<boolean>();
    for (let seed = 0; seed < 40; seed++) {
      outcomes.add(makeTrueFalse(cards[0], cards, 'definition', createRng(seed)).isTrue);
    }
    expect(outcomes.size).toBe(2);
  });
});

describe('makeWritten', () => {
  it('asks for the chosen side', () => {
    const [card] = makeCards(1);
    expect(makeWritten(card, 'term')).toEqual({
      type: 'written',
      cardId: card.id,
      prompt: card.definition,
      answer: card.term,
    });
  });
});
