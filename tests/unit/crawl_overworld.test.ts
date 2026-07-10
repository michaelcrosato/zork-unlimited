import { describe, expect, it } from "vitest";
import { crawlOverworld } from "../../src/crawl/overworld_crawler.js";
import { generateRpgPack } from "../../src/gen/rpg_generator.js";
import { describeSolveToEndingFailure, solveToEnding } from "../../src/crawl/quest_solver.js";
import { prepareShippedQuest, preparePack, listShippedQuestIds } from "../../src/crawl/prepare.js";

describe("overworld crawler", () => {
  it("solveToEnding finds a non-death ending path for every shipped quest", () => {
    for (const id of listShippedQuestIds(process.cwd())) {
      const result = solveToEnding(prepareShippedQuest(process.cwd(), id), 1, 60000);
      expect(result.ok, id).toBe(true);
      if (result.ok) expect(result.death).toBe(false);
    }
  }, 120_000);

  it("solveToEnding distinguishes a state-cap hit from restricted-frontier exhaustion", () => {
    // "capped": a real, genuinely-winnable pack but with a maxStates budget so
    // tiny the search cannot possibly finish before the cap fires.
    const cappedId = listShippedQuestIds(process.cwd())[0]!;
    const capped = solveToEnding(prepareShippedQuest(process.cwd(), cappedId), 1, 1);
    expect(capped).toEqual({ ok: false, reason: "capped" });

    // "exhausted-restricted": a generated pack mutated so EVERY ending is a
    // death ending. The restricted-action-set BFS can then fully explore the
    // (small, generated) reachable region well within a generous budget and
    // still never find a non-death ending — the frontier exhausts naturally,
    // it is never anywhere near the state cap.
    const allDeathPack = generateRpgPack(3);
    for (const ending of allDeathPack.endings) ending.death = true;
    const exhausted = solveToEnding(preparePack(allDeathPack), 1, 100_000);
    expect(exhausted).toEqual({ ok: false, reason: "exhausted-restricted" });
  });

  it("describeSolveToEndingFailure pins the WORLD finding wording for both reasons", () => {
    expect(describeSolveToEndingFailure("capped", "dawn_beacon", 30000)).toBe(
      'no non-death ending solvable for round trip (search capped at 30000 states) for quest "dawn_beacon"',
    );
    expect(describeSolveToEndingFailure("exhausted-restricted", "dawn_beacon", 30000)).toBe(
      "no non-death ending reachable under the restricted action set " +
        '(DROP/CLOSE/LOOK/INVENTORY/READ/INSPECT skipped) for quest "dawn_beacon" — ' +
        "either the quest is unwinnable or its only path needs a skipped action",
    );
  });

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
  }, 120_000);

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
