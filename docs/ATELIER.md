# Atelier — Vision & SDK

> AI-first ledger-driven game engine, successor to fireworks-cli v0.1.0.
> Status: vision draft (2026-04-22). Not yet materialized as a separate repo.
> **Repository plan**: atelier will be extracted into its own dedicated repository once the second prototype validates the substrate (Rule of Three). This document is drafted inside `fireworks-cli` for convenience but will migrate with the core when extraction happens.

## 1. Why Atelier exists

Hanabi-cli v0.1.0 proved that gate's architecture — append-only YAML ledger, optimistic-lock CAS, hidden-info lense at the interface boundary, seedable replay — generalizes to turn-based games. The next step is to treat "game construction" as a first-class activity that AI can perform: declaratively describe a game, register its cards, let the engine run it.

Atelier is the name of the workshop where that construction happens.

Three simultaneous goals:

- **CLI-native**: text-based, turn-based core. Real-time reflex games are out of scope for v1.
- **AI-first**: both playing and *authoring* games should be frictionless for an LLM. Verbs, flags, card YAML, lenses — all readable and writable by an AI operator.
- **Dogfood-able**: fireworks-cli migrates in as the first pack. Any rule discovered by fireworks-cli's play session can inform the core.

## 2. Layered architecture (Godot/Unity/Phaser mapped to CLI)

