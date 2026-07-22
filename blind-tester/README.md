# blind-tester — subscription-only blind playtesting over MCP

A self-contained harness that has a frontier model **play an AdventureForge game
blind** — through the MCP server, with no access to the source — and write a
ruthless first-time-player critique. Pure single runs support hardened **Claude
Code** and **OpenAI Codex** subscription CLI providers: no API key is passed to
the game or harness.

## Why no API key

There are two different ways a model touches this project, with different auth:

|                     | Authoring (`adapt_story`)       | **Blind playing (this harness)**               |
| ------------------- | ------------------------------- | ---------------------------------------------- |
| Who calls the model | the repo's own code, in-process | an isolated external `claude` or `codex` CLI   |
| Authentication      | provider API key                | the selected CLI's existing subscription login |
| Needs a harness key | yes                             | **no**                                         |

This harness is the right-hand column: the model is an external player that reaches
the game **only** through the `mcp__adventureforge__*` MCP tools. That uses your
subscription allowance, which is the best value — exactly per the project goal.

## Pure live and structural modes

- **Pure live mode (canonical default):** every reasoning agent starts one fresh
  overworld session with `play_mode: pure` and
  `start_surface: fresh_overworld`. It receives only the tutorial, current goal,
  completed-goal history, state, legal and authored story choices,
  meaningful-decision/checkpoint status, and consequences a human receives.
  Current journey contract v3 presents continue/end choices bound to the goal
  just completed and at fixed decision checkpoints. After a goal continuation,
  a game-authored story choice may install the next objective. The harness
  interviews only after the player ends through a retention choice; it supplies
  no route, coverage assignment, solution, or call-count stopping rule.
  Follow-up navigation comes only from the game's shared Goal Passage choice,
  which yields at real road choices and resource boundaries, never from the
  harness.
- **Structural development/QA (explicit only):** `--smoke`, `--mock`, crawler,
  and direct `--quest <id>` paths prove plumbing/mechanics. They are labeled
  non-pure and retention-ineligible, and can never resume or count as pure live
  evidence.

The goal/checkpoint continue-or-end choice is retention evidence and does not
advance the decision counter. A post-continue `journey.storyChoice` is ordinary
gameplay: choosing one of its visible options records the authored consequence,
counts once as `situation_changed`, and activates the next current goal.

## Quickstart

```bash
# 0) Explicit structural MCP check — NO LLM/tokens, not retention evidence.
npm run blind:smoke

# 1) Canonical pure player — fresh game, game-native goal/checkpoint exit:
npm run blind

# 2) Same, watched live:
npm run blind --spectate                  # then `npm run spectate` in another terminal

# 3) Targeted quest plumbing — explicit structural smoke, NO LLM/tokens:
bash blind-tester/run.sh --smoke --quest sunken_barrow --seed 11

# Codex Spark is the default pure player (PowerShell-safe equals form):
npm run blind --seed=2875

# Claude remains an explicit hardened compatibility provider:
npm run blind --provider=claude --model=opus --seed=2876
```

The report is written to `blind-tester/reports/<stamp>_<source>_seed<n>.md`
(`<source>` is `overworld` for the default core-game run, or the quest id)
(and the provider envelope alongside as `.json`; Codex also keeps its audited
`.codex.jsonl` transport). `reports/` is gitignored.

