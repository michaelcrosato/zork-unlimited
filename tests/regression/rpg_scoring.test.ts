/**
 * Regression (§15) for bug_0016 — the Stage-3 score system was declared-capable but
 * dead in the RPG pack The Sunken Barrow: score stayed 0 from start through the
 * victory ending despite the player slaying the wight, levering the slab, and
 * claiming the relic.
 *
 * A blind MCP playtester (ai-runs/2026-06-01T07-23-12-130Z, seed 43) solved the
 * barrow to ending_victory and flagged the score TWICE (report §4 + §5): meta.max_score
 * was 0 and no inc_var award existed, so the `score` the observation surfaces never
 * moved off 0 — a "missing reward hook" that "undercuts the payoff".
 *
 * The fix is CONTENT (meta.max_score: 50 + three one-time milestone awards — +10 on
 * slaying the wight, +15 on levering the slab, +25 on claiming the relic) PLUS one
 * VALIDATOR-correctness fix the RPG layer needs: the SCORE_UNREACHABLE upper bound is
 * computed inside validateParser from allEffects(pack), which does NOT scan the
 * RPG-only award branches (enemy on_defeat, skill_check on_success/on_failure). So
 * two of the three barrow awards (+10, +15) were invisible to the bound and the pack
 * false-flagged SCORE_UNREACHABLE. ValidateParserOptions now takes extraScoreAwards;
 * validateRpg sums the inc_var-score awards in its runtime branches and folds them in.
 *
 * Locked here:
 *   (1) score is 0 at start, rises 0→10→25→50 across the three milestones, and is
 *       50/50 at the victory ending;
 *   (2) each award is one-time — the wight cannot be re-attacked (dead), the lever
 *       retires after success (use drops from the legal set, bug_0015), and the relic
 *       chamber ends the game on entry so its on_enter +25 cannot re-fire;
 *   (3) the validator fold-in is real: the parser-only bound counts just the +25 in a
 *       scanned location, so validateParser(pack) WITHOUT the RPG awards fires
 *       SCORE_UNREACHABLE — and validateRpg(pack) passes (so the declared max is
 *       genuinely awardable once the combat/skill-check awards are counted).
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
if (!loaded.ok) throw new Error("sunken_barrow must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));

const score = (s: GameState): number => buildParserObservation(index, s).score;
const options = (s: GameState) => enumerateRpgActions(index, s);

function act(s: GameState, pred: (a: Action) => boolean): GameState {
  const opt = options(s).find((o) => pred(o.action));
  if (!opt)
    throw new Error(
      `no action; legal=[${options(s)
        .map((o) => o.id)
        .join(", ")}] in ${s.current}`,
    );
  const r = step(s, opt.action);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("step failed");
  return r.state;
}

const move = (dir: string) => (a: Action) => a.type === "MOVE" && a.direction === dir;
const isAttack = (a: Action) => a.type === "ATTACK";
const isUse = (a: Action) => a.type === "USE";
const isTake = (a: Action) => a.type === "TAKE";

// Seed 1 under-armed: the wight (bug_0102 retune hp22/atk5/def2) falls after a few
// seeded rounds — loop ATTACK until wight_slain — and the first USE then levers the
// slab. Both deterministic at this seed; the score milestones are independent of the
// exact round/lever count.
describe("bug_0016 — Sunken Barrow scoring accrues 0→10→25→50 across the three milestones", () => {
  it("score climbs at each beat and is full (50/50) at the victory ending", () => {
    let s = initStateForRpgPack(index, 1);
    expect(score(s)).toBe(0);

    s = act(s, move("down"));
    s = act(s, isTake); // iron bar
    s = act(s, move("north"));
    expect(score(s)).toBe(0);

    while (!s.ended && !s.flags["wight_slain"]) s = act(s, isAttack); // wight falls
    expect(s.flags["wight_slain"]).toBe(true);
    expect(score(s)).toBe(10);

    s = act(s, move("east"));
    s = act(s, isUse); // lever the slab (succeeds at seed 1)
    expect(s.questStage["barrow"]).toBe("slab_moved");
    expect(score(s)).toBe(25);

    s = act(s, move("down")); // into the relic chamber: NO score here (bug_0107) — the final beat rides the claim
    expect(s.ended).toBe(false); // the win turns on the claim, not on entry (bug_0056)
    expect(score(s)).toBe(25);

    s = act(s, isTake); // claim the circlet → +25 (take_effects) AND the win fires on the deliberate TAKE
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(score(s)).toBe(50);
    expect(score(s)).toBe(pack.meta.max_score);
  });

  it("each award is one-time: the wight is dead, the lever retires, the circlet's take_effects +25 fires once", () => {
    let s = act(act(act(initStateForRpgPack(index, 1), move("down")), isTake), move("north"));
    while (!s.ended && !s.flags["wight_slain"]) s = act(s, isAttack);
    // The wight is slain — no ATTACK remains, so the +10 cannot be re-earned.
    expect(options(s).some((o) => o.action.type === "ATTACK")).toBe(false);

    s = act(act(s, move("east")), isUse);
    expect(score(s)).toBe(25);
    // The lever retires after success (bug_0015): the USE drops from the legal set,
    // so the +15 cannot be farmed by re-levering.
    expect(options(s).some((o) => o.action.type === "USE")).toBe(false);

    s = act(s, move("down"));
    // No score on chamber entry now (bug_0107): the final +25 rides the circlet's
    // take_effects, which fire on the single pickup that ALSO ends the game (claim_relic
    // → ending_victory), so the award is one-shot and cannot be farmed.
    expect(s.ended).toBe(false);
    expect(score(s)).toBe(25);
    s = act(s, isTake); // claim the circlet → +25 then win
    expect(s.ended).toBe(true);
    expect(score(s)).toBe(50);
  });

  it("the validator fold-in is real: parser-only bound under-counts (25), RPG bound reaches 50", () => {
    expect(pack.meta.max_score).toBe(50);

    // Without the RPG runtime awards, only the circlet's take_effects +25 is in a
    // parser-scanned location (allEffects now folds in take_effects, bug_0107), so the
    // parser-only bound is 25 < 50 → SCORE_UNREACHABLE must fire.
    const parserOnly = validateParser(pack);
    expect(parserOnly.findings.find((f) => f.code === "SCORE_UNREACHABLE")).toBeDefined();

    // validateRpg folds in the +10 (on_defeat) and +15 (on_success), so 50 is
    // genuinely awardable and the pack validates clean.
    const rpg = validateRpg(pack);
    expect(rpg.ok).toBe(true);
    expect(rpg.findings.find((f) => f.code === "SCORE_UNREACHABLE")).toBeUndefined();
  });
});
