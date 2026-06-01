import { describe, it, expect, beforeAll } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { createToolApi } from "../../src/mcp/tools.js";
import { PathEscapeError } from "../../src/mcp/paths.js";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { recordTrace } from "../../src/trace/record.js";

const ROOT = process.cwd();
const PACK = "content/cyoa/pack/watchtower_road.yaml";
const api = () => createToolApi({ root: ROOT });

describe("MCP tools — validate / load (§9.4)", () => {
  it("lists story packs for AFK discovery", () => {
    const r = api().list_stories();
    expect(r.main_story).toBe(PACK);
    expect(r.stories.some((s) => s.path === PACK && s.playable)).toBe(true);
  });

  it("validate_pack reports the shipped pack as green", () => {
    const r = api().validate_pack({ pack_path: PACK });
    expect(r.ok).toBe(true);
    expect(r.report.findings.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("validate_story is an AFK-compatible alias", () => {
    const r = api().validate_story({ story_path: PACK });
    expect(r.ok).toBe(true);
  });

  it("load_pack returns meta + content hash", () => {
    const r = api().load_pack({ pack_path: PACK });
    expect(r.ok).toBe(true);
    expect(r.meta?.id).toBe("watchtower_road_v1");
    expect(r.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("adapt_story authors a green CYOA pack from a premise (§12.1–3)", async () => {
    const r = await api().adapt_story({ premise: "A keeper relights a dead lighthouse." });
    expect(r.ok).toBe(true);
    expect(r.report.ok).toBe(true);
    expect(r.pack?.meta.id).toBe("lighthouse_v1");
    expect(r.classifications.length).toBeGreaterThanOrEqual(3);
  });

  it("validate_pack on a broken fixture surfaces an error", () => {
    const r = api().validate_pack({ pack_path: "content/broken-fixtures/softlock.yaml" });
    expect(r.ok).toBe(false);
    expect(r.report.findings.map((f) => f.code)).toContain("SOFTLOCK");
  });
});

describe("MCP tools — the play loop (§9.1)", () => {
  it("AFK aliases can play and transcript a route", () => {
    const a = api();
    const game = a.start_game({ story_path: PACK, seed: 7 });
    expect(game.observation.scene_id).toBe("forest_crossroads");
    expect(a.get_scene({ session_id: game.session_id }).observation.available_actions.length).toBeGreaterThan(0);

    const route = ["go_west", "ford_brook", "cross_north", "slip_into_woods", "slip_away"];
    let last;
    for (const option_id of route) {
      last = a.choose_option({ session_id: game.session_id, option_id });
      expect(last.ok).toBe(true);
    }
    expect(last!.observation.ending_id).toBe("ending_escape");
    const transcript = a.get_transcript({ session_id: game.session_id });
    expect(transcript.summary.ended).toBe(true);
    expect(transcript.summary.ending_id).toBe("ending_escape");
    expect(transcript.turns.map((t) => t.action_id)).toContain("slip_away");
    expect(a.get_state({ session_id: game.session_id }).state_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("run_playtest summarizes random and coverage evidence", () => {
    const a = api();
    const random = a.run_playtest({ story_path: PACK, strategy: "random", runs: 10 });
    const coverage = a.run_playtest({ story_path: PACK, strategy: "coverage", runs: 10 });
    expect(random.runs).toBe(10);
    expect(coverage.runs).toBe(10);
    expect(random.visited_scenes.length).toBeGreaterThan(0);
    expect(coverage.endings_declared).toContain("ending_truth");
  });

  it("an agent can play a whole game via observe → choose → step", () => {
    const a = api();
    const game = a.new_game({ pack_path: PACK, seed: 5 });
    expect(game.session_id).toBe("sess_1");
    expect(game.observation.available_actions.map((x) => x.id)).toContain("go_west");

    // Drive the shortest escape route turn by turn.
    const route = ["go_west", "ford_brook", "cross_north", "slip_into_woods", "slip_away"];
    let last;
    for (const action_id of route) {
      last = a.step_action({ session_id: game.session_id, action_id });
      expect(last.ok).toBe(true);
    }
    expect(last!.observation.ended).toBe(true);
    expect(last!.observation.ending_id).toBe("ending_escape");
    expect(a.list_legal_actions({ session_id: game.session_id }).actions).toEqual([]);
  });

  it("step_action rejects an illegal action without changing state", () => {
    const a = api();
    const game = a.new_game({ pack_path: PACK });
    const before = a.get_observation({ session_id: game.session_id }).state_hash;
    const r = a.step_action({ session_id: game.session_id, action_id: "not_a_real_choice" });
    expect(r.ok).toBe(false);
    expect(r.rejection_reason).toBeTruthy();
    expect(r.state_hash).toBe(before);
  });

  it("refuses to start a game on an unplayable pack", () => {
    expect(() => api().new_game({ pack_path: "content/broken-fixtures/softlock.yaml" })).toThrow(/not playable/i);
  });
});

describe("MCP tools — save / load round-trip (§8.7)", () => {
  it("a saved game reloads to the identical state hash", () => {
    const a = api();
    const game = a.new_game({ pack_path: PACK, seed: 3 });
    a.step_action({ session_id: game.session_id, action_id: "go_east" });
    const after = a.get_observation({ session_id: game.session_id }).state_hash;

    const saved = a.save_game({ session_id: game.session_id });
    const reloaded = a.load_game({ pack_path: PACK, save: saved.save });
    expect(reloaded.state_hash).toBe(after);
  });
});

describe("MCP tools — replay + path confinement", () => {
  beforeAll(() => {
    // Record a trace to disk for replay_trace to read.
    const compiled = loadPackFile(PACK);
    if (!compiled.ok) throw new Error("pack must compile");
    const index = indexPack(compiled.compiled.pack);
    const rules = buildRules(index);
    const actions = ["go_west", "ford_brook", "cross_north", "slip_into_woods", "slip_away"].map(
      (id) => ({ type: "CHOOSE" as const, choiceId: id }),
    );
    const trace = recordTrace(rules, initStateForPack(index, 1), actions, {
      trace_id: "tr_mcp",
      pack_id: compiled.compiled.pack.meta.id,
      content_hash: compiled.compiled.contentHash,
    });
    mkdirSync("traces", { recursive: true });
    writeFileSync("traces/mcp_replay.json", JSON.stringify(trace));
  });

  it("replay_trace reproduces the recorded final hash", () => {
    const r = api().replay_trace({ trace_path: "traces/mcp_replay.json", pack_path: PACK });
    expect(r.ok).toBe(true);
  });

  it("inspect_trace summarizes steps and finds no failure on a winning route (§9.4)", () => {
    const r = api().inspect_trace({ trace_path: "traces/mcp_replay.json", pack_path: PACK }) as {
      ok: boolean;
      hash_ok: boolean;
      steps: number;
      diagnosis: { type: string };
      step_summary: { ended: boolean; ending_id: string | null }[];
    };
    expect(r.ok).toBe(true);
    expect(r.hash_ok).toBe(true);
    expect(r.steps).toBe(5);
    expect(r.diagnosis.type).toBe("no_failure");
    expect(r.step_summary.at(-1)?.ending_id).toBe("ending_escape");
  });

  it("rejects a path that escapes the project root", () => {
    expect(() => api().validate_pack({ pack_path: "../../../etc/passwd" })).toThrow(PathEscapeError);
  });
});

describe("MCP tools — apply_content_patch (§9.4, §16)", () => {
  it("applies a whitelisted hint patch and re-validates green", () => {
    const r = api().apply_content_patch({
      pack_path: "content/parser/pack/sealed_crypt.yaml",
      proposal: {
        layer: "hint_text",
        mode: "parser",
        summary: "signpost the start room",
        ops: [{ op: "add_room_journal_hint", room: "forest_path", text: "Fresh bootprints lead toward the chapel." }],
      } as never,
    }) as { ok: boolean; report: { ok: boolean } };
    expect(r.ok).toBe(true);
    expect(r.report.ok).toBe(true);
  });

  it("refuses a patch whose target is missing (no file written)", () => {
    const r = api().apply_content_patch({
      pack_path: "content/parser/pack/sealed_crypt.yaml",
      proposal: { layer: "content", mode: "parser", summary: "x", ops: [{ op: "set_object_field", id: "ghost", field: "takeable", value: true }] } as never,
    }) as { ok: boolean; report: { findings: { code: string }[] } };
    expect(r.ok).toBe(false);
    expect(r.report.findings[0]?.code).toBe("PATCH_TARGET_MISSING");
  });
});
