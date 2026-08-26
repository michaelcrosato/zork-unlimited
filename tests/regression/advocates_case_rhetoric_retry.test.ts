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
const POST_DISMISSAL_READ_PREDECESSOR_SOURCE_HASH =
  "d8b85620ac7ee8b4672f25e8b5a1552478b3d9d6add0b4894df32bb09dd19dff";
const POST_DISMISSAL_READ_SOURCE_HASH =
  "e4b26db74d454274b5abe1977603206f142d62dedab1e7dd096cc7c97eb583f5";
const EXPELLED_ENDING_TEXT =
  "Craf kills you in the market. The deputy records the disturbance, Marta's broadcloth remains impounded, and Oswin's notice stands. *** You have fallen. ***\n";
const UNTOUCHED_CASE_RECORD_TEXT =
  "The case record says Warden Oswin impounded Marta Holm's twelve broadcloth bolts under Guild Schedule, Article Fourteen. The deputy is ready to hear the case before noon.\n";
const FAILED_CASE_RECORD_TEXT =
  "The first appeal was adjourned, so Marta's impound remains pending and Craf still blocks north. If you read all three documents, PRESENT certified register extract with the charter citation and certified precedent packet on case record to retry in the required order.\n";
const RESOLVED_CASE_RECORD_TEXT =
  "The case record now says, 'Discharged. Charter exemption confirmed.' The deputy struck through the pending impound.\n";
const CASE_RECORD_READ_TEXT =
  "The original case entry says, 'Marta Holm. Warden Oswin. Schedule Fourteen: unlicensed sale. Twelve broadcloth bolts held.' If the appeal remains pending, PRESENT certified precedent packet WITH case record. A completed ruling stays complete.\n";

const lethalRng = (): Rng => {
  let draw = 0;
  const next = (): number => (draw++ === 0 ? 0 : 0.999999);
  return {
    next,
    int(min: number, max: number): number {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      return lo + Math.floor(next() * (hi - lo + 1));
    },
  };
};
const lethalStep = makeStep(buildRpgRules(index, lethalRng));

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

