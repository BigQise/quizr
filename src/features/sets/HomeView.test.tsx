import { render, screen } from '@testing-library/react-native';

import { HomeView } from './HomeView';

describe('HomeView', () => {
  it('shows a loading state before the count is known', async () => {
    await render(<HomeView setCount={null} />);
    expect(screen.getByTestId('set-count')).toHaveTextContent('Loading…');
  });

  it('says the library is empty when there are no sets', async () => {
    await render(<HomeView setCount={0} />);
    expect(screen.getByTestId('set-count')).toHaveTextContent('No study sets yet.');
  });

  it('uses the singular for one set', async () => {
    await render(<HomeView setCount={1} />);
    expect(screen.getByTestId('set-count')).toHaveTextContent('1 study set');
  });

  it('uses the plural for several sets', async () => {
    await render(<HomeView setCount={12} />);
    expect(screen.getByTestId('set-count')).toHaveTextContent('12 study sets');
  });
});
