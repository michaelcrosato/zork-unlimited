/**
 * Regression (§15) for bug_0242 — the climactic might-check in The Cold Forge
 * (levering the slag grate, DC 12) must stay RECOVERABLE on a FAILED roll: the
 * lever interaction is gated only `none_of [ quest_stage forge/grate_open ]`, so a
 * failed check (which sets nothing) leaves the action in the legal set and the
 * player can simply heave again. The run can never soft-lock on a bad roll.
 *
 * Why this needs its own pin (the gap the blind pass exposed)
 * -----------------------------------------------------------
 * A fresh MCP-only blind playtester (cold_forge, seed 17,
 * ai-runs/2026-06-04T17-10-26-555Z/playtest.md §5) WON 50/50 with zero bugs but
 * could not confirm one thing from the inside: it rolled a passing 9 on its only
 * grate attempt and so "never saw a failure — worth confirming the fail branch is
 * recoverable rather than soft-locking." It is, but nothing pinned it, and the two
 * existing structural proofs both MISS this specific regression:
 *   - rpg_skillcheck_retires.test.ts proves the lever retires AFTER SUCCESS (so it
 *     cannot re-roll a contradiction once the grate is open). It says nothing about
 *     the failure branch.
 *   - rpg_all_endings_reachable.test.ts unions a best- AND worst-roll regime FROM
 *     EACH state, so it reaches grate_open via the best regime's lucky FIRST roll —
 *     it would still reach ending_victory even if a failed check wrongly retired the
 *     lever. So it cannot catch a "retire-on-failure" soft-lock either.
 * If a future edit gated the lever on (or its on_failure set) grate_open — or any
 * one-shot flag — a player who failed the first heave would find the action gone and
 * the way down sealed forever, a hard soft-lock invisible to both proofs above.
 *
 * How this stays sound: the only randomness is the d20 skill roll, exposed through
 * the `buildRpgRules(index, rngFor)` seam (its default is the real step-keyed PRNG,
 * so production play is byte-identical). We drive the seam to manufacture a concrete
 * fail-then-succeed sequence — a d20 of 1 (1+3=4 < 12, fail) then a d20 of 20
 * (20+3=23 ≥ 12, success). Both are legal die faces, so the play is realizable by a
 * concrete seed; combat at the Bellows Walk gets player-best rolls so base stats win
 * the fight and the test's concern stays the grate, not the sentinel.
 *
 * Locked here:
 *   (a) at the Forge Heart, pre-lever, the grate USE is legal and grate_open unset;
 *   (b) a FAILED lever narrates an honest failure that signposts the retry ("try
 *       again") and sets NOTHING — grate_open stays unset, the run does not end;
 *   (c) CRUCIAL: after the failure the grate USE is STILL legal (the retry the
 *       playtester could not confirm — no soft-lock);
 *   (d) a retry that SUCCEEDS levers the grate open, awards +15, and now retires;
 *   (e) the win stays reachable THROUGH a failure — down → ending_victory, 50/50.
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
import type { Rng } from "../../src/core/rng.js";
import type { Action } from "../../src/api/types.js";
import type { Effect } from "../../src/core/effects.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/quests/cold_forge.yaml");
if (!loaded.ok) throw new Error("cold_forge must compile");
const index = indexRpgPack(loaded.compiled.pack);

// A fixed-sequence PRNG (same shape as rpg_all_endings_reachable's): each `int`
// draw maps the next fraction the way mulberry32 does — HIGH→max face, 0→min face.
const HIGH = 0.999999;
const LOW = 0;
function fixedSeqRng(fracs: number[]): Rng {
  let i = 0;
  const next = (): number => {
    const f = fracs[Math.min(i, fracs.length - 1)] ?? 0;
    i += 1;
    return f;
  };
  return {
    next,
    int(min: number, max: number): number {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      return lo + Math.floor(next() * (hi - lo + 1));
    },
  };
}

// rngFor branches on the room: combat at the Bellows Walk always rolls player-best
// (own strike max, damage taken min) so base stats win the fight; the grate skill
// check at the Forge Heart fails or succeeds per `skillSucceeds`. Flag-driven, so a
// call is deterministic however many times the seam is hit (resolve + step).
let skillSucceeds = false;
const rngFor = (s: GameState): Rng =>
  s.current === "forge_heart"
    ? fixedSeqRng([skillSucceeds ? HIGH : LOW])
    : fixedSeqRng([HIGH, LOW]);

const rules = buildRpgRules(index, rngFor);
const step = makeStep(rules);

const score = (s: GameState): number => buildRpgObservation(index, s).score;
const options = (s: GameState) => enumerateRpgActions(index, s);
const narrations = (effects: Effect[]): string[] =>
  effects.filter((e): e is { narrate: string } => "narrate" in e).map((e) => e.narrate);

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

const GRATE_USE: Action = { type: "USE", item: "pry_bar", target: "stone_grate" };
const grateLegal = (s: GameState): boolean =>
  options(s).some((o) => actionEquals(o.action, GRATE_USE));

/** Reach the Forge Heart with the pry-bar, sentinel slain, grate not yet levered.
 *  Combat rolls are forced player-best (above), so the base-stat fight wins and the
 *  test isolates the grate, not the sentinel. */
