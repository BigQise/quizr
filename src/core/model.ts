/** The two faces of a card. */
export type Side = 'term' | 'definition';

/** What the study engines need to know about a card. */
export type StudyCard = {
  id: string;
  term: string;
  definition: string;
  starred: boolean;
};

export function textOn(card: StudyCard, side: Side): string {
  return side === 'term' ? card.term : card.definition;
}

export function otherSide(side: Side): Side {
  return side === 'term' ? 'definition' : 'term';
}
