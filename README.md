# hanabi-cli

Cooperative card game (花火 / Hanabi) as an append-only YAML ledger CLI.

Forked from [eris-ths/guild-cli](https://github.com/eris-ths/guild-cli) v0.3.0 — the infrastructure (YAML repo, atomic write, CAS, strict flag validation, verb dispatcher, DDD clean architecture) is carried over; the game-specific domain (Card, Deck, Hand, Game aggregate, turn state machine) is written fresh.

## Why this exists

To prove that the gate CLI's architecture — append-only event log, actor system, state machine, lense-based information control — generalizes to turn-based games with hidden information. Hanabi is chosen because:

- **Cooperative** — resonates with guild-cli's emotional register (thanks / review, not adversarial)
- **Hidden info** — your own hand is face-down, others' hands are face-up. This is a natural stress-test for the lense system (same ledger, different views per player)
- **Small rule set** — playable in ~200 lines of domain logic, keeps the MVP focused
- **Replay-friendly** — every move is a ledger entry, games replay deterministically with a seed

## Status

Day 1 scaffolding (2026-04-22). Not yet playable.

## Design pedigree

- **Event-sourcing**: guild-cli's append-only YAML pattern. Every `play` / `discard` / `inform` is a record; the game state is a pure derivation over the log.
- **Actor-perspective lense**: `hanabi show --as <player>` hides that player's own hand while showing others'. Same design philosophy as `gate voices --lense <l>`.
- **Deterministic replay**: shuffle seed stored in the ledger header; replaying the log reconstructs any state.
- **CAS on multi-action turns**: optimistic lock inherited from guild-cli (RequestVersionConflict → GameVersionConflict).

## License

MIT
