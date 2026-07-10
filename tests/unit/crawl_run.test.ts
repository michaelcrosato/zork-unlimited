import { describe, expect, it } from "vitest";
import { parseCrawlArgs, buildPlan, type CrawlPlanItem } from "../../src/crawl/run.js";

function isQuestItem(p: CrawlPlanItem): p is Extract<CrawlPlanItem, { kind: "quest" }> {
  return p.kind === "quest";
}

describe("crawl CLI", () => {
  it("parses seed ranges and quest lists", () => {
    const o = parseCrawlArgs([
      "--quest",
      "sunken_barrow",
      "--seeds",
      "5..8",
      "--steps",
      "100",
      "--policy",
      "random",
    ]);
    expect(o.quests).toEqual(["sunken_barrow"]);
    expect(o.seeds).toEqual([5, 6, 7, 8]);
    expect(o.policy).toBe("random");
    expect(o.overworld).toBe(false);
  });

  it("smoke preset is fixed and deterministic", () => {
    const a = parseCrawlArgs(["--smoke"]);
    const b = parseCrawlArgs(["--smoke"]);
    expect(a).toEqual(b);
    expect(a.seeds.length).toBeGreaterThan(0);
    expect(a.secondsBudget).toBeUndefined();
    expect(a.overworld).toBe(true);
  });

  it("plan orders quests deterministically", () => {
    const o = parseCrawlArgs(["--smoke"]);
    const plan = buildPlan({ ...o, root: process.cwd(), commit: "x", outDir: "ignored" });
    const questIds = plan.filter(isQuestItem).map((p) => p.questId);
    expect(questIds).toEqual([...questIds].sort());
  });
});
