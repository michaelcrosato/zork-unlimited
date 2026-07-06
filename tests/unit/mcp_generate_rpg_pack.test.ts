/**
 * The `generate_rpg_pack` MCP tool + `new_game(generate_rpg_seed)` seam is the
 * consolidated procedural generation surface. It exposes the procedural RPG
 * generator (src/gen/rpg_generator.ts) through MCP so a FRESH, never-authored RPG
 * pack can be minted, validated against the SAME gate the curated RPG packs clear,
 * and PLAYED.
 *
 * These tests hold the MCP path to the same bar the generator's own unit test (rpg_generator.test.ts)
 * holds the core to, reusing the production handlers (createToolApi), no weaker MCP-specific substitute:
 *   1. generate_rpg_pack MINTS + VALIDATES — a minted pack is reported playable (validateRpg-clean,
 *      zero findings of ANY severity) with schema-stamped meta/hash, never weaker than a shipped pack.
 *   2. DETERMINISM (§8.5) carries through the tool — same seed ⇒ identical content hash + meta.
 *   3. new_game(generate_rpg_seed) genuinely PLAYS the minted pack through the live engine, and the
 *      COMBAT gate is load-bearing on that live surface: the foe is present in the gallery and offers an
 *      `attack_foe` action, while the east exit out of the gallery (`go_east`) is gated on its defeat —
 *      ABSENT while the foe stands. The optional NPC's counsel applies a real, deterministic +2-attack
 *      buff (a dialogue effect that plays live), and combat/score validators saw the minted economy.
 *   4. The seam is read-only and well-guarded: new_game with no pack source errors clearly.
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { generateRpgPack } from "../../src/gen/rpg_generator.js";
import { hashState } from "../../src/core/hash.js";

const ROOT = process.cwd();
const api = () => createToolApi({ root: ROOT });

describe("bug_0160 — generate_rpg_pack MCP tool mints + validates a fresh RPG pack", () => {
  it("rejects unsafe integer seeds before minting", () => {
    expect(() => api().generate_rpg_pack({ seed: Number.MAX_SAFE_INTEGER + 1 })).toThrow(
      /safe range/,
    );
  });

  it("mints a validateRpg-clean pack carrying the schema-stamped id and hash", () => {
    const r = api().generate_rpg_pack({ seed: 0 });
    expect(r.ok).toBe(true);
    expect(r.report.ok).toBe(true);
    expect(r.report.findings).toEqual([]); // clean of ANY severity, like a shipped RPG pack
    expect("mode" in r).toBe(false);
    expect("pack_id" in r).toBe(false);
    expect(r.meta.id).toBe("genrpg_0_v1");
    expect(r.content_hash).toMatch(/^[0-9a-f]{64}$/);
    // The deepened hero's-descent shape (bug_0171): seven rooms, a TWO-fight gauntlet, three
    // endings (victory + a distinct death per guardian).
    expect(r.room_count).toBe(7);
    expect(r.enemy_count).toBe(2);
    expect(r.ending_count).toBe(3);
    // The declared max_score is the seed-chosen sum of the FOUR awards (each 10/15/20).
    expect(r.meta.max_score).toBeGreaterThanOrEqual(40);
    expect(r.meta.max_score).toBeLessThanOrEqual(80);
    // The reported hash is exactly the compiled-pack hash (no drift between mint and report).
    expect(r.content_hash).toBe(hashState(generateRpgPack(0)));
  });

  it("is deterministic through the tool: same seed ⇒ identical hash + meta", () => {
    const a = api().generate_rpg_pack({ seed: 7 });
    const b = api().generate_rpg_pack({ seed: 7 });
    expect(a.content_hash).toBe(b.content_hash);
    expect(a.meta).toEqual(b.meta);
  });

  it("distinct seeds (different themes) mint distinct packs", () => {
    const a = api().generate_rpg_pack({ seed: 0 });
    const b = api().generate_rpg_pack({ seed: 1 });
    expect(a.content_hash).not.toBe(b.content_hash);
  });

  it("validates clean across a spread of seeds (the whole emitted distribution)", () => {
    for (const seed of [0, 1, 2, 3, 4, 5, 11, 23]) {
      const r = api().generate_rpg_pack({ seed });
      expect(
        r.ok,
        `seed ${seed} not playable: ${r.report.findings.map((f) => f.code).join(",")}`,
      ).toBe(true);
    }
  });
});

describe("bug_0160 — new_game(generate_rpg_seed) plays a fresh minted RPG pack in-memory", () => {
  it("rejects unsafe generated RPG source identities before play starts", () => {
    expect(() => api().new_game({ generate_rpg_seed: Number.MAX_SAFE_INTEGER + 1 })).toThrow(
      /safe range/,
    );
  });

  it("starts a session on a generated RPG pack with no file on disk", () => {
    const g = api().new_game({ generate_rpg_seed: 3 });
    expect("mode" in g).toBe(false);
    expect("pack_path" in g).toBe(false);
    expect("world_quest_id" in g).toBe(false);
    expect(g.generated_rpg_seed).toBe(3);
    expect(g.observation.ended).toBe(false);
    expect(g.state_hash).toMatch(/^[0-9a-f]{64}$/);
    // Init stats from the generated meta.vars_init, surfaced live in the RPG observation.
    expect(g.observation.mode === "rpg" && g.observation.stats).toEqual({
      hp: 20,
      attack: 4,
      defense: 2,
    });
  });

  it("the combat gate is load-bearing on the live surface: the foe blocks the east exit until it falls", () => {
    const a = api();
    const g = a.new_game({ generate_rpg_seed: 3 });
    const sid = g.session_id;

    // Descend to the gallery where the guardian stands (entry → hall → gallery).
    a.step_action({ session_id: sid, action_id: "go_down" });
    a.step_action({ session_id: sid, action_id: "go_north" });
    const gallery = a.get_observation({ session_id: sid }).observation;
    if (gallery.mode !== "rpg") throw new Error("expected an RPG observation in the gallery");

    // The foe is present and attackable...
    expect(gallery.enemies_present.map((e) => e.id)).toContain("foe");
    const ids = gallery.available_actions.map((x) => x.id);
    expect(ids).toContain("attack_foe");
    // ...and the way deeper (east, toward the relic) is GATED on its defeat: absent while it stands.
    expect(ids).toContain("go_south"); // the open way back exists
    expect(ids).not.toContain("go_east"); // the gated way forward does not, by design
  });

  it("the optional NPC's counsel applies a real, deterministic +2-attack buff (a dialogue effect, live)", () => {
    const a = api();
    const g = a.new_game({ generate_rpg_seed: 3 });
    const sid = g.session_id;

    // Down to the hall, where the spirit waits.
    a.step_action({ session_id: sid, action_id: "go_down" });
    const hall = a.get_observation({ session_id: sid }).observation;
    if (hall.mode !== "rpg") throw new Error("expected an RPG observation in the hall");
    expect(hall.stats.attack).toBe(4); // base attack before any counsel
    expect(hall.available_actions.map((x) => x.id)).toContain("talk_spirit");

    // Talk, then ask how to beat the guardian — the node grants +2 attack on entry.
    a.step_action({ session_id: sid, action_id: "talk_spirit" });
    a.step_action({ session_id: sid, action_id: "ask_ask_foe" });
    const after = a.get_observation({ session_id: sid }).observation;
    if (after.mode !== "rpg") throw new Error("expected an RPG observation after the counsel");
    expect(after.stats.attack).toBe(6); // +2, applied live through the engine
  });

  it("new_game with no pack source errors clearly", () => {
    expect(() => api().new_game({})).toThrow(/requires generate_rpg_seed/);
  });

  it("new_game rejects shipped quest starts", () => {
    expect(() =>
      api().new_game({
        world_quest_id: "breaking_weir",
        generate_rpg_seed: 3,
      } as never),
    ).toThrow(/start_world_quest/);
  });

  it("generated RPG saves embed the generation seed and load without a pack path", () => {
    const a = api();
    const g = a.new_game({ generate_rpg_seed: 3, seed: 7 });
    const before = a.get_state({ session_id: g.session_id, include_state: true });
    const transcript = a.get_transcript({ session_id: g.session_id });
    expect("world_quest_id" in transcript).toBe(false);
    expect("generated_rpg_seed" in transcript).toBe(false);
    const sourcedTranscript = a.get_transcript({
      session_id: g.session_id,
      include_source: true,
    });
    expect("world_quest_id" in sourcedTranscript).toBe(false);
    expect(sourcedTranscript.generated_rpg_seed).toBe(3);
    const saved = a.save_game({ session_id: g.session_id });
    const raw = JSON.parse(saved.save) as {
      source_ref?: unknown;
      worldQuestId?: unknown;
      generatedRpgSeed?: unknown;
    };

    expect("pack_path" in saved).toBe(false);
    expect("world_quest_id" in saved).toBe(false);
    expect(saved.generated_rpg_seed).toBe(3);
    expect(raw.source_ref).toEqual(["gen", 3]);
    expect(raw.worldQuestId).toBeUndefined();
    expect(raw.generatedRpgSeed).toBeUndefined();

    const loaded = a.load_game({ save: saved.save });
    expect("pack_path" in loaded).toBe(false);
    expect("world_quest_id" in loaded).toBe(false);
    expect(loaded.generated_rpg_seed).toBe(3);
    expect(a.get_state({ session_id: loaded.session_id, include_state: true }).state).toEqual(
      before.state,
    );
  });

  it("generated RPG save source_ref mismatches are integrity errors", () => {
    const a = api();
    const g = a.new_game({ generate_rpg_seed: 3 });
    const saved = a.save_game({ session_id: g.session_id });

    expect(() => a.load_game({ save: saved.save, generate_rpg_seed: 4 })).toThrow(/source_ref/);
    expect(() => a.load_game({ save: saved.save, world_quest_id: "breaking_weir" })).toThrow(
      /source_ref/,
    );
  });
});
