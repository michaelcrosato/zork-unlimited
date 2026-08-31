# Intake queue

**The dev loop's inbox.** One JSON file per submission, named
`<priority>-<source>-<id>.json`, so a plain `ls` is already the queue order.

Anything can file here — playtest triage after corroboration, an independent
audit agent, a research or design proposal, the deterministic crawler, or a
person. Playtest feedback is *one* source, not the only one.

```bash
npm run work                     # what to build next
npm run work -- --list           # the whole open queue
npm run submit -- --source research --kind feature --title "..." --body "..."
npm run intake:sync              # mirror to / from GitHub Issues
npm run intake:sync:linear -- --dry-run  # inspect the AdventureForge Linear mirror
```

## Why it is tracked in git

The dev loop runs against a checkout, so a submission that only exists on the
machine that filed it is one the dev loop cannot act on. Keeping the queue here
also puts a request's whole life — filed, worked, done — next to the commits
that closed it.

## Why GitHub Issues is a mirror, not the source of truth

People should file feature requests in the tool they already have, with labels,
search and a phone app. But the loop must keep working when the network is down
or a token expires, so the canonical copy is these files and
`npm run intake:sync` reconciles both ways. A submission's id is embedded in its
issue body as `<!-- af-submission-id: ... -->`, which is what makes re-syncing
update an issue instead of opening a duplicate.

## Priority is not severity

Severity says how bad it is; priority says when we do it. A cosmetic defect on
the opening screen can outrank a severe one in content nobody reaches.

See [`../../docs/two_loop_workflow.md`](../../docs/two_loop_workflow.md).