function fallToCraf(state: GameState): GameState {
  for (let round = 0; round < 3; round += 1) {
    const result = actWith(lethalStep, state, "attack_craf");
    const combat = result.events.flatMap((event) =>
      event.type === "narration" ? [event.text] : [],
    );
    expect(combat[0]).toContain("d6 1 + 4 atk - 2 def");
    expect(combat[1]).toContain("d6 6 + 5 atk - 2 def");
    state = result.state;
  }
  return state;
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

function observeCaseRecord(state: GameState, id: "examine_case_record" | "read_case_record") {
  const before = structuredClone(state);
  const beforeBytes = JSON.stringify(state);
  const result = actWith(step, state, id);

  expect(state).toEqual(before);
  expect(JSON.stringify(state)).toBe(beforeBytes);
  expect(result.state).toEqual({ ...before, step: before.step + 1 });
  return result.events
    .flatMap((event) => (event.type === "narration" ? [event.text] : []))
    .join(" ");
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

const UNREAD_EVIDENCE_ACTIONS = [
  "read_charter_roll",
  "read_town_register",
  "read_prior_convictions",
];

function unreadEvidenceAtStall(runStep: typeof step): GameState {
  let state = initStateForRpgPack(index, 7);
  for (const id of [
    "go_east",
    "take_town_register",
    "go_west",
    "go_west",
    "take_prior_convictions",
    "go_east",
  ]) {
    state = chooseWith(runStep, state, id);
  }
  return state;
}

describe("bug_0406 — advocates_case rhetoric failure has a legal recovery", () => {
  it("keeps untouched and combat-only case records pending before any legal presentation", () => {
    const untouched = choose(initStateForRpgPack(index, 7), "go_north");
    let combatOnly = chooseWith(combatStep, initStateForRpgPack(index, 7), "go_north");
    combatOnly = chooseWith(combatStep, combatOnly, "attack_craf");
    combatOnly = chooseWith(combatStep, combatOnly, "attack_craf");

    expect(untouched.flags["craf_defeated"]).toBeUndefined();
    expect(combatOnly.flags["craf_defeated"]).toBe(true);
    for (const state of [untouched, combatOnly]) {
      const { full, compact, ids } = projected(state);

      expect(state.flags["appeal_attempted"]).toBeUndefined();
      expect(state.flags["oswin_overruled"]).toBeUndefined();
      expect(ids).toContain("examine_case_record");
      expect(ids).toContain("read_case_record");
      expect(full.available_actions.map((action) => action.id)).toEqual(ids);
      expect(compact.actions).toEqual(ids);
      expect(observeCaseRecord(state, "examine_case_record")).toBe(UNTOUCHED_CASE_RECORD_TEXT);
      expect(observeCaseRecord(state, "read_case_record")).toBe(CASE_RECORD_READ_TEXT);
    }
  });

  it("shows the adjourned case record after a failed prepared presentation", () => {
    const failed = choose(fullyPreparedAtCaseRecord(), "use_prior_convictions_on_case_record");
    const { full, compact, ids } = projected(failed);

    expect(failed.flags["appeal_attempted"]).toBe(true);
    expect(failed.flags["oswin_overruled"]).toBeUndefined();
    expect(ids).toContain("use_town_register_on_case_record");
    expect(ids).toContain("examine_case_record");
    expect(ids).toContain("read_case_record");
    expect(full.available_actions.map((action) => action.id)).toEqual(ids);
    expect(compact.actions).toEqual(ids);
    expect(observeCaseRecord(failed, "examine_case_record")).toBe(FAILED_CASE_RECORD_TEXT);
    expect(observeCaseRecord(failed, "read_case_record")).toBe(CASE_RECORD_READ_TEXT);
  });

  it("shows the discharged case record after primary and recovered legal success", () => {
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
      const { full, compact, ids } = projected(resolved);

      expect(resolved.flags["appeal_attempted"]).toBe(true);
      expect(resolved.flags["oswin_overruled"]).toBe(true);
      expect(full.description).toContain(
        "Exemption confirmed. Impound discharged. Warden's notice void.",
      );
      expect(ids).toContain("examine_case_record");
      expect(ids).toContain("read_case_record");
      expect(full.available_actions.map((action) => action.id)).toEqual(ids);
      expect(compact.actions).toEqual(ids);
      expect(observeCaseRecord(resolved, "examine_case_record")).toBe(RESOLVED_CASE_RECORD_TEXT);
      expect(observeCaseRecord(resolved, "read_case_record")).toBe(CASE_RECORD_READ_TEXT);
    }

    expect(loaded.compiled.contentHash).toBe(POST_DISMISSAL_READ_SOURCE_HASH);
    expect(loaded.compiled.contentHash).not.toBe(POST_DISMISSAL_READ_PREDECESSOR_SOURCE_HASH);
  });

  it("retires all unread evidence READs after primary dismissal without regressing resolved state", () => {
    let resolved = chooseWith(successfulStep, unreadEvidenceAtStall(successfulStep), "go_north");
    resolved = chooseWith(successfulStep, resolved, "use_prior_convictions_on_case_record");
    resolved = chooseWith(successfulStep, resolved, "go_south");
    const before = structuredClone(resolved);
    const beforeBytes = JSON.stringify(resolved);
    const { full, compact, ids } = projected(resolved);

    expect(resolved.flags).toMatchObject({ appeal_attempted: true, oswin_overruled: true });
    expect(resolved.flags["charter_read"]).toBeUndefined();
    expect(resolved.flags["register_read"]).toBeUndefined();
    expect(resolved.flags["priors_read"]).toBeUndefined();
    expect(resolved.questStage["weavers_appeal"]).toBe("case_dismissed");
    expect(resolved.vars["score"]).toBe(10);
    expect(resolved.vars["rhetoric"]).toBe(3);
    expect(resolved.journal).toHaveLength(1);
    expect(resolved.journal[0]).toContain(
      "The deputy accepted your presentation, verified Marta's exemption, and voided the impound",
    );
    for (const id of UNREAD_EVIDENCE_ACTIONS) expect(ids).not.toContain(id);
    for (const id of [
      "examine_charter_roll",
      "examine_town_register",
      "examine_prior_convictions",
    ]) {
      expect(ids).toContain(id);
    }
    expect(full.available_actions.map((action) => action.id)).toEqual(ids);
    expect(compact.actions).toEqual(ids);

    for (const target of ["charter_roll", "town_register", "prior_convictions"]) {
      const rejected = step(resolved, { type: "READ", target });
      expect(rejected.ok, target).toBe(false);
      expect(rejected.rejectionReason, target).toBe("That action is not available right now.");
      expect(rejected.events, target).toEqual([
        { type: "rejected", reason: "That action is not available right now." },
      ]);
      expect(rejected.state, target).toBe(resolved);
    }

    expect(resolved).toEqual(before);
    expect(JSON.stringify(resolved)).toBe(beforeBytes);
    expect(resolved.questStage["weavers_appeal"]).toBe("case_dismissed");
    expect(resolved.vars).toEqual(before.vars);
    expect(resolved.journal).toEqual(before.journal);
    expect(loaded.compiled.contentHash).toBe(POST_DISMISSAL_READ_SOURCE_HASH);
    expect(loaded.compiled.contentHash).not.toBe(POST_DISMISSAL_READ_PREDECESSOR_SOURCE_HASH);
  });

  it("keeps unread evidence READs legal after a failed appeal and after Craf falls", () => {
    let failed = choose(unreadEvidenceAtStall(step), "go_north");
    failed = choose(failed, "use_prior_convictions_on_case_record");
    failed = choose(failed, "go_south");

    let combatOnly = chooseWith(combatStep, unreadEvidenceAtStall(combatStep), "go_north");
    combatOnly = chooseWith(combatStep, combatOnly, "attack_craf");
    combatOnly = chooseWith(combatStep, combatOnly, "attack_craf");
    combatOnly = chooseWith(combatStep, combatOnly, "go_south");

    expect(failed.flags["appeal_attempted"]).toBe(true);
    expect(failed.flags["oswin_overruled"]).toBeUndefined();
    expect(combatOnly.flags["craf_defeated"]).toBe(true);
    expect(combatOnly.flags["oswin_overruled"]).toBeUndefined();
    expect(combatOnly.questStage["weavers_appeal"]).toBe("craf_down");

    for (const scenario of [
      { label: "failed appeal", state: failed },
      { label: "Craf defeated", state: combatOnly },
    ]) {
      const { full, compact, ids } = projected(scenario.state);
      for (const id of UNREAD_EVIDENCE_ACTIONS) expect(ids, scenario.label).toContain(id);
      expect(
        full.available_actions.map((action) => action.id),
        scenario.label,
      ).toEqual(ids);
      expect(compact.actions, scenario.label).toEqual(ids);
    }
  });

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
    expect(obs.ending?.text).toContain("The deputy confirmed Marta's charter exemption");
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
    expect(presentation).toContain("The deputy verifies the official records");
    expect(presentation).not.toContain("the certified registration");
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
      expect(full.description).toContain("Oswin has left");
      expect(full.npcs_present).toEqual([]);
      expect(ids).toEqual(RESOLVED_STALL_ACTIONS);
      expect(full.available_actions.map((action) => action.id)).toEqual(RESOLVED_STALL_ACTIONS);
      expect(compact.text).toBe(full.description.trim());
      expect(compact.npcs).toBeUndefined();
      expect(compact.actions).toEqual(RESOLVED_STALL_ACTIONS);
    }

    expect(loaded.compiled.contentHash).toBe(POST_DISMISSAL_READ_SOURCE_HASH);
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
    expect(failedProjection.full.description).toContain("Marta and Oswin wait here");
    expect(failedProjection.full.npcs_present).toContainEqual({
      id: "oswin",
      name: "Warden Oswin",
    });
    expect(failedProjection.ids).toContain("talk_oswin");
    expect(failedProjection.full.available_actions.map((action) => action.id)).toContain(
      "talk_oswin",
    );
    expect(failedProjection.compact.npcs).toContainEqual(["oswin", "Warden Oswin"]);
    expect(failedProjection.compact.actions).toContain("talk_oswin");
    const failedTalk = actWith(step, failedAppeal, "talk_oswin");
    expect(
      failedTalk.events.flatMap((event) => (event.type === "narration" ? [event.text] : [])),
    ).toContain('Warden Oswin: "The deputy has the case. I have nothing more to add.\n"');

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
    expect(combatProjection.full.description).toContain("Marta and Oswin wait beside the stall");
    expect(combatProjection.full.npcs_present).toContainEqual({
      id: "oswin",
      name: "Warden Oswin",
    });
    expect(commandFor(combatOnly, "talk_oswin")).toBe("talk to Warden Oswin");
    expect(combatProjection.full.available_actions.map((action) => action.id)).toContain(
      "talk_oswin",
    );
    expect(combatProjection.compact.npcs).toContainEqual(["oswin", "Warden Oswin"]);
    expect(combatProjection.compact.actions).toContain("talk_oswin");
  });

  it("keeps the expelled ending true after failed, untouched, held, and dropped charter routes", () => {
    const preparedFailure = chooseWith(
      lethalStep,
      fullyPreparedAtCaseRecord(),
      "use_prior_convictions_on_case_record",
    );
    expect(preparedFailure.flags).toMatchObject({
      charter_read: true,
      charter_roll_taken: true,
      register_read: true,
      town_register_taken: true,
      priors_read: true,
      appeal_attempted: true,
    });
    expect(preparedFailure.flags["oswin_overruled"]).toBeUndefined();

    const direct = chooseWith(lethalStep, initStateForRpgPack(index, 7), "go_north");
    const carried = chooseWith(
      lethalStep,
      chooseWith(lethalStep, initStateForRpgPack(index, 7), "take_charter_roll"),
      "go_north",
    );
    const dropped = chooseWith(
      lethalStep,
      chooseWith(
        lethalStep,
        chooseWith(lethalStep, initStateForRpgPack(index, 7), "take_charter_roll"),
        "go_north",
      ),
      "drop_charter_roll",
    );
    const cases = [
      {
        label: "failed prepared appeal with the charter held",
        state: fallToCraf(preparedFailure),
        score: 25,
        inventory: ["charter_roll", "town_register", "prior_convictions"],
        flags: {
          charter_read: true,
          charter_roll_taken: true,
          town_register_taken: true,
          register_read: true,
          priors_read: true,
          appeal_attempted: true,
        },
        charterLocation: undefined,
      },
      {
        label: "untouched charter and direct combat",
        state: fallToCraf(direct),
        score: 0,
        inventory: [],
        flags: {},
        charterLocation: undefined,
      },
      {
        label: "unargued charter carried into direct combat",
        state: fallToCraf(carried),
        score: 0,
        inventory: ["charter_roll"],
        flags: { charter_roll_taken: true },
        charterLocation: undefined,
      },
      {
        label: "charter dropped in the antechamber",
        state: fallToCraf(dropped),
        score: 0,
        inventory: [],
        flags: { charter_roll_taken: true },
        charterLocation: {
          room: "aldermans_antechamber",
          takenBy: "player" as const,
        },
      },
    ];

    for (const scenario of cases) {
      const { full, compact, ids } = projected(scenario.state);
      expect(scenario.state.ended, scenario.label).toBe(true);
      expect(scenario.state.endingId, scenario.label).toBe("ending_expelled");
      expect(scenario.state.flags, scenario.label).toEqual(scenario.flags);
      expect(scenario.state.inventory, scenario.label).toEqual(scenario.inventory);
      expect(scenario.state.objectState["charter_roll"], scenario.label).toEqual(
        scenario.charterLocation,
      );
      expect(scenario.state.vars["hp"], scenario.label).toBe(0);
      expect(scenario.state.vars["score"] ?? 0, scenario.label).toBe(scenario.score);
      expect(ids, scenario.label).toEqual([]);
      expect(full.ended, scenario.label).toBe(true);
      expect(full.ending_id, scenario.label).toBe("ending_expelled");
      expect(full.score, scenario.label).toBe(scenario.score);
      expect(full.ending, scenario.label).toEqual({
        id: "ending_expelled",
        title: "Killed in the Market",
        text: EXPELLED_ENDING_TEXT,
        death: true,
      });
      expect(full.description, scenario.label).toBe(
        `${EXPELLED_ENDING_TEXT}\nFinal score: ${scenario.score} of 50.`,
      );
      expect(compact.ended, scenario.label).toBe(true);
      expect(compact.ending_id, scenario.label).toBe("ending_expelled");
      expect(compact.ending, scenario.label).toEqual({
        id: "ending_expelled",
        title: "Killed in the Market",
        text: EXPELLED_ENDING_TEXT.trimEnd(),
        death: true,
      });
      expect(compact.text, scenario.label).toBe(full.description);
      expect(compact.actions, scenario.label).toBeUndefined();
    }

    expect(loaded.compiled.contentHash).toBe(POST_DISMISSAL_READ_SOURCE_HASH);
    expect(loaded.compiled.contentHash).not.toBe(RESOLVED_OSWIN_PRESENCE_SOURCE_HASH);
  });
});
