/**
 * Regression for bug_0131: combat damage narration is LEGIBLE — it decomposes
 * every blow into `d6 <roll> + <atk> atk - <def> def`, mirroring the skill-check
 * resolver's transparent `d20 X + bonus = total vs DC` format (the die name was
 * added to the skill check in the symmetric follow-on, bug_0141).
 *
 * A fresh source-blind playtester (cold_forge, seed 13,
 * ai-runs/2026-06-02T14-22-55-560Z/playtest.md §4/§5) reported that the
 * cold-iron plate's +2 defense "felt invisible": the old narration showed only
 * the final damage number, and a +2 reduction is swamped by the d6's range, so a
 * geared player could not tell their prep was doing anything. (The barrow ward
 * drew the same note, bug_0119.) The breakdown surfaces the defense term so the
 * same roll visibly lands for less against better armour.
 *
 * The numeric `dealt` is still `max(1, roll + atk - def)`, byte-identical to the
 * old `dmg()`, so determinism and every trace's final hash are unchanged — these
 * cases pin the NARRATION and re-assert that the math did not move.
 */
import { describe, it, expect } from "vitest";
import { initState, type GameState } from "../../src/core/state.js";
import { resolveAttack } from "../../src/rpg/combat.js";
import { enemyHpVar, type Enemy } from "../../src/rpg/schema.js";
import type { Rng } from "../../src/core/rng.js";
import type { Effect } from "../../src/core/effects.js";

/** A forcing Rng that hands back queued d6 values in order (strike, then reply). */
const forcedRng = (rolls: number[]): Rng => {
  let i = 0;
  return { next: () => 0, int: () => rolls[i++] ?? 1 };
};

const narrations = (effects: Effect[]): string[] =>
  effects.filter((e): e is { narrate: string } => "narrate" in e).map((e) => e.narrate);

const stateWith = (vars: Record<string, number>): GameState => ({
  ...initState({ seed: 1, start: "room" }),
  vars,
});

// A sentinel-weight foe: hits hard (atk 7) so the defender's armour matters, and
// stout enough (hp 18) that a light strike leaves it standing to counterattack.
const sentinel: Enemy = {
  id: "sentinel",
  name: "slag sentinel",
  description: "x",
  room: "room",
  hp: 18,
  attack: 7,
  defense: 2,
  defeat_flag: "stilled",
  death_ending: "ending_fallen",
  on_defeat: [],
};

describe("bug_0131: combat damage narration is legible", () => {
  it("the player's strike decomposes into d6 + atk - def and the numbers add up", () => {
    const s = stateWith({ hp: 20, attack: 4, defense: 2, might: 3 });
    // strike roll 5: 5 + 4 atk - 2 def = 7; sentinel 18 - 7 = 11 (survives).
    const res = resolveAttack(s, sentinel, forcedRng([5, 1]));
    const [strike] = narrations(res.effects);
    expect(strike).toBe(
      "You strike slag sentinel for 7 (d6 5 + 4 atk - 2 def; it has 11 HP left).",
    );
    // The narrated breakdown matches the actual HP write — no decorative fiction.
    const hpEffect = res.effects.find(
      (e): e is { set_var: { name: string; value: number } } =>
        "set_var" in e && e.set_var.name === enemyHpVar(sentinel.id),
    );
    expect(hpEffect?.set_var.value).toBe(11);
  });

  it("defense is now LEGIBLE: more armour visibly lowers the SAME blow", () => {
    // Identical state and identical forced rolls; only defense differs (the plate).
    // Strike roll 1 (4+1-2=3, sentinel survives at 15), then enemy reply roll 4.
    const lightlyArmoured = resolveAttack(
      stateWith({ hp: 20, attack: 4, defense: 2, might: 3 }),
      sentinel,
      forcedRng([1, 4]),
    );
    const plated = resolveAttack(
      stateWith({ hp: 20, attack: 4, defense: 4, might: 3 }), // +2 from the cold-iron plate
      sentinel,
      forcedRng([1, 4]),
    );
    const lightBlow = narrations(lightlyArmoured.effects).find((n) => n.includes("hits you"))!;
    const platedBlow = narrations(plated.effects).find((n) => n.includes("hits you"))!;

    // The breakdown spells out the defender's defense, so the player SEES the term change.
    expect(lightBlow).toBe(
      "slag sentinel hits you for 9 (d6 4 + 7 atk - 2 def; you have 11 HP left).",
    );
    expect(platedBlow).toBe(
      "slag sentinel hits you for 7 (d6 4 + 7 atk - 4 def; you have 13 HP left).",
    );

    // The same roll lands for exactly the +2 less when plated — the prep is perceptible.
    const dmg = (n: string): number => Number(/hits you for (\d+)/.exec(n)![1]);
    expect(dmg(lightBlow) - dmg(platedBlow)).toBe(2);
  });

  it("a blow blunted to the minimum states the floor honestly (never an unexplained 1)", () => {
    // A heavily armoured player vs a weak foe: raw damage goes negative and clamps to 1.
    const weakFoe: Enemy = { ...sentinel, name: "ember-wisp", attack: 1, defense: 1, hp: 20 };
    const s = stateWith({ hp: 20, attack: 4, defense: 8, might: 3 });
    // strike roll 1 (4+1-1=4, foe 20-4=16 survives), reply roll 1: 1 + 1 atk - 8 def = -6 → floored to 1.
    const res = resolveAttack(s, weakFoe, forcedRng([1, 1]));
    const blow = narrations(res.effects).find((n) => n.includes("hits you"))!;
    expect(blow).toBe(
      "ember-wisp hits you for 1 (d6 1 + 1 atk - 8 def = -6, blunted to the floor of 1; you have 19 HP left).",
    );
    const hpEffect = res.effects.find(
      (e): e is { set_var: { name: string; value: number } } =>
        "set_var" in e && e.set_var.name === "hp",
    );
    expect(hpEffect?.set_var.value).toBe(19); // exactly 1 HP lost — the floor, not the raw -6
  });

  it("the numeric damage is unchanged vs the old max(1, roll + atk - def) formula", () => {
    // Guards the byte-identical claim: the narration refactor must not move the math.
    for (let roll = 1; roll <= 6; roll++) {
      for (const def of [0, 1, 2, 4, 9]) {
        const s = stateWith({ hp: 50, attack: 0, defense: def, might: 0 });
        // Player deals 0 atk vs a 0-def foe => strike = max(1, roll) so the foe (hp 50)
        // always survives to counterattack; we read the player-damage write back.
        const foe: Enemy = { ...sentinel, attack: 5, defense: 0, hp: 50 };
        const res = resolveAttack(s, foe, forcedRng([roll, roll]));
        const hpEffect = res.effects.find(
          (e): e is { set_var: { name: string; value: number } } =>
            "set_var" in e && e.set_var.name === "hp",
        );
        const expectedDealt = Math.max(1, roll + foe.attack - def);
        expect(50 - (hpEffect?.set_var.value ?? 0)).toBe(expectedDealt);
      }
    }
  });
});
