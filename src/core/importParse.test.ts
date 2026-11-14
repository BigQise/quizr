import { guessDelimiter, parseImport } from './importParse';

describe('parseImport', () => {
  it('reads one card per line, split on tabs', () => {
    expect(parseImport('hola\thello\nadiós\tgoodbye', 'tab')).toEqual({
      pairs: [
        { term: 'hola', definition: 'hello' },
        { term: 'adiós', definition: 'goodbye' },
      ],
      skippedLines: [],
    });
  });

  it('splits on the first delimiter only', () => {
    expect(parseImport('H2O, water, a liquid', 'comma').pairs).toEqual([
      { term: 'H2O', definition: 'water, a liquid' },
    ]);
  });

  it('ignores blank lines and reports unreadable ones by line number', () => {
    const result = parseImport('a\tb\n\nno delimiter here\n\tmissing term\nc\td\r\n', 'tab');
    expect(result.pairs).toHaveLength(2);
    expect(result.skippedLines).toEqual([3, 4]);
  });

  it('supports the dash delimiter without splitting hyphenated words', () => {
    expect(parseImport('well-being - feeling good', 'dash').pairs).toEqual([
      { term: 'well-being', definition: 'feeling good' },
    ]);
  });
});

describe('guessDelimiter', () => {
  it('picks the delimiter that reads the most lines', () => {
    expect(guessDelimiter('a\tb\nc\td')).toBe('tab');
    expect(guessDelimiter('a; b\nc; d')).toBe('semicolon');
    expect(guessDelimiter('a - b\nc - d')).toBe('dash');
    expect(guessDelimiter('a, b\nc, d')).toBe('comma');
  });
});
