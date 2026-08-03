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
- The newest verified `ai-runs/feedback/*/hotspots.md` — current experiential
  evidence; generated artifacts remain ignored and local.

For each increment, follow the repository loop in `AGENTS.md`: assess, pass the
pre-crawl gate, make one focused change, pass the post-crawl gate, run one fresh
pure blind playtest, compile enough new verified feedback, pass health, and land
the green increment. Run milestone pilots and fleets only on a frozen build when
the contract calls for them; do not infer certification readiness from this
router.
