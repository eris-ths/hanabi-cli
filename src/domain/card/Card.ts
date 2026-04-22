import { DomainError } from '../shared/DomainError.js';

/**
 * Hanabi's five firework colors. Using a literal union (not an enum)
 * so serialization to YAML is just the string — no mapping layer.
 */
export const COLORS = ['red', 'yellow', 'green', 'blue', 'white'] as const;
export type Color = (typeof COLORS)[number];

export function isColor(s: string): s is Color {
  return (COLORS as readonly string[]).includes(s);
}

/**
 * Card rank. Hanabi ranks are 1–5 only; no face cards. Exposed as a
 * branded number so a bare `3` can't be mistakenly passed where a rank
 * is expected (the branding is compile-time only — runtime is a plain
 * number to keep YAML serialization trivial).
 */
export type Rank = 1 | 2 | 3 | 4 | 5;

export function isRank(n: number): n is Rank {
  return n === 1 || n === 2 || n === 3 || n === 4 || n === 5;
}

/**
 * A Hanabi card is a (color, rank) pair. Identity matters only for
 * counting duplicates in the deck; two red-3s are interchangeable in
 * play, so Card is a value object, not an entity.
 */
export interface Card {
  readonly color: Color;
  readonly rank: Rank;
}

export function makeCard(color: Color, rank: Rank): Card {
  if (!isColor(color)) throw new DomainError(`invalid color: ${color}`, 'color');
  if (!isRank(rank)) throw new DomainError(`invalid rank: ${rank}`, 'rank');
  return { color, rank };
}

/**
 * Rank distribution per color in a standard Hanabi deck:
 *   three 1s, two 2s, two 3s, two 4s, one 5
 * This gives 10 cards per color × 5 colors = 50 cards total.
 *
 * The asymmetric distribution is what makes Hanabi tense: only one 5
 * of each color exists, so discarding a 5 locks that color at 4 points
 * forever. The domain encodes this invariant as data rather than logic
 * so rules engines can read it declaratively.
 */
export const RANK_COPIES: Record<Rank, number> = {
  1: 3,
  2: 2,
  3: 2,
  4: 2,
  5: 1,
};

export function buildStandardDeck(): Card[] {
  const deck: Card[] = [];
  for (const color of COLORS) {
    for (const rank of [1, 2, 3, 4, 5] as const) {
      const copies = RANK_COPIES[rank];
      for (let i = 0; i < copies; i++) {
        deck.push({ color, rank });
      }
    }
  }
  return deck;
}

export function cardToString(c: Card): string {
  // Single-letter color + digit. Compact enough for CLI lists like
  // "R3 Y1 W5 B2". Matches the notation in most Hanabi literature.
  const colorChar = c.color[0]!.toUpperCase();
  return `${colorChar}${c.rank}`;
}
