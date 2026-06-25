/**
 * Regression for bug_0446 — The Dawn Beacon's final cresset check should not feel
 * like arbitrary finish-line churn.
 *
 * The seed-7 blind pass won cleanly, but called out the climactic toppled-cresset
 * check as the one genuine friction point: a DC 12 might roll with no boost path can
 * fail repeatedly right before victory. The interaction was already recoverable, but
 * the odds and failure copy did not make that retry loop feel intentional enough.
 *
 * Locked here:
 *   (1) the offered cresset command advertises the easier d20 + might vs 10 check;
 *   (2) a forced failed roll narrates concrete progress and an explicit heave-again
 *       retry, without setting the cresset stage or awarding score;
 *   (3) after that failed roll the same lever command remains legal; and
 *   (4) the pack remains RPG-validator clean.
 */
import { describe, it, expect } from "vitest";
import { actionEquals, makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";
import type { Effect } from "../../src/core/effects.js";
import type { Rng } from "../../src/core/rng.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

const PACK_PATH = "content/rpg/pack/dawn_beacon.yaml";
const loaded = loadRpgPackFile(PACK_PATH);
if (!loaded.ok) throw new Error("dawn_beacon must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);

const LOW = 0;
const minRollRng = (): Rng => ({
  next: () => LOW,
  int: (min: number) => Math.ceil(min),
});

const rules = buildRpgRules(index, () => minRollRng());
const step = makeStep(rules);
const CRESSET_USE: Action = { type: "USE", item: "winch_bar", target: "cresset" };

function onBeaconStage(): GameState {
  const s = initStateForRpgPack(index, 7);
  return {
    ...s,
    current: "beacon_stage",
    inventory: [...s.inventory, "winch_bar"],
    visited: { ...s.visited, beacon_stage: true },
  };
}

function cressetOption(s: GameState) {
  return enumerateRpgActions(index, s).find((o) => actionEquals(o.action, CRESSET_USE));
}

const narrations = (effects: Effect[]): string[] =>
  effects.filter((e): e is { narrate: string } => "narrate" in e).map((e) => e.narrate);

describe("bug_0446 — Dawn Beacon cresset retry is easier and legible", () => {
  it("advertises the cresset as a d20 + might vs 10 check", () => {
    const opt = cressetOption(onBeaconStage());
    expect(opt?.command).toBe("lever toppled cresset with iron winch-bar");
    expect(opt?.skill_check).toEqual({ skill: "might", difficulty: 10, die: "d20" });
  });

  it("failed cresset rolls narrate progress and an explicit retry without awarding progress", () => {
    const res = rules.resolve(onBeaconStage(), CRESSET_USE);
    expect(res).not.toBeNull();
    const text = narrations(res!.effects).join("\n");
    expect(text).toContain("might check: d20 1 + 3 = 4 vs 10 — failure.");
    expect(text).toMatch(/rocks a handspan toward its socket/i);
    expect(text).toMatch(/heave again until the pivot catches/i);
    expect(res!.effects.some((e) => "set_quest_stage" in e || "inc_var" in e)).toBe(false);
  });

  it("after a failed heave the lever action remains legal", () => {
    const r = step(onBeaconStage(), CRESSET_USE);
    expect(r.ok).toBe(true);
    expect(r.state.questStage["beacon"]).not.toBe("cresset_raised");
    expect(r.state.vars["score"] ?? 0).toBe(0);
    expect(cressetOption(r.state)?.skill_check).toEqual({
      skill: "might",
      difficulty: 10,
      die: "d20",
    });
  });

  it("still validates green under the RPG validator", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
