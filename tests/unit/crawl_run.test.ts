import { describe, expect, it } from "vitest";
import {
  parseCrawlArgs,
  buildPlan,
  finalizeFindings,
  mergeSummaries,
  runPlanInProcess,
  sliceSeeds,
  type CrawlPlanItem,
  type CrawlRunOptions,
} from "../../src/crawl/run.js";
import { preparePack, type PreparedQuest } from "../../src/crawl/prepare.js";
import { generateRpgPack } from "../../src/gen/rpg_generator.js";

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

/**
 * Task 10 review fix: `summary.json` embeds `findings`/`countsByCode` as
 * built, not just as sets/values — so BOTH the single-process path
 * (`runPlanInProcess`, via `finalizeFindings`) and the worker-merge path
 * (`mergeSummaries`, via the SAME `finalizeFindings`) must produce identical
 * array/key ORDER for identical finding content, never an order that depends
 * on how many workers ran, or in what order shards happened to concatenate.
 * `quest_a`'s only code (WORLD) sorts alphabetically AFTER `quest_b`'s only
 * code (CRASH) — so a fingerprint/code-first order (the pre-fix bug: code
 * first, so CRASH before WORLD/LEGALITY) and a questId-first order (the
 * correct `sortFindings` artifact order: quest_a's codes before quest_b's)
 * disagree on which code appears first. That disagreement is exactly what
 * pins the regression.
 */
