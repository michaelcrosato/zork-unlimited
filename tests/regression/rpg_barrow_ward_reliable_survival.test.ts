/**
 * Regression (§15) for bug_0113 — The Sunken Barrow's shade ward is +3 (was +2), so
 * PREPARED play RELIABLY survives the wight.
 *
 * bug_0102 gave the wight real teeth (hp22/atk5/def2) so the shade's ward finally
 * DECIDED the fight — under-armed became a ~43% lethal gamble. But a fresh, MCP-only,
 * source-blind pass on the WARDED route (seed 11, ai-runs/2026-06-02T09-48-19-753Z/
 * playtest.md §4/§5) then flagged the other edge: at +2 the prepared player won only
 * ~70% of seeds and finished at exactly 3 HP twice — "an unlucky early run of high
 * wight rolls can kill a fully-prepared, 'correct play' player … no recovery beyond
 * fleeing." Prep decided the fight but did not make doing everything right reliably
 * survivable.
 *
 * The fix raises the ward +2→+3 (defense 2→5) — and ONLY the ward; the wight is
 * untouched, so under-armed stays exactly the bug_0102 lethal gamble and the prep gap
 * WIDENS. Verified live over seeds 1-40 on the REAL routes (__probe3.ts): warded
 * 28/40→35/40 (~70%→~88%), avg survivor HP 5.4→7.5, the ≤3-HP nail-biters more than
 * halved; under-armed unchanged at 17/40 (~43%). It is still no guaranteed win (~12%
 * of warded seeds lose, recoverable via save §8.7), so the pack keeps the tension its
 * "careful play isn't free" identity demands.
 *
 * Locked here:
 *   (1) the ward is +3: ask_wight raises defense 2→5 once and journals "+3 defense";
 *   (2) RELIABILITY + DECISIVENESS together, on the real routes over seeds 1-40:
 *       prepared wins a strong majority (>=33/40) AND at least twice as often as
 *       under-armed — so correct play reliably survives while prep stays decisive;
 *   (3) THE +1 IS LOAD-BEARING: at seed 6 the warded route (def5) wins ending_victory
 *       50/50, but the SAME route with defense forced back to 4 (the old +2 ward) is
 *       killed → ending_fallen. The single point the bump added is exactly what
 *       carries correct play through the wight.
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

/** Walk the optional shade detour and claim the +3 ward; return at the Entry Hall. */
function getWard(s: GameState): GameState {
  s = act(s, move("west")); // → reaver_rest
  s = act(s, isTalk);
  s = act(s, askTopic("ask_wight"));
  s = act(s, askTopic("wight_back"));
  s = act(s, askTopic("leave_shade"));
  s = act(s, move("east")); // → entry_hall
  return s;
}

/** Fight the wight to a conclusion. */
function fightOut(s: GameState): GameState {
  let guard = 0;
  while (!s.ended && !s.flags["wight_slain"]) {
    s = act(s, isAttack);
    if (++guard > 60) throw new Error("fight did not resolve");
  }
  return s;
}

/**
 * Play the warded route through the wight at seed. `defOverride` (if given) replaces
 * the warded defense right before the fight to model the OLD +2 ward (def4) without
 * changing the RNG step stream (the dialogue is the same number of steps either way).
 */
function wardedFight(seed: number, defOverride?: number): GameState {
  let s = initStateForRpgPack(index, seed);
  s = act(s, move("down")); // → entry_hall
  s = getWard(s); // → entry_hall, defense now 5
  s = act(s, isTake); // iron bar
  if (defOverride !== undefined) s = { ...s, vars: { ...s.vars, defense: defOverride } };
  s = act(s, move("north")); // → guard_crypt
  return fightOut(s);
}

function underArmedFight(seed: number): GameState {
  let s = initStateForRpgPack(index, seed);
  s = act(s, move("down")); // → entry_hall (skip the shade)
  s = act(s, isTake); // iron bar
  s = act(s, move("north")); // → guard_crypt
  return fightOut(s);
}

const survived = (s: GameState) => !!s.flags["wight_slain"] && !s.ended;

describe("bug_0113 — the shade's +3 ward makes prepared play reliably survive the wight", () => {
  it("(1) the ward is +3: ask_wight raises defense 2→5 and journals +3 defense", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down"));
    s = act(s, move("west"));
    expect(s.vars["defense"]).toBe(2);
    s = act(s, isTalk);
    s = act(s, askTopic("ask_wight"));
    expect(s.vars["defense"]).toBe(5);
    expect(s.journal.some((j) => j.includes("+3 defense"))).toBe(true);
  });

  it("(2) reliable AND decisive over seeds 1-40: prepared wins a strong majority and >=2x under-armed", () => {
    let wardedWins = 0;
    let underArmedWins = 0;
    for (let seed = 1; seed <= 40; seed++) {
      if (survived(wardedFight(seed))) wardedWins++;
      if (survived(underArmedFight(seed))) underArmedWins++;
    }
    // correct play reliably survives (the seed-11 "razor-thin" knock answered)…
    expect(wardedWins).toBeGreaterThanOrEqual(33);
    // …while prep stays the decisive lever bug_0102 made it (not trivially safe either way).
    expect(wardedWins).toBeGreaterThanOrEqual(underArmedWins * 2);
    expect(underArmedWins).toBeLessThanOrEqual(20);
  });

  it("(3) the +1 is load-bearing: seed 6 wins at def5 but the old +2 ward (def4) dies", () => {
    // current ward (def5): the warded route carries correct play through to victory.
    let s = wardedFight(6);
    expect(survived(s)).toBe(true);
    // …and on to the full win, to prove the surviving player completes the pack.
    s = act(s, move("east")); // → slab_passage
    let guard = 0;
    while (s.questStage["barrow"] !== "slab_moved" && !s.ended) {
      s = act(s, isUse);
      if (++guard > 40) throw new Error("slab never moved");
    }
    s = act(s, move("down")); // → relic_chamber
    s = act(s, isTake); // claim circlet → win
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(score(s)).toBe(50);

    // counterfactual: the SAME seeded route at the OLD +2 ward (def4) is killed.
    const old = wardedFight(6, 4);
    expect(survived(old)).toBe(false);
    expect(old.ended).toBe(true);
    expect(old.endingId).toBe("ending_fallen");
  });
});
