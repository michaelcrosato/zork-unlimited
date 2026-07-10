import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// vitest can import .mjs fine:
// @ts-expect-error — plain .mjs module without type declarations
import { fillPrompt } from "../../blind-tester/fill-prompt.mjs";
// @ts-expect-error — plain .mjs module without type declarations
import { parseFleetArgs, planFleetRuns, reportPathFor } from "../../blind-tester/fleet.mjs";

describe("fill-prompt", () => {
  const template = "Intro.\n{{PERSONA}}\nRules __SEED__.\nGo: {{START_INSTRUCTION}}\n";
  it("substitutes all three placeholders", () => {
    const out = fillPrompt(template, {
      startInstruction: "start overworld",
      seed: 42,
      persona: "You are the BREAKER.",
    });
    expect(out).toContain("You are the BREAKER.");
    expect(out).toContain("Rules 42.");
    expect(out).toContain("Go: start overworld");
    expect(out).not.toMatch(/\{\{|__SEED__/);
  });
  it("empty persona leaves zero residue — byte-compatible with the pre-persona prompt", () => {
    const out = fillPrompt(template, { startInstruction: "x", seed: 1, persona: "" });
    expect(out).toBe("Intro.\nRules 1.\nGo: x\n");
  });
  it("real prompts contain exactly one persona slot each", () => {
    for (const p of ["blind-tester/prompt.md", "blind-tester/prompt-overworld.md"])
      expect(readFileSync(p, "utf8").match(/\{\{PERSONA\}\}/g)).toHaveLength(1);
  });
});

describe("fleet planning", () => {
  it("rotates personas deterministically and honors seed base", () => {
    const runs = planFleetRuns(
      parseFleetArgs(["--count", "7", "--personas", "mixed", "--seed-base", "100"]),
    );
    expect(runs.map((r: { seed: number }) => r.seed)).toEqual([100, 101, 102, 103, 104, 105, 106]);
    expect(runs[0].persona).toBe("explorer");
    expect(runs[5].persona).toBe("explorer"); // 5 % 5 wraps
    expect(new Set(runs.map((r: { persona: string }) => r.persona)).size).toBe(5);
  });
  it("quest targets parse and reach the plan", () => {
    const runs = planFleetRuns(parseFleetArgs(["--count", "2", "--target", "quest:sunken_barrow"]));
    expect(runs.every((r: { target: string }) => r.target === "quest:sunken_barrow")).toBe(true);
  });
  it("report filenames match the ledger regex", () => {
    const p = reportPathFor("blind-tester/reports", "20260709T010203Z", "overworld", 12);
    expect(p.replace(/\\/g, "/").split("/").pop()).toMatch(/^\d{8}T\d{6}Z_.+_seed-?\d+\.md$/);
  });
});
