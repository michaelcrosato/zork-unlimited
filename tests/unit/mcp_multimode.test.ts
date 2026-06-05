/**
 * MCP multi-mode dispatch (roadmap Milestone 1). Proves the tool API plays
 * parser and RPG packs end-to-end through the SAME handlers that serve CYOA — one
 * session abstraction, mode auto-detected from pack structure (§16: no mode field
 * in content). CYOA byte-identical behavior is covered by mcp_tools.test.ts; here
 * we cover the new parser/RPG paths and the mode discriminator.
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { detectMode } from "../../src/mcp/types.js";

const ROOT = process.cwd();
const api = () => createToolApi({ root: ROOT });
const CYOA = "content/cyoa/pack/watchtower_road.yaml";
const PARSER = "content/parser/pack/sealed_crypt.yaml";
const RPG = "content/rpg/pack/sunken_barrow.yaml";

describe("detectMode (by key presence, not array contents)", () => {
  it("rpg has enemies, parser has rooms, cyoa has neither", () => {
    expect(detectMode({ enemies: [], rooms: [] })).toBe("rpg"); // enemies:[] still rpg
    expect(detectMode({ rooms: [] })).toBe("parser");
    expect(detectMode({ scenes: [] })).toBe("cyoa");
    expect(detectMode(null)).toBe("cyoa");
  });
});

describe("list_stories spans all three modes", () => {
  it("discovers cyoa, parser, and rpg packs with their modes", () => {
    const { stories, main_story } = api().list_stories();
    const byPath = new Map(stories.map((s) => [s.path, s]));
    expect(byPath.get(CYOA)?.mode).toBe("cyoa");
    expect(byPath.get(PARSER)?.mode).toBe("parser");
    expect(byPath.get(RPG)?.mode).toBe("rpg");
    expect(stories.filter((s) => s.playable).length).toBeGreaterThanOrEqual(3);
    expect(main_story).toBe(CYOA); // watchtower remains the default
  });
});

describe("load_pack / validate_pack report the detected mode", () => {
  it("each pack loads with the right mode and validates green", () => {
    for (const [path, mode] of [
      [CYOA, "cyoa"],
      [PARSER, "parser"],
      [RPG, "rpg"],
    ] as const) {
      const r = api().load_pack({ pack_path: path });
      expect(r.ok).toBe(true);
      expect(r.mode).toBe(mode);
      expect(r.content_hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("parser pack plays through the structured tool API", () => {
  it("new_game → step_action navigates rooms via the legal-action set", () => {
    const a = api();
    const game = a.new_game({ pack_path: PARSER });
    expect(game.mode).toBe("parser");
    expect(game.observation.mode).toBe("parser");
    if (game.observation.mode !== "parser") return;
    // Parser actions carry id + command + structured action.
    const acts = a.list_legal_actions({ session_id: game.session_id }).actions as {
      id: string;
      command: string;
    }[];
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.every((x) => typeof x.command === "string")).toBe(true);
    // Move along a real exit (whatever the start room offers first).
    const move = acts.find((x) => x.id.startsWith("go_"));
    expect(move).toBeTruthy();
    const r = a.step_action({ session_id: game.session_id, action_id: move!.id });
    expect(r.ok).toBe(true);
    expect(r.observation.mode).toBe("parser");
  });

  it("rejects an action id that is not in the legal set without changing state", () => {
    const a = api();
    const game = a.new_game({ pack_path: PARSER });
    const before = a.get_observation({ session_id: game.session_id }).state_hash;
    const r = a.step_action({ session_id: game.session_id, action_id: "not_a_real_action" });
    expect(r.ok).toBe(false);
    expect(r.state_hash).toBe(before);
  });
});

describe("RPG pack plays through the structured tool API (incl. combat)", () => {
  it("can reach the wight and ATTACK via the legal-action set", () => {
    const a = api();
    const game = a.new_game({ pack_path: RPG });
    expect(game.mode).toBe("rpg");
    expect(game.observation.mode).toBe("rpg");
    if (game.observation.mode !== "rpg") return;
    expect(game.observation.stats.hp).toBeGreaterThan(0);

    // down → take iron bar → north → the wight stands in the guard crypt.
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
    // A combat round narrates a strike.
    expect(r.events.some((e) => e.type === "narration" && /strike/i.test(e.text))).toBe(true);
  });
});

describe("save/load is mode-bound (§8.7)", () => {
  it("a parser save reloads against the same pack to an identical hash", () => {
    const a = api();
    const game = a.new_game({ pack_path: PARSER });
    const acts = a.list_legal_actions({ session_id: game.session_id }).actions as { id: string }[];
    a.step_action({
      session_id: game.session_id,
      action_id: acts.find((x) => x.id.startsWith("go_"))!.id,
    });
    const after = a.get_observation({ session_id: game.session_id }).state_hash;
    const saved = a.save_game({ session_id: game.session_id });
    expect(saved.mode).toBe("parser");
    const reloaded = a.load_game({ pack_path: PARSER, save: saved.save });
    expect(reloaded.mode).toBe("parser");
    expect(reloaded.state_hash).toBe(after);
  });

  it("refuses to load a parser save against a different-mode (rpg) pack", () => {
    const a = api();
    const game = a.new_game({ pack_path: PARSER });
    const saved = a.save_game({ session_id: game.session_id });
    // Content-hash differs first, but mode binding is the belt-and-suspenders guard.
    expect(() => a.load_game({ pack_path: RPG, save: saved.save })).toThrow();
  });
});
