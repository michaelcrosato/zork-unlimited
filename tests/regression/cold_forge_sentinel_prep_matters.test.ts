/**
 * Regression (§15) for bug_0101 — The Cold Forge's slag-sentinel finally has the
 * TEETH its prose always promised, so PREPARATION decides the fight.
 *
 * Every blind pass of this pack lands the same enjoyment knock, and the fresh
 * seed-23 MCP-only pass that prompted this cycle (ai-runs/2026-06-02T01-55-43-557Z/
 * playtest.md) put it in mechanical terms: there is "no real failure state", the
 * sentinel "dies in exactly 3 hits whether I had attack 4 or attack 6" so the
 * lantern-spirit's +2-attack counsel "felt pointless", and the room's own warning
 * — "better not to meet it under-armed — face it with every edge you can bring to
 * bear" — "writes a check the mechanics don't cash." The old hp16/atk4 sentinel was
 * simply too soft for a 20-HP player: under-armed play strolled through it (the
 * tester won with 9 HP to spare) and every tier of preparation was cosmetic.
 *
 * The fix retunes the sentinel to hp18/atk7 (defense unchanged). This is the sound
 * "gear up first" design the bug_0097 winnability proof was widened to permit: that
 * proof credits the player's BEST REACHABLE stats (init + every reachable +attack/
 * +defense buff = atk6/def4), so the fight is still PROVABLY winnable to the
 * validator and cold_forge stays a clean 0-finding pack — while BASE-stat play is a
 * genuine, lethal gamble the bar never required to be safe. Verified live over seeds
 * 1-40: under-armed loses on a majority of seeds; the spirit's +2 attack lifts the
 * win rate ~45%→~90% (the decisive lever); the founder's plate on top makes it a
 * near-certain win. No prose/flag/score/ending/exit change — only the two enemy
 * stats — so every other cold_forge proof still holds.
 *
 * Locked here:
 *   (1) the retuned pack still validates green (no COMBAT_UNWINNABLE): the fight is
 *       provably winnable with best-reachable stats, so the design is within the bar;
 *   (2) the sentinel carries the retuned numbers (hp18/atk7/def2);
 *   (3) REAL FAILURE STATE: an under-armed thief (base attack 4) at seed 1 is killed
 *       and fires the declared death ending ending_fallen;
 *   (4) PREP DECIDES IT: at the SAME seed 1, the ONLY change being the spirit's +2
 *       attack, the fight flips from death to a full ending_victory 50/50 — so the
 *       buff the seed-23 pass called "pointless" is now exactly what saves you.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadRpgPackFile("content/rpg/pack/cold_forge.yaml");
if (!loaded.ok) throw new Error("cold_forge must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));

const score = (s: GameState): number => buildParserObservation(index, s).score;
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
const isUse = (a: Action) => a.type === "USE";
const isTake = (a: Action) => a.type === "TAKE";
const isTalk = (a: Action) => a.type === "TALK";
const askTopic = (topic: string) => (a: Action) =>
  a.type === "ASK" && (a as { topic?: string }).topic === topic;

/** Fight the sentinel to the death (one side falls). Returns the ended/standing state. */
function fightOut(s: GameState): GameState {
  let guard = 0;
  while (!s.ended && !s.flags["sentinel_stilled"]) {
    s = act(s, isAttack);
    if (++guard > 30) throw new Error("fight did not resolve");
  }
  return s;
}

describe("bug_0101 — The Cold Forge sentinel has real teeth, so preparation decides the fight", () => {
  it("(1) the retuned pack still validates green — provably winnable with best-reachable stats", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.findings.map((f) => f.code)).not.toContain("COMBAT_UNWINNABLE");
    expect(report.ok).toBe(true);
  });

  it("(2) the sentinel carries the retuned numbers (hp18/atk7/def2)", () => {
    const sentinel = pack.enemies.find((e) => e.id === "slag_sentinel")!;
    expect(sentinel.hp).toBe(18);
    expect(sentinel.attack).toBe(7);
    expect(sentinel.defense).toBe(2);
  });

  it("(3) real failure state: an under-armed thief (base attack 4) at seed 1 is killed (ending_fallen)", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down")); // → outer_forge
    s = act(s, isTake); // pry-bar, but skip the spirit's counsel → base attack 4
    expect(s.vars["attack"]).toBe(4);
    s = act(s, move("north")); // → bellows_walk
    s = fightOut(s);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_fallen");
    expect(pack.endings.find((e) => e.id === "ending_fallen")?.death).toBe(true);
  });

  it("(4) prep decides it: the SAME seed 1, with only the spirit's +2 attack, flips to ending_victory 50/50", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down")); // → outer_forge
    s = act(s, isTake); // pry-bar
    s = act(s, isTalk); // lantern-spirit
    s = act(s, askTopic("ask_sentinel")); // the ONLY difference from case (3): +2 attack
    expect(s.vars["attack"]).toBe(6);
    s = act(s, askTopic("sentinel_back"));
    s = act(s, askTopic("ask_heart")); // the clue that points at the grate/bar
    s = act(s, askTopic("heart_back"));
    s = act(s, askTopic("leave_spirit"));
    expect(s.vars["defense"]).toBe(2); // never visited the cell → no plate, +2 attack alone

    s = act(s, move("north")); // → bellows_walk
    s = fightOut(s);
    expect(s.ended).toBe(false); // the buff is what keeps the player standing
    expect(s.flags["sentinel_stilled"]).toBe(true);
    expect(score(s)).toBe(15);

    s = act(s, move("east")); // → forge_heart
    let guard = 0;
    while (s.questStage["forge"] !== "grate_open" && !s.ended) {
      s = act(s, isUse); // lever the grate (might check; free retry)
      if (++guard > 40) throw new Error("grate never opened");
    }
    expect(score(s)).toBe(30);

    s = act(s, move("down")); // → ember_chamber: win on entry
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(score(s)).toBe(50);
  });
});
