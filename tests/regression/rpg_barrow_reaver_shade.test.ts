/**
 * Regression (§15) for bug_0075 — content_new: The Sunken Barrow's first NPC, the
 * reaver's shade, an OPTIONAL side beat answering the pack's standing critique.
 *
 * Every blind pass of the barrow lands the same single note: it is bug-free, clarity
 * 5/5, but BRIEF and LINEAR — "exactly one path and one meaningful choice", enjoyment
 * 3/5 (this cycle's mandated pass, seed 31, ai-runs/2026-06-01T19-56-42-707Z/playtest.md;
 * "I'd ship it as-is and only wish it were longer"). cold_forge was authored to answer
 * that critique with a talking NPC the barrow itself never received (bug_0021); this
 * retrofits the barrow with its own — a new optional side cell off the Entry Hall, met
 * BEFORE the wight, housing the shade of a prior grave-robber the wight killed.
 *
 * The fix is pure CONTENT and purely ADDITIVE: a new room (reaver_rest), a new NPC
 * (reaver_shade), and a `west` exit on entry_hall. The shade's counsel is one-shot,
 * conditional, and MECHANICAL (a +3-defense ward — +2 originally, raised to +3 in
 * bug_0113 so prepared play reliably survives — no dead-payload rumor flag), plus a
 * lore topic that deepens the world. Honest, not over-sold (bug_0027/0029/0069): the
 * seed-31 blind pass rated the wight a real "even-ish trade … I finished at 11 HP", so
 * easing its cold blows genuinely matters, yet the shade says plainly the ward "will not
 * swing your blade for you". NOTHING on the existing critical path changes — the
 * canonical victory route (and its pinned trace) simply skip the shade.
 *
 * Locked here:
 *   (1) the pack still compiles + validates green under the full RPG validator (so the
 *       new room's reachability/soft-lock and the new dialogue's termination all hold);
 *   (2) the new side cell is an optional, bidirectional detour off the Entry Hall (no
 *       soft-lock: you can always walk back east to the critical path);
 *   (3) the shade's ward is REAL and MECHANICAL: ask_wight raises defense 2→5 once,
 *       sets heard_warding, journals the +3 — and the topic then RETIRES (one-shot, can't
 *       be farmed); the lore topic ask_lord is likewise one-shot; leave_shade ends the
 *       dialogue; talking awards NO score (the milestone scoring is untouched);
 *   (4) the shade is OPTIONAL: the canonical route ignores it and still reaches
 *       ending_victory at the full 50/50 — the addition perturbs nothing on the path.
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

const loaded = loadRpgSourceFile("content/rpg/quests/sunken_barrow.yaml");
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
const isUse = (a: Action) => a.type === "USE";
const isTake = (a: Action) => a.type === "TAKE";
const isTalk = (a: Action) => a.type === "TALK";
const askTopic = (topic: string) => (a: Action) =>
  a.type === "ASK" && (a as { topic?: string }).topic === topic;
const canAsk = (s: GameState, topic: string) => options(s).some((o) => askTopic(topic)(o.action));
const canMove = (s: GameState, dir: string) => options(s).some((o) => move(dir)(o.action));

describe("bug_0075 — the reaver's shade: an optional, mechanical second beat in the barrow", () => {
  it("compiles and validates green under the full RPG validator (new room + new dialogue well-formed)", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
    // The barrow now has its first NPC.
    expect(pack.npcs.map((n) => n.id)).toContain("reaver_shade");
    expect(pack.rooms.map((r) => r.id)).toContain("reaver_rest");
  });

  it("the side cell is an optional, bidirectional detour off the Entry Hall (no soft-lock)", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down")); // → Entry Hall
    expect(s.current).toBe("entry_hall");
    expect(canMove(s, "west")).toBe(true); // the new detour is offered
    s = act(s, move("west")); // → Reaver's Rest
    expect(s.current).toBe("reaver_rest");
    expect(canMove(s, "east")).toBe(true); // you can always return to the critical path
    s = act(s, move("east"));
    expect(s.current).toBe("entry_hall");
  });

  it("the shade's ward is real and mechanical, one-shot, and awards no score", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down"));
    s = act(s, move("west")); // → Reaver's Rest
    expect(s.vars["defense"]).toBe(2);

    s = act(s, isTalk);
    expect(canAsk(s, "ask_wight")).toBe(true);
    expect(canAsk(s, "ask_lord")).toBe(true);

    s = act(s, askTopic("ask_wight")); // grants the +3 defense ward (bug_0113)
    expect(s.flags["heard_warding"]).toBe(true);
    expect(s.vars["defense"]).toBe(5); // the ward is real and mechanical (2 → 5)
    expect(s.journal.some((j) => j.includes("+3 defense"))).toBe(true);
    s = act(s, askTopic("wight_back")); // back to root
    // One-shot: the warding topic retired; it cannot be re-asked or farmed.
    expect(canAsk(s, "ask_wight")).toBe(false);
    expect(s.vars["defense"]).toBe(5); // still 5, not re-buffed

    // The lore topic is likewise one-shot and deepens the world.
    expect(canAsk(s, "ask_lord")).toBe(true);
    s = act(s, askTopic("ask_lord"));
    expect(s.flags["heard_lord_lore"]).toBe(true);
    expect(s.journal.some((j) => j.includes("Barrow-Lord"))).toBe(true);
    s = act(s, askTopic("lord_back"));
    expect(canAsk(s, "ask_lord")).toBe(false);

    // Talking awards no score — the milestone scoring (50) is untouched.
    expect(score(s)).toBe(0);
    // The ungated escape always terminates the dialogue.
    s = act(s, askTopic("leave_shade"));
    expect(canMove(s, "east")).toBe(true); // back in the room, free to move
  });

  it("the shade is OPTIONAL: the canonical route ignores it and still wins 50/50", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down")); // → Entry Hall
    s = act(s, isTake); // take the iron bar
    s = act(s, move("north")); // → Guard Crypt (never visiting the shade)
    let guard = 0;
    while (!s.flags["wight_slain"] && !s.ended) {
      s = act(s, isAttack);
      if (++guard > 20) throw new Error("fight did not resolve");
    }
    expect(s.flags["wight_slain"]).toBe(true);
    expect(s.vars["defense"]).toBe(2); // never warded — proves the ward is purely optional

    s = act(s, move("east")); // → Slab Passage
    guard = 0;
    while (s.questStage["barrow"] !== "slab_moved" && !s.ended) {
      s = act(s, isUse); // lever the slab (might check; retry until it gives)
      if (++guard > 40) throw new Error("slab never moved");
    }
    s = act(s, move("down")); // → Relic Chamber (+25 on entry)
    s = act(s, isTake); // take the circlet → win fires on the claim
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(score(s)).toBe(50); // full 50/50, unchanged by the new beat
  });
});
