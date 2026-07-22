# Blind playtest protocol

Blind playtests measure the experience a new player actually receives. They are
Tier 2 of `docs/testing_pyramid.md`: a fresh reasoning agent has no repository,
content, solution, authoring, or diagnostic access and plays only through the
player-facing AdventureForge MCP surface.

A normal cycle uses one player (`npm run blind`). A milestone or feedback
harvest uses 100 independent players (`npm run fleet -- --count 100`).

## Two contracts that must not be mixed

### Pure live play (canonical default)

`npm run blind` and every live `npm run fleet` member run with:

- `play_mode: pure`;
- `start_surface: fresh_overworld`;
- the neutral `default` first-time-player persona; and
- one new overworld session, never a restore or direct quest drop-in.

The pure MCP server exposes only actions available through the human game. The
agent receives the same one-screen tutorial, current goal, world/quest state,
legal choices, meaningful-decision count, checkpoint choice, and consequences a
human receives. The harness may explain MCP transport and hash-guard syntax. It
must not prescribe routes, coverage tasks, content targets, solutions, deliberate
invalid calls, or a test-only stopping rule.

### Structural development/QA (explicit only)

Crawler, smoke, and mock paths may inspect structure or use a direct quest start
when their explicit flags say so. They prove plumbing and deterministic
mechanics; they do not simulate a new player. Structural output must be labeled
non-pure and retention-ineligible. It must never satisfy or resume a live pure
fleet member.

## The game-native journey contract

The game owns session length. Current contract version 3 has this initial goal,
rendered
identically in UI and MCP:

> Find one local lead in Albany and see it through.

The proof-hashed goal text stays exactly that short. Its shared UI/MCP
`goalGuidance` explains the completion rule separately: completing one Albany
quest satisfies the goal; jobs, events, and sites may reveal leads, but do not
finish it themselves.

The baseline is 40 meaningful accepted gameplay decisions. The game offers an
actual continue/end choice at decision 40, then at 80, 120, 160, and every
additional 40. If the current goal is completed earlier, the game offers the
same choice immediately and binds that retention event to the completed goal's
version and id. Continuing after an early goal choice preserves the next fixed
checkpoint.

A decision is one successfully accepted, consequential gameplay choice shared
by the human and MCP surfaces. Movement, a stateful clue, substantive dialogue,
combat, skill-check attempts, preparation, and other situation changes count.
Context-only LOOK or INVENTORY, repeated narration or examination, dialogue
opening/navigation/closure, unchanged rest or resupply, legal-action listings,
save/export/restore, rejected or stale calls, technical quest foldback, and the
continue/end choice itself do not.
The engine emits the same `countsTowardJourney` classification and reason on
both player surfaces; the harness never infers it from transport calls.

The initial goal completes only when the player successfully completes a quest
whose home is Albany. Discovering or starting a lead, doing a job or event,
visiting a site, or dying inside a quest does not complete it.

Contract v3 carries one versioned current goal plus an ordered completed-goal
history. Completing a goal adds it to that history before the game-owned
continue/end pause. If the player ends, no follow-up state is installed. If the
player continues, the game may present an authored `storyChoice`; selecting one
visible option is an accepted `situation_changed` gameplay decision, persists
its consequence, and activates the next versioned goal. Completing that goal
can therefore trigger another goal-bound retention choice before a fixed
checkpoint. The story choice is distinct from the non-counting continue/end
retention choice.

The opening handoff demonstrates the rule without giving the harness hidden
content knowledge. Wolf-Winter's recorded non-death ending determines truthful
Albany return context and a non-mutating teaser on the initial goal-completion
screen. Only after `continue` does the game offer the player-facing Albany dawn
dispatch choice and install its chosen objective. UI and MCP receive the same
message, option ids, labels, consequences, current-goal text, and goal history.
For every later goal in another town, the shared journey presentation also gives
the next road and remaining route estimate from the player's current location;
the harness adds no navigation advice of its own.

