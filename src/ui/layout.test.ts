import { widthClassFor } from './layout';

describe('widthClassFor', () => {
  it.each([
    [320, 'compact'],
    [599, 'compact'],
    [600, 'medium'],
    [839, 'medium'],
    [840, 'expanded'],
    [1280, 'expanded'],
  ] as const)('%i px is %s', (width, expected) => {
    expect(widthClassFor(width)).toBe(expected);
  });
});
