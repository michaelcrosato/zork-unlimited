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
});
