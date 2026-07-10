import { describe, expect, it } from "vitest";
import {
  parseCrawlArgs,
  buildPlan,
  mergeSummaries,
  sliceSeeds,
  type CrawlPlanItem,
} from "../../src/crawl/run.js";

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

describe("mergeSummaries", () => {
  it("merging shard summaries is order-independent and re-dedupes", () => {
    const f = (seed: number, msg: string) =>
      ({
        code: "RENDER",
        severity: "S2",
        seed,
        policy: "mixed",
        step: 1,
        location: { region: null, node: null, questId: "q", sceneId: "r" },
        action: null,
        message: msg,
        stateHash: null,
        commit: "x",
        repro: { kind: "none", trace: null, minimized: false },
      }) as const;
    const s1 = { findings: [f(1, "empty description 5")], steps: 10 /* …minimal summary… */ };
    const s2 = { findings: [f(2, "empty description 9")], steps: 20 };
    const ab = mergeSummaries([s1, s2] as never);
    const ba = mergeSummaries([s2, s1] as never);
    expect(ab.findings).toEqual(ba.findings);
    expect(ab.findings).toHaveLength(1); // same fingerprint (numbers normalized)
    expect(ab.steps).toBe(30);
  });

  it("unions per-quest coverage across shards (rooms/actions/endings)", () => {
    const s1 = {
      findings: [],
      steps: 5,
      questCoverage: {
        q1: {
          roomsVisited: 2,
          roomsTotal: 3,
          actionsTried: 2,
          actionIdsTried: ["MOVE:a", "MOVE:b"],
          actionsTotal: 5,
          endingsReached: ["good"],
          endingsDeclared: ["good", "bad"],
          orphans: { rooms: ["r3"], endings: ["bad"] },
        },
      },
    };
    const s2 = {
      findings: [],
      steps: 7,
      questCoverage: {
        q1: {
          roomsVisited: 2,
          roomsTotal: 3,
          actionsTried: 1,
          actionIdsTried: ["MOVE:c"],
          actionsTotal: 5,
          endingsReached: ["bad"],
          endingsDeclared: ["good", "bad"],
          orphans: { rooms: ["r1"], endings: ["good"] },
        },
      },
    };
    const merged = mergeSummaries([s1, s2] as never);
    const q1 = merged.questCoverage["q1"]!;
    expect(q1.roomsVisited).toBe(3); // r1 and r3 each covered by the OTHER shard
    expect(q1.orphans.rooms).toEqual([]);
    expect(q1.actionIdsTried).toEqual(["MOVE:a", "MOVE:b", "MOVE:c"]);
    expect(q1.actionsTried).toBe(3);
    expect(q1.endingsReached).toEqual(["bad", "good"]);
    expect(q1.orphans.endings).toEqual([]);
  });

  it("recomputes timing from an explicit wallMs rather than summing shard wallMs", () => {
    const s1 = { findings: [], steps: 100, wallMs: 999, stepsPerSec: 1 };
    const s2 = { findings: [], steps: 100, wallMs: 999, stepsPerSec: 1 };
    const merged = mergeSummaries([s1, s2] as never, 200);
    expect(merged.wallMs).toBe(200);
    expect(merged.stepsPerSec).toBeCloseTo((200 / 200) * 1000, 5);
  });
});

describe("sliceSeeds", () => {
  it("splits seeds into whole, contiguous, non-overlapping per-worker slices that reunite to the input", () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7];
    const slices = sliceSeeds(seeds, 3);
    expect(slices).toHaveLength(3);
    expect(slices.flat()).toEqual(seeds);
    // every seed appears in exactly one slice
    const seen = slices.flat();
    expect(new Set(seen).size).toBe(seeds.length);
  });

  it("never hands out more slices than seeds", () => {
    const slices = sliceSeeds([1, 2], 8);
    expect(slices.filter((s) => s.length > 0)).toHaveLength(2);
  });
});
