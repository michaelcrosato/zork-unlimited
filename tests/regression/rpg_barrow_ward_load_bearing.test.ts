/**
 * Regression (§15) for bug_0180 — The Sunken Barrow's reaver-shade ward (+3 defense)
 * is MECHANICALLY LOAD-BEARING by SAME-STEP isolation: giving the barrow's headline
 * claim (bug_0102 — "preparation decides the wight fight") the same PRNG-clean witness
 * the sibling pack's decisive buff got in bug_0179.
 *
 * Background. bug_0102 retuned the wight (hp22/atk5/def2) so the shade's ward finally
 * DECIDES the fight, and bug_0113 raised the ward +2→+3 (defense 2→5) so prepared play
 * RELIABLY survives. Those claims are already pinned by concrete play —
 *   - rpg_barrow_wight_prep_matters.test.ts (bug_0102): under-armed FULL ROUTE dies
 *     (ending_fallen) vs warded FULL ROUTE wins (ending_victory), seed 2;
 *   - rpg_barrow_ward_reliable_survival.test.ts (bug_0113): 40-seed reliability stats,
 *     and a SAME-STEP isolation of the MARGINAL +1 (def5 vs def4, seed 6).
 * But there is a soundness gap exactly like the one bug_0179 closed for The Cold Forge:
 * the headline death→victory flip is proven only by comparing the UNDER-ARMED route to
 * the WARDED route, which take DIFFERENT numbers of steps (the warded route detours west
 * + runs the shade dialogue). The engine PRNG is (seed, step)-keyed (src/rpg/combat.ts),
 * so the two routes draw DIFFERENT fight rolls — an apples-to-oranges comparison. The
 * existing same-step isolation covers only the marginal +1 (def4→def5), NOT the full
 * +3 ward (def2→def5) that bug_0102's "preparation decides the fight" headline rests on.
 *
 * Soundness. This isolates the full +3 ward the way bug_0179 isolates the cold_forge
 * plate and bug_0113 isolates the +1: from ONE under-armed pre-fight state (def2, full
 * HP, AT the guard crypt — a fixed step), it fights two copies that differ ONLY in
 * defense (2 vs 5, heard_warding set) at the IDENTICAL step, so both draw the SAME
 * step-keyed d6 stream. Per-round wight damage = max(1, d6 + 5 - playerDef) is monotone
 * DECREASING in the player's defense, so the def-5 copy can only ever take ≤ damage per
 * round — a death→survival flip is therefore purely the +3 ward, never a lucky-roll
 * artefact. The faithful pack linkage (asking the shade really raises defense 2→5) is
 * pinned separately by real play (rpg_barrow_ward_reliable_survival case 1 + case 2
 * below), so the two halves together witness "the full ward is load-bearing" without
 * mutating away the pack's own ward mechanic.
 *
 * Locked here (all values from the committed deterministic PRNG; probe over seeds 1-40):
 *   (1) the pack still validates green under the full RPG validator;
 *   (2) FAITHFUL LINKAGE: asking the shade's wight topic raises defense 2→5 (+3) and
 *       sets heard_warding — the same state this test then isolates;
 *   (3) THE FULL WARD FLIPS A LETHAL FIGHT: at seed 2, from the identical under-armed
 *       pre-fight state, the UNWARDED copy (def 2) is killed (ending_fallen) while the
 *       WARDED copy (def 5) — same step, same rolls, ONLY the +3 defense differs —
 *       survives the wight (wight_slain, still standing);
 *   (4) THE CUSHION IS REAL: across seeds where both copies win, the warded player ends
 *       with STRICTLY MORE HP than the unwarded one — the +3 defense blunts real blows,
 *       it is not swallowed by the min-1 damage floor.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadRpgSourceFile("content/rpg/pack/sunken_barrow.yaml");
if (!loaded.ok) throw new Error("sunken_barrow must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));

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
const isTake = (a: Action) => a.type === "TAKE";
const isTalk = (a: Action) => a.type === "TALK";
const askTopic = (topic: string) => (a: Action) =>
  a.type === "ASK" && (a as { topic?: string }).topic === topic;

/**
 * Reach the Guard Crypt UNDER-ARMED (def 2, skip the shade) — one pre-fight state at a
 * fixed step. Both copies fought below sit at this same step, so they share the
 * step-keyed PRNG stream.
 */
