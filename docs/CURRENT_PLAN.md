# Current plan (rolling)

This is the AFK loop's token-small handoff document. Ultraplan cycles overwrite it
with the current synthesis, the chosen move, and the next safe follow-up.

---

# Ultraplan re-aim cycle — 2026-06-25T05-03-36-260Z

## Synthesis

The assessor saturated at the 0.5 blind-playtest floor with all mode targets above
their current content counts (`cyoa=20`, `parser=16`, `rpg=16`). The required blind
playtest for `content/rpg/pack/advocates_case.yaml` was mechanically successful and
found only polish issues: `check_empty_finding` feels like a no-op, partial finding
feedback is generic, and the retest ending can contradict full-evidence journal state.

Four local review agents then inspected engine/proof/content/loop surfaces. The
strongest cross-cycle structural gap was in parser proof coverage: parser `USE`
interactions can now carry seeded skill checks, but several parser exhaustive proofs
still used a single rule set. That sampled one deterministic roll branch and could miss
routes, score states, variants, menus, render witnesses, or soft-lock pockets reachable
only on forced success or forced failure.

## Chosen Move

**bug_0491 — make parser structural proofs roll-complete for skill checks**

Implemented a shared parser roll helper that builds two rule sets for exhaustive
proofs:

- forced best d20 roll
- forced worst d20 roll

Parser structural callers now use `exhaustiveEndingsMulti(...)` with that bracket
where branch coverage matters:

- every ending reachable
- score economy
- variant liveness
- runtime action-id uniqueness
- parser metamorphic relabel census
- RPG generator solvability/depth proofs
- no-dead-pocket graph proof
- parser death/non-death ending render witnesses

The reachability suite also includes a synthetic parser pack where one ending is
reachable only on skill-check success and another only on failure, proving the bracket
is load-bearing.

## Acceptance

1. `tests/regression/support/parser_rolls.ts` exposes best/worst parser rule sets.
2. Parser structural exhaustive callers that need branch coverage use
   `exhaustiveEndingsMulti(parserRollRuleSets(index), ...)`.
3. A synthetic parser skill-check regression proves single best and single worst
   searches reach different endings, while the bracket reaches both.
4. Focused parser proof suites pass.
5. `npm run health` passes before commit.

## Deferred Levers

- Aleconner polish from the blind playtest: explicit empty-finding feedback, named
  missing-evidence categories, and retest ending wording for full-evidence runs.
- Promote the tuned stale room-item audit into parser/RPG validation as a warning once
  suppression strategy is settled.
- Add per-cycle token/cost telemetry under `ai-runs/<runId>/cost.json` so token
  efficiency becomes measurable instead of anecdotal.
