/**
 * Structural verification (§15) — every shipped CYOA pack's SCORE ECONOMY is sound: the
 * maximum `score` reachable by concrete play equals the declared `meta.max_score`, EXACTLY.
 * The CYOA analogue of bug_0148 (parser) / bug_0149 (RPG), completing score-economy soundness
 * for the THIRD mode now that CYOA scoring is first-class (the RPG-mechanic standardization:
 * optional CYOA `max_score` + the shared score-feedback chrome).
 *
 * One tight invariant catches both defect directions, exactly as the parser/RPG proofs do:
 *   - reachable max  > declared → overflow / farmable / double-counted award (BOUNDED OVERFLOW)
 *   - reachable max  < declared → a max_score no route reaches (PHANTOM POINTS)
 *   - reachable max == declared → the economy is exactly as advertised (sound)
 *
 * The exhaustive ending solver alone catches only an UNBOUNDED farm (the score var never
 * settles → the BFS hits its cap → a loud cappedOut failure); a BOUNDED over-award or a
 * phantom max_score leaves the state space finite and slips through every reachability/
 * liveness check — this closes that gap.
 *
 * Soundness of the search: CYOA's only action is CHOOSE, so the shared BFS's default action
 * policy steps every legal action (the progress-action filter is a no-op for CYOA — there are
 * no reversible/observation verbs to skip). Every CHOOSE-reachable state is therefore visited,
 * and every state visited is a real, legal playthrough, so the observed maximum is the TRUE
 * reachable maximum. The search FAILS on cappedOut, so it can never pass by truncating an
 * unexplored region. (The scored CYOA packs carry no skill_check, so play is fully
 * deterministic and a single rule set suffices; a future pack mixing score + skill_check would
 * need the best/worst-roll bracket, exactly as the RPG score proof uses.)
 *
 * Packs are auto-discovered from content/cyoa/pack, so a new CYOA pack is covered the moment
 * it ships (the health-covers-all-packs bar, bug_0096). Unscored packs (max_score absent ⇒ 0 —
 * the moral-fork CYOAs) assert 0 == 0, harmless; a vacuity guard below requires at least one
 * shipped pack to actually exercise scoring.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { compilePack, loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, initStateForPack, buildRules, type CyoaIndex } from "../../src/cyoa/runner.js";
import { exhaustiveEndings } from "./support/exhaustive_endings.js";

const PACK_DIR = "content/cyoa/pack";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

// Same safety bound as the CYOA every-ending-reachable / variant-liveness proofs. The scored
// packs settle under this (the largest, watchtower_road, ~142k states with the score var); the
// ceiling exists only so a future combinatorial blowup fails LOUDLY (cap hit) rather than
// truncating into a silent pass.
const MAX_STATES = 200_000;

/** The maximum `score` var observed over the COMPLETE reachable region of a pack (the true
 *  reachable maximum), plus whether the search exhausted that region. */
function maxReachableScore(index: CyoaIndex): { max: number; cappedOut: boolean } {
  let max = 0;
  const result = exhaustiveEndings(
    buildRules(index),
    initStateForPack(index, 7),
    MAX_STATES,
    (s) => {
      const score = s.vars.score ?? 0; // score is undefined until the first inc_var
      if (score > max) max = score;
    },
  );
  return { max, cappedOut: result.cappedOut };
}

