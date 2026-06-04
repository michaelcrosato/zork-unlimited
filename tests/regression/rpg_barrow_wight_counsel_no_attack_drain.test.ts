/**
 * Regression (§15) for bug_0222 — the reaver's shade's wight-counsel must NOT
 * over-promise an attack/strength drain the engine never cashes.
 *
 * The old line said the wight's touch makes "the strength runs out of your arm" —
 * language that promises a STRENGTH/ATTACK debuff. But barrow_wight carries no such
 * effect: its blows only deal HP damage. A fresh, MCP-only, source-blind playtester
 * (seed 7, ai-runs/2026-06-04T01-48-35-512Z/playtest.md §4a/§5) noticed their attack
 * stat stayed constant through the whole fight and flagged the line as flavor "a
 * careful player might expect to bite." That is the SAME honesty defect this pack
 * fights everywhere a line writes a contract the engine never cashes (bug_0027/0029/
 * 0069 over-sold grinds, bug_0095 the sarcophagus examine promising the slab's
 * skill_check, bug_0132 the ward's over-promised odds).
 *
 * The fix is the pack's honesty discipline applied to spoken counsel: keep the line's
 * load-bearing job (naming the cold blows that wear you down, motivating the +3 ward)
 * but frame it as the HP-sapping the wight ACTUALLY deals, with no false attack-drain.
 * This locks all three properties so a future "tidy-up" can't drift back:
 *   (a) HONEST — no strength/attack-drain promise in the spoken counsel;
 *   (b) the load-bearing job SURVIVES — the counsel still names the cold blows that
 *       wear you down (the reason to take the ward);
 *   (c) BEHAVIORAL WITNESS — the player's attack var is genuinely CONSTANT across the
 *       entire fight: the wight has no effect that drains it, so honesty (not a new
 *       mechanic) is the correct fix. The promised mechanic truly does not exist.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";
import type { Effect } from "../../src/core/effects.js";

const loaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
if (!loaded.ok) throw new Error("sunken_barrow must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

const options = (s: GameState) => enumerateRpgActions(index, s);
const narrations = (effects: readonly Effect[]): string[] =>
  effects
    .filter((e): e is { narrate: string } => "narrate" in e)
    .map((e) => (e as { narrate: string }).narrate);

function act(s: GameState, pred: (a: Action) => boolean): GameState {
  const opt = options(s).find((o) => pred(o.action));
  if (!opt)
    throw new Error(
      `no action; legal=[${options(s)
        .map((o) => o.id)
        .join(", ")}]`,
    );
  const r = step(s, opt.action);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("step failed");
  return r.state;
}

const move = (dir: string) => (a: Action) => a.type === "MOVE" && a.direction === dir;
const isTalk = (a: Action) => a.type === "TALK";
const isAttack = (a: Action) => a.type === "ATTACK";
const askTopic = (topic: string) => (a: Action) =>
  a.type === "ASK" && (a as { topic?: string }).topic === topic;

function wightCounsel(seed: number): string {
  let s = initStateForRpgPack(index, seed);
  s = act(s, move("down")); // → Entry Hall
  s = act(s, move("west")); // → Reaver's Rest
  s = act(s, isTalk); // open dialogue at root
  const ask = options(s).find((o) => askTopic("ask_wight")(o.action));
  expect(ask, "ask_wight must be offered at the root").toBeTruthy();
  return narrations(rules.resolve(s, ask!.action)!.effects).join(" ").toLowerCase();
}

describe("bug_0222 — the shade's wight-counsel does not over-promise an attack/strength drain", () => {
  it("(a) HONEST: no strength/attack-drain promise in the spoken counsel", () => {
    const spoken = wightCounsel(7);
    // The old over-promise and its near neighbours — the touch sapping your *arm*/your
    // *strength*/your ability to *strike* — must be gone.
    expect(spoken).not.toMatch(/strength runs out/);
    expect(spoken).not.toMatch(/out of your arm/);
    expect(spoken).not.toMatch(/strength.*\barm\b|\barm\b.*strength/);
  });

  it("(b) the load-bearing job survives: it still names the cold blows that wear you down", () => {
    const spoken = wightCounsel(7);
    // The line must still motivate the +3 ward by naming the HP-sapping cold blows.
    expect(spoken).toMatch(/cold|chill|grave-cold/);
    expect(spoken).toMatch(/wears you down|wore me down|bites deep|bite the less/);
  });

  it("(c) BEHAVIORAL WITNESS: player attack is genuinely constant across the whole fight", () => {
    // Take the ward, then fight the wight to a resolution, asserting attack never drops.
    // (The ward route guarantees the fight resolves without an early player death on
    // most seeds; whatever the outcome, attack must never change — the wight has no
    // attack-drain effect, which is exactly why the honest reword is correct.)
    let s = initStateForRpgPack(index, 7);
    const attack0 = s.vars["attack"];
    expect(attack0).toBe(4);
    s = act(s, move("down")); // → Entry Hall
    s = act(s, move("west")); // → Reaver's Rest
    s = act(s, isTalk);
    s = act(s, askTopic("ask_wight")); // +3 defense ward
    s = act(s, askTopic("wight_back"));
    s = act(s, askTopic("leave_shade"));
    s = act(s, move("east")); // → Entry Hall
    s = act(s, move("north")); // → Guard Crypt
    let guard = 0;
    let attacks = 0;
    while (!s.ended && !s.flags["wight_slain"]) {
      s = act(s, isAttack);
      attacks++;
      expect(s.vars["attack"], "the wight must never drain the player's attack").toBe(attack0);
      if (++guard > 40) throw new Error("fight did not resolve");
    }
    expect(attacks, "the fight must take at least one combat round").toBeGreaterThan(0);
    expect(s.vars["attack"]).toBe(attack0);
  });

  it("(d) the wight declares no attack/strength-draining effect at all", () => {
    const wight = pack.enemies.find((e) => e.id === "barrow_wight")!;
    // on_defeat is the only effect list a barrow enemy carries; it must not touch attack.
    const touchesAttack = (wight.on_defeat ?? []).some(
      (e) => "inc_var" in e && (e as { inc_var: { name: string } }).inc_var.name === "attack",
    );
    expect(touchesAttack).toBe(false);
    // Sanity: the stats the rest of the suite pins are intact (content-only fix).
    expect(wight.hp).toBe(22);
    expect(wight.attack).toBe(5);
    expect(wight.defense).toBe(2);
  });
});
