/**
 * Regression (§15) for bug_0021 — THE COLD FORGE, the game's second RPG pack.
 *
 * This cycle's improvement was content_new: authoring a new playable RPG pack to
 * broaden the game beyond the lone Sunken Barrow (the assessor's standing
 * content_new candidate; the bug_0020 note "strongly consider … author a new rpg
 * pack"). The mandated blind playtest of clockwork_heist (seed 83) came back
 * pristine (clarity 5/5, zero defects — only the long-deferred 3-click structural
 * note), confirming per-pack polish had reached diminishing returns, so the cycle
 * rotated to broadening instead. A second blind playtest of THIS new pack (seed 5,
 * ai-runs/2026-06-01T08-17-46-152Z/playtest_cold_forge.md) rated it clarity 5/5,
 * enjoyment 4/5, no functional bugs, victory on both routes.
 *
 * The Cold Forge deliberately covers ground the barrow does not and answers the
 * barrow's standing critiques:
 *   - a TALKING NPC with CONDITIONAL, one-shot dialogue (bug_0014) whose counsel is
 *     MECHANICAL: hearing how the sentinel fails grants a one-time +2 attack buff
 *     (no dead-payload rumor flags);
 *   - combat with REAL TEETH (the barrow's was "toothless"): without the buff the
 *     slag-sentinel can kill the player (death ending reachable), yet the fight is
 *     provably winnable from base stats and a fall is save-recoverable (§8.7);
 *   - an EXPLICIT goal stated in the opening room.
 * Plus the proven Stage-4 kit: one seeded fight, one seeded skill check, Stage-3
 * milestone scoring to max_score 50, reactive room text, retire-after-success lever.
 *
 * Locked here:
 *   (1) the pack compiles and validates green under the full RPG validator (no
 *       errors) — so reachability, soft-locks, dialogue termination, combat
 *       winnability, skill-check passability, and the score bound all hold;
 *   (2) the canonical buffed route (seed 1) reaches ending_victory at 50/50, the
 *       spirit's counsel raises attack 4→6, and the score climbs at each milestone;
 *   (3) the +2 buff topic is ONE-SHOT — ask_sentinel retires from the legal set once
 *       heard_sentinel is set, so the blessing cannot be farmed;
 *   (4) combat has teeth: a no-buff fight at seed 2 KILLS the player and fires the
 *       declared death ending ending_fallen (so the death ending is genuinely
 *       reachable and the fight is lethal without the spirit's help).
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
const canAsk = (s: GameState, topic: string) => options(s).some((o) => askTopic(topic)(o.action));
function expectSpiritRoot(s: GameState): void {
  const dialogue = buildRpgObservation(index, s).dialogue;
  expect(dialogue?.npc).toBe("lantern_spirit");
  expect(dialogue?.npc_text).toMatch(/What else would you know/i);
}

describe("bug_0021 — The Cold Forge (second RPG pack) is valid, solvable, and well-formed", () => {
  it("compiles and validates green under the full RPG validator", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
    expect(pack.meta.id).toBe("cold_forge_v1");
    expect(pack.meta.max_score).toBe(50);
  });

  it("canonical buffed route (seed 1) wins at 50/50; the spirit's counsel raises attack 4→6; score climbs at each beat", () => {
    let s = initStateForRpgPack(index, 1);
    expect(score(s)).toBe(0);
    expect(s.vars["attack"]).toBe(4);

    s = act(s, move("down")); // → Outer Forge
    s = act(s, isTake); // take the pry-bar

    // Talk to the lantern-spirit and take its counsel.
    s = act(s, isTalk);
    expect(canAsk(s, "ask_sentinel")).toBe(true);
    s = act(s, askTopic("ask_sentinel")); // grants +2 attack
    expect(s.flags["heard_sentinel"]).toBe(true);
    expect(s.vars["attack"]).toBe(6); // the blessing is real and mechanical
    expectSpiritRoot(s); // reply + root resume are one accepted decision
    s = act(s, askTopic("ask_heart")); // the second clue
    expect(s.flags["heard_heart"]).toBe(true);
    expectSpiritRoot(s);
    s = act(s, askTopic("leave_spirit")); // ungated escape → dialogue ends
    expect(score(s)).toBe(0); // no score from talking

    s = act(s, move("north")); // → Bellows Walk, the sentinel bars the east way
    let guard = 0;
    while (!s.flags["sentinel_stilled"] && !s.ended) {
      s = act(s, isAttack);
      if (++guard > 20) throw new Error("fight did not resolve");
    }
    expect(s.ended).toBe(false); // buffed, seed 1: the player survives
    expect(s.flags["sentinel_stilled"]).toBe(true);
    expect(score(s)).toBe(15); // +15 for stilling the sentinel

    s = act(s, move("east")); // → Forge Heart (opened by the kill)
    guard = 0;
    while (s.questStage["forge"] !== "grate_open" && !s.ended) {
      s = act(s, isUse); // lever the slag grate (might check; retry until it gives)
      if (++guard > 40) throw new Error("grate never opened");
    }
    expect(score(s)).toBe(30); // +15 for levering the grate

    s = act(s, move("down")); // → Ember Chamber: win fires on entry
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(score(s)).toBe(50); // +20 for the Ember-Heart → full 50/50
  });

  it("the spirit's +2 buff is one-shot: ask_sentinel retires once heard, so it cannot be farmed", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down"));
    s = act(s, isTalk);
    s = act(s, askTopic("ask_sentinel")); // → lands on the sentinel node, +2 attack
    expect(s.vars["attack"]).toBe(6);
    expectSpiritRoot(s);
    // The topic is now gated (not_flag heard_sentinel) ⇒ gone from the legal set.
    expect(canAsk(s, "ask_sentinel")).toBe(false);
    expect(canAsk(s, "ask_heart")).toBe(true); // the other topic still offered
    expect(canAsk(s, "leave_spirit")).toBe(true); // ungated escape always present
    expect(s.vars["attack"]).toBe(6); // still 6, not re-buffed
  });

  it("combat has teeth: a no-buff fight at seed 2 kills the player and fires the declared death ending", () => {
    let s = initStateForRpgPack(index, 2);
    s = act(s, move("down"));
    s = act(s, isTake); // bar, but skip the spirit's buff → base attack 4
    expect(s.vars["attack"]).toBe(4);
    s = act(s, move("north"));
    let guard = 0;
    while (!s.ended && !s.flags["sentinel_stilled"]) {
      s = act(s, isAttack);
      if (++guard > 20) throw new Error("fight did not resolve");
    }
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_fallen"); // the death ending is reachable
    expect(pack.endings.find((e) => e.id === "ending_fallen")?.death).toBe(true);
  });
});