While a continue/end choice is due, further gameplay decisions pause. Choosing
continue records retention evidence and resumes play. Choosing end records the
final retention choice, ends the journey, and returns a signed-by-state receipt
containing the contract version, meaningful-decision count and proof, current
goal, completed-goal history, goal-bound retention history, checkpoints, and
exit reason.

## One pure run

1. Run the deterministic pre-crawl gate: `npm run crawl:smoke`.
2. Start `npm run blind --seed=<fresh>` with a fresh seed. The default is the
   built-in hardened Codex Spark path;
   `npm run blind --provider=claude --model=sonnet --seed=<fresh>` selects the
   explicit Claude compatibility provider. Both launch MCP in `pure` mode and supply a
   private JSONL evidence path. Neither path permits an arbitrary
   `BLIND_AGENT_CMD` to claim pure evidence.
3. The player calls `start_overworld` once and plays independently. It follows
   only game-presented goals and choices, including any quest reached naturally
   through the normal `start_overworld_session_quest` bridge. A compact
   `context.quest_starts` tuple is the executable authority for that
   human-equivalent player action; its quest and approach values are passed
   unchanged, with a null approach omitted. `start_world_quest` and any other
   quest drop-in that bypasses the overworld remain forbidden in pure play.
4. At every game-presented journey choice, the player honestly chooses continue
   or end. After continuing, it also answers any game-presented authored story
   choice by passing a visible option id to
   `choose_overworld_session_story`, then follows the resulting current goal. It
   does not stop because of elapsed tool calls or presumed coverage.
5. After the game confirms end and returns the journey receipt, the MCP run is
   closed. The only exception is a response explicitly carrying
   `run_evidence.recorded: false` and `retryable: true`: the player repeats that
   exact parent-session `end` once, makes no other call, and waits for evidence
   confirmation before reporting. A non-retryable recorder failure closes an
   invalid run truthfully. Only then does the harness collect the exit interview.
6. `scripts/verify-blind-report.ts` verifies the V2 pure interview against the
   server evidence using a work-private sidecar. A report counts only when
   fresh-start and journey-exit events share the same session, the receipt
   matches exactly, and the exit is the last gameplay event. After exact raw
   evidence, recovery evidence when applicable, and final Git provenance all
   pass, the runner exclusively copies that private sidecar to adjacent
   `.run.json` as the last, byte-checked publication commit.

The runner's 20-minute timeout is a technical failsafe. A timeout is a failed
run with no retention-eligible interview, not an intended gameplay endpoint.
Likewise, a discoverable `.md` or durable `.evidence.jsonl` without the adjacent
`.run.json` commit marker is an interrupted/rejected pure publication, not a
legacy report. Normal unsuccessful exits remove those unfinished artifacts;
the missing marker keeps hard-kill remnants out of feedback and attendance.

One Claude-provider fail-closed report-only exception exists: after a normal CLI exit, current
v2 private evidence must independently prove exactly one fresh start followed
by exactly one journey exit, and the unchanged verifier must reject only a
missing exit-interview block. The runner may then resume the same Claude
session/model once with no tools or MCP to extract strict subjective fields.
Original prose and ratings remain byte-bound, while the runner injects the
authenticated receipt and reverifies the promoted report and sidecar. This is
never a gameplay continuation and cannot recover a timeout, missing exit,
mechanical/MCP failure, or any other report defect.

Codex runs reuse the same unchanged evidence verifier and sidecar-last
publication transaction and never start a second model turn. If the attempt-zero
provider report has exactly one final, otherwise-valid pure V2 interview and its
only verifier failure is an invalid or mismatched `journey_exit_receipt`, the
runner may perform deterministic receipt binding. It authenticates the completed
audited Codex envelope, exact original report bytes, current v2 raw evidence,
launch seed/commit/cleanliness, singleton requested model, subjective schema,
and prose ratings; rejects duplicate JSON keys or any other defect; and replaces
only the existing top-level receipt JSON value with the server-authored receipt.
The original provider message remains byte-for-byte in `.json` and
`.initial-report.txt`. Strict `.receipt-bind.json` metadata hashes those inputs,
the receipt, and the bound output; reproduction plus the unchanged verifier must
pass before publication. This is machine evidence binding, not report recovery:
no prose, rating, bug, confusion, verdict, or replay answer may change.
It is available only while the private attempt-zero evidence exists inside the
live publication transaction and never retroactively accepts a historically
rejected report.

