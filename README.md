# AdventureForge

An **AI-coded, AI-playtested** text RPG: one deterministic engine, one
persistent world, and a feedback flywheel — dev agent → verification bar →
blind playtest → structured exit interview — that compounds quality every
cycle. Development and playtesting run as **two independent loops**, either of
which any model can drive
([`docs/two_loop_workflow.md`](./docs/two_loop_workflow.md)). The why lives in [`docs/VISION.md`](./docs/VISION.md); what's next in
[`docs/ROADMAP.md`](./docs/ROADMAP.md); the standing architecture contract is
[`ADVENTUREFORGE_BUILD_SPEC.md`](./ADVENTUREFORGE_BUILD_SPEC.md). Process choices
made while closing the external review are recorded in
[`docs/EXTERNAL_REVIEW_PROCESS_DECISIONS.md`](./docs/EXTERNAL_REVIEW_PROCESS_DECISIONS.md),
with the finding-by-finding evidence map in
[`docs/EXTERNAL_REVIEW_COMPLETION.md`](./docs/EXTERNAL_REVIEW_COMPLETION.md).

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
  observations. Two static validators (`src/validate/rpg_validator.ts`,
  `src/validate/rpg_foundation_validator.ts` — dozens of finding codes)
  conservatively reject structural and configuration defects. Separate dynamic
  proofs enumerate shipped-pack state spaces to witness every declared ending,
  progress-action liveness, and score-economy soundness; those claims apply to the
  tested shipped packs, not to arbitrary authored numeric gates.
- **The New York overworld** (`content/world/new_york_overworld.json`,
  `src/world/`) — a 247-node, 9-region procedurally populated travel and discovery
  substrate around one deeply authored Albany opening/campaign chapter. It supports
  roads, encounters, jobs, local events, and renown, and is the sole registry for the
  **12 shipped quests** under `content/rpg/quests/` (`advocates_case`,
  `breaking_weir`, `cold_forge`,
  `dawn_beacon`, `factors_mark`, `falconers_ransom`, `gallowmere`,
  `printers_night`, `sunken_barrow`, `tanners_fever`, `tide_mill`,
  `wolf_winter`). The current authored campaign scenes and service overrides are
  concentrated in Albany; the rest of the node count should not be read as 247
  equally authored locations.
- **Web UI** (`ui/`) — a React + Vite view over the same headless engine; it
  renders observations and never decides legality. See
  [`ui/README.md`](./ui/README.md).
