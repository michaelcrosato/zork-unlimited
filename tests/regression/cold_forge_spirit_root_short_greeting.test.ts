/**
 * Regression (§15) for bug_0322 — cold_forge lantern-spirit re-showed the full
 * first-meeting greeting ("A warm thing, come down into the cold...") on every
 * return to spirit_root from a topic node, making the dialogue feel mechanical
 * after the first exchange.
 *
 * Found: blind playtest seed 7, 2026-06-08T13-34-50-175Z.
 *
 * Fix: added a `variants` block to spirit_root using existing topic flags
 * (heard_sentinel / heard_heart / heard_forge / heard_founder). When any flag is
 * set the short form "What else would you know?" fires instead of the full
 * greeting. First visit is unchanged (no flags yet). No new flag, no score /
 * route / stat / ending change; prose only.
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
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";
import type { GameEvent } from "../../src/core/events.js";

const loaded = loadRpgSourceFile("content/rpg/quests/cold_forge.yaml");
if (!loaded.ok) throw new Error("cold_forge must compile");
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
    .filter((t) => t.startsWith("lantern-spirit:"));
}

describe("bug_0322 — cold_forge spirit_root shows short greeting on return", () => {
  it("(a) first visit to spirit_root shows full greeting", () => {
    let s = initStateForRpgPack(index, 7);
    s = act(s, move("down")); // → outer_forge
    const greet = run(s, (a) => a.type === "TALK");
    const lines = spokenLines(greet.events);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("watched this forge die by inches");
    expect(lines[0]).not.toContain("What else");
  });

  it("(b) return after sentinel topic shows short acknowledgment, not full greeting", () => {
    let s = initStateForRpgPack(index, 7);
    s = act(s, move("down"));
    s = act(s, (a) => a.type === "TALK");
    const answer = run(s, ask("ask_sentinel")); // answer + root resume are atomic
    expect(answer.state.flags["heard_sentinel"]).toBe(true);
    expect(spokenLines(answer.events)).toHaveLength(1); // only the substantive answer speaks
    const rootLine = buildRpgObservation(index, answer.state).dialogue?.npc_text ?? "";
    expect(rootLine).toContain("What else would you know");
    expect(rootLine).not.toContain("watched this forge die by inches");
    expect(options(answer.state).map((option) => option.id)).not.toContain("ask_sentinel_back");
  });

  it("(c) return after heart topic also shows short acknowledgment", () => {
    let s = initStateForRpgPack(index, 7);
    s = act(s, move("down"));
    s = act(s, (a) => a.type === "TALK");
    const answer = run(s, ask("ask_heart")); // answer + root resume are atomic
    expect(answer.state.flags["heard_heart"]).toBe(true);
    expect(spokenLines(answer.events)).toHaveLength(1);
    const rootLine = buildRpgObservation(index, answer.state).dialogue?.npc_text ?? "";
    expect(rootLine).toContain("What else would you know");
    expect(rootLine).not.toContain("watched this forge die by inches");
    expect(options(answer.state).map((option) => option.id)).not.toContain("ask_heart_back");
  });

  it("(d) pack validates green and ending_victory 50/50 route is unaffected", () => {
    expect(validateRpg(pack).findings).toHaveLength(0);

    let s = initStateForRpgPack(index, 7);
    s = act(s, move("down"));
    s = act(s, (a) => a.type === "TAKE"); // pry-bar
    s = act(s, (a) => a.type === "TALK");
    s = act(s, ask("ask_sentinel")); // +2 attack
    expect(s.flags["heard_sentinel"]).toBe(true);
    expect(buildRpgObservation(index, s).dialogue?.npc_text).toMatch(/What else would you know/i);
    s = act(s, ask("leave_spirit"));
    s = act(s, move("north"));
    let guard = 0;
    while (!s.flags["sentinel_stilled"] && !s.ended) {
      s = act(s, (a) => a.type === "ATTACK");
      if (++guard > 20) throw new Error("fight did not resolve");
    }
    expect(s.ended).toBe(false);
    s = act(s, move("east"));
    guard = 0;
    while (s.questStage["forge"] !== "grate_open" && !s.ended) {
      s = act(s, (a) => a.type === "USE");
      if (++guard > 40) throw new Error("grate never opened");
    }
    s = act(s, move("down"));
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
  });
});
