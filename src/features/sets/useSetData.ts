import { useLoadOnFocus, useRepos } from '@/data/ReposProvider';
import type { CardRecord, SetRecord, TestAttemptSummary } from '@/data/repos';

export type SetData = {
  /** null when the set does not exist (deleted, or a bad link). */
  set: SetRecord | null;
  cards: CardRecord[];
  attempts: TestAttemptSummary[];
};

/** A set with its cards and test history, refreshed whenever the screen regains focus. */
export function useSetData(setId: string) {
  const repos = useRepos();
  return useLoadOnFocus(`set:${setId}`, async (): Promise<SetData> => {
    const [set, cards, attempts] = await Promise.all([
      repos.getSet(setId),
      repos.listCards(setId),
      repos.listTestAttempts(setId),
    ]);
    return { set, cards, attempts };
  });
}

/** Learn and Test need enough cards to offer wrong answers. */
export const MIN_CARDS_FOR_QUESTIONS = 4;
