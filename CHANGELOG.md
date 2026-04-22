# Changelog

All notable changes to hanabi-cli (precursor to atelier) follow the 0.x strict-variant semver policy inherited from guild-cli: every BREAKING change must be called out explicitly.

## [Unreleased]

### Added

- `docs/ATELIER.md` — vision document for the atelier engine (successor architecture). Includes SDK, pack structure, Lua role, Card abstraction, Eris Architecture resonance, security & quality charter.
- `docs/PROTOTYPES.md` — vision for the next two prototypes that share the atelier substrate: Gemini ReAct agent on ledger, Mini Claude Code (Skill/Memory/Rules/Hooks/MCP/Plugins/SubAgents). Rule of Three extraction trigger at the third working prototype.
- `SECURITY.md` — threat model for v0.1.x and forward-looking notes for atelier's Lua + pack era.
- `CHANGELOG.md` — this file.
- `src/core/lua/sandbox.ts` — wasmoon-backed Lua sandbox with hard deny-list (os, io, require, package, debug, load, loadstring, loadfile, dofile, collectgarbage). Pure-compute modules (math, string, table) kept.
- `tests/core/lua/sandbox.test.ts` — 5 tests covering: deny-list enforcement (every denied global is nil), whitelist positive cases, arithmetic sanity, loud-fail on syntax error, escape-hatch attempts all yield nil.
- `wasmoon@^1.16.0` production dependency.

### Pending

- Lua integration into hanabi domain (e.g. end_check.lua driving win/lose judgment — currently deferred; core sandbox exists as hook point).
- Extraction of `atelier-core` from shared infrastructure (deferred until the second pack lands — Rule of Three).

## [0.1.0] — 2026-04-22

### Added

- Initial fork from `eris-ths/guild-cli` v0.3.0. Carries over infrastructure (`safeFs`, `pathSafety`, atomic write, CAS pattern, strict flag validation, DDD clean architecture).
- Hanabi-specific domain: `Card`, `Rng` (Mulberry32 seedable PRNG), `GameState` aggregate with pure-functional mutations.
- Playable verbs: `new-game`, `show` (with `--as <player>` hidden-info lense), `play`, `discard`, `inform`, `list`.
- Rules implemented: 50-card deck with standard rank distribution, hand size 4/5 by player count, 8 info tokens, 3 misses cap, final-round countdown on deck exhaustion, win at score 25, loss at 3 misses.
- Design pedigree: event-sourcing as SOT, pure-functional mutations, CAS optimistic lock (`GameVersionConflict`), hidden-info lense applied at interface boundary, seedable deterministic replay, YAML as human-readable ledger.

### Notes

- Not a `npm publish`ed package yet; git tag only.
- `_playground/` directory in `.gitignore` for local experimentation.
