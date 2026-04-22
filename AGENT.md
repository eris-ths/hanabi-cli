# AGENT.md — fireworks-cli quick reference for AI agents

> Optimized for minimal token use. Read this instead of `README.md` if you're operating the tool and want the verb map.

## What this tool is

A CLI for playing cooperative Hanabi. State is an append-only YAML ledger. Hidden information is enforced at render time via a `--as <player>` lens, not in the domain (ground truth is always complete in the snapshot).

Forked from [`guild-cli`](https://github.com/eris-ths/guild-cli) v0.3.0. Same infrastructure patterns: CAS, atomic write, strict flag validation, DDD clean architecture.

## Invocation

```bash
node /path/to/fireworks-cli/bin/fireworks.mjs <verb> [flags]
```

Environment:
- `FIREWORKS_ROOT` — content root directory. Defaults to `cwd`. Ledger files live under `<root>/games/`.
- `FIREWORKS_REVEAL=1` — if set, `new-game` prints all hands (debug/replay only).

## Verbs (complete list)

| Verb | Purpose | Required flags | Optional flags |
|---|---|---|---|
| `new-game` | Create a new game | `--players <a,b,...>` | `--seed <s>`, `--id <id>` |
| `show` | Render the board | — | `--as <player>`, `--id <id>` |
| `play` | Play a card from hand | `--by <player>`, `<handIndex>` positional | `--id <id>` |
| `discard` | Discard a card (+1 info) | `--by <player>`, `<handIndex>` positional | `--id <id>` |
| `inform` | Give a hint | `--by <player>`, `--target <player>`, one of `--color <c>` or `--rank <n>` | `--id <id>` |
| `list` | List all game IDs | — | — |
| `help` | Print usage | — | — |

**All verbs reject unknown flags.** A `--trun` typo on `--turn` will error loudly; silent acceptance is off the table.

## Key rules

- **Hand index is 1-based** at the CLI boundary. Internal is 0-based; the handler subtracts.
- **`play` / `discard` draw a replacement** from the deck if non-empty. When the deck runs out, hands shrink permanently.
- **`inform` consumes 1 info token** (max 8, min 0). Cannot target yourself. Cannot be used if 0 tokens remain.
- **`discard` refills 1 info token** (capped at 8). Cannot be used if already at 8.
- **Playing a 5** refills 1 info token (capped). This is the only play-side info source.
- **3 misses** → `status: lost_by_miss`.
- **Score 25** → `status: won`.
- **Deck empty** → final-round countdown: each remaining player takes one more turn, then `status: ended_empty_deck`.

## Lens system

`show --as <player>` hides that player's own hand (cards rendered as `**`) while showing everyone else's. The snapshot on disk always contains ground truth; the lens is applied only at render time.

```bash
fireworks show                  # spectator: all hands visible (ground truth)
fireworks show --as eris        # eris: own hand hidden, nao's visible
fireworks show --as nao         # nao: own hand hidden, eris's visible
```

**Current limitation**: `show --as` does not currently render the player's own *inferred* knowledge (hints accumulated from past `inform` turns). The information is in `snap.log` but requires a separate traversal. UX improvement pending.

## Card notation

Compact single-letter color + digit:

| Letter | Color |
|---|---|
| R | red |
| Y | yellow |
| G | green |
| B | blue |
| W | white |

Example: `B3` = blue 3. `R5` = red 5.

## Deck composition

Per color: three 1s, two 2s, two 3s, two 4s, one 5. Ten cards per color × 5 colors = **50 cards total**.

The single copy of each 5 makes them critical — discarding a 5 locks that color at 4 points forever.

## File layout

```
<FIREWORKS_ROOT>/
└── games/
    └── <id>.yaml       # one file per game, atomic write + CAS
```

Each game file is a single `GameSnapshot` serialized as YAML. The `log` array inside is the append-only ledger of all moves. `version` is the CAS counter; the repository increments it on every save and rejects writes whose `loadedVersion` does not match.

## Concurrency

CAS on `snap.version`. Two concurrent writers (rare in single-user CLI but possible with scripts) detect each other: the second write sees a version mismatch and throws `GameVersionConflict`. Callers should re-read and retry.

## Philosophy (one line each)

- **Event-sourcing as SOT**: `snap.log` is the truth, state derives from it.
- **Pure functional mutations**: `(snap, input) → newSnap`, no in-place mutation.
- **Lens at the boundary**: ground truth in the snapshot, perspective at render.
- **Seedable**: `Math.random` is forbidden. All randomness goes through `Rng.fromSeed()`.
- **Strict flags**: typos shout, never silently ignored.
- **Atomic + CAS**: no torn writes, no lost updates.

For the longer vision (Card abstraction, pack distribution, Lua scripting, Eris Architecture resonance), see [`docs/ATELIER.md`](./docs/ATELIER.md).

## Gotchas

- `FIREWORKS_ROOT` is mandatory if you're invoking from outside the content root. Falling back to `cwd` is convenient but easy to lose track of.
- Player names must match `/^[a-zA-Z][a-zA-Z0-9_-]*$/`. No spaces, no Unicode, no leading digits.
- Seeds can be any string; they're FNV-1a hashed into a 32-bit PRNG state. Same string → same shuffle.
- `inform` cannot target a player who has zero cards matching the hint (wasmoon-level invariant not yet enforced — this is a pending strictness tightening).

## For other AI agents coming to this repo

If you want to play a game with another AI instance, the ledger file is the entire shared state. Push the game's `<id>.yaml` file anywhere — email, git, shared filesystem — and the receiving agent can resume from `show`. No network, no daemon, no DB.

If you want to propose a rule change or new verb, open an issue or PR against [`eris-ths/fireworks-cli`](https://github.com/eris-ths/fireworks-cli). Keep the CAS + lens invariants intact.
