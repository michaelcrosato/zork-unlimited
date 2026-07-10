import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// vitest can import .mjs fine:
// @ts-expect-error — plain .mjs module without type declarations
import { fillPrompt } from "../../blind-tester/fill-prompt.mjs";
import {
  parseFleetArgs,
  planFleetRuns,
  reportPathFor,
  resumeCandidatesFor,
  // @ts-expect-error — plain .mjs module without type declarations
} from "../../blind-tester/fleet.mjs";

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

describe("resumeCandidatesFor", () => {
  it("anchors the seed so seed1 never matches seed10", () => {
    const entries = ["20260709T010203Z_overworld_seed10.md", "20260709T010203Z_overworld_seed1.md"];
    expect(resumeCandidatesFor(entries, "overworld", 1)).toEqual([
      "20260709T010203Z_overworld_seed1.md",
    ]);
    expect(resumeCandidatesFor(entries, "overworld", 10)).toEqual([
      "20260709T010203Z_overworld_seed10.md",
    ]);
  });
  it("returns matches newest-stamp-first", () => {
    const entries = [
      "20260101T000000Z_overworld_seed5.md",
      "20260301T000000Z_overworld_seed5.md",
      "20260201T000000Z_overworld_seed5.md",
    ];
    expect(resumeCandidatesFor(entries, "overworld", 5)).toEqual([
      "20260301T000000Z_overworld_seed5.md",
      "20260201T000000Z_overworld_seed5.md",
      "20260101T000000Z_overworld_seed5.md",
    ]);
  });
  it("ignores non-matching slugs and unrelated files", () => {
    const entries = [
      "20260101T000000Z_sunken_barrow_seed5.md",
      "notes.txt",
      "20260101T000000Z_overworld_seed5.json",
    ];
    expect(resumeCandidatesFor(entries, "overworld", 5)).toEqual([]);
  });
});

describe("parseFleetArgs numeric validation", () => {
  it("rejects --count 0 (would otherwise be vacuous success)", () => {
    expect(() => parseFleetArgs(["--count", "0"])).toThrow();
  });
  it("rejects a non-numeric --count", () => {
    expect(() => parseFleetArgs(["--count", "abc"])).toThrow();
  });
  it("rejects --concurrency 0", () => {
    expect(() => parseFleetArgs(["--concurrency", "0"])).toThrow();
  });
  it("rejects a non-integer --concurrency", () => {
    expect(() => parseFleetArgs(["--concurrency", "1.5"])).toThrow();
  });
  it("rejects a negative --max-retries", () => {
    expect(() => parseFleetArgs(["--max-retries", "-1"])).toThrow();
  });
  it("rejects a non-integer --seed-base", () => {
    expect(() => parseFleetArgs(["--seed-base", "NaN"])).toThrow();
  });
  it("accepts the sensible-minimum boundary values", () => {
    expect(() =>
      parseFleetArgs(["--count", "1", "--concurrency", "1", "--max-retries", "0"]),
    ).not.toThrow();
  });
});
