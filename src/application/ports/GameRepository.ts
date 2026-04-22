import { GameSnapshot } from '../../domain/game/GameState.js';

/**
 * Port for persisting the current Hanabi game. Single-game semantics
 * for now: one active game per content_root, stored under games/<id>.yaml.
 * Multi-game sessions are a later concern (will need a list verb first).
 *
 * saveNew throws if the id already exists (EEXIST-style collision).
 * save(current) uses optimistic lock: compares loadedVersion against
 * on-disk version and throws GameVersionConflict on mismatch. Mirrors
 * guild-cli's RequestVersionConflict pattern.
 */
export interface GameRepository {
  saveNew(id: string, snap: GameSnapshot): Promise<void>;
  save(id: string, snap: GameSnapshot, loadedVersion: number): Promise<void>;
  findById(id: string): Promise<GameSnapshot | null>;
  listIds(): Promise<string[]>;
}

export class GameVersionConflict extends Error {
  readonly code = 'GAME_VERSION_CONFLICT';
  constructor(
    public readonly id: string,
    public readonly expected: number,
    public readonly found: number,
  ) {
    super(
      `Game ${id}: expected version ${expected}, found ${found}. Another process modified the game — re-read and retry.`,
    );
    this.name = 'GameVersionConflict';
  }
}