describe("CYOA score-economy soundness — reachable max score equals declared max_score", () => {
  it("discovers the shipped CYOA packs", () => {
    expect(packFiles.length).toBeGreaterThanOrEqual(2);
  });

  // Guard against a vacuous suite: at least one shipped pack must actually declare scoring
  // (max_score > 0), or the per-pack equality below would be 0 === 0 noise.
  it("the shipped corpus actually exercises CYOA scoring (some pack declares max_score > 0)", () => {
    const maxima = packFiles.map((f) => {
      const loaded = loadPackFile(join(PACK_DIR, f));
      if (!loaded.ok) throw new Error(`pack must compile: ${f}`);
      return loaded.compiled.pack.meta.max_score ?? 0;
    });
    expect(maxima.some((m) => m > 0)).toBe(true);
  });

  for (const file of packFiles) {
    it(`${file}: reachable maximum score equals the declared max_score (no overflow, no phantom points)`, () => {
      const loaded = loadPackFile(join(PACK_DIR, file));
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const pack = loaded.compiled.pack;
      const declared = pack.meta.max_score ?? 0;
      const { max, cappedOut } = maxReachableScore(indexPack(pack));

      expect(cappedOut, `state-space search hit the ${MAX_STATES} cap`).toBe(false);
      expect(
        max,
        `reachable max score (${max}) != declared max_score (${declared}) — ` +
          (max > declared
            ? "score OVERFLOWS the declared ceiling (a farmable/double-counted award?)"
            : "declared max_score is PHANTOM (no route reaches it)"),
      ).toBe(declared);
    });
  }

  it("FAILS on a planted OVERFLOW pack (reachable score above the declared ceiling)", () => {
    // Two one-time +10 awards on a linear path sum to 20, but max_score declares 15 — a bounded
    // over-award the exhaustive ending solver would NOT catch (state space stays finite).
    const src = `
meta: { id: t, title: T, start: a, max_score: 15 }
scenes:
  - id: a
    title: A
    text: "base"
    choices:
      - { id: grab1, text: "grab", effects: [{ inc_var: { name: score, by: 10 } }], next: b }
  - id: b
    title: B
    text: "B"
    choices:
      - { id: grab2, text: "grab", effects: [{ inc_var: { name: score, by: 10 } }], next: e }
endings: [{ id: e, title: E, text: "done" }]
`;
    const r = compilePack(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { max, cappedOut } = maxReachableScore(indexPack(r.compiled.pack));
    expect(cappedOut).toBe(false);
    expect(max).toBe(20); // the true reachable max…
    expect(max).not.toBe(r.compiled.pack.meta.max_score ?? 0); // …rejected by the equality check (20 != 15)
  });

  it("FAILS on a planted PHANTOM-POINTS pack (a declared max_score no route can reach)", () => {
    // The only award is +10, yet max_score declares 20 — "10/20 and no points left anywhere".
    const src = `
meta: { id: t, title: T, start: a, max_score: 20 }
scenes:
  - id: a
    title: A
    text: "base"
    choices:
      - { id: grab, text: "grab", effects: [{ inc_var: { name: score, by: 10 } }], next: e }
endings: [{ id: e, title: E, text: "done" }]
`;
    const r = compilePack(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { max, cappedOut } = maxReachableScore(indexPack(r.compiled.pack));
    expect(cappedOut).toBe(false);
    expect(max).toBe(10); // the true reachable max…
    expect(max).not.toBe(r.compiled.pack.meta.max_score ?? 0); // …rejected (10 != 20)
  });

  it("PASSES a sound economy (two awards summing EXACTLY to a correctly-declared max)", () => {
    // +5 then +10 = 15 = max_score: the positive control proving the check does not false-alarm.
    const src = `
meta: { id: t, title: T, start: a, max_score: 15 }
scenes:
  - id: a
    title: A
    text: "base"
    choices:
      - { id: grab1, text: "grab", effects: [{ inc_var: { name: score, by: 5 } }], next: b }
  - id: b
    title: B
    text: "B"
    choices:
      - { id: grab2, text: "grab", effects: [{ inc_var: { name: score, by: 10 } }], next: e }
endings: [{ id: e, title: E, text: "done" }]
`;
    const r = compilePack(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { max, cappedOut } = maxReachableScore(indexPack(r.compiled.pack));
    expect(cappedOut).toBe(false);
    expect(max).toBe(r.compiled.pack.meta.max_score ?? 0); // 15 == 15 — sound, no false alarm
  });
});
