# AdventureForge

A headless, AI-authored text-adventure engine spanning CYOA, a Zork-style parser,
a Sierra-Quest scoring game, a Hero's-Quest RPG, and a React UI. See
[`ADVENTUREFORGE_BUILD_SPEC.md`](./ADVENTUREFORGE_BUILD_SPEC.md) for the original
design brief.

> **Trust, but verify.** The coding agent has free rein over all game code — no
> human-approval gate, no §14 engine-extension ceremony; it decides *what* to
> build. But the automated verification stays the **bar**: tests, the determinism
> property checks, the validator, trace replay/regression, and green CI must pass —
> the autonomous loop and CI won't land red work. Freedom in design, honesty in
> verification (don't route around the verifier). Governing doc:
> [`AGENTS.md`](./AGENTS.md). Stage descriptions below are kept for context.

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

### Stage 4 — Hero's-Quest RPG (stats · seeded combat · skill checks · quest stages) ✅

The same headless core, now with character stats, a seeded turn-based fight, and a
seeded d20 skill check — all through the **§14 engine-extension gate**, with every
roll flowing through the PRNG so fights replay exactly (§8.5).

| Piece | File |
|---|---|
| RPG schema (parser pack + enemies; `skill_check` on interactions) | `src/rpg/schema.ts` |
| Seeded combat + skill-check resolvers (randomness in the pure resolver) | `src/rpg/combat.ts` |
| RPG runner (parser actions + `ATTACK`) + observation | `src/rpg/runner.ts`, `src/rpg/observation.ts` |
| RPG validator (winnability, skill passability, stat/death-ending checks) | `src/validate/rpg_validator.ts` |
| Gated core DSL additions: `set_quest_stage` effect, `quest_stage` condition, `ATTACK` action | `src/core/`, `src/api/types.ts` |
| Sample pack: *The Sunken Barrow* | `content/rpg/pack/sunken_barrow.yaml` |
| Negative fixture (`COMBAT_UNWINNABLE`) | `content/broken-fixtures/rpg_unwinnable.yaml` |
| §14 gate record (all six items) | [`docs/stage4_rpg_gate.md`](./docs/stage4_rpg_gate.md) |
| Acceptance + unit + regression tests, recorded victory trace | `tests/`, `traces/rpg/barrow_victory.json` |

Stage 4 is **backward-compatible**: the additions are optional or top-level, so
every Stage 0–3 pack compiles to identical content (the CYOA content hash is
asserted unchanged) and every prior trace still replays.

### Stage 5 — Web UI (React + Vite) ✅

A **view** over the headless engine: it compiles a pack in-browser and drives the
same `step` reducer the CLI and MCP server use — one code path for CYOA, parser,
and RPG packs. The engine stays authoritative; the UI never decides legality.

| Piece | File |
|---|---|
| Browser engine client (one `GameSession` for all modes) | `ui/src/engine.ts` |
| React play view + pack picker | `ui/src/App.tsx`, `ui/src/packs.ts` |
| Pure-JS SHA-256 (makes the core browser-safe; byte-identical digests) | `src/core/sha256.ts` |
| Node test proving the UI uses only the structured API | `tests/unit/ui_engine.test.ts` |

```bash
npm run ui:dev     # http://localhost:5173 (after: npm --prefix ui install)
npm run ui:build   # production bundle in ui/dist
```

### Debugger + Fixer agents (§12.5, §15)

`agents/debugger.ts` replays a trace through the pure engine and classifies the
outcome (soft-lock / loop / unrecoverable death / rejected action / no failure),
then emits the §15 bug artifact. `agents/fixer.ts` proposes a **closed,
whitelisted** `ContentPatchProposal` that deterministic code applies and
re-validates — a model never edits files or runs shell (§16); a patch that breaks
the schema or fails validation is refused. Exposed over MCP as `apply_content_patch`.

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

### Procedural pack generation — evolving the eval distribution

Every structural proof in the suite (endings-reachable, variant-liveness, soft-lock
liveness, score-economy, menu-integrity) is exercised against the ten curated packs
below. A *frozen* eval set is the condition under which a self-improving loop's verifier
stops being a moving target and becomes a memorisable one. The antidote is to **evolve the
distribution**: mint fresh, never-authored packs the same checks must hold on.

`src/gen/cyoa_generator.ts` (`generateCyoaPack(seed)`) and `src/gen/rpg_generator.ts`
(`generateRpgPack(seed)`) are **pure, deterministic** minting cores — same seed ⇒
byte-identical pack (no `Date`/`Math.random`, §8.5). Each emits a schema-valid pack of a
proven AdventureForge shape (a knowledge-gated moral fork; a winnable hero's-quest with a
tight score economy) and is held to the **identical bar** as the curated content: the same
`validateCyoa`/`validateRpg` validator and the same exhaustive best/worst-roll solver that
prove the shipped packs. Generated packs are deliberately **not** committed under
`content/` — they are an on-demand eval distribution, not curated showcase content, so they
carry no blind-playtest obligation and never pollute the hand-authored set.

The CYOA generator is exposed over MCP as `generate_pack` (mint + validate a fresh pack,
read-only) and is playable in-memory via `new_game`'s `generate_seed`.

## Content library (17 packs)

The shipped, validated content — every pack passes the validator and is wired into
`npm run health`:

| Mode | Pack | File |
|---|---|---|
| CYOA | The Watchtower Road | `content/cyoa/pack/watchtower_road.yaml` |
| CYOA | The Clockwork Heist | `content/cyoa/pack/clockwork_heist.yaml` |
| CYOA | The Wrecker's Light | `content/cyoa/pack/wreckers_light.yaml` |
| CYOA | The White Stag | `content/cyoa/pack/white_stag.yaml` |
| CYOA | Dead Reckoning | `content/cyoa/pack/dead_reckoning.yaml` |
| CYOA | The Tithe-Barn | `content/cyoa/pack/tithe_barn.yaml` |
| CYOA | The Midnight Edition | `content/cyoa/pack/midnight_edition.yaml` |
| Parser | The Sealed Crypt | `content/parser/pack/sealed_crypt.yaml` |
| Parser | The Alchemist's Tower | `content/parser/pack/alchemists_tower.yaml` |
| Parser | The Friars' Postern | `content/parser/pack/friars_postern.yaml` |
| Parser | The Lamplighter's Round | `content/parser/pack/lamplighters_round.yaml` |
| Parser | The Tide-Mill | `content/parser/pack/tide_mill.yaml` |
| RPG | The Sunken Barrow | `content/rpg/pack/sunken_barrow.yaml` |
| RPG | The Cold Forge | `content/rpg/pack/cold_forge.yaml` |
| RPG | The Dawn Beacon | `content/rpg/pack/dawn_beacon.yaml` |
| RPG | The Wolf-Winter | `content/rpg/pack/wolf_winter.yaml` |
| RPG | The Breaking Weir | `content/rpg/pack/breaking_weir.yaml` |

Most of this library — plus engine refinements like reactive room/scene descriptions
(`variants`), an opt-in `meta.deadline` timer, and natural USE-verbs — was produced
by the autonomous improvement loop (see [`docs/afk_loop.md`](./docs/afk_loop.md)),
each change blind-playtested and gated green.

## Quickstart

**Prerequisite:** Node 22+ — `.nvmrc` pins the toolchain (matching `package.json`'s `engines` and CI).

```bash
npm install
npm run typecheck                                        # tsc --noEmit
npm run lint                                             # ESLint
npm run format:check                                     # Prettier (use `npm run format` to fix)
npm test                                                  # unit + property tests
npm run replay                                            # Stage 0: round-trip a trace
npm run validate                                           # validate all shipped RPG packs
npm run validate -- content/rpg/pack/sunken_barrow.yaml    # validate one RPG pack
npm run play -- content/rpg/pack/sunken_barrow.yaml        # play it (combat + skill check)
npm run inspect -- content/rpg/pack/sunken_barrow.yaml      # summarize a pack (or a trace)
npm run author -- "your one-line premise here"             # author a pack from prose (§12.1-3)
npm run ui:dev                                             # Stage 5: web UI (after npm --prefix ui install)
```

Non-interactive play (scriptable / CI): add
`--commands "go north; take rope; attack wight; ..."`. Use
`--record traces/run.json` to save a replayable trace. `npm run validate` is the
RPG content gate and rejects legacy CYOA/parser packs.

### MCP server — how an agent plays the game (§9.4)

The engine is exposed as an MCP server so any agent harness (Claude Code, Codex,
Gemini CLI, …) plays via native tool calls over the structured observation/action
loop — never a raw parser. The MCP catalog is now RPG-first: `list_stories`
discovers shipped packs under `content/rpg/pack`, picks the high-depth RPG pack
`breaking_weir` as the default, and `list_world` reports the RPG quest subset of
the Charter Marches. The same structured `new_game` / `step_action` /
`get_observation` / save·load path drives RPG sessions through stable action ids
and deterministic state hashes. Explicit legacy pack loading still exists during
the migration, but blind/AFK discovery no longer steers agents toward CYOA or
parser packs. All paths are confined to the project root; content and traces are
data only (§16). The handlers (`src/mcp/tools.ts`) are unit-tested directly
without a live client.

```bash
npm run mcp   # start the stdio server
```

The project ships `.mcp.json`, so an MCP client opened in this repo can connect
automatically (approve the `adventureforge` server when prompted). The agent loop is:
`new_game` → read `observation.available_actions` → `step_action` with a chosen
`action_id` → repeat until `observation.ended`.

### Testing: two modes — dev tests + a blind LLM playtest

Quality rests on exactly two kinds of testing, nothing in between:

- **Dev tests** (full knowledge, specific assertions): the vitest unit/regression
  suite plus the validators (`src/validate/`) and the exhaustive BFS solver, which
  *prove* every declared ending is reachable, no path soft-locks, and the score
  economy is sound. These run in `npm run health`.
- **Blind LLM playtest**: a fresh subagent with NO repo access plays a pack purely
  through the MCP tools and reports its route, step count, choices, and a
  clarity/enjoyment/confusion read — the only judge of player-facing quality
  (signposting, pacing, discoverability) a static check can't see. The harness is in
  `blind-tester/` and the protocol in `docs/blind_playtest_protocol.md`; the AFK loop
  runs one every cycle.

The LLM client (`agents/llm/providers.ts`) is provider-agnostic: real
OpenAI/Anthropic/Google backends sit behind env vars and fall back to a deterministic
keyless mock, so authoring/adapting runs in CI with no API keys.

```bash
npm run blind -- --pack content/parser/pack/sealed_crypt.yaml --seed 7
```

## Status: all stages complete ✅

Stages 0–5 are implemented and green — the full proof path from a deterministic
core, through CYOA, a Zork-style parser, a Sierra-Quest scoring/death game, a
Hero's-Quest RPG (stats + seeded combat + skill checks via the §14 gate), to a
React web UI that is a pure view over the same headless engine. The complete loop
from the thesis — AI writes a story → adapts it to a validated pack → the engine
validates it → an AI plays every route through the structured legal-action API →
records its experience → a debugger finds a flaw → a fixer patches it → a
regression test locks the fix — is exercised end to end, with the determinism
contract (§8.5) holding across every recorded trace.

`npm run health` (typecheck + tests + validate + playtest) is the verification
bar — the autonomous loop and CI must leave it green (trust, but verify; see
`AGENTS.md`). Provider-agnostic LLM access (`agents/llm/`) defaults to a
deterministic mock, so everything runs with no API keys; real
OpenAI/Anthropic/Google backends sit behind env vars (§12.7).

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 Michael Crosato.
