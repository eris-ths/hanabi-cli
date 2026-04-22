import {
  lstatSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { resolve, join, dirname, isAbsolute, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DomainError } from '../../domain/shared/DomainError.js';
import { isUnderBase } from './pathSafety.js';

/**
 * safeFs — lifted from guild-cli v0.3.0. All file operations go through
 * these helpers so the path-safety invariant is enforced in one place:
 *   - target path must resolve under `base`
 *   - intermediate path components must not be symlinks
 *   - atomic write uses temp+rename so readers never see torn files
 *
 * Hanabi reuses this unchanged because the invariants are game-agnostic.
 */

export function assertUnder(base: string, target: string): string {
  const absBase = resolve(base);
  const absTarget = isAbsolute(target) ? resolve(target) : resolve(absBase, target);
  if (!isUnderBase(absTarget, absBase)) {
    throw new DomainError(
      `Path escapes base: ${target} (resolved=${absTarget}, base=${absBase})`,
      'path',
    );
  }
  let cur = absTarget;
  while (cur !== absBase) {
    if (existsSync(cur)) {
      const st = lstatSync(cur);
      if (st.isSymbolicLink()) {
        throw new DomainError(`Refusing to follow symlink: ${cur}`, 'path');
      }
    }
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return absTarget;
}

export function readTextSafe(base: string, relOrAbs: string): string {
  const p = assertUnder(base, relOrAbs);
  return readFileSync(p, 'utf8');
}

export function writeTextSafeAtomic(
  base: string,
  relOrAbs: string,
  content: string,
): void {
  const p = assertUnder(base, relOrAbs);
  const dir = dirname(p);
  mkdirSync(dir, { recursive: true });
  const tmpName = `.tmp-${process.pid}-${randomBytes(6).toString('hex')}-${basename(p)}`;
  const tmp = join(dir, tmpName);
  try {
    writeFileSync(tmp, content, { flag: 'wx' });
    renameSync(tmp, p);
  } catch (e) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      // ignore cleanup failure
    }
    throw e;
  }
}

export function existsSafe(base: string, relOrAbs: string): boolean {
  const p = assertUnder(base, relOrAbs);
  return existsSync(p);
}

export function listDirSafe(base: string, relOrAbs: string): string[] {
  const p = assertUnder(base, relOrAbs);
  if (!existsSync(p)) return [];
  return readdirSync(p);
}
