/**
 * Regression (§15) for bug_0132 — the reaver's shade's combat counsel must NOT
 * over-promise the warded fight.
 *
 * bug_0119 added "that is the wight's way of wearing a man down, not the truth of the
 * odds. Set your feet and keep striking." to stop a player retreating from a winnable
 * fight (the bug_0027 quit-a-winnable-game failure, here on the wight). That cured the
 * retreat but over-corrected into a flat GUARANTEE: it told the player the lost-looking
 * moment was categorically "not the truth of the odds" — yet bug_0113 keeps ~12% of
 * warded seeds a genuine loss BY DESIGN ("careful play isn't free"). A fresh, MCP-only,
 * source-blind playtester (seed 19, ai-runs/2026-06-02T14-34-47-326Z/playtest.md §5)
 * took the ward, obeyed the counsel to the letter, and STILL DIED (wight on 4 HP), then
 * flagged the shade's certainty as a broken promise that a full-restart compounds.
 *
 * The fix is the pack's honesty discipline (bug_0027/0029/0069/0095) applied to spoken
 * counsel: keep the load-bearing anti-retreat message but admit warded play can still
 * lose. This locks BOTH halves so a future "tidy-up" can't drift back to either failure:
 *   (a) HONEST — the counsel concedes the warded fight is not a sure thing;
 *   (b) the over-promise is gone — no bare "not the truth of the odds" guarantee;
 *   (c) the anti-retreat cure SURVIVES — pressing on is still framed as the best chance
 *       and there is no aid to find by breaking off (the bug_0119 reason for the line);
 *   (d) it is CONTENT-only — the ward mechanic and the wight stats are untouched, so the
 *       ~12% warded loss the design demands is intact (the over-promise was the only bug).
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";
import type { Effect } from "../../src/core/effects.js";

const loaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
if (!loaded.ok) throw new Error("sunken_barrow must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

const options = (s: GameState) => enumerateRpgActions(index, s);
const narrations = (effects: readonly Effect[]): string[] =>
  effects
    .filter((e): e is { narrate: string } => "narrate" in e)
    .map((e) => (e as { narrate: string }).narrate);

function act(s: GameState, pred: (a: Action) => boolean): GameState {
  const opt = options(s).find((o) => pred(o.action));
  if (!opt)
    throw new Error(
      `no action; legal=[${options(s)
        .map((o) => o.id)
        .join(", ")}]`,
    );
  const r = step(s, opt.action);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("step failed");
  return r.state;
}

const move = (dir: string) => (a: Action) => a.type === "MOVE" && a.direction === dir;
const isTalk = (a: Action) => a.type === "TALK";
const askTopic = (topic: string) => (a: Action) =>
  a.type === "ASK" && (a as { topic?: string }).topic === topic;

function shadeWightCounsel(seed: number): string {
  let s = initStateForRpgPack(index, seed);
  s = act(s, move("down")); // → Entry Hall
  s = act(s, move("west")); // → Reaver's Rest
  s = act(s, isTalk); // open dialogue at root
  const ask = options(s).find((o) => askTopic("ask_wight")(o.action));
  expect(ask, "ask_wight must be offered at the root").toBeTruthy();
  return narrations(rules.resolve(s, ask!.action)!.effects).join(" ").toLowerCase();
}

describe("bug_0132 — the shade's ward counsel is honest about the warded fight's residual risk", () => {
  it("(a) concedes the warded fight is not a sure thing", () => {
    const spoken = shadeWightCounsel(7);
    // Some explicit admission that, even warded and playing correctly, the fight can be lost.
    expect(spoken).toMatch(
      /not the sure of it|can yet go hard|even done right|lucky nights|will not swear you safe/,
    );
  });

  it("(b) drops the flat over-promise — no bare 'not the truth of the odds' guarantee", () => {
    const spoken = shadeWightCounsel(7);
    expect(spoken).not.toMatch(/not the truth of the odds/);
  });

  it("(c) the anti-retreat cure survives: pressing on is the best chance and there's no aid to find", () => {
    const spoken = shadeWightCounsel(7);
    expect(spoken).toMatch(/best chance|keep striking|feet set/); // press on
    expect(spoken).toMatch(/seek aid that is not here|no fresher/); // don't break off
    expect(spoken).toMatch(/no balm|no second blade|no charm|whole of the help/); // nothing to find
  });

  it("(d) content-only: the ward mechanic and the wight stats are untouched", () => {
    let s = initStateForRpgPack(index, 7);
    s = act(s, move("down"));
    s = act(s, move("west"));
    s = act(s, isTalk);
    expect(s.vars["defense"]).toBe(2);
    s = act(s, askTopic("ask_wight"));
    expect(s.vars["defense"]).toBe(5); // +3 ward, unchanged
    expect(s.flags["heard_warding"]).toBe(true);

    const wight = pack.enemies.find((e) => e.id === "barrow_wight")!;
    expect(wight.hp).toBe(22);
    expect(wight.attack).toBe(5);
    expect(wight.defense).toBe(2);
  });
});
