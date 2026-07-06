/**
 * Regression (§15) for bug_0196 — The Breaking Weir: the project's FIFTH RPG pack and
 * the FIRST COMBATLESS one (`enemies: []`). Its whole spine is a CHAIN OF SKILL CHECKS
 * over the same deterministic RPG core — three distinct skills (craft / nerve / might),
 * each a seeded d20 + skill vs a difficulty gating a flag — with no ATTACK and no fight.
 *
 * The auto-discovered RPG suites already prove the generic structure for every pack the
 * moment it ships: all-endings reachability (both ending_held and ending_swept), no
 * soft-lock pocket, score economy (max == 50), action-id uniqueness, variant liveness.
 * This pins the pack-SPECIFIC claims those generic suites do not:
 *
 *   (1) it is genuinely combatless — zero enemies — yet validates clean as an RPG pack
 *       (mode is detected by the PRESENCE of the `enemies` key, src/mcp/types.ts), and
 *       NO combat code can fire (there are no enemies to attack);
 *   (2) the ONE lethal obstacle — the storm-walk nerve crossing (DC 9) — encodes the
 *       prep-vs-gamble contract (bug_0114, here transposed from combat to a skill check)
 *       and is HONEST about it, proven by driving the real resolveSkillCheck on the
 *       player's WORST roll (d20 = 1):
 *         - PREPARED (Pell's +5 counsel → nerve 8): 1 + 8 = 9 >= 9, the crossing SUCCEEDS
 *           on the worst possible roll — heeding Pell makes the killing walk safe, exactly
 *           as the prose promises (the success branch sets walk_crossed, never ends the game);
 *         - UNPREPARED (base nerve 3): 1 + 3 = 4 < 9, the worst roll FAILS and the failure
 *           branch ends the game at ending_swept — so the death is genuinely reachable for
 *           the rash, and the +5 nerve counsel is load-bearing, not decorative.
 *       (The mechanical rack/winch checks are deliberately NON-lethal and retryable, so a
 *       player can never be hard-locked out of the valley — only the walk can kill.)
 *
 * Out-of-band teeth: the prepared/unprepared split is computed from the REAL roll mechanic
 * (core resolveSkillCheck: total = d20 + state.vars[skill]); flip the counsel's +5 to
 * +0 and the prepared case would fail the worst-roll assertion, so this is a genuine
 * behavioural witness, not a vacuous green.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { resolveSkillCheck } from "../../src/core/skill_check.js";
import { initState } from "../../src/core/state.js";
import type { RpgPack } from "../../src/rpg/schema.js";
import type { GameState } from "../../src/core/state.js";
import type { Rng } from "../../src/core/rng.js";

/** A fresh GameState at the pack's start with the given skill vars. */
function freshState(pack: RpgPack, vars: Record<string, number>): GameState {
  const s = initState({
    seed: 1,
    start: pack.meta.start_room,
    varsInit: pack.meta.vars_init,
    flagsInit: pack.meta.flags_init,
  });
  return { ...s, vars: { ...s.vars, ...vars } };
}

const PACK_PATH = "content/rpg/pack/breaking_weir.yaml";

function loadPack(): RpgPack {
  const r = loadRpgSourceFile(PACK_PATH);
  expect(r.ok, "breaking_weir must load").toBe(true);
  if (!r.ok) throw new Error("unreachable");
  return r.compiled.pack;
}

/** A d20 that always rolls its minimum (1) — the player's WORST skill-check roll. */
const minRollRng = (): Rng => ({
  next: () => 0,
  int: (min: number) => Math.ceil(min),
});

/** The nerve skill_check on the storm-walk (the pack's one lethal obstacle). */
function walkNerveCheck(pack: RpgPack) {
  const walk = pack.objects.find((o) => o.id === "walk_span");
  const use = walk?.interactions.find((it) => it.skill_check?.skill === "nerve");
  expect(use?.skill_check, "storm-walk must carry a nerve skill_check").toBeTruthy();
  return use!.skill_check!;
}

function effectKeys(effects: { [k: string]: unknown }[]): string[] {
  return effects.flatMap((e) => Object.keys(e));
}

describe("bug_0196 — The Breaking Weir: a combatless skill-check chain", () => {
  it("validates clean AND is genuinely combatless (zero enemies, max_score 50)", () => {
    const pack = loadPack();
    expect(pack.enemies).toEqual([]); // the defining property: no combat
    expect(pack.meta.combat_guaranteed).toBeUndefined(); // no fight to guarantee
    expect(pack.meta.max_score).toBe(50); // 5 + 10·3 + 15, the curated RPG economy
    const errors = validateRpg(pack).findings.filter((f) => f.severity === "error");
    expect(errors).toEqual([]);
  });

  it("the storm-walk is the one LETHAL check; the rack and winch are non-lethal & retryable", () => {
    const pack = loadPack();
    const lethalEndings = (skill: string): boolean => {
      for (const o of pack.objects)
        for (const it of o.interactions)
          if (it.skill_check?.skill === skill)
            return it.skill_check.on_failure.some((e) => "end_game" in e);
      return false;
    };
    expect(lethalEndings("nerve")).toBe(true); // the storm-walk crossing can kill
    expect(lethalEndings("craft")).toBe(false); // the head-rack cannot
    expect(lethalEndings("might")).toBe(false); // the relief-race winch cannot
  });

  it("PREPARED (nerve 8): the lethal walk SUCCEEDS on the worst roll — heeding Pell is safe", () => {
    const pack = loadPack();
    const check = walkNerveCheck(pack);
    expect(check.difficulty).toBe(9);
    const state = freshState(pack, { nerve: 8 });
    const res = resolveSkillCheck(state, check, minRollRng());
    const keys = effectKeys(res.effects);
    // 1 (worst d20) + 8 nerve = 9 >= 9 → success branch: crosses, never ends the game.
    expect(keys).toContain("set_flag");
    expect(keys).not.toContain("end_game");
  });

  it("UNPREPARED (base nerve 3): the worst roll FAILS into ending_swept — the gamble is real", () => {
    const pack = loadPack();
    const check = walkNerveCheck(pack);
    const state = freshState(pack, {});
    expect(state.vars.nerve).toBe(3); // base, no counsel
    const res = resolveSkillCheck(state, check, minRollRng());
    // 1 (worst d20) + 3 nerve = 4 < 9 → failure branch ends the game at the death ending.
    const endGame = res.effects.find((e) => "end_game" in e) as { end_game?: string } | undefined;
    expect(endGame?.end_game).toBe("ending_swept");
  });

  it("the failure narration is HONEST: the death is nerve breaking, not a line that was 'never clipped' (bug_0200)", () => {
    // The crossing is reached only via the USE action "rig storm-walk with life-line"
    // (the life-line must be HELD and is clipped on by the player's own choice). So the
    // failure prose must not claim the line was never/badly clipped — that contradicts the
    // chosen action and the failure journal, which attributes the death to nerve breaking.
    // (Symmetric to bug_0197, which fixed the SAME narration-vs-state flaw on the SUCCESS path.)
    const pack = loadPack();
    const check = walkNerveCheck(pack);
    const narr = check.on_failure
      .filter((e) => "narrate" in e)
      .map((e) => (e as { narrate: string }).narrate)
      .join(" ");
    expect(narr, "failure narrate must exist").not.toBe("");
    expect(narr.toLowerCase()).not.toContain("never clipped");
    expect(narr.toLowerCase()).toContain("nerve"); // the death is nerve failing, honestly
  });
});
