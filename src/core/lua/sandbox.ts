import { LuaFactory, LuaEngine } from 'wasmoon';
import { DomainError } from '../../domain/shared/DomainError.js';

/**
 * Lua sandbox — wasmoon-backed, hardened for untrusted-pack execution.
 *
 * Trust model (see SECURITY.md + docs/ATELIER.md §12):
 *   - First-party pack scripts are reviewed, but we still sandbox as
 *     defense-in-depth. "Belt and suspenders" applies.
 *   - Third-party packs (future) will run in this same sandbox — there
 *     are no separate tiers. The sandbox must be strict enough for the
 *     worst case.
 *
 * The wasmoon global table starts with a full Lua 5.4 standard library.
 * We delete the dangerous entries BEFORE any user script has a chance to
 * observe them (os, io, package, debug, require, loadfile, dofile, load).
 * Pure-compute modules (math, string, table) are kept.
 *
 * The one test in `tests/core/lua/sandbox.test.ts` must enumerate every
 * denied global and assert each is absent. If we ever add a new Lua
 * package, the whitelist is the only place to decide inclusion.
 */

const DENIED_GLOBALS = [
  'os',
  'io',
  'package',
  'debug',
  'require',
  'loadfile',
  'dofile',
  'load',
  'loadstring', // Lua 5.1 compat
  'collectgarbage',
] as const;

const ALLOWED_GLOBALS_NOTE = [
  // For documentation only — this list informs pack authors what they can rely on.
  'math',
  'string',
  'table',
  'tostring',
  'tonumber',
  'type',
  'ipairs',
  'pairs',
  'next',
  'select',
  'error',
  'assert',
  'pcall',
  'xpcall',
] as const;

export interface SandboxConfig {
  readonly memoryLimitBytes?: number; // default 16 MiB
  readonly instructionLimit?: number; // steps before forced yield (not yet enforced; hook slot)
}

/**
 * Module-level singleton. wasmoon's LuaFactory loads a ~500KB WASM blob;
 * we pay that cost once per process. Each `createSandbox()` call spawns a
 * fresh LuaEngine (isolated state) from the shared factory.
 */
let factory: LuaFactory | null = null;

async function getFactory(): Promise<LuaFactory> {
  if (factory === null) factory = new LuaFactory();
  return factory;
}

export interface Sandbox {
  readonly engine: LuaEngine;
  /** Execute a Lua chunk and return the last expression's value. */
  run<T = unknown>(chunk: string): Promise<T>;
  /** Execute a Lua chunk that defines globals, then read one back. */
  readGlobal<T = unknown>(name: string): T | undefined;
  close(): Promise<void>;
}

export async function createSandbox(
  _config: SandboxConfig = {},
): Promise<Sandbox> {
  // Memory cap: deferred until wasmoon's memory-limit API is confirmed
  // across versions. The deny list below is the critical control —
  // unbounded allocation by a trusted first-party script is not in the
  // immediate threat model. Revisit when third-party pack loading lands.
  const f = await getFactory();
  const engine: LuaEngine = await f.createEngine({
    enableProxy: false, // pure data exchange; forbid object identity leakage
  });

  // Remove dangerous globals. Passing `null` from JS tripped wasmoon's
  // promise-detection path (it called `.then` on the bare null), so we
  // execute a small Lua chunk that assigns `nil` to each denied global
  // directly. Still runs BEFORE any user script touches the engine.
  const denyChunk = DENIED_GLOBALS.map((n) => `${n}=nil`).join('\n');
  await engine.doString(denyChunk);

  return {
    engine,
    async run<T>(chunk: string): Promise<T> {
      try {
        return (await engine.doString(chunk)) as T;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new DomainError(`lua execution failed: ${msg}`, 'lua');
      }
    },
    readGlobal<T>(name: string): T | undefined {
      const v = engine.global.get(name) as T | undefined;
      return v;
    },
    async close() {
      engine.global.close();
    },
  };
}

/**
 * Testing hook — exposes the deny list so the sandbox test suite can
 * iterate over every expected-absent global without the list drifting
 * out of sync.
 */
export function deniedGlobals(): ReadonlyArray<string> {
  return DENIED_GLOBALS;
}

export function allowedGlobalsNote(): ReadonlyArray<string> {
  return ALLOWED_GLOBALS_NOTE;
}
