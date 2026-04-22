# Forward prototypes (beyond fireworks-cli/atelier)

> Vision document, 2026-04-22.
> Two additional prototypes that share the atelier substrate (event-sourced ledger + card registry + lense + sandbox + CAS).

## Context

Hanabi-cli v0.1.0 proved the pattern for a game. Atelier (§ docs/ATELIER.md) generalizes the pattern for a pack-based game engine. Both rest on the same architectural substrate:

- **Append-only YAML ledger** — the SOT, from which state derives
- **Optimistic-lock CAS** — version-counter on the aggregate
- **Pure-functional mutations** — `(snap, input) → newSnap`
- **Lense at the boundary** — same ledger, different views
- **Card registry** — composable primitives (action / effect / rule / role / zone / lense / observer / scenario)
- **Sandbox** — Lua for user-scriptable extension, with a hard whitelist
- **Strict CLI parser** — `rejectUnknownFlags`, principle 05 read/write separation

The claim: this substrate is not game-specific. It is **the shape of event-sourced, perspective-dependent, composable-plugin systems**. Two upcoming prototypes test that claim.

## Prototype 1: Gemini ReAct agent (ledger-driven)

### Goal

A Gemini-powered ReAct loop agent, but implemented on atelier-core instead of the usual ad-hoc `{ thoughts, action, observation }` loop with in-memory state. The difference is that every step of the agent's reasoning becomes a ledger entry; the same replay / lense / CAS machinery applies to agent traces that applies to game turns.

### Why atelier-core fits