The runner starts Codex in an isolated temporary player directory. Its fresh
per-run `CODEX_HOME` lives under the repo's ignored `.tmp/blind-codex-home/`
runtime tree (outside the operating-system temp directory, so Codex can create
its normal PATH aliases without a warning) and contains only a private copy of
`auth.json`; both isolated directories are removed on exit. User/project config
and rules are ignored, shell/web/apps/plugins/browser/computer/subagents and the
unused shell snapshot are disabled, and only the exact pure AdventureForge MCP
tools are enabled. The built-in launch also requires `--enable code_mode_only`,
forcing every gameplay call through the audited code-mode wrapper; direct-mode
calls are not current pure evidence. One exact generic pre-turn code-mode notice
is accepted only for a requested and privately captured supported model; Spark
must then carry its second exact model-metadata notice. Altered, extra, or
reordered errors fail closed. It audits the provider JSONL and rejects unknown
events, non-game tools, another MCP server, incomplete/duplicate turns,
or malformed final output. The audit accepts only reasoning, agent messages, and
paired AdventureForge gameplay calls. Resource discovery, task planning, another
MCP server, a non-game tool, and every unexpected lifecycle event reject the run.
Every AdventureForge call is separately paired by id, tool, arguments, status,
and result; the first pair must be a successful argument-free `start_overworld`.
The copied rollout then independently requires one adjacent three-row lifecycle
for every public gameplay call: an `exec` wrapper, its MCP completion, and the
player-visible wrapper output. For current live runs, every Codex `functions.exec`
gameplay wrapper must begin with the exact transport comment
`// @exec: {"yield_time_ms": 120000}`. The comment changes only the code-mode yield
boundary and adds no executable statement. After it, the wrapper still contains
only one allowlisted AdventureForge gameplay invocation with literal arguments
plus an exact result emitter, normally `text(JSON.stringify(result))`.
`functions.wait` is forbidden: a wrapper that yields or wedges instead of keeping
the MCP completion and visible output in that single lifecycle remains invalid.
This live prompt requirement does not retrofit a pragma requirement onto
historical evidence. Newly generated capture receipts use strict schema v2 and
carry the exact `code_mode_contract: "strict-code-mode-v1"` discriminator, bound
to the copied-rollout SHA-256. Only that authenticated receipt selects the
current audit: the model-specific notice, every leading yield pragma, and the
exact `result` declaration identifier and single
`text(JSON.stringify(result))` emitter are then mandatory. Exact schema
v1 capture receipts remain readable solely for historical artifacts and retain
the legacy pragma-free/direct-result/content-block renderer compatibility; a
provider row cannot opt into or out of strictness. Retained wrappers remain
subject to the same parser and topology audit. Tool,
arguments, status, result, order, count, identifiers, and exact visible bytes
are cross-bound between the public events and private rollout. Any other wrapper
activity (`ALL_TOOLS`, resources, planning, aliases, extra statements), or bare,
empty, injected, reformatted, duplicate-key, truncated, mismatched, duplicate,
orphan, or nonadjacent output rejects before verification or publication. The
private rollout also has one finite task/input/context topology: exact prelude
roles, one byte-bound text-only prompt with no auxiliary inputs, and only exact
compaction replays plus passive assistant/reasoning shapes. Sol and Terra must
serialize the v2 `explicitRequestOnly` profile with three ordered developer
messages (the first containing exactly the permission and skills blocks) before
the environment message. Luna alone may serialize the native v1 profile: model
`gpt-5.6-luna`, no `multi_agent_mode`, one developer message containing those
same two ordered blocks, then the environment message. Spark retains its separate
native `multi_agent_version: "disabled"` profile with the same one-developer
layout and no `multi_agent_mode`. All profiles then require the exact
`world_state`, `turn_context`, player-prompt, and `user_message` order. The wrapper
may omit its argument literal only as `start_overworld()` on the first
gameplay call, where the recorded invocation arguments must still be exactly
`{}`; every other call and position requires one literal object argument.
Every native profile also requires the exact observed `collaboration_mode`
object: mode `default`, no missing or extra keys, inner model equal to both the
outer and requested model, `reasoning_effort: "xhigh"` equal to the outer effort,
and null developer instructions. Luna and Spark gain no synthetic
`multi_agent_mode` field from this identity binding.
The Luna compatibility does not rehabilitate retained seed `4398`: its capture
still contains unsuccessful gameplay results and its report receipt does not
reproduce authoritative evidence, so it remains unpublished diagnostic data.
Feedback compilation and ledger refresh rerun the full provider authority
validator for current evidence, binding report, envelope, run evidence, provider
session/model, copied rollout, and capture hash. Failure text exposes no hidden
response.
A Codex report outside that single receipt-only case remains rejected and must
use a fresh seed. For a fleet member, the runner also
captures exactly one non-linked rollout JSONL from that sterile home and verifies
its recorded cwd resolves to the still-live isolated `player` directory by exact
canonical path and native filesystem identity before publication. It writes an
exclusive `.codex-capture.json` receipt binding the canonical expected/session/turn
cwd values, directory identities, and copied rollout SHA-256. Certification
independently revalidates that strict receipt against the rollout bytes and
requires one `session_meta`, one `task_started`, one `turn_context`, one final
assistant response, and one terminal `task_complete` in order; any abort/error
lifecycle history or row after `task_complete` rejects the run. The lifecycle
shares one turn id, the public thread/session agree, provider is
`openai`, sandbox is read-only, effort is `xhigh`, and both final-message fields
equal the original provider report. For a historical receipt-bound run, Codex
attestation v4 hashes the original report and binding metadata and requires
deterministic reproduction of the verified final report; ordinary Codex v3
attestations remain readable. `turn_context.model` is Codex CLI-recorded selected-model
provenance bound to the artifact, not a provider-signed snapshot proving which
remote backend served the turn. The primary envelope's requested model and
synthesized `modelUsage` are never model authority.
Current fleet publication records the same exact contract discriminator in
Codex attestation schema v5. Fresh runs and current resume/certification require
v5 plus a strict v2 capture; attestation v3 and receipt-binding v4 remain
historical-readable but cannot be mixed into a new current cohort.
The receipt is a trusted local runner assertion made while the isolated directory
still exists. Once cleanup deletes that directory, resume and certification can
reparse the receipt and reject inconsistent hashes or fields but cannot re-stat
the old cwd or resist a privileged actor coherently rewriting the entire bundle;
it is neither cryptographic nor provider-signed attestation.

