import { describe, expect, it } from "vitest";
import { generateRpgPack } from "../../src/gen/rpg_generator.js";
import { listShippedQuestIds, prepareShippedQuest, preparePack } from "../../src/crawl/prepare.js";
import { crawlQuest } from "../../src/crawl/quest_crawler.js";

const OPTS = { seed: 11, maxSteps: 400, policy: "mixed" as const, commit: "test" };

describe("quest crawler", () => {
  it("crawls a generated pack cleanly and deterministically", () => {
    const prepared = () => preparePack(generateRpgPack(3));
    const a = crawlQuest(prepared(), OPTS);
    const b = crawlQuest(prepared(), OPTS);
    expect(a.findings).toEqual([]); // generated packs are valid: no findings
    expect(a.steps).toBe(400);
    expect(a.episodes.map((e) => e.actions)).toEqual(b.episodes.map((e) => e.actions)); // determinism
    expect(a.episodes.map((e) => e.perStepHashes)).toEqual(b.episodes.map((e) => e.perStepHashes));
    expect(a.coverage.roomsVisited.length).toBeGreaterThan(1);
  });

  it("different seeds explore differently", () => {
    const a = crawlQuest(preparePack(generateRpgPack(3)), OPTS);
    const b = crawlQuest(preparePack(generateRpgPack(3)), { ...OPTS, seed: 12 });
    expect(a.episodes[0]!.actions).not.toEqual(b.episodes[0]!.actions);
  });

  it("CRASH: a throwing resolver is caught with a repro, not propagated", () => {
    const prepared = preparePack(generateRpgPack(3), {
      wrapRules: (rules) => ({
        ...rules,
        resolve: (state, action) => {
          if (action.type === "TAKE") throw new Error("planted resolver bomb");
          return rules.resolve(state, action);
        },
      }),
    });
    const r = crawlQuest(prepared, OPTS);
    const crash = r.findings.find((f) => f.code === "CRASH");
    expect(crash).toBeDefined();
    expect(crash!.message).toContain("planted resolver bomb");
    expect(crash!.severity).toBe("S4");
    expect(crash!.repro.kind).toBe("rpg-trace");
  });

  it("RENDER: unresolved template markers in a room description are flagged", () => {
    const pack = generateRpgPack(3);
    // pack.rooms is an array (src/rpg/schema.ts RpgPackSchema); pick any non-start room.
    const room = pack.rooms.find((r) => r.id !== pack.meta.start_room)!;
    const roomId = room.id;
    // mutate the plain object AFTER schema parse (generateRpgPack already parsed it)
    room.description = "You see {{treasure_name}} here.";
    const r = crawlQuest(preparePack(pack), { ...OPTS, maxSteps: 600 });
    const render = r.findings.find((f) => f.code === "RENDER");
    expect(render).toBeDefined();
    expect(render!.location.sceneId).toBe(roomId);
  });

  it("INTEGRITY: state corruption planted via rules wrapper is caught", () => {
    const prepared = preparePack(generateRpgPack(4), {
      wrapRules: (rules) => ({
        ...rules,
        resolve: (state, action) => {
          const res = rules.resolve(state, action);
          if (action.type === "MOVE" && res) {
            return {
              ...res,
              effects: [
                ...res.effects,
                { type: "add_item", item: "ghost_item_not_in_pack" } as never,
              ],
            };
          }
          return res;
        },
      }),
    });
    const r = crawlQuest(prepared, OPTS);
    expect(r.findings.some((f) => f.code === "INTEGRITY" || f.code === "CRASH")).toBe(true);
  });

  it("shipped quests load and a short crawl of one is finding-free", () => {
    const ids = listShippedQuestIds(process.cwd());
    expect(ids.length).toBeGreaterThanOrEqual(11);
    const r = crawlQuest(prepareShippedQuest(process.cwd(), ids[0]!), { ...OPTS, maxSteps: 200 });
    expect(r.findings.filter((f) => f.code !== "ORPHAN")).toEqual([]);
  });

  it("DESYNC: a rules wrapper with hidden mutable state is caught by episode replay", () => {
    let calls = 0;
    const prepared = preparePack(generateRpgPack(5), {
      wrapRules: (rules) => ({
        ...rules,
        resolve: (state, action) => {
          calls += 1;
          // 40th resolve call onward returns a slightly different resolution → the
          // live run observes it (whichever step happens to be in flight when the
          // GLOBAL call count first hits 40), but the end-of-episode replay starts
          // its own fresh action stream against the SAME shared `calls` counter,
          // which by then has already moved past 40 — so the anomaly never re-fires
          // during replay and the two hash streams diverge from that point on.
          const res = rules.resolve(state, action);
          if (calls === 40 && res) {
            // Real effect vocabulary (src/core/effects.ts): `inc_var` — not the
            // fictitious `{ type: "set_flag", flag, value }` shape. `inc_var` (unlike
            // `set_flag` on a flag that may already be true) is guaranteed to change
            // the hash every time it fires: it always bumps a dedicated var by 1.
            return {
              ...res,
              effects: [...res.effects, { inc_var: { name: "__desync_probe", by: 1 } }],
            };
          }
          return res;
        },
      }),
    });
    const r = crawlQuest(prepared, {
      seed: 11,
      maxSteps: 200,
      policy: "random",
      commit: "test",
      persistEvery: 0,
    });
    expect(r.findings.some((f) => f.code === "DESYNC")).toBe(true);
  });

  it("PERSIST: save→load roundtrip is exercised and clean on a healthy pack", () => {
    const r = crawlQuest(preparePack(generateRpgPack(6)), {
      seed: 3,
      maxSteps: 300,
      policy: "mixed",
      commit: "test",
      persistEvery: 10,
    });
    expect(r.findings.filter((f) => f.code === "PERSIST")).toEqual([]);
  });

  it("SOFTLOCK(solver): a pack mutated into a one-way pit is caught", () => {
    const pack = generateRpgPack(7);
    // "cell" (src/gen/rpg_generator.ts) is a reachable, non-start, non-terminal dead
    // end: a side room west off "hall" whose only exit runs back east. Stripping its
    // exits makes it a genuine one-way pit — LOOK/INVENTORY/TAKE-the-ward stay legal
    // there (so the Task-4 zero-actions SOFTLOCK never fires), but no route out
    // exists, so only the solver oracle can catch it.
    const cell = pack.rooms.find((r) => r.id === "cell")!;
    cell.exits = [];
    const r = crawlQuest(preparePack(pack), {
      seed: 5,
      maxSteps: 1500,
      policy: "mixed",
      commit: "test",
      solverBudget: 20000,
    });
    expect(r.findings.some((f) => f.code === "SOFTLOCK")).toBe(true);
  });

  it("repro dedupe: a finding that fires every step builds its repro trace only once", () => {
    // Task 5 review fix: reproFor/buildRepro must not run on every duplicate-
    // fingerprint occurrence. Force EVERY legal action to be rejected ("no effect
    // here"), so LEGALITY findings fire on virtually every step but cycle through
    // only the room's small fixed set of action ids (state never advances, so the
    // room — and hence the fingerprint's location — never changes either). If the
    // repro trace were still built eagerly at every finding site, each build would
    // replay the whole recorded-actions-so-far prefix (buildRepro -> recordTrace ->
    // runActions), so `resolveCalls` would grow QUADRATICALLY in step count; with
    // the dedupe pre-check it stays close to linear (one build per distinct id, plus
    // the unavoidable one resolve-call-per-step baseline).
    let resolveCalls = 0;
    const prepared = preparePack(generateRpgPack(3), {
      wrapRules: (rules) => ({
        ...rules,
        resolve: (_state, _action) => {
          resolveCalls += 1;
          return null;
        },
      }),
    });
    const maxSteps = 150;
    const r = crawlQuest(prepared, {
      seed: 11,
      maxSteps,
      policy: "random",
      commit: "test",
      persistEvery: 0,
      desyncReplay: false,
    });
    const legality = r.findings.filter((f) => f.code === "LEGALITY");
    expect(legality.length).toBeGreaterThan(0);
    expect(r.totalRawFindings).toBeGreaterThanOrEqual(maxSteps);
    // Unfixed (eager repro on every duplicate) would be ~maxSteps^2/2 ≈ 11,000+
    // resolve calls; fixed stays a small multiple of maxSteps.
    expect(resolveCalls).toBeLessThan(maxSteps * 10);
  });
});
