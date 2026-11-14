import { useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { useLoad, useRepos } from '@/data/ReposProvider';
import { DEFAULT_NEW_CARDS_PER_DAY, SETTING_NEW_CARDS_PER_DAY } from '@/data/repos';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/Dialog';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { Surface, TextField } from '@/ui/controls';
import { spacing } from '@/ui/theme';

import { largeSample, SAMPLE_SPANISH } from './sampleData';

function downloadOnWeb(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

type Notice = { tone: 'success' | 'danger'; text: string };

function SettingsForm({ initialLimit }: { initialLimit: string }) {
  const repos = useRepos();
  const [limit, setLimit] = useState(initialLimit);
  const [backupText, setBackupText] = useState('');
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const [notice, setNotice] = useState<Notice>();

  const parsedLimit = Number.parseInt(limit, 10);
  const limitValid = Number.isFinite(parsedLimit) && parsedLimit >= 0 && parsedLimit <= 9999;

  const fail = (reason: unknown) =>
    setNotice({ tone: 'danger', text: reason instanceof Error ? reason.message : String(reason) });

  const saveLimit = async () => {
    if (!limitValid) return;
    await repos.setSetting(SETTING_NEW_CARDS_PER_DAY, String(parsedLimit));
    setNotice({ tone: 'success', text: 'Saved.' });
  };

  const exportBackup = async () => {
    try {
      const json = JSON.stringify(await repos.exportBackup());
      const filename = `quizr-backup-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === 'web') downloadOnWeb(filename, json);
      else await Share.share({ title: filename, message: json });
      setNotice({ tone: 'success', text: 'Backup created.' });
    } catch (reason) {
      fail(reason);
    }
  };

  const restore = async () => {
    setConfirmingRestore(false);
    try {
      await repos.importBackup(JSON.parse(backupText));
      setBackupText('');
      setNotice({ tone: 'success', text: 'Backup restored.' });
    } catch (reason) {
      fail(
        reason instanceof SyntaxError
          ? new Error('That text is not valid JSON. Paste the whole backup file.')
          : reason,
      );
    }
  };

  const addSample = async (title: string, cards: typeof SAMPLE_SPANISH) => {
    try {
      const setId = await repos.createSet({ title, description: 'Sample data' });
      await repos.importCards(setId, cards);
      setNotice({ tone: 'success', text: `Added “${title}”.` });
    } catch (reason) {
      fail(reason);
    }
  };

  return (
    <View style={styles.stack}>
      {notice ? (
        <Text tone={notice.tone} testID="settings-notice">
          {notice.text}
        </Text>
      ) : null}

      <Surface>
        <Text variant="heading">Spaced repetition</Text>
        <TextField
          label="New cards per day"
          value={limit}
          onChangeText={setLimit}
          keyboardType="number-pad"
          testID="new-cards-per-day"
          error={limitValid ? undefined : 'Enter a number from 0 to 9999.'}
        />
        <Text variant="caption" tone="muted">
          How many cards you have not studied before are introduced each day, across all sets.
          Reviews of cards you have already studied are never limited.
        </Text>
        <Button
          label="Save"
          variant="primary"
          disabled={!limitValid}
          testID="save-new-cards"
          onPress={saveLimit}
        />
      </Surface>

      <Surface>
        <Text variant="heading">Backup</Text>
        <Text tone="muted">
          Everything is stored on this device only. A backup file holds all your sets, cards, and
          study progress.
        </Text>
        <Button label="Export backup" testID="export-backup" onPress={exportBackup} />
        <TextField
          label="Restore: paste the contents of a backup file"
          value={backupText}
          onChangeText={setBackupText}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          testID="restore-text"
        />
        <Button
          label="Restore from backup"
          variant="danger"
          disabled={backupText.trim() === ''}
          testID="restore-backup"
          onPress={() => setConfirmingRestore(true)}
        />
      </Surface>

      {__DEV__ ? (
        <Surface>
          <Text variant="heading">Development</Text>
          <Button
            label="Add a 20-card sample set"
            testID="seed-small"
            onPress={() => addSample('Sample: Spanish basics', SAMPLE_SPANISH)}
          />
          <Button
            label="Add a 5,000-card sample set"
            testID="seed-large"
            onPress={() => addSample('Sample: 5,000 cards', largeSample(5000))}
          />
        </Surface>
      ) : null}

      <ConfirmDialog
        visible={confirmingRestore}
        title="Replace everything with this backup?"
        message="All sets, cards, and progress on this device will be replaced by the backup. This cannot be undone."
        confirmLabel="Replace my data"
        destructive
        onConfirm={restore}
        onCancel={() => setConfirmingRestore(false)}
      />
    </View>
  );
}

export function SettingsScreen() {
  const repos = useRepos();
  const { data, error } = useLoad('settings', async () => ({
    limit: (await repos.getSetting(SETTING_NEW_CARDS_PER_DAY)) ?? String(DEFAULT_NEW_CARDS_PER_DAY),
  }));

  return (
    <Screen testID="settings-screen" title="Settings" backTo="/" scroll>
      {error ? (
        <Text tone="danger">Could not load settings: {error.message}</Text>
      ) : !data ? (
        <Text tone="muted">Loading…</Text>
      ) : (
        <SettingsForm initialLimit={data.limit} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
});
