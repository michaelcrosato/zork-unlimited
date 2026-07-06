/**
 * Regression (§15) for bug_0095 — content_fix: the sealed sarcophagus's examine no
 * longer promises the SLAB's might-check mechanic that the prise action never performs.
 *
 * A fresh, MCP-only blind playtester (seed 5, ai-runs/2026-06-02T00-34-06-096Z, the
 * mandated pass rotated off the content-complete clockwork target onto the never-blind-
 * tested sunken_barrow) reached both ending_victory and ending_woken with zero
 * functional bugs, then flagged one concrete examine/action mismatch: the sarcophagus
 * examine read "Prising the lid would want the iron bar and a stubborn back, the same
 * as the slab did" — explicitly promising the slab's `skill_check` (might vs 12, "may
 * give on the first heave or take several") — yet the prise interaction has NO
 * skill_check: it fires `end_game: ending_woken` instantly on the first use, no roll.
 * Text writing a check the engine never cashes is the same over-promise the pack's
 * honesty discipline fights (bug_0027/0029, and the slab's own bug_0069 reword).
 *
 * Fix (content, examine-only): the sarcophagus `description` is reworded so it no
 * longer claims parity with the slab — it still names the iron bar (genuinely required)
 * and repeats the warning, but reads true to the terminal act ("no patient slab to be
 * worked loose by degrees: one wrench of the lid and the deed is done, past all
 * undoing"). No interaction/flag/quest/score/win/ending change.
 *
 * Locked here:
 *   (a) the examine no longer promises the slab's repeatable might-check — it contains
 *       neither "the same as the slab" nor "a stubborn back", and signals a single,
 *       irrevocable act; it still names the iron bar and repeats the don't-wake warning;
 *   (b) the prise interaction is unchanged and STILL has no skill_check — prising the
 *       sarcophagus with the iron bar ends the run at ending_woken instantly on the
 *       first use (so the reworded text reads true to what actually happens);
 *   (c) examining the sarcophagus is purely cosmetic (changes no state), and the
 *       peaceful canonical route still reaches ending_victory at full 50/50.
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
import type { Action, RpgAction } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";
import type { Effect } from "../../src/core/effects.js";

const loaded = loadRpgSourceFile("content/rpg/quests/sunken_barrow.yaml");
if (!loaded.ok) throw new Error("sunken_barrow must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

const options = (s: GameState) => enumerateRpgActions(index, s);
const score = (s: GameState): number => buildRpgObservation(index, s).score;

const EXAMINE_SARC: RpgAction = { type: "LOOK", target: "sarcophagus" };

const narrations = (effects: readonly Effect[]): string[] =>
  effects
    .filter((e): e is { narrate: string } => "narrate" in e)
    .map((e) => (e as { narrate: string }).narrate);

/** The text the explicit `look at sarcophagus` examine emits in this state. */
function examineSarcophagus(s: GameState): string {
  const res = rules.resolve(s, EXAMINE_SARC);
  expect(res, "look at sarcophagus must resolve").not.toBeNull();
  const text = narrations(res!.effects).join(" ");
  expect(text.length, "examine must produce narration").toBeGreaterThan(0);
  return text;
}

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
const isLeverSlab = (a: Action) =>
  a.type === "USE" && (a as { target?: string }).target === "stone_slab";
const isPriseSarcophagus = (a: Action) =>
  a.type === "USE" && (a as { target?: string }).target === "sarcophagus";
const canDo = (s: GameState, pred: (a: Action) => boolean) =>
  options(s).some((o) => pred(o.action));

/** Walk the canonical route to the Relic Chamber: take the bar, slay the wight, lever
 *  the slab, descend. Leaves the player IN the chamber, bar in hand. */
function descendToChamber(seed: number): GameState {
  let s = initStateForRpgPack(index, seed);
  s = act(s, move("down")); // → Entry Hall
  s = act(s, isTake); // take the iron bar
  s = act(s, move("north")); // → Guard Crypt
  let guard = 0;
  while (!s.flags["wight_slain"] && !s.ended) {
    s = act(s, isAttack);
    if (++guard > 20) throw new Error("fight did not resolve");
  }
  s = act(s, move("east")); // → Slab Passage
  guard = 0;
  while (s.questStage["barrow"] !== "slab_moved" && !s.ended) {
    s = act(s, isLeverSlab); // might check; retry until it gives
    if (++guard > 40) throw new Error("slab never moved");
  }
  s = act(s, move("down")); // → Relic Chamber
  expect(s.current).toBe("relic_chamber");
  return s;
}

describe("bug_0095 — the sarcophagus examine no longer promises the slab's might-check", () => {
  it("examine names the iron bar + the warning but NOT the slab's repeatable heave", () => {
    const s = descendToChamber(1);
    const text = examineSarcophagus(s);
    const lc = text.toLowerCase();
    // Still load-bearing: the iron bar is named (it is genuinely required to prise)…
    expect(lc).toContain("iron bar");
    // …and the don't-wake warning is repeated, so the act stays informed (not a gotcha).
    expect(lc).toMatch(/do not think to wake|sleeps here|warning/);
    // The over-promise is GONE: no claim of parity with the slab, no "stubborn back",
    // no might-check grammar implying a repeatable heave.
    expect(lc).not.toContain("the same as the slab");
    expect(lc).not.toContain("stubborn back");
    // It reads true to the terminal one-shot act instead.
    expect(lc).toMatch(/one wrench|the deed is done|past all undoing|no patient slab/);
  });

  it("the prise action STILL has no skill_check — it ends the run instantly on first use", () => {
    let s = descendToChamber(1);
    expect(s.inventory).toContain("iron_bar");
    expect(canDo(s, isPriseSarcophagus)).toBe(true);
    // Resolve (not step) to inspect the interaction's effects: no skill_check is run,
    // the effects end the game directly — exactly what the reworded text now promises.
    const res = rules.resolve(s, options(s).find((o) => isPriseSarcophagus(o.action))!.action);
    expect(res).not.toBeNull();
    const endsGame = res!.effects.some(
      (e) => "end_game" in e && (e as { end_game: string }).end_game === "ending_woken",
    );
    expect(endsGame, "prise must end the game directly (no skill_check)").toBe(true);

    s = act(s, isPriseSarcophagus);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_woken");
    expect(s.endingId).not.toBe("ending_fallen");
  });

  it("examining is cosmetic, and the peaceful route still wins ending_victory 50/50", () => {
    let s = descendToChamber(1);
    const before = JSON.stringify({
      stage: s.questStage["barrow"],
      score: s.vars["score"],
      room: s.current,
      ended: s.ended,
    });
    examineSarcophagus(s);
    const after = JSON.stringify({
      stage: s.questStage["barrow"],
      score: s.vars["score"],
      room: s.current,
      ended: s.ended,
    });
    expect(after).toBe(before);

    // The safe, signposted act is still front and centre and still wins at full score.
    expect(canDo(s, isTake)).toBe(true);
    s = act(s, isTake); // take the circlet → win fires on the claim
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(score(s)).toBe(50);
  });
});
