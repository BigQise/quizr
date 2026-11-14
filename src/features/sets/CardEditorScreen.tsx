import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useLoad, useRepos } from '@/data/ReposProvider';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/Dialog';
import { goBack, Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/controls';
import { spacing } from '@/ui/theme';

type FormProps = {
  setId: string;
  cardId?: string;
  initialTerm: string;
  initialDefinition: string;
};

function CardForm({ setId, cardId, initialTerm, initialDefinition }: FormProps) {
  const repos = useRepos();
  const backTo = `/sets/${setId}`;
  const [term, setTerm] = useState(initialTerm);
  const [definition, setDefinition] = useState(initialDefinition);
  const [error, setError] = useState<string>();
  const [added, setAdded] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const save = async (addAnother: boolean) => {
    const input = { term: term.trim(), definition: definition.trim() };
    if (input.term === '' || input.definition === '') {
      setError('A card needs both a term and a definition.');
      return;
    }
    if (cardId) await repos.updateCard(cardId, input);
    else await repos.addCard(setId, input);

    if (addAnother) {
      setTerm('');
      setDefinition('');
      setError(undefined);
      setAdded((count) => count + 1);
    } else {
      goBack(backTo);
    }
  };

  const remove = async () => {
    if (cardId) await repos.deleteCard(cardId);
    setConfirmingDelete(false);
    goBack(backTo);
  };

  return (
    <View style={styles.form}>
      <TextField
        label="Term"
        value={term}
        onChangeText={setTerm}
        multiline
        autoFocus
        testID="card-term-input"
      />
      <TextField
        label="Definition"
        value={definition}
        onChangeText={setDefinition}
        multiline
        testID="card-definition-input"
        error={error}
      />
      <Text variant="caption" tone="muted">
        Tip: separate alternative answers with “/” or “;”. Text in brackets is optional when typing
        an answer.
      </Text>
      <Button label="Save" variant="primary" testID="save-card" onPress={() => save(false)} />
      {cardId ? (
        <Button
          label="Delete card"
          variant="danger"
          testID="delete-card"
          onPress={() => setConfirmingDelete(true)}
        />
      ) : (
        <Button label="Save and add another" testID="save-card-add" onPress={() => save(true)} />
      )}
      {added > 0 ? (
        <Text variant="caption" tone="success" testID="cards-added">
          {added === 1 ? '1 card added.' : `${added} cards added.`}
        </Text>
      ) : null}

      <ConfirmDialog
        visible={confirmingDelete}
        title="Delete this card?"
        message="The card and its study progress will be removed."
        confirmLabel="Delete card"
        destructive
        onConfirm={remove}
        onCancel={() => setConfirmingDelete(false)}
      />
    </View>
  );
}

export function CardEditorScreen() {
  const { setId, cardId } = useLocalSearchParams<{ setId: string; cardId?: string }>();
  const repos = useRepos();
  const { data: card, loading } = useLoad(`card:${cardId ?? 'new'}`, async () =>
    cardId ? repos.getCard(cardId) : null,
  );

  return (
    <Screen
      testID="card-editor"
      title={cardId ? 'Edit card' : 'New card'}
      backTo={`/sets/${setId}`}
      scroll
    >
      {loading ? (
        <Text tone="muted">Loading…</Text>
      ) : cardId && !card ? (
        <Text tone="muted">This card no longer exists.</Text>
      ) : (
        <CardForm
          setId={setId}
          cardId={cardId}
          initialTerm={card?.term ?? ''}
          initialDefinition={card?.definition ?? ''}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
});
