import { createEmptyCard, fsrs, Rating, type Card as FsrsCard, type Grade } from 'ts-fsrs';

/**
 * Spaced repetition. The FSRS algorithm (ts-fsrs) decides when a card is due
 * next; this module is the only place that knows about that library. The rest
 * of the app sees plain-JSON cards with millisecond timestamps.
 */
export type SrsRating = 'again' | 'hard' | 'good' | 'easy';

export const SRS_RATINGS: readonly SrsRating[] = ['again', 'hard', 'good', 'easy'];

export type SrsCard = {
  /** When the card should next be reviewed, Unix ms. */
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  /** 0 new, 1 learning, 2 review, 3 relearning. */
  state: number;
  lastReview: number | null;
};

// Fuzz adds random jitter to intervals. Off, so scheduling is repeatable.
const scheduler = fsrs({ enable_fuzz: false });

const GRADES: Record<SrsRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

function toFsrs(card: SrsCard): FsrsCard {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.lastReview === null ? undefined : new Date(card.lastReview),
  };
}

function fromFsrs(card: FsrsCard): SrsCard {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ? card.last_review.getTime() : null,
  };
}

/** A card that has never been reviewed. It is due immediately. */
export function newSrsCard(now: number): SrsCard {
  return fromFsrs(createEmptyCard(new Date(now)));
}

/** The card after being reviewed at `now` with `rating`. */
export function rateCard(card: SrsCard, rating: SrsRating, now: number): SrsCard {
  return fromFsrs(scheduler.next(toFsrs(card), new Date(now), GRADES[rating]).card);
}

/** When the card would next be due for each possible rating, Unix ms. */
export function previewRatings(card: SrsCard, now: number): Record<SrsRating, number> {
  const preview = scheduler.repeat(toFsrs(card), new Date(now));
  return {
    again: preview[Rating.Again].card.due.getTime(),
    hard: preview[Rating.Hard].card.due.getTime(),
    good: preview[Rating.Good].card.due.getTime(),
    easy: preview[Rating.Easy].card.due.getTime(),
  };
}

/** A card's scheduling state, or null if it has never been studied this way. */
export type SrsEntry = { cardId: string; srs: SrsCard | null };

export type SrsNext = { cardId: string; isNew: boolean };

/**
 * The card to show now, or null when nothing is due.
 * Due reviews come first, earliest first; then new cards in set order while
 * the daily allowance lasts. A card is never offered before it is due.
 */
export function nextSrsCard(
  entries: readonly SrsEntry[],
  now: number,
  newRemaining: number,
): SrsNext | null {
  let earliest: SrsEntry | null = null;
  for (const entry of entries) {
    if (entry.srs === null || entry.srs.due > now) continue;
    if (earliest === null || entry.srs.due < earliest.srs!.due) earliest = entry;
  }
  if (earliest) return { cardId: earliest.cardId, isNew: false };

  if (newRemaining > 0) {
    const fresh = entries.find((entry) => entry.srs === null);
    if (fresh) return { cardId: fresh.cardId, isNew: true };
  }
  return null;
}

export type SrsCounts = {
  /** Reviews due now. */
  due: number;
  /** New cards that can still be introduced today. */
  fresh: number;
  /** Studied cards that are not due yet. */
  later: number;
  /** When the next not-yet-due card comes back, or null if none. */
  nextDueAt: number | null;
};

export function srsCounts(
  entries: readonly SrsEntry[],
  now: number,
  newRemaining: number,
): SrsCounts {
  let due = 0;
  let unseen = 0;
  let later = 0;
  let nextDueAt: number | null = null;

  for (const entry of entries) {
    if (entry.srs === null) unseen++;
    else if (entry.srs.due <= now) due++;
    else {
      later++;
      if (nextDueAt === null || entry.srs.due < nextDueAt) nextDueAt = entry.srs.due;
    }
  }
  return { due, fresh: Math.min(unseen, Math.max(0, newRemaining)), later, nextDueAt };
}

/**
 * Start of the local day containing `now`, as Unix ms.
 * @param timezoneOffsetMinutes What `new Date().getTimezoneOffset()` returns.
 */
export function startOfLocalDay(now: number, timezoneOffsetMinutes: number): number {
  const offset = timezoneOffsetMinutes * 60_000;
  const day = 86_400_000;
  return Math.floor((now - offset) / day) * day + offset;
}

/** A short label for a wait, such as "10m", "1d", or "2.5mo". */
export function formatInterval(milliseconds: number): string {
  const minutes = milliseconds / 60_000;
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  const months = days / 30;
  if (months < 12) return `${trim(months)}mo`;
  return `${trim(days / 365)}y`;
}

function trim(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}