The built-in Codex path starts from an isolated temporary player directory and
a fresh per-run `CODEX_HOME` under the repo's ignored `.tmp/blind-codex-home/`
runtime tree. Keeping the sterile home outside the operating-system temp directory
lets Codex create its normal PATH aliases without a warning. The home contains
only a private copy of `auth.json`, is removed on exit, ignores
user/project config and rules, disables shell/web/apps/plugins/browser/computer,
the unused shell snapshot, and subagent capabilities. It also passes
`--enable code_mode_only`, forcing gameplay through the audited `functions.exec`
wrapper instead of direct MCP dispatch. The runner injects only the pure
AdventureForge MCP server and pair-audits every normal game call. The audit
accepts the exact generic pre-turn code-mode notice only for a requested and
captured supported model. Spark must then carry its second exact model-metadata
notice; any changed, additional, or out-of-order error remains invalid. The
notices stay visible in raw evidence.
It accepts no discovery, resource, planning, task, or other non-game event; another
server, malformed lifecycle, or unbounded payload rejects the run. Codex never
uses a report-recovery model turn. On attempt zero only, an otherwise-valid
report whose sole verifier defect is its existing `journey_exit_receipt` value
may use deterministic server-receipt binding. The runner preserves the exact
provider message in `.json` and `.initial-report.txt`, replaces only that JSON
value, and writes strict `.receipt-bind.json` hashes; duplicate keys, subjective
or prose-rating drift, other report defects, provenance mismatch, or failure to
reproduce and pass the unchanged verifier rejects the run. Fleet runs capture one rollout JSONL from the sterile home and
verify its cwd against the still-live isolated player directory by exact
canonical path and native filesystem identity. An exclusive adjacent
`.codex-capture.json` receipt records that capture-time check and binds it to the
copied rollout's SHA-256; resume and certification revalidate its strict fields
and rollout bytes. Because the temporary directory is then deleted, later checks
cannot re-stat it: this is trusted local runner provenance, not a cryptographic
attestation against a privileged actor coherently rewriting the whole bundle.
The CLI-recorded selected model/provider/session/effort/turn and completed
lifecycle are bound independently of requested-model and synthesized usage
fields. This is durable Codex CLI provenance, not a provider-signed snapshot of
the remote backend.

## Watching a playthrough live (spectate mode)

To see what the LLM is doing while it plays — and verify it with your own eyes —
run the playtest in spectate mode and tail the feed from a second terminal:

```bash
# terminal 1: the playtest, with a 1.5s pause per tool response so a human can follow
npm run blind -- --spectate --delay-ms 1500

# terminal 2: the live feed (every tool call: args + the scene the agent saw)
npm run spectate
```

The feed (default `ai-runs/spectate.log`, gitignored) is written by the MCP
server itself, so it works for ANY client — not just blind runs. To spectate any
MCP session, start the server with `npm run mcp -- --spectate [path]
--spectate-delay-ms <n>` (or env `AF_SPECTATE=1|<path>`,
`AF_SPECTATE_DELAY_MS=<n>`). The delay paces every tool response; leave it off
for a full-speed feed. Spectate is fully inert when not enabled.

## Fleet mode — 100 fresh-game blind playtests

`blind-tester/fleet.mjs` (Tier 2 of the testing pyramid,
`docs/testing_pyramid.md`) runs the 100 independent pure fresh-overworld players
required at a milestone or feedback-harvest cycle, with bounded concurrency,
optional authenticated diagnostic resume, and a closed manifest bundle — each
one an ordinary `run.sh` spawn. The starting-slice pilot and authority commands
are:

```bash
npm run fleet -- --provider codex --model gpt-5.6-terra --count 10 --concurrency 4 --seed-base <fresh-pilot-seed-base> --label <fresh-pilot-label> --no-resume --max-retries 0
npm run starting-slice:pilot -- --fleet ai-runs/fleet/<fresh-pilot-label>
npm run fleet -- --provider codex --model gpt-5.6-terra --count 100 --concurrency 4 --seed-base <fresh-seed-base> --label <fresh-label> --no-resume --max-retries 0
npm run fleet:mock -- --count 2     # structural zero-token dry run
npm run fleet:mock -- --count 2 --target quest:sunken_barrow # structural drop-in
```

- **Preflight**: before spending tokens, a live fleet freezes the full clean
  tracked Git commit, canonical world id/hash, contiguous planned seeds, and
  run/model plan. A dirty tree or Git/provenance error aborts launch. Untracked
  notes do not dirty this check.
- **Persona**: pure live fleets enforce the neutral `default` first-time-player
  persona. `explorer`, `speedrunner`, `breaker`, `casual`, `lore-reader`, and
  `mixed` remain explicit structural experiments; their prescribed behavior
  changes the retention measurement.
