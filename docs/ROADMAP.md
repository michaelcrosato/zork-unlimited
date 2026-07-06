# AdventureForge Roadmap

This roadmap is current operational guidance. Historical multi-mode plans live in
git history, not in the active roadmap.

AdventureForge is converging on one product: a deterministic, text-based,
open-world RPG engine whose shipped content is placed through a contiguous world
graph.

## North Star

- One runtime mode: `rpg`.
- One shipped-content catalog: `list_world`.
- One shipped-content source key: `world_quest_id`.
- One shipped quest start path: `start_world_quest`.
- One autonomous loop: inspect, change one aligned surface, verify, commit.
- One world model: grow from graph routes toward a dense coordinate or matrix map
  without adding another game mode.

## Current Anchors

- `AGENTS.md` is the trust-but-verify charter.
- `ADVENTUREFORGE_BUILD_SPEC.md` is the active build spec.
- `content/world/charter_marches.yaml` is the shipped RPG quest graph.
- `content/world/new_york_overworld.json` is the large contiguous overworld data
  source.
- `src/world/session.ts` is the primary stateful overworld runtime.
- `src/mcp/tools.ts` is the tested ToolApi source of truth.
- `src/validate/rpg_foundation_validator.ts` carries high-depth RPG foundation
  checks.
- `AI_LOOP_STATE.md` is the compact cycle handoff; old detail belongs in git
  history or ignored local artifacts.

## Priority Order

1. Engine stability: harden reducer invariants, event lifecycle state, restore
   validation, and trace replay.
2. Gameplay depth: mature combat formulas, stat tables, scaling progression,
   environmental flags, quest stages, and stateful NPC/event consequences.
3. Token efficiency: keep MCP/ToolApi payloads compact by default; add hash-only
   reads, stale-write guards, capped arrays, and id-first layouts.
4. Open-world consolidation: flatten package-era shortcuts into world graph
   identity and move toward coordinate or matrix navigation where it improves
   play.
5. Content expansion: add or polish quest content only after the relevant engine,
   gameplay, and token surfaces are mature enough to support it.

## Near-Term Work Queue

- Split large world-session behavior into smaller tested subsystems without
  changing public tool contracts.
- Add more restore-time proofs for event lifecycle consistency and derived
  progress state.
- Make compact overworld/RPG responses more uniform: ids first, labels only where
  needed, omitted counts for capped lists.
- Continue retiring package-path exposure from public CLI, MCP, docs, and loop
  prompts.
- Expand RPG mechanics only with deterministic tests and validator coverage.
- Keep active docs short and current; move old planning detail to git history.

## Verification

Every cycle that changes source, docs, tests, content, schemas, or tooling must
finish with:

- `npm run health`
- `npm run validate`
- `npm test`

Focused tests should run first when a change has a clear local guard. Do not
weaken validators, protected assets, or `scripts/verify-integrity.ts` to make a
change pass.

## Completion Checks

The roadmap is achieved only when current evidence proves:

- shipped play, validation, replay, inspection, save/load, and blind playtests all
  use world graph identity instead of raw package paths;
- active docs and agent prompts no longer direct work toward retired engine
  variants;
- the world graph is the visible content structure for shipped play;
- state persistence rejects malformed, forged, stale, or cross-source restores;
- compact loop surfaces let long-running agents play and audit with bounded
  context;
- `npm run validate` and `npm test` pass on the final tree.
