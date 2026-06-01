/**
 * Regression (§15) for bug_0070 — The Cold Forge's bellows_walk room UNDER-sold the
 * slag-sentinel fight. bug_0029 (rightly) reframed the cold as a *settled* advantage —
 * "slow and stiff", "no swifter than it is now", "holds no fire to rouse it" — to kill a
 * false warm-up clock. But the reframe left only reassurance: a blind player reads
 * "slow / stiff / weak from cold" as an easy kill and charges in at base attack 4.
 *
 * A fresh, MCP-only blind playtester (seed 47, ai-runs/2026-06-01T18-45-23-078Z) WON
 * 50/50 (clarity 5/5) but on a reckless run skipped the lantern-spirit's +2-attack
 * counsel, walked into the fight under-armed, and was clearly losing (dealing ~3/round
 * while taking ~8) before scraping out a luck-and-retreat recovery. Their #1 finding: the
 * spirit's combat aid is framed as optional flavor and NOTHING pre-fight signals that the
 * sentinel is a hard, even trade worth preparing for. The pack's OWN design intent
 * (cold_forge_pack.test.ts) is a fight "with REAL TEETH" whose death ending is reachable
 * from base stats — so the honest cue was missing, not the danger.
 *
 * The fix is CONTENT-only (no engine/validator/stat/effect/DC/flag/score/ending change —
 * the fight stays the identical static 16-HP encounter the bug_0021 proofs require): the
 * bellows_walk base prose now adds an honest threat-and-preparation beat — slow is not the
 * same as soft; its blows "fall like a dropped anvil"; "better not to meet it under-armed
 * — face it with every edge you can bring to bear" — nudging the player toward the
 * spirit's offered warmth WITHOUT claiming the buff is mandatory (base stats is provably
 * winnable, so a hard requirement would be a lie).
 *
 * Locked here:
 *   (a) the bellows_walk base prose carries the honest threat/preparation cue;
 *   (b) it STILL honours every bug_0029 invariant (no warm-up verb; keeps the settled-cold
 *       "no swifter than it is now" / "holds no fire to rouse it" framing) so the two fixes
 *       coexist and neither regresses the other;
 *   (c) LIVE through the engine render path, the bellows_walk description the player sees
 *       carries the new cue;
 *   (d) reachability/balance intact — the sentinel's stats are untouched, the +2 buff is
 *       still optional (ask_sentinel still retires once heard), and the canonical buffed
 *       route (seed 1) still reaches ending_victory at 50/50.
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
import { buildParserObservation } from "../../src/parser/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgPackFile("content/rpg/pack/cold_forge.yaml");
if (!loaded.ok) throw new Error("cold_forge must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

const desc = (s: GameState): string => buildRpgObservation(index, s).description;
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

const bellowsRoom = pack.rooms.find((r) => r.id === "bellows_walk")!;

describe("bug_0070 — the Cold Forge bellows_walk honestly telegraphs a hard fight worth preparing for", () => {
  it("the base prose adds an honest threat-and-preparation cue", () => {
    const base = bellowsRoom.description.toLowerCase();
    expect(base).toContain("slow is not the same as soft");
    expect(base).toContain("dropped anvil");
    expect(base).toMatch(/every edge you can bring to bear/);
    // The cue is preparation advice, not a false hard requirement (the fight is
    // winnable from base stats), so it must not declare the buff mandatory.
    expect(base).not.toMatch(/cannot win|must .*buff|impossible without/);
  });

  it("still honours every bug_0029 invariant — no warm-up clock, settled cold preserved", () => {
    const base = bellowsRoom.description.toLowerCase();
    expect(base).not.toContain("grinding slowly to life");
    expect(base).not.toContain("grinding to life");
    expect(base).toMatch(/no swifter than it is now/);
    expect(base).toMatch(/holds no fire to rouse it/);
  });

  it("LIVE: the bellows_walk room the player sees carries the new threat cue", () => {
    let s = initStateForRpgPack(index, 47);
    s = act(s, move("down")); // → outer_forge
    s = act(s, move("north")); // → bellows_walk
    expect(s.current).toBe("bellows_walk");
    const shown = desc(s).toLowerCase();
    expect(shown).toContain("dropped anvil");
    expect(shown).toContain("every edge you can bring to bear");
    expect(shown).toMatch(/no swifter than it is now/);
  });

  it("reachability/balance intact — sentinel stats untouched; buffed route (seed 1) still wins 50/50", () => {
    const sentinel = pack.enemies.find((e) => e.id === "slag_sentinel")!;
    expect(sentinel.hp).toBe(16);
    expect(sentinel.attack).toBe(4);
    expect(sentinel.defense).toBe(2);

    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down")); // → outer forge
    s = act(s, (a) => a.type === "TAKE"); // pry-bar
    s = act(s, (a) => a.type === "TALK"); // lantern-spirit
    s = act(s, (a) => a.type === "ASK" && (a as { topic?: string }).topic === "ask_sentinel"); // +2 attack
    // the +2 topic retires once heard — it is still optional, not forced
    expect(options(s).some((o) => (o.action as { topic?: string }).topic === "ask_sentinel")).toBe(
      false,
    );
    s = act(s, (a) => a.type === "ASK" && (a as { topic?: string }).topic === "sentinel_back");
    s = act(s, (a) => a.type === "ASK" && (a as { topic?: string }).topic === "ask_heart");
    s = act(s, (a) => a.type === "ASK" && (a as { topic?: string }).topic === "heart_back");
    s = act(s, (a) => a.type === "ASK" && (a as { topic?: string }).topic === "leave_spirit");
    s = act(s, move("north")); // → bellows walk
    let guard = 0;
    while (!s.flags["sentinel_stilled"] && !s.ended) {
      s = act(s, (a) => a.type === "ATTACK");
      if (++guard > 20) throw new Error("fight did not resolve");
    }
    expect(s.ended).toBe(false);
    expect(score(s)).toBe(15);
    s = act(s, move("east")); // → forge heart
    guard = 0;
    while (s.questStage["forge"] !== "grate_open" && !s.ended) {
      s = act(s, (a) => a.type === "USE");
      if (++guard > 40) throw new Error("grate never opened");
    }
    expect(score(s)).toBe(30);
    s = act(s, move("down")); // → ember chamber: win on entry
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(score(s)).toBe(50);
  });
});
