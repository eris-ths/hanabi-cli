import { Card, Color, COLORS, Rank, buildStandardDeck } from '../card/Card.js';
import { Rng } from '../shared/Rng.js';
import { DomainError } from '../shared/DomainError.js';

/**
 * GameState is the aggregate root for one Hanabi session. Every
 * mutation goes through one of the action methods (play / discard /
 * informColor / informRank), which append a MoveLogEntry to `log`
 * and update the derived state fields in lock-step. This mirrors
 * guild-cli's Request aggregate: state + status_log, mutations go
 * through the aggregate to preserve invariants.
 *
 * Hidden information: `hands[playerIdx]` contains the raw cards each
 * player holds, BUT the CLI's `show --as <player>` view zeros out
 * that player's own hand before rendering. The ledger itself records
 * the ground truth (so replay and post-mortem analysis work); the
 * lense is applied only at the interface boundary.
 */

export type MoveKind = 'play' | 'discard' | 'inform_color' | 'inform_rank';

export interface MoveLogEntry {
  readonly turn: number;
  readonly by: string; // player name
  readonly kind: MoveKind;
  readonly at: string; // ISO timestamp
  // Fields vary by kind; keep them optional here. A discriminated union
  // would be cleaner but complicates YAML serialization/round-trip.
  readonly handIndex?: number; // for play / discard: which card in hand
  readonly targetPlayer?: string; // for inform_*
  readonly color?: Color; // for inform_color
  readonly rank?: Rank; // for inform_rank
  readonly card?: Card; // for play/discard: the revealed card
  readonly result?: 'success' | 'miss'; // for play: did it extend the firework?
}

export interface GameSnapshot {
  readonly seed: string;
  readonly players: ReadonlyArray<string>;
  readonly handSize: number;
  readonly hands: ReadonlyArray<ReadonlyArray<Card>>;
  readonly deck: ReadonlyArray<Card>;
  readonly fireworks: Readonly<Record<Color, number>>; // current top rank per color, 0 = empty
  readonly discard: ReadonlyArray<Card>;
  readonly infoTokens: number; // 0..8
  readonly missTokens: number; // 0..3 (game over at 3)
  readonly turn: number;
  readonly currentPlayerIdx: number;
  readonly log: ReadonlyArray<MoveLogEntry>;
  readonly finalRoundRemaining: number | null; // null until deck runs out
  readonly status: 'in_progress' | 'won' | 'lost_by_miss' | 'ended_empty_deck';
  readonly version: number; // optimistic-lock counter (CAS on save)
}

export interface NewGameInput {
  readonly seed: string;
  readonly players: ReadonlyArray<string>;
  readonly now: Date;
}

const INITIAL_INFO_TOKENS = 8;
const MAX_INFO_TOKENS = 8;
const MAX_MISSES = 3;

/**
 * Hand size depends on player count: 2–3 players → 5 cards each,
 * 4–5 players → 4 cards each. Fewer than 2 or more than 5 is rejected.
 */
function handSizeFor(numPlayers: number): number {
  if (numPlayers < 2 || numPlayers > 5) {
    throw new DomainError(
      `Hanabi supports 2–5 players, got ${numPlayers}`,
      'players',
    );
  }
  return numPlayers <= 3 ? 5 : 4;
}

export function newGame(input: NewGameInput): GameSnapshot {
  const { seed, players, now } = input;
  if (new Set(players).size !== players.length) {
    throw new DomainError('player names must be unique', 'players');
  }
  for (const p of players) {
    if (!p || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(p)) {
      throw new DomainError(
        `invalid player name: ${p} (must start with a letter, alphanumeric/_/- only)`,
        'players',
      );
    }
  }

  const handSize = handSizeFor(players.length);
  const rng = Rng.fromSeed(seed);
  const deck = rng.shuffle(buildStandardDeck());

  const hands: Card[][] = players.map(() => []);
  for (let i = 0; i < handSize; i++) {
    for (let p = 0; p < players.length; p++) {
      hands[p]!.push(deck.shift()!);
    }
  }

  const fireworks: Record<Color, number> = {
    red: 0,
    yellow: 0,
    green: 0,
    blue: 0,
    white: 0,
  };

  const initialLog: MoveLogEntry = {
    turn: 0,
    by: '__system__',
    kind: 'play', // placeholder; rendering skips turn=0
    at: now.toISOString(),
  };

  return {
    seed,
    players,
    handSize,
    hands,
    deck,
    fireworks,
    discard: [],
    infoTokens: INITIAL_INFO_TOKENS,
    missTokens: 0,
    turn: 1,
    currentPlayerIdx: 0,
    log: [initialLog],
    finalRoundRemaining: null,
    status: 'in_progress',
    version: 0,
  };
}

