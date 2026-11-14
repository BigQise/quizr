import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * Keyboard shortcuts for the web build (which is also what a tablet with a
 * keyboard uses in the browser). Keys are `KeyboardEvent.key` values, with
 * 'Space' for the space bar. Ignored while typing in a text field.
 *
 * Native builds have no global key events without an extra native module, so
 * this does nothing there.
 */
export function useKeyboardShortcuts(shortcuts: Record<string, () => void>, enabled = true) {
  const latest = useRef(shortcuts);

  useEffect(() => {
    latest.current = shortcuts;
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key === ' ' ? 'Space' : event.key;
      const handler = latest.current[key];
      if (handler) {
        event.preventDefault();
        handler();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
