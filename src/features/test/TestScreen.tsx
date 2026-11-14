import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

import {
  DEFAULT_TEST_CONFIG,
  generateTest,
  gradeTest,
  type GeneratedTest,
  type TestAnswer,
  type TestConfig,
  type TestResult,
} from '@/core/test/generate';
import { useLoad, useRepos } from '@/data/ReposProvider';
import type { CardRecord } from '@/data/repos';
import { newSeed } from '@/features/flashcards/DeckStudy';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/Dialog';
import { goBack, Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { EmptyState, Segmented, Surface, SwitchRow, TextField } from '@/ui/controls';
import { spacing } from '@/ui/theme';

import { TestResults } from './TestResults';
import { TestTaking } from './TestTaking';

const DEFAULT_COUNT = 20;

type Setup = Omit<TestConfig, 'count'> & {
  countText: string;
  minutesText: string;
  starredOnly: boolean;
};

type Phase =
  | { name: 'setup' }
  | { name: 'taking'; test: GeneratedTest; endsAt: number | null }
  | { name: 'results'; result: TestResult; attemptId: string | null };

function parseCount(text: string, max: number): number | null {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) && value >= 1 && value <= max ? value : null;
}

function parseMinutes(text: string): number | null {
  if (text.trim() === '') return 0;
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) && value >= 0 && value <= 600 ? value : null;
}

type FlowProps = {
  setId: string;
  title: string;
  cards: CardRecord[];
  /** When set, the test only draws from these cards. */
  onlyIds: string[] | null;
};

function TestFlow({ setId, title, cards, onlyIds }: FlowProps) {
  const repos = useRepos();
  const backTo = `/sets/${setId}`;
  const [phase, setPhase] = useState<Phase>({ name: 'setup' });
  const [leaving, setLeaving] = useState(false);
  const [setup, setSetup] = useState<Setup>(() => ({
    trueFalse: DEFAULT_TEST_CONFIG.trueFalse,
    multipleChoice: DEFAULT_TEST_CONFIG.multipleChoice,
    matching: DEFAULT_TEST_CONFIG.matching,
    written: DEFAULT_TEST_CONFIG.written,
    answerWith: DEFAULT_TEST_CONFIG.answerWith,
    grading: DEFAULT_TEST_CONFIG.grading,
    countText: '',
    minutesText: '',
    starredOnly: false,
  }));

  const scoped = onlyIds
    ? cards.filter((card) => onlyIds.includes(card.id))
    : setup.starredOnly
      ? cards.filter((card) => card.starred)
      : cards;
  const max = scoped.length;
  const countText = setup.countText === '' ? String(Math.min(DEFAULT_COUNT, max)) : setup.countText;
  const count = parseCount(countText, max);
  const minutes = parseMinutes(setup.minutesText);
  const anyType = setup.trueFalse || setup.multipleChoice || setup.matching || setup.written;
  const taking = phase.name === 'taking';

  // Android's back button must not silently throw a test away.
  useEffect(() => {
    if (!taking) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setLeaving(true);
      return true;
    });
    return () => subscription.remove();
  }, [taking]);

  const patch = (change: Partial<Setup>) => setSetup((current) => ({ ...current, ...change }));

  const start = () => {
    if (count === null || minutes === null || !anyType) return;
    const config: TestConfig = {
      count,
      trueFalse: setup.trueFalse,
      multipleChoice: setup.multipleChoice,
      matching: setup.matching,
      written: setup.written,
      answerWith: setup.answerWith,
      grading: setup.grading,
    };
    // Wrong options are drawn from the whole set, even for a narrower test.
    const test = generateTest(scoped, config, newSeed(), cards);
    setPhase({
      name: 'taking',
      test,
      endsAt: minutes > 0 ? Date.now() + minutes * 60_000 : null,
    });
  };

  const submit = async (test: GeneratedTest, answers: TestAnswer[]) => {
    const result = gradeTest(test, answers);
    let attemptId: string | null = null;
    try {
      attemptId = await repos.saveTestAttempt(setId, {
        test,
        answers,
        earned: result.earned,
        possible: result.possible,
      });
      for (const item of result.items) {
        for (const card of item.cards) {
          repos
            .logReview({
              cardId: card.cardId,
              mode: 'test',
              questionType: item.type,
              correct: card.correct,
            })
            .catch(() => {});
        }
      }
    } catch {
      // The score is still shown; only the history entry is missing.
    }
    setPhase({ name: 'results', result, attemptId });
  };

  return (
    <Screen
      testID="test-screen"
      title={onlyIds ? `${title}: missed cards` : title}
      backTo={backTo}
      onBack={taking ? () => setLeaving(true) : undefined}
      scroll
    >
      {phase.name === 'setup' ? (
        max === 0 ? (
          <EmptyState
            title={setup.starredOnly ? 'No starred cards.' : 'No cards to test.'}
            body="Add or star some cards first."
          />
        ) : (
          <View style={styles.stack} testID="test-setup">
            <Text variant="title">Set up your test</Text>
            <TextField
              label={`Number of questions (1–${max})`}
              value={countText}
              onChangeText={(text) => patch({ countText: text })}
              keyboardType="number-pad"
              testID="test-count"
              error={count === null ? `Enter a number from 1 to ${max}.` : undefined}
            />
            <Surface>
              <Text variant="heading">Question types</Text>
              <SwitchRow
                label="True / false"
                value={setup.trueFalse}
                onValueChange={(trueFalse) => patch({ trueFalse })}
                testID="test-type-tf"
              />
              <SwitchRow
                label="Multiple choice"
                value={setup.multipleChoice}
                onValueChange={(multipleChoice) => patch({ multipleChoice })}
                testID="test-type-mc"
              />
              <SwitchRow
                label="Matching"
                value={setup.matching}
                onValueChange={(matching) => patch({ matching })}
                testID="test-type-matching"
              />
              <SwitchRow
                label="Written"
                value={setup.written}
                onValueChange={(written) => patch({ written })}
                testID="test-type-written"
              />
              {!anyType ? <Text tone="danger">Turn on at least one question type.</Text> : null}
            </Surface>
            <Segmented
              label="Answer with"
              options={[
                { value: 'definition' as const, label: 'Definition' },
                { value: 'term' as const, label: 'Term' },
              ]}
              value={setup.answerWith}
              onChange={(answerWith) => patch({ answerWith })}
              testID="test-answer-with"
            />
            <Segmented
              label="Grading of typed answers"
              options={[
                { value: 'lenient' as const, label: 'Lenient' },
                { value: 'strict' as const, label: 'Strict' },
              ]}
              value={setup.grading}
              onChange={(grading) => patch({ grading })}
              testID="test-grading"
            />
            {onlyIds ? null : (
              <SwitchRow
                label="Starred only"
                value={setup.starredOnly}
                onValueChange={(starredOnly) => patch({ starredOnly, countText: '' })}
                testID="test-starred"
              />
            )}
            <TextField
              label="Time limit in minutes (leave empty for none)"
              value={setup.minutesText}
              onChangeText={(text) => patch({ minutesText: text })}
              keyboardType="number-pad"
              testID="test-minutes"
              error={minutes === null ? 'Enter a whole number of minutes.' : undefined}
            />
            <Button
              label="Start test"
              variant="primary"
              disabled={count === null || minutes === null || !anyType}
              testID="test-start"
              onPress={start}
            />
          </View>
        )
      ) : null}

      {phase.name === 'taking' ? (
        <TestTaking
          test={phase.test}
          endsAt={phase.endsAt}
          onSubmit={(answers) => submit(phase.test, answers)}
        />
      ) : null}

      {phase.name === 'results' ? (
        <TestResults setId={setId} attemptId={phase.attemptId} result={phase.result} />
      ) : null}

      <ConfirmDialog
        visible={leaving}
        title="Leave this test?"
        message="Your answers will be thrown away."
        confirmLabel="Leave"
        cancelLabel="Stay"
        destructive
        onConfirm={() => {
          setLeaving(false);
          goBack(backTo);
        }}
        onCancel={() => setLeaving(false)}
      />
    </Screen>
  );
}

