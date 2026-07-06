/**
 * Regression (§15) for bug_0325 — sunken_barrow reaver's shade re-showed the
 * full first-meeting greeting ("Another one, come down for the cold crown...") on
 * every return to shade_root from a topic node, making the dialogue feel
 * mechanical after the first exchange.
 *
 * Found: blind playtest seed 7, 2026-06-08T14-06-03-284Z.
 *
 * Fix: added a `variants` block to shade_root using existing topic flags
 * (heard_warding / heard_lord_lore). When any flag is set the short form
 * "What else would you ask of me?" fires instead of the full greeting.
 * First visit is unchanged (no flags yet). No new flag, no score / route /
 * stat / ending change; prose only.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";
import type { GameEvent } from "../../src/core/events.js";

const loaded = loadRpgSourceFile("content/rpg/quests/sunken_barrow.yaml");
if (!loaded.ok) throw new Error("sunken_barrow must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

const options = (s: GameState) => enumerateRpgActions(index, s);

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
const move = (dir: string) => (a: Action) => a.type === "MOVE" && a.direction === dir;
const ask = (topic: string) => (a: Action) =>
  a.type === "ASK" && (a as { topic?: string }).topic === topic;

function spokenLines(events: GameEvent[]): string[] {
  return events
    .filter((e): e is GameEvent & { type: "narration"; text: string } => e.type === "narration")
    .map((e) => e.text)
    .filter((t) => t.startsWith("reaver's shade:"));
}

describe("bug_0325 — sunken_barrow shade_root shows short greeting on return", () => {
  it("(a) first visit to shade_root shows full greeting", () => {
    let s = initStateForRpgPack(index, 7);
    s = act(s, move("down")); // barrow_mouth → entry_hall
    s = act(s, move("west")); // → reaver_rest
    const greet = run(s, (a) => a.type === "TALK");
    const lines = spokenLines(greet.events);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("Another one, come down for the cold crown");
    expect(lines[0]).not.toContain("What else would you ask");
  });

  it("(b) return after wight topic shows short acknowledgment, not full greeting", () => {
    let s = initStateForRpgPack(index, 7);
    s = act(s, move("down"));
    s = act(s, move("west"));
    s = act(s, (a) => a.type === "TALK");
    s = act(s, ask("ask_wight")); // sets heard_warding
    const back = run(s, ask("wight_back")); // → shade_root
    const lines = spokenLines(back.events);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("What else would you ask of me");
    expect(lines[0]).not.toContain("Another one, come down");
  });

  it("(c) return after lord topic also shows short acknowledgment", () => {
    let s = initStateForRpgPack(index, 7);
    s = act(s, move("down"));
    s = act(s, move("west"));
    s = act(s, (a) => a.type === "TALK");
    s = act(s, ask("ask_lord")); // sets heard_lord_lore
    const back = run(s, ask("lord_back")); // → shade_root
    const lines = spokenLines(back.events);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("What else would you ask of me");
    expect(lines[0]).not.toContain("Another one, come down");
  });

  it("(d) pack validates green and ending_victory 50/50 route is unaffected", () => {
    expect(validateRpg(pack).findings).toHaveLength(0);

    let s = initStateForRpgPack(index, 7);
    s = act(s, move("down")); // → entry_hall
    s = act(s, (a) => a.type === "TAKE"); // iron_bar
    s = act(s, move("west")); // → reaver_rest
    s = act(s, (a) => a.type === "TALK");
    s = act(s, ask("ask_wight")); // +3 defense
    s = act(s, ask("wight_back"));
    s = act(s, ask("ask_lord")); // heard_lord_lore
    s = act(s, ask("lord_back"));
    s = act(s, ask("leave_shade"));
    s = act(s, move("east")); // → entry_hall
    s = act(s, move("north")); // → guard_crypt
    let guard = 0;
    while (!s.flags["wight_slain"] && !s.ended) {
      s = act(s, (a) => a.type === "ATTACK");
      if (++guard > 30) throw new Error("wight fight did not resolve");
    }
    expect(s.ended).toBe(false);
    s = act(s, move("east")); // → slab_passage
    guard = 0;
    while (s.questStage?.["barrow"] !== "slab_moved" && !s.ended) {
      s = act(s, (a) => a.type === "USE");
      if (++guard > 30) throw new Error("slab never moved");
    }
    s = act(s, move("down")); // → relic_chamber
    s = act(s, (a) => a.type === "TAKE"); // circlet → win
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(s.vars?.["score"]).toBe(50);
  });
});
