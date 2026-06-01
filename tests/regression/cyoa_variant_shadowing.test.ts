/**
 * Regression (§15) for bug_0085 — the CYOA validator now flags an unreachable
 * (shadowed) reactive variant: in a scene's / ending's `variants` list, evaluated
 * first-match-wins (runner.ts sceneText/endingText), a later variant whose `when`
 * is ENTAILED by an earlier sibling's `when` can never be the first match, so its
 * text is dead content.
 *
 * This is the single most-repeated authoring invariant in the reactive packs — the
 * clockwork pack's comments alone say "higher threshold first, first match wins"
 * (or equivalent) ~10 times, and every reactive scene/ending is hand-ordered to
 * obey it. Nothing checked it: a maintainer who appended a new tier in the wrong
 * place, or duplicated a `when`, would ship silently-dead prose that the blind
 * playtest might never surface (the shadowed text simply never appears). This check
 * makes the ordering invariant machine-enforced.
 *
 * Soundness is the bar: we emit the finding ONLY when entailment is provable over a
 * pure conjunction of literals/var-bounds. A `when` containing `any_of`/`none_of`
 * is opaque and never participates in a proof — so the check has no false positives
 * (it detects fewer cases, never wrong ones). Locked here:
 *   (1) the shipped reactive packs (clockwork, watchtower) are NOT flagged — the
 *       intentional high→low ordering passes (a higher-threshold variant does not
 *       entail a lower-threshold-plus-extra-flag one, so nothing is shadowed);
 *   (2) general-before-specific on a var threshold is flagged;
 *   (3) a flag/item superset shadow is flagged, and an identical `when` is flagged;
 *   (4) ending variants are checked too, not just scenes;
 *   (5) correctly-ordered (specific-first) and incomparable variants are NOT flagged;
 *   (6) soundness — an `any_of` (opaque) sibling is never used to prove shadowing.
 */
import { describe, it, expect } from "vitest";
import { compilePack, loadPackFile } from "../../src/cyoa/pack.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";

function codes(src: string): string[] {
  const r = compilePack(src);
  expect(r.ok).toBe(true);
  if (!r.ok) return [];
  return validateCyoa(r.compiled.pack).findings.map((f) => f.code);
}

const wrap = (variants: string): string => `
meta: { id: t, title: T, start: s, vars_init: { ticks: 0 } }
scenes:
  - id: s
    title: S
    text: "base"
    variants:
${variants}
    choices: [ { id: g, text: go, next: e } ]
endings: [ { id: e, title: E, text: "done" } ]
`;

describe("bug_0085 — the validator flags unreachable (shadowed) reactive variants", () => {
  it("the shipped reactive packs are NOT flagged (intentional high→low ordering passes)", () => {
    for (const path of [
      "content/cyoa/pack/clockwork_heist.yaml",
      "content/cyoa/pack/watchtower_road.yaml",
    ]) {
      const r = loadPackFile(path);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const report = validateCyoa(r.compiled.pack);
      const shadowed = report.findings.filter((f) => f.code === "UNREACHABLE_VARIANT");
      expect(shadowed).toEqual([]);
      // And the pack stays green overall.
      expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    }
  });

  it("flags general-before-specific on a var threshold (>=2 listed before >=5)", () => {
    const src = wrap(
      `      - { when: [ { var_gte: { name: ticks, value: 2 } } ], text: "stirring" }
      - { when: [ { var_gte: { name: ticks, value: 5 } } ], text: "dead — >=2 always wins" }`,
    );
    expect(codes(src)).toContain("UNREACHABLE_VARIANT");
  });

  it("flags a flag-superset shadow (earlier needs a subset of the later's flags)", () => {
    const src = wrap(
      `      - { when: [ { has_flag: a } ], text: "needs a" }
      - { when: [ { has_flag: a }, { has_flag: b } ], text: "needs a AND b — dead, the a-only case wins" }`,
    );
    expect(codes(src)).toContain("UNREACHABLE_VARIANT");
  });

  it("flags an identical `when` (a duplicate later variant can never win)", () => {
    const src = wrap(
      `      - { when: [ { has_flag: a } ], text: "first" }
      - { when: [ { has_flag: a } ], text: "duplicate — never reached" }`,
    );
    expect(codes(src)).toContain("UNREACHABLE_VARIANT");
  });

  it("checks ending variants too, not just scene variants", () => {
    const src = `
meta: { id: t, title: T, start: s }
scenes:
  - { id: s, title: S, text: "x", choices: [ { id: g, text: go, next: e } ] }
endings:
  - id: e
    title: E
    text: "base"
    variants:
      - { when: [ { has_flag: won } ], text: "won" }
      - { when: [ { has_flag: won }, { has_flag: flawless } ], text: "dead — won-only wins first" }
`;
    expect(codes(src)).toContain("UNREACHABLE_VARIANT");
  });

  it("does NOT flag correctly-ordered (specific-first) variants", () => {
    const src = wrap(
      `      - { when: [ { var_gte: { name: ticks, value: 5 } } ], text: "specific first" }
      - { when: [ { var_gte: { name: ticks, value: 2 } } ], text: "general second — both reachable" }`,
    );
    expect(codes(src)).not.toContain("UNREACHABLE_VARIANT");
  });

  it("does NOT flag incomparable variants (distinct flags, neither entails the other)", () => {
    const src = wrap(
      `      - { when: [ { has_flag: a } ], text: "branch a" }
      - { when: [ { has_flag: b } ], text: "branch b — independent, both reachable" }`,
    );
    expect(codes(src)).not.toContain("UNREACHABLE_VARIANT");
  });

  it("is SOUND: an any_of (opaque) sibling is never used to prove shadowing", () => {
    // The earlier variant is a disjunction we cannot reason about; even though the
    // later >=5 case overlaps it, we must NOT claim it is shadowed (no false positive).
    const src = wrap(
      `      - { when: [ { any_of: [ { var_gte: { name: ticks, value: 2 } }, { has_flag: alarm } ] } ], text: "disjunction" }
      - { when: [ { var_gte: { name: ticks, value: 5 } } ], text: "not provably shadowed by a disjunction" }`,
    );
    expect(codes(src)).not.toContain("UNREACHABLE_VARIANT");
  });
});
