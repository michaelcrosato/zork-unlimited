# QA ticket bucket

The dev loop's inbox. Written by `npm run qa:triage`, read by `npm run qa:bucket`
and by `loop.sh` at the start of every cycle.

Tracked in git on purpose: the dev loop runs against a checkout, so a ticket that
only exists on the QA machine is a ticket it cannot act on. Keeping tickets here
also puts a finding's whole life — filed, worked, fixed — next to the commits
that closed it.

One JSON file per ticket, named `<severity>-<kind>-<id>.json`, so a plain `ls` is
already a triaged queue and two people editing different tickets never conflict.

An empty bucket is normal. It means the fleet has not yet corroborated anything
new, and the dev loop proceeds on the assessor's own candidates — it never stalls
waiting for QA.

## Retention

The bucket is bounded, and this is the one place that says how.

Triage merges rather than replaces, so for a long time nothing ever left: a
ticket the current corpus said nothing about was carried forward untouched. That
is right for a ticket somebody decided something about and wrong for the rest,
and the arithmetic showed it — four playtest waves grew this directory to **633
tracked files, every one of them `stale`**, which is 27% of the repository's file
count for 3% of its bytes. A stale ticket is by definition one the dev loop may
not pick up, so the whole bucket was noise in every `ls`, every `rg`, and every
agent's index, and the signal it was supposed to carry was buried in it.

So `isRetireable` in [`../../src/qa/triage.ts`](../../src/qa/triage.ts) drops a
carried-forward ticket when **all** of these hold, and keeps it otherwise:

- its status is `stale` — it went more than `STALE_AFTER_BUILDS` builds without a
  fresh report while unverified, and then the corpus stopped mentioning it at all;
- it carries no `notes`, the one field nothing can regenerate;
- the current corpus produced at least one cluster, so triage has some basis for
  concluding anything went quiet. Against an empty or half-synced store — a fresh
  clone, a lane worktree, one machine's shard — every ticket looks silent, and
  nothing retires.

`open`, `in_progress`, `fixed`, `verified_fixed` and `wont_fix` are somebody's
live position and never retire, whatever their age.

Retirement is a decision about the file, not the finding. A ticket's id is derived
from its cluster's stable identity and its evidence is recomputed from the
contributing sessions every run, so a recurrence rebuilds the same ticket under the
same filename. What it does cost is the trail of a finding nobody acted on — a
deliberate trade, since the retired file stays in Git history, which is where
[`AGENTS.md`](../../AGENTS.md) ("Token Economy") already keeps old detail.

`tests/unit/qa_playtest_pipeline.test.ts` pins both halves of the rule.

See [`../../docs/two_loop_workflow.md`](../../docs/two_loop_workflow.md).
