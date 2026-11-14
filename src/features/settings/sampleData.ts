import type { CardInput } from '@/data/repos';

/** Development-only sample content for trying the app and measuring performance. */
export const SAMPLE_SPANISH: CardInput[] = [
  ['el perro', 'the dog'],
  ['el gato', 'the cat'],
  ['la casa', 'the house'],
  ['el libro', 'the book'],
  ['la mesa', 'the table'],
  ['la silla', 'the chair'],
  ['el agua', 'the water'],
  ['el pan', 'the bread'],
  ['la manzana', 'the apple'],
  ['la ciudad', 'the city'],
  ['el coche', 'the car'],
  ['la escuela', 'the school'],
  ['el amigo', 'the friend'],
  ['la ventana', 'the window'],
  ['la puerta', 'the door'],
  ['el sol', 'the sun'],
  ['la luna', 'the moon'],
  ['el árbol', 'the tree'],
  ['la playa', 'the beach'],
  ['el tiempo', 'the weather / the time'],
].map(([term, definition]) => ({ term, definition }));

export function largeSample(count: number): CardInput[] {
  return Array.from({ length: count }, (_, index) => ({
    term: `Item ${index + 1}`,
    definition: `Meaning of item ${index + 1}`,
  }));
}
