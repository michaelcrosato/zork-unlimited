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

### Stage 2 — Zork-style parser adventure ✅

The same Stage-0 core, now driving a parser game: rooms, objects, containers, locked
doors, an NPC dialogue tree, and USE puzzles — exposed to agents as a Jericho-style
**legal-action set**, never a raw parser to guess at.

| Piece | File |
|---|---|
| Parser schema (§7.3) | `src/parser/schema.ts` |
| World model: object location, containers, dialogue state | `src/parser/model.ts` |
| Legal-action generator + resolver (§9, §9.2) | `src/parser/legal_actions.ts` |
| Runner: pack → `Rules`, win conditions on room entry (§8.4) | `src/parser/runner.ts` |
| Parser observation (§9.2) | `src/parser/observation.ts` |
| Controlled human command parser (§9.3) | `src/parser/command_map.ts` |
| Parser validator (§10.2) | `src/validate/parser_validator.ts` |
| Sample pack: *The Sealed Crypt* (10 rooms, 8 objects, 2 containers, 2 locked doors, 1 NPC, 2 puzzles) | `content/parser/pack/sealed_crypt.yaml` |
| Negative fixtures that MUST fail (§10.4) | `content/broken-fixtures/parser_*.yaml` |
| 8-persona playtester roster (§12.8) | `agents/parser_playtester.ts`, `agents/parser_personas.ts` |
| Bug artifact + regression (§15) | `traces/bugs/bug_0001_*.yaml`, `tests/regression/parser_crypt_softlock.test.ts` |

Two small **additive** engine extensions went through the §14 gate: an
`ObjectRuntime.room` field and a `place_object` effect (both needed for DROP).
Every existing CYOA trace still replays to an identical hash.

The parser validator adds the §10.2 invariants on top of graph reachability:
locked-exit/locked-container key satisfiability, an item-obtainability fixpoint
(keys that unlock containers that hold keys…), `quest_critical` permanent-loss
guards (consumption and one-way-map drops), dialogue-tree termination, and
win reachability — each with a documented conservative approximation.

### Stage 3 — Sierra-Quest style (score · death/restore · puzzle chains) ✅

Same core again, now with a **score**, **death endings recoverable via load**, and
longer puzzle chains.

| Piece | File |
|---|---|
| Score (`inc_var` on a `score` var) + `max_score`, `ending.death` flag | `src/parser/schema.ts` |
| Validator extensions (§13 Stage 3) | `src/validate/parser_validator.ts` |
| Sample pack: *The Alchemist's Tower* (brew an antidote; a fatal black phial) | `content/parser/pack/alchemists_tower.yaml` |

Scoring is a conventional `score` var awarded via `inc_var`; death endings are
terminal non-win endings reached by an `end_game` effect, and are recoverable by
loading a pre-death save (§8.7). The validator adds **score reachability**
(`max_score` ≤ total awards), **`end_game` target declared**, **win-is-not-death**,
and **at-least-one-winnable-ending** — no engine change was needed.

### AI authoring — packs from prose (§11, §12.1–3)

A pack can be **authored from a one-line premise** by the writer → adapter →
validator loop. The writer drafts prose + beats; the adapter emits a CYOA pack and
classifies each beat against the engine contract (`content/engine_contract.yaml`,
§11); it loops against the validator until the report is green — the validator, not
the model, decides correctness (§16). The default `MockAuthorProvider` is
deterministic (no API keys); its first attempt ships a dangling reference and
self-corrects once the validator's errors are fed back. A real provider slots in
behind an env var (§12.7).

```bash
npm run author -- "A keeper must relight a dead lighthouse before a ship wrecks."
```

The same pipeline is exposed over MCP as the `adapt_story` tool.

## Quickstart

