/**
 * Regression (§15) for bug_0189 — The Wolf-Winter: the project's FOURTH RPG pack and
 * the SECOND to set `meta.combat_guaranteed: true` (after The Dawn Beacon, bug_0187).
 *
 * Where the Dawn Beacon is a fair TWO-fight gauntlet, this is a fair THREE-fight one —
 * the first curated pack to drive the cumulative-HP gauntlet bound
 * (COMBAT_GAUNTLET_NOT_GUARANTEED, bug_0172) across three sequential fights. The
 * cumulative bound is an order-independent OVER-approximation of worst total damage
 * (Σ per-fight worst-case maxDamageTaken), so a third fight makes the surface strictly
 * harder to satisfy than two: more fights to sum, the same reachable-HP budget.
 *
 * This pins the pack-specific claims (the auto-discovered suites already prove the
 * generic structure — all-endings reachability, no soft-lock pocket, score economy,
 * action-id uniqueness, variant liveness — for every pack the moment it ships):
 *   (1) the pack validates with ZERO errors AND genuinely opts in
 *       (combat_guaranteed === true) over THREE enemies, with BOTH guarantee codes
 *       ABSENT — the fair three-fight gauntlet GREEN on disk;
 *   (2) BOTH prep buffs are load-bearing on the validator's maneuver-aware CUMULATIVE
 *       bound. Best reachable stats are
 *       atk7 (base 5 + Cade's +2 counsel) / def5 (base 3 + the byre-jerkin's +2) /
 *       hp30, and the wolves are def2, atk 4/5/6, hp 11/12/13. For each enemy the
 *       verifier conservatively retains the abstract standard leader line:
 *       max(5,5) + max(6,9) + max(14,10) = 28 < 30. Zeroing defense raises those
 *       maxima to 7 + 11 + 18 = 36; zeroing attack raises them to 9 + 14 + 21 = 44.
 *       Each fight still fits within 30 HP alone, so only
 *       the cumulative guarantee breaks.
 *   (3) The concrete runtime guarantee is stronger and separate: with both persistent
 *       buffs, all six original flank/leader pairs plus the linked brace-stake route
 *       survive the entire gauntlet on worst rolls. Differential runtime witnesses show why each prep buff
 *       still matters to the universal promise: the riskiest no-attack line costs 39 HP
 *       and the riskiest no-defense line costs exactly 30.
 *
 * Out-of-band teeth: the differential mutations below were confirmed to flip the
 * report RED on the cumulative code while leaving the per-fight code absent, and the
 * unmutated pack is clean — a genuine guarantee witness, not a vacuous green.
 */
import { describe, it, expect } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import type { RpgPack } from "../../src/rpg/schema.js";
import type { Effect } from "../../src/core/effects.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";

const PACK_PATH = "content/rpg/quests/wolf_winter.yaml";

function loadPack(): RpgPack {
  const r = loadRpgSourceFile(PACK_PATH);
  expect(r.ok, "wolf_winter must load").toBe(true);
  if (!r.ok) throw new Error("unreachable");
  return r.compiled.pack;
}

function codes(pack: RpgPack): string[] {
  return validateRpg(pack, {
    extraSettableFlags: ["jamie_market_testimony_certified", "hayden_frost_report_certified"],
  }).findings.map((f) => f.code);
}

/**
 * Zero the `by` of any `inc_var` targeting `varName` across every effect list in a
 * compiled RPG pack — statCeiling credits Math.max(0, by), so `by: 0` removes that
 * buff from the player's best-reachable stat without changing the pack's shape (the
 * same probe used by the Dawn Beacon witness, bug_0187).
 */
function zeroBuff(pack: RpgPack, varName: string): RpgPack {
  const clone = structuredClone(pack);
  const scrub = (effects: Effect[] | undefined): void => {
    for (const e of effects ?? [])
      if ("inc_var" in e && e.inc_var.name === varName) e.inc_var.by = 0;
  };
  for (const r of clone.rooms) scrub(r.on_enter);
  for (const o of clone.objects) {
    for (const it of o.interactions) {
      scrub(it.effects);
      scrub(it.skill_check?.on_success);
      scrub(it.skill_check?.on_failure);
    }
  }
  for (const n of clone.npcs) for (const node of n.dialogue.nodes) scrub(node.effects);
  for (const en of clone.enemies) scrub(en.on_defeat);
  return clone;
}

