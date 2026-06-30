/**
 * Regression (§15) for bug_0137 — engine/benchmark: the agent-facing observation
 * gains an opt-in `hide_graph` difficulty (ULTRAPLAN 2026-06-02 §Week.4). Today the
 * structured API hands the agent the full room adjacency — every RPG exit
 * carries its destination (`exit.to`) — so the spatial-reasoning task that
 * TALES/Jericho measure is trivialized: the map is read off, not reasoned out. With
 * `hide_graph: true` each exit reports only its `direction`; the destination is
 * hidden until the agent actually moves there. The legal MOVE action and the
 * engine's resolution are untouched, so the game stays fully playable — you still
 * know you CAN go north, just not where north leads.
 *
 * The feature is strictly ADDITIVE and DEFAULT-OFF: with no flag the observation is
 * byte-identical to the legacy shape (full graph), so the internal coverage bot and
 * every existing consumer are unaffected (that bot never sets hide_graph, so it
 * keeps the destinations it needs to plan — exactly the plan's "kept for the
 * internal coverage bot").
 *
 * Locked here:
 *   (1) DEFAULT: RPG exits carry a string `to` (legacy full-graph view);
 *   (2) HIDDEN: with hide_graph every exit's `to` is absent while the SAME set of
 *       directions remains — only the destination is hidden, never the exit's
 *       existence;
 *   (3) PLAYABLE: a MOVE under hide_graph still relocates the player correctly (the
 *       engine resolves the destination the observation no longer shows);
 *   (4) STATE UNTOUCHED: hide_graph changes only the rendered observation, never the
 *       state — the state_hash is identical with and without it (determinism/replay
 *       safe, as narration/observation are not part of the state hash);
 *   (5) LEGACY REJECTION: CYOA/parser packs are migration data and no longer start
 *       through MCP play tools;
 *   (6) the `start_game` AFK alias honors the flag too.
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";

const ROOT = process.cwd();
const api = () => createToolApi({ root: ROOT });

const LEGACY_CYOA = "content/cyoa/pack/watchtower_road.yaml";
const LEGACY_PARSER = "content/parser/pack/sealed_crypt.yaml";
const RPG_PACKS = ["content/rpg/pack/sunken_barrow.yaml", "content/rpg/pack/breaking_weir.yaml"];

/** Narrow to the RPG observation shape. */
function exitsOf(obs: unknown): { direction: string; to?: string }[] {
  const o = obs as { mode: string; exits?: { direction: string; to?: string }[] };
  if (o.mode !== "rpg") throw new Error("expected RPG observation");
  return o.exits ?? [];
}

describe("bug_0137 — hide_graph difficulty: exits hide their destination", () => {
  for (const pack of RPG_PACKS) {
    it(`${pack}: DEFAULT exits carry a string destination (full graph, legacy)`, () => {
      const g = api().new_game({ pack_path: pack });
      const exits = exitsOf(g.observation);
      expect(exits.length).toBeGreaterThan(0);
      for (const e of exits) {
        expect(typeof e.direction).toBe("string");
        expect(typeof e.to).toBe("string"); // destination present by default
      }
    });

    it(`${pack}: HIDDEN drops every exit's destination but keeps the same directions`, () => {
      const a = api();
      const open = exitsOf(a.new_game({ pack_path: pack }).observation);
      const hidden = exitsOf(a.new_game({ pack_path: pack, hide_graph: true }).observation);
      // Same exits exist (you still see you CAN go each direction)…
      expect(hidden.map((e) => e.direction)).toEqual(open.map((e) => e.direction));
      // …but no destination is leaked.
      for (const e of hidden) expect(e.to).toBeUndefined();
      // And the default view genuinely DID carry destinations (guards a vacuous pass).
      expect(open.some((e) => typeof e.to === "string")).toBe(true);
    });

    it(`${pack}: hide_graph is observation-only — the state_hash is identical`, () => {
      const a = api();
      const open = a.new_game({ pack_path: pack });
      const hidden = a.new_game({ pack_path: pack, hide_graph: true });
      expect(hidden.state_hash).toBe(open.state_hash);
    });

    it(`${pack}: still playable under hide_graph — a MOVE relocates the player`, () => {
      const a = api();
      const g = a.new_game({ pack_path: pack, hide_graph: true });
      const before = exitsOf(g.observation);
      const startRoom = (g.observation as { room: string }).room;
      // Take the first available MOVE action (its destination is hidden from us).
      const moveAction = g.observation.available_actions.find(
        (act) => act.id.startsWith("go_") || act.command.startsWith("go "),
      );
      expect(moveAction).toBeDefined();
      const r = a.step_action({ session_id: g.session_id, action_id: moveAction!.id });
      expect(r.ok).toBe(true);
      const afterRoom = (r.observation as { room: string }).room;
      // The engine resolved the destination the observation never showed us.
      expect(afterRoom).not.toBe(startRoom);
      // The new room's exits are still graph-hidden (the flag persists on the session).
      expect(before.every((e) => e.to === undefined)).toBe(true);
      for (const e of exitsOf(r.observation)) expect(e.to).toBeUndefined();
    });
  }

  it("legacy CYOA/parser packs are rejected by MCP play tools", () => {
    const a = api();
    expect(() => a.new_game({ pack_path: LEGACY_CYOA, seed: 7 })).toThrow(
      /UNSUPPORTED_LEGACY_PACK/,
    );
    expect(() => a.new_game({ pack_path: LEGACY_PARSER, seed: 7 })).toThrow(
      /UNSUPPORTED_LEGACY_PACK/,
    );
  });

  it("start_game alias honors hide_graph", () => {
    const a = api();
    const g = a.start_game({ story_path: RPG_PACKS[0]!, hide_graph: true });
    for (const e of exitsOf(g.observation)) expect(e.to).toBeUndefined();
    // And without the flag the alias keeps the full graph.
    const plain = a.start_game({ story_path: RPG_PACKS[0]! });
    expect(exitsOf(plain.observation).some((e) => typeof e.to === "string")).toBe(true);
  });
});
