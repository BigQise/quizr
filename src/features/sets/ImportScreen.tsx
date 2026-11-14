import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { guessDelimiter, parseImport, type ImportDelimiter } from '@/core/importParse';
import { useRepos } from '@/data/ReposProvider';
import { Button } from '@/ui/Button';
import { goBack, Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { Segmented, Surface, TextField } from '@/ui/controls';
import { spacing } from '@/ui/theme';

import { cardCountLabel } from './LibraryScreen';

const DELIMITER_OPTIONS: { value: ImportDelimiter; label: string }[] = [
  { value: 'tab', label: 'Tab' },
  { value: 'comma', label: 'Comma' },
  { value: 'semicolon', label: 'Semicolon' },
  { value: 'dash', label: 'Dash' },
];

const PREVIEW_ROWS = 5;

export function ImportScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const repos = useRepos();
  const [text, setText] = useState('');
  /** null until the learner picks one; until then it is guessed from the text. */
  const [chosen, setChosen] = useState<ImportDelimiter | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string>();

  const delimiter = chosen ?? guessDelimiter(text);
  const { pairs, skippedLines } = parseImport(text, delimiter);

  const runImport = async () => {
    setImporting(true);
    try {
      await repos.importCards(setId, pairs);
      goBack(`/sets/${setId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setImporting(false);
    }
  };

  return (
    <Screen testID="import-screen" title="Import cards" backTo={`/sets/${setId}`} scroll>
      <View style={styles.form}>
        <Text tone="muted">
          Paste one card per line, with the term and the definition separated by a tab, comma,
          semicolon, or “ - ”. Copying two columns from a spreadsheet works as is.
        </Text>
        <TextField
          label="Cards"
          value={text}
          onChangeText={setText}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={'hola\thello\nadiós\tgoodbye'}
          testID="import-text"
        />
        <Segmented
          label="Separator between term and definition"
          options={DELIMITER_OPTIONS}
          value={delimiter}
          onChange={setChosen}
          testID="import-delimiter"
        />

        <Surface testID="import-preview">
          <Text variant="heading" testID="import-count">
            {pairs.length === 0 ? 'Nothing to import yet' : `${cardCountLabel(pairs.length)} ready`}
          </Text>
          {pairs.slice(0, PREVIEW_ROWS).map((pair, index) => (
            <View key={index} style={styles.previewRow}>
              <Text variant="label" style={styles.previewCell} numberOfLines={2}>
                {pair.term}
              </Text>
              <Text tone="muted" style={styles.previewCell} numberOfLines={2}>
                {pair.definition}
              </Text>
            </View>
          ))}
          {pairs.length > PREVIEW_ROWS ? (
            <Text variant="caption" tone="muted">
              …and {pairs.length - PREVIEW_ROWS} more
            </Text>
          ) : null}
          {skippedLines.length > 0 ? (
            <Text variant="caption" tone="danger" testID="import-skipped">
              {skippedLines.length === 1 ? '1 line' : `${skippedLines.length} lines`} could not be
              read and will be skipped (line {skippedLines.slice(0, 8).join(', ')}
              {skippedLines.length > 8 ? '…' : ''}).
            </Text>
          ) : null}
        </Surface>

        {error ? <Text tone="danger">{error}</Text> : null}
        <Button
          label={pairs.length === 0 ? 'Import' : `Import ${cardCountLabel(pairs.length)}`}
          variant="primary"
          disabled={pairs.length === 0 || importing}
          testID="import-submit"
          onPress={runImport}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  previewRow: { flexDirection: 'row', gap: spacing.md },
  previewCell: { flex: 1 },
});
