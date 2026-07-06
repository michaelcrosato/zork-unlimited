# AdventureForge Build Spec

## Unified Open-World RPG Engine

This is the active build specification for AdventureForge. The project is no
longer a staged text-game sampler. It is a single deterministic, text-based,
open-world RPG engine backed by a contiguous world graph.

`AGENTS.md` is the operating charter. The short version is trust, but verify:
agents may change engine code, schemas, content, tooling, and docs, but every
substantive change must keep the repo green.

## Current Objective

AdventureForge should converge on one architecture:

- One runtime mode: `rpg`.
- One public shipped-content source key: `world_quest_id`.
- One world catalog: `list_world`.
- One shipped quest start surface: `start_world_quest(world_quest_id)`.
- One action loop: observe, list legal actions when needed, step by stable
  `action_id`, checkpoint by state hash.
- One contiguous world model: a hub-and-route graph that can grow toward a dense
  coordinate or matrix world without adding another game mode.

Retired variants are not implementation targets. Do not rebuild the old CYOA
engine, the old semantic-command engine, or standalone package-mode authoring
surfaces. Historical docs and traces may mention them, but active code and active
agent instructions must point at the RPG world graph.

## Architecture

The LLM is never the game engine. The engine is deterministic code; content is
validated data; agents interact only through structured APIs.

### Layer 1: World And Content Data

- `content/world/new_york_overworld.json` holds the contiguous overworld data.
- `content/world/charter_marches.json` holds the shipped RPG quest graph.
- `content/rpg/quests/*.yaml` holds RPG quest packs registered through the world
  graph.
- Raw pack paths are edit metadata, not public play or validation sources.

### Layer 2: Deterministic Engine

- `src/core` owns pure state, effects, hashing, and deterministic transitions.
- `src/rpg` owns RPG schema, rules, observations, legal actions, and reducers.
- `src/world` owns world source loading, routes, and overworld sessions.
- `src/persist` owns save/load integrity.
- `src/trace` owns record/replay.
- `src/validate` owns validators and reports.

The reducer must be deterministic: same content, seed, save, and action sequence
produce the same state hash.

### Layer 3: Agent And Tool Surfaces

- `src/mcp/server.ts` exposes tools over MCP.
- `src/mcp/tools.ts` is the tested ToolApi source of truth.
- `bin/validate.ts`, `bin/replay.ts`, `bin/inspect.ts`, and `bin/rpg_play.ts`
  are operator surfaces.
- `agents/` and `src/ai-loop.ts` coordinate autonomous improvement cycles.

Adapters should be thin. Engine behavior belongs below the MCP and CLI layers.

## Public Gameplay Contract

Use these surfaces for shipped world play:

- `list_world({ include_graph?, include_routes? })`
- `world_path({ world_quest_id })`
- `start_world_quest` with `world_quest_id`, optional `seed`, `hide_graph`, and
  `compact_observation`
- `get_observation({ session_id, if_state_hash?, compact_observation? })`
- `list_legal_actions({ session_id, if_state_hash?, compact_actions? })`
- `step_action({ session_id, action_id, expected_state_hash? })`
- `save_game({ session_id, expected_state_hash? })`
- `load_game({ save, world_quest_id?, generate_rpg_seed? })`
- `get_transcript({ session_id, summary_only?, compact_summary? })`
- `replay_trace` and `inspect_trace` for deterministic audit paths.

`new_game` is generated-RPG only. It must not become a shortcut for shipped
quest starts.

## State And Persistence Requirements

Saves and traces must be RPG-mode only. Missing, malformed, or legacy modes are
integrity failures, not migration inputs.

Core state must preserve:

- player location and visited locations
- inventory and object state
- flags, vars, and journal history
- vitals, stats, checks, combat state, and endings
- world quest identity or generated-RPG seed identity
- deterministic step count and state hash

Restore paths must reject forged or incoherent references before returning a
playable session.

## Open-World Consolidation Rules

The world graph is the source of shipped quest placement. A quest pack is not a
public game by itself; it becomes playable when registered in the world graph.

Future world expansion should move in this order:

1. Strengthen engine invariants and restore integrity.
2. Strengthen gameplay systems: combat formulas, stat tables, scaling,
   environmental flags, quest stages, and event lifecycle rules.
3. Strengthen token-efficient context packing for long autonomous play.
4. Only then add descriptive content or new quest nodes.

If a content structure blocks consolidation, remove the package-era shortcut and
route the content through world graph identity instead of preserving the shortcut.

## Token-Efficiency Requirements

Agent-facing surfaces should be compact by default and verbose by explicit opt-in.

Required patterns:

- Return state hashes and snapshot hashes so callers can use `if_*_hash`.
- Reject stale mutations with `expected_*_hash` before changing state.
- Prefer ids over repeated labels in compact payloads.
- Cap compact inventory, flag, journal, action, and transcript arrays with omitted
  counts when needed.
- Keep `AI_LOOP_STATE.md` to the tested live window; old detail belongs in git
  history or ignored local artifacts.
- Keep raw logs, blind reports, generated evidence, and run output out of tracked
  files unless they are curated bug artifacts.

## Verification Bar

For normal repo changes, run:

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run validate`
- `npm run health`

`npm run health` already includes integrity, typecheck, lint, format check, full
tests, and validation. The autonomous cycle still runs explicit `npm run
validate` and `npm test` before commit because the current operator contract
requires it.

Do not weaken tests, validators, protected assets, or `scripts/verify-integrity.ts`
to make a change pass.

## Bug And Regression Rules

When fixing a bug:

- Reproduce it with the smallest deterministic trace or unit fixture available.
- Add or keep a regression test.
- Add a curated `traces/bugs/` artifact when the surrounding workflow calls for
  trace evidence.
- Verify the full bar before commit.

## Agent Cycle

Each cycle is:

1. Run the configured maintenance cleaner.
2. Inspect current state with targeted `rg`, `git`, and ranged reads.
3. Pick one change that makes the unified RPG end state more true.
4. Edit code, docs, schema, tooling, or tests.
5. Run focused tests.
6. Run `npm run health`, `npm run validate`, and `npm test`.
7. Record a terse `AI_LOOP_STATE.md` entry.
8. Commit and push.
9. Pause at the cycle boundary when the operator requests it.

## Completion Audit

The goal is not complete until current evidence proves all of these:

- No active CYOA runtime, content tree, binary, or test fixture remains.
- No active semantic-command runtime, content tree, binary, or test fixture
  remains.
- Public shipped play starts through `world_quest_id`.
- Shipped content is discoverable through a contiguous world graph.
- Saves, traces, and sessions are RPG-mode only.
- Core engine, gameplay, persistence, and token-efficiency checks are mature and
  covered by tests.
- `npm run validate` and `npm test` pass on the final state.
