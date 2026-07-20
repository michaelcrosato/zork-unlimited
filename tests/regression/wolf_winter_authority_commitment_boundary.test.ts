/**
 * Regression for seed4177 S2: the compact action id `ask_invoke_authority`
 * looked exploratory even though it immediately committed the fortification
 * strategy. Cade's full-duty line must disclose both stances and the shared
 * commitment boundary without being shortened by the compact projection.
 */
import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import { MCP_ACTION_LABEL_CHAR_LIMIT } from "../../src/mcp/action_labels.js";
import { compactRpgObservation } from "../../src/mcp/compact_rpg_observation.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { parseCommand } from "../../src/rpg/command_map.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { buildRpgRules, enumerateRpgActions, indexRpgPack } from "../../src/rpg/runner.js";
import type { GameState } from "../../src/core/state.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("Wolf-Winter must compile");
const index = indexRpgPack(loaded.compiled.pack);
const FULL = { compact_context: false, compact_result: false } as const;
const COMMITMENT_WARNING =
  /commit north[^]*no retreat[^]*(?:no )?lure\/drive\/combat (?:switch|shut)/i;
const CADE_STANCE = /HOUSEHOLD[^]*exposes property[^]*saves seals[^]*failed-seat aid/i;
const ALBANY_STANCE = /ALBANY[^]*covers property[^]*spends seals[^]*no aid/i;
const FULL_DUTY_TERMS =
  /breach full duty[^]*first Albany Repair 2 easier[^]*Mobile stabilizes a recovered miss[^]*dawn/i;
const TRUNCATION_MARKER = /(?:\.\.\.\(\+\d+ chars\)|#[0-9a-f]{12}\b)/i;

function act(state: GameState, actionId: string): GameState {
  const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === actionId);
  expect(option, `${actionId} must be legal in ${state.current}`).toBeDefined();
  if (!option) throw new Error(`Missing ${actionId}.`);
  const result = makeStep(buildRpgRules(index))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function observation(state: GameState) {
  return buildRpgObservation(index, state, {
    availableActions: enumerateRpgActions(index, state),
  });
}

function launchSeed4177Imports(): GameState {
  const api = createToolApi({ root: process.cwd() });
  const started = api.start_overworld({ compact_context: false });
  const sessionId = started.session_id;

  api.scout_overworld_session_poi({
    ...FULL,
    session_id: sessionId,
    poi_id: started.observation.pois[0]!.id,
  });
  api.talk_overworld_session_contact({
    ...FULL,
    session_id: sessionId,
    character_id: "albany_city__civic_core__contact",
  });
  for (const choice of ["albany:road_warden", "albany:oath_full_compact_duty"]) {
    api.choose_overworld_session_story({ ...FULL, session_id: sessionId, choice });
  }
  const sourced = api.choose_overworld_session_story({
    ...FULL,
    session_id: sessionId,
    choice: "albany:source_hayden_frost_report",
  });
  const preparationRoute = sourced.observation.areaExits.find(
    (candidate) => candidate.destination.id === "albany_city__transport_hub",
  );
  if (!preparationRoute) throw new Error("Wolf-Winter's preparation area must be reachable.");
  api.move_overworld_session_area({
    ...FULL,
    session_id: sessionId,
    area_route_id: preparationRoute.id,
  });
  const prepared = api.choose_overworld_session_story({
    ...FULL,
    session_id: sessionId,
    choice: "albany:prep_works_fortification",
  });
  const wolf = prepared.observation.quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf) throw new Error("Hayden's report and Reese's plan must reveal Wolf-Winter.");
  api.choose_overworld_session_story({
    ...FULL,
    session_id: sessionId,
    choice: "albany:relief_mobile_reserve",
  });

  const launched = api.start_overworld_session_quest({
    ...FULL,
    compact_observation: false,
    compact_actions: false,
    include_actions: true,
    session_id: sessionId,
    quest_id: "wolf_winter",
    approach_id: "albany:wolf_approach_sheltered_stockway",
    seed: 4177,
  });
  const state = structuredClone(api.sessions.get(launched.rpg_session_id).state);
  expect(state.flags.june_pike_present).not.toBe(true);
  expect(state.campaignImportReceipt?.applied_rules).toEqual(
    expect.arrayContaining([
      "import:wolf_winter_approach_sheltered_stockway",
      "import:wolf_winter_fieldcraft",
      "import:wolf_winter_frost_report",
      "import:wolf_winter_full_compact_duty",
      "import:wolf_winter_lure_fieldcraft",
      "import:wolf_winter_works_fortification",
      "import:wolf_winter_relief_mobile_reserve",
    ]),
  );
  return state;
}

