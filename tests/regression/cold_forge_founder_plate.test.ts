/**
 * Regression (§15) for bug_0076 — THE COLD FORGE gets its second beat: the
 * Founder's Cell and the dead master's cold-iron plate.
 *
 * Every blind pass of the forge lands the same single note: bug-free, clarity 5/5,
 * but BRIEF and one-path (enjoyment 3/5 — "one meaningful choice"). cold_forge was
 * the last pack still carrying that brevity critique. This cycle's content_new adds
 * an OPTIONAL side beat mirroring the proven barrow reaver-shade shape (bug_0075):
 * a cell reached by a new `west` exit from the Outer Forge, met BEFORE the fight,
 * that (a) deepens the world — the forge's last master, who banked the dying fire's
 * last coal into the Ember-Heart and walled himself in with the cold so the
 * sentinel would keep it (epitaph + a one-shot spirit lore-topic that signposts the
 * cell), and (b) offers ONE earned tactical choice: take and DON his cold-iron plate
 * for a one-time +2 DEFENSE that turns the worst of the sentinel's anvil-blows.
 *
 * The +2 defense is the honest DEFENSE complement to the lantern-spirit's +2 ATTACK
 * counsel — optional grace, not a free win: combat is d6+atk-def (min 1), so a +2
 * ward EASES but never ZEROES the sentinel's blow, the canonical victory route never
 * comes to the cell, and the fight stays winnable AND lethal from base stats (the
 * latter still locked by cold_forge_pack.test.ts's seed-2 death). Purely additive:
 * no existing room/combat/lever/score(50)/win/ending is touched.
 *
 * Locked here:
 *   (1) the pack still validates green under the full RPG validator;
 *   (2) the cell is reachable and escapable (outer_forge ⇄ west/east founder_cell);
 *   (3) taking + donning the plate is a real, one-shot, MECHANICAL +2 defense
 *       (2→4), journals once, and the "don" action retires (cannot be farmed); a
 *       forced re-USE after donning is rejected and never re-applies the +2;
 *   (4) the "don" verb is the natural command_verb ("don cold-iron plate"), not
 *       the generic "use";
 *   (5) the spirit's ask_founder topic is one-shot LORE that signposts the cell
 *       (journal names "west") and grants NO stat change by the telling — the +2 is
 *       earned by donning, not by asking;
 *   (6) reactive prose: the founder reads "in cold-iron plate" until the plate is
 *       taken, then "bare"; the plate reads "buckled on" once donned (bug_0023);
 *   (7) the beat is OPTIONAL — the canonical buffed route ignores the cell, never
 *       gains the +2 defense (stays at base 2), and still wins ending_victory 50/50.
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

const loaded = loadRpgSourceFile("content/rpg/quests/cold_forge.yaml");
if (!loaded.ok) throw new Error("cold_forge must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));

const score = (s: GameState): number => buildRpgObservation(index, s).score;
const options = (s: GameState) => enumerateRpgActions(index, s);

function run(s: GameState, pred: (a: Action) => boolean): { state: GameState; events: unknown[] } {
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
  return { state: r.state, events: r.events };
}
const act = (s: GameState, pred: (a: Action) => boolean): GameState => run(s, pred).state;

const move = (dir: string) => (a: Action) => a.type === "MOVE" && a.direction === dir;
const isTalk = (a: Action) => a.type === "TALK";
const isUse = (a: Action) => a.type === "USE";
const askTopic = (topic: string) => (a: Action) =>
  a.type === "ASK" && (a as { topic?: string }).topic === topic;
const canAsk = (s: GameState, topic: string) => options(s).some((o) => askTopic(topic)(o.action));
const lookAt = (target: string) => (a: Action) =>
  a.type === "LOOK" && (a as { target?: string }).target === target;

/** Narration text produced by stepping an action (the reactive examine prose). */
function narration(s: GameState, pred: (a: Action) => boolean): string {
  const { events } = run(s, pred);
  return (events as { type: string; text?: string }[])
    .filter((e) => e.type === "narration")
    .map((e) => e.text ?? "")
    .join(" ");
}

/** Walk to the Outer Forge and step into the Founder's Cell to the west. */
function enterCell(seed = 1): GameState {
  let s = initStateForRpgPack(index, seed);
  s = act(s, move("down")); // → outer_forge
  s = act(s, move("west")); // → founder_cell (the new exit)
  expect(s.current).toBe("founder_cell");
  return s;
}

