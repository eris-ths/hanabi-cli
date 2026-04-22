import { parseArgs } from './parseArgs.js';
import { handleNewGame } from '../handlers/newGame.js';
import { handleShow } from '../handlers/show.js';
import { handlePlay, handleDiscard, handleInform } from '../handlers/play.js';
import { buildRepo } from '../shared/container.js';
import { DomainError } from '../../domain/shared/DomainError.js';

const HELP = `fireworks — cooperative card game ledger
  (rules based on Hanabi by Antoine Bauza, 2010)

usage:
  fireworks new-game --players <p1,p2,...> [--seed <s>] [--id <id>]
  fireworks show [--as <player>] [--id <id>]
  fireworks play <handIndex> --by <player> [--id <id>]
  fireworks discard <handIndex> --by <player> [--id <id>]
  fireworks inform --by <player> --target <player> (--color <c> | --rank <n>) [--id <id>]
  fireworks list

env:
  FIREWORKS_ROOT    content_root directory (default: cwd)
  FIREWORKS_REVEAL  if "1", new-game prints all hands (debug/replay only)
`;

export async function main(argv: ReadonlyArray<string>): Promise<number> {
  const verb = argv[0];
  if (!verb || verb === '--help' || verb === '-h' || verb === 'help') {
    process.stdout.write(HELP);
    return 0;
  }

  const rest = argv.slice(1);
  const parsed = parseArgs(rest);
  const repo = buildRepo();
  const stdout = (s: string) => process.stdout.write(s + '\n');
  const now = () => new Date();

  try {
    switch (verb) {
      case 'new-game':
        return await handleNewGame(parsed, { repo, now, stdout });
      case 'show':
        return await handleShow(parsed, {
          repo,
          stdout,
          latestId: async () => {
            const ids = await repo.listIds();
            return ids.length === 0 ? null : ids[ids.length - 1]!;
          },
        });
      case 'play':
      case 'discard':
      case 'inform': {
        const actionDeps = {
          repo,
          now,
          stdout,
          latestId: async () => {
            const ids = await repo.listIds();
            return ids.length === 0 ? null : ids[ids.length - 1]!;
          },
        };
        if (verb === 'play') return await handlePlay(parsed, actionDeps);
        if (verb === 'discard') return await handleDiscard(parsed, actionDeps);
        return await handleInform(parsed, actionDeps);
      }
      case 'list': {
        const ids = await repo.listIds();
        if (ids.length === 0) {
          stdout('(no games yet)');
        } else {
          for (const id of ids) stdout(id);
        }
        return 0;
      }
      default:
        process.stderr.write(`unknown verb: ${verb}\n\n${HELP}`);
        return 2;
    }
  } catch (e) {
    if (e instanceof DomainError) {
      process.stderr.write(`error: ${e.message}\n`);
      return 1;
    }
    throw e;
  }
}
