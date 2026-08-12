/**
 * Regression for the Wolf-Winter blind finding: compact observations exposed
 * only `houndsman`, leaving players to infer that the action meant old Cade.
 */
import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";

const ROOT = process.cwd();

describe("Wolf-Winter compact NPC identity", () => {
  it("pairs talk_houndsman with old Cade's display name", () => {
    const api = createToolApi({ root: ROOT });
    const started = api.start_world_quest({
      world_quest_id: "wolf_winter",
      seed: 4662,
      hide_graph: true,
      compact_observation: true,
      include_actions: true,
    });
    const enteredByre = api.step_action({
      session_id: started.session_id,
      action_id: "go_north",
      expected_state_hash: started.state_hash,
      compact_observation: true,
      include_actions: true,
    });

    expect(enteredByre.ok).toBe(true);
    if (!enteredByre.ok) throw new Error("expected the Wolf-Winter byre to be reachable");
    expect(enteredByre.context.actions).toContain("talk_houndsman");
    expect(enteredByre.context.npcs).toContainEqual(["houndsman", "old Cade the houndsman"]);
  });
});