describe("Wolf-Winter authority commitment boundary", () => {
  it("discloses seed4177's authority commitment in full and compact before the step, then closes the other lines", () => {
    let state = launchSeed4177Imports();
    state = act(state, "use_sheltered_stockway_last_mile");
    state = act(state, "talk_houndsman");
    state = act(state, "ask_fortify");

    const before = observation(state);
    const fullDialogue = before.dialogue?.npc_text;
    const compact = compactRpgObservation(
      before,
      before.available_actions.map((action) => action.id),
      {
        includeActions: true,
      },
    );
    const compactDialogue = compact.dialogue?.[1];
    expect(fullDialogue).toMatch(COMMITMENT_WARNING);
    expect(fullDialogue).toMatch(CADE_STANCE);
    expect(fullDialogue).toMatch(ALBANY_STANCE);
    expect(fullDialogue).toMatch(FULL_DUTY_TERMS);
    expect(compactDialogue).toBe(fullDialogue?.trimEnd());
    expect(compactDialogue).not.toMatch(TRUNCATION_MARKER);
    expect(compactDialogue).toMatch(COMMITMENT_WARNING);
    expect(compactDialogue).toMatch(CADE_STANCE);
    expect(compactDialogue).toMatch(ALBANY_STANCE);
    expect(compactDialogue).toMatch(FULL_DUTY_TERMS);
    expect(compact.actions).toEqual(
      expect.arrayContaining(["ask_commit_cade_terms", "ask_commit_albany_authority"]),
    );
    expect(compact.actions).not.toEqual(
      expect.arrayContaining(["ask_accept_terms", "ask_invoke_authority"]),
    );
    expect(state.flags.strategy_fortify_committed).not.toBe(true);
    expect(state.flags.fortify_cade_terms_accepted).not.toBe(true);
    expect(state.flags.fortify_albany_authority_invoked).not.toBe(true);
    expect(before.available_actions.map((action) => action.id)).toEqual(
      expect.arrayContaining([
        "ask_commit_cade_terms",
        "ask_commit_albany_authority",
        "ask_fortify_back",
      ]),
    );
    expect(before.available_actions.map((action) => action.id)).not.toEqual(
      expect.arrayContaining(["ask_accept_terms", "ask_invoke_authority"]),
    );
    expect(parseCommand(index, state, "ask invoke_authority")).toEqual({
      ok: true,
      action: { type: "ASK", npc: "houndsman", topic: "commit_albany_authority" },
    });
    expect(parseCommand(index, state, "ask accept_terms")).toEqual({
      ok: true,
      action: { type: "ASK", npc: "houndsman", topic: "commit_cade_terms" },
    });
    const reconsidered = act(structuredClone(state), "ask_fortify_back");
    expect(reconsidered.flags.strategy_fortify_committed).not.toBe(true);
    expect(enumerateRpgActions(index, reconsidered).map((action) => action.id)).toEqual(
      expect.arrayContaining(["ask_lure", "ask_drive", "ask_fortify"]),
    );
    const authority = before.available_actions.find(
      (action) => action.id === "ask_commit_albany_authority",
    );
    expect(authority?.command).toMatch(
      /^ask: Commit Albany authority:[^]*no retreat[^]*no strategy switch to lure, drive, or combat/i,
    );
    expect(authority?.command.length).toBeLessThanOrEqual(MCP_ACTION_LABEL_CHAR_LIMIT);

    state = act(state, "ask_commit_albany_authority");
    expect(state.flags).toMatchObject({
      strategy_fortify_committed: true,
      fortify_albany_authority_invoked: true,
      fortify_combat_withheld: true,
      strategy_combat_withheld: true,
    });
    expect(state.flags.fortify_cade_terms_accepted).not.toBe(true);
    expect(enumerateRpgActions(index, state).map((action) => action.id)).not.toEqual(
      expect.arrayContaining(["ask_lure", "ask_drive", "ask_fortify", "ask_commit_cade_terms"]),
    );

    state = act(state, "ask_leave");
    expect(enumerateRpgActions(index, state).map((action) => action.id)).not.toEqual(
      expect.arrayContaining(["go_south", "go_west", "ask_lure", "ask_drive", "ask_fortify"]),
    );
  });
});