export function currentPlayer(s: GameSnapshot): string {
  return s.players[s.currentPlayerIdx]!;
}

export function maxScore(s: GameSnapshot): number {
  return Object.values(s.fireworks).reduce((a, b) => a + b, 0);
}

/**
 * Action contract — every mutator is a pure function (Snapshot, input) → Snapshot.
 * No in-place mutation; callers get a new snapshot, and the repository uses
 * CAS on snap.version to catch concurrent writes.
 *
 * Turn advancement is centralized in `advanceTurn` so the final-round
 * countdown (triggered when the deck runs out) is applied consistently
 * from every action. Hanabi's end-of-game is subtle: after the last
 * card is drawn, each player takes exactly one more turn and then the
 * game ends — so we mark `finalRoundRemaining = players.length` on the
 * transition and decrement on each subsequent turn.
 */

export interface PlayInput {
  readonly by: string;
  readonly handIndex: number; // 0-based
  readonly now: Date;
}

export interface DiscardInput {
  readonly by: string;
  readonly handIndex: number;
  readonly now: Date;
}

export interface InformColorInput {
  readonly by: string;
  readonly target: string;
  readonly color: Color;
  readonly now: Date;
}

export interface InformRankInput {
  readonly by: string;
  readonly target: string;
  readonly rank: Rank;
  readonly now: Date;
}

function assertActive(s: GameSnapshot): void {
  if (s.status !== 'in_progress') {
    throw new DomainError(`game is ${s.status}, no more moves allowed`, 'status');
  }
}

function assertTurn(s: GameSnapshot, by: string): number {
  assertActive(s);
  const idx = s.players.indexOf(by);
  if (idx < 0) throw new DomainError(`not a player: ${by}`, 'by');
  if (idx !== s.currentPlayerIdx) {
    throw new DomainError(
      `not your turn: current is ${currentPlayer(s)}, you are ${by}`,
      'by',
    );
  }
  return idx;
}

function assertHandIndex(hand: ReadonlyArray<Card>, idx: number): void {
  if (!Number.isInteger(idx) || idx < 0 || idx >= hand.length) {
    throw new DomainError(
      `handIndex out of range: ${idx} (hand has ${hand.length} card(s))`,
      'handIndex',
    );
  }
}

function advanceTurn(
  s: GameSnapshot,
  newHands: Card[][],
  newDeck: Card[],
  extra: Partial<GameSnapshot>,
  logEntry: MoveLogEntry,
): GameSnapshot {
  let finalRoundRemaining = s.finalRoundRemaining;
  // Deck just ran out on this move — start the final-round countdown.
  // Each remaining player (including ones after current) gets one more turn.
  if (finalRoundRemaining === null && newDeck.length === 0 && s.deck.length > 0) {
    finalRoundRemaining = s.players.length;
  }
  // We're already in the final round — one turn of the countdown just elapsed.
  if (finalRoundRemaining !== null && finalRoundRemaining > 0) {
    finalRoundRemaining -= 1;
  }

  const nextPlayerIdx = (s.currentPlayerIdx + 1) % s.players.length;
  const missTokens = extra.missTokens ?? s.missTokens;
  const fireworks = extra.fireworks ?? s.fireworks;

  let status: GameSnapshot['status'] = 'in_progress';
  if (missTokens >= MAX_MISSES) {
    status = 'lost_by_miss';
  } else if (finalRoundRemaining === 0) {
    status = 'ended_empty_deck';
  }
  // Perfect score is the other winning condition; treat as 'won'
  // regardless of remaining deck.
  const score = Object.values(fireworks).reduce((a, b) => a + b, 0);
  if (score === 25) status = 'won';

  return {
    ...s,
    ...extra,
    hands: newHands,
    deck: newDeck,
    turn: s.turn + 1,
    currentPlayerIdx: nextPlayerIdx,
    log: [...s.log, logEntry],
    finalRoundRemaining,
    status,
    version: s.version + 1,
  };
}

