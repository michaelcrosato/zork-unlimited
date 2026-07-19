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
2. Start `npm run blind` with a fresh seed. Claude is the default provider;
   `npm run blind --provider=codex --model=gpt-5.6-sol --seed=<fresh>` selects
   the built-in hardened Codex path. Both launch MCP in `pure` mode and supply a
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

Codex single runs reuse the same evidence verifier and sidecar-last publication
transaction, but do not yet attempt report recovery. The runner starts Codex in
an isolated temporary directory with user/project config and rules ignored,
shell/web/apps/plugins/browser/computer/subagents disabled, and only the exact
pure AdventureForge MCP tools enabled. It audits the provider JSONL and rejects
unknown events, non-game tools, another MCP server, incomplete/duplicate turns,
or malformed final output. Codex may emit generic resource-transport probes even
when the player obeys the game-tool boundary. The audit tolerates only a bounded,
paired `-32601 Method not found` failure against AdventureForge's empty resource
namespace, with a null result, plus one bounded in-memory todo lifecycle. These
events expose no content, do not count as gameplay, and fail closed on success,
content, another server, malformed pairing, or an unbounded payload. Every normal
AdventureForge call is separately paired by id, tool, arguments, status, and
result; the first pair must be a successful argument-free `start_overworld`.
A rejected Codex run must use a fresh seed. Codex is
not yet accepted by fleet attestation or starting-slice certification because
its JSONL identifies the session but does not authenticate the actual model id.

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
authoring structure.

Pure mode repeats the parent `overworld_session_id` on every successful player
response. While an embedded quest is unresolved, it also repeats the current
child `rpg_session_id`; the two handles are never interchangeable. Missing,
mistyped, stale, or wrong-domain handles receive a structured error containing
the authoritative recoverable handle(s) and the expected field. Starting again
cannot mint a second fresh run, and parent gameplay mutations cannot orphan an
active child. Pure overworld reads always remain on the compact player surface;
verbose observation, graph, id-catalog, and route-expansion knobs are absent.

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

Fleet attestation and starting-slice certification in this section remain
Claude/Sonnet-only. Hardened Codex support currently applies to canonical
single-run feedback, not authenticated fleet cohorts.

```bash
npm run fleet -- --count 10 --concurrency 4 --model sonnet --seed-base <fresh-pilot-seed-base> --label <fresh-pilot-label> --no-resume --max-retries 0
npm run starting-slice:pilot -- --fleet ai-runs/fleet/<fresh-pilot-label>
npm run fleet -- --count 100 --concurrency 4 --model sonnet --seed-base <fresh-seed-base> --label <fresh-label> --no-resume --max-retries 0
```

Every live member is the same canonical pure contract with a different seed
(and, for diagnostic experiments, optionally a different model). Pure fleets
use the neutral default persona; persona mixtures are structural experiments
only. Homogeneous Sonnet is the default and the only authoritative requested
model plan. Explicit `mix` retains its deterministic 9 Haiku : 1 Sonnet
weighting for diagnostics; explicit Haiku and Opus are also non-certifying.

Before any live member launches, preflight freezes one full tracked Git commit,
the canonical fresh-overworld world id/hash, the contiguous planned seeds, and
the run/model contract. The tracked worktree must be clean; dirty state or a Git
or world-provenance error aborts before tokens are spent. Untracked local notes
are ignored by the cleanliness test.

Each live fleet label must be fresh and names one closed cohort. An existing
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
An adjacent runner-owned v2 attestation binds each live member to its planned
model, actual singleton model use, unique Claude session, completed clean
primary envelope, game session, and raw-byte SHA-256 digests of the report,
sidecar, raw JSONL evidence, primary envelope, and complete recovery artifacts
when present. Diagnostic resume reconstructs those facts from the bytes;
certification reconstructs them and rejects any recovered member.

### Starting-slice certification

Before the authority spend, close and validate a fresh ten-Sonnet pilot:

```bash
npm run fleet -- --count 10 --concurrency 4 --model sonnet --seed-base <fresh-pilot-seed-base> --label <fresh-pilot-label> --no-resume --max-retries 0
npm run starting-slice:pilot -- --fleet ai-runs/fleet/<fresh-pilot-label>
```

The pilot requires 10/10 primary unrecovered/no-retry reports, unique game and
Claude sessions, one exact actual model id, recognized Wolf-Winter outcomes, at
least three strategy families, and no family above 7/10. It checks the other
slice gates but writes a distinct readiness result and can never certify the
milestone. If the exact provider model id later changes, repilot.

After the authoritative live cohort is closed, run:

```bash
npm run starting-slice:certify -- --fleet ai-runs/fleet/<label>
```

The certifier independently reparses every authenticated artifact. It requires
exactly 100 unique contiguous planned seeds, no failed or missing slots, the
default pure fresh-overworld contract, `--no-resume`, exactly one verified
attempt per slot, zero skipped/resumed or report-recovered slots, and the
homogeneous requested Sonnet plan authenticated to one exact actual model id,
with unique game and Claude sessions, on one clean build/world. Malformed or unauthenticated evidence
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
