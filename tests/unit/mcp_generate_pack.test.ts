/**
 * The `generate_pack` MCP tool + `new_game(generate_seed)` seam (bug_0157) — the MCP slice
 * of "evolve the eval distribution" (docs/CURRENT_PLAN.md, the deferred next slice named by
 * bug_0156's generator docstring). It exposes the procedural CYOA generator
 * (src/gen/cyoa_generator.ts) through the agent-facing MCP surface so a FRESH, never-authored
 * pack can be minted, validated against the SAME gate the curated packs clear, and PLAYED —
 * the credible demonstration that the verifier faces a moving target, not a frozen set.
 *
 * These tests hold the MCP path to the same bar the generator's own unit test holds the core
 * to, reusing the production handlers (createToolApi), no weaker MCP-specific substitute:
 *   1. generate_pack MINTS + VALIDATES — a minted pack is reported playable (validator-clean)
 *      with the schema-stamped id/hash, never weaker than a shipped pack.
 *   2. DETERMINISM (§8.5) carries through the tool — same seed ⇒ identical content hash + meta.
 *   3. new_game(generate_seed) genuinely PLAYS the minted pack through the live engine, and the
 *      knowledge gate is load-bearing on that live surface: the gated `best` act is ABSENT at the
 *      pristine hub and PRESENT only after the personal investigation sets its flag, ending at
 *      `ending_best` (the bug_0169 two-axis 2x2 shape; was the single-axis `act_on_truth`).
 *   4. The seam is read-only and well-guarded: new_game with neither pack_path nor generate_seed
 *      errors; an invalid mint would refuse to play (the generator can't emit one, so this is the
 *      contract, asserted via the determinism/validator-clean guarantees above).
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { generateCyoaPack } from "../../src/gen/cyoa_generator.js";
import { hashState } from "../../src/core/hash.js";

const ROOT = process.cwd();
const api = () => createToolApi({ root: ROOT });

describe("bug_0157 — generate_pack MCP tool mints + validates a fresh pack", () => {
  it("mints a validator-clean pack carrying the schema-stamped id and hash", () => {
    const r = api().generate_pack({ seed: 0 });
    expect(r.ok).toBe(true);
    expect(r.report.ok).toBe(true);
    expect(r.report.findings).toEqual([]); // clean of ANY severity, like a shipped pack
    expect(r.mode).toBe("cyoa");
    expect(r.pack_id).toBe("gen_0_v1");
    expect(r.meta.id).toBe("gen_0_v1");
    expect(r.content_hash).toMatch(/^[0-9a-f]{64}$/);
    // A genuine fork: at least three endings (hold + gated best + dark) and the four scenes
    // (hub + the two investigation scenes + the v3 reckoning depth scene — bug_0169 two-axis
    // shape deepened by bug_0219).
    expect(r.ending_count).toBeGreaterThanOrEqual(3);
    expect(r.scene_count).toBe(4);
    // The reported hash is exactly the compiled-pack hash (no drift between mint and report).
    expect(r.content_hash).toBe(hashState(generateCyoaPack(0)));
  });

  it("is deterministic through the tool: same seed ⇒ identical hash + meta", () => {
    const a = api().generate_pack({ seed: 7 });
    const b = api().generate_pack({ seed: 7 });
    expect(a.content_hash).toBe(b.content_hash);
    expect(a.meta).toEqual(b.meta);
  });

  it("distinct seeds (different themes) mint distinct packs", () => {
    const a = api().generate_pack({ seed: 0 });
    const b = api().generate_pack({ seed: 1 });
    expect(a.content_hash).not.toBe(b.content_hash);
  });

  it("validates clean across a spread of seeds (the whole emitted distribution)", () => {
    for (const seed of [0, 1, 2, 3, 4, 5, 11, 23]) {
      const r = api().generate_pack({ seed });
      expect(
        r.ok,
        `seed ${seed} not playable: ${r.report.findings.map((f) => f.code).join(",")}`,
      ).toBe(true);
    }
  });
});

describe("bug_0157 — new_game(generate_seed) plays a fresh minted pack in-memory", () => {
  it("starts a session on a generated pack with no file on disk", () => {
    const g = api().new_game({ generate_seed: 0 });
    expect(g.mode).toBe("cyoa");
    expect(g.observation.ended).toBe(false);
    expect(g.state_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the depth-3 gate is load-bearing on the live play surface: learn_ally → learn → go_reckon → commit → best → ending_best", () => {
    const a = api();
    const g = a.new_game({ generate_seed: 0 });
    const sid = g.session_id;

    // Pristine hub: the gated `best` act is NOT offered yet; both investigations ARE.
    const hubIds = g.observation.available_actions.map((x) => x.id);
    expect(hubIds).not.toContain("best");
    expect(hubIds).toContain("learn_way");
    expect(hubIds).toContain("learn_ally");

    // Hear out the maligned figure (the PERSONAL axis), believe them, return to the hub.
    a.step_action({ session_id: sid, action_id: "learn_ally" });
    a.step_action({ session_id: sid, action_id: "learn" });
    const afterAlly = a
      .get_observation({ session_id: sid })
      .observation.available_actions.map((x) => x.id);
    // v3 (bug_0219): hearing the ally no longer offers `best` directly — it offers the reckoning
    // depth tier (`go_reckon`); `best` stays gated on the deeper `resolved` flag.
    expect(afterAlly).not.toContain("best");
    expect(afterAlly).toContain("go_reckon");
    expect(afterAlly).not.toContain("learn_ally");

    // Step into the reckoning and commit (sets `resolved`), then return to the hub.
    a.step_action({ session_id: sid, action_id: "go_reckon" });
    a.step_action({ session_id: sid, action_id: "commit" });
    const resolvedIds = a
      .get_observation({ session_id: sid })
      .observation.available_actions.map((x) => x.id);
    // Only NOW is the best act offered, and the spent depth tier is gone.
    expect(resolvedIds).toContain("best");
    expect(resolvedIds).not.toContain("go_reckon");

    // Take the depth-gated best ending.
    const end = a.step_action({ session_id: sid, action_id: "best" });
    expect(end.ok).toBe(true);
    expect(end.observation.ended).toBe(true);
    expect(end.observation.mode === "cyoa" && end.observation.ending_id).toBe("ending_best");
  });

  it("a plainly-labelled act reaches its own ending without ever learning anything", () => {
    const a = api();
    const g = a.new_game({ generate_seed: 0 });
    const end = a.step_action({ session_id: g.session_id, action_id: "hold" });
    expect(end.observation.ended).toBe(true);
    expect(end.observation.mode === "cyoa" && end.observation.ending_id).toBe("ending_hold");
  });

  it("new_game with no pack source errors clearly", () => {
    // The message now names all four sources (generate_parser_seed added in bug_0192).
    expect(() => api().new_game({})).toThrow(
      /pack_path, generate_seed, generate_rpg_seed, or generate_parser_seed/,
    );
  });
});
