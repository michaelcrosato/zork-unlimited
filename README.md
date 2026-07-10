# AdventureForge

An **AI-coded, AI-playtested** text RPG: one deterministic engine, one
persistent world, and a feedback flywheel — dev agent → verification bar →
blind playtest → structured exit interview — that compounds quality every
cycle. The why lives in [`docs/VISION.md`](./docs/VISION.md); what's next in
[`docs/ROADMAP.md`](./docs/ROADMAP.md); the standing architecture contract is
[`ADVENTUREFORGE_BUILD_SPEC.md`](./ADVENTUREFORGE_BUILD_SPEC.md).

> **Trust, but verify.** The coding agent has free rein over all game code — no
> human-approval gate, no §14 engine-extension ceremony; it decides _what_ to
> build. But the automated verification stays the **bar**: tests, the determinism
> property checks, the validators, trace replay/regression, and green CI must pass —
> the autonomous loop and CI won't land red work. Freedom in design, honesty in
> verification (don't route around the verifier). Governing doc:
> [`AGENTS.md`](./AGENTS.md).

## One world, one engine

Everything runs on a single **RPG foundation engine** inside a single
persistent world (the 2026-07-06 consolidation — see
[How we got here](#how-we-got-here)):

- **Deterministic core** (`src/core/`) — a pure `step` reducer over a unified
  `GameState`, a closed condition/effect DSL, a seeded PRNG, an event log, and a
  canonical state hash: no wall clock, no ambient randomness, same seed ⇒
  byte-identical run. Save/load with content-hash integrity
  (`src/persist/save_load.ts`) and trace record/replay (`src/trace/`).
- **RPG foundation layer** (`src/rpg/`) — rooms, objects, containers, locked
  doors, NPC dialogue, USE puzzles, scoring, character stats, seeded turn-based
  combat, and d20 skill checks, behind a legal-action menu runner and structured
  observations. Two validators (`src/validate/rpg_validator.ts`,
  `src/validate/rpg_foundation_validator.ts` — dozens of finding codes) plus an
  exhaustive solver prove every declared ending reachable, no path soft-locked,
  and the score economy sound.
- **The New York overworld** (`content/world/new_york_overworld.json`,
  `src/world/`) — the single seamless world (like Skyrim or Cyberpunk 2077):
  a 247-node, 9-region open world for travel, discovery, road encounters, jobs,
  local events, and renown, AND the sole registry for the **11 shipped quests**
  under `content/rpg/quests/` (`advocates_case`, `breaking_weir`, `cold_forge`,
  `dawn_beacon`, `factors_mark`, `falconers_ransom`, `gallowmere`,
  `printers_night`, `sunken_barrow`, `tanners_fever`, `wolf_winter`). Each quest
  is anchored to a town and discovered from its local notice board, then handed
  off into a playable RPG quest session — everything is reached in-world.
- **Web UI** (`ui/`) — a React + Vite view over the same headless engine; it
  renders observations and never decides legality. See
  [`ui/README.md`](./ui/README.md).
- **Procedural eval packs** (`src/gen/rpg_generator.ts`) — pure, deterministic
  seed→pack minting held to the identical validator bar, so the verification
  suite's distribution evolves instead of becoming a memorized target.
  Generated packs are deliberately not committed under `content/`.
- **Debugger + fixer agents** (`agents/debugger.ts`, `agents/fixer.ts`) —
  replay a trace, classify the failure, and propose a closed, whitelisted
  content patch that deterministic code applies and re-validates; a model never
  edits files or runs shell. Exposed over MCP as `apply_content_patch`.

Most of the quest library — plus engine mechanics like reactive room prose,
opt-in deadlines, and natural USE verbs — was produced by the flywheel itself,
each change blind-playtested and gated green.

## Quickstart

**Prerequisite:** Node 22+ — `.nvmrc` pins the toolchain (matching
`package.json`'s `engines` and CI).

```bash
npm install
npm run health                                   # the full verification bar (see below)
npm run validate                                 # validate all 11 shipped quests
npm run validate -- sunken_barrow               # validate one quest by world quest id
npm run play -- sunken_barrow                    # play a shipped world quest
npm run overworld                                # play the full game: overworld map -> quests
npm run inspect -- sunken_barrow                 # summarize a world quest
npm run replay                                   # replay the committed RPG smoke trace
npm run author -- "your one-line premise here"   # author a quest from prose
npm run ui:dev                                   # web UI (after: npm --prefix ui install)
```

Non-interactive play (scriptable / CI): add
`--commands "go north; take rope; attack wight; ..."`. Use
`--record traces/run.json` to save a replayable trace; shipped quest traces
embed their `worldQuestId`, so `npm run replay -- <recorded-trace>` needs no
pack path. All public play, validation, inspection, and replay selectors take a **world
quest id** — raw pack paths are internal source metadata.

`npm run health` is the bar the loop and CI must leave green: the integrity
guard (`scripts/verify-integrity.ts`, which also forbids retired-runtime assets
from reappearing), typecheck, ESLint, Prettier, the vitest suite, the UI
typecheck (`npm run ui:typecheck`), and validation of every shipped quest. CI
runs the same sequence and builds the UI.

## MCP server — how an agent plays

The engine is exposed as an MCP server (`npm run mcp`, `src/mcp/server.ts`) so
any agent harness (Claude Code, Codex, Gemini CLI, …) plays via native tool
calls over the structured observation/action loop — never a raw parser. The
repo ships `.mcp.json`, so an MCP client opened here connects automatically.

**37 tools**, in four groups:

- **World catalog** (1): `list_overworld` — the overworld is both the world and
  the quest registry.
- **Overworld sessions** (20): `start_overworld`, then travel, rest, resupply,
  route planning, POI scouting, contacts, events, jobs, area exploration,
  export/restore — and `start_overworld_session_quest` /
  `complete_overworld_session_quest` bridging a discovered lead into quest play.
  This is how a player reaches a shipped quest: in-world, through the overworld.
- **RPG quest sessions** (12): `start_world_quest` (a dev/QA entry point that
  starts a shipped quest by id; `new_game` does the same for generated packs) →
  `get_observation` / `list_legal_actions` → `step_action`, repeated until the
  session ends; plus `get_state`, `get_transcript`, `save_game`, `load_game`,
  `validate_quest`, `load_quest`, and `generate_rpg_pack`.
- **Authoring & repair** (4): `adapt_story`, `apply_content_patch`,
  `replay_trace`, `inspect_trace`.

Observations are **compact and self-describing**: session-creating responses
carry a one-time `legend` documenting every positional field of the compact
context, events arrive as tagged tuples, and state-hash guards skip unchanged
payloads — terse enough for a blind agent to play a long session in one context
window. `tests/unit/compact_legend.test.ts` holds the tool descriptions and
legend to that contract; the handlers (`src/mcp/tools.ts`) are unit-tested
without a live client. All paths are confined to the project root; content and
traces are data only.

## Testing: a three-tier pyramid, coupled by an exit interview

Full reference: [`docs/testing_pyramid.md`](./docs/testing_pyramid.md).

- **Tier 0 — dev tests** (full knowledge, specific assertions): the vitest
  unit/property/regression suite, the validators, and the exhaustive solver —
  all inside `npm run health`. Rejection-direction witnesses live in the
  negative-fixture corpus (`content/broken-fixtures/`, mostly `foundation_*.yaml`),
  a data-driven test proving each validator finding code actually fires.
- **Tier 1 — mechanical crawler** (`src/crawl/`, zero LLM): drives the pure
  engine in-process across every shipped quest plus a full overworld sweep,
  checking nine invariant oracles (crash, integrity, desync, persistence,
  legality, softlock, render defects, world coverage) every step, emitting
  deduped, zod-validated findings with minimized replayable repros.
  `npm run crawl:smoke` is the loop's gate (every cycle, ~10s, deterministic);
  `npm run crawl:deep` is a longer soak (nightly/manual).
- **Tier 2 — blind LLM playtest**: a fresh agent with NO repo access plays the game
  purely through the MCP tools (harness in `blind-tester/`, protocol in
  [`docs/blind_playtest_protocol.md`](./docs/blind_playtest_protocol.md)) — the
  only judge of player-facing quality a static check can't see. The **default
  blind run plays the core game**: the open world from a fresh start, quests
  discovered through the overworld. Targeted single-quest runs (`--quest <id>`)
  are the legacy drop-in kept for testing one piece of content. `npm run
  fleet` runs N of these in parallel (personas, model mix, resume) for
  milestone/harvest cycles; `npm run fleet:mock` is a zero-token stand-in for CI.
- **Tier 3 — feedback compiler** (`src/feedback/`): clusters and ranks Tier-1
  findings and verified Tier-2 reports into `hotspots.{json,md}`
  (`npm run feedback:compile`), tracks trend (improved/regressed/new/flat)
  across compiles, and feeds the assessor's next-best-improvement ranking.

Every playtest MUST end with a **structured exit interview** — a fenced
`json exit-interview` block (clarity/enjoyment 1–5, bugs with S0–S4 severities,
confusions, verdict; schema in `src/blind/exit_interview.ts`). The report
verifier (`src/blind/report_verifier.ts`) rejects a playtest without one,
exactly as it rejects one that never touched the MCP tools — feedback that
can't be ranked is feedback that gets lost.

```bash
npm run crawl:smoke                               # Tier 1: mechanical gate, all quests + overworld
npm run blind                                     # Tier 2 DEFAULT: the core game — overworld, fresh start
npm run blind -- --quest sunken_barrow --seed 7   # targeted: one shipped quest (legacy drop-in)
npm run blind:smoke                               # harness check, no LLM, no tokens
npm run fleet:mock -- --count 2                   # Tier 2 fleet, zero tokens (CI-safe)
npm run feedback:compile                          # Tier 3: compile into ranked hot spots
```

The blind harness drives the external Claude Code CLI on the operator's
subscription (default model `sonnet`; `BLIND_AGENT_CMD` overrides) and is NOT
part of CI or the health bar (a mock fleet run is — see
[`docs/testing_pyramid.md`](./docs/testing_pyramid.md)). Separately, the
authoring/repair agents (`bin/author.ts`, the debugger/fixer) run against a
deterministic, keyless `MockAuthorProvider` behind the small `Provider`
interface (`agents/llm/`), so their vitest coverage runs in CI with no live
LLM calls and no API keys. (This is a public, no-runtime-LLM repo — there are
no third-party LLM API keys or key-based provider backends anywhere in it.)

## The flywheel — AFK loop

`loop.sh` drives the autonomous improvement cycle
([`docs/afk_loop.md`](./docs/afk_loop.md)): **assess** (`npm run ai:loop` —
`src/afk/assessor.ts` deterministically ranks improvement candidates, fed by
the latest exit interviews), **work** (one focused change plus a mandatory
blind playtest), **verify** (the health bar, plus an integrity check against
the pre-cycle ref so the verifier itself can't be weakened, plus
no-playtest-record ⇒ no commit). `npm run loop:status` / `npm run loop:stop`
manage a running loop; `npm run assess` previews the ranking.

## How we got here

The engine was bootstrapped through staged prototypes — CYOA choices, a parser
adventure, Sierra-style scoring, then the Hero's-Quest RPG and the web UI —
each stage re-proving the deterministic core under a new rule system. On
**2026-07-06** the repo consolidated on their union: the CYOA and parser
runtimes were retired, their best mechanics folded into the RPG foundation
layer, and 36 of 52 shipped stories retired with them — the last full tree is
tagged `stories-52-pre-rpg-consolidation`, and porting those stories back as
RPG quests is standing flywheel work. The parser-era negative fixtures were
converted to the RPG-foundation corpus so no rejection direction lost its
witness. Full rationale: the 2026-07-06 entry in
[`docs/DECISION_LOG.md`](./docs/DECISION_LOG.md); stage-era plans and gate
records are preserved under `docs/archive/`.

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 Michael Crosato.