- **Provider/model**: Claude accepts `--model <alias>` (`haiku`, `sonnet`,
  `opus`) or diagnostic `--model mix`
  (deterministic 9 haiku : 1 sonnet weighting by index). No temperature/top_p
  flag exists — model × seed is the live diversity axis. The live fleet default
  is Codex `gpt-5.3-codex-spark`, using the dedicated Spark allowance for
  ordinary blind feedback; Claude must be selected explicitly. Codex accepts
  only exact homogeneous
  `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, or
  `gpt-5.3-codex-spark` plans; aliases, fallback, and mixing fail before launch.
- **Resume**: resume is enabled by default for diagnostic fleets only. Only a
  reverified report plus evidence-sidecar schema v2 with the
  current journey contract, exact planned seed, and exact clean commit and world
  id/hash may skip a pure member. Generic readers retain historical sidecar-v1
  readability, but v1, historical contract-v1/v2, guided, legacy, mock, and
  structural evidence never enters a diagnostic pure cohort. `--no-resume`
  disables lookup entirely and is mandatory for certification. Failed attempts back off
  exponentially up to `--max-retries` (default 2). Before a retry, every
  generated artifact and a diagnostic log are copied into the bundle's
  per-seed/per-attempt archive with byte counts and SHA-256 digests.
- **Runner attestation**: historical Claude members retain the adjacent v2
  attestation. Ordinary historical Codex members remain readable as v3; current
  Codex members use v4, binding the exact CLI-recorded selected
  model, provider `openai`, effort `xhigh`, provider session/turn, verified
  isolated working directory, completed one-turn lifecycle, public events,
  original provider report, the single copied rollout, and its strict cwd capture receipt.
  Before verification or publication, the copied rollout also proves every
  AdventureForge result reached the player. Each public gameplay call is
  cross-bound in order to one exact private `exec -> MCP completion -> visible
output` lifecycle. For current live runs, every Codex `functions.exec` wrapper
  begins with the exact transport comment
  `// @exec: {"yield_time_ms": 120000}`; it changes only the code-mode yield
  boundary and adds no executable statement. The wrapper then invokes only that
  allowlisted gameplay tool with literal arguments and emits the exact result
  bytes. `functions.wait` is forbidden, and a yielded or wedged wrapper remains
  invalid. Historical evidence is not retroactively required to contain the
  comment and remains subject to the same strict parser and topology audit. Extra tools,
  statements, output, mismatched ids/results, truncation, duplication, and
  orphan lifecycle rows reject the attempt. Private input, prompt, context,
  compaction, assistant, and reasoning rows also have a finite authenticated
  topology. Sol and Terra require the v2 `explicitRequestOnly` three-developer
  prelude. Luna alone accepts its native v1 capture: exact model
  `gpt-5.6-luna`, no `multi_agent_mode`, and one developer message containing
  exactly the ordered permission and skills blocks before the environment. Spark
  retains its native `multi_agent_version: "disabled"` one-developer profile
  with no `multi_agent_mode`. Every profile then requires the same world, turn,
  prompt, and user-message order. The first wrapper may use `start_overworld()`
  when its recorded arguments are exactly `{}`; zero arguments anywhere else
  reject. Auxiliary inputs or native-tool-shaped rows also reject.
  The native `collaboration_mode` object is also exact: `default`, `xhigh`, null
  developer instructions, no missing/extra fields, and one inner model equal to
  both the outer turn model and requested model. This does not add a
  `multi_agent_mode` field to Luna or Spark.
  Before reusing a current-schema report, the feedback compiler and ledger rerun the full
  provider authority chain, including report/envelope/session/model/capture
  hashes. Retained seeds `2825`, `2850`, `4352`, `4353`, and `4385` predate the
  complete authority chain and are diagnostic only; `4351`, `4354`, and `4386`
  still satisfy it. Retained Luna seed `4398` demonstrates the v1 serialization
  shape but remains diagnostic and unpublished because its gameplay/result and
  receipt evidence still fail independently.
  `task_complete` must be the final rollout row and any abort/error lifecycle
  history rejects the run. All artifact bytes are hashed. Requested-model and
  synthesized usage fields are not authority; missing or ambiguous rollout proof
  fails closed. Certification independently reparses the retained chain and
  rejects recovery, reuse, links, and path escape. For a receipt-bound member,
  v4 also hashes `.initial-report.txt` and `.receipt-bind.json`, reproduces the
  one-value edit from raw evidence, and records `report_receipt_bound`; it does not re-stat the
  already-deleted temporary cwd or provide a provider signature.
