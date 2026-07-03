/**
 * Regression (§15) for bug_0083 — content_fix: cashing the reaver's shade's
 * Chekhov's-gun warning. A fresh blind playtester (seed 7,
 * ai-runs/2026-06-01T22-01-39-067Z/playtest.md) named the pack's single biggest
 * design gap: the shade's gravest line — "do not think to wake what sleeps beneath
 * the slab; the Lord is long past waking" — framed the descent as a real moral
 * choice (heed it and take only the crown, or wake the Barrow-Lord), yet the warning
 * pointed at NOTHING: the Relic Chamber held only a circlet on a plinth, with no Lord
 * present, no action to wake him, and no consequence — "a Chekhov's gun that never
 * fires", and a continuity wobble (the intro sings of the crown "on his brow", but
 * no Lord was there).
 *
 * The fix is pure CONTENT: the Barrow-Lord now lies in a sealed sarcophagus in the
 * Relic Chamber beside the circlet's plinth, and the warned-against act is real and
 * terminal — PRISING the sealed lid with the iron bar (the player always holds it:
 * the slab cannot be levered without it, bug_0069) wakes the Lord and ends the run at
 * a new doom ending, ending_woken. It is an INFORMED choice, never a gotcha (the
 * pack's bug_0027/0029 discipline): the shade warns it outright, the chamber prose
 * telegraphs the heavy, wrong air over the lid, and the obvious signposted act — take
 * the crown — is the safe one.
 *
 * Locked here:
 *   (1) the pack still compiles + validates green under the full RPG validator (the
 *       new object, interaction, and ending are well-formed; ending_woken is declared,
 *       reached by the interaction's end_game, and a death ending — so the game stays
 *       winnable via the surviving non-death ending_victory);
 *   (2) the PEACEFUL victory is UNCHANGED: the canonical route (take the crown, never
 *       touch the sarcophagus) still reaches ending_victory at the full 50/50;
 *   (3) the DOOM fork is real: prising the sarcophagus with the iron bar ends the run
 *       at ending_woken (a death ending), and the prise action is offered in the
 *       chamber (the descended player always holds the bar);
 *   (4) the two endings now score DIFFERENTLY (bug_0107): the peaceful victory takes the
 *       crown, whose take_effects award the final +25 → 50/50; the doom fork prises the
 *       sarcophagus WITHOUT ever taking the crown, so it tops out at 25/50 — the score
 *       tally now distinguishes the true win from the irreversible doom.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
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

const loaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
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
const isTake = (a: Action) => a.type === "TAKE";
const isLeverSlab = (a: Action) =>
  a.type === "USE" && (a as { target?: string }).target === "stone_slab";
const isPriseSarcophagus = (a: Action) =>
  a.type === "USE" && (a as { target?: string }).target === "sarcophagus";
const canDo = (s: GameState, pred: (a: Action) => boolean) =>
  options(s).some((o) => pred(o.action));

/** Walk the canonical route up to (but not into) the Relic Chamber: take the bar,
 *  slay the wight, lever the slab, descend. Leaves the player IN the chamber. */
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
  s = act(s, move("down")); // → Relic Chamber (no score on entry; the +25 rides the claim, bug_0107)
  expect(s.current).toBe("relic_chamber");
  return s;
}

describe("bug_0083 — the Barrow-Lord's sarcophagus: cashing the shade's 'do not wake him' warning", () => {
  it("compiles and validates green; ending_woken is a declared death ending, game still winnable", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
    // The new object and doom ending exist; the peaceful win still exists.
    expect(pack.objects.map((o) => o.id)).toContain("sarcophagus");
    const woken = pack.endings.find((e) => e.id === "ending_woken");
    expect(woken?.death).toBe(true);
    expect(pack.endings.some((e) => e.id === "ending_victory" && !e.death)).toBe(true);
  });

  it("PEACEFUL: the canonical route ignores the sarcophagus and still wins 50/50 (unchanged)", () => {
    let s = descendToChamber(1);
    // Both the safe take and the warned-against prise are on offer here.
    expect(canDo(s, isTake)).toBe(true);
    expect(canDo(s, isPriseSarcophagus)).toBe(true);
    s = act(s, isTake); // take the circlet → win fires on the claim
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(score(s)).toBe(50);
  });

  it("DOOM: prising the sarcophagus with the iron bar wakes the Lord → ending_woken", () => {
    let s = descendToChamber(1);
    expect(s.inventory).toContain("iron_bar"); // the descended player always holds the bar
    expect(canDo(s, isPriseSarcophagus)).toBe(true);
    s = act(s, isPriseSarcophagus);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_woken");
    // Distinct from ending_fallen (dying to the wight) and from ending_victory.
    expect(s.endingId).not.toBe("ending_fallen");
    // The doom is now scored DISTINCTLY from the victory (bug_0107): prising the
    // sarcophagus never takes the crown, so its take_effects +25 never fires — the
    // doom tops out at 25/50, half the true victory's 50/50.
    expect(score(s)).toBe(25);
    expect(score(s)).toBeLessThan(pack.meta.max_score);
  });
});
