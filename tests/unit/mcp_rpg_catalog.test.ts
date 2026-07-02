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
const RPG_WORLD_QUEST_ID = "sunken_barrow";

describe("isRpgPackShape keeps RPG structural priority", () => {
  it("rpg has enemies even when enemies is empty", () => {
    expect(isRpgPackShape({ enemies: [], rooms: [] })).toBe(true);
    expect(isRpgPackShape({ rooms: [] })).toBe(false);
  });
});

describe("list_world is the single RPG quest catalog", () => {
  it("discovers RPG quests from the world graph without the retired story catalog", () => {
    const a = api();
    expect((a as unknown as Record<string, unknown>).list_stories).toBeUndefined();
    const world = a.list_world();
    const expanded = a.list_world({ include_graph: true });
    expect("main_world_quest_id" in world).toBe(false);
    expect("graph" in world).toBe(false);
    expect(world.quests).toHaveLength(16);
    expect(world.quests.every((q) => !("path" in q))).toBe(true);
    expect(world.quests.every((q) => !("path_from_hub" in q))).toBe(true);
    expect(expanded.graph.nodes.every((node) => !("pack" in node))).toBe(true);
    expect(world.quests.map((q) => q.world_quest_id)).toEqual(
      expanded.graph.nodes.filter((node) => node.kind === "quest").map((node) => node.id),
    );
    expect(world.quests.every((s) => s.mode === "rpg")).toBe(true);
    expect(world.quests.some((s) => s.world_quest_id === "sunken_barrow")).toBe(true);
    expect(world.quests.some((s) => s.world_quest_id === "breaking_weir")).toBe(true);
  });
});

describe("load_quest / validate_quest report RPG mode for world quests", () => {
  it("the default RPG quest loads and validates green", () => {
    const r = api().load_quest({ world_quest_id: "breaking_weir" });
    expect(r.ok).toBe(true);
    expect("pack_path" in r).toBe(false);
    expect(r.mode).toBe("rpg");
    expect(r.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("RPG pack plays through the structured tool API", () => {
  it("can reach the wight and ATTACK via the legal-action set", () => {
    const a = api();
    const game = a.start_world_quest({ quest_id: RPG_WORLD_QUEST_ID });
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
