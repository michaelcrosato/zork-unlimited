import { describe, expect, it } from "vitest";

import type { RpgAction } from "../../src/api/types.js";
import {
  observationProjectionSuffix,
  publicActionRows,
  publicActions,
  publicBlockedActionRows,
  publicBlockedActions,
  publicObservation,
} from "../../src/mcp/rpg_view_projection.js";
import type { RpgActionOption, RpgBlockedActionOption } from "../../src/rpg/legal_actions.js";
import type { RpgObservation } from "../../src/rpg/observation.js";

const actions: RpgActionOption[] = [
  { id: "look", command: "look", action: { type: "LOOK" } },
  {
    id: "force_gate",
    command: "force gate",
    action: { type: "USE", target: "gate" } as RpgAction,
    skill_check: { skill: "might", difficulty: 12, die: "d20" },
    resources: { gains: ["gate_token"], costs: ["iron_key"] },
  },
];

const blockedActions: RpgBlockedActionOption[] = [
  {
    id: "use_key_on_gate",
    command: "use the brass key on the iron gate",
    reason: "The key has not been cut to this lock yet.",
  },
];

const observation: RpgObservation = {
  mode: "rpg",
  room: "gatehouse",
  title: "Gatehouse",
  description: "A locked gate bars the road.",
  world: {
    id: "charter_marches",
    name: "The Charter Marches",
    hub: "charterhaven",
    district: "old_road",
    quest: "gatehouse",
    role: "checkpoint",
    connection: "road",
  },
  visible_objects: [{ id: "gate", name: "iron gate" }],
  npcs_present: [{ id: "guard", name: "Gate Guard" }],
  exits: [{ direction: "north", to: "road" }],
  blocked_exits: [{ direction: "east", message: "The gate is barred." }],
  blocked_actions: blockedActions,
  inventory: ["lamp"],
  state: { flags: ["gate_seen"], vars: { might: 3 }, journal: ["Reached the gate."] },
  dialogue: { npc: "guard", npc_text: "No passage without a token." },
  enemies_present: [{ id: "rat", name: "Tunnel Rat", hp: 2 }],
  stats: { hp: 8, attack: 2, defense: 1 },
  available_actions: actions,
  score: 1,
  max_score: 5,
  ended: false,
  ending_id: null,
  ending: null,
};

describe("MCP RPG view projection", () => {
  it("keeps public action commands unless compact action ids are requested", () => {
    expect(publicActions(actions)).toEqual([
      { id: "look", command: "look" },
      {
        id: "force_gate",
        command: "force gate",
        skill_check: { skill: "might", difficulty: 12, die: "d20" },
        resources: { gains: ["gate_token"], costs: ["iron_key"] },
      },
    ]);

    expect(publicActions(actions, { compactActions: true })).toEqual([
      { id: "look" },
      {
        id: "force_gate",
        skill_check: { skill: "might", difficulty: 12, die: "d20" },
        resources: { gains: ["gate_token"], costs: ["iron_key"] },
      },
    ]);
  });

  it("projects legal action rows into compact ids or public action objects", () => {
    expect(publicActionRows(actions, { compact_actions: true })).toEqual(["look", "force_gate"]);
    expect(publicActionRows(actions, { compact_actions: false })).toEqual(publicActions(actions));
  });

  it("projects unavailable action rows without exposing reducer conditions", () => {
    expect(publicBlockedActions(blockedActions)).toEqual(blockedActions);
    expect(publicBlockedActionRows(blockedActions, { compact_actions: true })).toEqual([
      ["use_key_on_gate", "The key has not been cut to this lock yet."],
    ]);
    expect(publicBlockedActionRows(blockedActions, { compact_actions: false })).toEqual(
      blockedActions,
    );
    expect(JSON.stringify(publicBlockedActions(blockedActions))).not.toContain("conditions");
  });

  it("uses stable projection suffixes for observation cache keys", () => {
    expect(observationProjectionSuffix({ hideGraph: true, includeWorldIntro: false }, "ids")).toBe(
      "hide:1:intro:0:actions:1:ids",
    );
    expect(
      observationProjectionSuffix(
        { hideGraph: true, includeWorldIntro: false, includeAvailableActions: false },
        "ids",
      ),
    ).toBe("hide:1:intro:0:actions:0:ids");
  });

  it("projects observations with the same public action rules", () => {
    expect(publicObservation(observation, { compactActions: true }).available_actions).toEqual([
      { id: "look" },
      {
        id: "force_gate",
        skill_check: { skill: "might", difficulty: 12, die: "d20" },
        resources: { gains: ["gate_token"], costs: ["iron_key"] },
      },
    ]);
  });

  it("returns detached observation and action projection objects", () => {
    const projected = publicObservation(observation);
    const compactProjected = publicObservation(observation, { compactActions: true });

    expect(projected).toEqual({
      ...observation,
      available_actions: [
        { id: "look", command: "look" },
        {
          id: "force_gate",
          command: "force gate",
          skill_check: { skill: "might", difficulty: 12, die: "d20" },
          resources: { gains: ["gate_token"], costs: ["iron_key"] },
        },
      ],
    });
    expect(projected.visible_objects).not.toBe(observation.visible_objects);
    expect(projected.blocked_actions).not.toBe(observation.blocked_actions);
    expect(projected.state.flags).not.toBe(observation.state.flags);
    expect(projected.available_actions[1]?.skill_check).not.toBe(actions[1]?.skill_check);
    expect(compactProjected.available_actions[1]?.skill_check).not.toBe(actions[1]?.skill_check);
    expect(projected.available_actions[1]?.resources).not.toBe(actions[1]?.resources);
    expect(projected.available_actions[1]?.resources?.gains).not.toBe(actions[1]?.resources?.gains);

    projected.visible_objects[0]!.name = "mutated gate";
    projected.blocked_actions[0]!.reason = "mutated reason";
    projected.state.flags.push("mutated_flag");
    projected.available_actions[1]!.skill_check!.difficulty = 99;
    projected.available_actions[1]!.resources!.gains.push("mutated_resource");

    expect(observation.visible_objects[0]?.name).toBe("iron gate");
    expect(observation.blocked_actions[0]?.reason).toBe(
      "The key has not been cut to this lock yet.",
    );
    expect(observation.state.flags).toEqual(["gate_seen"]);
    expect(actions[1]?.skill_check?.difficulty).toBe(12);
    expect(actions[1]?.resources?.gains).toEqual(["gate_token"]);
  });
});
