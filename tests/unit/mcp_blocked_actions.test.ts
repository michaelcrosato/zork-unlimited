import { describe, expect, it } from "vitest";

import { suppressRpgGameplayActions } from "../../src/mcp/journey_projection.js";
import { createToolApi } from "../../src/mcp/tools.js";

const BLOCKED_ID = "use_meadowsweet_on_sick_edric";
const BLOCKED_COMMAND = "treat Edric with meadowsweet after ordering the evidence";
const BLOCKED_REASON =
  "Godwin will hear a corrected treatment only after all three proofs are established: inspect Edric, read his case notes, and inspect the meadowsweet in hand.";

function blockedTannersSession() {
  const api = createToolApi({ root: process.cwd() });
  const started = api.start_world_quest({ world_quest_id: "tanners_fever", seed: 2 });
  for (const actionId of ["go_east", "take_meadowsweet", "go_west", BLOCKED_ID]) {
    const stepped = api.step_action({ session_id: started.session_id, action_id: actionId });
    expect(stepped.ok).toBe(true);
  }
  return { api, sessionId: started.session_id };
}

describe("MCP authored blocked actions", () => {
  it("projects the same reason through full, compact, and legal-action reads", () => {
    const { api, sessionId } = blockedTannersSession();

    const compactObservation = api.get_observation({ session_id: sessionId });
    expect(compactObservation.context.actions).toBeUndefined();
    expect(compactObservation.context.unavailable).toEqual([[BLOCKED_ID, BLOCKED_REASON]]);

    const fullObservation = api.get_observation({
      session_id: sessionId,
      compact_observation: false,
    });
    expect(fullObservation.observation.blocked_actions).toEqual([
      { id: BLOCKED_ID, command: BLOCKED_COMMAND, reason: BLOCKED_REASON },
    ]);

    const compactMenu = api.list_legal_actions({ session_id: sessionId });
    expect(compactMenu.blocked_actions).toEqual([[BLOCKED_ID, BLOCKED_REASON]]);

    const fullMenu = api.list_legal_actions({
      session_id: sessionId,
      compact_actions: false,
    });
    expect(fullMenu.blocked_actions).toEqual([
      { id: BLOCKED_ID, command: BLOCKED_COMMAND, reason: BLOCKED_REASON },
    ]);

    for (const value of [compactObservation.context, fullObservation.observation, compactMenu]) {
      expect(JSON.stringify(value)).not.toMatch(/visible_when|conditions|has_flag|not_flag/);
    }
  });

  it("rejects a projected blocked id with no state or journey progress", () => {
    const { api, sessionId } = blockedTannersSession();
    const before = api.get_state({ session_id: sessionId, include_state: true });

    const rejected = api.step_action({
      session_id: sessionId,
      action_id: BLOCKED_ID,
      expected_state_hash: before.state_hash,
    });

    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error("expected authored unavailable action to reject");
    if (!("context" in rejected)) throw new Error("expected state-matched blocked rejection");
    expect(rejected.rejection_reason).toBe(BLOCKED_REASON);
    expect(rejected.events).toEqual([["r", BLOCKED_REASON]]);
    expect(rejected.context.unavailable).toEqual([[BLOCKED_ID, BLOCKED_REASON]]);
    expect(rejected.state_hash).toBe(before.state_hash);
    expect(rejected.journeyDecision).toEqual({
      countsTowardJourney: false,
      reason: "rejected",
    });
    expect(rejected.journeyActionId).toBeNull();

    const after = api.get_state({ session_id: sessionId, include_state: true });
    expect(after.state_hash).toBe(before.state_hash);
    expect(after.state).toEqual(before.state);
  });

  it("hides unavailable RPG affordances while a parent journey choice owns the turn", () => {
    const { api, sessionId } = blockedTannersSession();
    const compact = api.get_observation({ session_id: sessionId });
    const full = api.get_observation({ session_id: sessionId, compact_observation: false });

    const suppressedCompact = suppressRpgGameplayActions({ context: compact.context });
    const suppressedFull = suppressRpgGameplayActions({ observation: full.observation });

    expect(suppressedCompact.context.actions).toBeUndefined();
    expect(suppressedCompact.context.unavailable).toBeUndefined();
    expect(suppressedFull.observation.available_actions).toEqual([]);
    expect(suppressedFull.observation.blocked_actions).toEqual([]);

    const suppressedWithOtherOmissions = suppressRpgGameplayActions({
      context: {
        ...compact.context,
        actions: ["look_around"],
        more: [0, 0, 0, 0, 3, 2, 0, 0, 0, 0, 4],
      },
    });
    expect(suppressedWithOtherOmissions.context.actions).toBeUndefined();
    expect(suppressedWithOtherOmissions.context.unavailable).toBeUndefined();
    expect(suppressedWithOtherOmissions.context.more).toEqual([0, 0, 0, 0, 0, 2]);

    const suppressedWithOnlyGameplayOmissions = suppressRpgGameplayActions({
      context: {
        ...compact.context,
        actions: ["look_around"],
        more: [0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 4],
      },
    });
    expect(suppressedWithOnlyGameplayOmissions.context.more).toBeUndefined();
  });
});
