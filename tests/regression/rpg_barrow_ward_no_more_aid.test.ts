/**
 * Regression (§15) for bug_0119 — the reaver's shade now tells the player the ward is
 * ALL the aid the barrow gives and the close wight fight is won by pressing on, not by
 * retreating to look for more.
 *
 * A fresh, MCP-only blind playtester on the warded route (seed 7,
 * ai-runs/2026-06-02T11-22-38-112Z) won the marquee fight and rated the pack clarity
 * 5/5, enjoyment 4/5 with no hard bugs — but flagged that mid-fight the deterministic
 * math "looked like a guaranteed loss, and I retreated thinking I was under-prepared,"
 * and that with no heal/rest mechanic "a cautious player could reasonably conclude the
 * encounter is unwinnable and quit," backing out to seek healing or gear that does not
 * exist. That is the SAME failure mode as bug_0027 (quitting a winnable game hunting a
 * missing item), here on the wight: the fight's narrow, swingy difficulty is INTENDED
 * (bug_0102 teeth, bug_0113 reliable-warded tuning, both verified live over seeds 1-40)
 * — the defect was legibility, that the shade never said the ward is the only aid.
 *
 * The fix is CONTENT/hint_text-only (no flag/var/journal/score/topic/ending/DC/stat/
 * enemy change): the ask_wight spoken counsel now adds, after the ward instruction,
 * that there is no balm/second blade/charm to find, that the grim mid-fight moment is
 * the wight's way of wearing you down rather than the true odds, and to keep striking
 * instead of breaking off to seek aid that is not here.
 *
 * Locked here:
 *   (a) the shade's live ward counsel signals "this is all the aid; press on", and
 *       explicitly denies the retreat-to-find-more inference that drove the friction;
 *   (b) the ward MECHANIC is untouched: asking still raises defense 2->5, sets
 *       heard_warding, journals the +3, and the topic then retires (one-shot);
 *   (c) the under-armed route is unchanged — the wight's stats are exactly bug_0102's.
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
const askTopic = (topic: string) => (a: Action) =>
  a.type === "ASK" && (a as { topic?: string }).topic === topic;

/** State at the shade's root node, ward not yet taken. */
function atShadeRoot(seed: number): GameState {
  let s = initStateForRpgPack(index, seed);
  s = act(s, move("down")); // → Entry Hall
  s = act(s, move("west")); // → Reaver's Rest
  s = act(s, isTalk); // open the dialogue at the root
  return s;
}

describe("bug_0119 — the shade's ward counsel says it's the only aid; press on, don't retreat to seek more", () => {
  it("the live ward counsel frames the fight as winnable-by-persistence and denies the find-more-gear inference", () => {
    const s = atShadeRoot(7);
    const ask = options(s).find((o) => askTopic("ask_wight")(o.action));
    expect(ask, "ask_wight must be offered at the root").toBeTruthy();
    const spoken = narrations(rules.resolve(s, ask!.action)!.effects).join(" ").toLowerCase();

    // Positive: it must say the ward is the whole of the aid, that the scare is the
    // wight's wearing-down (not the true odds), and to keep striking.
    expect(spoken).toMatch(/no balm|no second blade|no charm|whole of the help/);
    // bug_0132 retired the flat "not the truth of the odds" guarantee; the
    // wearing-down framing it leant on stays (see rpg_barrow_ward_honest_odds.test.ts
    // for the honest-hedge lock that replaced the over-promise).
    expect(spoken).toMatch(/wearing a man down/);
    expect(spoken).toMatch(/keep striking|set your feet/);
    // Negative: it must NOT leave open the idea that more preparation is out there to
    // find, nor that breaking off to search is the path — the readings that drove the
    // blind tester to retreat from a winnable fight.
    expect(spoken).toMatch(/seek aid that is not here|no fresher/);
    // And it must still carry the original ward instruction (turn the chill on the iron).
    expect(spoken).toMatch(/guard close|chill slide off the iron|bite the less/);
  });

  it("the ward MECHANIC is untouched by the added counsel: defense 2->5, one-shot, journalled", () => {
    let s = atShadeRoot(7);
    expect(s.vars["defense"]).toBe(2);
    s = act(s, askTopic("ask_wight"));
    expect(s.flags["heard_warding"]).toBe(true);
    expect(s.vars["defense"]).toBe(5); // +3 ward, unchanged
    expect(s.journal.some((j) => j.includes("+3 defense"))).toBe(true);
    s = act(s, askTopic("wight_back")); // back to root
    expect(options(s).some((o) => askTopic("ask_wight")(o.action))).toBe(false); // retired
    expect(s.vars["defense"]).toBe(5); // not re-buffed
  });

  it("the under-armed fight is unchanged — the wight keeps bug_0102's stats (this is a legibility fix, not a balance retune)", () => {
    const wight = pack.enemies.find((e) => e.id === "barrow_wight")!;
    expect(wight.hp).toBe(22);
    expect(wight.attack).toBe(5);
    expect(wight.defense).toBe(2);
  });
});
