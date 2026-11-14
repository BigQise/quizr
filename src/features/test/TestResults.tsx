import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import type { TestItemType, TestResult } from '@/core/test/generate';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { Surface } from '@/ui/controls';
import { spacing, useTheme } from '@/ui/theme';

export const TYPE_LABELS: Record<TestItemType, string> = {
  trueFalse: 'True / false',
  multipleChoice: 'Multiple choice',
  matching: 'Matching',
  written: 'Written',
};

type TestResultsProps = {
  setId: string;
  attemptId: string | null;
  result: TestResult;
};

export function TestResults({ setId, attemptId, result }: TestResultsProps) {
  const theme = useTheme();
  const missed = result.missedCardIds.length;
  const types = (Object.keys(TYPE_LABELS) as TestItemType[]).filter(
    (type) => result.byType[type].possible > 0,
  );
  const rows = result.items.flatMap((item) => item.cards.map((card) => ({ item, card })));

  return (
    <View style={styles.stack} testID="test-results">
      <Surface style={styles.score}>
        <Text variant="title" center testID="test-score">
          {result.percent}%
        </Text>
        <Text tone="muted" center testID="test-score-detail">
          {result.earned} of {result.possible} correct
        </Text>
      </Surface>

      <Surface testID="test-breakdown">
        <Text variant="heading">By question type</Text>
        {types.map((type) => (
          <View key={type} style={styles.line}>
            <Text>{TYPE_LABELS[type]}</Text>
            <Text tone="muted">
              {result.byType[type].earned} / {result.byType[type].possible}
            </Text>
          </View>
        ))}
      </Surface>

      <View style={styles.actions}>
        {missed > 0 && attemptId ? (
          <>
            <Button
              label={`Retest missed (${missed})`}
              variant="primary"
              testID="retest-missed"
              style={styles.action}
              onPress={() => router.replace(`/sets/${setId}/test?retest=${attemptId}`)}
            />
            <Button
              label="Learn missed"
              testID="learn-missed"
              style={styles.action}
              onPress={() => router.replace(`/sets/${setId}/learn?attemptId=${attemptId}`)}
            />
          </>
        ) : null}
        <Button
          label="New test"
          testID="new-test"
          style={styles.action}
          onPress={() => router.replace(`/sets/${setId}/test`)}
        />
      </View>

      <Text variant="heading">Your answers</Text>
      {rows.map(({ item, card }, index) => (
        <Surface
          key={`${card.cardId}-${index}`}
          testID={card.correct ? 'result-correct' : 'result-wrong'}
          style={{ borderColor: card.correct ? theme.success : theme.danger, borderWidth: 1 }}
        >
          <Text variant="caption" tone={card.correct ? 'success' : 'danger'}>
            {index + 1}. {card.correct ? 'Correct' : 'Incorrect'} · {TYPE_LABELS[item.type]}
          </Text>
          <Text variant="label">{card.prompt}</Text>
          {card.correct ? null : (
            <Text tone="danger">
              {card.given === '' ? 'No answer' : `You answered: ${card.given}`}
            </Text>
          )}
          <Text tone={card.correct ? 'default' : 'success'}>
            {card.correct ? card.expected : `Answer: ${card.expected}`}
          </Text>
        </Surface>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  score: { alignItems: 'center' },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { flexGrow: 1 },
});
