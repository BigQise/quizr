import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { gradeWritten } from '@/core/grading';
import {
  createLearnSession,
  DEFAULT_LEARN_CONFIG,
  isValidLearnState,
  learnProgress,
  learnReducer,
  STREAK_THRESHOLD,
  type LearnAnswer,
  type LearnConfig,
  type LearnEvent,
  type LearnState,
  type Stage,
} from '@/core/learn/session';
import { otherSide } from '@/core/model';
import type { Question } from '@/core/questions';
import { gradeTest } from '@/core/test/generate';
import { useLoad, useRepos } from '@/data/ReposProvider';
import type { CardRecord } from '@/data/repos';
import { newSeed, sideLabel } from '@/features/flashcards/DeckStudy';
import { Button } from '@/ui/Button';
import { ConfirmDialog, Dialog } from '@/ui/Dialog';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import {
  Badge,
  EmptyState,
  ProgressBar,
  Segmented,
  Surface,
  SwitchRow,
  TextField,
} from '@/ui/controls';
import { spacing } from '@/ui/theme';
import { useKeyboardShortcuts } from '@/ui/useKeyboardShortcuts';

type SavedLearn = { version: 1; starredOnly: boolean; state: LearnState };

function readSaved(value: unknown): Partial<SavedLearn> {
  return typeof value === 'object' && value !== null ? (value as Partial<SavedLearn>) : {};
}