- **Output**: reports plus verified `.run.json` evidence sidecars in `reports/`
  (or `--out <dir>`). For pure runs the adjacent sidecar is the final publication
  commit marker: verification uses a work-private sidecar, then the runner
  publishes exact raw JSONL, completes recovery/provenance gates, and creates
  `.run.json` last with an exclusive byte-checked copy. A `.md` or
  `.evidence.jsonl` left without that marker is rejected, never treated as
  legacy evidence; ordinary unsuccessful exits also remove those unfinished
  acceptance artifacts. A manifest at
  `ai-runs/fleet/<label>/manifest.jsonl` and `summary.json` preserve play mode,
  start surface, journey contract, authenticated seed/build/world/quest
  outcomes, current/completed goals, goal/checkpoint choices, exit reason, and
  eligibility. Every row carries the complete ordered attempt history and
  declares report-only recovery only when `.initial-report.txt`,
  `.repair.meta.json`, and `.repair.json` form a complete, deterministically
  reproducible byte-bound set; rejected originals stay outside feedback
  compiler `*.md` discovery. Deterministic Codex receipt binding is recorded
  separately in each attempt, manifest row, v4 attestation, and the summary's
  `receipt_bound_runs`; it does not change subjective fields and remains
  certification-eligible. Recovery is diagnostic only: subjective fields
  such as confusion, bugs, stuck state, and replay intent were generated after
  the primary report and therefore cannot certify the slice. Summary
  failure/timeout counts are reduced from all attempts, not only each slot's
  final result. Each live label must be fresh and identifies one frozen cohort;
  an existing label is rejected rather than appended to or mixed with stale
  rows. Resume, a skipped slot, any retry, or any failed attempt makes a bundle
  diagnostic and non-certifying. A new authoritative label must launch all 100
  slots with `--no-resume --max-retries 0`; historical successes cannot be
  relabeled into that cohort.
- Live (non-mock) fleets spend real tokens — run them from a plain shell, not
  from inside a Claude Code session (nested CLI auth returns 401 there). A live
  fleet always enforces pure/fresh-overworld/default-persona; `quest:<id>` and
  non-default personas are accepted only by explicit mock structural runs.

### Certifying the starting slice

First close a fresh 10-player homogeneous provider/model pilot bundle and run
its distinct go/no-go checker:

```bash
npm run fleet -- --provider codex --model gpt-5.6-terra --count 10 --concurrency 4 --seed-base <fresh-pilot-seed-base> --label <fresh-pilot-label> --no-resume --max-retries 0
npm run starting-slice:pilot -- --fleet ai-runs/fleet/<fresh-pilot-label>
```

The pilot requires 10/10 primary unrecovered/no-retry members, unique game and
provider sessions, one exact provider-evidence model value, at least three
recognized Wolf-Winter strategies, and no strategy above 7/10. It writes a
separate pilot artifact and never certifies the slice. If the exact provider
model id changes before authority, repilot. The authority checker validates only
the submitted 100-member bundle; retaining and reviewing the corresponding
fresh same-model pilot is an explicit operational prerequisite, not an
automatically linked field in the authority artifact.

Then close the authoritative 100-player homogeneous bundle and run, for example:

```bash
npm run fleet -- --provider codex --model gpt-5.6-terra --count 100 --concurrency 4 --seed-base <fresh-seed-base> --label <fresh-label> --no-resume --max-retries 0
npm run starting-slice:certify -- --fleet ai-runs/fleet/<label>
```

