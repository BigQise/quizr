/**
 * The current time, Unix ms. Screens call this from event handlers and state
 * initialisers; the study engines in src/core never read the clock themselves.
 */
export function nowMs(): number {
  return Date.now();
}
