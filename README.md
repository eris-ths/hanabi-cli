# hanabi-cli

A cooperative card game (Hanabi / 花火) implemented as an **append-only YAML ledger**. Every move is a record pinned to an actor, a turn, and a moment. The same ledger, viewed through a `--as <player>` lens, yields each player's hidden-information perspective; viewed as a spectator, it yields ground truth.

Forked from [`eris-ths/guild-cli`](https://github.com/eris-ths/guild-cli) v0.3.0. The infrastructure (atomic write, path containment, optimistic-lock CAS, DDD clean architecture, strict flag validation) carries over. The domain is Hanabi-specific and written fresh.

> **Status**: alpha (0.x). Precursor to [`atelier`](./docs/ATELIER.md) — the game engine being designed around this prototype.
> See [`SECURITY.md`](./SECURITY.md) for the threat model and [`CHANGELOG.md`](./CHANGELOG.md) for release history.

## Why this exists

Three simultaneous goals:

- **Prove that gate-class infrastructure generalizes to turn-based games**. If an event-sourced ledger with CAS and a lens system works for team coordination, does it also work for a cooperative card game with hidden information? Answer so far: yes.
- **Dogfood the lens pattern in a game setting**. A single `snap.log` is the source of truth. `show` with no `--as` yields the full board; `show --as eris` hides eris's own hand. No branching persistence paths — just perspective-dependent rendering at the interface boundary.
- **Scaffold a path to [`atelier`](./docs/ATELIER.md)** — a general-purpose AI-first game engine built around Card-driven architecture, Lua sandboxing, pack distribution, and observer-AI slots.

## Is the game actually fun?

Yes — Hanabi is a classic (Spiel des Jahres 2013, still highly regarded) and the CLI implementation preserves what makes it work:

- **You can't see your own hand, but you can see everyone else's.** Every hint you give your partner is one they can't give themselves. Every move is half information flow, half card placement. It's the only card game I know where *improving at communicating* is the main way you get better.
- **Limited hints (8 info tokens), shared miss budget (3 strikes).** You'll feel the tension in turn 5 when someone could be discarding a 5 and you don't have a free hint to warn them.
- **Conventions emerge between partners.** "Rank-3 hint returned after blue-hint received" starts meaning something specific to your pair. The game becomes a shared grammar, not a rulebook.
- **Mistakes are cooperative, not adversarial.** When you miss, it's "how do we signal better next time" — never "you should have known." It's a gentle game for the relationship, tense for the table.
- **One game runs 15–30 minutes.** Short enough for a lunch break, long enough to feel like a story.

What the CLI adds that a physical deck doesn't:

- **Asynchronous play is natural.** The ledger file *is* the game state. Email it, git-commit it, drop it in a shared folder — your partner picks up from `show --as <their-name>` whenever they have a spare minute. Turn-by-turn games over days become viable.
- **Replay.** Every game's full log is in the YAML. Given the seed, you can reconstruct any turn, watch yourself make a mistake, or share a brilliant comeback.
- **AI partners are coming.** An observer AI (future `atelier` feature) could kibitz, or play as a hidden-info partner itself.

If you're new to Hanabi, the 2-player variant in this CLI is the gentlest on-ramp. Start with `--seed beginner-friendly`, play a game end-to-end, and see where the tension naturally arises.

## How much of this do I need to read?

| Depth | File | When it's enough |
|---|---|---|
| 30 sec | the paragraphs above | you want to know what this is |
| 3 min | [`AGENT.md`](./AGENT.md) | you're an AI agent about to run `hanabi` and want the verb map |
| 15 min | [`docs/ATELIER.md`](./docs/ATELIER.md) | you want to understand where this is going (the vision document) |
| 5 min | [`docs/PROTOTYPES.md`](./docs/PROTOTYPES.md) | you want to see the two sibling prototypes that will share the same substrate |
| when needed | [`SECURITY.md`](./SECURITY.md) / [`CHANGELOG.md`](./CHANGELOG.md) | you're integrating or adopting this |

## Install

Requires Node.js 20 or later.

```bash
npm install
npm run build
node ./bin/hanabi.mjs --help
```

## Quick start

```bash
# new game
HANABI_ROOT=./demo node ./bin/hanabi.mjs new-game --players eris,nao --seed "my-seed"

# spectator view (all hands visible)
HANABI_ROOT=./demo node ./bin/hanabi.mjs show

# player view (own hand is hidden, others visible)
HANABI_ROOT=./demo node ./bin/hanabi.mjs show --as eris

# play the 2nd card from your hand
HANABI_ROOT=./demo node ./bin/hanabi.mjs play 2 --by eris

# discard the 3rd card
HANABI_ROOT=./demo node ./bin/hanabi.mjs discard 3 --by eris

# give a hint: "your rank-1 cards are at positions X, Y" or "your blue cards are at Z"
HANABI_ROOT=./demo node ./bin/hanabi.mjs inform --by eris --target nao --rank 1
HANABI_ROOT=./demo node ./bin/hanabi.mjs inform --by eris --target nao --color blue
```

## Verbs

| Verb | Purpose | Key flags |
|---|---|---|
| `new-game` | Create a new game record | `--players`, `--seed`, `--id` |
| `show` | Render the current board | `--as <player>`, `--id` |
| `play` | Play a card from your hand | `<handIndex>` (positional, 1-based), `--by` |
| `discard` | Discard a card (gains 1 info token) | `<handIndex>`, `--by` |
| `inform` | Give a hint to another player | `--by`, `--target`, `--color` or `--rank` |
| `list` | List all game IDs in the content root | — |
| `help` | Print usage | — |

All verbs reject unknown flags loudly (a `--trun` typo on `--turn` will not be silently accepted). See [`AGENT.md`](./AGENT.md) for the full verb reference.

## Design pedigree

Carried over from [`guild-cli`](https://github.com/eris-ths/guild-cli) v0.3.0, adapted to a game domain:

- **Event-sourcing**: `snap.log` is the source of truth. Game state is a derivation over the log. Replay is free; post-mortem is free.
- **Pure-functional mutations**: every action is `(snap, input) → newSnap`. No in-place updates. The repository saves the new snapshot atomically and performs a CAS on `snap.version`.
- **Optimistic-lock CAS**: `GameVersionConflict` mirrors guild-cli's `RequestVersionConflict`. Concurrent writes detect each other and can retry.
- **Hidden-information lens at the interface boundary**: the snapshot always contains ground truth. `show --as <player>` applies a lens at render time, replacing that player's own hand with `**`. Same design as `gate voices --lense <l>`.
- **Seedable deterministic replay**: Mulberry32 PRNG with FNV-1a string seed hashing. Given a seed, the shuffle reproduces exactly. No `Math.random()` anywhere.
- **Strict flag validation**: `rejectUnknownFlags` on every verb. Silent typos are the enemy.
- **Path safety**: `safeFs.assertUnder` + `pathSafety.isUnderBase`. Path traversal is a compile-time concern, not a runtime patch.

## Rules implemented (standard Hanabi)

- 50-card deck: 5 colors × (three 1s, two 2s, two 3s, two 4s, one 5)
- Hand size: 5 cards for 2–3 players, 4 cards for 4–5 players
- 8 info tokens (hints cost 1, discards refill 1, completing a 5 refills 1 capped at 8)
- 3 miss tokens (each failed `play` increments; at 3 the game is lost)
- Final-round countdown: after the deck empties, each remaining player takes one more turn, then the game ends
- Win at score 25 (all fireworks complete)

## Security & quality

- Threat model documented in [`SECURITY.md`](./SECURITY.md).
- Quality baseline inherited from guild-cli: TS strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. No `any` without justification. Every verb has an end-to-end path; a Lua sandbox test suite enforces the denied-globals list.
- No `Math.random()` in the engine or first-party logic — all randomness flows through the seeded `Rng`, so every game is auditable and reproducible.

## Lua sandbox (experimental)

A wasmoon-backed Lua sandbox exists at `src/core/lua/sandbox.ts` with a hard-coded deny list (`os`, `io`, `require`, `package`, `debug`, `load`, `loadstring`, `loadfile`, `dofile`, `collectgarbage`). The deny list is pinned by a test that enumerates every denied global and asserts each is `nil` inside the sandbox. Pure-compute modules (`math`, `string`, `table`) are kept.

Lua is not yet integrated into the hanabi domain logic; the sandbox is a hook point for [`atelier`](./docs/ATELIER.md)'s Card scripting layer.

## Repository hygiene

- No secrets committed; no env files expected.
- `games/`, `_playground/`, `data/` are gitignored. Your ledger files stay local.
- Commits are signed (when configured) and co-author lines are used when Claude or another AI collaborated on a change.

## License

MIT