- **Procedural eval packs** (`src/gen/rpg_generator.ts`) — pure, deterministic
  seed→pack minting held to the identical validator bar. Seeds select among five
  themes and vary difficulty and awards over one fixed, validated two-fight
  gauntlet skeleton; this is a moving proof input, not a generator of wholly new
  quest structures. Generated packs are deliberately not committed under
  `content/`.
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
npm --prefix ui install                           # required by npm run health
npm run health                                   # the full verification bar (see below)
npm run validate                                 # validate all 12 shipped quests
npm run validate -- sunken_barrow               # validate one quest by world quest id
npm run play -- sunken_barrow                    # play a shipped world quest
npm run overworld                                # play the full game: overworld map -> quests
npm run inspect -- sunken_barrow                 # summarize a world quest
npm run replay                                   # replay the committed RPG smoke trace
npm run author -- "your one-line premise here"   # exercise the deterministic mock author/validator loop
npm run test:coverage                            # report standard-suite V8 coverage
npm run ui:dev                                   # web UI (after: npm --prefix ui install)
```

`npm run author` is an offline pipeline fixture: its mock provider always drafts
the fixed **The Lighthouse** story, then exercises adapter rejection/revision until
the RPG pack validates. The supplied premise does not currently drive generated
story content; no live authoring model is bundled.

Non-interactive play (scriptable / CI): add
`--commands "go north; take rope; attack wight; ..."`. Use
`--record traces/run.json` to save a replayable trace; shipped quest traces
embed their `worldQuestId`, so `npm run replay -- <recorded-trace>` needs no
pack path. All public play, validation, inspection, and replay selectors take a **world
quest id** — raw pack paths are internal source metadata.

`npm run health` is the bar the loop and CI must leave green: the integrity
guard (`scripts/verify-integrity.ts`, which also forbids retired-runtime assets
from reappearing), bug-trace parsing/identity/reference integrity, the compact
opening's density ceilings, typecheck, ESLint, Prettier, the vitest suite, the UI
typecheck (`npm run ui:typecheck`), and validation of every shipped quest. CI
enforces the same checks but does not invoke `npm run health` itself: running it
there would double-execute the whole pipeline, so `.github/workflows/ci.yml`
splits it into a prerequisites job, two sharded test jobs, and a `crawl:smoke`
job, then requires all three through the `verify` check. CI also builds the UI
(`npm run ui:build`), which `health` does not, and `crawl:smoke` is required in
CI while remaining deliberately outside `health`. A separate scheduled/manual
[`Deep audit`](./.github/workflows/deep-audit.yml) runs the long crawl plus a
standard-suite V8 coverage report without lengthening the PR critical path.

## MCP server — how an agent plays

The engine is exposed as an MCP server (`npm run mcp`, `src/mcp/server.ts`) so
any agent harness (Claude Code, Codex, Gemini CLI, …) plays via native tool
calls over the structured observation/action loop — never a raw parser. The
repo ships `.mcp.json`, so an MCP client opened here connects automatically.

**43 tools**, in four groups:

- **World catalog** (1): `list_overworld` — the overworld is both the world and
  the quest registry.
- **Overworld sessions** (26): `start_overworld`, then travel, care, rest,
  resupply, route planning, POI scouting, contacts, events, jobs, area
  exploration, export/restore — and `start_overworld_session_quest` /
  `complete_overworld_session_quest` bridging a discovered lead into quest play,
  plus `choose_overworld_session_journey` at game-presented retention pauses,
  `inspect_overworld_session_story` / `choose_overworld_session_story` for
  game-presented authored choices, and
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
carry an initial `legend` for the positional fields used there, later responses
add same-response `legend_delta` definitions before a field's first use (dotted
keys name exact nested result paths), events arrive as tagged tuples, and
state-hash guards skip unchanged payloads — terse enough for a blind agent to
play a long session in one context window. RPG `context.npcs` rows preserve
stable authored ids while pairing them with player-facing names as
`[npc_id, display_name]`; executable action ids remain stable.
`tests/unit/compact_legend.test.ts` holds the tool descriptions and legends to
that contract; the handlers (`src/mcp/tools.ts`) are unit-tested without a live
client. All paths are confined to the project root; content and traces are data
only.

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
chosen authored objective; ending installs nothing. Fixed checkpoint thresholds
remain at 40, 80, 120, and every additional 40 meaningful decisions. Once a
threshold is due, its choice materializes at the first safe break at or after
that threshold, without interrupting active combat or dialogue. The exit receipt
records the current goal, completed goals, goal-bound retention choices,
decision proof, checkpoint history, and exit reason.

When an active follow-up goal names another town, that same journey object and
the UI journey card present one Goal Passage choice with the destination,
road/time forecast, and honest supply/fatigue consequences. Selecting it applies
every real road cost but stops at authored road choices, objective arrival, or a
new resource boundary. The player may still take roads manually; the pure
harness supplies neither route nor recommendation.

## Testing: a three-tier pyramid on a Tier 0 dev foundation

Full reference: [`docs/testing_pyramid.md`](./docs/testing_pyramid.md).

- **Tier 0 — dev tests** (full knowledge, specific assertions): the vitest
  unit/property/regression suite, the validators, exhaustive shipped-pack proofs,
  bug-trace integrity, and the opening-density budget — all inside
  `npm run health`. Rejection-direction witnesses live in the
  negative-fixture corpus (`content/broken-fixtures/`, 48 files, mostly
  `foundation_*.yaml`). For the foundation validator this is data-driven and
  self-tightening: the test parses the emit sites out of the validator source and
  requires a witness for every code, with the still-unwitnessed ones held in an
  explicit, shrinking allowlist (3 today), so adding a code fails the suite until
  it is fixtured or consciously listed.
- **Tier 1 — mechanical crawler** (`src/crawl/`, zero LLM): drives the pure
  engine in-process across every shipped quest plus a full overworld sweep,
  checking nine finding codes every step — eight invariants (crash, integrity,
  desync, persistence, legality, softlock, render defects, world coverage) plus
  `ORPHAN`, which is coverage bookkeeping rather than a violation — and emitting
  deduped, zod-validated findings. Repros are minimized and replayable for the
  five codes `REPRODUCIBLE_CODES` admits (crash, integrity, render, persistence,
  softlock); desync, legality, world and orphan findings carry an unminimized
  repro. `npm run crawl:smoke` is the loop's gate (every cycle, deterministic,
  6,000 steps; ~20-35s wall on a fast machine and longer under load — not the
  ~10s this line used to claim);
  `npm run crawl:deep` is a longer soak run nightly and on manual dispatch by
  `.github/workflows/deep-audit.yml`.
- **Tier 2 — pure blind LLM playtest**: a fresh agent with NO repo access plays
  through an enforced player-only MCP surface (harness in `blind-tester/`,
  protocol in
  [`docs/blind_playtest_protocol.md`](./docs/blind_playtest_protocol.md)).
  `npm run blind` and every live `npm run fleet` member default to
  `play_mode: pure` and `start_surface: fresh_overworld`, on whichever provider
  the registry resolves: the game supplies the
  tutorial, goals, state, legal and authored story choices,
  decision/checkpoint rhythm, and consequences; the harness supplies transport
  syntax only. It interviews
  after a game-confirmed exit, never after a test-only call budget. Structural
  direct-quest/crawler/smoke/mock modes require explicit flags and are not pure
  retention evidence. Milestone fleets run 100 seed/model variants of the same
  neutral player contract; `fleet:mock` is a zero-token structural CI stand-in.
  Current Codex runs authenticate the selected model-specific transport. Spark
  uses direct-MCP capture receipt v4 (`spark-direct-mcp-v1`) and Terra uses
  game-direct capture receipt v5 (`game-direct-mcp-v1`); each direct model is
  launched through its own tracked game-only model catalog. Terra direct pins a
  disabled multi-agent topology and API-request reasoning-summary mode `none`;
  its exact 0.146 rollout records the compatibility-only `summary: "auto"`
  sentinel. Historical strict Terra remains v2. Sol and Luna use strict
  code-mode receipt v3 (`strict-code-mode-v2`). Fleet attestation v9 binds the
  exact provider, model, transport, CLI, rollout, and receipt. Older receipt and
  attestation schemas, including immutable v8 strict-Terra evidence, remain
  historical readers only and cannot satisfy a current run or resume.
- **Tier 3 — feedback compiler** (`src/feedback/`): clusters and ranks Tier-1
  findings and verified Tier-2 reports into `hotspots.{json,md}`
  (`npm run feedback:compile`), writes a separate `retention.json` that admits
  only sidecar-verified pure exits and groups their decision/checkpoint curves
  by journey-contract version (historical v1/v2 and current v3 are never pooled),
  excludes deterministic structural mocks from product hot spots and experience
  metrics, tracks trend (improved/regressed/new/flat), and feeds the assessor's
  ranking.

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

The blind harness drives whichever subscription CLI the provider registry
(`src/blind/providers.ts`) names, through a runner-enforced no-file, no-shell,
no-web tool boundary — no vendor is privileged, and adding one is a registry
entry plus an operator-owned model catalog under `blind-tester/catalogs/`.
Vendors that ship no CLI are played through their own client and recorded with
`npm run playtest:ingest`; those sessions are stamped `operator_attested`, count
toward bug corroboration, and are excluded from experience metrics. Arbitrary
`BLIND_AGENT_CMD` overrides are still rejected for pure runs because their
blindness cannot be verified. Live play is
NOT part of CI or the health bar (a structural mock fleet run is — see
[`docs/testing_pyramid.md`](./docs/testing_pyramid.md)). Separately, the
authoring/repair agents (`bin/author.ts`, the debugger/fixer) run against a
deterministic, keyless `MockAuthorProvider` behind the small `Provider`
interface (`agents/llm/`). The author fixture returns the same Lighthouse draft
for every premise; what CI exercises is the real adapter → validator → revision
loop, not open-ended prose generation. This is a public, no-runtime-LLM repo:
there are no third-party LLM API keys or key-based provider backends in it.

## The flywheel — two independent loops

Full reference: [`docs/two_loop_workflow.md`](./docs/two_loop_workflow.md).

**Dev loop** (`loop.sh`, protocol in [`docs/afk_loop.md`](./docs/afk_loop.md)):
**assess** (`npm run ai:loop` — the QA bucket first, then `src/afk/assessor.ts`'s
own candidates; an empty bucket is normal and never stalls the loop), **work**
(one focused change), **verify** (`crawl:smoke`, the health bar, and an integrity
check against the pre-cycle ref so the verifier itself can't be weakened). It
is meant to stop playing the game — removing the per-cycle playtest gate is what
un-blocks the throughput the old single loop spent waiting on. That migration is
**half done**: the gate is gone from `loop.sh`, but `loop:seal-feedback` still
requires the cycle's own pure playtest artifacts before the final ledger commit in
commit-mode, and the generated cycle prompt still asks for them. See `AGENTS.md`
step 5 before running a cycle without one.

**Playtest loop** (`playtest-loop.sh`): runs independently and in parallel,
plays the most recently published build with as many cheap players as your
quota allows plus a small expensive reference cohort, records every playthrough,
and promotes corroborated or reproduced findings into the intake queue.

**Intake** (`intake/queue/`, `npm run work` / `npm run submit`): the dev loop's
one inbox. Playtest triage is a source, not the only one — an audit agent, a
research proposal, the crawler, or a person all file the same submission, and
`npm run intake:sync` mirrors the queue to GitHub Issues so people can file from
anywhere.

**The dev loop runs on any model.** It auto-detects an installed agent (`codex`,
`claude`, `gemini`; `AI_AGENT` selects, `AI_AGENT_CMD` overrides anything), and
asking for an absent one fails loudly rather than silently substituting a vendor.

**The playtest loop is any-model in what it RECORDS, but not in what it can
launch.** Only `codex` can run a live blind cohort today, because
`runner_enforced` blindness is proved by reading Codex's own rollout logs
(`blind-tester/codex-rollout.mjs` and companions) and no equivalent reader exists
for another vendor — `blind-tester/run.sh` refuses a non-Codex pure run. Every
other vendor is played in its own client and ingested with
`npm run playtest:ingest`, landing `operator_attested`: counted toward bug
corroboration, excluded from experience metrics. So headline experience numbers
are currently a measurement of Codex specifically, not of players in general.
`npm run doctor` reports which vendors a given machine can actually launch.

Agent errors fail a dev cycle; a bounded durable failure ledger is shown by
`npm run loop:status`. `npm run loop:status` / `npm run loop:stop` manage a
running loop; `npm run assess` previews the ranking.

That shell driver defines and exercises the protocol; it is not a claim about
the dominant execution path. Recent repository work may instead be orchestrated
directly on short-lived PR branches, applying the same crawl, health, integrity,
and evidence rules without launching `loop.sh`.

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