describe("bug_0076 — The Cold Forge's Founder's Cell + cold-iron plate (optional second beat)", () => {
  it("(1) the pack still validates green under the full RPG validator", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("(2) the cell is reachable from the Outer Forge and you can step back out", () => {
    let s = enterCell();
    s = act(s, move("east")); // → back to outer_forge, no soft-lock
    expect(s.current).toBe("outer_forge");
  });

  it("(3) take + don the plate is a one-shot, mechanical +2 defense (2→4) that retires", () => {
    let s = enterCell();
    expect(s.vars["defense"]).toBe(2);

    s = act(s, (a) => a.type === "TAKE" && (a as { item?: string }).item === "cold_iron_plate");
    expect(s.inventory).toContain("cold_iron_plate");
    expect(s.vars["defense"]).toBe(2); // taking alone does not buff

    const before = s.journal.length;
    s = act(s, isUse); // "don cold-iron plate" (the only USE offered here)
    expect(s.flags["plate_donned"]).toBe(true);
    expect(s.vars["defense"]).toBe(4); // the ward is real and mechanical
    expect(s.journal.length).toBe(before + 1);
    expect(s.journal.at(-1)).toMatch(/\+2 defense/);

    // One-shot: the don action is gone, and a forced re-USE is rejected (no re-buff).
    expect(options(s).some((o) => o.action.type === "USE")).toBe(false);
    const re: Action = { type: "USE", item: "cold_iron_plate", target: "cold_iron_plate" };
    const r = step(s, re);
    expect(r.ok).toBe(false);
    expect(s.vars["defense"]).toBe(4); // still 4, not stacked to 6
  });

  it("(4) the offered verb is the natural 'don', not the generic 'use'", () => {
    let s = enterCell();
    s = act(s, (a) => a.type === "TAKE" && (a as { item?: string }).item === "cold_iron_plate");
    const useOpt = options(s).find((o) => o.action.type === "USE");
    expect(useOpt?.command).toMatch(/^don /);
  });

  it("(5) the spirit's ask_founder is one-shot lore that signposts the cell, with no stat change", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down")); // → outer_forge
    s = act(s, isTalk);
    expect(canAsk(s, "ask_founder")).toBe(true);
    const beforeDef = s.vars["defense"];
    const beforeJournal = s.journal.length;
    s = act(s, askTopic("ask_founder"));
    expect(s.flags["heard_founder"]).toBe(true);
    expect(s.vars["defense"]).toBe(beforeDef); // asking grants NO buff (earned by donning)
    expect(s.journal.length).toBe(beforeJournal + 1);
    expect(s.journal.at(-1)?.toLowerCase()).toContain("west"); // it points at the cell
    s = act(s, askTopic("founder_back")); // back to root
    expect(canAsk(s, "ask_founder")).toBe(false); // retired — cannot be re-told
    expect(canAsk(s, "ask_sentinel")).toBe(true); // the buff topic still offered
  });

  it("(6) reactive prose: the founder loses his plate, the plate reads worn once donned", () => {
    let s = enterCell();
    expect(narration(s, lookAt("founder")).toLowerCase()).toContain("in cold-iron plate");

    s = act(s, (a) => a.type === "TAKE" && (a as { item?: string }).item === "cold_iron_plate");
    const founderNow = narration(s, lookAt("founder")).toLowerCase();
    expect(founderNow).toContain("bare"); // no longer "armoured still"
    expect(founderNow).not.toContain("in cold-iron plate");

    s = act(s, isUse); // don it
    expect(narration(s, lookAt("cold_iron_plate")).toLowerCase()).toContain("buckled on");
  });

  it("(7) the beat is optional: the canonical buffed route ignores the cell and still wins 50/50 at base defense", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down")); // → outer_forge (NOT west)
    s = act(s, (a) => a.type === "TAKE"); // pry-bar
    s = act(s, isTalk);
    s = act(s, askTopic("ask_sentinel")); // +2 attack
    s = act(s, askTopic("sentinel_back"));
    s = act(s, askTopic("ask_heart"));
    s = act(s, askTopic("heart_back"));
    s = act(s, askTopic("leave_spirit"));
    expect(s.vars["defense"]).toBe(2); // never visited the cell → no ward

    s = act(s, move("north")); // → bellows_walk
    let guard = 0;
    while (!s.flags["sentinel_stilled"] && !s.ended) {
      s = act(s, (a) => a.type === "ATTACK");
      if (++guard > 20) throw new Error("fight did not resolve");
    }
    expect(s.ended).toBe(false);
    expect(score(s)).toBe(15);

    s = act(s, move("east")); // → forge_heart
    guard = 0;
    while (s.questStage["forge"] !== "grate_open" && !s.ended) {
      s = act(s, isUse); // lever the grate
      if (++guard > 40) throw new Error("grate never opened");
    }
    expect(score(s)).toBe(30);

    s = act(s, move("down")); // → ember_chamber: win on entry
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(score(s)).toBe(50);
  });
});
