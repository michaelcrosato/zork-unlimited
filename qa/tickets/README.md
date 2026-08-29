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

See [`../../docs/two_loop_workflow.md`](../../docs/two_loop_workflow.md).
