# Security Policy

> Current state: hanabi-cli v0.1.0, precursor to atelier. Single-user, local-only, single-host.
> Trust model will expand when packs become loadable from third-party sources.

## Threat model (v0.1.x — current)

This tool runs locally on one machine, invoked by one user. The YAML ledger under `games/` is a data artifact, not an executable. No network IO. No remote code loading.

Threats **in scope**:

- **Path traversal**: a crafted game id like `../../etc/passwd` must not escape the content root. Mitigated by `safeFs.assertUnder` + `pathSafety.isUnderBase`, lifted from guild-cli v0.3.0.
- **Torn reads / concurrent writes**: two invocations mutating the same game simultaneously. Mitigated by atomic write (temp + rename) and optimistic-lock CAS on `snapshot.version`. Inherited from guild-cli's Request/Inbox/Issue pattern.
- **Typo'd flags silently accepted**: a `--trun` typo on `--turn` must not be interpreted as a positional or ignored. Mitigated by `rejectUnknownFlags` with a per-verb whitelist.
- **Malformed YAML crashing the process**: reading a corrupted save file should fail loudly on that file, not take down the CLI. Parsing is wrapped; error messages prefix `yaml parse failed:` for downstream triage.

Threats **out of scope for v0.1.x** (relevant once atelier lands):

- Multi-process / multi-host concurrency beyond CAS (single-host CAS is sufficient for local use).
- Third-party pack loading (future atelier concern — will require Lua sandboxing, pack signature verification, etc).
- Lua sandbox escape (relevant when Lua is introduced).
- Supply chain compromise of dependencies (currently only `yaml`; monitored via `npm audit`).

## Discipline

- No use of `Math.random()` in the engine or first-party game logic. Shuffles go through the seeded `Rng` so every game is reproducible and auditable. A test grepping for `Math.random` will be added alongside the first CI step.
- No use of `eval`, `Function()`, or dynamic import of user-provided strings anywhere in the engine.
- Ledger writes are the only filesystem mutations. Every write path goes through `safeFs` (or will, once atelier factors core out).
- Player names and seeds are validated at the CLI boundary with a strict regex before reaching domain code.

## Reporting a security issue

This is an experimental personal project under active development. Open an issue with the `security` label, or contact the maintainer directly. No bug-bounty program; this is community-trust territory.

## Update cadence

This file is updated whenever a new trust boundary is introduced. The canonical list of boundaries lives in `docs/ATELIER.md` §12 Security & Quality Charter.
