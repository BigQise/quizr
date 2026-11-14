import * as fc from 'fast-check';

import { acceptedAnswers, editDistance, gradeWritten, normalizeAnswer } from './grading';

describe('normalizeAnswer', () => {
  it('folds case, collapses spaces, and strips surrounding punctuation', () => {
    expect(normalizeAnswer('  The   Mitochondria! ')).toBe('the mitochondria');
    expect(normalizeAnswer('"Paris."')).toBe('paris');
  });

  it('keeps punctuation inside the answer', () => {
    expect(normalizeAnswer("don't")).toBe("don't");
  });

  it('removes accents only when asked', () => {
    expect(normalizeAnswer('Café')).toBe('café');
    expect(normalizeAnswer('Café', true)).toBe('cafe');
  });
});

describe('acceptedAnswers', () => {
  it('offers each alternative split on slash or semicolon', () => {
    expect(acceptedAnswers('car / automobile; auto').map((a) => a.trim())).toEqual(
      expect.arrayContaining(['car', 'automobile', 'auto']),
    );
  });

  it('treats parenthesised text as optional', () => {
    const variants = acceptedAnswers('(to) run').map((a) => normalizeAnswer(a));
    expect(variants).toEqual(expect.arrayContaining(['run', 'to run']));
  });
});

describe('editDistance', () => {
  it.each([
    ['kitten', 'sitting', 3],
    ['', 'abc', 3],
    ['same', 'same', 0],
    ['flaw', 'lawn', 2],
  ])('%s → %s is %i', (a, b, expected) => {
    expect(editDistance(a, b)).toBe(expected);
  });
});

describe('gradeWritten', () => {
  it('accepts a differently cased and punctuated answer in strict mode', () => {
    expect(gradeWritten(' paris. ', 'Paris', 'strict')).toBe(true);
  });

  it('accepts any one alternative', () => {
    expect(gradeWritten('automobile', 'car / automobile', 'strict')).toBe(true);
    expect(gradeWritten('truck', 'car / automobile', 'strict')).toBe(false);
  });

  it('accepts an answer with or without the optional part', () => {
    expect(gradeWritten('run', '(to) run', 'strict')).toBe(true);
    expect(gradeWritten('to run', '(to) run', 'strict')).toBe(true);
  });

  it('rejects a typo in strict mode and allows it in lenient mode', () => {
    expect(gradeWritten('mitochondira', 'mitochondria', 'strict')).toBe(false);
    expect(gradeWritten('mitochondira', 'mitochondria', 'lenient')).toBe(true);
  });

  it('allows one typo per five characters, no more', () => {
    expect(gradeWritten('pariz', 'paris', 'lenient')).toBe(true);
    expect(gradeWritten('pazis', 'park', 'lenient')).toBe(false);
    expect(gradeWritten('cat', 'cot', 'lenient')).toBe(false);
  });

  it('ignores accents only in lenient mode', () => {
    expect(gradeWritten('cafe', 'café', 'strict')).toBe(false);
    expect(gradeWritten('cafe', 'café', 'lenient')).toBe(true);
  });

  it('rejects an empty answer', () => {
    expect(gradeWritten('', 'paris', 'lenient')).toBe(false);
    expect(gradeWritten('   ', 'paris', 'lenient')).toBe(false);
  });

  it('an answer always matches itself', () => {
    const nonBlank = fc.string({ minLength: 1 }).filter((value) => value.trim() !== '');
    fc.assert(
      fc.property(nonBlank, (answer) => {
        expect(gradeWritten(answer, answer, 'strict')).toBe(true);
        expect(gradeWritten(answer, answer, 'lenient')).toBe(true);
      }),
    );
  });

  it('anything strict accepts, lenient accepts', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (given, expected) => {
        if (gradeWritten(given, expected, 'strict')) {
          expect(gradeWritten(given, expected, 'lenient')).toBe(true);
        }
      }),
    );
  });
});
