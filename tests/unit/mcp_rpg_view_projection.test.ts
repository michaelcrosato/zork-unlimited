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

const observation = {
  available_actions: actions,
} as RpgObservation;

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
});
