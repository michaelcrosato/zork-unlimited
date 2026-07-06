/**
 * Regression (§15) for bug_0048 — in The Cold Forge the climactic tool-puzzle
 * (levering the slag grate open with the iron pry-bar and a might check) wrote
 * NOTHING to the player's journal, while every other progress milestone in the
 * pack journals: the slag sentinel's defeat ("...comes apart in cinders; the way
 * east lies open"), reaching the Ember-Heart ("You have reached the Ember-Heart"),
 * and both lantern-spirit counsels all add_journal. The grate was the lone silent
 * beat — the single biggest puzzle of the run, yet the journal stayed untouched
 * when it opened.
 *
 * A fresh, MCP-only blind playtester (seed 113, ai-runs/2026-06-01T14-04-05-750Z)
 * WON 50/50 with no mechanical bugs and flagged this as its one concrete polish
 * item (report §5): "levering the grate open does not add a journal entry, while
 * reaching the heart, killing the sentinel, and the dialogue hints all do."
 *
 * The fix is CONTENT-only (no engine/validator/stat/effect/DC/exit/gating change):
 * the grate's USE skill_check on_success gains ONE add_journal line. Because the
 * check is gated `none_of [ quest_stage forge/grate_open ]` and retires on success
 * (the bug_0015 retire-after-success pattern), the entry fires exactly once and can
 * never stack.
 *
 * Locked here:
 *   (a) before levering, the journal has no grate line;
 *   (b) after a successful lever, exactly one grate-open entry appears;
 *   (c) the entry cannot stack — the lever has retired (no longer enumerable) and a
 *       forced re-USE is rejected, so the journal count stays at one;
 *   (d) reachability/balance intact — the canonical buffed route (seed 1) still
 *       reaches ending_victory at the full 50/50.
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
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/quests/cold_forge.yaml");
if (!loaded.ok) throw new Error("cold_forge must compile");
const index = indexRpgPack(loaded.compiled.pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

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
const isUse = (a: Action) => a.type === "USE";

const GRATE_RE = /grate.*open|way down.*stands open/i;
const grateEntries = (s: GameState) => s.journal.filter((j) => GRATE_RE.test(j));

/** Reach The Forge Heart with the pry-bar, sentinel slain, grate not yet levered.
 *  Takes the lantern-spirit's +2-attack counsel first: since bug_0101 retuned the
 *  sentinel for real teeth, an under-armed thief dies on seed 1, so the buffed route
 *  is how a player reliably reaches the grate. This test's concern is the grate
 *  JOURNAL line, not the fight, so it uses the canonical (survivable) approach. */
function atForgeHeart(seed: number): GameState {
  let s = initStateForRpgPack(index, seed);
  s = act(s, move("down")); // → outer_forge
  s = act(s, (a) => a.type === "TAKE"); // pry-bar
  s = act(s, (a) => a.type === "TALK"); // lantern-spirit
  s = act(s, (a) => a.type === "ASK" && (a as { topic?: string }).topic === "ask_sentinel"); // +2 attack
  s = act(s, (a) => a.type === "ASK" && (a as { topic?: string }).topic === "sentinel_back");
  s = act(s, (a) => a.type === "ASK" && (a as { topic?: string }).topic === "leave_spirit");
  s = act(s, move("north")); // → bellows_walk
  let guard = 0;
  while (!s.flags["sentinel_stilled"] && !s.ended) {
    s = act(s, (a) => a.type === "ATTACK");
    if (++guard > 40) throw new Error("fight did not resolve");
  }
  s = act(s, move("east")); // → forge_heart
  expect(s.current).toBe("forge_heart");
  expect(s.questStage["forge"]).not.toBe("grate_open");
  return s;
}

describe("bug_0048 — levering the Cold Forge grate writes a journal entry (once)", () => {
  it("no grate journal line exists before the grate is levered", () => {
    const s = atForgeHeart(1);
    expect(grateEntries(s).length).toBe(0);
  });

  it("a successful lever adds exactly one grate-open journal entry", () => {
    let s = atForgeHeart(1);
    let guard = 0;
    while (s.questStage["forge"] !== "grate_open" && !s.ended) {
      s = act(s, isUse);
      if (++guard > 40) throw new Error("grate never opened");
    }
    expect(s.questStage["forge"]).toBe("grate_open");
    expect(grateEntries(s).length).toBe(1);
    // No duplicate journal entries overall.
    expect(new Set(s.journal).size).toBe(s.journal.length);
  });

  it("the entry cannot stack — the lever retires and a forced re-USE is rejected", () => {
    let s = atForgeHeart(1);
    let guard = 0;
    while (s.questStage["forge"] !== "grate_open" && !s.ended) {
      s = act(s, isUse);
      if (++guard > 40) throw new Error("grate never opened");
    }
    // The lever has left the legal set (retire-after-success, bug_0015).
    const grateUse: Action = { type: "USE", item: "pry_bar", target: "stone_grate" };
    expect(options(s).some((o) => actionEquals(o.action, grateUse))).toBe(false);
    // A forced re-USE is rejected, so it can never re-journal.
    const r = step(s, grateUse);
    expect(r.ok).toBe(false);
    expect(grateEntries(s).length).toBe(1);
  });

  it("reachability/balance intact — canonical route still wins ending_victory 50/50", () => {
    let s = atForgeHeart(1);
    let guard = 0;
    while (s.questStage["forge"] !== "grate_open" && !s.ended) {
      s = act(s, isUse);
      if (++guard > 40) throw new Error("grate never opened");
    }
    expect(score(s)).toBe(30); // sentinel 15 + grate 15
    s = act(s, move("down")); // → ember chamber: win on entry (+20)
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(score(s)).toBe(50);
  });
});