function toStage(value: number): Stage {
  return value === 2 ? 2 : value === 1 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Question

function WrittenAnswer({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <View style={styles.stack}>
      <TextField
        label="Your answer"
        value={text}
        onChangeText={setText}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={() => onSubmit(text)}
        testID="learn-written-input"
      />
      <Button
        label="Answer"
        variant="primary"
        disabled={text.trim() === ''}
        testID="learn-written-submit"
        onPress={() => onSubmit(text)}
      />
    </View>
  );
}

function QuestionView({
  question,
  answerWith,
  onAnswer,
}: {
  question: Question;
  answerWith: LearnConfig['answerWith'];
  onAnswer: (answer: LearnAnswer) => void;
}) {
  useKeyboardShortcuts(
    question.type === 'multipleChoice'
      ? Object.fromEntries(
          question.options.map((_, index) => [
            String(index + 1),
            () => onAnswer({ kind: 'choice', index }),
          ]),
        )
      : question.type === 'trueFalse'
        ? {
            t: () => onAnswer({ kind: 'boolean', value: true }),
            f: () => onAnswer({ kind: 'boolean', value: false }),
          }
        : {},
  );

  return (
    <View style={styles.stack}>
      <Surface>
        <Text variant="caption" tone="muted">
          {sideLabel(otherSide(answerWith))}
        </Text>
        <Text variant="display" testID="learn-prompt">
          {question.prompt}
        </Text>
        {question.type === 'trueFalse' ? (
          <>
            <Text variant="caption" tone="muted">
              {sideLabel(answerWith)}
            </Text>
            <Text variant="display" testID="learn-shown-answer">
              {question.shownAnswer}
            </Text>
          </>
        ) : null}
      </Surface>

      {question.type === 'multipleChoice' ? (
        <View style={styles.stack} testID="learn-options">
          <Text variant="caption" tone="muted">
            Choose the matching {sideLabel(answerWith).toLowerCase()}
          </Text>
          {question.options.map((option, index) => (
            <Button
              key={index}
              label={option}
              testID={`learn-option-${index}`}
              onPress={() => onAnswer({ kind: 'choice', index })}
            />
          ))}
        </View>
      ) : null}

      {question.type === 'trueFalse' ? (
        <View style={styles.stack}>
          <Text variant="caption" tone="muted">
            Do these belong together?
          </Text>
          <View style={styles.row}>
            <Button
              label="True"
              style={styles.grow}
              testID="learn-true"
              onPress={() => onAnswer({ kind: 'boolean', value: true })}
            />
            <Button
              label="False"
              style={styles.grow}
              testID="learn-false"
              onPress={() => onAnswer({ kind: 'boolean', value: false })}
            />
          </View>
        </View>
      ) : null}

      {question.type === 'written' ? (
        <WrittenAnswer onSubmit={(text) => onAnswer({ kind: 'text', text })} />
      ) : null}

      <Button
        label="Don't know"
        variant="ghost"
        testID="learn-dont-know"
        onPress={() => onAnswer({ kind: 'dontKnow' })}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Feedback

function FeedbackView({
  state,
  onOverride,
  onContinue,
}: {
  state: LearnState;
  onOverride: () => void;
  onContinue: () => void;
}) {
  const feedback = state.feedback!;
  const [retyped, setRetyped] = useState('');
  const mustRetype =
    state.config.retypeOnMiss && feedback.questionType === 'written' && !feedback.correct;
  const retypedOk = !mustRetype || gradeWritten(retyped, feedback.expected, 'lenient');
  const proceed = () => {
    if (retypedOk) onContinue();
  };

  useKeyboardShortcuts({ Enter: proceed, Space: proceed });

  return (
    <View style={styles.stack} testID="learn-feedback">
      <Surface>
        <Text
          variant="heading"
          tone={feedback.correct ? 'success' : 'danger'}
          testID="learn-result"
        >
          {feedback.correct
            ? feedback.overridden
              ? 'Marked as correct'
              : 'Correct'
            : feedback.given === ''
              ? 'Here is the answer'
              : 'Not quite'}
        </Text>
        <Text variant="caption" tone="muted">
          {feedback.prompt}
        </Text>
        {!feedback.correct && feedback.given !== '' ? (
          <Text tone="danger">You answered: {feedback.given}</Text>
        ) : null}
        <Text variant="label" testID="learn-expected">
          {feedback.expected}
        </Text>
      </Surface>

      {mustRetype ? (
        <TextField
          label="Type the correct answer to continue"
          value={retyped}
          onChangeText={setRetyped}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={proceed}
          testID="learn-retype-input"
        />
      ) : null}

      <Button
        label="Continue"
        variant="primary"
        disabled={!retypedOk}
        testID="learn-continue"
        onPress={proceed}
      />
      {!feedback.correct && feedback.questionType === 'written' && feedback.given !== '' ? (
        <Button
          label="I was correct"
          variant="ghost"
          testID="learn-override"
          onPress={onOverride}
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Session

type LoadedProps = {
  setId: string;
  title: string;
  allCards: CardRecord[];
  saved: unknown;
  /** When set, the session covers only these cards and is not saved. */
  missedIds: string[] | null;
};

function LearnLoaded({ setId, title, allCards, saved, missedIds }: LoadedProps) {
  const repos = useRepos();
  const scopedToMissed = missedIds !== null;
  const savedLearn = scopedToMissed ? {} : readSaved(saved);

  const scope = (starred: boolean): CardRecord[] => {
    if (missedIds) return allCards.filter((card) => missedIds.includes(card.id));
    return starred ? allCards.filter((card) => card.starred) : allCards;
  };

  const [starredOnly, setStarredOnly] = useState(savedLearn.starredOnly === true);
  const [state, setState] = useState<LearnState>(() => {
    const cards = scope(savedLearn.starredOnly === true);
    const ids = cards.map((card) => card.id);
    if (isValidLearnState(savedLearn.state, ids)) return savedLearn.state;

    const stages: Record<string, Stage> = {};
    if (!scopedToMissed) for (const card of cards) stages[card.id] = toStage(card.learnStage);
    return createLearnSession(cards, DEFAULT_LEARN_CONFIG, newSeed(), stages);
  });
  const [showOptions, setShowOptions] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const cards = scope(starredOnly);
  const progress = learnProgress(state);
  const backTo = `/sets/${setId}`;

  const persist = (next: LearnState, starred: boolean) => {
    if (scopedToMissed) return;
    const value: SavedLearn = { version: 1, starredOnly: starred, state: next };
    repos.saveSession(setId, 'learn', value).catch(() => {});
  };

  const apply = (event: LearnEvent) => {
    const next = learnReducer(state, event, cards);
    if (next === state) return;
    setState(next);
    persist(next, starredOnly);

    if ((event.type === 'answer' || event.type === 'override') && next.feedback) {
      const { cardId, correct, questionType } = next.feedback;
      if (!scopedToMissed) repos.setLearnStage(cardId, next.stages[cardId]).catch(() => {});
      if (event.type === 'answer') {
        repos.logReview({ cardId, mode: 'learn', questionType, correct }).catch(() => {});
      }
    }
  };

  /** Starts a new session with different options, keeping what has been learned. */
  const reconfigure = (patch: Partial<LearnConfig>, starred = starredOnly) => {
    const config = { ...state.config, ...patch };
    // At least one question type must stay on.
    if (!config.multipleChoice && !config.trueFalse && !config.written) return;

    const nextCards = scope(starred);
    const stages: Record<string, Stage> = {};
    for (const card of nextCards) {
      stages[card.id] = state.stages[card.id] ?? (scopedToMissed ? 0 : toStage(card.learnStage));
    }
    const next = createLearnSession(nextCards, config, newSeed(), stages);
    setStarredOnly(starred);
    setState(next);
    persist(next, starred);
  };

  const resetProgress = async () => {
    setConfirmingReset(false);
    setShowOptions(false);
    if (!scopedToMissed) await repos.resetLearnProgress(setId);
    const next = createLearnSession(cards, state.config, newSeed(), {});
    setState(next);
    persist(next, starredOnly);
  };

  let body;
  if (cards.length === 0) {
    body = (
      <EmptyState
        title={starredOnly ? 'No starred cards.' : 'Nothing to learn here.'}
        body={
          starredOnly
            ? 'Star some cards in the set, or turn off “Starred only” in Options.'
            : 'Add cards to this set first.'
        }
      />
    );
  } else if (state.phase === 'question' && state.question) {
    body = (
      <QuestionView
        key={state.step}
        question={state.question}
        answerWith={state.config.answerWith}
        onAnswer={(answer) => apply({ type: 'answer', answer })}
      />
    );
  } else if (state.phase === 'feedback' && state.feedback) {
    body = (
      <FeedbackView
        key={state.step}
        state={state}
        onOverride={() => apply({ type: 'override' })}
        onContinue={() => apply({ type: 'continue' })}
      />
    );
  } else if (state.phase === 'checkpoint') {
    body = (
      <View style={styles.stack} testID="learn-checkpoint">
        <Text variant="title" center>
          Round {state.roundNumber} complete
        </Text>
        <Surface>
          <Text>New: {progress.fresh}</Text>
          <Text>Learning: {progress.familiar}</Text>
          <Text>Mastered: {progress.mastered}</Text>
        </Surface>
        <Button
          label="Keep going"
          variant="primary"
          testID="learn-next-round"
          onPress={() => apply({ type: 'nextRound' })}
        />
      </View>
    );
  } else {
    const accuracy =
      state.answered === 0 ? null : Math.round((state.correctCount / state.answered) * 100);
    body = (
      <View style={styles.stack} testID="learn-finished">
        <Text variant="title" center>
          {scopedToMissed ? 'Missed cards learned' : 'Everything mastered'}
        </Text>
        <Surface>
          <Text testID="learn-mastered-count">
            Mastered: {progress.mastered} of {progress.total}
          </Text>
          {accuracy !== null ? (
            <Text tone="muted">
              {state.answered} answers this session, {accuracy}% right.
            </Text>
          ) : null}
        </Surface>
        <Button
          label="Take a test"
          variant="primary"
          testID="learn-take-test"
          onPress={() => router.replace(`/sets/${setId}/test`)}
        />
        <Button
          label="Learn again from the start"
          testID="learn-restart"
          onPress={() => setConfirmingReset(true)}
        />
      </View>
    );
  }

  return (
    <Screen
      testID="learn-screen"
      title={scopedToMissed ? `${title}: missed cards` : title}
      backTo={backTo}
      scroll
      actions={
        <Button
          label="Options"
          variant="ghost"
          compact
          testID="learn-options-button"
          onPress={() => setShowOptions(true)}
        />
      }
    >
      <View style={styles.stack}>
        {cards.length > 0 ? (
          <View style={styles.header}>
            <View style={styles.headerLine}>
              <Text variant="caption" tone="muted" testID="learn-progress-text">
                New {progress.fresh} · Learning {progress.familiar} · Mastered {progress.mastered}
              </Text>
              {state.streak >= STREAK_THRESHOLD ? (
                <Badge label={`${state.streak} in a row`} tone="success" />
              ) : null}
            </View>
            <ProgressBar
              value={progress.total === 0 ? 0 : progress.mastered / progress.total}
              label="Cards mastered"
            />
          </View>
        ) : null}
        {body}
      </View>

      <Dialog
        visible={showOptions}
        title="Learn options"
        onClose={() => setShowOptions(false)}
        testID="learn-options-dialog"
      >
        <Segmented
          label="Answer with"
          options={[
            { value: 'definition' as const, label: 'Definition' },
            { value: 'term' as const, label: 'Term' },
          ]}
          value={state.config.answerWith}
          onChange={(answerWith) => reconfigure({ answerWith })}
          testID="learn-answer-with"
        />
        <Text variant="caption" tone="muted">
          Question types (at least one)
        </Text>
        <SwitchRow
          label="Multiple choice"
          value={state.config.multipleChoice}
          onValueChange={(multipleChoice) => reconfigure({ multipleChoice })}
          testID="learn-type-mc"
        />
        <SwitchRow
          label="True / false"
          value={state.config.trueFalse}
          onValueChange={(trueFalse) => reconfigure({ trueFalse })}
          testID="learn-type-tf"
        />
        <SwitchRow
          label="Written"
          hint="Needed to master a card by recall"
          value={state.config.written}
          onValueChange={(written) => reconfigure({ written })}
          testID="learn-type-written"
        />
        <Segmented
          label="Grading of typed answers"
          options={[
            { value: 'lenient' as const, label: 'Lenient' },
            { value: 'strict' as const, label: 'Strict' },
          ]}
          value={state.config.grading}
          onChange={(grading) => reconfigure({ grading })}
          testID="learn-grading"
        />
        <Text variant="caption" tone="muted">
          Lenient ignores accents and allows one typo per five letters.
        </Text>
        <SwitchRow
          label="Retype the answer after a miss"
          value={state.config.retypeOnMiss}
          onValueChange={(retypeOnMiss) => reconfigure({ retypeOnMiss })}
          testID="learn-retype"
        />
        {!scopedToMissed ? (
          <SwitchRow
            label="Starred only"
            value={starredOnly}
            onValueChange={(starred) => reconfigure({}, starred)}
            testID="learn-starred"
          />
        ) : null}
        <View style={styles.dialogActions}>
          <Button
            label="Reset progress"
            variant="danger"
            testID="learn-reset"
            onPress={() => setConfirmingReset(true)}
          />
          <Button
            label="Done"
            variant="primary"
            testID="learn-options-done"
            onPress={() => setShowOptions(false)}
          />
        </View>
      </Dialog>

      <ConfirmDialog
        visible={confirmingReset}
        title="Start Learn over?"
        message="Every card in this set goes back to New. Your cards are not changed."
        confirmLabel="Reset progress"
        destructive
        onConfirm={resetProgress}
        onCancel={() => setConfirmingReset(false)}
      />
    </Screen>
  );
}

export function LearnScreen() {
  const { setId, attemptId } = useLocalSearchParams<{ setId: string; attemptId?: string }>();
  const repos = useRepos();
  const backTo = `/sets/${setId}`;

  const { data, error } = useLoad(`learn:${setId}:${attemptId ?? ''}`, async () => {
    const [set, cards, saved, attempt] = await Promise.all([
      repos.getSet(setId),
      repos.listCards(setId),
      repos.loadSession(setId, 'learn'),
      attemptId ? repos.getTestAttempt(attemptId) : null,
    ]);
    const missedIds = attempt ? gradeTest(attempt.test, attempt.answers).missedCardIds : null;
    return { set, cards, saved, missedIds };
  });

  if (error) {
    return (
      <Screen title="Learn" backTo={backTo}>
        <Text tone="danger">Could not start Learn: {error.message}</Text>
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen title="Learn" backTo={backTo}>
        <Text tone="muted">Loading…</Text>
      </Screen>
    );
  }
  if (!data.set) {
    return (
      <Screen title="Learn" backTo="/">
        <EmptyState title="This set no longer exists." body="It may have been deleted." />
      </Screen>
    );
  }
  return (
    <LearnLoaded
      setId={setId}
      title={data.set.title}
      allCards={data.cards}
      saved={data.saved}
      missedIds={data.missedIds}
    />
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  header: { gap: spacing.xs },
  headerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 24,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
