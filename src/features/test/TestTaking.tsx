import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  countUnanswered,
  testSize,
  type GeneratedTest,
  type MatchingItem,
  type TestAnswer,
  type TestItem,
} from '@/core/test/generate';
import { Button } from '@/ui/Button';
import { nowMs } from '@/ui/clock';
import { ConfirmDialog, Dialog } from '@/ui/Dialog';
import { Text } from '@/ui/Text';
import { Surface, TextField } from '@/ui/controls';
import { spacing } from '@/ui/theme';

import { TYPE_LABELS } from './TestResults';

function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function MatchingQuestion({
  item,
  itemIndex,
  answer,
  onChange,
}: {
  item: MatchingItem;
  itemIndex: number;
  answer: (number | null)[];
  onChange: (answer: (number | null)[]) => void;
}) {
  const [choosingFor, setChoosingFor] = useState<number | null>(null);

  const choose = (optionIndex: number | null) => {
    if (choosingFor === null) return;
    const next = item.pairs.map((_, pair) => answer[pair] ?? null);
    next[choosingFor] = optionIndex;
    onChange(next);
    setChoosingFor(null);
  };

  return (
    <View style={styles.stack}>
      {item.pairs.map((pair, pairIndex) => {
        const chosen = answer[pairIndex];
        return (
          <View key={pair.cardId} style={styles.pair}>
            <Text
              variant="label"
              style={styles.pairPrompt}
              testID={`match-prompt-${itemIndex}-${pairIndex}`}
            >
              {pair.prompt}
            </Text>
            <Button
              label={typeof chosen === 'number' ? item.options[chosen] : 'Choose…'}
              accessibilityLabel={`Answer for ${pair.prompt}: ${typeof chosen === 'number' ? item.options[chosen] : 'not chosen'}`}
              selected={typeof chosen === 'number'}
              testID={`match-${itemIndex}-${pairIndex}`}
              style={styles.pairAnswer}
              onPress={() => setChoosingFor(pairIndex)}
            />
          </View>
        );
      })}

      <Dialog
        visible={choosingFor !== null}
        title={choosingFor === null ? '' : item.pairs[choosingFor].prompt}
        onClose={() => setChoosingFor(null)}
        testID="match-dialog"
      >
        {item.options.map((option, optionIndex) => (
          <Button
            key={optionIndex}
            label={option}
            testID={`match-option-${optionIndex}`}
            onPress={() => choose(optionIndex)}
          />
        ))}
        <Button label="Clear" variant="ghost" onPress={() => choose(null)} />
      </Dialog>
    </View>
  );
}

function ItemView({
  item,
  index,
  answer,
  onChange,
}: {
  item: TestItem;
  index: number;
  answer: TestAnswer;
  onChange: (answer: TestAnswer) => void;
}) {
  switch (item.type) {
    case 'trueFalse':
      return (
        <View style={styles.stack}>
          <Text variant="label" testID={`test-prompt-${index}`}>
            {item.prompt}
          </Text>
          <Text testID={`test-shown-${index}`}>{item.shownAnswer}</Text>
          <View style={styles.row}>
            <Button
              label="True"
              selected={answer === true}
              style={styles.grow}
              testID={`test-true-${index}`}
              onPress={() => onChange(true)}
            />
            <Button
              label="False"
              selected={answer === false}
              style={styles.grow}
              testID={`test-false-${index}`}
              onPress={() => onChange(false)}
            />
          </View>
        </View>
      );
    case 'multipleChoice':
      return (
        <View style={styles.stack}>
          <Text variant="label" testID={`test-prompt-${index}`}>
            {item.prompt}
          </Text>
          {item.options.map((option, optionIndex) => (
            <Button
              key={optionIndex}
              label={option}
              selected={answer === optionIndex}
              testID={`test-option-${index}-${optionIndex}`}
              onPress={() => onChange(optionIndex)}
            />
          ))}
        </View>
      );
    case 'written':
      return (
        <View style={styles.stack}>
          <Text variant="label" testID={`test-prompt-${index}`}>
            {item.prompt}
          </Text>
          <TextField
            label="Your answer"
            value={typeof answer === 'string' ? answer : ''}
            onChangeText={onChange}
            autoCapitalize="none"
            autoCorrect={false}
            testID={`test-written-${index}`}
          />
        </View>
      );
    case 'matching':
      return (
        <MatchingQuestion
          item={item}
          itemIndex={index}
          answer={Array.isArray(answer) ? answer : []}
          onChange={onChange}
        />
      );
  }
}

type TestTakingProps = {
  test: GeneratedTest;
  /** When the timer runs out, as Unix ms. null for an untimed test. */
  endsAt: number | null;
  onSubmit: (answers: TestAnswer[]) => void;
};

export function TestTaking({ test, endsAt, onSubmit }: TestTakingProps) {
  const [answers, setAnswers] = useState<TestAnswer[]>(() => test.items.map(() => null));
  const [now, setNow] = useState(() => nowMs());
  const [confirming, setConfirming] = useState(false);

  const remaining = endsAt === null ? null : endsAt - now;
  const expired = remaining !== null && remaining <= 0;

  useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => setNow(nowMs()), 500);
    return () => clearInterval(timer);
  }, [endsAt]);

  // Time is up: hand in whatever has been answered.
  useEffect(() => {
    if (expired) onSubmit(answers);
    // Only the moment of expiry matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  const unanswered = countUnanswered(test, answers);
  const total = testSize(test);

  const setAnswer = (index: number, answer: TestAnswer) => {
    setAnswers((current) => current.map((value, i) => (i === index ? answer : value)));
  };

  const submit = () => {
    if (unanswered > 0) setConfirming(true);
    else onSubmit(answers);
  };

  // The first question number of each item; a matching block spans several.
  const firstNumbers: number[] = [];
  let counter = 1;
  for (const item of test.items) {
    firstNumbers.push(counter);
    counter += item.type === 'matching' ? item.pairs.length : 1;
  }

  return (
    <View style={styles.stack} testID="test-taking">
      <View style={styles.status}>
        <Text variant="caption" tone="muted" testID="test-answered">
          {total - unanswered} of {total} answered
        </Text>
        {remaining !== null ? (
          <Text
            variant="label"
            tone={remaining < 60_000 ? 'danger' : 'default'}
            testID="test-timer"
          >
            {formatClock(remaining)}
          </Text>
        ) : null}
      </View>

      {test.items.map((item, index) => {
        const first = firstNumbers[index];
        const last = first + (item.type === 'matching' ? item.pairs.length : 1) - 1;
        const label =
          item.type === 'matching' && item.pairs.length > 1 ? `${first}–${last}` : String(first);
        return (
          <Surface key={index} testID={`test-item-${index}`}>
            <Text variant="caption" tone="muted">
              {label} · {TYPE_LABELS[item.type]}
            </Text>
            <ItemView
              item={item}
              index={index}
              answer={answers[index]}
              onChange={(answer) => setAnswer(index, answer)}
            />
          </Surface>
        );
      })}

      <Button label="Submit test" variant="primary" testID="test-submit" onPress={submit} />

      <ConfirmDialog
        visible={confirming}
        title="Submit with unanswered questions?"
        message={
          unanswered === 1
            ? '1 question has no answer and will be marked wrong.'
            : `${unanswered} questions have no answer and will be marked wrong.`
        }
        confirmLabel="Submit anyway"
        cancelLabel="Keep working"
        onConfirm={() => {
          setConfirming(false);
          onSubmit(answers);
        }}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  status: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pair: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  pairPrompt: { flex: 1, minWidth: 120 },
  pairAnswer: { flex: 1, minWidth: 140 },
});
