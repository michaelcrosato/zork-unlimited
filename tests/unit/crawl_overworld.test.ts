import { describe, expect, it } from "vitest";
import { crawlOverworld, selectCrawlQuestApproach } from "../../src/crawl/overworld_crawler.js";
import { generateRpgPack } from "../../src/gen/rpg_generator.js";
import { describeSolveToEndingFailure, solveToEnding } from "../../src/crawl/quest_solver.js";
import { prepareShippedQuest, preparePack, listShippedQuestIds } from "../../src/crawl/prepare.js";
import type { OverworldQuestView } from "../../src/world/session_local_discovery.js";

describe("overworld crawler", () => {
  it("selects one stable unblocked quest approach and preserves optionless starts", () => {
    const base: OverworldQuestView = {
      id: "crawler_launch_fixture",
      title: "Crawler launch fixture",
      home: "town",
      area: "area",
      discovery: "A two-road lead.",
      visibility: "local_notice_board",
    };
    expect(selectCrawlQuestApproach(base)).toBeUndefined();

    const launch = {
      ...base,
      launch: {
        id: "test:crawler_launch",
        prompt: "Choose a road.",
        options: [
          {
            id: "test:z_blocked",
            title: "Blocked road",
            summary: "Too expensive.",
            preview: "The pack is too light.",
            consequence: "This route cannot be paid.",
            terms: { minutes: 10, supplies: 2, fatigue: 0 },
            projection: {
              available: false,
              minutesAfter: 490,
              suppliesAfter: null,
              fatigueAfter: null,
              travelConditionAfter: null,
              blockedReason: "Requires 2 supplies; you have 1.",
            },
          },
          {
            id: "test:b_open",
            title: "Open road B",
            summary: "Legal but later alphabetically.",
            preview: "The road is open.",
            consequence: "The crawler can take it.",
            terms: { minutes: 10, supplies: 1, fatigue: 1 },
            projection: {
              available: true,
              minutesAfter: 490,
              suppliesAfter: 0,
              fatigueAfter: 1,
              travelConditionAfter: "strained",
            },
          },
          {
            id: "test:a_open",
            title: "Open road A",
            summary: "The stable first legal route.",
            preview: "The road is open.",
            consequence: "The crawler takes it deterministically.",
            terms: { minutes: 10, supplies: 1, fatigue: 1 },
            projection: {
              available: true,
              minutesAfter: 490,
              suppliesAfter: 0,
              fatigueAfter: 1,
              travelConditionAfter: "strained",
            },
          },
        ],
      },
    } satisfies OverworldQuestView;
    expect(selectCrawlQuestApproach(launch)).toBe("test:a_open");

    const allBlocked: OverworldQuestView = {
      ...launch,
      launch: {
        ...launch.launch,
        options: launch.launch.options.filter((option) => !option.projection.available),
      },
    };
    expect(() => selectCrawlQuestApproach(allBlocked)).toThrow(/Requires 2 supplies; you have 1\./);
  });

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
        '(DROP/CLOSE/inert LOOK/INVENTORY/READ/INSPECT skipped; authored INSPECT looks retained) for quest "dawn_beacon" — ' +
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
