# Recovered scale-out Phase 1 (2026-08-27) — UNREVIEWED reference material

These files are a byte-faithful recovery of the destroyed
`scaleout/parallel-lanes-qa-fleet` branch (lost in the 2026-08-28
empty-directory incident; never pushed, never in any reachable commit).
They were replayed from the Write/Edit tool inputs in session transcript
`526c7df4-11e1-498b-8939-a479fa21e515` on 2026-08-30, including a
reproduction of that session's prettier runs; `NOTES.md` records per-file
source lines, edit counts, and the two residual fidelity caveats.
`commit-message.txt` is the branch's original commit message.

**Status: reference only.** The original was self-certified by the session
that wrote it (targeted lint + one unit-test file; no full health run, no
independent review), and the repo has since been restructured by the
two-loop split (#305/#306). Nothing here is wired to npm scripts; the
recovered unit test is defused as `.txt` so vitest cannot discover it.
Rebuild from this material on a lane branch, adapt to the current
blind-tester seams, and land only via full `npm run health` plus an
independent review — tracked in the intake queue (`qa-fleet-rebuild`).