function underArmedPreFight(seed: number): GameState {
  let s = initStateForRpgPack(index, seed);
  s = act(s, move("down")); // → entry_hall
  s = act(s, isTake); // iron bar (but skip the shade → base defense 2)
  s = act(s, move("north")); // → guard_crypt
  expect(s.current).toBe("guard_crypt");
  expect(s.vars["defense"]).toBe(2);
  expect(s.flags["heard_warding"]).not.toBe(true);
  return s;
}

/** A def-5 copy of a pre-fight state at the IDENTICAL step (simulating the +3 ward). */
function withWard(s: GameState): GameState {
  return {
    ...s,
    vars: { ...s.vars, defense: 5 },
    flags: { ...s.flags, heard_warding: true },
  };
}

/** Fight the wight to the death (one side falls). */
function fightOut(s: GameState): GameState {
  let guard = 0;
  while (!s.ended && !s.flags["wight_slain"]) {
    s = act(s, isAttack);
    if (++guard > 60) throw new Error("fight did not resolve");
  }
  return s;
}

describe("bug_0180 — The Sunken Barrow shade's +3 ward is mechanically load-bearing (same-step isolation)", () => {
  it("(1) the pack still validates green under the full RPG validator", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("(2) faithful linkage: asking the shade's wight topic raises defense 2→5 (+3) by real play", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down")); // → entry_hall
    s = act(s, move("west")); // → reaver_rest
    expect(s.vars["defense"]).toBe(2);
    s = act(s, isTalk); // the reaver's shade
    s = act(s, askTopic("ask_wight"));
    expect(s.vars["defense"]).toBe(5); // the +3 the fight will feel
    expect(s.flags["heard_warding"]).toBe(true);
  });

  it("(3) the full ward flips a lethal fight: seed 2, only +3 defense differs, death→survival", () => {
    const s0 = underArmedPreFight(2);

    // UNWARDED (def 2): the under-armed player is killed at this seed.
    const unwarded = fightOut(s0);
    expect(unwarded.ended).toBe(true);
    expect(unwarded.endingId).toBe("ending_fallen");
    expect(unwarded.flags["wight_slain"]).not.toBe(true);

    // WARDED copy (def 5) at the IDENTICAL step → same rolls; the ONLY change is the
    // +3 defense, and it carries the player through alive.
    const warded = fightOut(withWard(s0));
    expect(warded.ended).toBe(false);
    expect(warded.flags["wight_slain"]).toBe(true);
    expect(warded.vars["hp"]).toBeGreaterThan(0);
  });

  it("(4) the cushion is real: where both win, the ward ends with strictly more HP", () => {
    // Seeds where the under-armed player already wins (so both copies finish the fight)
    // — the ward's +3 defense must leave the player strictly better off, never swallowed
    // by the min-1 damage floor. (Probe over seeds 1-40: the cushion never violates.)
    const bothWinSeeds = [1, 3, 5, 6, 7, 13, 16, 19];
    for (const seed of bothWinSeeds) {
      const s0 = underArmedPreFight(seed);
      const unwarded = fightOut(s0);
      const warded = fightOut(withWard(s0));
      expect(unwarded.flags["wight_slain"], `seed ${seed}: unwarded should win`).toBe(true);
      expect(warded.flags["wight_slain"], `seed ${seed}: warded should win`).toBe(true);
      expect(
        warded.vars["hp"] ?? 0,
        `seed ${seed}: the +3 ward must leave strictly more HP ` +
          `(warded ${warded.vars["hp"]} vs unwarded ${unwarded.vars["hp"]})`,
      ).toBeGreaterThan(unwarded.vars["hp"] ?? 0);
    }
  });
});
