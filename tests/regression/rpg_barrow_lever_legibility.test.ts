/**
 * Regression (§15) for bug_0027 — the slab might-check in The Sunken Barrow read as
 * a fixed STRENGTH THRESHOLD when it is in fact a flat, penalty-free, infinitely
 * retryable d20 + might (=3) vs DC 12 (~60% per attempt).
 *
 * A fresh, MCP-only blind playtester (seed 88, ai-runs/2026-06-01T09-31-14-694Z)
 * failed the lever twice, and — cued by the slab's "made to be levered, by someone
 * strong enough" / "with a lever and real might" framing plus a flat "the slab does
 * not give" failure line — concluded a missing STRENGTH ITEM was needed, searched
 * the whole map (there is none; `might` is fixed and no effect raises it), and QUIT
 * a winnable game. enjoyment 2/5, verdict "would NOT finish satisfied... a
 * meaningful fraction would not finish at all".
 *
 * The fix is CONTENT-only (no engine/validator/DC/skill/effect change — the check
 * stays a fair, passable d20+might vs 12, exactly as the RPG validator's
 * SKILL_CHECK_IMPOSSIBLE bound requires): the on_failure narration now signals the
 * slab IS shifting and that PERSISTENCE — not more muscle or a hidden tool — is the
 * path, and the slab's examine description reframes it as "heaving again and again"
 * rather than "real might". So a player who fails reads "try again", not "go find a
 * strength item that doesn't exist".
 *
 * Locked here:
 *   (a) the slab's on_failure feedback + examine description read as repeatable
 *       progress, never as a strength threshold / missing-item dead end;
 *   (b) a LIVE failed check (seed 2) surfaces the improved retry guidance through the
 *       engine and changes no state (the check stays penalty-free and retryable);
 *   (c) reachability/balance unchanged — a first-lever success (seed 1) still levers
 *       the slab and reaches ending_victory at full score.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";
import type { Effect } from "../../src/core/effects.js";

const loaded = loadRpgSourceFile("content/rpg/quests/sunken_barrow.yaml");
if (!loaded.ok) throw new Error("sunken_barrow must compile");
const index = indexRpgPack(loaded.compiled.pack);
const pack = loaded.compiled.pack;
const rules = buildRpgRules(index);
const step = makeStep(rules);

const LEVER: RpgAction = { type: "USE", item: "iron_bar", target: "stone_slab" };

const narrations = (effects: readonly Effect[]): string[] =>
  effects
    .filter((e): e is { narrate: string } => "narrate" in e)
    .map((e) => (e as { narrate: string }).narrate);

/** Reach the slab passage (bar in hand, wight slain, slab not yet moved) at `seed`. */
function atSlab(seed: number): GameState {
  let s = initStateForRpgPack(index, seed);
  const path: RpgAction[] = [
    { type: "MOVE", direction: "down" },
    { type: "TAKE", item: "iron_bar" },
    { type: "MOVE", direction: "north" },
  ];
  for (const a of path) {
    const r = step(s, a);
    expect(r.ok).toBe(true);
    s = r.state;
  }
  for (let i = 0; i < 40 && !s.ended && !s.flags["wight_slain"]; i++) {
    const r = step(s, { type: "ATTACK", enemy: "barrow_wight" });
    expect(r.ok).toBe(true);
    s = r.state;
  }
  expect(s.ended, `player must survive the wight at seed ${seed}`).toBe(false);
  const east = step(s, { type: "MOVE", direction: "east" });
  expect(east.ok).toBe(true);
  s = east.state;
  expect(s.current).toBe("slab_passage");
  expect(s.questStage["barrow"]).not.toBe("slab_moved");
  return s;
}

const slabInteraction = pack.objects
  .find((o) => o.id === "stone_slab")!
  .interactions.find((it) => it.skill_check)!;
const onFailureText = narrations(slabInteraction.skill_check!.on_failure).join(" ");
const slabDescription = pack.objects.find((o) => o.id === "stone_slab")!.description;

describe("bug_0027 — the slab lever reads as a retryable attempt, not a strength wall", () => {
  it("the on_failure feedback signals repeatable progress, not a fixed strength threshold or missing item", () => {
    // Positive: it must invite another attempt and frame persistence/leverage as the path.
    expect(onFailureText.toLowerCase()).toMatch(/heave again|try again|keep at it/);
    expect(onFailureText.toLowerCase()).toMatch(/leverage|shifting|grinds/);
    // Negative: it must NOT tell the player they simply lack the strength, nor present
    // the slab as immovable — the two readings that drove the blind tester to abandon.
    expect(onFailureText.toLowerCase()).not.toContain("does not give");
    expect(onFailureText.toLowerCase()).not.toMatch(/not strong enough|need more|real might/);
    // The check itself is unchanged: still a fair, passable d20 + might vs DC 12.
    expect(slabInteraction.skill_check!.skill).toBe("might");
    expect(slabInteraction.skill_check!.difficulty).toBe(12);
  });

  it("the slab's examine description reframes the puzzle as persistence, not a might threshold", () => {
    expect(slabDescription.toLowerCase()).toMatch(/again and again|persist|stubborn|keep/);
    expect(slabDescription.toLowerCase()).not.toContain("real might");
  });

  it("a LIVE failed check surfaces the improved retry guidance and changes no state (penalty-free, retryable)", () => {
    // seed 3 survives the wight under-armed (bug_0102 retune hp22/atk5/def2) AND its
    // first lever roll fails — verified live; the on_failure effects are seed-independent.
    const s = atSlab(3);
    const res = rules.resolve(s, LEVER);
    expect(res).not.toBeNull();
    const ns = narrations(res!.effects);
    expect(ns[0]).toContain("failure"); // the roll genuinely failed at this seed/step
    // The player SEES the new persistence framing (not the old "does not give").
    expect(ns.join(" ").toLowerCase()).toMatch(/heave again|keep at it/);
    expect(ns.join(" ").toLowerCase()).not.toContain("does not give");
    // Applying the step leaves the puzzle unsolved and the player free to retry: no
    // quest-stage advance, slab still shut, still in the passage, no ending.
    const r = step(s, LEVER);
    expect(r.ok).toBe(true);
    expect(r.state.questStage["barrow"]).not.toBe("slab_moved");
    expect(r.state.current).toBe("slab_passage");
    expect(r.state.ended).toBe(false);
    expect(rules.legalActions(r.state).some((a) => actionEquals(a, LEVER))).toBe(true);
  });

  it("reachability/balance intact — a first-lever success still levers the slab and wins", () => {
    let s = atSlab(1); // seed 1 (the canonical trace seed): first lever succeeds
    const res = rules.resolve(s, LEVER);
    expect(narrations(res!.effects)[0]).toContain("success");
    const lever = step(s, LEVER);
    expect(lever.ok).toBe(true);
    s = lever.state;
    expect(s.questStage["barrow"]).toBe("slab_moved");
    const down = step(s, { type: "MOVE", direction: "down" });
    expect(down.ok).toBe(true);
    expect(down.state.ended).toBe(false); // the win is the claim, not entry (bug_0056)
    const claim = step(down.state, { type: "TAKE", item: "circlet" });
    expect(claim.ok).toBe(true);
    expect(claim.state.ended).toBe(true);
    expect(claim.state.endingId).toBe("ending_victory");
    expect(claim.state.vars["score"]).toBe(pack.meta.max_score);
  });
});
