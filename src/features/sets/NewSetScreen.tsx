import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useRepos } from '@/data/ReposProvider';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/controls';
import { spacing } from '@/ui/theme';

export function NewSetScreen() {
  const repos = useRepos();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const create = async () => {
    if (title.trim() === '') {
      setError('Give the set a title.');
      return;
    }
    setSaving(true);
    try {
      const id = await repos.createSet({ title: title.trim(), description: description.trim() });
      router.replace(`/sets/${id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setSaving(false);
    }
  };

  return (
    <Screen testID="new-set-screen" title="New set" backTo="/" scroll>
      <View style={styles.form}>
        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="Spanish: unit 3"
          autoFocus
          testID="set-title-input"
          error={error}
          returnKeyType="next"
        />
        <TextField
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          testID="set-description-input"
        />
        <Button
          label="Create set"
          variant="primary"
          disabled={saving}
          onPress={create}
          testID="create-set"
        />
        <Text variant="caption" tone="muted">
          You can add cards one at a time or paste a whole list on the next screen.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
});
