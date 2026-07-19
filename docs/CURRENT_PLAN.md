# Current Plan

Token-small AFK-loop handoff. The durable milestone and evidence rules live in
[`STARTING_SLICE.md`](STARTING_SLICE.md); do not replace that contract during an
ultraplan.

## Cycle: 2026-07-19 — Codex Compaction Snapshot Attestation

## Synthesis

The first long Luna blind exposed a verifier false rejection, not an
authentication failure. Its retained private rollout had one session, one
logical turn, one completed lifecycle, and two `turn_context` rows. The second
row was the same logical context replayed by the Codex CLI immediately after an
automatic `compacted → world_state` snapshot; only its wrapper timestamp had
advanced.

Capture and fleet authority now share the same narrow normalization. The first
context remains authoritative. A later context is accepted only immediately
after that exact two-row compaction prefix and before `task_complete`, with an
identical wrapper key set and deep-strict equality for every non-timestamp field,
including model, effort, turn id, cwd, sandbox, and full payload. Timestamp
presence and string type must match, but its value may advance. An arbitrary,
altered, extra-field, out-of-sequence, second-turn, or post-completion context
still fails closed.

The actual rejected Luna seed 4102 public/private artifacts now reparse as one
authenticated `gpt-5.6-luna` turn under the repaired authority path. Negative
tests cover payload substitution, extra wrapper fields, missing compaction,
repeated valid compactions, and post-terminal replay in both capture and fleet
validation. A future unrecognized CLI format intentionally rejects until
reviewed.

Fresh Luna seed 4103 then played 99 turns through three completed goals without
an auth or launcher failure, but omitted `acceptedDecisions` from its copied
exit receipt. The verifier correctly rejected it and no report is counted.
Fresh Terra seed 4104 produced a fully verified report: it completed Wolf-Winter
by living-pack diversion at decision 31, continued through The Gallowmere, ended
at goal completion on decision 56, rated clarity/enjoyment 4/4, was not stuck,
and would replay. Its crawlboard report is a real S2 causal-copy defect, not a
source-state leak; the Gallowmere blank result was the blind agent failing to
forward a nonempty tool response, not a game defect. Both stay outside this
infrastructure fix.

The exact post-change crawl `20260719T100738Z` is zero-finding at 247/247 nodes,
344/344 edges, and all 12 boards/quests. Focused capture, authority, attestation,
and certifier checks are green. Full health passes at 381 files and 2,906 tests,
including integrity, typecheck, lint, format, UI typecheck, and all 12 packs.

The greater-than-BG3 milestone remains `active_unproven`; this increment repairs
the evidence pipeline and does not claim gameplay-depth progress.

## Chosen Move

Commit this as a separate infrastructure increment, push it through the required
GitHub `verify` and `crawl-smoke` checks, and merge only when both are green.
Then rebase the completed Civic Winter Return Docket on the hotfix and land that
authored Albany increment with a clean final-tree blind.

## Acceptance for this increment

1. Real automatic compaction replays attest as one logical turn despite a later
   wrapper timestamp.
2. Any payload, wrapper shape, sequence, lifecycle, model, cwd, or turn change
   remains rejected in capture and fleet authority.
3. The retained Luna witness reparses, a fresh canonical report verifies, exact
   post-crawl and full health pass, and no rejected run is counted as evidence.
4. Required GitHub checks are green before merge.
