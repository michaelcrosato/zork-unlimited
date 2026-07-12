/**
 * Regression (§15) for bug_0398 — The Sunken Barrow's reaver-shade branch is
 * load-bearing preparation for the wight, but the Entry Hall made it read like
 * optional eerie flavor and stayed stale after the shade was known.
 *
 * Fresh blind playtest seed 7 (2026-06-20) won via the intended shade route, then
 * flagged three linked honesty issues:
 *   (a) west looked dangerous/optional, not safe/helpful counsel before the wight;
 *   (b) returning after the shade still said "something lingers ... watchful";
 *   (c) the iron bar examine implied a hard strength gate, though the slab is an
 *       unlimited retry d20+might lever check.
 *
 * This locks the fix through the real RPG observation/action path: first-contact
 * Entry Hall text points west as counsel before blood, post-shade Entry Hall text
 * acknowledges the known shade, Guard Crypt warns an unwarded north-first player
 * before they attack, and the iron bar examine frames leverage without a false
 * strength wall. Mechanics are intentionally untouched.
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
import type { Action } from "../../src/api/types.js";
import type { GameEvent } from "../../src/core/events.js";
import type { GameState } from "../../src/core/state.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

const loaded = loadRpgSourceFile("content/rpg/quests/sunken_barrow.yaml");
if (!loaded.ok) throw new Error("sunken_barrow must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

const options = (s: GameState) => enumerateRpgActions(index, s);
const obsText = (s: GameState) => buildRpgObservation(index, s).description.toLowerCase();
const move = (dir: string) => (a: Action) => a.type === "MOVE" && a.direction === dir;
const ask = (topic: string) => (a: Action) =>
  a.type === "ASK" && (a as { topic?: string }).topic === topic;

function run(
  s: GameState,
  pred: (a: Action) => boolean,
): { state: GameState; events: GameEvent[] } {
  const opt = options(s).find((o) => pred(o.action));
  if (!opt)
    throw new Error(
      `no action; legal=[${options(s)
        .map((o) => o.id)
        .join(", ")}] in ${s.current}`,
    );
  const r = step(s, opt.action);
  expect(r.ok).toBe(true);
  return { state: r.state, events: r.events };
}

function act(s: GameState, pred: (a: Action) => boolean): GameState {
  return run(s, pred).state;
}

function narrations(events: readonly GameEvent[]): string[] {
  return events
    .filter((e): e is GameEvent & { type: "narration"; text: string } => e.type === "narration")
    .map((e) => e.text);
}

function learnWarding(s: GameState): GameState {
  s = act(s, move("west"));
  s = act(s, (a) => a.type === "TALK");
  s = act(s, ask("ask_wight"));
  expect(options(s).map((o) => o.id)).toEqual(
    expect.arrayContaining(["ask_ask_lord", "ask_leave_shade", "go_east"]),
  );
  expect(options(s).map((o) => o.id)).not.toContain("ask_wight_back");
  s = act(s, ask("leave_shade"));
  return act(s, move("east"));
}

describe("bug_0398 — sunken_barrow signposts the shade as counsel before the wight", () => {
  it("(a) first Entry Hall text invites west as counsel, not an ambush, before the cold north passage", () => {
    let s = initStateForRpgPack(index, 7);
    s = act(s, move("down"));

    const text = obsText(s);
    expect(text).toContain("unwarned blade");
    expect(text).toContain("old counsel");
    expect(text).toContain("not an ambush");
    expect(text).not.toContain("something lingers");
  });

  it("(b) the bar-taken Entry Hall variant keeps the same west-before-north cue", () => {
    let s = initStateForRpgPack(index, 7);
    s = act(s, move("down"));
    s = act(s, (a) => a.type === "TAKE" && (a as { item?: string }).item === "iron_bar");

    const text = obsText(s);
    expect(text).toContain("rubble is scuffed bare");
    expect(text).toContain("unwarned blade");
    expect(text).toContain("old counsel");
    expect(text).not.toContain("something lingers");
  });

  it("(c) after speaking with the shade, Entry Hall acknowledges known counsel instead of stale mystery", () => {
    let s = initStateForRpgPack(index, 7);
    s = act(s, move("down"));
    s = learnWarding(s);

    const text = obsText(s);
    expect(text).toContain("reaver's shade");
    expect(text).toContain("counsel given");
    expect(text).toContain("no malice");
    expect(text).not.toContain("something lingers");
  });

  it("(d) Guard Crypt gives north-first players a last fair hint, but warded players see their prep acknowledged", () => {
    let unwarded = initStateForRpgPack(index, 7);
    unwarded = act(unwarded, move("down"));
    unwarded = act(unwarded, move("north"));
    const unwardedText = obsText(unwarded);
    expect(unwardedText).toContain("unwarned blade");
    expect(unwardedText).toContain("counsel before blood");
    expect(options(unwarded).map((o) => o.id)).toContain("go_south");
    expect(options(unwarded).map((o) => o.id)).toContain("attack_barrow_wight");

    let warded = initStateForRpgPack(index, 7);
    warded = act(warded, move("down"));
    warded = learnWarding(warded);
    warded = act(warded, move("north"));
    const wardedText = obsText(warded);
    expect(wardedText).toContain("warding trick");
    expect(wardedText).toContain("not an unwarned one");
    expect(wardedText).not.toContain("counsel before blood");
  });

  it("(e) examining the iron bar no longer frames the slab as a hard strength gate", () => {
    let s = initStateForRpgPack(index, 7);
    s = act(s, move("down"));
    const examine = run(
      s,
      (a) => a.type === "LOOK" && (a as { target?: string }).target === "iron_bar",
    );
    const text = narrations(examine.events).join(" ").toLowerCase();

    expect(text).toContain("patient lever");
    expect(text).toContain("not a verdict");
    expect(text).toContain("heroic strength");
    expect(text).not.toContain("if you have the strength");
  });

  it("(f) validates green with no mechanical changes to the ward or wight", () => {
    expect(validateRpg(pack).findings).toHaveLength(0);
    const wight = pack.enemies.find((e) => e.id === "barrow_wight")!;
    expect(wight.hp).toBe(22);
    expect(wight.attack).toBe(5);
    expect(wight.defense).toBe(2);

    const ward = pack.npcs
      .find((n) => n.id === "reaver_shade")!
      .dialogue.nodes.find((n) => n.id === "shade_wight")!
      .effects.find((e): e is { inc_var: { name: string; by: number } } => "inc_var" in e);
    expect(ward?.inc_var).toEqual({ name: "defense", by: 3 });
  });
});