## Pure prompt boundary

`blind-tester/prompt-overworld.md` is the locked live prompt. It may tell the
agent how to call the player MCP tools, retain compact legends, use session ids
and state hashes, recognize game-presented continue/end and authored story
choices, and copy the returned receipt. It may not restate hidden content,
recommend an opening route, require particular mechanics or locations, list
defects to hunt, or impose a call/turn/time budget. Gameplay behavior must come
from the game contract.

For an embedded quest, pure mode enforces `hide_graph = true`. State-bearing
compact quest start, read, and `step_action` responses default to
`compact_observation = true` and enforce `include_actions = true`, so the same
response carries a bounded `context.actions` menu of current legal ids while
quest play is active. An unchanged hash reply has no context, and a journey-choice
pause suppresses quest actions until that choice is answered. The player replaces
any older menu with the current one and guards `step_action` with
`expected_state_hash = latest state_hash`. `list_legal_actions` defaults to
labeled `{ id, command }` options in pure mode; `compact_actions = true` remains
an explicit id-only transport option. Verbose pure observations likewise
default to labeled `available_actions`. These projections expose only the same
current commands a human sees; they neither select an action nor reveal
authoring structure. `list_legal_actions` is a child-quest tool: the player calls
it only while an embedded quest is active, with the exact current
`rpg_session_id`, never the parent `overworld_session_id`. Ordinary overworld
legal choices already appear in the current overworld response and use their
corresponding overworld tools.

