import { GameRepository } from '../../application/ports/GameRepository.js';
import {
  play,
  discard,
  informColor,
  informRank,
  currentPlayer,
  maxScore,
  GameSnapshot,
} from '../../domain/game/GameState.js';
import { cardToString, isColor, isRank, Color, Rank } from '../../domain/card/Card.js';
import {
  ParsedArgs,
  rejectUnknownFlags,
  requiredOption,
  optionalOption,
} from '../cli/parseArgs.js';
import { DomainError } from '../../domain/shared/DomainError.js';

export interface ActionDeps {
  readonly repo: GameRepository;
  readonly now: () => Date;
  readonly stdout: (s: string) => void;
  readonly latestId: () => Promise<string | null>;
}

function parseHandIndex(parsed: ParsedArgs, verb: string): number {
  // Accept as positional (fireworks play 2) or as --index. Positional is
  // the more natural feel for a card game; --index is the escape hatch
  // when chaining with shell tools.
  const raw = parsed.positional[0] ?? optionalOption(parsed, 'index');
  if (!raw) throw new DomainError(`'${verb}' requires a hand index (positional or --index)`, 'index');
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new DomainError(`invalid hand index: ${raw}`, 'index');
  // CLI users are 1-indexed; internal is 0-indexed. The domain layer
  // validates the range, so we just subtract and pass through.
  return n - 1;
}

async function loadOrFail(deps: ActionDeps, id: string | null): Promise<{ id: string; snap: GameSnapshot }> {
  const resolvedId = id ?? (await deps.latestId());
  if (!resolvedId) throw new DomainError('no game found. run `fireworks new-game` first', 'id');
  const snap = await deps.repo.findById(resolvedId);
  if (!snap) throw new DomainError(`game not found: ${resolvedId}`, 'id');
  return { id: resolvedId, snap };
}

function summarize(snap: GameSnapshot, out: (s: string) => void): void {
  out(`  score=${maxScore(snap)}/25  info=${snap.infoTokens}/8  miss=${snap.missTokens}/3  deck=${snap.deck.length}  status=${snap.status}`);
  if (snap.status === 'in_progress') {
    out(`  next: ${currentPlayer(snap)}`);
  }
  if (snap.finalRoundRemaining !== null && snap.status === 'in_progress') {
    out(`  final round: ${snap.finalRoundRemaining} turn(s) remaining`);
  }
}

const PLAY_FLAGS = new Set(['by', 'id', 'index']);
export async function handlePlay(parsed: ParsedArgs, deps: ActionDeps): Promise<number> {
  rejectUnknownFlags(parsed, 'play', PLAY_FLAGS);
  const by = requiredOption(parsed, 'play', 'by');
  const handIndex = parseHandIndex(parsed, 'play');
  const { id, snap } = await loadOrFail(deps, optionalOption(parsed, 'id') ?? null);
  const next = play(snap, { by, handIndex, now: deps.now() });
  await deps.repo.save(id, next, snap.version);

  const last = next.log[next.log.length - 1]!;
  const cardStr = last.card ? cardToString(last.card) : '?';
  const resultMark = last.result === 'success' ? '✓' : '✗';
  deps.stdout(`${resultMark} ${by} played [${handIndex + 1}] → ${cardStr} (${last.result})`);
  summarize(next, deps.stdout);
  return 0;
}

const DISCARD_FLAGS = new Set(['by', 'id', 'index']);
export async function handleDiscard(parsed: ParsedArgs, deps: ActionDeps): Promise<number> {
  rejectUnknownFlags(parsed, 'discard', DISCARD_FLAGS);
  const by = requiredOption(parsed, 'discard', 'by');
  const handIndex = parseHandIndex(parsed, 'discard');
  const { id, snap } = await loadOrFail(deps, optionalOption(parsed, 'id') ?? null);
  const next = discard(snap, { by, handIndex, now: deps.now() });
  await deps.repo.save(id, next, snap.version);

  const last = next.log[next.log.length - 1]!;
  const cardStr = last.card ? cardToString(last.card) : '?';
  deps.stdout(`♻ ${by} discarded [${handIndex + 1}] → ${cardStr} (+1 info)`);
  summarize(next, deps.stdout);
  return 0;
}

const INFORM_FLAGS = new Set(['by', 'id', 'target', 'color', 'rank']);
export async function handleInform(parsed: ParsedArgs, deps: ActionDeps): Promise<number> {
  rejectUnknownFlags(parsed, 'inform', INFORM_FLAGS);
  const by = requiredOption(parsed, 'inform', 'by');
  const target = requiredOption(parsed, 'inform', 'target');
  const colorArg = optionalOption(parsed, 'color');
  const rankArg = optionalOption(parsed, 'rank');
  if ((colorArg && rankArg) || (!colorArg && !rankArg)) {
    throw new DomainError("inform requires exactly one of --color or --rank", 'color/rank');
  }
  const { id, snap } = await loadOrFail(deps, optionalOption(parsed, 'id') ?? null);
  let next: GameSnapshot;
  let summary: string;
  if (colorArg) {
    if (!isColor(colorArg)) throw new DomainError(`invalid color: ${colorArg}`, 'color');
    next = informColor(snap, { by, target, color: colorArg as Color, now: deps.now() });
    summary = `${by} → ${target}: color=${colorArg}`;
  } else {
    const rankN = Number(rankArg);
    if (!isRank(rankN)) throw new DomainError(`invalid rank: ${rankArg}`, 'rank');
    next = informRank(snap, { by, target, rank: rankN as Rank, now: deps.now() });
    summary = `${by} → ${target}: rank=${rankN}`;
  }
  await deps.repo.save(id, next, snap.version);
  deps.stdout(`💡 ${summary}  (−1 info)`);
  summarize(next, deps.stdout);
  return 0;
}