```bash
npm install
npm run lint                                              # typecheck
npm test                                                  # unit + property tests
npm run replay                                            # Stage 0: round-trip a trace
npm run validate -- content/cyoa/pack/watchtower_road.yaml # Stage 1: validate a pack
npm run play -- content/cyoa/pack/watchtower_road.yaml     # Stage 1: play it (interactive)
npm run validate -- content/parser/pack/sealed_crypt.yaml  # Stage 2: validate the parser pack
npm run play:parser -- content/parser/pack/sealed_crypt.yaml # Stage 2: play it (interactive)
npm run playtest:parser -- content/parser/pack/sealed_crypt.yaml # Stage 2: the §12.8 roster
npm run play:parser -- content/parser/pack/alchemists_tower.yaml  # Stage 3: score + death/restore
npm run author -- "your one-line premise here"             # author a pack from prose (§12.1-3)
```

Non-interactive play (scriptable / CI): for CYOA add `--choices id1,id2,...`; for the
parser add `--commands "go north; take rope; ..."`. Both accept `--record traces/run.json`
to save a replayable trace. `npm run validate` auto-detects CYOA vs parser packs.

### MCP server — how an agent plays the game (§9.4)

The engine is exposed as an MCP server so any agent harness (Claude Code, Codex,
Gemini CLI, …) plays via native tool calls over the structured observation/action
loop — never a raw parser. Tools: `validate_pack`, `load_pack`, `new_game`,
`get_observation`, `list_legal_actions`, `step_action`, `save_game`, `load_game`,
`replay_trace`, `adapt_story` (author a pack from a premise). All paths are
confined to the project root; content and traces are
data only (§16). The handlers (`src/mcp/tools.ts`) are unit-tested directly without
a live client.

```bash
npm run mcp   # start the stdio server
```

The project ships `.mcp.json`, so an MCP client opened in this repo can connect
automatically (approve the `adventureforge` server when prompted). The agent loop is:
`new_game` → read `observation.available_actions` → `step_action` with a chosen
`action_id` → repeat until `observation.ended`.

### AI playtester loop (§12.4, §12.7)

A provider-agnostic LLM client (`agents/llm/provider.ts`) with a deterministic
**MockProvider** default — so the playtester runs in CI with no API keys. The
playtester (`agents/playtester.ts`) drives the same observation/action loop an
external agent uses, records each turn (§12.6), and a persona roster aggregates
route coverage and surfaces honest, non-fabricated findings.

```bash
npm run playtest -- content/cyoa/pack/watchtower_road.yaml [--out traces/playtests]
```

On *The Watchtower Road* the mock roster (5 personas × 8 seeds) reaches
`ending_escape` and `ending_captured` but **not** `ending_truth`, and never visits
the hidden cache or hermit conversation — a genuine playtest finding: the "good"
ending is hard to discover without in-world signposting (§17 rule 1). That gap is
the natural input to the next step: debugger → fixer → regression test (§12.5, §15).

### Parser playtester roster (§12.8)

Eight deterministic personas (mainline, curious, hoarder, dropper, dialogue-skipper,
wrong-order, adversarial, speedrunner) drive the same structured legal-action loop an
external agent uses. On *The Sealed Crypt* the heuristic roster reaches 8/10 rooms and
**wins nothing** — the route needs multi-step planning the heuristics don't do (honest;
winnability is certified by the walkthrough acceptance test and the validator). During
development the `dropper`/`wrong_order` personas wedged in a one-way crypt — a genuine
soft-lock now fixed and locked by `bug_0001` (§15).

```bash
npm run playtest:parser -- content/parser/pack/sealed_crypt.yaml [--out traces/playtests]
```

## Next: Stage 4

Stages 0–3 plus the AI authoring pipeline are complete and green. Remaining:
Stage 4 (Hero's-Quest: character stats in `vars`, deterministic seeded skill
checks, simple turn-based combat resolved in code, quest stages) — all through
the §14 engine-extension gate, with combat randomness flowing through the seeded
PRNG so every fight stays replayable; then Stage 5 (a UI as a view over the same
headless core).
