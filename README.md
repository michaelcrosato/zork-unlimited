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
  local events, and renown, AND the sole registry for the **12 shipped quests**
  under `content/rpg/quests/` (`advocates_case`, `breaking_weir`, `cold_forge`,
  `dawn_beacon`, `factors_mark`, `falconers_ransom`, `gallowmere`,
  `printers_night`, `sunken_barrow`, `tanners_fever`, `tide_mill`,
  `wolf_winter`). Each quest
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

**Just want to play?** Double-click **`PLAY.bat`** (Windows). It checks and
refreshes dependencies, rebuilds the game from the current code, and opens it
in your default browser — no terminal needed. The build it opens
(`ui/dist/index.html`) is a single self-contained file, so it also works
copied anywhere and opened directly.

**Prerequisite:** Node 22+ — `.nvmrc` pins the toolchain (matching
`package.json`'s `engines` and CI).

```bash
npm install
npm run health                                   # the full verification bar (see below)
npm run validate                                 # validate all 12 shipped quests
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

**40 tools**, in four groups:

- **World catalog** (1): `list_overworld` — the overworld is both the world and
  the quest registry.
- **Overworld sessions** (23): `start_overworld`, then travel, rest, resupply,
  route planning, POI scouting, contacts, events, jobs, area exploration,
  export/restore — and `start_overworld_session_quest` /
  `complete_overworld_session_quest` bridging a discovered lead into quest play,
  plus `choose_overworld_session_journey` at game-presented retention pauses,
  `choose_overworld_session_story` for game-presented authored choices, and
  `follow_overworld_session_goal` committing to the current objective's road as
  one interruptible Goal Passage.
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

Every overworld session also carries one versioned **journey contract**, shared
unchanged by UI and MCP. Contract v3 keeps v2's meaningful-decision classifier:
movement, new clues, substantive dialogue topics, combat, skill checks,
preparation, authored story choices, and other situation changes advance the
shared counter. Context-only or repeated narration, dialogue
opening/navigation/closure, unchanged services, legal-action listings,
persistence operations, rejections, technical quest foldback, and the
continue/end retention choice do not.

The initial goal is to find one local lead in Albany and see it through. Goals
are now versioned and ordered: completing one appends it to goal history and
offers a continue/end choice bound to that exact goal, at once if completion is
before the next fixed checkpoint. If the player continues after Wolf-Winter,
the game presents an ending-sensitive Albany story choice and installs the
chosen authored objective; ending installs nothing. Fixed choices remain at 40,
80, 120, and every additional 40 meaningful decisions. The exit receipt records
the current goal, completed goals, goal-bound retention choices, decision proof,
checkpoint history, and exit reason.

When an active follow-up goal names another town, that same journey object and
the UI journey card present one Goal Passage choice with the destination,
road/time forecast, and honest supply/fatigue consequences. Selecting it applies
every real road cost but stops at authored road choices, objective arrival, or a
new resource boundary. The player may still take roads manually; the pure
harness supplies neither route nor recommendation.

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
- **Tier 2 — pure blind LLM playtest**: a fresh agent with NO repo access plays
  through an enforced player-only MCP surface (harness in `blind-tester/`,
  protocol in
  [`docs/blind_playtest_protocol.md`](./docs/blind_playtest_protocol.md)).
  `npm run blind` and every live `npm run fleet` member default to
  `play_mode: pure` and `start_surface: fresh_overworld`: the game supplies the
  tutorial, goals, state, legal and authored story choices,
  decision/checkpoint rhythm, and consequences; the harness supplies transport
  syntax only. It interviews
  after a game-confirmed exit, never after a test-only call budget. Structural
  direct-quest/crawler/smoke/mock modes require explicit flags and are not pure
  retention evidence. Milestone fleets run 100 seed/model variants of the same
  neutral player contract; `fleet:mock` is a zero-token structural CI stand-in.
  Current Codex runs authenticate their exact code-mode notice, leading yield
  pragma on every gameplay wrapper, and canonical JSON-result emitter through a
  hash-bound capture receipt v2; fleet attestation v5 carries that same exact
  contract marker. Legacy capture v1 and attestations v3/v4 remain historical
  readers only and cannot satisfy a current run or resume.
- **Tier 3 — feedback compiler** (`src/feedback/`): clusters and ranks Tier-1
  findings and verified Tier-2 reports into `hotspots.{json,md}`
  (`npm run feedback:compile`), writes a separate `retention.json` that admits
  only sidecar-verified pure exits and groups their decision/checkpoint curves
  by journey-contract version (historical v1/v2 and current v3 are never pooled),
  tracks trend (improved/regressed/new/flat), and feeds the assessor's ranking.

Every pure playtest MUST end through the game's journey choice and then provide
a V2 **structured exit interview**. The fenced `json exit-interview` block
contains clarity/enjoyment, severity-tagged findings, replay intent, and the
exact game-returned journey receipt (schema in `src/blind/exit_interview.ts`).
The verifier cross-checks it against server-authored fresh-start/exit evidence;
legacy, structural, timed-out, or mismatched runs cannot count as pure retention
evidence or resume a pure fleet member.

```bash
npm run crawl:smoke                               # Tier 1: mechanical gate, all quests + overworld
npm run blind                                     # Tier 2 DEFAULT: canonical pure fresh-world player
npm run blind:smoke                               # explicit structural harness check, no LLM/tokens
bash blind-tester/run.sh --smoke --quest sunken_barrow --seed 7 # structural quest check, no LLM
npm run fleet -- --count 100                      # milestone: 100 pure fresh-world players
npm run fleet:mock -- --count 2                   # structural zero-token CI lane
npm run feedback:compile                          # Tier 3: hot spots + pure retention summary
```

The blind harness drives the external Claude Code CLI on the operator's
subscription (default model `sonnet`) through a runner-enforced no-file,
no-shell, no-web tool boundary. Arbitrary `BLIND_AGENT_CMD` overrides are
rejected for pure runs because their blindness cannot be verified. Live play is
NOT part of CI or the health bar (a structural mock fleet run is — see
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
