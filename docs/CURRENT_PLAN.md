# Current Plan

This file is deliberately a short router, not a second milestone contract. The
dated handoff that used to live here was retired because build and cohort
evidence change faster than the starting-slice requirements.

Use these authoritative sources:

- [`STARTING_SLICE.md`](STARTING_SLICE.md) — scope, depth contract, proof rules,
  and final certification gates.
- [`starting_slice_causal_matrix.json`](starting_slice_causal_matrix.json) —
  machine-readable fork implementation and proof status.
- [`../AI_LOOP_STATE.md`](../AI_LOOP_STATE.md) — terse history of landed green
  increments.
- The exact unconsumed feedback manifest/hotspots digest named by committed
  [`AI_LOOP_STATE.md`](../AI_LOOP_STATE.md) — current experiential evidence;
  generated artifacts remain ignored and local, and merely newer files are inert.

For each commit-enabled increment, follow the repository loop in `AGENTS.md`:
assess, pass the pre-crawl gate, make one focused change, run focused checks,
freeze the implementation in a local provisional commit, and require an exactly
clean tree before one fresh pure blind playtest. Run `npm run feedback:status`
and compile only when it reports a bootstrap or three-report actionable delta;
then pass the post-crawl, health, integrity-drift, and playtest-record gates before
the driver seals feedback authority and commits the terse `AI_LOOP_STATE.md`
result. Evidence-only cycles instead capture their clean
baseline play before any uncommitted edit and never represent that baseline as
evidence for the later work. Run milestone pilots and fleets only on a frozen
build when the contract calls for them. The driver stops continuous
evidence-only mode when a completed cycle leaves pending work, so the next clean
baseline cannot be mislabeled. Do not infer certification readiness from this
router.
