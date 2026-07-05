import { describe, expect, it } from "vitest";

import type { RpgAction } from "../../src/api/types.js";
import {
  observationProjectionSuffix,
  publicActionRows,
  publicActions,
  publicObservation,
} from "../../src/mcp/rpg_view_projection.js";
import type { RpgActionOption } from "../../src/rpg/legal_actions.js";
import type { RpgObservation } from "../../src/rpg/observation.js";

const actions: RpgActionOption[] = [
  { id: "look", command: "look", action: { type: "LOOK" } },
  {
    id: "force_gate",
    command: "force gate",
    action: { type: "USE", target: "gate" } as RpgAction,
    skill_check: { skill: "might", difficulty: 12, die: "d20" },
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
      },
    ]);

    expect(publicActions(actions, { compactActions: true })).toEqual([
      { id: "look" },
      { id: "force_gate", skill_check: { skill: "might", difficulty: 12, die: "d20" } },
    ]);
  });

  it("projects legal action rows into compact ids or public action objects", () => {
    expect(publicActionRows(actions, { compact_actions: true })).toEqual(["look", "force_gate"]);
    expect(publicActionRows(actions, { compact_actions: false })).toEqual(publicActions(actions));
  });

  it("uses stable projection suffixes for observation cache keys", () => {
    expect(observationProjectionSuffix({ hideGraph: true, includeWorldIntro: false }, "ids")).toBe(
      "hide:1:intro:0:ids",
    );
  });

  it("projects observations with the same public action rules", () => {
    expect(publicObservation(observation, { compactActions: true }).available_actions).toEqual([
      { id: "look" },
      { id: "force_gate", skill_check: { skill: "might", difficulty: 12, die: "d20" } },
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
        },
      ],
    });
    expect(projected.visible_objects).not.toBe(observation.visible_objects);
    expect(projected.state.flags).not.toBe(observation.state.flags);
    expect(projected.available_actions[1]?.skill_check).not.toBe(actions[1]?.skill_check);
    expect(compactProjected.available_actions[1]?.skill_check).not.toBe(actions[1]?.skill_check);

    projected.visible_objects[0]!.name = "mutated gate";
    projected.state.flags.push("mutated_flag");
    projected.available_actions[1]!.skill_check!.difficulty = 99;

    expect(observation.visible_objects[0]?.name).toBe("iron gate");
    expect(observation.state.flags).toEqual(["gate_seen"]);
    expect(actions[1]?.skill_check?.difficulty).toBe(12);
  });
});