export function TestScreen() {
  const { setId, attemptId, retest } = useLocalSearchParams<{
    setId: string;
    attemptId?: string;
    retest?: string;
  }>();
  const repos = useRepos();
  const backTo = `/sets/${setId}`;

  const { data, error } = useLoad(`test:${setId}:${attemptId ?? ''}:${retest ?? ''}`, async () => {
    const [set, cards, viewed, source] = await Promise.all([
      repos.getSet(setId),
      repos.listCards(setId),
      attemptId ? repos.getTestAttempt(attemptId) : null,
      retest ? repos.getTestAttempt(retest) : null,
    ]);
    return {
      set,
      cards,
      viewed: viewed ? { id: viewed.id, result: gradeTest(viewed.test, viewed.answers) } : null,
      onlyIds: source ? gradeTest(source.test, source.answers).missedCardIds : null,
    };
  });

  if (error) {
    return (
      <Screen title="Test" backTo={backTo}>
        <Text tone="danger">Could not open the test: {error.message}</Text>
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen title="Test" backTo={backTo}>
        <Text tone="muted">Loading…</Text>
      </Screen>
    );
  }
  if (!data.set) {
    return (
      <Screen title="Test" backTo="/">
        <EmptyState title="This set no longer exists." body="It may have been deleted." />
      </Screen>
    );
  }
  if (attemptId) {
    return (
      <Screen testID="test-screen" title={data.set.title} backTo={backTo} scroll>
        {data.viewed ? (
          <TestResults setId={setId} attemptId={data.viewed.id} result={data.viewed.result} />
        ) : (
          <EmptyState title="This test result is gone." body="It may have been deleted." />
        )}
      </Screen>
    );
  }
  return (
    <TestFlow
      key={retest ?? 'new'}
      setId={setId}
      title={data.set.title}
      cards={data.cards}
      onlyIds={data.onlyIds}
    />
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
});