Pure mode repeats the parent `overworld_session_id` on every successful player
response. While an embedded quest is unresolved, it also repeats the current
child `rpg_session_id`; the two handles are never interchangeable. Missing,
mistyped, stale, or wrong-domain handles receive a structured error containing
the authoritative recoverable handle(s) and the expected field. Starting again
cannot mint a second fresh run, and parent gameplay mutations cannot orphan an
active child. The player copies each exact current handle from the latest
response and never reconstructs, shortens, or hand-types a handle or its suffix.
Pure overworld reads always remain on the compact player surface;
verbose observation, graph, id-catalog, and route-expansion knobs are absent.

A non-null `journey.goalPassage` exposes the optional player movement action
`id: follow_current_goal`. If the player chooses it, the transport binding is
exactly `follow_overworld_session_goal` with the parent `session_id` and latest
`snapshot_hash` passed as `expected_snapshot_hash`; the player never invents, infers, or substitutes a
differently named goal tool. This binding adds no route advice: the game owns
the passage and stops it at the objective, a road choice, or a resource boundary.

A non-death terminal quest step folds its result back automatically and stops
echoing the child. A death ending does not complete that quest or resurrect the
character: it retains the ended child and opens an end-only journey pause on the
parent. Choosing `end` produces the normal read-only exit receipt with the
current goal still active and `character_died` in its exit reasons. The separate
technical quest-completion tool is therefore absent from pure mode. Both
terminal responses retain the parent handle, and only the death receipt retires
the ended child. Save/restore binds this terminal to the exact unfinished quest,
fatal ending id, accepted-decision count, and full journey decision proof.

The runner enforces this boundary independently of the prose prompt:

- live quest targets and non-default personas are rejected before model launch;
- the MCP server exposes a pure allowlist and permits one fresh start;
- session recovery echoes only the singleton parent and its current unresolved
  child, never handles from full-mode or unrelated sessions;
- authored choices are available only when the same player-facing choice is due;
- authoring, validation, raw state, save/import/restore, direct quest, and other
  structural tools are absent;
- calls after a confirmed journey exit are rejected; and
- evidence metadata is written by the server, not trusted from model prose.

## Exit interview and evidence

The report ends with one fenced `json exit-interview` block. A pure report uses
schema V2 and includes:

```json
{
  "schema_version": 2,
  "play_mode": "pure",
  "start_surface": "fresh_overworld",
  "retention_eligible": true,
  "journey_exit_receipt": {},
  "clarity": 3,
  "enjoyment": 3,
  "goal_understood": true,
  "got_stuck": false,
  "confusions": [],
  "bugs": [],
  "best_moment": "one line",
  "worst_moment": "one line",
  "would_replay": true,
  "verdict": "one paragraph"
}
```

The player copies `journey_exit_receipt` verbatim from the confirmed end
response. The verifier cross-checks it against server-authored evidence and
writes a verified `.run.json` sidecar. Manifest and summary rows retain play
mode, start surface, contract version, meaningful decisions, current and
completed goals, checkpoint/goal choices, exit reason, and evidence status. The
continue/end decisions themselves are the primary retention signal;
`would_replay` remains the post-exit attitudinal question.

Evidence-sidecar schema v2 also binds the run to its private integer seed, full
40-character Git commit, tracked-worktree cleanliness, canonical world id/hash,
and sorted quest outcomes. The server writes the same seed/build/world at fresh
start and journey exit; any mismatch fails verification. This sidecar version is
separate from report schema V2 and journey contract v3. Generic readers keep
historical evidence-sidecar schema v1 readable for old feedback, but v1 lacks
the provenance needed for an authenticated current fleet.