export function play(s: GameSnapshot, input: PlayInput): GameSnapshot {
  const pIdx = assertTurn(s, input.by);
  const hand = s.hands[pIdx]!;
  assertHandIndex(hand, input.handIndex);
  const played = hand[input.handIndex]!;

  const newHand = [...hand.slice(0, input.handIndex), ...hand.slice(input.handIndex + 1)];
  const newDeck = [...s.deck];
  // Refill from deck if possible. When deck is empty, the hand shrinks
  // permanently — this is a standard Hanabi rule and how the game
  // eventually ends even if players never hit the miss cap.
  if (newDeck.length > 0) {
    newHand.push(newDeck.shift()!);
  }
  const newHands: Card[][] = s.hands.map((h, i) => (i === pIdx ? newHand : [...h]));

  const currentTop = s.fireworks[played.color];
  const isSuccess = played.rank === currentTop + 1;

  const newFireworks = { ...s.fireworks };
  let newMisses = s.missTokens;
  let newInfoTokens = s.infoTokens;
  let newDiscard = s.discard;

  if (isSuccess) {
    newFireworks[played.color] = played.rank;
    // Completing a firework (playing a 5) awards one info token back,
    // capped at MAX_INFO_TOKENS. Small detail but important: this is
    // the only way info tokens regenerate besides discard.
    if (played.rank === 5 && newInfoTokens < MAX_INFO_TOKENS) {
      newInfoTokens += 1;
    }
  } else {
    newMisses += 1;
    newDiscard = [...s.discard, played];
  }

  const entry: MoveLogEntry = {
    turn: s.turn,
    by: input.by,
    kind: 'play',
    at: input.now.toISOString(),
    handIndex: input.handIndex,
    card: played,
    result: isSuccess ? 'success' : 'miss',
  };

  return advanceTurn(
    s,
    newHands,
    newDeck,
    {
      fireworks: newFireworks,
      missTokens: newMisses,
      infoTokens: newInfoTokens,
      discard: newDiscard,
    },
    entry,
  );
}

export function discard(s: GameSnapshot, input: DiscardInput): GameSnapshot {
  const pIdx = assertTurn(s, input.by);
  const hand = s.hands[pIdx]!;
  assertHandIndex(hand, input.handIndex);
  if (s.infoTokens >= MAX_INFO_TOKENS) {
    throw new DomainError(
      `cannot discard: info tokens already at max (${MAX_INFO_TOKENS}). discard only allowed when at least one hint was spent`,
      'infoTokens',
    );
  }
  const dumped = hand[input.handIndex]!;
  const newHand = [...hand.slice(0, input.handIndex), ...hand.slice(input.handIndex + 1)];
  const newDeck = [...s.deck];
  if (newDeck.length > 0) {
    newHand.push(newDeck.shift()!);
  }
  const newHands: Card[][] = s.hands.map((h, i) => (i === pIdx ? newHand : [...h]));

  const entry: MoveLogEntry = {
    turn: s.turn,
    by: input.by,
    kind: 'discard',
    at: input.now.toISOString(),
    handIndex: input.handIndex,
    card: dumped,
  };

  return advanceTurn(
    s,
    newHands,
    newDeck,
    {
      infoTokens: s.infoTokens + 1,
      discard: [...s.discard, dumped],
    },
    entry,
  );
}

function assertInformable(s: GameSnapshot, by: string, target: string): void {
  if (s.infoTokens <= 0) {
    throw new DomainError('no info tokens — cannot give a hint', 'infoTokens');
  }
  if (by === target) {
    throw new DomainError('cannot hint yourself', 'target');
  }
  if (!s.players.includes(target)) {
    throw new DomainError(`not a player: ${target}`, 'target');
  }
}

export function informColor(s: GameSnapshot, input: InformColorInput): GameSnapshot {
  assertTurn(s, input.by);
  assertInformable(s, input.by, input.target);
  const entry: MoveLogEntry = {
    turn: s.turn,
    by: input.by,
    kind: 'inform_color',
    at: input.now.toISOString(),
    targetPlayer: input.target,
    color: input.color,
  };
  return advanceTurn(
    s,
    s.hands.map((h) => [...h]) as Card[][],
    [...s.deck] as Card[],
    { infoTokens: s.infoTokens - 1 },
    entry,
  );
}

export function informRank(s: GameSnapshot, input: InformRankInput): GameSnapshot {
  assertTurn(s, input.by);
  assertInformable(s, input.by, input.target);
  const entry: MoveLogEntry = {
    turn: s.turn,
    by: input.by,
    kind: 'inform_rank',
    at: input.now.toISOString(),
    targetPlayer: input.target,
    rank: input.rank,
  };
  return advanceTurn(
    s,
    s.hands.map((h) => [...h]) as Card[][],
    [...s.deck] as Card[],
    { infoTokens: s.infoTokens - 1 },
    entry,
  );
}
