import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { otherSide, textOn } from '@/core/model';
import {
  formatInterval,
  newSrsCard,
  nextSrsCard,
  previewRatings,
  rateCard,
  srsCounts,
  SRS_RATINGS,
  type SrsEntry,
  type SrsRating,
} from '@/core/srs/scheduler';
import { useRepos } from '@/data/ReposProvider';
import type { CardRecord, SrsRecord } from '@/data/repos';
import { Button } from '@/ui/Button';
import { nowMs } from '@/ui/clock';
import { Text } from '@/ui/Text';
import { Surface } from '@/ui/controls';
import { spacing } from '@/ui/theme';
import { useKeyboardShortcuts } from '@/ui/useKeyboardShortcuts';

import { sideLabel } from './DeckStudy';
import { FlipCard } from './FlipCard';
import type { FlashcardOptions } from './options';

const RATING_LABELS: Record<SrsRating, string> = {
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy',
};

const RATING_VARIANTS = {
  again: 'danger',
  hard: 'secondary',
  good: 'primary',
  easy: 'success',
} as const;

type SrsStudyProps = {
  cards: CardRecord[];
  options: FlashcardOptions;
  initialRecords: Record<string, SrsRecord>;
  newCardsPerDay: number;
  introducedToday: number;
  onBrowse: () => void;
};

/**
 * Flashcards with spaced repetition: flip, rate how well you remembered, and
 * the scheduler decides when the card comes back.
 */
export function SrsStudy({
  cards,
  options,
  initialRecords,
  newCardsPerDay,
  introducedToday,
  onBrowse,
}: SrsStudyProps) {
  const repos = useRepos();
  const [records, setRecords] = useState(initialRecords);
  const [introduced, setIntroduced] = useState(introducedToday);
  const [flipped, setFlipped] = useState(false);
  const [now, setNow] = useState(nowMs);
  const [reviewed, setReviewed] = useState(0);

  const entries: SrsEntry[] = cards.map((card) => ({
    cardId: card.id,
    srs: records[card.id]?.srs ?? null,
  }));
  const allowance = Math.max(0, newCardsPerDay - introduced);
  const next = nextSrsCard(entries, now, allowance);
  const counts = srsCounts(entries, now, allowance);
  const card = next ? cards.find((candidate) => candidate.id === next.cardId) : undefined;

  const rate = (rating: SrsRating) => {
    if (!next || !card || !flipped) return;
    const time = nowMs();
    const existing = records[card.id];
    const updated: SrsRecord = {
      srs: rateCard(existing?.srs ?? newSrsCard(time), rating, time),
      introducedAt: existing?.introducedAt ?? time,
    };

    setRecords({ ...records, [card.id]: updated });
    if (next.isNew) setIntroduced(introduced + 1);
    setReviewed(reviewed + 1);
    setFlipped(false);
    setNow(time);

    repos.saveSrs(card.id, updated).catch(() => {});
    repos
      .logReview({
        cardId: card.id,
        mode: 'srs',
        questionType: 'flashcard',
        correct: rating !== 'again',
        rating,
      })
      .catch(() => {});
  };

  useKeyboardShortcuts({
    Space: () => setFlipped((value) => !value),
    '1': () => rate('again'),
    '2': () => rate('hard'),
    '3': () => rate('good'),
    '4': () => rate('easy'),
  });

  if (!next || !card) {
    const unseen = entries.filter((entry) => entry.srs === null).length;
    return (
      <View style={styles.done} testID="srs-done">
        <Text variant="title" center>
          Nothing is due right now
        </Text>
        <Surface>
          <Text testID="srs-reviewed">Reviewed this session: {reviewed}</Text>
          {counts.nextDueAt !== null ? (
            <Text testID="srs-next-due">
              Next card comes back in {formatInterval(counts.nextDueAt - now)}.
            </Text>
          ) : null}
          {unseen > 0 ? (
            <Text tone="muted">
              {unseen === 1 ? '1 new card is' : `${unseen} new cards are`} waiting for tomorrow. The
              daily limit is {newCardsPerDay}; change it in Settings.
            </Text>
          ) : null}
        </Surface>
        <Button
          label="Check again"
          variant="primary"
          testID="srs-refresh"
          onPress={() => setNow(nowMs())}
        />
        <Button label="Browse the cards instead" testID="srs-browse" onPress={onBrowse} />
      </View>
    );
  }

  const backSide = otherSide(options.frontSide);
  const preview = previewRatings(records[card.id]?.srs ?? newSrsCard(now), now);

  return (
    <View style={styles.root}>
      <Text variant="caption" tone="muted" testID="srs-counts">
        Due {counts.due} · New {counts.fresh} · Later {counts.later}
        {next.isNew ? '  ·  New card' : ''}
      </Text>

      <FlipCard
        key={`${card.id}:${reviewed}`}
        front={textOn(card, options.frontSide)}
        back={textOn(card, backSide)}
        frontLabel={sideLabel(options.frontSide)}
        backLabel={sideLabel(backSide)}
        flipped={flipped}
        onFlip={() => setFlipped((value) => !value)}
      />

      {flipped ? (
        <View style={styles.ratings} testID="srs-ratings">
          {SRS_RATINGS.map((rating) => (
            <Button
              key={rating}
              label={`${RATING_LABELS[rating]}\n${formatInterval(preview[rating] - now)}`}
              accessibilityLabel={`${RATING_LABELS[rating]}: comes back in ${formatInterval(preview[rating] - now)}`}
              variant={RATING_VARIANTS[rating]}
              testID={`srs-rate-${rating}`}
              style={styles.rating}
              compact
              onPress={() => rate(rating)}
            />
          ))}
        </View>
      ) : (
        <Button
          label="Show answer"
          variant="primary"
          testID="srs-show"
          onPress={() => setFlipped(true)}
        />
      )}
      <Text variant="caption" tone="muted" center>
        Try to recall the answer before you flip. Then rate how it went.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: spacing.md },
  ratings: { flexDirection: 'row', gap: spacing.sm },
  rating: { flex: 1 },
  done: { flex: 1, justifyContent: 'center', gap: spacing.md },
});