`npm run feedback:compile` writes `retention.json` beside the ranked hot spots.
It separates pure, structural, and legacy-guided report counts and aggregates
only sidecar-verified pure continue/end choices as retention evidence. Pure
decision counts, checkpoint choices, and continuation curves are grouped by
the receipt's journey-contract version; historical v1 and v2 evidence remains
valid but is never pooled with current v3 evidence.
Character-death exits remain valid observational evidence but are classified in
their own `character_died` trigger buckets, never as voluntary checkpoint or
goal-completion retention. `character_died` is an additive current-v3 reason, so
this separation is reason-level rather than something the contract-version cohort
provides by itself. Starting-slice certification rejects death exits explicitly.

Legacy interview-schema V1/guided reports may remain in historical feedback
compiles, clearly labeled as such; they never count as pure retention evidence.
Previously verified schema-V2 pure reports carrying journey-contract-v1 or v2
receipts remain valid historical pure evidence in their own cohorts, but cannot
resume a current-contract fleet slot.

## Fleet mode

Fleet attestation supports historical Claude/Sonnet cohorts and homogeneous
Codex cohorts using exactly `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, or
`gpt-5.3-codex-spark`. Codex aliases, fallback, and mixed-model plans are
forbidden.

```bash
npm run fleet -- --provider codex --model gpt-5.6-terra --count 10 --concurrency 4 --seed-base <fresh-pilot-seed-base> --label <fresh-pilot-label> --no-resume --max-retries 0
npm run starting-slice:pilot -- --fleet ai-runs/fleet/<fresh-pilot-label>
npm run fleet -- --provider codex --model gpt-5.6-terra --count 100 --concurrency 4 --seed-base <fresh-seed-base> --label <fresh-label> --no-resume --max-retries 0
```

Every live member is the same canonical pure contract with a different seed
(and, for diagnostic experiments, optionally a different model). Pure fleets
use the neutral default persona; persona mixtures are structural experiments
only. The fleet command defaults to Codex with homogeneous
`gpt-5.3-codex-spark` for ordinary feedback harvests; canonical certification
commands pin Terra for both pilot and authority;
Claude/Sonnet requires explicit `--provider claude --model sonnet` and keeps
`mix`, Haiku, and Opus for diagnostics. All four exact Codex model ids listed
above are eligible when their CLI rollout provenance verifies.

Before any live member launches, preflight freezes one full tracked Git commit,
the canonical fresh-overworld world id/hash, the contiguous planned seeds, and
the run/model contract. The tracked worktree must be clean; dirty state or a Git
or world-provenance error aborts before tokens are spent. Untracked local notes
are ignored by the cleanliness test.

Each plan and lock row records the exact provider and model. Each live fleet
label must be fresh and names one closed cohort. An existing
label directory is rejected rather than appended to or mixed with stale rows.
Bounded concurrency and retry/backoff remain deterministic. Before each retry,
the runner copies every failed out-prefix artifact and its diagnostic into a
per-seed/per-attempt bundle archive indexed by byte count and SHA-256. Manifest
rows retain the complete ordered attempt history; summary timeout/failure counts
cover every attempt, including failures before an eventual success. Such a
label closes nonzero and is ineligible for certification. Resume remains the
default for diagnostic fleets, but every resume-enabled bundle and every
skipped slot is non-certifying. A fresh authoritative label must run all slots
with `--no-resume --max-retries 0`; historical successes cannot be relabeled
into it. Successful report-only recovery requires the complete adjacent
`.initial-report.txt`, `.repair.meta.json`, and `.repair.json` set, and must
deterministically reproduce the accepted report bytes. The text suffix keeps
the rejected response out of feedback `*.md` discovery. It remains diagnostic
evidence only: its confusion, bug, stuck, and replay-intent answers were not
byte-bound to the primary report. Diagnostic resume may reuse a report only
when an independent reverify finds evidence-sidecar
schema v2, the current journey contract, exact planned seed, and exact clean
commit and world id/hash. Historical sidecar v1 remains readable but never
resumes a slot. Manifest rows expose the authenticated seed, build, world, quest
outcomes, and journey result rather than relying on a filename or summary count.
An adjacent runner-owned attestation binds each live member to its planned
provider/model, exact singleton model provenance, unique provider session,
completed clean primary envelope, game session, and artifact hashes. Historical
Claude members retain v2 compatibility, and ordinary Codex v3 remains readable.
Historical Codex v4 additionally binds deterministic receipt-binding provenance
when present. Current Codex v5 binds the actual provider, reasoning effort, turn
id, working directory, public provider events, copied rollout JSONL, cwd capture
receipt, strict code-mode contract, and receipt-binding provenance. Diagnostic
resume reparses historical facts from the bytes; current resume and
certification require v5 and also reject reuse, links, path escape, and any
model-recovered member.

### Starting-slice certification

Before the authority spend, close and validate a fresh ten-Terra pilot:

```bash
npm run fleet -- --provider codex --model gpt-5.6-terra --count 10 --concurrency 4 --seed-base <fresh-pilot-seed-base> --label <fresh-pilot-label> --no-resume --max-retries 0
npm run starting-slice:pilot -- --fleet ai-runs/fleet/<fresh-pilot-label>
```

The pilot requires 10/10 primary-subjective/no-model-recovery/no-retry reports, unique game and
provider sessions, one exact provider-evidence model value, recognized Wolf-Winter outcomes, at
least three strategy families, and no family above 7/10. It checks the other
slice gates but writes a distinct readiness result and can never certify the
milestone. If the exact provider model id later changes, repilot. The authority
checker validates only its submitted homogeneous 100-member bundle; the
corresponding fresh same-model pilot remains an explicit operational gate that
operators retain and review, not an automatically linked authority field.

After the authoritative live cohort is closed, run:

```bash
npm run starting-slice:certify -- --fleet ai-runs/fleet/<label>
```

The certifier independently reparses every authenticated artifact. It requires
exactly 100 unique contiguous planned seeds, no failed or missing slots, the
default pure fresh-overworld contract, `--no-resume`, exactly one verified
attempt per slot, zero skipped/resumed or report-recovered slots, and the
homogeneous supported provider/model plan bound to one exact provider-evidence
model value, with unique game and provider sessions, on one clean build/world. Malformed or unauthenticated evidence
exits 2, an authenticated cohort that misses a threshold exits 1, and a pass
exits 0.

The exact numeric gates and Wolf-Winter ending-to-strategy mapping are the
certification contract in [`STARTING_SLICE.md`](STARTING_SLICE.md). In
particular, `would_replay` is not continuation, `after_blood` is a lure hybrid
recovery, a missing Wolf outcome is incomplete, and a death or unknown Wolf
ending invalidates the bundle. Issue scope is conservative: ambiguity remains in
scope. Only issues in this exact authenticated cohort can decide the severity
gates; global historical feedback and compiler clusters are diagnostic context,
not certification evidence. These checks define a future certification run and
do not claim that the current slice has passed.

`npm run fleet:mock -- --count 2` is the zero-token CI pipeline. It is explicitly
structural even when it exercises the same journey mechanics. Direct quest
targets are allowed only on such mock/smoke/crawler paths.

## Feedback handling

Reports are evidence, not votes. Keep positive reports, but inspect suspicious
score/persona patterns through compiler telemetry. Reproduce concrete mechanical
claims deterministically before changing code. Classify fixes as content,
hint-text, quest structure, engine rule, validator, or test work, then let the
assessor rank the next focused loop increment.

Fixes follow **trust, but verify** with **no human-approval gate**: an
`engine_rule` change is locked by the relevant `validator` and `schema` checks,
plus focused regressions and the unchanged health bar.
