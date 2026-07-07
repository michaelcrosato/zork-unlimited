/**
 * MCP RPG catalog contract.
 *
 * The tool API rejects older pack shapes and steers blind/AFK discovery only to
 * the consolidated RPG surface.
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { RpgSourceRuntime } from "../../src/mcp/rpg_source_runtime.js";
import { loadOverworldManifest } from "../../src/world/source.js";
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

describe("the New York overworld is the single RPG quest registry", () => {
  it("discovers exactly the shipped quests, keyed by the overworld quest registry", () => {
    const sources = new RpgSourceRuntime(ROOT).discoverWorldQuestSources();
    const overworldQuestIds = loadOverworldManifest(ROOT)
      .quests.map((quest) => quest.id)
      .sort();
    expect(overworldQuestIds).toHaveLength(11);
    expect(sources).toHaveLength(overworldQuestIds.length);
    expect(sources.map((source) => source.world_quest_id)).toEqual(overworldQuestIds);
    expect(sources.every((source) => source.world_quest_id !== null)).toBe(true);
    expect(sources.every((source) => typeof source.playable === "boolean")).toBe(true);
    expect(sources.every((source) => !("path" in source))).toBe(true);
    expect(sources.every((source) => !("id" in source))).toBe(true);
    expect(sources.some((source) => source.world_quest_id === "sunken_barrow")).toBe(true);
    expect(sources.some((source) => source.world_quest_id === "breaking_weir")).toBe(true);
  });

  it("has no retired story catalog or Charter-Marches world/quest-menu tools", () => {
    const a = api() as unknown as Record<string, unknown>;
    expect(a.list_stories).toBeUndefined();
    expect(a.list_world).toBeUndefined();
    expect(a.world_path).toBeUndefined();
    const breaking = new RpgSourceRuntime(ROOT)
      .discoverWorldQuestSources()
      .find((source) => source.world_quest_id === "breaking_weir");
    expect(breaking?.title).toBe("The Breaking Weir");
    expect(breaking?.playable).toBe(true);
    // Shipped packs carry no world binding: the overworld frames every quest locally.
    expect(breaking?.world).toBeNull();
  });
});

describe("load_quest / validate_quest use RPG-only world quest ids", () => {
  it("the default RPG quest loads and validates green", () => {
    const r = api().load_quest({ world_quest_id: "breaking_weir" });
    expect(r.ok).toBe(true);
    expect("pack_path" in r).toBe(false);
    expect("mode" in r).toBe(false);
    expect(r.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("RPG pack plays through the structured tool API", () => {
  it("can reach the wight and ATTACK via the legal-action set", () => {
    const a = api();
    const game = a.start_world_quest({
      world_quest_id: RPG_WORLD_QUEST_ID,
      compact_observation: false,
    });
    expect("mode" in game).toBe(false);
    expect(game.observation.mode).toBe("rpg");
    if (game.observation.mode !== "rpg") return;
    expect(game.observation.stats.hp).toBeGreaterThan(0);

    const byCmd = (sid: string, needle: string): string | undefined =>
      (
        a.list_legal_actions({ session_id: sid, compact_actions: false }).actions as {
          id: string;
          command: string;
        }[]
      ).find((x) => x.command.includes(needle))?.id;

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
    const r = a.step_action({
      session_id: game.session_id,
      action_id: attackId!,
      compact_events: false,
    });
    expect(r.ok).toBe(true);
    expect(r.events.some((e) => e.type === "narration" && /strike/i.test(e.text))).toBe(true);
  });
});
