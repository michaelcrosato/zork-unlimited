/**
 * Regression for bug_0530: Gallowmere's failed kill-site tracking roll once
 * allowed unlimited free rerolls. The first uncertain reading must now lead to
 * one deterministic same-id recovery that preserves the original combat prep.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameEvent } from "../../src/core/events.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { parseCommand } from "../../src/rpg/command_map.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

function queuedRng(rolls: number[]): Rng {
  return {
    next: () => 0,
    int: () => {
      const roll = rolls.shift();
      if (roll === undefined) throw new Error("test RNG exhausted");
      return roll;
    },
  };
}

const loaded = loadRpgSourceFile("content/rpg/quests/gallowmere.yaml");
if (!loaded.ok) throw new Error("gallowmere must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);

function actionIds(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

function action(state: GameState, id: string) {
  const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === id);
  if (!option) {
    throw new Error(`"${id}" not legal in ${state.current}: [${actionIds(state).join(", ")}]`);
  }
  return option;
}

function narration(events: GameEvent[]): string {
  return events
    .filter(
      (event): event is Extract<GameEvent, { type: "narration" }> => event.type === "narration",
    )
    .map((event) => event.text)
    .join(" ");
}

describe("bug_0530 — Gallowmere tracking failure becomes finite fail-forward", () => {
  it("turns one failed tracking roll into deterministic same-id recovery without losing prep", () => {
    const rng = queuedRng([1, 20]);
    const step = makeStep(buildRpgRules(index, () => rng));
    let state = initStateForRpgPack(index, 7);

    for (const id of ["go_north", "go_east"]) {
      const result = step(state, action(state, id).action);
      expect(result.ok, result.rejectionReason).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      state = result.state;
    }

    expect(
      actionIds(state).filter((id) => id === "use_hunting_knife_on_spoor_ground"),
    ).toHaveLength(1);
    const firstAttempt = action(state, "use_hunting_knife_on_spoor_ground");
    expect(firstAttempt.command).toBe("track kill-site ground with hunting-knife");
    expect(parseCommand(index, state, firstAttempt.command)).toEqual({
      ok: true,
      action: firstAttempt.action,
    });
    expect(firstAttempt.skill_check).toMatchObject({ skill: "tracking", difficulty: 10 });
    const failed = step(state, firstAttempt.action);
    expect(failed.ok, failed.rejectionReason).toBe(true);
    if (!failed.ok) throw new Error("unreachable");
    state = failed.state;

    expect(narration(failed.events)).toContain(
      "TRACK kill-site ground from a lower stance WITH hunting-knife",
    );
    expect(state.flags).toEqual({ kill_site_attempted: true });
    expect(state.vars.attack).toBe(4);
    expect(state.vars.score ?? 0).toBe(0);
    expect(state.questStage).toEqual({});
    expect(state.journal).toEqual([
      "Your first TRACK attempt failed. TRACK kill-site ground from a lower stance WITH hunting-knife for a guaranteed retry.\n",
    ]);
    expect(
      actionIds(state).filter((id) => id === "use_hunting_knife_on_spoor_ground"),
    ).toHaveLength(1);
    expect(buildRpgObservation(index, state).description).toMatch(
      /first TRACK attempt failed[^]*TRACK kill-site ground from a lower stance WITH hunting-knife[^]*retry is guaranteed/i,
    );
    const recovery = action(state, "use_hunting_knife_on_spoor_ground");
    expect(recovery.command).toBe("track kill-site ground from a lower stance with hunting-knife");
    expect(parseCommand(index, state, recovery.command)).toEqual({
      ok: true,
      action: recovery.action,
    });
    expect(recovery.skill_check).toBeUndefined();

    const recovered = step(state, recovery.action);
    expect(recovered.ok, recovered.rejectionReason).toBe(true);
    if (!recovered.ok) throw new Error("unreachable");
    state = recovered.state;

    expect(narration(recovered.events)).not.toContain("tracking check:");
    expect(state.flags).toEqual({ kill_site_attempted: true, found_kill: true });
    expect(state.vars.attack).toBe(6);
    expect(state.vars.score).toBe(10);
    expect(state.questStage).toEqual({ gallowmere_hunt: "kill_read" });
    expect(state.journal).toEqual([
      "Your first TRACK attempt failed. TRACK kill-site ground from a lower stance WITH hunting-knife for a guaranteed retry.\n",
      "You TRACKED the kill-site ground. The spoor shows that the Gallowmere sow pivoted right and raised her left tusk when charging. (+2 attack)\n",
    ]);
    expect(
      actionIds(state).filter((id) => id === "use_hunting_knife_on_spoor_ground"),
    ).toHaveLength(0);

    for (const id of ["go_west", "go_north", "use_hunting_knife_on_wind_stone", "go_north"]) {
      const result = step(state, action(state, id).action);
      expect(result.ok, result.rejectionReason).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      state = result.state;
    }

    expect(state.current).toBe("moor_hollow");
    expect(actionIds(state)).toContain("use_hunting_knife_on_sow_blind_side");
    expect(validateRpg(pack).findings.filter((finding) => finding.severity === "error")).toEqual(
      [],
    );
  });
});