The certifier reparses and reverifies all reports and sidecars. It requires
exactly 100 unique contiguous planned seeds, no failed/missing slots, one clean
build/world, zero failed attempts or report-recovered members across the closed
histories, the current pure fresh-overworld/default-player contract, and a
homogeneous supported provider/model bound to one exact provider-evidence model
value, with unique game and provider sessions. Malformed or unauthenticated
evidence exits 2; valid evidence that misses a gate exits 1; a pass exits 0.

The exact simultaneous quality gates and Wolf-Winter outcome mapping live in
[`docs/STARTING_SLICE.md`](../docs/STARTING_SLICE.md). The certifier uses the
receipt's initial-goal choice, never `would_replay`; treats absent Wolf completion
as incomplete and death/unknown endings as invalid; and keeps ambiguous issue
scope in-scope. Only this fleet can decide certification—global historical
feedback remains diagnostic. This command defines the later certification run;
the slice remains `active_unproven` until a bundle passes.

## Mock mode — zero-token CI fleet

`--mock` sets `BLIND_AGENT_CMD` to `mock-agent.mjs`, a deterministic
MCP-speaking scripted QA agent with no LLM or tokens. `npm run fleet:mock` is
what CI runs (small acceptance e2e), exercising the structural fleet → verified
reports → `feedback:compile` plumbing on every push. Mock reports are always
`play_mode: structural` and `retention_eligible: false`, even when the script
also exercises the journey state machine.

## Platforms

Works natively on Linux, macOS, WSL, and Windows (PowerShell, cmd, or Git Bash —
`npm run blind` resolves Git Bash itself, so the System32 WSL `bash.exe` can
never hijack the run).

**Passing flags from PowerShell:** PowerShell strips a bare `--` (it's PS's own
end-of-options token), after which npm eats `--flags` as npm configs. The
launcher recovers them automatically, but the reliable shapes are the equals
form without `--` — `npm run blind --smoke --quest=breaking_weir --seed=11` —
or `BLIND_*` env vars. In Git Bash / Linux / macOS,
`npm run blind -- --smoke --quest breaking_weir` also works as usual. These are
structural smoke invocations; omitting `--smoke` from a quest target is rejected
before tokens are spent. One Windows-specific rule the harness already handles:
the MCP server launch never relies on the client honoring a `cwd` field
(`npm --prefix` self-cds instead), because the Claude CLI on Windows silently
ignores stdio-server `cwd`. Note a checkout `npm install`-ed on Windows cannot
run under WSL's Linux node (native esbuild binary mismatch) — the runner detects
this and says so instead of failing cryptically.

## Telemetry — measured, not guessed

Every completed run appends one JSONL row (turns, duration, token usage, the
run's NOMINAL API cost — the subscription covers it; it's an efficiency signal,
not a bill) to the gitignored `ai-runs/blind-telemetry.jsonl`:

```bash
npm run blind:telemetry     # per-source summary: runs, mean turns/minutes, tokens, nominal $
```

Recording is best-effort (a telemetry failure never fails the run) and happens
only on the built-in `claude` pure path. Structural mock runs do not produce a
Claude envelope to measure.

## How pure blindness is enforced

1. **Isolation.** The agent runs from an isolated temporary directory. File,
   shell, source, and web access are disallowed; it cannot read the repository,
   content, instructions, or solutions. Claude also receives a sterile per-run
   config containing only a mode-0600 copy of `claudeAiOauth`: user/project/local
   setting sources and auto-memory are disabled, so global instructions, hooks,
   plugins, skills, settings, and unrelated OAuth state cannot enter the run.
2. **Player-only server.** The runner launches MCP with `--play-mode pure`.
   Tool discovery returns only human-equivalent world/quest reads and decisions,
   one fresh overworld start, the journey choice, and an authored story-choice
   tool that works only when the same UI choice is due. Raw state, save/import,
   restore, direct quest, validation, replay, generation, and authoring tools
   are absent. Calls after game-confirmed exit are rejected.
