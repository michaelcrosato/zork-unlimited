/**
 * SS-F10 quest-local proof. Cade's drive is a third authored family, not a
 * renamed lure recovery: it has its own explicit commitment, finite two-use
 * resource, two spatial execution beats, visible pressure, bounded failed-check
 * recovery, and a three-way irreversible crisis whose choice changes the only
 * legal final evacuation action and ending input.
 */
import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { objectDescription } from "../../src/rpg/model.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("Wolf-Winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);

type Roll = "best" | "worst";
type Priority = "cattle" | "person" | "reserve";

function fixedRng(face: Roll): Rng {
  return {
    next: () => (face === "best" ? 0.999999 : 0),
    int: (min, max) => (face === "best" ? max : min),
  };
}

function actionIds(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

function expectCommittedDriveWithholdsCombat(state: GameState): void {
  const ids = actionIds(state);
  expect(state.flags).toMatchObject({
    strategy_drive_committed: true,
    drive_combat_withheld: true,
  });
  expect(buildRpgObservation(index, state).enemies_present).toEqual([]);
  expect(ids.filter((id) => id.startsWith("attack_") || id.startsWith("maneuver_"))).toEqual([]);
  expect(ids.some((id) => id.includes("abandon_drive"))).toBe(false);
}

function act(state: GameState, actionId: string, roll: Roll = "best"): GameState {
  const options = enumerateRpgActions(index, state);
  const option = options.find((candidate) => candidate.id === actionId);
  expect(
    option,
    `${actionId} must be legal in ${state.current}; legal: ${options
      .map((candidate) => candidate.id)
      .join(", ")}`,
  ).toBeDefined();
  if (!option) throw new Error(`Missing action ${actionId}.`);
  const result = makeStep(buildRpgRules(index, () => fixedRng(roll)))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function fresh(withJune = false): GameState {
  const state = initStateForRpgPack(index, withJune ? 1010 : 1009);
  if (withJune) state.flags.june_pike_present = true;
  return state;
}

function commitDrive(withJune = false): GameState {
  let state = fresh(withJune);
  state = act(state, "go_north");
  state = act(state, "talk_houndsman");
  state = act(state, "ask_drive");

  expect(state.flags.strategy_drive_committed).not.toBe(true);
  expect(buildRpgObservation(index, state).dialogue?.npc_text).toMatch(
    /read, prepare, and don[^]*before you commit[^]*starts the cattle immediately[^]*every completion forfeits the steading's outer defense line[^]*no later switch to lure or spear combat/i,
  );
  expect(
    enumerateRpgActions(index, state).find((option) => option.id === "ask_commit_drive")?.command,
  ).toMatch(
    /commit[^]*finite drive-and-evacuate[^]*start the herd[^]*close preparation and retreat[^]*forfeit the outer steading defense line/i,
  );

  state = act(state, "ask_commit_drive");
  expect(state).toMatchObject({
    flags: { strategy_drive_committed: true, drive_combat_withheld: true },
    vars: { drive_kit_charges: 2, pack_drive: 0 },
  });
  expect(state.flags.strategy_lure_committed).not.toBe(true);

  expect(actionIds(state)).not.toContain("ask_lure");
  expect(actionIds(state)).not.toContain("ask_drive");
  state = act(state, "ask_leave");
  expect(actionIds(state)).toContain("take_drive_signal_rope_kit");
  state = act(state, "take_drive_signal_rope_kit");
  expect(state.inventory).toContain("drive_signal_rope_kit");
  return state;
}

function reachCrisis(opening: Roll, withJune = false): GameState {
  let state = commitDrive(withJune);
  state = act(state, "go_north");
  state = act(state, "use_drive_signal_rope_kit_on_drive_breach_signal", opening);

  if (opening === "worst") {
    expect(state).toMatchObject({
      flags: { drive_opening_fouled: true },
      vars: { drive_kit_charges: 1, pack_drive: 2, cattle_alarm: 1 },
    });
    expect(actionIds(state)).not.toContain("use_drive_signal_rope_kit_on_drive_breach_signal");
    expect(actionIds(state)).toContain("use_drive_hurdle_recovery");
    expectCommittedDriveWithholdsCombat(state);
    expect(actionIds(state)).toContain("examine_drive_breach_signal");
    expect(objectDescription(index.objects.get("drive_breach_signal")!, state)).toMatch(
      /single spent call[^]*no retry/i,
    );
    expect(buildRpgObservation(index, state).pressure_tracks).toContainEqual(
      expect.objectContaining({
        id: "pack_drive",
        value: 2,
        band: expect.objectContaining({ label: "Crisis" }),
      }),
    );
    state = act(state, "use_drive_hurdle_recovery");
    expect(state.flags.drive_opening_fouled).toBe(true);
  }

  expect(state.flags.drive_yearling_turned).toBe(true);
  expect(state.flags.yearling_down).not.toBe(true);
  expect(buildRpgObservation(index, state).enemies_present).toEqual([]);
  state = act(state, "go_north");
  state = act(state, "use_drive_signal_rope_kit_on_drive_threshold_line");
  expect(state).toMatchObject({
    flags: { drive_flank_turned: true },
    vars: { drive_kit_charges: 0, pack_drive: opening === "best" ? 2 : 3 },
  });
  expect(state.flags.flank_wolf_down).not.toBe(true);
  state = act(state, "go_north");

  if (withJune) {
    const beforeJune = actionIds(state);
    expect(beforeJune).toContain("talk_june_pike_drive");
    expect(beforeJune).not.toContain("use_cattle_crisis_priority");
    expect(beforeJune).not.toContain("use_person_crisis_priority");
    expect(beforeJune).not.toContain("use_reserve_crisis_priority");
    state = act(state, "talk_june_pike_drive");
    expect(state.flags.june_drive_cattle_line_taken).toBe(true);
    expect(state.flags.june_blood_condition_broken).not.toBe(true);
    state = act(state, "ask_acknowledge");
  }

  expect(actionIds(state)).toEqual(
    expect.arrayContaining([
      "use_cattle_crisis_priority",
      "use_person_crisis_priority",
      "use_reserve_crisis_priority",
    ]),
  );
  return state;
}

function finishPriority(priority: Priority, withJune = false): GameState {
  let state = reachCrisis("best", withJune);
  state = act(state, `use_${priority}_crisis_priority`);

  const finalActions = actionIds(state).filter(
    (id) => id.startsWith("use_") && id.endsWith("_evacuation"),
  );
  const expectedFinal = {
    cattle: "use_cattle_first_evacuation",
    person: "use_person_first_evacuation",
    reserve: "use_reserve_spent_evacuation",
  }[priority];
  expect(finalActions).toEqual([expectedFinal]);

  if (priority !== "reserve") {
    expect(actionIds(state)).toContain("examine_drive_signal_rope_kit");
    expect(objectDescription(index.objects.get("drive_signal_rope_kit")!, state)).toMatch(
      /preserves[^]*closed the option to sacrifice/i,
    );
  }

  state = act(state, expectedFinal);
  expect(state.ended).toBe(true);
  expect(state.flags.yearling_down).not.toBe(true);
  expect(state.flags.flank_wolf_down).not.toBe(true);
  expect(state.flags.leader_down).not.toBe(true);
  expect(buildRpgObservation(index, state).pressure_tracks).toContainEqual(
    expect.objectContaining({
      id: "pack_drive",
      value: 6,
      band: expect.objectContaining({ label: "Cleared" }),
      next: null,
    }),
  );
  return state;
}

describe("SS-F10 — drive-and-evacuate crisis priority", () => {
  it("requires explanation before a drive commitment that permanently excludes the lure", () => {
    let staleDrive = fresh();
    staleDrive = act(staleDrive, "go_north");
    staleDrive = act(staleDrive, "talk_houndsman");
    staleDrive = act(staleDrive, "ask_drive");
    expect(actionIds(staleDrive)).toContain("ask_commit_drive");
    staleDrive = act(staleDrive, "go_north");
    staleDrive = act(staleDrive, "go_south");
    expect(actionIds(staleDrive)).not.toContain("ask_commit_drive");

    let staleLure = fresh();
    staleLure = act(staleLure, "go_north");
    staleLure = act(staleLure, "talk_houndsman");
    staleLure = act(staleLure, "ask_lure");
    expect(actionIds(staleLure)).toContain("ask_commit_lure");
    staleLure = act(staleLure, "go_north");
    staleLure = act(staleLure, "go_south");
    expect(actionIds(staleLure)).not.toContain("ask_commit_lure");

    const drive = commitDrive();
    expect(drive.flags.strategy_drive_committed).toBe(true);
    expect(drive.flags.strategy_lure_committed).not.toBe(true);
    expect(actionIds(drive)).not.toContain("go_south");
    expect(actionIds(drive)).not.toContain("go_west");
    expect(buildRpgObservation(index, drive).blocked_exits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          direction: "south",
          message: expect.stringMatching(/go north/i),
        }),
        expect.objectContaining({
          direction: "west",
          message: expect.stringMatching(/before commit/i),
        }),
      ]),
    );

    const launched = act(drive, "go_north");
    expect(actionIds(launched)).not.toContain("go_south");
    expectCommittedDriveWithholdsCombat(launched);
    expect(buildRpgObservation(index, launched).blocked_exits).toContainEqual(
      expect.objectContaining({
        direction: "south",
        message: expect.stringMatching(
          /hard strategy commitment[^]*does not reopen[^]*switch to combat/i,
        ),
      }),
    );

    let lure = fresh();
    lure = act(lure, "go_north");
    lure = act(lure, "talk_houndsman");
    lure = act(lure, "ask_lure");
    expect(lure.flags.strategy_lure_committed).not.toBe(true);
    lure = act(lure, "ask_commit_lure");
    expect(lure.flags.strategy_lure_committed).toBe(true);
    expect(actionIds(lure)).not.toContain("ask_drive");
  });

  it("retires unread and carried preparation when the herd starts", () => {
    let state = fresh();
    state = act(state, "go_north");
    state = act(state, "go_west");
    state = act(state, "take_byre_jerkin");
    state = act(state, "go_east");

    expect(state.flags.read_tally).not.toBe(true);
    expect(state.flags.jerkin_donned).not.toBe(true);
    expect(state.inventory).toContain("byre_jerkin");
    expect(actionIds(state)).toContain("read_day_book");
    expect(actionIds(state)).toContain("use_byre_jerkin");

    state = act(state, "talk_houndsman");
    state = act(state, "ask_drive");
    state = act(state, "ask_commit_drive");
    state = act(state, "ask_leave");

    expect(state.flags).toMatchObject({
      strategy_drive_committed: true,
      drive_combat_withheld: true,
    });
    expect(state.flags.read_tally).not.toBe(true);
    expect(state.flags.jerkin_donned).not.toBe(true);
    expect(state.inventory).toContain("byre_jerkin");
    expect(actionIds(state)).not.toContain("read_day_book");
    expect(actionIds(state)).not.toContain("use_byre_jerkin");
    expect(state.vars.defense).toBe(3);
    expect(state.vars.score ?? 0).toBe(0);
  });

  it("spends two finite charges on two different drive actions and fails forward without a retry", () => {
    const state = reachCrisis("worst");

    expect(state.flags).toMatchObject({
      drive_opening_fouled: true,
      drive_yearling_turned: true,
      drive_flank_turned: true,
    });
    expect(state.vars).toMatchObject({ drive_kit_charges: 0, pack_drive: 3 });
    expect(state.vars.score ?? 0).toBe(0);
    expect(state.inventory).toContain("drive_signal_rope_kit");
    expect(state.journal.join("\n")).toMatch(/no retry[^]*loose hurdle[^]*second and final/i);
    expect(state.flags.june_blood_condition_broken).not.toBe(true);
  });

  it("withholds every enemy and combat action through the hard-committed drive", () => {
    let state = commitDrive(true);
    state = act(state, "go_north");
    expectCommittedDriveWithholdsCombat(state);
    expect(actionIds(state)).toContain("use_drive_signal_rope_kit_on_drive_breach_signal");

    state = act(state, "use_drive_signal_rope_kit_on_drive_breach_signal", "worst");
    expectCommittedDriveWithholdsCombat(state);
    expect(actionIds(state)).toContain("use_drive_hurdle_recovery");
    expect(actionIds(state)).not.toContain("use_drive_signal_rope_kit_on_drive_breach_signal");

    state = act(state, "use_drive_hurdle_recovery");
    expectCommittedDriveWithholdsCombat(state);
    state = act(state, "go_north");
    expectCommittedDriveWithholdsCombat(state);
    expect(actionIds(state)).toContain("use_drive_signal_rope_kit_on_drive_threshold_line");

    state = act(state, "use_drive_signal_rope_kit_on_drive_threshold_line");
    expectCommittedDriveWithholdsCombat(state);
    expect(actionIds(state)).not.toContain("go_south");
    expect(actionIds(state)).toContain("go_north");
  });

  it("makes all three crisis costs persistent and changes the only legal final action", () => {
    const cattle = finishPriority("cattle", true);
    const person = finishPriority("person");
    const reserve = finishPriority("reserve");

    expect(cattle).toMatchObject({
      endingId: "ending_drive_cattle_wounded",
      flags: { drive_courier_wounded: true },
      vars: { hp: 24, cattle_alarm: 0, pack_drive: 6, score: 35 },
    });
    expect(cattle.inventory).toContain("drive_signal_rope_kit");
    expect(cattle.flags.june_drive_cattle_line_taken).toBe(true);
    expect(buildRpgObservation(index, cattle).ending?.text).toMatch(
      /June Pike[^]*Cade and every rider are clear[^]*wound[^]*abandoned outer steading line/i,
    );

    expect(person).toMatchObject({
      endingId: "ending_drive_person_cattle_lost",
      flags: { drive_cattle_lost: true },
      vars: { hp: 30, cattle_alarm: 4, pack_drive: 6, score: 35 },
    });
    expect(person.inventory).toContain("drive_signal_rope_kit");
    expect(buildRpgObservation(index, person).ending?.text).toMatch(
      /every rider clear[^]*two cattle[^]*outer steading defense line was abandoned/i,
    );

    expect(reserve).toMatchObject({
      endingId: "ending_drive_reserve_spent",
      flags: { drive_reserve_spent: true },
      vars: { hp: 30, cattle_alarm: 0, pack_drive: 6, score: 35 },
    });
    expect(reserve.inventory).not.toContain("drive_signal_rope_kit");
    expect(buildRpgObservation(index, reserve).ending?.text).toMatch(
      /signal-and-rope rig does not return[^]*Cade and every rider are clear[^]*outer steading defense line was abandoned/i,
    );
  });

  it("keeps ordinary combat available when the player hears but declines the drive", () => {
    let state = fresh();
    state = act(state, "go_north");
    state = act(state, "talk_houndsman");
    state = act(state, "ask_drive");
    state = act(state, "ask_leave");

    expect(state.flags.strategy_drive_committed).not.toBe(true);
    expect(state.flags.drive_combat_withheld).not.toBe(true);
    state = act(state, "go_north");
    expect(buildRpgObservation(index, state).enemies_present.map((enemy) => enemy.id)).toEqual([
      "yearling_wolf",
    ]);
    expect(actionIds(state)).toContain("maneuver_yearling_wolf_set_spear");
    expect(actionIds(state).some((id) => id.includes("drive_breach_signal"))).toBe(false);
    state = act(state, "maneuver_yearling_wolf_set_spear", "worst");
    expect(state.flags.yearling_down).not.toBe(true);
    expect(actionIds(state)).toContain("maneuver_yearling_wolf_drive_set_spear");
  });
});
