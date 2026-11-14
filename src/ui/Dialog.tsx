import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from './Button';
import { Text } from './Text';
import { radius, spacing, useTheme } from './theme';

type DialogProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  testID?: string;
};

/**
 * A centred panel over the screen. Used for options and confirmations.
 * React Native's Alert does nothing on web, so the app never relies on it.
 */
export function Dialog({ visible, title, onClose, children, testID }: DialogProps) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          accessibilityLabel="Close"
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
          onPress={onClose}
        />
        <View
          testID={testID}
          accessibilityViewIsModal
          style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Text variant="heading">{title}</Text>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog visible={visible} title={title} onClose={onCancel} testID="confirm-dialog">
      <Text tone="muted">{message}</Text>
      <View style={styles.actions}>
        <Button label={cancelLabel} onPress={onCancel} testID="confirm-cancel" />
        <Button
          label={confirmLabel}
          variant={destructive ? 'danger' : 'primary'}
          onPress={onConfirm}
          testID="confirm-accept"
        />
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  panel: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  scroll: { flexGrow: 0 },
  content: { gap: spacing.md },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
