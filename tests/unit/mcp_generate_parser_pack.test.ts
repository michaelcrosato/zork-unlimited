/**
 * The `generate_parser_pack` MCP tool + `new_game(generate_parser_seed)` seam — the THIRD and final
 * mode of "evolve the eval distribution" through the agent-facing MCP surface, closing the authoring
 * ASYMMETRY: `generate_pack` (CYOA, bug_0157) and `generate_rpg_pack` (RPG, bug_0160) were exposed,
 * but the parser generator (src/gen/parser_generator.ts) — already minted by the AFK assessor
 * (src/afk/assessor.ts:843) — had NO MCP tool, so an agent could mint+play fresh CYOA and RPG packs
 * but never a fresh PARSER pack. This exposes it through the SAME seam so a fresh, never-authored
 * parser pack can be minted, validated against the SAME `validateParser` gate the curated parser
 * packs clear, and PLAYED — extending the moving-target property to the PARSER-only verifier surfaces
 * (depth-2 obtainability / soft-lock, the moral same-key fork) which the CYOA and RPG generators never
 * touch and which until now ran only against the FROZEN hand-authored parser packs.
 *
 * These tests hold the MCP path to the same bar the generator's own unit test (parser_generator.test.ts)
 * holds the core to, reusing the production handlers (createToolApi), no weaker MCP-specific substitute:
 *   1. generate_parser_pack MINTS + VALIDATES — a minted pack is reported playable (validateParser-clean,
 *      zero findings of ANY severity) with the schema-stamped id/hash, never weaker than a shipped pack.
 *   2. DETERMINISM (§8.5) carries through the tool — same seed ⇒ identical content hash + meta.
 *   3. new_game(generate_parser_seed) genuinely PLAYS the minted pack through the live engine, and the
 *      flag-gated exit is load-bearing on that live surface: from the hub the way ON (north, to the goal)
 *      is GATED on the gate flag — ABSENT while the gate stands locked — while the way back (south) is
 *      open, exactly the depth-2 chain the parser validator proves obtainable.
 *   4. The seam is read-only and well-guarded: new_game with no pack source errors clearly, and the
 *      error now names generate_parser_seed (the seam is discoverable from the failure).
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { generateParserPack } from "../../src/gen/parser_generator.js";
import { hashState } from "../../src/core/hash.js";

const ROOT = process.cwd();
const api = () => createToolApi({ root: ROOT });

describe("generate_parser_pack MCP tool mints + validates a fresh parser pack", () => {
  it("mints a validateParser-clean pack carrying the schema-stamped id and hash", () => {
    const r = api().generate_parser_pack({ seed: 0 });
    expect(r.ok).toBe(true);
    expect(r.report.ok).toBe(true);
    expect(r.report.findings).toEqual([]); // clean of ANY severity, like a shipped parser pack
    expect(r.mode).toBe("parser");
    expect(r.pack_id).toBe("genpar_0_v1");
    expect(r.meta.id).toBe("genpar_0_v1");
    expect(r.content_hash).toMatch(/^[0-9a-f]{64}$/);
    // The three-room spine (entrance → hub → goal), seven objects (clue, coffer, lesser key,
    // strongbox, great key, gate, hazard), two endings (the win + the telegraphed death fork).
    expect(r.room_count).toBe(3);
    expect(r.object_count).toBe(7);
    expect(r.ending_count).toBe(2);
    expect(r.meta.max_score).toBe(15);
    // The reported hash is exactly the compiled-pack hash (no drift between mint and report).
    expect(r.content_hash).toBe(hashState(generateParserPack(0)));
  });

  it("is deterministic through the tool: same seed ⇒ identical hash + meta", () => {
    const a = api().generate_parser_pack({ seed: 7 });
    const b = api().generate_parser_pack({ seed: 7 });
    expect(a.content_hash).toBe(b.content_hash);
    expect(a.meta).toEqual(b.meta);
  });

  it("distinct seeds (different themes) mint distinct packs", () => {
    const a = api().generate_parser_pack({ seed: 0 });
    const b = api().generate_parser_pack({ seed: 1 });
    expect(a.content_hash).not.toBe(b.content_hash);
  });

  it("validates clean across a spread of seeds (the whole emitted distribution)", () => {
    for (const seed of [0, 1, 2, 3, 4, 5, 11, 23]) {
      const r = api().generate_parser_pack({ seed });
      expect(
        r.ok,
        `seed ${seed} not playable: ${r.report.findings.map((f) => f.code).join(",")}`,
      ).toBe(true);
    }
  });
});

describe("new_game(generate_parser_seed) plays a fresh minted parser pack in-memory", () => {
  it("starts a session on a generated parser pack with no file on disk", () => {
    const g = api().new_game({ generate_parser_seed: 3 });
    expect(g.mode).toBe("parser");
    expect(g.observation.ended).toBe(false);
    expect(g.state_hash).toMatch(/^[0-9a-f]{64}$/);
    // The threshold offers the only way on — north into the hub.
    expect(g.observation.available_actions.map((x) => x.id)).toContain("go_north");
  });

  it("the flag-gated exit is load-bearing on the live surface: the goal is sealed until the gate opens", () => {
    const a = api();
    const g = a.new_game({ generate_parser_seed: 3 });
    const sid = g.session_id;

    // Step from the threshold north into the inner chamber (the hub).
    a.step_action({ session_id: sid, action_id: "go_north" });
    const hub = a.get_observation({ session_id: sid }).observation;
    const ids = hub.available_actions.map((x) => x.id);

    // The way back (south, to the threshold) is open...
    expect(ids).toContain("go_south");
    // ...and the way ON (north, to the goal) is GATED on the gate flag: absent while it stands locked.
    expect(ids).not.toContain("go_north");
    // The locked gate object is present here (the depth-2 chain's last link) — examinable now,
    // unlockable only once the great key is in hand.
    expect(ids).toContain("examine_gate");
  });

  it("new_game with no pack source errors clearly, naming the generate_parser_seed seam", () => {
    expect(() => api().new_game({})).toThrow(
      /pack_path, generate_seed, generate_rpg_seed, or generate_parser_seed/,
    );
  });
});
