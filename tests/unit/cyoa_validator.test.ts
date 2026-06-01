import { describe, it, expect } from "vitest";
import { compilePack, loadPackFile } from "../../src/cyoa/pack.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";

const PACK = "content/cyoa/pack/watchtower_road.yaml";
const FIX = (name: string) => `content/broken-fixtures/${name}`;

function codesFor(path: string): { schemaFailed: boolean; codes: string[] } {
  const result = loadPackFile(path);
  if (!result.ok) return { schemaFailed: true, codes: ["SCHEMA"] };
  const report = validateCyoa(result.compiled.pack);
  return { schemaFailed: false, codes: report.findings.map((f) => f.code) };
}

describe("CYOA validator — the shipped pack is green (§10.1)", () => {
  it("The Watchtower Road validates with no errors", () => {
    const result = loadPackFile(PACK);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = validateCyoa(result.compiled.pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

describe("CYOA validator — negative fixtures must bite (§10.4)", () => {
  // Structural fixtures: the validator flags a specific error code.
  it.each([
    ["ref_unresolved.yaml", "REF_UNRESOLVED"],
    ["impossible_gate.yaml", "IMPOSSIBLE_GATE"],
    ["duplicate_id.yaml", "DUPLICATE_ID"],
    ["ending_unreachable.yaml", "ENDING_UNREACHABLE"],
    ["softlock.yaml", "SOFTLOCK"],
    ["contradiction.yaml", "CONTRADICTORY_CONDITION"],
    ["unreachable_variant.yaml", "UNREACHABLE_VARIANT"],
    ["unsatisfiable_condition.yaml", "UNSATISFIABLE_CONDITION"],
    ["deadline_unfireable.yaml", "DEADLINE_UNFIREABLE"],
  ])("%s fails with %s", (file, code) => {
    const { schemaFailed, codes } = codesFor(FIX(file));
    expect(schemaFailed).toBe(false);
    expect(codes).toContain(code);
  });

  // Schema fixtures: the contract itself rejects them before structural checks.
  it.each(["empty_text.yaml", "unknown_effect.yaml"])("%s fails the schema", (file) => {
    const result = loadPackFile(FIX(file));
    expect(result.ok).toBe(false);
  });
});

describe("CYOA validator — synthetic edge cases", () => {
  it("flags a self-only loop scene as a soft-lock", () => {
    const src = `
meta: { id: t, title: T, start: a }
scenes:
  - { id: a, title: A, text: "x", choices: [ { id: g, text: go, next: a } ] }
endings: [ { id: e, title: E, text: "done" } ]
`;
    const r = compilePack(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const report = validateCyoa(r.compiled.pack);
    // No ending is reachable at all from start.
    expect(report.findings.map((f) => f.code)).toContain("NO_REACHABLE_ENDING");
  });

  // ── meta.deadline (global terminal via engine §8.4.5 checkWin) ──────────────
  // A deadline ending is reached without any choice `next`/`goto` pointing at it;
  // the validator must (a) treat it as reachable when some scene can advance the
  // var it watches, and (b) reject a deadline whose `ending` is missing or not a
  // terminal — else the engine guard would silently swallow the deadline.
  const deadlinePack = (deadlineEnding: string): string => `
meta:
  id: d
  title: D
  start: a
  vars_init: { t: 0 }
  deadline: { when: [ { var_gte: { name: t, value: 3 } } ], ending: ${deadlineEnding} }
scenes:
  - id: a
    title: A
    text: x
    on_enter: [ { inc_var: { name: t, by: 1 } } ]
    choices:
      - { id: wait, text: wait, next: a }
      - { id: go, text: go, next: win }
endings:
  - { id: win, title: W, text: won }
  - { id: over, title: O, text: "out of time" }
`;

  it("a deadline ending reachable only via the deadline is NOT flagged unreachable", () => {
    const r = compilePack(deadlinePack("over"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const report = validateCyoa(r.compiled.pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.findings.some((f) => f.code === "ENDING_UNREACHABLE")).toBe(false);
  });

  it("a deadline pointing at a missing node fails REF_UNRESOLVED", () => {
    const r = compilePack(deadlinePack("nope"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const report = validateCyoa(r.compiled.pack);
    expect(report.findings.some((f) => f.code === "REF_UNRESOLVED")).toBe(true);
  });

  it("a deadline pointing at a non-terminal scene fails DEADLINE_NOT_TERMINAL", () => {
    const r = compilePack(deadlinePack("a")); // `a` is a scene, not a terminal
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const report = validateCyoa(r.compiled.pack);
    expect(report.findings.some((f) => f.code === "DEADLINE_NOT_TERMINAL")).toBe(true);
  });

  // ── deadline driven by a CHOICE effect, not on_enter (bug_0080) ─────────────
  // The engine's checkWin fires after a choice's effects too, so a deadline whose
  // watched var is advanced only by a choice effect (a natural "spend an hour"
  // action) really can end the game. The validator's reachability edge once looked
  // ONLY at on_enter var writes, so it wrongly flagged such a deadline ending
  // ENDING_UNREACHABLE. Here `t` is advanced solely by the `wait` choice's effect.
  const choiceDeadlinePack = `
meta:
  id: dc
  title: DC
  start: a
  vars_init: { t: 0 }
  deadline: { when: [ { var_gte: { name: t, value: 3 } } ], ending: over }
scenes:
  - id: a
    title: A
    text: x
    choices:
      - { id: wait, text: wait, effects: [ { inc_var: { name: t, by: 3 } } ], next: a }
      - { id: go, text: go, next: win }
endings:
  - { id: win, title: W, text: won }
  - { id: over, title: O, text: "out of time" }
`;

  it("a deadline whose var is advanced only by a choice effect is reachable, not unreachable", () => {
    const r = compilePack(choiceDeadlinePack);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const report = validateCyoa(r.compiled.pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.findings.some((f) => f.code === "ENDING_UNREACHABLE")).toBe(false);
  });
});
