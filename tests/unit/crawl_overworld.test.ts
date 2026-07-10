import { describe, expect, it } from "vitest";
import { crawlOverworld } from "../../src/crawl/overworld_crawler.js";
import { solveToEnding } from "../../src/crawl/quest_solver.js";
import { prepareShippedQuest, listShippedQuestIds } from "../../src/crawl/prepare.js";

describe("overworld crawler", () => {
  it("solveToEnding finds a non-death ending path for every shipped quest", () => {
    for (const id of listShippedQuestIds(process.cwd())) {
      const path = solveToEnding(prepareShippedQuest(process.cwd(), id), 1, 60000);
      expect(path, id).not.toBeNull();
      expect(path!.death).toBe(false);
    }
  }, 60000);

  it("full pass is clean and covers everything (this IS the smoke overworld leg)", () => {
    const r = crawlOverworld({
      root: process.cwd(),
      seed: 1,
      commit: "test",
      questRoundTrips: true,
      solverBudget: 60000,
      maxLocalActionsPerTown: 40,
    });
    expect(r.findings.filter((f) => f.code !== "ORPHAN")).toEqual([]);
    expect(r.coverage.nodes.visited).toBe(r.coverage.nodes.total);
    expect(r.coverage.edges.traveled).toBe(r.coverage.edges.total);
    expect(r.coverage.boards.read).toBe(r.coverage.boards.total);
    expect(r.questRoundTrips.length).toBe(r.coverage.quests.total);
  }, 60000);

  it("is deterministic for a fixed seed", () => {
    const run = () =>
      crawlOverworld({
        root: process.cwd(),
        seed: 2,
        commit: "test",
        questRoundTrips: false,
        solverBudget: 0,
        maxLocalActionsPerTown: 40,
      });
    expect(run().coverage).toEqual(run().coverage);
  });
});
