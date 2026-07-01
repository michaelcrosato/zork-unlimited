/**
 * MCP RPG catalog contract.
 *
 * The tool API rejects older pack shapes and steers blind/AFK discovery only to
 * the consolidated RPG surface.
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { isRpgPackShape } from "../../src/mcp/types.js";

const ROOT = process.cwd();
const api = () => createToolApi({ root: ROOT });
const MAIN_RPG = "content/rpg/pack/breaking_weir.yaml";
const RPG_WORLD_QUEST_ID = "sunken_barrow";

describe("isRpgPackShape keeps RPG structural priority", () => {
  it("rpg has enemies even when enemies is empty", () => {
    expect(isRpgPackShape({ enemies: [], rooms: [] })).toBe(true);
    expect(isRpgPackShape({ rooms: [] })).toBe(false);
  });
});

describe("list_stories exposes only world-graph RPG quests", () => {
  it("discovers RPG packs from the world graph and chooses the high-depth RPG default", () => {
    const a = api();
    const { stories, main_story, main_world_quest_id } = a.list_stories();
    const world = a.list_world();
    expect(main_story).toBe(MAIN_RPG);
    expect(main_world_quest_id).toBe("breaking_weir");
    expect(stories).toHaveLength(16);
    expect(stories.map((s) => s.path)).toEqual(world.quests.map((q) => q.path));
    expect(stories.map((s) => s.world_quest_id)).toEqual(world.quests.map((q) => q.graph_node));
    expect(stories.every((s) => s.mode === "rpg")).toBe(true);
    expect(stories.every((s) => s.path.startsWith("content/rpg/pack/"))).toBe(true);
    expect(stories.some((s) => s.path.includes("/cyoa/"))).toBe(false);
    expect(stories.some((s) => s.path.includes("/parser/"))).toBe(false);
  });
});

describe("load_pack / validate_pack report RPG mode for catalog packs", () => {
  it("the default RPG pack loads and validates green", () => {
    const r = api().load_pack({ world_quest_id: "breaking_weir" });
    expect(r.ok).toBe(true);
    expect("pack_path" in r).toBe(false);
    expect(r.mode).toBe("rpg");
    expect(r.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("RPG pack plays through the structured tool API", () => {
  it("can reach the wight and ATTACK via the legal-action set", () => {
    const a = api();
    const game = a.new_game({ world_quest_id: RPG_WORLD_QUEST_ID });
    expect(game.mode).toBe("rpg");
    expect(game.observation.mode).toBe("rpg");
    if (game.observation.mode !== "rpg") return;
    expect(game.observation.stats.hp).toBeGreaterThan(0);

    const byCmd = (sid: string, needle: string): string | undefined =>
      (a.list_legal_actions({ session_id: sid }).actions as { id: string; command: string }[]).find(
        (x) => x.command.includes(needle),
      )?.id;

    expect(
      a.step_action({ session_id: game.session_id, action_id: byCmd(game.session_id, "go down")! })
        .ok,
    ).toBe(true);
    expect(
      a.step_action({
        session_id: game.session_id,
        action_id: byCmd(game.session_id, "take iron bar")!,
      }).ok,
    ).toBe(true);
    expect(
      a.step_action({ session_id: game.session_id, action_id: byCmd(game.session_id, "go north")! })
        .ok,
    ).toBe(true);
    const attackId = byCmd(game.session_id, "attack");
    expect(attackId).toBeTruthy();
    const r = a.step_action({ session_id: game.session_id, action_id: attackId! });
    expect(r.ok).toBe(true);
    expect(r.events.some((e) => e.type === "narration" && /strike/i.test(e.text))).toBe(true);
  });
});
