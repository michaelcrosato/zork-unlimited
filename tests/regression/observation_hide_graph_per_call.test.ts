/**
 * Regression (§15) for bug_0299 — engine/api-surface: per-call `hide_graph`
 * override on `get_observation`, `get_scene`, `list_legal_actions`,
 * `step_action`, and `choose_option`.
 *
 * Prior to this fix, `hide_graph` was a session-creation-time-only flag: once a
 * session was started the observation rendering mode was fixed. Per-call override
 * allows benchmark runners to compare hidden-graph vs. full-graph on the SAME
 * session trajectory without creating two sessions.
 *
 * Locked here:
 *   (1) OVERRIDE ON / SESSION OFF: a per-call `hide_graph: true` hides exits even
 *       when the session was created with `hide_graph: false` (or omitted);
 *   (2) OVERRIDE OFF / SESSION ON: a per-call `hide_graph: false` reveals exits
 *       even when the session was created with `hide_graph: true`;
 *   (3) OVERRIDE ABSENT / SESSION ON: omitting the per-call arg preserves the
 *       session default — exits remain hidden;
 *   (4) step_action PER-CALL: per-call override affects the returned observation
 *       but does NOT mutate the session — a subsequent get_observation with no
 *       override returns the session default (full graph);
 *   (5) list_legal_actions PER-CALL: per-call override is accepted and the call
 *       returns the same action ids as without the flag;
 *   (6) NON-VACUITY: in case (2) at least one exit carries a string `to` — the
 *       test cannot pass vacuously because exits are empty.
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";

const ROOT = process.cwd();
const api = () => createToolApi({ root: ROOT });

const PARSER = "content/parser/pack/sealed_crypt.yaml";

/** Narrow to the parser/RPG observation shape (both carry `exits`). */
function exitsOf(obs: unknown): { direction: string; to?: string }[] {
  const o = obs as { mode: string; exits?: { direction: string; to?: string }[] };
  if (o.mode === "cyoa") throw new Error("CYOA observation has no exits");
  return o.exits ?? [];
}

describe("bug_0299 — hide_graph per-call override on observation tools", () => {
  it("(1) override on, session off: get_observation hides exits", () => {
    const a = api();
    const g = a.new_game({ pack_path: PARSER }); // session default: hide_graph absent (false)
    const r = a.get_observation({ session_id: g.session_id, hide_graph: true });
    const exits = exitsOf(r.observation);
    expect(exits.length).toBeGreaterThan(0);
    for (const e of exits) {
      expect(e.to).toBeUndefined();
    }
  });

  it("(2) override off, session on: get_observation reveals exits", () => {
    const a = api();
    const g = a.new_game({ pack_path: PARSER, hide_graph: true }); // session default: hidden
    const r = a.get_observation({ session_id: g.session_id, hide_graph: false });
    const exits = exitsOf(r.observation);
    expect(exits.length).toBeGreaterThan(0);
    for (const e of exits) {
      expect(typeof e.to).toBe("string");
    }
  });

  it("(3) override absent, session on: session default preserved (exits hidden)", () => {
    const a = api();
    const g = a.new_game({ pack_path: PARSER, hide_graph: true }); // session default: hidden
    const r = a.get_observation({ session_id: g.session_id }); // no override
    const exits = exitsOf(r.observation);
    expect(exits.length).toBeGreaterThan(0);
    for (const e of exits) {
      expect(e.to).toBeUndefined();
    }
  });

  it("(4) step_action per-call: override affects returned observation but does NOT mutate session", () => {
    const a = api();
    const g = a.new_game({ pack_path: PARSER }); // session default: show graph
    // step_action with per-call hide_graph: true — returned observation should hide exits
    const moveAction = g.observation.available_actions.find(
      (act) => (act as { action: { type: string } }).action.type === "MOVE",
    );
    expect(moveAction).toBeDefined();
    const stepped = a.step_action({
      session_id: g.session_id,
      action_id: moveAction!.id,
      hide_graph: true,
    });
    expect(stepped.ok).toBe(true);
    // The returned observation should have hidden exits (per-call override applied)
    for (const e of exitsOf(stepped.observation)) {
      expect(e.to).toBeUndefined();
    }
    // Now call get_observation WITHOUT override — session default (show graph) should be preserved
    const plain = a.get_observation({ session_id: g.session_id });
    const plainExits = exitsOf(plain.observation);
    expect(plainExits.length).toBeGreaterThan(0);
    expect(plainExits.some((e) => typeof e.to === "string")).toBe(true);
  });

  it("(5) list_legal_actions per-call: call succeeds and returns same action ids", () => {
    const a = api();
    const g = a.new_game({ pack_path: PARSER }); // session default: show graph
    const withoutFlag = a.list_legal_actions({ session_id: g.session_id });
    const withFlag = a.list_legal_actions({ session_id: g.session_id, hide_graph: true });
    // Both calls should return the same action ids
    const ids1 = withoutFlag.actions.map((act) => act.id).sort();
    const ids2 = withFlag.actions.map((act) => act.id).sort();
    expect(ids2).toEqual(ids1);
    expect(ids1.length).toBeGreaterThan(0);
  });

  it("(6) non-vacuity: in override-off / session-on case exits genuinely carry destinations", () => {
    const a = api();
    const g = a.new_game({ pack_path: PARSER, hide_graph: true }); // session: hidden
    const r = a.get_observation({ session_id: g.session_id, hide_graph: false }); // override: show
    const exits = exitsOf(r.observation);
    // At least one exit must carry a string `to` — guards against vacuous pass with empty exits
    const hasStringTo = exits.some((e) => typeof e.to === "string");
    expect(hasStringTo).toBe(true);
  });
});