function atForgeHeart(): GameState {
  let s = initStateForRpgPack(index, 17);
  s = act(s, move("down")); // → outer_forge
  s = act(s, (a) => a.type === "TAKE"); // pry-bar
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

describe("bug_0242 — a FAILED Cold Forge grate check stays recoverable (no soft-lock)", () => {
  it("the grate lever is legal at the Forge Heart before any attempt", () => {
    const s = atForgeHeart();
    expect(grateLegal(s)).toBe(true);
  });

  it("a failed lever narrates an honest, retry-signposting failure and sets nothing", () => {
    skillSucceeds = false;
    const s = atForgeHeart();
    const res = rules.resolve(s, GRATE_USE);
    expect(res).not.toBeNull();
    const narr = narrations(res!.effects);
    // The d20 breakdown reads as a failure...
    expect(narr.some((n) => /d20 .*vs 12 — failure/.test(n))).toBe(true);
    // ...and the prose tells the player they may heave again (recoverability, signposted).
    expect(narr.some((n) => /try again/i.test(n))).toBe(true);
    // The failure branch writes no quest-stage / score effect — it changes nothing.
    expect(res!.effects.some((e) => "set_quest_stage" in e || "inc_var" in e)).toBe(false);
  });

  it("CRUCIAL: after a failed heave the grate lever is STILL legal — the run can recover", () => {
    skillSucceeds = false;
    let s = atForgeHeart();
    s = act(s, (a) => actionEquals(a, GRATE_USE)); // fails (d20=1)
    expect(s.questStage["forge"]).not.toBe("grate_open");
    expect(s.ended).toBe(false);
    // The retry the blind playtester could not confirm: the lever has NOT retired.
    expect(grateLegal(s)).toBe(true);
  });

  it("a retry succeeds, levers the grate (+15), and only NOW retires", () => {
    let s = atForgeHeart();
    skillSucceeds = false;
    const before = score(s);
    s = act(s, (a) => actionEquals(a, GRATE_USE)); // fail — no score, still legal
    expect(score(s)).toBe(before);
    skillSucceeds = true;
    s = act(s, (a) => actionEquals(a, GRATE_USE)); // success — grate opens
    expect(s.questStage["forge"]).toBe("grate_open");
    expect(score(s)).toBe(before + 15);
    // Retire-after-success still holds (bug_0015) — the lever leaves the legal set.
    expect(grateLegal(s)).toBe(false);
  });

  it("the win is reachable THROUGH a failure — fail, retry, descend, ending_victory 50/50", () => {
    let s = atForgeHeart();
    skillSucceeds = false;
    s = act(s, (a) => actionEquals(a, GRATE_USE)); // failed heave
    skillSucceeds = true;
    s = act(s, (a) => actionEquals(a, GRATE_USE)); // successful heave
    expect(s.questStage["forge"]).toBe("grate_open");
    s = act(s, move("down")); // → ember chamber: win on entry (+20)
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(score(s)).toBe(50);
  });
});