function withInitialHp(pack: RpgPack, hp: number): RpgPack {
  const clone = structuredClone(pack);
  clone.meta.vars_init.hp = hp;
  return clone;
}

type FlankOpening = "funnel_thrust" | "offside_cut" | "splinter_guard";
type LeaderOpening = "wait_out_feint" | "close_on_feint";

const FLANK_CHILD: Record<FlankOpening, string> = {
  funnel_thrust: "pin_at_rail",
  offside_cut: "turn_through_return",
  splinter_guard: "hook_over_guard",
};

const FLANK_CHILD_FLAG: Record<FlankOpening, string> = {
  funnel_thrust: "flank_pinned_at_rail",
  offside_cut: "flank_turned_through_return",
  splinter_guard: "flank_hooked_over_guard",
};

const LEADER_CHILD: Record<LeaderOpening, string> = {
  wait_out_feint: "take_true_rush",
  close_on_feint: "drive_before_recovery",
};

const LEADER_CHILD_FLAG: Record<LeaderOpening, string> = {
  wait_out_feint: "leader_true_rush_taken",
  close_on_feint: "leader_driven_before_recovery",
};

function fixedOutcomeRng(outcome: "best" | "worst"): Rng {
  let roll = 0;
  return {
    next: () => (outcome === "best" ? 0.999999 : 0),
    int: (min: number, max: number) => {
      const first = roll++ === 0;
      if (outcome === "best") return first ? max : min;
      return first ? min : max;
    },
  };
}

/**
 * Drive one fully-prepared tactical line. The rail roll succeeds for the braced
 * routes or fails and is explicitly salvaged for the recovered route; every combat
 * beat uses the player's worst d6 followed by the wolf's best d6.
 */
function playPreparedWorst(
  sourcePack: RpgPack,
  flankOpening: FlankOpening,
  leaderOpening: LeaderOpening,
): GameState {
  const index = indexRpgPack(sourcePack);
  let state = initStateForRpgPack(index, 189);
  const stepFor = (outcome: "best" | "worst") =>
    makeStep(buildRpgRules(index, () => fixedOutcomeRng(outcome)));

  const act = (id: string, outcome: "best" | "worst" = "best"): void => {
    const available = enumerateRpgActions(index, state);
    const option = available.find((candidate) => candidate.id === id);
    expect(
      option,
      `expected ${id} in ${state.current}; available: ${available.map((candidate) => candidate.id).join(", ")}`,
    ).toBeDefined();
    if (!option) throw new Error(`missing ${id}`);
    const result = stepFor(outcome)(state, option.action);
    expect(result.ok, result.rejectionReason).toBe(true);
    state = result.state;
  };
  const finish = (enemy: string, defeatFlag: string): void => {
    for (let guard = 0; guard < 10 && !state.ended && !state.flags[defeatFlag]; guard += 1) {
      act(`attack_${enemy}`, "worst");
    }
  };

  act("go_north");
  act("talk_houndsman");
  act("ask_wolves"); // +2 attack
  act("ask_byre"); // both leader openings + the rail plan
  act("ask_leave");
  act("go_west");
  act("take_byre_jerkin");
  act("use_byre_jerkin"); // +2 defense
  act("go_east");
  act("go_north");
  act("use_paling_rail", flankOpening === "splinter_guard" ? "worst" : "best");
  if (flankOpening === "splinter_guard") act("use_paling_rail"); // bind the failed rail

  act("maneuver_yearling_wolf_set_spear", "worst");
  if (state.ended) return state;
  if (!state.flags.yearling_down) act("maneuver_yearling_wolf_drive_set_spear", "worst");
  finish("yearling_wolf", "yearling_down");
  if (state.ended) return state;
  act("go_north");
  act(`maneuver_flank_wolf_${flankOpening}`, "worst");
  if (state.ended) return state;
  if (!state.flags.flank_wolf_down)
    act(`maneuver_flank_wolf_${FLANK_CHILD[flankOpening]}`, "worst");
  finish("flank_wolf", "flank_wolf_down");
  if (state.ended) return state;
  act("go_north");
  act(`maneuver_grey_leader_${leaderOpening}`, "worst");
  if (state.ended) return state;
  if (!state.flags.leader_down) act(`maneuver_grey_leader_${LEADER_CHILD[leaderOpening]}`, "worst");
  finish("grey_leader", "leader_down");
  if (state.ended) return state;
  act("go_north");
  return state;
}

