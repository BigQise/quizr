import { useWindowDimensions } from 'react-native';

/**
 * Window width classes. Read from the window, not the device, so rotation,
 * split-screen, and a resized browser all land in the right layout.
 */
export type WidthClass = 'compact' | 'medium' | 'expanded';

export const MEDIUM_MIN_WIDTH = 600;
export const EXPANDED_MIN_WIDTH = 840;

/** Widest a single column of reading content should grow. */
export const MAX_CONTENT_WIDTH = 720;

export function widthClassFor(width: number): WidthClass {
  if (width >= EXPANDED_MIN_WIDTH) return 'expanded';
  if (width >= MEDIUM_MIN_WIDTH) return 'medium';
  return 'compact';
}

export function useWidthClass(): WidthClass {
  const { width } = useWindowDimensions();
  return widthClassFor(width);
}
