/**
 * Grading for typed answers.
 *
 * strict:  equal after tidying case, spacing, and surrounding punctuation.
 * lenient: also ignores accents and allows one typo per five characters.
 *
 * Anything strict accepts, lenient accepts.
 */
export type GradingMode = 'strict' | 'lenient';

const EDGE_PUNCTUATION = /^[\s.,;:!?"'`‘’“”()[\]{}<>¡¿…\-–—]+|[\s.,;:!?"'`‘’“”()[\]{}<>¡¿…\-–—]+$/g;
// Unicode combining diacritical marks, U+0300 to U+036F.
const COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`,
  'g',
);

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(EDGE_PUNCTUATION, '');
}

/** Case-folded, spacing-collapsed, edge punctuation removed. */
export function normalizeAnswer(text: string, ignoreAccents = false): string {
  const base = tidy(text.normalize('NFKC').toLowerCase());
  if (!ignoreAccents) return base;
  return tidy(base.normalize('NFD').replace(COMBINING_MARKS, '').normalize('NFC'));
}

/**
 * Every form of the expected answer that counts as right:
 * the whole text, each alternative split on "/" or ";", and each of those
 * with parenthesised text removed or with just the brackets removed.
 */
export function acceptedAnswers(expected: string): string[] {
  const variants = new Set<string>([expected]);
  for (const part of expected.split(/[/;]/)) variants.add(part);

  for (const variant of [...variants]) {
    if (/\([^)]*\)/.test(variant)) {
      variants.add(variant.replace(/\([^)]*\)/g, ' '));
      variants.add(variant.replace(/[()]/g, ' '));
    }
  }
  return [...variants];
}

/** Levenshtein distance. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
    }
    previous = current;
  }
  return previous[b.length];
}

function matches(given: string, expected: string, lenient: boolean): boolean {
  const normalizedGiven = normalizeAnswer(given, lenient);

  if (normalizedGiven === '') {
    // Nothing but punctuation or spaces: only an exact copy can be right.
    const raw = given.trim();
    return raw !== '' && raw === expected.trim();
  }

  for (const candidate of acceptedAnswers(expected)) {
    const normalizedExpected = normalizeAnswer(candidate, lenient);
    if (normalizedExpected === '') continue;
    if (normalizedGiven === normalizedExpected) return true;

    if (lenient) {
      const allowedTypos = Math.floor(normalizedExpected.length / 5);
      if (
        allowedTypos > 0 &&
        Math.abs(normalizedGiven.length - normalizedExpected.length) <= allowedTypos &&
        editDistance(normalizedGiven, normalizedExpected) <= allowedTypos
      ) {
        return true;
      }
    }
  }
  return false;
}

export function gradeWritten(given: string, expected: string, mode: GradingMode): boolean {
  if (matches(given, expected, false)) return true;
  return mode === 'lenient' && matches(given, expected, true);
}
