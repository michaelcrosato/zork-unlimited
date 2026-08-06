# Archive

Point-in-time planning and analysis snapshots, preserved as provenance. Nothing
in here is current guidance: the live decision record is
[`../DECISION_LOG.md`](../DECISION_LOG.md), the live roadmap is
[`../ROADMAP.md`](../ROADMAP.md), and
[`../CURRENT_PLAN.md`](../CURRENT_PLAN.md) is the durable short router. Each
ultraplan's sole fresh-agent handoff is an ignored
`ai-runs/<cycle>/current-plan.md` recorded as `currentPlanRecord` in
`ai-runs/latest-cycle.json`; the loop never overwrites the router. The assessor's
doc-staleness radar deliberately skips this directory.
