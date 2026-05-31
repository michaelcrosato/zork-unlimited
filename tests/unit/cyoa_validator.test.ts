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
});
