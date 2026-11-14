import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';

import { Text } from '@/ui/Text';
import { radius, spacing, useTheme } from '@/ui/theme';

const SWIPE_DISTANCE = 60;
const FLIP_MS = 280;
const FADE_MS = 120;

/** Follows the system "reduce motion" setting. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

type FlipCardProps = {
  front: string;
  back: string;
  frontLabel: string;
  backLabel: string;
  flipped: boolean;
  onFlip: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
};

/**
 * One flashcard. Tap to flip; swipe left or right for whatever the screen
 * assigns to those directions. The flip is a 3D turn, or a quick cross-fade
 * when the system asks for reduced motion.
 *
 * Give it a `key` per card so a new card starts front side up without a flip.
 */
export function FlipCard({
  front,
  back,
  frontLabel,
  backLabel,
  flipped,
  onFlip,
  onSwipeLeft,
  onSwipeRight,
}: FlipCardProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(flipped ? 1 : 0));
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: flipped ? 1 : 0,
      duration: reducedMotion ? FADE_MS : FLIP_MS,
      // The native driver keeps the animation off the JavaScript thread.
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [flipped, progress, reducedMotion]);

  // Swipes use the responder system directly. The card only claims a touch
  // once it is clearly a horizontal drag, so taps and vertical scrolls pass
  // through to the content.
  const rememberStart = (event: GestureResponderEvent) => {
    touchStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
    return false;
  };

  const isHorizontalDrag = (event: GestureResponderEvent) => {
    const start = touchStart.current;
    if (!start) return false;
    const dx = Math.abs(event.nativeEvent.pageX - start.x);
    const dy = Math.abs(event.nativeEvent.pageY - start.y);
    return dx > 12 && dx > dy * 1.5;
  };

  const finishSwipe = (event: GestureResponderEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const dx = event.nativeEvent.pageX - start.x;
    if (dx > SWIPE_DISTANCE) onSwipeRight?.();
    else if (dx < -SWIPE_DISTANCE) onSwipeLeft?.();
  };

  const cancelSwipe = () => {
    touchStart.current = null;
  };

  // Each face is switched off at the halfway point of the turn. Relying on
  // backfaceVisibility alone is not enough: on web the far face shows through
  // mirrored, and Android has similar problems.
  const frontOpacity = progress.interpolate({
    inputRange: [0, 0.5, 0.501, 1],
    outputRange: [1, 1, 0, 0],
  });
  const backOpacity = progress.interpolate({
    inputRange: [0, 0.5, 0.501, 1],
    outputRange: [0, 0, 1, 1],
  });

  const frontStyle = reducedMotion
    ? { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }
    : {
        opacity: frontOpacity,
        transform: [
          { perspective: 1200 },
          {
            rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }),
          },
        ],
      };
  const backStyle = reducedMotion
    ? { opacity: progress }
    : {
        opacity: backOpacity,
        transform: [
          { perspective: 1200 },
          {
            rotateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: ['180deg', '360deg'],
            }),
          },
        ],
      };

  const face = (label: string, text: string, testID: string) => (
    <View style={[styles.faceInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <ScrollView contentContainerStyle={styles.faceText}>
        <Text variant="display" center testID={testID}>
          {text}
        </Text>
      </ScrollView>
    </View>
  );

  return (
    <View
      style={styles.root}
      onStartShouldSetResponderCapture={rememberStart}
      onMoveShouldSetResponderCapture={isHorizontalDrag}
      onResponderRelease={finishSwipe}
      onResponderTerminate={cancelSwipe}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${flipped ? backLabel : frontLabel}: ${flipped ? back : front}`}
        accessibilityHint="Flips the card"
        testID="flashcard"
        onPress={onFlip}
        style={styles.fill}
      >
        <Animated.View
          pointerEvents={flipped ? 'none' : 'auto'}
          style={[styles.face, frontStyle]}
          accessibilityElementsHidden={flipped}
          importantForAccessibility={flipped ? 'no-hide-descendants' : 'auto'}
        >
          {face(frontLabel, front, 'flashcard-front')}
        </Animated.View>
        <Animated.View
          pointerEvents={flipped ? 'auto' : 'none'}
          style={[styles.face, backStyle]}
          accessibilityElementsHidden={!flipped}
          importantForAccessibility={flipped ? 'auto' : 'no-hide-descendants'}
        >
          {face(backLabel, back, 'flashcard-back')}
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 220, maxHeight: 520, width: '100%' },
  fill: { flex: 1 },
  face: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backfaceVisibility: 'hidden',
  },
  faceInner: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  faceText: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
});
