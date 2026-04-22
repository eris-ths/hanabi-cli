/**
 * Mulberry32 — tiny seedable PRNG. Hanabi needs deterministic shuffles
 * so replaying a ledger from any seed reconstructs the exact same deck
 * order. A global Math.random-based shuffle would make replay impossible;
 * this PRNG is ~10 lines and passes statistical quality bars well enough
 * for shuffling a 50-card deck.
 *
 * Caller owns the state: every call to `next()` mutates `state`, and
 * serializing the current state into the ledger (alongside the shuffle
 * step) is how replay works.
 */
export class Rng {
  constructor(public state: number) {}

  static fromSeed(seed: number | string): Rng {
    if (typeof seed === 'number') return new Rng(seed >>> 0);
    // String seed → FNV-1a hash → 32-bit state. Lets users pick a
    // human-memorable seed ("eris-2026-04-22") without losing determinism.
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return new Rng(h >>> 0);
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * In-place Fisher–Yates. Returns the same array for chaining. Using
   * Fisher–Yates (rather than `.sort(() => r - 0.5)`) because the latter
   * produces a provably non-uniform distribution — a bias that would
   * quietly skew Hanabi opening hands over many replays.
   */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
    return arr;
  }
}
