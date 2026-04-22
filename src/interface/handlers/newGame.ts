import { GameRepository } from '../../application/ports/GameRepository.js';
import { newGame, currentPlayer } from '../../domain/game/GameState.js';
import {
  ParsedArgs,
  rejectUnknownFlags,
  requiredOption,
  optionalOption,
} from '../cli/parseArgs.js';
import { cardToString } from '../../domain/card/Card.js';

const KNOWN_FLAGS = new Set(['seed', 'players', 'id']);

export interface NewGameDeps {
  readonly repo: GameRepository;
  readonly now: () => Date;
  readonly stdout: (s: string) => void;
}

export async function handleNewGame(
  parsed: ParsedArgs,
  deps: NewGameDeps,
): Promise<number> {
  rejectUnknownFlags(parsed, 'new-game', KNOWN_FLAGS);
  const id = optionalOption(parsed, 'id') ?? defaultId(deps.now());
  const seed = optionalOption(parsed, 'seed') ?? id;
  const playersRaw = requiredOption(parsed, 'new-game', 'players');
  const players = playersRaw.split(',').map((p) => p.trim()).filter((p) => p !== '');

  const snap = newGame({ seed, players, now: deps.now() });
  await deps.repo.saveNew(id, snap);

  deps.stdout(`✓ new game: ${id}`);
  deps.stdout(`  seed: ${seed}`);
  deps.stdout(`  players: ${players.join(', ')} (${players.length})`);
  deps.stdout(`  hand size: ${snap.handSize}`);
  deps.stdout(`  deck remaining: ${snap.deck.length}`);
  deps.stdout(`  info tokens: ${snap.infoTokens}/8`);
  deps.stdout(`  first player: ${currentPlayer(snap)}`);
  // Reveal all hands on creation only when GUILD_REVEAL=1 — useful for
  // debugging and replay verification, but obviously breaks hidden-info
  // play. Default is to hide all hands; `fireworks show --as <player>` is
  // the intended view.
  if (process.env['FIREWORKS_REVEAL'] === '1') {
    for (let i = 0; i < players.length; i++) {
      const hand = snap.hands[i]!.map(cardToString).join(' ');
      deps.stdout(`  hand[${players[i]}]: ${hand}`);
    }
  }
  return 0;
}

/**
 * Default game id: YYYYMMDD-HHMMSS in UTC. Short enough for a filename,
 * unique enough for a single-user session, replaces colons with dashes
 * so the filename is portable across filesystems.
 */
function defaultId(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
  );
}