| Engine term | Atelier equivalent | Location |
|---|---|---|
| Scene / World | Snapshot (derived from Ledger) | domain per pack |
| Node / GameObject | Entity (Player, Card, Zone) | domain per pack |
| Component | Behavior | Card (Action/Effect/Rule) |
| Signal / Event | LogEntry | core's ledger |
| Prefab / Asset | Card definition | pack's `pack.yaml` |
| Viewport / Camera | Lense | core's lense system |
| Script (GDScript/C#) | **Lua** | pack's `scripts/*.lua` |
| Editor | AI-first Construction | prose + YAML, no GUI |

## 3. The Card abstraction (CDD's universal primitive)

Everything that is not engine-internal is a **Card**. Cards register themselves into the engine's registry at pack load time:

| Card kind | Purpose | Example |
|---|---|---|
| `action` | Exposes a CLI verb | `play`, `discard`, `inform`, `vote`, `move` |
| `effect` | Mutates state | `give-token`, `draw-from-deck`, `move-to-zone` |
| `rule` | Constrains actions | `cannot-inform-self`, `max-hand-size`, `phase-gated` |
| `role` | Player identity | `villager`, `werewolf`, `seer`, `dm` |
| `zone` | Storage region | `hand`, `deck`, `discard`, `grid-cell` |
| `lense` | Visibility perspective | `spectator`, `player`, `fog-of-war`, `seer` |
| `observer` | AI participant | `bonsai-commentator`, `rule-validator` (future) |
| `scenario` | Narrative/phase branch | `day-ends-with-vote`, `night-phase-wakes-werewolves` |

Cards can be defined three ways, in order of AI-writability (highest first):

1. **YAML card**: fully declarative, most AI-writable. Suitable for roles, zones, lenses, simple rules.
2. **Lua card**: scripted card with access to engine API. Suitable for complex effects, scenario hooks, NPC AI heuristics.
3. **TS native card**: engine-level plugin, type-safe, compile-time checked. Suitable for performance-critical or API-contract cards.

## 4. Pack — the unit of distribution

A **pack** is a bundle of cards that defines a complete playable game (or a supplemental expansion). Packs are what users install and load; cards are what the engine internally routes.

```
packs/fireworks/
├── pack.yaml              # manifest: name, version, atelier_core range, cards
├── src/
│   ├── domain/            # game-specific TS value objects
│   ├── handlers/          # verb handlers
│   ├── lenses/            # lense functions
│   └── index.ts           # export default definePack({...})
├── scripts/               # Lua scripts (optional)
│   └── end_check.lua
├── prompts/               # AI observer prompts (future)
│   └── commentator.md
└── tests/
```

### Genre packs (for the long term)

The `Shooting` and `RPG` genres Nao mentioned are packs too. Their "real-timeness" is emulated by tick-based turns in the CLI; each tick is a ledger entry, and multi-action bursts are just consecutive log entries within a single ledger write.

- **shooting**: turn = tick (100ms in ledger time, batched on the CLI side). Each tick advances positions, resolves shots. Lua handles trajectory & collision.
- **rpg**: turn = combat round or scene transition. Deep use of role cards, scenario cards, lua scripting for custom abilities.

## 5. Engine core API (`atelier-core`)

```ts
// Snapshot contract — every pack's state extends this
export interface LedgerSnapshot {
  readonly version: number;
  readonly log: ReadonlyArray<LogEntry>;
  readonly status: string; // 'in_progress' | pack-defined final states
}

export interface LogEntry {
  readonly turn: number;
  readonly at: string;
  readonly by: string;
  readonly kind: string;
  readonly [extra: string]: unknown;
}

// Pack definition — what each pack exports
export interface PackDefinition<S extends LedgerSnapshot> {
  readonly name: string;
  readonly version: string;
  readonly atelierCore: string; // semver range
  readonly cards: ReadonlyArray<Card>;
  readonly newSnapshot: (input: NewGameInput) => S;
  readonly lenses: Record<string, LenseFn<S>>;
}

// Card contract
export type Card =
  | ActionCard
  | EffectCard
  | RuleCard
  | RoleCard
  | ZoneCard
  | LenseCard
  | ObserverCard
  | ScenarioCard;

export interface ActionCard {
  readonly kind: 'action';
  readonly name: string;
  readonly knownFlags: ReadonlySet<string>;
  handle(parsed: ParsedArgs, ctx: VerbContext): Promise<number>;
}

// Engine API (what pack authors get)
export interface Engine<S extends LedgerSnapshot> {
  readonly repo: AggregateRepository<S>;
  readonly lense: LenseRegistry<S>;
  readonly lua: LuaContext;
  readonly now: () => Date;
  advance(snap: S, entry: LogEntry, extra: Partial<S>): S; // version+1, log+=entry
}
```

## 6. Lua layer (`atelier-core/lua`)

### Why Lua

- **Sandboxable**: strip `os`, `io`, `package`; only pure computation + engine API
- **Small**: wasmoon (WASM-built Lua 5.4) is ~500KB; embeds in Node without native deps
- **Familiar**: Love2D, WoW, Factorio, Roblox — game modders already speak Lua
- **Fast**: interpreted but fast enough for card effects; can be precompiled

### What Lua scripts can do

```lua
-- packs/fireworks/scripts/end_check.lua
-- Receives the snapshot view, returns a new status if game ends
function on_after_turn(snap)
  local score = sum_fireworks(snap.fireworks)
  if score == 25 then return "won" end
  if snap.missTokens >= 3 then return "lost_by_miss" end
  if snap.finalRoundRemaining == 0 then return "ended_empty_deck" end
  return "in_progress"
end
```

### What Lua scripts cannot do

- No filesystem access (atelier manages persistence)
- No network
- No require of arbitrary modules (only engine-whitelisted)
- No direct mutation of snapshot (must return new values)

### Binding

`wasmoon` (https://github.com/ceifa/wasmoon) — pure WASM Lua runtime for Node/browser. No native compilation, cross-platform.

## 7. AI Observer layer (future)

Reserved slot in the architecture; implementation deferred.

```ts
interface AIObserver {
  readonly name: string;
  readonly model: 'bonsai-8b' | 'gemma-3-1b' | 'phi-3-mini' | string;
  readonly lense: string;              // "spectator" | "player:eris"
  readonly trigger: 'every_turn' | 'every_phase' | 'on_demand';
  observe(view: LensedSnapshot): Promise<string>;
  suggest?(view: LensedSnapshot): Promise<Move>;
}
```

Observers receive the same lensed view that a human would; they can comment, suggest, or (in NPC mode) act. The same contract covers spectator commentators and NPC agents — which is how Eris Architecture's "summoned subagent" pattern resonates with game AI.

## 8. Eris Architecture resonance

| Atelier concept | Eris Architecture | Note |
|---|---|---|
| Rule Card | Rules | Always-applied constraints |
| Action/Effect Card | Skills | Equip to use |
| Observer Card | Agents | Delegate and receive |
| Lense Card | Lense Skill | Perspective provider |
| Scenario Card | CDD (Card-Driven, agent-first) | AI composes |
| Pack | Loadout | Bundle of equippable capability |
| Ledger + CAS | principle 01-06 | Inherited from gate |

## 9. Construction — how a game gets made

Two modes, both AI-first:

### Mode A: prose → YAML

Human (or AI) describes the game in natural language:

> "A social deduction game, 6-12 players, with roles villager/werewolf/seer. Night phase werewolves wake and kill one player. Day phase everyone votes. Majority-vote kills the target. Seer can investigate one player per night, learning their role. Game ends when all werewolves are dead (village wins) or villagers equal werewolves (werewolf wins)."

AI produces `packs/werewolf/pack.yaml` + the required Lua scripts + handler stubs. Core engine validates against the Card contract and either runs it or reports gaps.

### Mode B: pack modification via prompt

> "Add an Insomniac role that wakes at the end of the night and learns who the werewolves are, but cannot act. Add a corresponding seer-lense card."

AI edits the pack's YAML + adds a new role card + a new lense. The diff is a ledger-friendly record of the modification itself (meta-ledger).

Both modes converge on the same destination: Card YAML + optional Lua + optional TS handler.

## 10. Versioning & compatibility

- **atelier-core**: semver. Packs declare a range in `pack.yaml`.
- **Pack**: semver. Old save games reference `pack.version`; replay compatibility is a core concern.
- **Card**: no independent version; cards are bundled with their pack.
- **Ledger format**: append-only, with a `schema_version` header. Migration is only ever forward.

## 11. Roadmap (from this vision document to reality)

- [x] fireworks-cli v0.1.0 — proof that the pattern works
- [ ] `docs/ATELIER.md` — this document
- [ ] Lua binding PoC — wasmoon integration, one Lua-driven rule in fireworks
- [ ] Extract `atelier-core` — move shared primitives out of fireworks-cli
- [ ] Migrate fireworks-cli into atelier as `packs/fireworks/` — current standalone repo becomes the first pack in the atelier monorepo. **Atelier will live in a separate repository**; this document is drafted here for convenience but intended to migrate with the core when the second prototype matures.
- [ ] Second pack — tiny prototype (probably tic-tac-toe or coin-flip) to verify Pack contract
- [ ] YAML-defined card loader — Mode A construction enabled
- [ ] AI Observer contract frozen (implementation deferred)
- [ ] Werewolf pack (first nontrivial genre test)
- [ ] Shooting / RPG genre packs (long horizon)

## 12. Security & Quality Charter

Atelier inherits guild-cli v0.3.0 as its quality baseline. Development pace is prioritized, but security discipline stays load-bearing. Explicit rules:

### Quality baseline (from guild-cli)

- **TypeScript strict mode**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` — all on. No `any` without a commented justification.
- **Test-as-contract**: every verb has an end-to-end test; every domain invariant has a unit test. No new verb lands without a test pinning its happy path and one failure path.
- **CHANGELOG.md with BREAKING marker**: 0.x strict-variant semver. Breaking changes require a `### BREAKING` section and a migration note.
- **SECURITY.md**: threat model documented from day one. Updated whenever a new trust boundary is introduced (packs, Lua, observers).
- **POLICY.md**: contribution norms — what goes in a PR, when to fold a draft, how to update docs inline vs follow-up.
- **Devil review habit**: every nontrivial PR gets a Two-Persona Devil pass (author + independent reviewer) before merge. For single-author work, reuse the `gate review` pattern as a self-Devil self-check.
- **Principle 05 (read/write separation)**: verbs are either read-only or mutating, never both. Compose, don't conflate.

### Security discipline (elevated for Atelier due to Lua + packs)

**Trust boundaries (ranked by exposure)**:

1. **Core engine code (TS)** — trusted. Reviewed before merge. Signed commits encouraged.
2. **First-party packs (fireworks, future built-ins)** — trusted. Same review standard as core.
3. **Lua scripts in first-party packs** — trusted but sandboxed. Belt-and-suspenders.
4. **Third-party packs (future)** — untrusted. Must load into a sandbox. `os`, `io`, `require`, `package`, `debug` are denied. FS access is mediated through the engine's `safeFs`, not Lua's.
5. **User-provided seeds / player names / move inputs** — untrusted. Strict validation at the CLI boundary (`rejectUnknownFlags`, regex-validated identifiers).
6. **Saved game files** — untrusted after leaving the writer's machine. Loaded as data only, not as code. YAML parser strict, no anchor loops, no tag injection.

**Concrete controls**:

- **Lua sandbox**: `wasmoon` is started with a whitelisted globals table. Deny list is hard-coded in `atelier-core/lua/sandbox.ts`. A single test exists that tries every dangerous global and asserts each is absent.
- **No eval from YAML**: pack YAML cannot embed TS/JS/shell. Scripts referenced by path only; path must resolve inside the pack's directory (`safeFs.assertUnder`).
- **Ledger integrity**: atomic write + CAS inherited as-is. Optional future: per-entry HMAC for tamper detection (deferred).
- **Seeded-but-deterministic**: shuffle/RNG are seed-driven; no `Math.random()` anywhere in the engine or first-party packs. A test greps for `Math.random` and fails if found.
- **Supply chain minimalism**: production dependencies limited to well-known, audited packages (`yaml`, `wasmoon`). New dependencies require review before adoption.
- **Dependency pinning**: `package-lock.json` committed. CI (when added) runs `npm audit` and fails on critical findings.

### Speed arrangement (vs. guild-cli)

Areas where Atelier relaxes guild-cli's rigor in exchange for velocity, *without* touching security:

- **MVP-first testing**: domain tests are strict, UX tests can be snapshot/smoke initially and harden over time.
- **Docs generated from source** where possible: verb list, card registry, pack list — derived from code, not hand-written. (Traps: the ledger docs stays hand-written because the format is a contract.)
- **CI deferred** until the second pack lands: local test runs are sufficient while the team is one author + AI.
- **No release pipeline** until 1.0: git tags are the release medium; formal npm publishing deferred.

### The one non-negotiable

**Silent failures are the enemy.** A typo in a flag should shout. A rule that can't fire should log why. A Lua script that tries a denied operation should error loudly, not return nil. Every layer — CLI parser, YAML loader, Lua sandbox, ledger writer — follows the principle: fail loud, fail specific, fail recoverable.

## 13. The deeper claim

Eris Architecture, CDD, gate's principles, fireworks-cli's ledger, and game engines like Godot are all describing the same underlying structure: **event-sourced systems with perspective-dependent views, constructed from composable declarative cards**. Atelier is the proof-of-concept that makes that claim operational in the game domain.

Gate does it for human collaboration. Atelier does it for games. The next one might do it for something else.
