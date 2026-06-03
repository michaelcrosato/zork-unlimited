/**
 * Structural verification (§15) for bug_0148 — every shipped PARSER pack's SCORE ECONOMY
 * is sound: the maximum score reachable by concrete play equals the declared `max_score`,
 * EXACTLY. The dynamic complement to bug_0116's static `SCORE_PEAKS_BEFORE_WIN` check, and
 * the score analogue of the bug_0145/0146/0147 variant-liveness proofs (same exhaustive
 * BFS, same onState hook, a different property asserted at each reachable state).
 *
 * ── The gap this closes (a defect class NO existing check covers) ────────────────────
 * The corpus already proves, exhaustively: every declared ENDING is reachable
 * (parser_all_endings_reachable) and every reactive VARIANT is live (parser_variant_
 * liveness). It does NOT prove the score ECONOMY is sound. Two real defects slip through
 * every current check:
 *   (1) BOUNDED OVERFLOW — a misconfigured / double-counted / re-farmable award pushes the
 *       reachable score PAST the declared ceiling (a "37/35"). The exhaustive solver only
 *       catches an UNBOUNDED farm (the score var never settles → the BFS hits its state cap
 *       → a loud cappedOut failure). A BOUNDED over-award (two one-time awards that sum to
 *       more than max_score, or a single miscalibrated inc_var) leaves the state space
 *       finite, so the solver passes and NOTHING flags it — the score just reads wrong.
 *   (2) PHANTOM POINTS — `max_score` is set HIGHER than any route can actually reach (the
 *       completionist's "I finished 35/40 and there were no more points anywhere"). The
 *       reachability proof checks only WHICH endings fire, never the score AT them, so a
 *       max_score nobody can reach is invisible to it. This is the exact dual of bug_0104's
 *       "score peaks early" — there the max is reached too SOON; here it is never reached at
 *       all. bug_0116's SCORE_PEAKS_BEFORE_WIN reasons about WHEN the peak lands relative to
 *       the win act; it never asserts the peak EQUALS the declared max.
 *
 * One tight invariant catches BOTH directions (and more): the maximum score observed over
 * the COMPLETE reachable region equals `pack.meta.max_score`.
 *   - reachable max  > declared → overflow / farm / under-declared max_score   (case 1)
 *   - reachable max  < declared → phantom points (max_score unreachably high)   (case 2)
 *   - reachable max == declared → the economy is exactly as advertised          (sound)
 *
 * ── Soundness: the action policy ─────────────────────────────────────────────────────
 * The shared BFS's default (reachability) policy SKIPS READ — but in sealed_crypt the
 * `+5` headstone award rides a READ interaction, so a reachability-policy search would peak
 * at 30, not 35, and FALSELY flag phantom points. So this uses the exact LIVENESS action
 * policy bug_0146 established (step every action except the pure-observation verbs and DROP,
 * which provably cannot gate an award: no score award is gated on `not_item`/a dropped-item
 * location, and DROP blows the state cap). That policy steps READ and every progress action,
 * so every score-award state is visited; every state it visits is a real, legal playthrough,
 * so the observed maximum is the TRUE reachable maximum — no over- or under-count. The search
 * FAILS on cappedOut, so it can never pass by truncating an unexplored region. Both shipped
 * parser packs settle well under the 200k cap with this policy (measured ~6k / ~10k states).
 *
 * Packs are auto-discovered from content/parser/pack, so a new parser pack is covered the
 * moment it ships (the health-covers-all-packs bar, bug_0096).
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { compileParserPack, loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  initStateForParserPack,
  type ParserIndex,
} from "../../src/parser/model.js";
import { buildParserRules } from "../../src/parser/runner.js";
import type { Action } from "../../src/api/types.js";
import { exhaustiveEndings } from "./support/exhaustive_endings.js";

const PACK_DIR = "content/parser/pack";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

// Same safety bound as the every-ending-reachable / variant-liveness proofs. The shipped
// packs settle well under this with the liveness action policy; the ceiling exists only so
// a future combinatorial blowup fails LOUDLY (cap hit) rather than truncating into a silent
// pass.
const MAX_STATES = 200_000;

// The liveness action policy (bug_0146): step every legal action EXCEPT the ones that
// provably cannot gate a score award — the pure-observation verbs (narrate-only / never
// legal) and DROP (no award gates on a dropped-item location, and stepping it blows the
// cap). Crucially this DOES step READ, which the reachability search skips but which carries
// the +5 headstone award in sealed_crypt.
const LIVENESS_SKIP: ReadonlySet<Action["type"]> = new Set([
  "DROP",
  "CLOSE",
  "LOOK",
  "INVENTORY",
  "INSPECT",
]);
const livenessExplore = (a: Action): boolean => !LIVENESS_SKIP.has(a.type);

/** The maximum `score` var observed over the COMPLETE reachable region of a pack (the true
 *  reachable maximum), plus whether the search exhausted that region. */
function maxReachableScore(index: ParserIndex): { max: number; cappedOut: boolean } {
  let max = 0;
  const result = exhaustiveEndings(
    buildParserRules(index),
    initStateForParserPack(index, 7),
    MAX_STATES,
    (s) => {
      const score = s.vars.score ?? 0; // score is undefined until the first inc_var
      if (score > max) max = score;
    },
    { explore: livenessExplore },
  );
  return { max, cappedOut: result.cappedOut };
}

