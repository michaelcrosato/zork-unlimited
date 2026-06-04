import { describe, it, expect } from "vitest";
import { initState, type GameState } from "../../src/core/state.js";
import type { Rules } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import { exhaustiveEndings } from "./support/exhaustive_endings.js";

/**
 * bug_0243 — the absolute witness that the exhaustive solver's MAX_STATES backstop
 * actually FIRES (tests/regression/support/exhaustive_endings.ts).
 *
 * The entire structural-proof family — every-ending-reachable (CYOA/parser/RPG),
 * variant-liveness, score-economy soundness, action-id uniqueness, the metamorphic
 * relabel/observation oracles, no-dead-pocket, and the generator suites: ~30 call
 * sites — rests on one shared safety contract, stated in the helper's header and
 * repeated in every caller's prose: "the search FAILS on `cappedOut`, so it can never
 * pass by truncating an unexplored region." Each caller asserts `expect(cappedOut)
 * .toBe(false)`, trusting the helper to flip `cappedOut: true` the moment a search
 * exceeds the cap.
 *
 * But that flip was itself UNWITNESSED. Every shipped/generated pack settles far below
 * the 200k cap, so a refactor that broke the cap check — `seen.size > maxStates`
 * inverted, the early `return` dropped, the field hardwired `false` — would leave all
 * ~30 suites GREEN while the verification-at-scale backstop went silently dead. That is
 * the precise risk the next-phase roadmap names for the open world ("an open world will
 * exceed exhaustive BFS, so verification must ... fail loud rather than silently
 * under-cover"): the cap-out is the mechanism that turns "too big to prove" into a loud
 * failure instead of a false PASS on a partial graph. This freezes that mechanism with
 * the SoundnessBench absolute-witness discipline (parity with bug_0227's meta-verifier
 * negative corpus, bug_0228's RNG KAT, bug_0230/0240's canonicalizer contract).
 *
 * NOT a discovered defect: the helper is correct today. These are the missing absolute
 * witnesses for already-correct code, driven through the REAL `exhaustiveEndings`
 * (never a reimplementation) over a synthetic `Rules`.
 *
 * The witness is two-sided, so it cannot pass vacuously:
 *   - SMALL cap over a space larger than the cap  ⇒ cappedOut TRUE, the result is
 *     genuinely INCOMPLETE (it misses an ending a full search reaches), and it stops
 *     PROMPTLY at the cap rather than running the whole space.
 *   - GENEROUS cap over the SAME space            ⇒ cappedOut FALSE, the full space is
 *     explored, and every declared ending is reached.
 * Teeth (verified out of band): deleting the `if (seen.size > maxStates) return {...
 * cappedOut: true}` line turns the small-cap run into a full, completing search —
 * flipping cappedOut to false (TRUE assertion fails), inflating states to the whole
 * space (the prompt-stop assertion fails), and surfacing the missed ending (the
 * incompleteness assertion fails): three independent reds. Hardwiring cappedOut true
 * reddens the generous-cap FALSE assertion. So neither side can be faked.
 */

// A finite linear chain of `BOUND + 1` non-terminal states (var `n` = 0, 1, …, BOUND),
// capped by a single `finish` action at the end that ends the game at `deep_end`. The
// space is BOUNDED on purpose: with the cap removed, a small-cap search COMPLETES (rather
// than hanging on an infinite space), so a broken backstop fails as a clean assertion red,
// not a wall-clock timeout. `BOUND` is chosen comfortably above the small cap below.
const BOUND = 500;
const TICK: Action = { type: "CHOOSE", choiceId: "tick" };
const FINISH: Action = { type: "CHOOSE", choiceId: "finish" };
const DEEP_END = "deep_end";

const chainRules: Rules = {
  legalActions(state: GameState): Action[] {
    return (state.vars.n ?? 0) >= BOUND ? [FINISH] : [TICK];
  },
  resolve(_state: GameState, action: Action) {
    if (action.type === "CHOOSE" && action.choiceId === "finish") {
      return { conditions: [], effects: [{ end_game: DEEP_END }] };
    }
    return { conditions: [], effects: [{ inc_var: { name: "n", by: 1 } }] };
  },
};

function freshStart(): GameState {
  return initState({ seed: 1, start: "tick_room", varsInit: { n: 0 } });
}

// Distinct states the full search must visit: n = 0..BOUND (BOUND+1) plus the single
// ended state (ended:true, endingId set — a distinct fingerprint). Pins the space size
// so the prompt-stop bound below is meaningful, and proves the chain is finite.
const FULL_STATES = BOUND + 2;
const SMALL_CAP = 50;

describe("exhaustive solver — MAX_STATES backstop fires (bug_0243)", () => {
  it("a search that EXCEEDS the cap reports cappedOut=true and stops promptly", () => {
    const r = exhaustiveEndings(chainRules, freshStart(), SMALL_CAP);
    // The backstop tripped — this is the flag every structural-proof caller asserts false.
    expect(r.cappedOut).toBe(true);
    // It stops at the cap, not after grinding the whole 502-state space. The loop checks
    // `seen.size > maxStates` at the top of each dequeue and branching here is 1, so it
    // returns within a state or two of the cap. (Teeth: a backstop that never fires would
    // run all FULL_STATES and blow this bound.)
    expect(r.states).toBeGreaterThan(SMALL_CAP);
    expect(r.states).toBeLessThanOrEqual(SMALL_CAP + 2);
    expect(r.states).toBeLessThan(FULL_STATES);
  });

  it("a capped (cappedOut=true) result is genuinely INCOMPLETE — it misses a reachable ending", () => {
    const r = exhaustiveEndings(chainRules, freshStart(), SMALL_CAP);
    expect(r.cappedOut).toBe(true);
    // The chain's only ending sits at n=BOUND, far past the 50-state cap, so the truncated
    // search never reaches it. THIS is why a caller must FAIL on cappedOut rather than trust
    // `reached`: a capped search that concluded "deep_end is unreachable" would be wrong.
    expect(r.reached.has(DEEP_END)).toBe(false);
  });

  it("a GENEROUS cap over the SAME space exhausts it: cappedOut=false and every ending reached", () => {
    const r = exhaustiveEndings(chainRules, freshStart(), 100_000);
    expect(r.cappedOut).toBe(false);
    expect(r.states).toBe(FULL_STATES);
    // With the frontier fully drained, `reached` is complete and the ending the capped
    // search missed is now found. (Teeth: a hardwired-true cappedOut reddens this.)
    expect(r.reached.has(DEEP_END)).toBe(true);
    expect([...r.reached]).toEqual([DEEP_END]);
  });

  it("the cap trips even on a genuinely UNBOUNDED (non-terminating) search — the documented purpose", () => {
    // The header's stated rationale: "a future unbounded-var pack trips it and the caller
    // FAILS on cappedOut, so the search can never silently pass by truncating." An ever-
    // incrementing var yields infinitely many distinct fingerprints; without the backstop
    // the BFS would never return. The cap makes it return promptly with cappedOut=true.
    const unboundedRules: Rules = {
      legalActions: () => [TICK],
      resolve: () => ({ conditions: [], effects: [{ inc_var: { name: "n", by: 1 } }] }),
    };
    const r = exhaustiveEndings(unboundedRules, freshStart(), SMALL_CAP);
    expect(r.cappedOut).toBe(true);
    expect(r.reached.size).toBe(0); // no ending exists on this infinite chain
    expect(r.states).toBeLessThanOrEqual(SMALL_CAP + 2);
  });
});