describe("finalizeFindings (shared by runPlanInProcess and mergeSummaries)", () => {
  const finding = (code: string, questId: string, seed: number, step: number, msg: string) =>
    ({
      code,
      severity: "S2",
      seed,
      policy: "mixed",
      step,
      location: { region: null, node: null, questId, sceneId: "r" },
      action: null,
      message: msg,
      stateHash: null,
      commit: "x",
      repro: { kind: "none", trace: null, minimized: false },
    }) as const;

  // Multi-code (CRASH, WORLD, LEGALITY, RENDER), multi-quest (quest_a/b/c) set,
  // fed in an arrival order that matches neither the fingerprint/code-first
  // order nor the correct questId-first order — so nothing "accidentally"
  // passes by matching input order.
  const raw = [
    finding("RENDER", "quest_c", 1, 1, "delta"),
    finding("CRASH", "quest_b", 1, 1, "alpha"),
    finding("WORLD", "quest_a", 2, 1, "beta"),
    finding("LEGALITY", "quest_a", 1, 2, "gamma"),
  ] as never as Parameters<typeof finalizeFindings>[0];

  it("orders findings/countsByCode by (questId, code) — NOT by fingerprint's code-first order", () => {
    const { findings, countsByCode } = finalizeFindings(raw);
    // questId-first: quest_a (LEGALITY before WORLD, alphabetically) then quest_b then quest_c.
    expect(findings.map((f) => `${f.location.questId}:${f.code}`)).toEqual([
      "quest_a:LEGALITY",
      "quest_a:WORLD",
      "quest_b:CRASH",
      "quest_c:RENDER",
    ]);
    expect(Object.keys(countsByCode)).toEqual(["LEGALITY", "WORLD", "CRASH", "RENDER"]);
    // The old bug's order (fingerprint/code-first, alphabetical by CODE alone)
    // would have put CRASH first — assert we do NOT match that shape.
    expect(Object.keys(countsByCode)).not.toEqual(["CRASH", "LEGALITY", "RENDER", "WORLD"]);
  });

  it("both paths agree: finalizeFindings(raw) directly vs. mergeSummaries splitting the SAME findings across shards in a different order", () => {
    const direct = finalizeFindings(raw);

    // Simulate a worker fan-out: the same findings, split into two shards in
    // an order that differs from `raw`'s own arrival order (as a real
    // multi-worker run's shard-completion order would).
    const shardA = { findings: [raw[2]!, raw[0]!], steps: 0 } as never;
    const shardB = { findings: [raw[3]!, raw[1]!], steps: 0 } as never;
    const merged = mergeSummaries([shardA, shardB]);

    expect(merged.findings).toEqual(direct.findings);
    expect(Object.keys(merged.countsByCode)).toEqual(Object.keys(direct.countsByCode));
    expect(merged.countsByCode).toEqual(direct.countsByCode);
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

/**
 * Review fix (Task 10 follow-up #2): the `finalizeFindings` tests above (and
 * `crawl_workers_determinism.test.ts`'s byte-diff test, which only ever runs
 * clean shipped content with `--no-overworld`) never exercise `findings`/
 * `countsByCode` with REAL findings produced by an actual `runPlanInProcess`
 * call — they hand-build `CrawlFinding` literals and call `finalizeFindings`/
 * `mergeSummaries` directly, or byte-diff a run whose `findings` array is
 * always `[]`. Neither can fail on the historical defect (`runPlanInProcess`
 * and `mergeSummaries` disagreeing on array/key order) actually firing on a
 * live crawl.
 *
 * This suite uses the new `CrawlRunOptions.prepareQuest` DI seam to hand
 * `runPlanInProcess` two in-memory, mutated packs — a RENDER template-marker
 * mutation (`generateRpgPack(3)`) and a throwing-resolver CRASH wrapper
 * (`generateRpgPack(4)`), both recipes proven in
 * `tests/unit/crawl_quest_crawler.test.ts` — under two different questIds
 * chosen so questId-alphabetical order and code-alphabetical order DISAGREE:
 * `quest_alpha_render` (RENDER) sorts before `quest_zulu_crash` (CRASH) by
 * questId, but "CRASH" sorts before "RENDER" alphabetically by code alone.
 * The plan items are also fed in the OPPOSITE order (CRASH item first) so
 * nothing "accidentally" passes by matching arrival order either.
 */
describe("runPlanInProcess with injected quests (real, non-empty findings)", () => {
  const RENDER_QUEST_ID = "quest_alpha_render";
  const CRASH_QUEST_ID = "quest_zulu_crash";

  function prepareRenderQuest(): PreparedQuest {
    const pack = generateRpgPack(3);
    // pack.rooms is an array (src/rpg/schema.ts RpgPackSchema); pick any non-start room,
    // same recipe as tests/unit/crawl_quest_crawler.test.ts's RENDER case.
    const room = pack.rooms.find((r) => r.id !== pack.meta.start_room)!;
    room.description = "You see {{treasure_name}} here.";
    return { ...preparePack(pack), questId: RENDER_QUEST_ID };
  }

  function prepareCrashQuest(): PreparedQuest {
    const pack = generateRpgPack(4);
    const prepared = preparePack(pack, {
      wrapRules: (rules) => ({
        ...rules,
        resolve: (state, action) => {
          if (action.type === "TAKE") throw new Error("planted resolver bomb");
          return rules.resolve(state, action);
        },
      }),
    });
    return { ...prepared, questId: CRASH_QUEST_ID };
  }

  function injectedPrepareQuest(_root: string, questId: string): PreparedQuest {
    if (questId === RENDER_QUEST_ID) return prepareRenderQuest();
    if (questId === CRASH_QUEST_ID) return prepareCrashQuest();
    throw new Error(`test seam: unexpected questId "${questId}"`);
  }

  const baseOpts: Omit<CrawlRunOptions, "prepareQuest"> = {
    root: process.cwd(),
    policy: "mixed",
    commit: "test",
    quests: "all",
    overworld: false,
    seeds: [11],
    stepsPerSeed: 400,
    solverBudget: 0,
    persistEvery: 37,
    outDir: "ignored",
    workers: 1,
  };
  const opts: CrawlRunOptions = { ...baseOpts, prepareQuest: injectedPrepareQuest };

  // Arrival order deliberately reversed from the eventual questId-sorted order.
  const crashItem: CrawlPlanItem = {
    kind: "quest",
    questId: CRASH_QUEST_ID,
    seeds: [11],
    stepsPerSeed: 400,
  };
  const renderItem: CrawlPlanItem = {
    kind: "quest",
    questId: RENDER_QUEST_ID,
    seeds: [11],
    stepsPerSeed: 600,
  };
  const items: CrawlPlanItem[] = [crashItem, renderItem];

  it("orders findings/countsByCode by (questId, code), not by arrival order or code alone", () => {
    const summary = runPlanInProcess(items, opts);
    const pairs = summary.findings.map((f) => `${f.location.questId}:${f.code}`);
    // The mutated room's template marker is rendered from two different call
    // sites (an observation description and a narration event), so the RENDER
    // quest legitimately produces two distinct (differently-worded, differently-
    // stepped) RENDER findings — both still sort before the CRASH quest's one
    // finding, since questId is the primary sort key.
    expect(pairs).toEqual([
      `${RENDER_QUEST_ID}:RENDER`,
      `${RENDER_QUEST_ID}:RENDER`,
      `${CRASH_QUEST_ID}:CRASH`,
    ]);
    expect(Object.keys(summary.countsByCode)).toEqual(["RENDER", "CRASH"]);
    expect(summary.countsByCode).toEqual({ RENDER: 2, CRASH: 1 });
  });

  it("mergeSummaries over per-quest shards matches runPlanInProcess's combined findings and key order", () => {
    const combined = runPlanInProcess(items, opts);

    // Simulate a worker-per-quest fan-out: each shard sees only its own item,
    // fed to mergeSummaries in the SAME (crash-then-render) arrival order.
    const crashShard = runPlanInProcess([crashItem], opts);
    const renderShard = runPlanInProcess([renderItem], opts);
    const merged = mergeSummaries([crashShard, renderShard]);

    expect(merged.findings).toEqual(combined.findings);
    expect(Object.keys(merged.countsByCode)).toEqual(Object.keys(combined.countsByCode));
    expect(merged.countsByCode).toEqual(combined.countsByCode);
  });
});
