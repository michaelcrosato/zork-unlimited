/**
 * Regression (§15) for bug_0102 — The Sunken Barrow's reaver-shade +2-defense ward
 * finally MATTERS, so PREPARATION decides the wight fight.
 *
 * The pack's standing knock across blind passes is that careful play is trivially
 * safe. A fresh, MCP-only, source-blind pass that ran the explicit prepared-vs-
 * under-armed comparison (seed 37, ai-runs/2026-06-02T02-14-47-663Z/playtest.md §5)
 * put it in mechanical terms: the old hp12/atk3/def1 wight "dies in 2 rounds either
 * way" — warded it hit for 3, under-armed for 4, so the +2 ward "saved a single HP"
 * (finished 17/20 vs 16/20). The preparation was "mechanically genuine but the fight
 * is so short and tilted you win trivially at near-full HP regardless." This is the
 * same "telegraphed prep is cosmetic" note both RPG packs kept raising (bug_0095,
 * cold_forge bug_0092→0101).
 *
 * The fix retunes the wight to hp22/atk5/def2 (the bug_0101 move applied to this
 * pack). This is the sound "gear up first" design the bug_0097 winnability proof was
 * widened to permit: that proof credits the player's BEST REACHABLE stats (init +
 * the reachable shade ward — +2 here, later +3/def5 in bug_0113), so the fight is still PROVABLY winnable to the
 * validator and sunken_barrow stays a clean 0-finding pack — while BASE-stat play is
 * a genuine, lethal gamble the bar never required to be safe. Verified live over
 * seeds 1-40 on the real route (__probe2.ts): under-armed wins only 17/40 (loses on a
 * majority), warded wins 28/40 (~70%) — the +2 ward is the decisive survival lever,
 * not a one-HP shave. Only the three enemy stats changed; prose/flags/score/endings/
 * exits are untouched, so every other barrow proof still holds.
 *
 * Locked here:
 *   (1) the retuned pack still validates green (no COMBAT_UNWINNABLE): provably
 *       winnable with best-reachable stats, so the design is within the bar;
 *   (2) the wight carries the retuned numbers (hp22/atk5/def2);
 *   (3) REAL FAILURE STATE: an under-armed thief (base defense 2, skips the shade) at
 *       seed 2 is killed and fires the declared death ending ending_fallen;
 *   (4) PREP DECIDES IT: at the SAME seed 2, the ONLY change being a detour to the
 *       reaver's shade for its +2-defense ward, the fight flips from death to a full
 *       ending_victory 50/50 — so the ward the seed-37 pass called one-HP-cosmetic is
 *       now exactly what carries you through the wight to the moral climax.
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
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadRpgSourceFile("content/rpg/pack/sunken_barrow.yaml");
if (!loaded.ok) throw new Error("sunken_barrow must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));

const score = (s: GameState): number => buildRpgObservation(index, s).score;
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
const isTalk = (a: Action) => a.type === "TALK";
const askTopic = (topic: string) => (a: Action) =>
  a.type === "ASK" && (a as { topic?: string }).topic === topic;

/** Fight the wight to the death (one side falls). Returns the ended/standing state. */
function fightOut(s: GameState): GameState {
  let guard = 0;
  while (!s.ended && !s.flags["wight_slain"]) {
    s = act(s, isAttack);
    if (++guard > 40) throw new Error("fight did not resolve");
  }
  return s;
}

describe("bug_0102 — The Sunken Barrow wight has real teeth, so the shade's ward decides the fight", () => {
  it("(1) the retuned pack still validates green — provably winnable with best-reachable stats", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.findings.map((f) => f.code)).not.toContain("COMBAT_UNWINNABLE");
    expect(report.ok).toBe(true);
  });

  it("(2) the wight carries the retuned numbers (hp22/atk5/def2)", () => {
    const wight = pack.enemies.find((e) => e.id === "barrow_wight")!;
    expect(wight.hp).toBe(22);
    expect(wight.attack).toBe(5);
    expect(wight.defense).toBe(2);
  });

  it("(3) real failure state: an under-armed thief (base defense 2) at seed 2 is killed (ending_fallen)", () => {
    let s = initStateForRpgPack(index, 2);
    s = act(s, move("down")); // → entry_hall
    s = act(s, isTake); // iron bar (but skip the shade's ward → base defense 2)
    expect(s.vars["defense"]).toBe(2);
    s = act(s, move("north")); // → guard_crypt
    s = fightOut(s);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_fallen");
    expect(pack.endings.find((e) => e.id === "ending_fallen")?.death).toBe(true);
  });

  it("(4) prep decides it: the SAME seed 2, with only the shade's defense ward, flips to ending_victory 50/50", () => {
    let s = initStateForRpgPack(index, 2);
    s = act(s, move("down")); // → entry_hall
    s = act(s, move("west")); // → reaver_rest (the optional detour, met before the fight)
    s = act(s, isTalk); // the reaver's shade
    s = act(s, askTopic("ask_wight")); // the ONLY difference from case (3): the shade's defense ward
    expect(s.vars["defense"]).toBe(5); // bug_0113: ward raised +2→+3 (def 2→5)
    s = act(s, askTopic("wight_back"));
    s = act(s, askTopic("leave_shade"));
    s = act(s, move("east")); // → entry_hall
    s = act(s, isTake); // iron bar
    s = act(s, move("north")); // → guard_crypt
    s = fightOut(s);
    expect(s.ended).toBe(false); // the ward is what keeps the player standing
    expect(s.flags["wight_slain"]).toBe(true);
    expect(score(s)).toBe(10);

    s = act(s, move("east")); // → slab_passage
    let guard = 0;
    while (s.questStage["barrow"] !== "slab_moved" && !s.ended) {
      s = act(s, isUse); // lever the slab (might check; free retry)
      if (++guard > 40) throw new Error("slab never moved");
    }
    expect(score(s)).toBe(25);

    s = act(s, move("down")); // → relic_chamber: +25, max score in hand
    expect(s.ended).toBe(false); // the win turns on the claim, not entry (bug_0056)
    s = act(s, isTake); // claim the circlet → win
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(score(s)).toBe(50);
  });
});