3. **Server-authored evidence.** A private JSONL records the fresh start and
   final journey exit, including identical seed, full Git commit, tracked-clean
   bit, and canonical world id/hash, plus exit quest outcomes. The report
   verifier matches their session, provenance, and exact receipt before writing
   a verified evidence-sidecar v2. Model prose cannot relabel a structural run
   as pure.

This mirrors the canonical procedure in [`docs/blind_playtest_protocol.md`](../docs/blind_playtest_protocol.md);
the live [`prompt-overworld.md`](./prompt-overworld.md) carries only the MCP
transport boundary and schema-V2 interview format; current journey contract v3
and the game carry every objective, authored handoff, consequence, and session
rhythm. The structural-only [`prompt.md`](./prompt.md) is a QA fixture.

## Files

- `run.sh` — the runner: builds the pure MCP config and private evidence path,
  fills the transport-only prompt, runs `claude -p` from an isolated directory,
  and verifies the report/receipt after game-confirmed exit. `--smoke` selects
  the structural no-LLM path.
- `smoke.mjs` — token-free MCP smoke test via the MCP SDK client: spawn server,
  `tools/list`, exercise overworld and direct quest starts, step a few actions,
  assert. Run
  this anytime to verify the plumbing without spending budget.
- `prompt-overworld.md` — the locked-down live new-player prompt.
- `prompt.md` — the direct-quest prompt retained for non-LLM structural fixtures.
- `loadtest.sh` / `prompt-loadtest.md` — explicitly structural server/token QA
  with a prescribed workload; never a blind report or retention evidence.
- `reports/` — run outputs (gitignored).

## Options

```
--quest <id>     target ONE shipped quest for a structural dev/QA drop-in;
                 requires --smoke (or --mock through fleet), never a live agent
--seed <n>       deterministic seed (default: 7)
--provider <id>  codex (default) | claude
--model <id>     exact Codex id (default: gpt-5.3-codex-spark), or an explicit
                 Claude alias: haiku | sonnet | opus
--out <prefix>   report path prefix (default: reports/<stamp>_<source>_seed<n>)
--smoke          run the no-LLM MCP smoke test instead of a real playtest
--overworld      explicit fresh-overworld target (already fixed for pure live play)
--spectate       write the human-watchable feed (watch with: npm run spectate)
--delay-ms <n>   pace every tool response by n ms (implies --spectate)
```

Environment: `BLIND_QUEST_ID` (structural runs only), `BLIND_MODEL`,
`BLIND_TIMEOUT` (seconds, default 1200; technical failure/failsafe, never a play budget),
`BLIND_REPORT_RECOVERY_TIMEOUT` (seconds, default 120; report-only failsafe),
`BLIND_SPECTATE=1`, `BLIND_SPECTATE_DELAY_MS`, `BLIND_BASH` (Windows: path to Git
Bash if auto-detection fails).

If a normally completed pure run has current v2 evidence proving exactly one
fresh start and one journey exit, but its otherwise complete Markdown omitted
only the exit-interview block, the runner may resume that exact Claude
session/model once. The repair turn has no tools or MCP and returns strict
subjective JSON only. The runner preserves the original prose byte-for-byte,
injects the authenticated receipt, then verifies the candidate and final
report with the unchanged verifier. Timeouts, missing exits, MCP/mechanical
failures, other report defects, model/session drift, or a second attempt never
enter this path. Recovery artifacts and phased telemetry remain durable for
audit without adding extra `reports/*.md` inputs.

## Why arbitrary provider overrides are not pure evidence

The canonical live player is the runner-owned Codex launch, defaulting to Spark
inside an isolated temporary directory with file, shell, web, configuration,
and unrelated tools denied. The explicit Claude adapter remains compatible and
hardened. An arbitrary external command may connect only to the player MCP
server yet still retain filesystem or shell access outside MCP; a valid exit
receipt cannot prove that it stayed blind. Therefore `BLIND_AGENT_CMD` is
rejected on live pure runs instead of relying on operator discipline. Additional
providers require an equally hardened adapter and acceptance regression.
Explicit `--smoke` and `--mock` remain non-pure development/QA instruments.
