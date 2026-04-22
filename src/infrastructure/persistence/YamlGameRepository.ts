import YAML from 'yaml';
import {
  GameRepository,
  GameVersionConflict,
} from '../../application/ports/GameRepository.js';
import { GameSnapshot } from '../../domain/game/GameState.js';
import {
  existsSafe,
  readTextSafe,
  writeTextSafeAtomic,
  listDirSafe,
} from './safeFs.js';
import { DomainError } from '../../domain/shared/DomainError.js';

/**
 * YAML-backed game repository. Mirrors guild-cli's Yaml*Repository
 * pattern: one file per aggregate, atomic write via temp+rename, CAS
 * on a monotonic version field. The file IS the ledger — every move
 * appends to snap.log and bumps snap.version.
 */
export class YamlGameRepository implements GameRepository {
  constructor(private readonly base: string) {}

  private relPath(id: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new DomainError(`invalid game id: ${id}`, 'id');
    }
    return `games/${id}.yaml`;
  }

  async saveNew(id: string, snap: GameSnapshot): Promise<void> {
    const rel = this.relPath(id);
    if (existsSafe(this.base, rel)) {
      throw new DomainError(`game already exists: ${id}`, 'id');
    }
    writeTextSafeAtomic(this.base, rel, YAML.stringify(snap));
  }

  async save(
    id: string,
    snap: GameSnapshot,
    loadedVersion: number,
  ): Promise<void> {
    const rel = this.relPath(id);
    if (existsSafe(this.base, rel)) {
      const current = await this.findById(id);
      if (current && current.version !== loadedVersion) {
        throw new GameVersionConflict(id, loadedVersion, current.version);
      }
    }
    writeTextSafeAtomic(this.base, rel, YAML.stringify(snap));
  }

  async findById(id: string): Promise<GameSnapshot | null> {
    const rel = this.relPath(id);
    if (!existsSafe(this.base, rel)) return null;
    const raw = readTextSafe(this.base, rel);
    const parsed = YAML.parse(raw) as GameSnapshot | null;
    return parsed ?? null;
  }

  async listIds(): Promise<string[]> {
    return listDirSafe(this.base, 'games')
      .filter((f) => f.endsWith('.yaml'))
      .map((f) => f.slice(0, -'.yaml'.length))
      .sort();
  }
}