const OPENING_COMBINATIONS: ReadonlyArray<{
  flank: FlankOpening;
  leader: LeaderOpening;
  expectedHp: number;
  endingFragments: readonly string[];
}> = [
  {
    flank: "funnel_thrust",
    leader: "wait_out_feint",
    expectedHp: 18,
    endingFragments: ["braced rail", "true rush"],
  },
  {
    flank: "funnel_thrust",
    leader: "close_on_feint",
    expectedHp: 12,
    endingFragments: ["braced rail", "recover"],
  },
  {
    flank: "offside_cut",
    leader: "wait_out_feint",
    expectedHp: 12,
    endingFragments: ["off-side return", "true rush"],
  },
  {
    flank: "offside_cut",
    leader: "close_on_feint",
    expectedHp: 6,
    endingFragments: ["flank-wolf's return", "recover"],
  },
  {
    flank: "splinter_guard",
    leader: "wait_out_feint",
    expectedHp: 17,
    endingFragments: ["failed rail", "true rush"],
  },
  {
    flank: "splinter_guard",
    leader: "close_on_feint",
    expectedHp: 11,
    endingFragments: ["failed rail", "recover"],
  },
];

describe("bug_0189 — The Wolf-Winter: a fair THREE-fight combat_guaranteed gauntlet", () => {
  it("validates clean and genuinely opts in over THREE fights, both guarantee codes absent", () => {
    const pack = loadPack();
    expect(pack.meta.combat_guaranteed).toBe(true);
    expect(pack.enemies.length).toBe(3); // a three-fight GAUNTLET, harder cumulative surface
    const report = validateRpg(pack, {
      extraSettableFlags: ["jamie_market_testimony_certified", "hayden_frost_report_certified"],
    });
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    const c = report.findings.map((f) => f.code);
    expect(c).not.toContain("COMBAT_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_UNWINNABLE");
  });

  it("pins the maneuver-aware cumulative upper bound at exactly 28 HP", () => {
    const atBoundary = codes(withInitialHp(loadPack(), 28));
    expect(atBoundary).toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
    expect(atBoundary).not.toContain("COMBAT_NOT_GUARANTEED");

    const oneAbove = codes(withInitialHp(loadPack(), 29));
    expect(oneAbove).not.toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
    expect(oneAbove).not.toContain("COMBAT_NOT_GUARANTEED");
  });

  it("concretely survives worst rolls under all six original tactical route pairs", () => {
    const sourcePack = loadPack();
    const sourceIndex = indexRpgPack(sourcePack);
    for (const combination of OPENING_COMBINATIONS) {
      const state = playPreparedWorst(sourcePack, combination.flank, combination.leader);
      expect(
        state.endingId,
        `${combination.flank} + ${combination.leader} must hold the byre`,
      ).toBe("ending_held");
      expect(state.vars.hp).toBe(combination.expectedHp);
      expect(state.flags.heard_counsel).toBe(true);
      expect(state.flags.heard_plan).toBe(true);
      expect(state.flags.jerkin_donned).toBe(true);
      expect(state.flags.yearling_spear_driven).toBe(true);
      expect(state.flags[FLANK_CHILD_FLAG[combination.flank]]).toBe(true);
      expect(state.flags[LEADER_CHILD_FLAG[combination.leader]]).toBe(true);
      expect(state.inventory).not.toContain("split_rail_guard");
      expect(state.vars).toMatchObject({ attack: 7, defense: 5 });
      const endingText = buildRpgObservation(sourceIndex, state).ending?.text.toLowerCase() ?? "";
      for (const fragment of combination.endingFragments) {
        expect(endingText).toContain(fragment);
      }
    }
  });

  it("keeps both persistent buffs load-bearing in concrete worst-roll tactical play", () => {
    const noAttackBuff = zeroBuff(loadPack(), "attack");
    // Without Cade's +2 attack, the safest guarded pair costs 29 and barely survives
    // the base 30 HP, but the exposed off-side + close pair costs exactly 39. The
    // universal promise is therefore broken even though one cautious line remains.
    const noAttackSafe = playPreparedWorst(noAttackBuff, "funnel_thrust", "wait_out_feint");
    expect(noAttackSafe.endingId).toBe("ending_held");
    expect(noAttackSafe.vars.hp).toBe(1);

    const noAttackAt40 = withInitialHp(noAttackBuff, 40);
    const attackAbove = playPreparedWorst(noAttackAt40, "offside_cut", "close_on_feint");
    expect(attackAbove.endingId).toBe("ending_held");
    expect(attackAbove.vars.hp).toBe(1);
    const noAttackAt39 = withInitialHp(noAttackBuff, 39);
    const attackBoundary = playPreparedWorst(noAttackAt39, "offside_cut", "close_on_feint");
    expect(
      noAttackAt39.endings.find((candidate) => candidate.id === attackBoundary.endingId)?.death,
    ).toBe(true);
    expect(attackBoundary.vars.hp).toBe(0);

    // Without the jerkin's +2 defense, the riskiest prepared pair costs exactly
    // 30 HP. The tactics cannot smuggle universal safety past Cade's "both" promise.
    const noDefenseBuff = zeroBuff(loadPack(), "defense");
    const noDefenseAt31 = withInitialHp(noDefenseBuff, 31);
    const defenseAbove = playPreparedWorst(noDefenseAt31, "offside_cut", "close_on_feint");
    expect(defenseAbove.endingId).toBe("ending_held");
    expect(defenseAbove.vars.hp).toBe(1);
    const boundary = playPreparedWorst(noDefenseBuff, "offside_cut", "close_on_feint");
    expect(
      noDefenseBuff.endings.find((candidate) => candidate.id === boundary.endingId)?.death,
    ).toBe(true);
    expect(boundary.vars.hp).toBe(0);
  });

  it("the maneuver-aware bound needs the byre-jerkin on the CUMULATIVE bound alone", () => {
    // def5→3: the conservative per-enemy maxima 7/11/18 each fit 30 HP, total 36.
    const c = codes(zeroBuff(loadPack(), "defense"));
    expect(c).toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_NOT_GUARANTEED"); // every single fight still clears
    expect(c).not.toContain("COMBAT_UNWINNABLE"); // and stays best-case winnable
  });

  it("the maneuver-aware bound needs Cade's attack buff cumulatively too", () => {
    // atk7→5: the conservative per-enemy maxima 9/14/21 each fit 30 HP, total 44.
    const c = codes(zeroBuff(loadPack(), "attack"));
    expect(c).toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_NOT_GUARANTEED"); // every single fight still clears
    expect(c).not.toContain("COMBAT_UNWINNABLE");
  });

  it("stripping BOTH buffs still only ever breaks the cumulative guarantee, never winnability", () => {
    // The unprepared hunter (base atk5/def3) can still WIN on lucky rolls — the fights
    // stay a genuine gamble (the death ending is reachable, never an unwinnable wall) —
    // so COMBAT_UNWINNABLE (the best-case lower bound) must stay absent even with no prep.
    const stripped = zeroBuff(zeroBuff(loadPack(), "defense"), "attack");
    const c = codes(stripped);
    expect(c).toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
    expect(c).not.toContain("COMBAT_UNWINNABLE");
  });

  it("the score economy sums to the declared max (5 + 5 + 5 + 10·3 + 15 = 60, bug_0239)", () => {
    const pack = loadPack();
    // bug_0239: the two prep acts (heed counsel, don jerkin) now score +5 each on top of
    // the day-book +5, the three +10 wolf kills, and the +15 cattle capstone.
    expect(pack.meta.max_score).toBe(60);
  });
});
