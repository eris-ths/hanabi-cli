import { GameRepository } from '../../application/ports/GameRepository.js';
import { GameSnapshot, currentPlayer, maxScore } from '../../domain/game/GameState.js';
import { cardToString, COLORS } from '../../domain/card/Card.js';
import {
  ParsedArgs,
  rejectUnknownFlags,
  optionalOption,
} from '../cli/parseArgs.js';
import { DomainError } from '../../domain/shared/DomainError.js';

const KNOWN_FLAGS = new Set(['as', 'id']);

export interface ShowDeps {
  readonly repo: GameRepository;
  readonly stdout: (s: string) => void;
  readonly latestId: () => Promise<string | null>;
}

export async function handleShow(
  parsed: ParsedArgs,
  deps: ShowDeps,
): Promise<number> {
  rejectUnknownFlags(parsed, 'show', KNOWN_FLAGS);
  const id = optionalOption(parsed, 'id') ?? (await deps.latestId());
  if (!id) throw new DomainError('no game found. run `hanabi new-game --players a,b` first', 'id');
  const as = optionalOption(parsed, 'as');

  const snap = await deps.repo.findById(id);
  if (!snap) throw new DomainError(`game not found: ${id}`, 'id');

  render(snap, as ?? null, deps.stdout);
  return 0;
}

/**
 * Render a GameSnapshot with a perspective lense:
 *   - as=null           → spectator view (all hands face-up)
 *   - as=<player name>  → that player's own hand is hidden (shown as **),
 *                          others are visible. This is the game's actual
 *                          playing view.
 *
 * The lense is applied here at the interface boundary; the snapshot
 * itself always contains ground truth, which is what makes replay
 * and post-mortem analysis possible.
 */
function render(
  snap: GameSnapshot,
  as: string | null,
  out: (s: string) => void,
): void {
  out(`# game: seed=${snap.seed}, turn=${snap.turn}, status=${snap.status}`);
  out(`  score: ${maxScore(snap)}/25   info: ${snap.infoTokens}/8   miss: ${snap.missTokens}/3   deck: ${snap.deck.length}`);
  out('');
  out('fireworks:');
  for (const color of COLORS) {
    const top = snap.fireworks[color];
    out(`  ${color.padEnd(6)} ${top === 0 ? '—' : top}`);
  }
  out('');
  out(`discard: ${snap.discard.length === 0 ? '(empty)' : snap.discard.map(cardToString).join(' ')}`);
  out('');
  out('hands:');
  if (as !== null && !snap.players.includes(as)) {
    throw new DomainError(
      `--as "${as}" not in player list: ${snap.players.join(', ')}`,
      'as',
    );
  }
  for (let i = 0; i < snap.players.length; i++) {
    const name = snap.players[i]!;
    const hand = snap.hands[i]!;
    const cards =
      as !== null && name === as
        ? hand.map(() => '**').join(' ')
        : hand.map(cardToString).join(' ');
    const marker = i === snap.currentPlayerIdx ? '→' : ' ';
    out(`  ${marker} ${name.padEnd(12)} ${cards}`);
  }
  out('');
  out(`current player: ${currentPlayer(snap)}`);
  if (as !== null) {
    out(`(lense: --as ${as} — your own hand is hidden)`);
  }
}