| ReAct concept | Atelier mapping |
|---|---|
| Agent thought / reasoning step | LogEntry (kind: `thought`) |
| Tool invocation | Action Card (kind: `action`, flags = tool params) |
| Tool observation | LogEntry (kind: `observation`) |
| Agent memory | Derived state from ledger (no separate store) |
| Chain-of-thought trace | The ledger itself — already persistent, replayable |
| Retry / branch exploration | CAS + snapshot fork |
| Multi-agent collaboration | Multiple actors on same ledger (guild-cli's pattern) |
| Agent "view" (what's given to the LLM) | Lense (`show --as <agent>`) |

### Cards needed (ReAct-specific)

```yaml
kind: action; name: think     # LLM generates reasoning, append as LogEntry
kind: action; name: use-tool  # invoke a tool card, append result
kind: action; name: finalize  # terminate loop with answer

kind: observer; name: gemini-reasoner
  model: gemini-2.5-pro
  lense: agent-self  # sees its own trace, hides scratch
  trigger: on_after_turn_self

kind: tool; name: web-search   # Action Card wrapper around Gemini's search tool
kind: tool; name: code-exec    # Wrapper around code execution

kind: rule; name: tool-budget  # max N tool calls per loop
kind: rule; name: loop-terminates # forces finalize after max_steps
```

### CLI UX

```sh
agent new --goal "find the latest paper on X" --budget 10
agent step --by gemini      # advance one ReAct cycle: think -> action -> observe
agent show --as gemini      # what the agent sees right now
agent show                  # full trace (spectator lense)
agent replay <id>           # walk the trace turn-by-turn
```

### Security considerations (inherited + new)

- **Tool sandbox**: code-exec must run in a wasmoon sandbox (same as Lua scripts) OR a separate process with strict IPC. No `child_process` directly.
- **Prompt injection defense**: observations from tools are data, not instructions. Lense layer marks them explicitly when presenting to the LLM.
- **Budget enforcement**: rule card `tool-budget` is declarative; engine enforces before the LLM sees its next turn.
- **Ledger integrity**: agent cannot rewrite past entries (append-only, CAS on version).

### MVP scope (one session of work)

- `think` verb (LLM call, append reasoning)
- `use-tool` verb with one tool (web-search via Gemini API)
- `finalize` verb
- `show --as gemini` lense (hides raw chain-of-thought when desired)
- `replay` verb

~400-600 LoC on top of atelier-core.

## Prototype 2: Mini Claude Code (Skill / Memory / Rules / Hooks / MCP / Plugins / SubAgents)

### Goal

A minimal re-implementation of Claude Code's operator framework (the parts Claude Code exposes: Skill, Memory, Rules, Hooks, MCP, Plugins, SubAgents), on atelier-core. Not a Claude Code replacement — an exploratory prototype that proves the substrate handles operator-framework concepts.

### Why atelier-core fits

| Claude Code concept | Atelier mapping |
|---|---|
| **Skill** | Skill Card (kind: `skill`, activation trigger, scripted behavior) |
| **Memory** | Ledger + derived index. No separate store; memories are log entries tagged `kind: memory`. |
| **Rules** | Rule Card (always-applied constraints, loaded at session start) |
| **Hooks** | Lifecycle Card (kind: `hook`, trigger: `pre_verb`/`post_verb`/etc) |
| **MCP** | External Observer Card (sandboxed subprocess, IPC over stdio) |
| **Plugins** | Pack (atelier's pack = Claude Code's plugin structurally) |
| **SubAgents** | Secondary actors on the ledger with their own lense + prompt |
| Session context | Snapshot |
| Resume | `replay` to last snapshot + open loops |

### Card taxonomy (operator-framework specific)

```yaml
kind: skill
name: ember-architecture
trigger: activates_when   # declarative: "when user mentions ember"
script: scripts/ember.lua  # or embedded inline
description_as_lense: true # skill's description is a perspective filter

kind: rule
name: context-efficiency
always_applied: true
constraint: file_reads_with_offset_limit_over_N_lines

kind: hook
name: pre-commit-devil-review
trigger: pre_verb:commit
script: scripts/devil.lua

kind: observer     # aka MCP
name: gate-mcp
transport: stdio
command: ["node", "./gate-mcp.mjs"]
exposes: [gate_voices, gate_show, gate_chain]

kind: actor        # aka SubAgent
name: noir
lense: devil
prompt_ref: prompts/noir.md
invocation: summoned  # not always-on; summoned by primary actor
```

### CLI UX

```sh
claudette session start
claudette skill equip ember-architecture
claudette memory search "gate architecture"
claudette hook run pre-commit-devil-review --target <file>
claudette mcp call gate_voices --actor eris
claudette subagent summon noir --task "review PR #81"
claudette resume                # replay ledger to current state
```

### Security considerations

- **Skill scripts**: all Lua, sandboxed. No filesystem access except via engine-mediated safeFs.
- **MCP subprocess isolation**: stdio only; no shared memory; resource limits via process group.
- **Hook validation**: hooks declare their own input/output contracts; engine verifies before invoking.
- **SubAgent boundary**: subagent LLM calls are separate ledger entries with their own actor name; primary actor cannot silently speak as subagent.

### The subtle point

Claude Code's model is that **Skills, Rules, etc. are always-on or equipped at session start**. This maps cleanly to atelier's distinction between:

- **Rule Cards** = always applied (= Rules in Claude Code)
- **Skill Cards** = loaded at session start if conditions met (= Skills)
- **Action Cards** = invoked per-turn (= verb / tool call)
- **Observer Cards** = summoned or continuous (= SubAgent / MCP)

The atelier substrate doesn't just *support* this distinction — it was *designed* for it (via gate's principle 06 orthogonality and Eris Architecture's Rules/Skills/Agents tiering). Mini Claude Code prototype validates that the design was right.

### MVP scope (one session of work)

- Ledger session (start, resume)
- Skill / Rule / Hook card types (YAML-declarative)
- One hook: devil-review scripted in Lua
- One MCP: echo server for contract validation
- `summon` verb for subagent
- ~500-800 LoC on top of atelier-core.

## Why these three prototypes together matter

Atelier + Gemini agent + Mini Claude Code form a **triangle of evidence** for the substrate's generality:

1. **Atelier (games)** — turn-based domain with hidden info, hard rules, 2-12 actors, replay-critical
2. **Gemini agent (ReAct)** — single actor, external world (tools), soft "rules" (budgets), CoT privacy
3. **Mini Claude Code (operator)** — meta-level: the agent constructs its own augmentations (skills, memories, subagents)

If all three fit naturally on the substrate, we've found a **primitive**. Not a library — a way of thinking about interactive systems with persistent state, sandboxed extension, and perspective-dependent views.

### Rule of Three trigger

At the point the third prototype is working, `atelier-core` should be extracted into its own repo as the stable base for all three. Until then, each prototype may keep its own inline copy; divergences are informative (they tell us what's actually game-specific vs. generic).

## Open questions

- How does pack/plugin signing work for third-party distribution? (Defer: not in scope for single-user first.)
- Should the ledger become pluggable (SQLite / JSONL) while preserving CAS semantics? (Defer: YAML is sufficient until multi-million-entry sessions.)
- Can Lua be replaced by WASM component model for a stricter language-agnostic extension layer? (Interesting future direction.)
- What is the right visualization layer (terminal TUI, web, plain text)? (Probably multiple, with lense-driven output formatter cards.)

## Schedule

No schedule is claimed. These are vision-level. Implementation proceeds as appetite permits, one session at a time, with each session ending in commit-worthy progress.

The emotional register of this roadmap is: **curious, unhurried, honest when it breaks**. That is inherited from fireworks-cli's design session and stays in force.
