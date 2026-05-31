# AdventureForge

A deterministic, headless, strictly-typed text-adventure engine whose **mechanics
live entirely in pure code** and whose **content lives entirely in AI-generated,
schema-validated data**. See [`ADVENTUREFORGE_BUILD_SPEC.md`](./ADVENTUREFORGE_BUILD_SPEC.md)
for the full spec.

## Status

### Stage 0 — deterministic core ✅

The trustworthy spine every later stage sits on. No content in the engine — just a core
the AI can later author into but cannot corrupt.

| Piece | File |
|---|---|
| Unified `GameState` (§6) | `src/core/state.ts` |
| Condition DSL + evaluator (§7.1) | `src/core/conditions.ts` |
| Effect DSL + pure reducer (§7.1) | `src/core/effects.ts` |
| Event log (§8.3) | `src/core/events.ts` |
| Seeded PRNG (§4.1, §8.5) | `src/core/rng.ts` |
| Canonical state hash (§8.6) | `src/core/hash.ts` |
| Pure `step` reducer + `Rules` resolver (§8.1, §8.4) | `src/core/engine.ts` |
| Save / load with content-hash integrity (§8.7) | `src/persist/save_load.ts` |
| Trace record / replay (§8.8) | `src/trace/` |

The Layer-2/Layer-3 boundary (§3) is enforced by the `Rules` resolver: the engine asks
content what an action means, but contains no content itself.

### Stage 1 — CYOA engine ✅ (schema · validator · play CLI)

| Piece | File |
|---|---|
| CYOA schema (§7.2) | `src/cyoa/schema.ts` |
| Pack loader (YAML → validated JSON + content hash) | `src/cyoa/pack.ts` |
| Runner: pack → `Rules` resolver (§8.4) | `src/cyoa/runner.ts` |
| AI-/human-facing observation (§9.1) | `src/cyoa/observation.ts` |
| CYOA validator (§10.1) | `src/validate/cyoa_validator.ts` |
| Sample pack: *The Watchtower Road* (20 scenes, 3 endings) | `content/cyoa/pack/watchtower_road.yaml` |
| Negative fixtures that MUST fail (§10.4) | `content/broken-fixtures/` |

The validator checks reference integrity, reachability, ending reachability, soft-locks,
dead ends, flag/item feasibility, contradictions, and duplicate endings. Where flags/items
make a property undecidable in general it uses a documented conservative approximation
(see header comments) rather than silently checking something weaker.

## Quickstart

```bash
npm install
npm run lint                                              # typecheck
npm test                                                  # unit + property tests
npm run replay                                            # Stage 0: round-trip a trace
npm run validate -- content/cyoa/pack/watchtower_road.yaml # Stage 1: validate a pack
npm run play -- content/cyoa/pack/watchtower_road.yaml     # Stage 1: play it (interactive)
```

Non-interactive play (scriptable / CI): add `--choices id1,id2,...` and optionally
`--record traces/run.json` to save a replayable trace.

### MCP server — how an agent plays the game (§9.4)

The engine is exposed as an MCP server so any agent harness (Claude Code, Codex,
Gemini CLI, …) plays via native tool calls over the structured observation/action
loop — never a raw parser. Tools: `validate_pack`, `load_pack`, `new_game`,
`get_observation`, `list_legal_actions`, `step_action`, `save_game`, `load_game`,
`replay_trace`. All paths are confined to the project root; content and traces are
data only (§16). The handlers (`src/mcp/tools.ts`) are unit-tested directly without
a live client.

```bash
npm run mcp   # start the stdio server
```

The project ships `.mcp.json`, so an MCP client opened in this repo can connect
automatically (approve the `adventureforge` server when prompted). The agent loop is:
`new_game` → read `observation.available_actions` → `step_action` with a chosen
`action_id` → repeat until `observation.ended`.

## Next: complete the Stage 1 loop

The pieces above are the engine half. The remaining Stage 1 work (§12–§13) is the
AI authoring loop with deterministic mock agents: writer → adapter → validator →
playtester → debugger → fixer, ending in a regression test that locks a found flaw.
Then Stage 2 graduates the same core to a Zork-style parser adventure.
