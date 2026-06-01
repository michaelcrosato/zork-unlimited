/**
 * Regression (§15) for bug_0029 — the slag sentinel's prose in The Cold Forge framed
 * the cold as a COUNTDOWN the player must race ("wakes to heat / sleeps in cold";
 * "cold now but grinding slowly to life as you enter"), implying a time/temperature
 * mechanic that does not exist: the fight is a static 16-HP encounter with no turn
 * pressure and no effect that strengthens the sentinel.
 *
 * A fresh, MCP-only blind playtester (seed 31, ai-runs/2026-06-01T09-54-41-679Z) WON
 * 50/50 with no mechanical bugs but rated enjoyment 3/5 and flagged that "the flavor
 * over-promises a system that isn't there" — a curious player rushes, or infers the
 * fight is about to get harder, when the cold is in fact a constant advantage.
 *
 * The fix is CONTENT-only (no engine/validator/stat/effect/DC change — the fight
 * stays the identical static 16-HP encounter the bug_0021 cold_forge_pack proofs
 * require): the four sentinel-prose sites are reframed so the cold reads as a settled,
 * permanent advantage (the dead forge has no fire to rouse it further) and the spirit
 * denies the false "waiting makes it worse" inference outright (bug_0027 shape).
 *
 * Locked here:
 *   (a) the bellows_walk room prose + the enemy description no longer use the
 *       "grinding ... to life" warm-up framing, and state the sentinel is as slow as
 *       it will get;
 *   (b) the inscription makes clear the forge-fire is dead and will not kindle, so the
 *       "wakes to heat" lore cannot be read as an approaching threat; the spirit's
 *       counsel explicitly denies that waiting makes the sentinel worse;
 *   (c) LIVE through the engine render path, the bellows_walk room description the
 *       player sees carries the reframed prose, not the warm-up clock;
 *   (d) reachability/balance unchanged — the sentinel's stats are untouched and the
 *       canonical buffed route (seed 1) still reaches ending_victory at full score.
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
const enemyDesc = pack.enemies.find((e) => e.id === "slag_sentinel")!.description.toLowerCase();
const inscription = pack.objects.find((o) => o.id === "inscription")!.read_text!.toLowerCase();
const sentinelNode = pack.npcs
  .find((n) => n.id === "lantern_spirit")!
  .dialogue.nodes.find((nd) => nd.id === "spirit_sentinel")!;
const spiritCounsel = sentinelNode.npc_text.toLowerCase();

describe("bug_0029 — the Cold Forge sentinel reads as a settled cold advantage, not a warm-up clock", () => {
  it("the bellows_walk room and enemy description drop the 'grinding to life' warm-up framing", () => {
    const base = bellowsRoom.description.toLowerCase();
    // Negative: the process-verb framing that read as an approaching threat is gone.
    expect(base).not.toContain("grinding slowly to life");
    expect(base).not.toContain("grinding to life");
    expect(enemyDesc).not.toContain("grinding to cold life");
    // Positive: the cold now reads as a constant — it will not get worse.
    expect(base).toMatch(/no swifter than it is now|holds no fire to rouse it/);
    expect(enemyDesc).toMatch(/as .*as it will ever be|half-life/);
  });

  it("the inscription denies an approaching heat and the spirit denies that waiting makes it worse", () => {
    // The "wakes to heat" lore is preserved, but the dead, unkindle-able fire makes
    // clear no heat is coming.
    expect(inscription).toMatch(/long dead|will not kindle|never .*warm/);
    // The spirit's counsel explicitly denies the false "hurry / it gets harder" read.
    expect(spiritCounsel).toMatch(
      /as slow now as it will ever be|will never be warm|do not fear that waiting/,
    );
  });

  it("LIVE: the bellows_walk room the player sees carries the reframed prose, not a warm-up clock", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down")); // → outer_forge
    s = act(s, move("north")); // → bellows_walk
    expect(s.current).toBe("bellows_walk");
    const shown = desc(s).toLowerCase();
    expect(shown).not.toContain("grinding slowly to life");
    expect(shown).toMatch(/no swifter than it is now|holds no fire to rouse it/);
  });

  it("reachability/balance intact — sentinel stats untouched; canonical buffed route (seed 1) still wins 50/50", () => {
    // The fight is unchanged: the prose reframe touched no stats.
    const sentinel = pack.enemies.find((e) => e.id === "slag_sentinel")!;
    expect(sentinel.hp).toBe(16);
    expect(sentinel.attack).toBe(4);
    expect(sentinel.defense).toBe(2);

    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down")); // → outer forge
    s = act(s, (a) => a.type === "TAKE"); // pry-bar
    s = act(s, (a) => a.type === "TALK"); // lantern-spirit
    s = act(s, (a) => a.type === "ASK" && (a as { topic?: string }).topic === "ask_sentinel"); // +2 attack
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
