# AdventureForge

A headless, AI-authored text-adventure engine centered on a Hero's-Quest RPG,
with procedural authoring, MCP play, an overworld layer, and a React UI. See
[`ADVENTUREFORGE_BUILD_SPEC.md`](./ADVENTUREFORGE_BUILD_SPEC.md) for the original
design brief.

> **Trust, but verify.** The coding agent has free rein over all game code — no
> human-approval gate, no §14 engine-extension ceremony; it decides _what_ to
> build. But the automated verification stays the **bar**: tests, the determinism
> property checks, the validator, trace replay/regression, and green CI must pass —
> the autonomous loop and CI won't land red work. Freedom in design, honesty in
> verification (don't route around the verifier). Governing doc:
> [`AGENTS.md`](./AGENTS.md). Stage descriptions below are kept for context.

## Status

### Stage 0 — deterministic core ✅

The trustworthy spine every later stage sits on. No content in the engine — just a core
the AI can later author into but cannot corrupt.

| Piece                                               | File                       |
| --------------------------------------------------- | -------------------------- |
| Unified `GameState` (§6)                            | `src/core/state.ts`        |
| Condition DSL + evaluator (§7.1)                    | `src/core/conditions.ts`   |
| Effect DSL + pure reducer (§7.1)                    | `src/core/effects.ts`      |
| Event log (§8.3)                                    | `src/core/events.ts`       |
| Seeded PRNG (§4.1, §8.5)                            | `src/core/rng.ts`          |
| Canonical state hash (§8.6)                         | `src/core/hash.ts`         |
| Pure `step` reducer + `Rules` resolver (§8.1, §8.4) | `src/core/engine.ts`       |
| Save / load with content-hash integrity (§8.7)      | `src/persist/save_load.ts` |
| Trace record / replay (§8.8)                        | `src/trace/`               |

The Layer-2/Layer-3 boundary (§3) is enforced by the `Rules` resolver: the engine asks
content what an action means, but contains no content itself.

### Stage 1 — retired CYOA prototype

The original CYOA runtime and content tree were retired during RPG-only consolidation.
Their replacement is the shared RPG-owned schema/runner/validator surface below; old
CYOA assets are forbidden from reappearing by `scripts/verify-integrity.ts`.

### Stage 2 — retired parser prototype

The original parser runtime and content packs were retired during RPG-only
consolidation. Its useful mechanics — rooms, objects, containers, locked doors,
NPC dialogue, USE puzzles, legal-action menus, reactive prose, and structural
validation — now live in the RPG-owned schema, model, runner, observation, and
foundation validator. Parser assets are forbidden from reappearing by
`scripts/verify-integrity.ts`.

### Stage 3 — Sierra-Quest style (score · death/restore · puzzle chains) ✅

Same core again, now with a **score**, **death endings recoverable via load**, and
longer puzzle chains.

| Piece                                                                 | File                                       |
| --------------------------------------------------------------------- | ------------------------------------------ |
| Score (`inc_var` on a `score` var) + `max_score`, `ending.death` flag | `src/rpg/schema.ts`                        |
| Validator extensions (§13 Stage 3)                                    | `src/validate/rpg_foundation_validator.ts` |
| Sample pack                                                           | Retired during RPG-only consolidation      |

Scoring is a conventional `score` var awarded via `inc_var`; death endings are
terminal non-win endings reached by an `end_game` effect, and are recoverable by
loading a pre-death save (§8.7). The validator adds **score reachability**
(`max_score` ≤ total awards), **`end_game` target declared**, **win-is-not-death**,
and **at-least-one-winnable-ending** — no engine change was needed.

### Stage 4 — Hero's-Quest RPG (stats · seeded combat · skill checks · quest stages) ✅

The same headless core, now with character stats, a seeded turn-based fight, and a
seeded d20 skill check — all through the **§14 engine-extension gate**, with every
roll flowing through the PRNG so fights replay exactly (§8.5).

| Piece                                                                                        | File                                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| RPG schema (`skill_check` on interactions, enemies, stats, world binding)                    | `src/rpg/schema.ts`                                    |
| Seeded combat + skill-check resolvers (randomness in the pure resolver)                      | `src/rpg/combat.ts`                                    |
| RPG runner (legal-action menu + `ATTACK`) + observation                                      | `src/rpg/runner.ts`, `src/rpg/observation.ts`          |
| RPG validator (winnability, skill passability, stat/death-ending checks)                     | `src/validate/rpg_validator.ts`                        |
| Gated core DSL additions: `set_quest_stage` effect, `quest_stage` condition, `ATTACK` action | `src/core/`, `src/api/types.ts`                        |
| Sample pack: _The Sunken Barrow_                                                             | `content/rpg/quests/sunken_barrow.yaml`                |
| Negative fixture (`COMBAT_UNWINNABLE`)                                                       | `content/broken-fixtures/rpg_unwinnable.yaml`          |
| §14 gate record (all six items)                                                              | [`docs/archive/stage4_rpg_gate.md`](./docs/archive/stage4_rpg_gate.md) |
| Acceptance + unit + regression tests, recorded victory trace                                 | `tests/`, `traces/rpg/barrow_victory.json`             |

Stage 4 made RPG the canonical runtime surface; old CYOA and parser code/content
have since been retired.

### Stage 5 — Web UI (React + Vite) ✅

A **view** over the headless engine: it compiles an RPG pack in-browser and drives
the same `step` reducer the CLI and MCP server use. The engine stays authoritative;
the UI never decides legality.

| Piece                                                                 | File                                |
| --------------------------------------------------------------------- | ----------------------------------- |
| Browser engine client (`GameSession` for RPG play)                    | `ui/src/engine.ts`                  |
| React play view + pack picker                                         | `ui/src/App.tsx`, `ui/src/packs.ts` |
| Pure-JS SHA-256 (makes the core browser-safe; byte-identical digests) | `src/core/sha256.ts`                |
| Node test proving the UI uses only the structured API                 | `tests/unit/ui_engine.test.ts`      |

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

The public author CLI can **author an RPG pack from a one-line premise** by the
writer → adapter → validator loop. The writer drafts prose + beats; the adapter
emits an RPG pack and classifies each beat against the engine contract
(`content/engine_contract.yaml`, §11); it loops against the validator until the
report is green — the validator, not the model, decides correctness (§16). The
default `MockAuthorProvider` is deterministic (no API keys); its first attempt
ships a dangling reference and self-corrects once the validator's errors are fed
back. A real provider slots in behind an env var (§12.7).

```bash
npm run author -- "A keeper must relight a dead lighthouse before a ship wrecks."
```

MCP authoring/generation tools still exist as migration scaffolding while the
runtime consolidates around the RPG engine.

### Procedural pack generation — evolving the eval distribution

Every structural proof in the suite (endings-reachable, variant-liveness, soft-lock
liveness, score-economy, menu-integrity) is exercised against the ten curated packs
below. A _frozen_ eval set is the condition under which a self-improving loop's verifier
stops being a moving target and becomes a memorisable one. The antidote is to **evolve the
distribution**: mint fresh, never-authored packs the same checks must hold on.

`src/gen/rpg_generator.ts` (`generateRpgPack(seed)`) is a **pure, deterministic**
minting core — same seed ⇒ byte-identical pack (no `Date`/`Math.random`, §8.5).
It emits a schema-valid, winnable hero's-quest with a tight score economy and is
held to the **identical bar** as the curated RPG content: the same `validateRpg`
validator and the same exhaustive best/worst-roll solver that prove the shipped
packs. Generated packs are deliberately **not** committed under `content/` — they
are an on-demand eval distribution, not curated showcase content, so they carry
no blind-playtest obligation and never pollute the hand-authored set.

The RPG generator is exposed over MCP as `generate_rpg_pack` (mint + validate a
fresh pack, read-only) and is playable in-memory via `new_game`'s
`generate_rpg_seed`.

## Content Library

The shipped, validated content — every pack passes the validator and is wired into
`npm run health`:

| Pack                     | File                                          |
| ------------------------ | --------------------------------------------- |
| The Advocate's Case      | `content/rpg/quests/advocates_case.yaml`      |
| The Bellfounder's Alarm  | `content/rpg/quests/bellfounders_alarm.yaml`  |
| The Breaking Weir        | `content/rpg/quests/breaking_weir.yaml`       |
| The Bridgewright's Proof | `content/rpg/quests/bridgewrights_proof.yaml` |
| The Cold Forge           | `content/rpg/quests/cold_forge.yaml`          |
| The Dawn Beacon          | `content/rpg/quests/dawn_beacon.yaml`         |
| The Factor's Mark        | `content/rpg/quests/factors_mark.yaml`        |
| The Falconer's Ransom    | `content/rpg/quests/falconers_ransom.yaml`    |
| The Gallowmere           | `content/rpg/quests/gallowmere.yaml`          |
| The Lock-Keeper's Toll   | `content/rpg/quests/lockkeepers_toll.yaml`    |
| The Powder Mill Surety   | `content/rpg/quests/powder_mill_surety.yaml`  |
| The Printer's Night      | `content/rpg/quests/printers_night.yaml`      |
| The Quarrymen's Fault    | `content/rpg/quests/quarrymens_fault.yaml`    |
| The Sunken Barrow        | `content/rpg/quests/sunken_barrow.yaml`       |
| The Tanner's Fever       | `content/rpg/quests/tanners_fever.yaml`       |
| The Wolf-Winter          | `content/rpg/quests/wolf_winter.yaml`         |

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
npm run replay                                            # replay the committed RPG smoke trace
npm run validate                                           # validate all shipped RPG packs
npm run validate -- sunken_barrow                          # validate one world quest
npm run play                                                # play the default world quest
npm run play -- sunken_barrow                               # play a shipped world quest
npm run inspect -- sunken_barrow                            # summarize a world quest
npm run author -- "your one-line premise here"             # author an RPG pack from prose (§12.1-3)
npm run ui:dev                                             # Stage 5: web UI (after npm --prefix ui install)
```

Non-interactive play (scriptable / CI): add
`--commands "go north; take rope; attack wight; ..."`. Use
`--record traces/run.json` to save a replayable trace; shipped quest traces embed
their `worldQuestId`, so `npm run replay -- <recorded-trace>` needs no pack path.
Raw pack paths are internal source metadata; public play, validation, inspection,
and replay source selectors use world quest ids. `npm run validate` is the RPG
content gate and rejects non-RPG pack shapes.

### MCP server — how an agent plays the game (§9.4)

The engine is exposed as an MCP server so any agent harness (Claude Code, Codex,
Gemini CLI, …) plays via native tool calls over the structured observation/action
loop — never a raw parser. The MCP catalog is RPG-only: `list_stories`
reads the Charter Marches quest graph, picks the high-depth RPG pack
`breaking_weir` as the default, and `list_world` reports the same RPG quest set
with hub routes. Shipped quests should start through `start_world_quest` or
`new_game` with `world_quest_id`; raw `pack_path` live starts are rejected. Saves
for shipped quests can also restore with `world_quest_id`. The same world id can
replay or inspect shipped traces. The same structured `new_game` /
`step_action` / `get_observation` / save·load path drives RPG sessions through
stable action ids and deterministic state hashes. Explicit non-RPG pack loading is
rejected through MCP with an `UNSUPPORTED_LEGACY_PACK` report; old pack shapes are
now migration data, not playable agent targets. The CYOA tree has been retired. All
paths are confined to the project root; content and traces are data only (§16). The
handlers (`src/mcp/tools.ts`)
are unit-tested directly without a live client.

```bash
npm run mcp   # start the stdio server
```

The project ships `.mcp.json`, so an MCP client opened in this repo can connect
automatically (approve the `adventureforge` server when prompted). The direct
quest loop is: `new_game` → read `observation.available_actions` → `step_action`
with a chosen `action_id` → repeat until `observation.ended`. The open-world loop
starts with `start_overworld`; after discovering a local lead,
`start_overworld_session_quest` returns the playable RPG session for that quest.

### Testing: two modes — dev tests + a blind LLM playtest

Quality rests on exactly two kinds of testing, nothing in between:

- **Dev tests** (full knowledge, specific assertions): the vitest unit/regression
  suite plus the validators (`src/validate/`) and the exhaustive BFS solver, which
  _prove_ every declared ending is reachable, no path soft-locks, and the score
  economy is sound. These run in `npm run health`.
- **Blind LLM playtest**: a fresh subagent with NO repo access plays a shipped
  quest id purely through the MCP tools and reports its route, step count, choices,
  and a clarity/enjoyment/confusion read — the only judge of player-facing quality
  (signposting, pacing, discoverability) a static check can't see. The harness is in
  `blind-tester/` and the protocol in `docs/blind_playtest_protocol.md`; the AFK loop
  runs one every cycle.

The LLM client (`agents/llm/providers.ts`) is provider-agnostic: real
OpenAI/Anthropic/Google backends sit behind env vars and fall back to a deterministic
keyless mock, so authoring/adapting runs in CI with no API keys.

```bash
npm run blind -- --quest sunken_barrow --seed 7
```

## Status: all stages complete ✅

Stages 0–5 are implemented and green — the proof path now runs from a deterministic
core through the RPG runtime (stats + seeded combat + skill checks via the §14 gate)
to a React web UI that is a pure view over the same headless engine. The complete loop
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
