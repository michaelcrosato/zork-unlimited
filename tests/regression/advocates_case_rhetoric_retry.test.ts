/**
 * Regression (§15) for bug_0406 — Advocate's Case rhetoric failure promised
 * "come back when you have the sequence" but permanently removed the legal path.
 *
 * A blind MCP playtest hit the natural-1 failure after gathering every document:
 * the failure text taught the proper sequence, but the only remaining progress was
 * combat. This locks the intended recovery: a prepared player who fails the first
 * presentation can present the register-led sequence and still win legally.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep } from "../../src/core/engine.js";
import { compactRpgObservation } from "../../src/mcp/compact_rpg_observation.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";

const forcedRng = (roll: number): Rng => ({ int: () => roll }) as unknown as Rng;

const loaded = loadRpgSourceFile("content/rpg/quests/advocates_case.yaml");
if (!loaded.ok) throw new Error("advocates_case must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index, () => forcedRng(1)));
const successfulStep = makeStep(buildRpgRules(index, () => forcedRng(20)));
const combatStep = makeStep(buildRpgRules(index, () => forcedRng(6)));
const CERTIFIED_EXTRACTS_SOURCE_HASH =
  "284d5e2e618b87dd2dd0761715b7cf6c5736111ae15f5d9824ce75ee3f03510e";
const RESOLVED_OSWIN_PRESENCE_SOURCE_HASH =
  "c3dd62683dcbbfa314298faa4bdbda727ebeb62124fd286fcc402a3293ce7e69";

function actionIds(s: GameState): string[] {
  return enumerateRpgActions(index, s).map((o) => o.id);
}

function commandFor(s: GameState, id: string): string {
  const action = enumerateRpgActions(index, s).find((o) => o.id === id);
  if (!action) throw new Error(`Missing ${id}; available: ${actionIds(s).join(", ")}`);
  return action.command;
}

function actWith(runStep: typeof step, s: GameState, id: string) {
  const action = enumerateRpgActions(index, s).find((o) => o.id === id);
  if (!action) throw new Error(`Missing ${id}; available: ${actionIds(s).join(", ")}`);
  const result = runStep(s, action.action);
  expect(result.ok).toBe(true);
  return result;
}

function chooseWith(runStep: typeof step, s: GameState, id: string): GameState {
  return actWith(runStep, s, id).state;
}

function choose(s: GameState, id: string): GameState {
  return chooseWith(step, s, id);
}

function fullyPreparedAtCaseRecord(): GameState {
  let s = initStateForRpgPack(index, 7);
  for (const id of [
    "read_charter_roll",
    "take_charter_roll",
    "go_east",
    "take_town_register",
    "read_town_register",
    "go_west",
    "go_west",
    "take_prior_convictions",
    "read_prior_convictions",
    "go_east",
    "go_north",
  ]) {
    s = choose(s, id);
  }
  return s;
}

function projected(state: GameState) {
  const before = structuredClone(state);
  const beforeBytes = JSON.stringify(state);
  const actions = enumerateRpgActions(index, state);
  const full = buildRpgObservation(index, state);
  const compact = compactRpgObservation(full, actions, { includeActions: true });

  expect(state).toEqual(before);
  expect(JSON.stringify(state)).toBe(beforeBytes);
  return { full, compact, ids: actions.map((action) => action.id) };
}

const RESOLVED_STALL_ACTIONS = [
  "go_east",
  "go_north",
  "go_west",
  "examine_charter_roll",
  "drop_charter_roll",
  "examine_prior_convictions",
  "drop_prior_convictions",
  "examine_town_register",
  "drop_town_register",
  "look_around",
  "inventory",
];

describe("bug_0406 — advocates_case rhetoric failure has a legal recovery", () => {
  it("unlocks a corrected sequence after a failed prepared rhetoric attempt", () => {
    const failed = choose(fullyPreparedAtCaseRecord(), "use_prior_convictions_on_case_record");

    expect(failed.flags["appeal_attempted"]).toBe(true);
    expect(failed.flags["oswin_overruled"]).not.toBe(true);
    expect(actionIds(failed)).not.toContain("use_prior_convictions_on_case_record");
    expect(actionIds(failed)).toContain("use_town_register_on_case_record");
    expect(commandFor(failed, "use_town_register_on_case_record")).toBe(
      "present certified register extract with the charter citation and certified precedent packet on case record",
    );
  });

  it("lets the recovered legal presentation overrule Oswin and reach the full-score ending", () => {
    let s = choose(fullyPreparedAtCaseRecord(), "use_prior_convictions_on_case_record");
    s = choose(s, "use_town_register_on_case_record");

    expect(s.flags["oswin_overruled"]).toBe(true);
    expect(actionIds(s)).not.toContain("attack_craf");
    expect(buildRpgObservation(index, s).enemies_present).toHaveLength(0);

    s = choose(s, "go_north");
    const obs = buildRpgObservation(index, s);

    expect(obs.ended).toBe(true);
    expect(obs.ending_id).toBe("ending_exempted");
    expect(obs.state.vars.score).toBe(50);
    expect(obs.ending?.text).toContain("charter exemption confirmed");
    expect(obs.description).toContain("Final score: 50 of 50.");
    expect(validateRpg(pack).findings).toHaveLength(0);
  });

  it("still permits a 40/50 legal victory without the certified register extract", () => {
    let s = initStateForRpgPack(index, 7);
    for (const id of [
      "read_charter_roll",
      "go_west",
      "take_prior_convictions",
      "read_prior_convictions",
      "go_east",
      "go_north",
    ]) {
      s = chooseWith(successfulStep, s, id);
    }

    const presented = actWith(successfulStep, s, "use_prior_convictions_on_case_record");
    const presentation = presented.events
      .flatMap((event) => (event.type === "narration" ? [event.text] : []))
      .join(" ");
    expect(presentation).toContain("certified precedent packet");
    expect(presentation).toContain("any certified register extract you gathered");
    expect(presentation).not.toContain("the certified register extract follows");
    expect(presentation).not.toContain("reads the register");
    s = chooseWith(successfulStep, presented.state, "go_north");

    const obs = buildRpgObservation(index, s);
    expect(s.flags["register_read"]).toBeUndefined();
    expect(s.flags["town_register_taken"]).toBeUndefined();
    expect(s.flags["priors_read"]).toBe(true);
    expect(s.flags["oswin_overruled"]).toBe(true);
    expect(obs.ended).toBe(true);
    expect(obs.ending_id).toBe("ending_exempted");
    expect(obs.state.vars.score).toBe(40);
    expect(obs.description).toContain("Final score: 40 of 50.");
  });

  it("removes absent Oswin from full and compact stall actions after either legal success route", () => {
    const primarySuccess = chooseWith(
      successfulStep,
      fullyPreparedAtCaseRecord(),
      "use_prior_convictions_on_case_record",
    );
    const recoveredSuccess = choose(
      choose(fullyPreparedAtCaseRecord(), "use_prior_convictions_on_case_record"),
      "use_town_register_on_case_record",
    );

    for (const resolved of [primarySuccess, recoveredSuccess]) {
      const stall = chooseWith(successfulStep, resolved, "go_south");
      const { full, compact, ids } = projected(stall);

      expect(stall.flags["oswin_overruled"]).toBe(true);
      expect(full.room).toBe("market_stall");
      expect(full.description).toContain("Oswin has not returned to the stall");
      expect(full.npcs_present).toEqual([]);
      expect(ids).toEqual(RESOLVED_STALL_ACTIONS);
      expect(full.available_actions.map((action) => action.id)).toEqual(RESOLVED_STALL_ACTIONS);
      expect(compact.text).toBe(full.description.trim());
      expect(compact.npcs).toBeUndefined();
      expect(compact.actions).toEqual(RESOLVED_STALL_ACTIONS);
    }

    expect(loaded.compiled.contentHash).toBe(RESOLVED_OSWIN_PRESENCE_SOURCE_HASH);
    expect(loaded.compiled.contentHash).not.toBe(CERTIFIED_EXTRACTS_SOURCE_HASH);
  });

  it("keeps Oswin visible and talkable after a failed appeal and a combat-only victory", () => {
    const failedAppeal = choose(
      choose(fullyPreparedAtCaseRecord(), "use_prior_convictions_on_case_record"),
      "go_south",
    );
    const failedProjection = projected(failedAppeal);

    expect(failedAppeal.flags["appeal_attempted"]).toBe(true);
    expect(failedAppeal.flags["oswin_overruled"]).toBeUndefined();
    expect(failedProjection.full.description).toContain("Oswin on the street-side of the stall");
    expect(failedProjection.full.npcs_present).toContainEqual({
      id: "oswin",
      name: "Warden Oswin",
    });
    expect(failedProjection.ids).toContain("talk_oswin");
    expect(failedProjection.full.available_actions.map((action) => action.id)).toContain(
      "talk_oswin",
    );
    expect(failedProjection.compact.npcs).toContain("oswin");
    expect(failedProjection.compact.actions).toContain("talk_oswin");
    const failedTalk = actWith(step, failedAppeal, "talk_oswin");
    expect(
      failedTalk.events.flatMap((event) => (event.type === "narration" ? [event.text] : [])),
    ).toContain(
      'Warden Oswin: "The matter is with the alderman\'s deputy. I have nothing to add.\n"',
    );

    let combatOnly = chooseWith(combatStep, initStateForRpgPack(index, 7), "go_north");
    const firstAttack = actWith(combatStep, combatOnly, "attack_craf");
    expect(
      firstAttack.events.flatMap((event) => (event.type === "narration" ? [event.text] : [])),
    ).toEqual([
      "You strike Craf for 8 (d6 6 + 4 atk - 2 def; it has 4 HP left).",
      "Craf hits you for 9 (d6 6 + 5 atk - 2 def; you have 11 HP left).",
    ]);
    combatOnly = chooseWith(combatStep, firstAttack.state, "attack_craf");
    combatOnly = chooseWith(combatStep, combatOnly, "go_south");
    const combatProjection = projected(combatOnly);

    expect(combatOnly.flags["craf_defeated"]).toBe(true);
    expect(combatOnly.flags["oswin_overruled"]).toBeUndefined();
    expect(combatProjection.full.description).toContain(
      "Oswin, the Weavers' Guild warden, occupies the street-side of the stall",
    );
    expect(combatProjection.full.npcs_present).toContainEqual({
      id: "oswin",
      name: "Warden Oswin",
    });
    expect(commandFor(combatOnly, "talk_oswin")).toBe("talk to Warden Oswin");
    expect(combatProjection.full.available_actions.map((action) => action.id)).toContain(
      "talk_oswin",
    );
    expect(combatProjection.compact.npcs).toContain("oswin");
    expect(combatProjection.compact.actions).toContain("talk_oswin");
  });
});
