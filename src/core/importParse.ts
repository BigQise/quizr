/**
 * Turns pasted text into cards: one card per line, term and definition
 * separated by a delimiter. Splits on the FIRST delimiter in a line, so a
 * definition may itself contain the delimiter.
 */
export type ImportDelimiter = 'tab' | 'comma' | 'semicolon' | 'dash';

export const DELIMITERS: Record<ImportDelimiter, string> = {
  tab: '\t',
  comma: ',',
  semicolon: ';',
  dash: ' - ',
};

export type ParsedImport = {
  pairs: { term: string; definition: string }[];
  /** 1-based numbers of non-empty lines that could not be read as a card. */
  skippedLines: number[];
};

export function parseImport(text: string, delimiter: ImportDelimiter): ParsedImport {
  const separator = DELIMITERS[delimiter];
  const pairs: ParsedImport['pairs'] = [];
  const skippedLines: number[] = [];

  text.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === '') return;

    const at = line.indexOf(separator);
    const term = at === -1 ? '' : line.slice(0, at).trim();
    const definition = at === -1 ? '' : line.slice(at + separator.length).trim();

    if (term === '' || definition === '') {
      skippedLines.push(index + 1);
      return;
    }
    pairs.push({ term, definition });
  });

  return { pairs, skippedLines };
}

/** Picks the delimiter that reads the most lines as cards. Tab wins ties. */
export function guessDelimiter(text: string): ImportDelimiter {
  const order: ImportDelimiter[] = ['tab', 'semicolon', 'dash', 'comma'];
  let best: ImportDelimiter = 'tab';
  let bestCount = -1;
  for (const delimiter of order) {
    const count = parseImport(text, delimiter).pairs.length;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}
