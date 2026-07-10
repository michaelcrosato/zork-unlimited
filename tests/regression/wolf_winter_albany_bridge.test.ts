/**
 * Wolf-Winter bridge polish from the 2026-07-08 fresh-overworld blind batch:
 * players understood Albany mechanically, then read the quest start as a hard
 * cut into an unrelated mythic steading. The pack keeps its mechanics and score
 * economy, but the opening now carries the Albany relief packet into the first
 * room before the byre crisis takes over.
 */
import { describe, expect, it } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const pack = loaded.compiled.pack;

describe("Wolf-Winter Albany bridge", () => {
  it("starts from Albany's relief packet instead of an unexplained steading role", () => {
    const start = pack.rooms.find((room) => room.id === "steading_yard");
    expect(start, "steading_yard must exist").toBeDefined();
    const text = start!.description;

    expect(text).toContain("Albany winter-relief packet");
    expect(text).toContain("hill road");
    expect(text).toContain("hunting-spear");
    expect(text.toLowerCase()).toContain("already");
    expect(text).not.toContain("yours by trade");
    expect(text).not.toContain("steading's hunter");
  });

  it("keeps Cade's first read aligned with the Albany relief-rider handoff", () => {
    const houndsman = pack.npcs.find((npc) => npc.id === "houndsman");
    expect(houndsman, "houndsman must exist").toBeDefined();
    const root = houndsman!.dialogue.nodes.find((node) => node.id === "cade_root");
    expect(root, "cade_root must exist").toBeDefined();

    expect(houndsman!.description).toContain("Albany's relief rider");
    expect(houndsman!.description).not.toContain("steading's hunter");
    expect(root!.npc_text).toContain("You came up from Albany awake");
    expect(root!.npc_text).not.toContain("You came down awake");
  });

  it("surfaces the bridge in the actual start_world_quest opening observation", () => {
    const api = createToolApi({ root: process.cwd() });
    const started = api.start_world_quest({
      world_quest_id: "wolf_winter",
      seed: 591,
      compact_observation: false,
      include_actions: false,
    });

    const text = started.observation.description;
    expect(text).toContain("Albany winter-relief packet");
    expect(text).toContain("hill road");
    expect(text).toContain("hunting-spear");
    expect(text.toLowerCase()).toContain("already");
  });
});
