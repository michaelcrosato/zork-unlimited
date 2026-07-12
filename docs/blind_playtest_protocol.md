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
legal choices, accepted-decision count, checkpoint choice, and consequences a
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

The game owns session length. Contract version 1 has this initial goal, rendered
identically in UI and MCP:

> Find one local lead in Albany and see it through.

The baseline is 40 accepted gameplay decisions. The game offers an actual
continue/end choice at decision 40, then at 80, 120, 160, and every additional 40. If the current goal is completed earlier, the game offers the same choice
immediately. Continuing after an early goal choice preserves the next fixed
checkpoint.

A decision is one successfully accepted gameplay mutation shared by the human
and MCP surfaces. Accepted no-op gameplay outcomes still count because the
player chose them and the game accepted them. Context reads, legal-action
listings, save/export/restore, rejected or stale calls, technical quest foldback,
and the continue/end choice itself do not count.

The initial goal completes only when the player successfully completes a quest
whose home is Albany. Discovering or starting a lead, doing a job or event,
visiting a site, or dying inside a quest does not complete it.

While a continue/end choice is due, further gameplay decisions pause. Choosing
continue records retention evidence and resumes play. Choosing end records the
final retention choice, ends the journey, and returns a signed-by-state receipt
containing the contract version, accepted-decision count and proof, goal status,
checkpoint history, and exit reason.

## One pure run

1. Run the deterministic pre-crawl gate: `npm run crawl:smoke`.
2. Start `npm run blind` with a fresh seed. The runner launches MCP in `pure`
   mode and supplies a private JSONL evidence path.
3. The player calls `start_overworld` once and plays independently. It follows
   only game-presented goals and choices, including any quest reached naturally
   through the overworld bridge.
4. At every game-presented journey choice, the player honestly chooses continue
   or end. It does not stop because of elapsed tool calls or presumed coverage.
5. After the game confirms end and returns the journey receipt, the MCP run is
   closed. Only then does the harness collect the exit interview.
6. `scripts/verify-blind-report.ts` verifies the V2 pure interview against the
   server evidence. A report counts only when fresh-start and journey-exit
   events share the same session, the receipt matches exactly, and the exit is
   the last gameplay event.

The runner's 15-minute timeout is a technical failsafe. A timeout is a failed
run with no retention-eligible interview, not an intended gameplay endpoint.

## Pure prompt boundary

`blind-tester/prompt-overworld.md` is the locked live prompt. It may tell the
agent how to call the player MCP tools, retain compact legends, use session ids
and state hashes, recognize the game-presented continue/end choice, and copy the
returned receipt. It may not restate hidden content, recommend an opening route,
require particular mechanics or locations, list defects to hunt, or impose a
call/turn/time budget. Gameplay behavior must come from the game contract.

For an embedded quest, use `list_legal_actions` with `compact_actions = true`,
then `step_action` with `expected_state_hash = latest state_hash`,
`compact_observation = true`, and `hide_graph = true`. Those flags reduce
transport payload and conceal authoring structure; they do not tell the player
which legal action to choose.

The runner enforces this boundary independently of the prose prompt:

- live quest targets and non-default personas are rejected before model launch;
- the MCP server exposes a pure allowlist and permits one fresh start;
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
mode, start surface, contract version, accepted decisions, checkpoint choices,
exit reason, and evidence status. The continue/end decisions themselves are the
primary retention signal; `would_replay` remains the post-exit attitudinal
question.

`npm run feedback:compile` writes `retention.json` beside the ranked hot spots.
It separates pure, structural, and legacy-guided report counts and aggregates
only sidecar-verified pure continue/end choices as retention evidence.

Legacy V1/guided reports may remain in historical feedback compiles, clearly
labeled as such. They are never eligible to resume a pure run and never count as
pure retention evidence.

## Fleet mode

```bash
npm run fleet -- --count 100 --concurrency 4 --model mix --seed-base 1000
```

Every live member is the same canonical pure contract with a different seed
(and, optionally, model). Pure fleets use the neutral default persona; persona
mixtures are structural experiments only. Bounded concurrency, retry/backoff,
manifest output, and resume remain deterministic. Resume accepts only an
independently reverified V2 pure report whose evidence sidecar matches the same
seed/run contract.

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
