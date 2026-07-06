/**
 * Regression (§15) for bug_0015 — a one-shot skill-check puzzle re-fired after it
 * had already succeeded, in the RPG pack The Sunken Barrow.
 *
 * A blind MCP playtester (ai-runs/2026-06-01T07-13-47-984Z, seed 17) solved the
 * barrow to ending_victory and flagged — as its #1 concrete finding (report §5) —
 * that the slab lever did not retire: after a successful might check levered the
 * slab aside (quest_stage barrow/slab_moved, the down stair open), `use iron bar on
 * stone slab` STAYED available, re-rolling the might check, re-narrating "the slab
 * grinds aside" on an already-open slab, and — because the re-roll could FAIL —
 * able to narrate "the slab does not give" while the bared stair stood open behind
 * it. A genuine player-facing contradiction, not mere polish.
 *
 * The fix has two coherent layers, both locked here:
 *   (1) CONTENT — the stone_slab USE interaction is gated
 *       `none_of: [ quest_stage barrow/slab_moved ]`, so once the slab is moved the
 *       RpgAction drops out of the legal set (enumeration already honours an
 *       interaction's `conditions` via resolveRpgAction). The lever retires.
 *   (2) ENGINE — the RPG runner's skill-check resolve branch (src/rpg/runner.ts)
 *       now also calls evalConditions(it.conditions, state) before resolving, as its
 *       own comment always claimed ("meeting conditions") but the code never did. So
 *       even a FORCED step that bypasses enumeration is rejected once the gate
 *       closes — the check can never re-roll. This is generic: it applies to any
 *       gated skill-check interaction in any pack.
 *
 * Locked here:
 *   (a) the lever is legal before success and retires (leaves the legal set) once
 *       slab_moved is set;
 *   (b) resolve() rejects a forced re-lever after slab_moved (engine-level guard),
 *       so it can never re-roll / re-narrate a contradiction;
 *   (c) before success the gate is inert — resolve() still returns the skill check,
 *       so a normal first lever is unaffected (no regression to the happy path);
 *   (d) the canonical victory still reaches ending_victory (slab levered once).
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/quests/sunken_barrow.yaml");
if (!loaded.ok) throw new Error("sunken_barrow must compile");
const index = indexRpgPack(loaded.compiled.pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

const LEVER: RpgAction = { type: "USE", item: "iron_bar", target: "stone_slab" };

function act(state: GameState, RpgAction: RpgAction): GameState {
  const legal = rules.legalActions(state).some((a) => actionEquals(a, RpgAction));
  expect(legal, `RpgAction ${JSON.stringify(RpgAction)} must be legal in ${state.current}`).toBe(
    true,
  );
  const r = step(state, RpgAction);
  expect(r.ok).toBe(true);
  return r.state;
}

const leverIsLegal = (s: GameState): boolean =>
  enumerateRpgActions(index, s).some((o) => actionEquals(o.action, LEVER));

/** Reach the slab passage with the iron bar, wight slain, slab not yet moved. */
function atSlabBeforeLever(): GameState {
  let s = initStateForRpgPack(index, 1);
  s = act(s, { type: "MOVE", direction: "down" }); // entry_hall
  s = act(s, { type: "TAKE", item: "iron_bar" });
  s = act(s, { type: "MOVE", direction: "north" }); // guard_crypt
  for (let i = 0; i < 40 && !s.ended && !s.flags["wight_slain"]; i++) {
    s = act(s, { type: "ATTACK", enemy: "barrow_wight" });
  }
  s = act(s, { type: "MOVE", direction: "east" }); // slab_passage
  expect(s.current).toBe("slab_passage");
  expect(s.questStage["barrow"]).not.toBe("slab_moved");
  return s;
}

describe("bug_0015 — a one-shot skill-check lever retires after success", () => {
  it("the lever is legal before the slab moves and leaves the legal set after (content gate)", () => {
    let s = atSlabBeforeLever();
    expect(leverIsLegal(s)).toBe(true);
    for (let i = 0; i < 40 && s.questStage["barrow"] !== "slab_moved"; i++) {
      s = act(s, LEVER);
    }
    expect(s.questStage["barrow"]).toBe("slab_moved");
    expect(s.ended).toBe(false);
    // Retired: enumeration no longer offers it once the puzzle is solved.
    expect(leverIsLegal(s)).toBe(false);
  });

  it("a FORCED re-lever after success is rejected by the engine, so it can never re-roll (engine gate)", () => {
    let s = atSlabBeforeLever();
    for (let i = 0; i < 40 && s.questStage["barrow"] !== "slab_moved"; i++) {
      s = act(s, LEVER);
    }
    expect(s.questStage["barrow"]).toBe("slab_moved");
    // Bypass enumeration entirely: resolve() itself must refuse the gated check.
    expect(rules.resolve(s, LEVER)).toBeNull();
    // And the full step path rejects it with no state change.
    const r = step(s, LEVER);
    expect(r.ok).toBe(false);
  });

  it("before success the gate is inert — the first lever still resolves to the skill check (happy path intact)", () => {
    const s = atSlabBeforeLever();
    // The gate is none_of[slab_moved]; pre-success it holds, so resolve is non-null.
    expect(rules.resolve(s, LEVER)).not.toBeNull();
  });

  it("the canonical victory still reaches ending_victory (slab levered exactly once)", () => {
    let s = atSlabBeforeLever();
    for (let i = 0; i < 40 && s.questStage["barrow"] !== "slab_moved"; i++) {
      s = act(s, LEVER);
    }
    s = act(s, { type: "MOVE", direction: "down" }); // relic_chamber (not yet won)
    expect(s.ended).toBe(false); // the win is the claim, not entry (bug_0056)
    s = act(s, { type: "TAKE", item: "circlet" }); // claim the circlet → win
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
  });
});
