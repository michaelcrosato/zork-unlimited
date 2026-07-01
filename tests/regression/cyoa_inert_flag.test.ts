/**
 * Regression (§15) for bug_0104 — the CYOA validator now flags an INERT FLAG: a flag
 * that some `set_flag` effect writes (or that flags_init declares) but that NO
 * condition anywhere reads (has_flag/not_flag, including nested all_of/any_of/none_of).
 * Such a write is a no-op — dead bookkeeping, the flag-side sibling of a never-fired
 * DEADLINE_UNFIREABLE mechanic and the silently-dead variants of bug_0085/0086.
 *
 * This was surfaced by a blind playtest, the exact class it cannot see from inside the
 * game: a fresh source-blind seed-23 pass on wreckers_light asked "is this flag inert?"
 * (it could not tell knows_truth was consumed). The check answers that statically.
 *
 * Soundness is the bar: a flag is flagged ONLY when it has provably zero readers across
 * the whole pack, so there are no false positives on a flag that any condition consults
 * (incl. consults only via not_flag, or only inside a disjunction). Locked here:
 *   (1) the shipped reactive packs (watchtower, wreckers_light) are NOT flagged;
 *   (2) a flag set by an effect but never read is flagged;
 *   (3) a flag whose ONLY reader is a not_flag is NOT flagged;
 *   (4) a flag read only inside a disjunction (any_of) is NOT flagged;
 *   (5) a flag read by an ending variant `when` is NOT flagged;
 *   (6) a flags_init flag that nothing ever reads is flagged.
 */
import { describe, it, expect } from "vitest";
import { compilePack, loadPackFile } from "../../src/cyoa/pack.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";

function findings(src: string) {
  const r = compilePack(src);
  expect(r.ok).toBe(true);
  if (!r.ok) return [];
  return validateCyoa(r.compiled.pack).findings;
}
const codes = (src: string): string[] => findings(src).map((f) => f.code);

describe("bug_0104 — the validator flags inert (set-but-never-read) flags", () => {
  it("the shipped reactive packs are NOT flagged (vestigial flags were scrubbed)", () => {
    for (const path of [
      "content/cyoa/pack/watchtower_road.yaml",
      "content/cyoa/pack/wreckers_light.yaml",
    ]) {
      const r = loadPackFile(path);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const found = validateCyoa(r.compiled.pack).findings.map((f) => f.code);
      expect(found).not.toContain("INERT_FLAG");
    }
  });

  it("flags a flag set by an effect but never read by any condition", () => {
    const src = `
meta: { id: t, title: T, start: s }
scenes:
  - id: s
    title: S
    text: "x"
    choices:
      - { id: g, text: go, effects: [ { set_flag: dead_flag } ], next: e }
endings: [ { id: e, title: E, text: "done" } ]
`;
    const f = findings(src).find((x) => x.code === "INERT_FLAG");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("warning");
    expect(f?.message).toContain("dead_flag");
  });

  it("does NOT flag a flag whose only reader is a not_flag", () => {
    const src = `
meta: { id: t, title: T, start: s }
scenes:
  - id: s
    title: S
    text: "x"
    choices:
      - { id: once, text: once, conditions: [ { not_flag: been } ], effects: [ { set_flag: been } ], next: s }
      - { id: g, text: go, next: e }
endings: [ { id: e, title: E, text: "done" } ]
`;
    expect(codes(src)).not.toContain("INERT_FLAG");
  });

  it("does NOT flag a flag read only inside a disjunction (any_of)", () => {
    const src = `
meta: { id: t, title: T, start: s }
scenes:
  - id: s
    title: S
    text: "x"
    choices:
      - { id: set, text: set, effects: [ { set_flag: a } ], next: s }
      - { id: g, text: go, conditions: [ { any_of: [ { has_flag: a }, { has_flag: b } ] } ], next: e }
      - { id: h, text: stay, next: e }
endings: [ { id: e, title: E, text: "done" } ]
`;
    expect(codes(src)).not.toContain("INERT_FLAG");
  });

  it("does NOT flag a flag read by an ending variant `when`", () => {
    const src = `
meta: { id: t, title: T, start: s }
scenes:
  - id: s
    title: S
    text: "x"
    choices:
      - { id: g, text: go, effects: [ { set_flag: knew } ], next: e }
endings:
  - id: e
    title: E
    text: "base"
    variants:
      - { when: [ { has_flag: knew } ], text: "knowing epilogue" }
`;
    expect(codes(src)).not.toContain("INERT_FLAG");
  });

  it("flags a flags_init flag that nothing ever reads", () => {
    const src = `
meta: { id: t, title: T, start: s, flags_init: [ orphan ] }
scenes:
  - { id: s, title: S, text: "x", choices: [ { id: g, text: go, next: e } ] }
endings: [ { id: e, title: E, text: "done" } ]
`;
    const f = findings(src).find((x) => x.code === "INERT_FLAG");
    expect(f?.message).toContain("orphan");
  });
});