describe("bug_0148 — every PARSER pack's reachable max score equals its declared max_score", () => {
  it("discovers the shipped parser packs", () => {
    // Guard against a vacuous pass if the glob ever yields nothing.
    expect(packFiles.length).toBeGreaterThanOrEqual(2);
  });

  // Guard against a vacuous suite: at least one shipped pack must actually declare a
  // scoring economy (max_score > 0), or the per-pack equality below would be 0 === 0 noise.
  it("the shipped corpus actually exercises scoring (some pack declares max_score > 0)", () => {
    const maxima = packFiles.map((f) => {
      const loaded = loadParserPackFile(join(PACK_DIR, f));
      if (!loaded.ok) throw new Error(`pack must compile: ${f}`);
      return loaded.compiled.pack.meta.max_score;
    });
    expect(maxima.some((m) => m > 0)).toBe(true);
  });

  for (const file of packFiles) {
    it(`${file}: the reachable maximum score equals the declared max_score (no overflow, no phantom points)`, () => {
      const loaded = loadParserPackFile(join(PACK_DIR, file));
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const pack = loaded.compiled.pack;
      const declared = pack.meta.max_score;
      const { max, cappedOut } = maxReachableScore(indexParserPack(pack));

      // The search must have exhausted the reachable region, else the observed maximum is
      // unproven (a higher score could lie in the truncated tail).
      expect(cappedOut, `state-space search hit the ${MAX_STATES} cap`).toBe(false);
      // The crux: reachable max > declared is overflow/farm/under-declared max_score;
      // reachable max < declared is phantom points (a max_score no route can reach).
      expect(
        max,
        `reachable max score (${max}) != declared max_score (${declared}) — ` +
          (max > declared
            ? "score OVERFLOWS the declared ceiling (a farmable/double-counted award?)"
            : "declared max_score is PHANTOM (no route reaches it)"),
      ).toBe(declared);
    });
  }

  it("FAILS on a planted OVERFLOW pack (a reachable score above the declared ceiling)", () => {
    // Two one-time awards (book +10, shrine +10) sum to 20 by concrete play, but max_score
    // declares only 15 — a bounded over-award the exhaustive ending solver would NOT catch
    // (the state space stays finite). The check must catch it: reachable max 20 != 15.
    const src = `
meta: { id: t, title: T, start_room: a, max_score: 15 }
rooms:
  - id: a
    name: A
    description: "base"
    objects: [book, shrine]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: book
    name: book
    description: "a book"
    read_text: "words"
    interactions:
      - verb: READ
        target: book
        conditions: [{ not_flag: read_book }]
        effects:
          - set_flag: read_book
          - inc_var: { name: score, by: 10 }
  - id: shrine
    name: shrine
    description: "a shrine"
    interactions:
      - verb: READ
        target: shrine
        conditions: [{ not_flag: read_shrine }]
        effects:
          - set_flag: read_shrine
          - inc_var: { name: score, by: 10 }
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { max, cappedOut } = maxReachableScore(indexParserPack(r.compiled.pack));
    expect(cappedOut).toBe(false);
    expect(max).toBe(20); // the true reachable max…
    expect(max).not.toBe(r.compiled.pack.meta.max_score); // …which the equality check rejects (20 != 15)
  });

  it("FAILS on a planted PHANTOM-POINTS pack (a declared max_score no route can reach)", () => {
    // The book awards +10 — the only score source — yet max_score declares 20. The
    // completionist's "10/20 and no points left anywhere": reachable max 10 != 20.
    const src = `
meta: { id: t, title: T, start_room: a, max_score: 20 }
rooms:
  - id: a
    name: A
    description: "base"
    objects: [book]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: book
    name: book
    description: "a book"
    read_text: "words"
    interactions:
      - verb: READ
        target: book
        conditions: [{ not_flag: read_book }]
        effects:
          - set_flag: read_book
          - inc_var: { name: score, by: 10 }
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { max, cappedOut } = maxReachableScore(indexParserPack(r.compiled.pack));
    expect(cappedOut).toBe(false);
    expect(max).toBe(10); // the true reachable max…
    expect(max).not.toBe(r.compiled.pack.meta.max_score); // …which the equality check rejects (10 != 20)
  });

  it("PASSES a sound economy (two gated awards summing EXACTLY to a correctly-declared max)", () => {
    // book +5 + shrine +10 = 15 = max_score: the positive control proving the check does not
    // false-alarm on a correctly-tuned pack (and that READ awards are credited).
    const src = `
meta: { id: t, title: T, start_room: a, max_score: 15 }
rooms:
  - id: a
    name: A
    description: "base"
    objects: [book, shrine]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: book
    name: book
    description: "a book"
    read_text: "words"
    interactions:
      - verb: READ
        target: book
        conditions: [{ not_flag: read_book }]
        effects:
          - set_flag: read_book
          - inc_var: { name: score, by: 5 }
  - id: shrine
    name: shrine
    description: "a shrine"
    interactions:
      - verb: READ
        target: shrine
        conditions: [{ not_flag: read_shrine }]
        effects:
          - set_flag: read_shrine
          - inc_var: { name: score, by: 10 }
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { max, cappedOut } = maxReachableScore(indexParserPack(r.compiled.pack));
    expect(cappedOut).toBe(false);
    expect(max).toBe(r.compiled.pack.meta.max_score); // 15 == 15 — sound, no false alarm
  });
});
