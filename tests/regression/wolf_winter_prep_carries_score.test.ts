/**
 * Regression (§15) for bug_0239 — The Wolf-Winter: PREPARATION must carry a SCORE signal,
 * not only an HP cushion.
 *
 * A 2026-06-04 blind playtest (ai-runs/2026-06-04T16-14-52-392Z) found the prepared and
 * reckless lines scored almost identically — the prepared 50/50 vs an unprepared rush's
 * 45/50, only the day-book's +5 apart. Donning the jerkin and heeding old Cade bought a
 * real HP cushion (and the validator-proven combat_guaranteed safety) but almost no SCORE,
 * so the diligence the whole fiction sells — and Cade's "do BOTH, mind, not one" promise —
 * left no mark on the scoreboard. A player optimising for score barely needed the prep.
 *
 * The fix ties +5 to each of the two load-bearing prep flags (heard_counsel, jerkin_donned)
 * and lifts max_score 50 → 60. This LOCKS the design intent the playtest asked for and that
 * a future retune must not silently collapse:
 *
 *   - the FULLY-PREPARED hunter (read the day-book, heed Cade's counsel, don the byre-jerkin,
 *     put down all three wolves, reach the cattle) scores EXACTLY the declared max, 60 — and
 *     reaches `ending_held` alive. This is the score complement of the combat_guaranteed
 *     safety the gauntlet test proves and the reachable-max-equals-declared invariant the
 *     auto-discovered rpg_score_economy_sound proves; here it is pinned to the CONCRETE
 *     prepared route so the prep awards can't be quietly dropped.
 *   - the diligence GAP is real: prepared 60 vs the unprepared rush's 45 (locked by the
 *     companion bug_0195 test, wolf_winter_prep_is_a_gamble_not_certain_death) is a 15-point
 *     spread, not the old 5. If a retune re-decoupled prep from score (e.g. removed an award
 *     or moved points onto the kills both lines collect), this gap would shrink and fail.
 *
 * The awards add SCORE only — no stat, no combat consequence — so the bug_0114 fairness
 * guarantee, the three-fight cumulative-gauntlet tuning, and the death ending are all
 * byte-unchanged (the gauntlet test still passes untouched).
 */
import { describe, it, expect } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";
import type { Rng } from "../../src/core/rng.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { HP_VAR } from "../../src/rpg/schema.js";

const PACK_PATH = "content/rpg/pack/wolf_winter.yaml";
const SEED = 7;

// The unprepared-rush score the companion bug_0195 test pins (3 wolves × 10 + 15 cattle,
// no day-book, no prep awards). Referenced here so the diligence GAP is asserted, not just
// the absolute prepared total — the two together are the "prep now matters to score" lock.
const UNPREPARED_SCORE = 45;

/** Best-for-player fixed-sequence PRNG (player strike max, damage taken min): combat is
 * then deterministic and minimal, so the prepared route terminates in a known few rounds. */
function bestRng(): Rng {
  const fracs = [0.999999, 0];
  let i = 0;
  const next = (): number => {
    const f = fracs[Math.min(i, fracs.length - 1)] ?? 0;
    i += 1;
    return f;
  };
  return {
    next,
    int(min: number, max: number): number {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      return lo + Math.floor(next() * (hi - lo + 1));
    },
  };
}

/**
 * Drive a FULLY-PREPARED playthrough along the explicit intended route: north to the byre,
 * read the day-book, ask Cade his counsel and leave the conversation, west to the store to
 * take and don the jerkin, then hold the corridor — fighting each wolf until the way north
 * opens. Each step asserts its RpgAction is actually in the legal set first (so a content-id
 * drift fails LOUDLY here rather than silently skipping a scoring prep act), while the fights
 * loop on the legal set so they stay robust to round count.
 */
function playPrepared(): GameState {
  const loaded = loadRpgPackFile(PACK_PATH);
  expect(loaded.ok, "wolf_winter must load").toBe(true);
  if (!loaded.ok) throw new Error("unreachable");
  const index = indexRpgPack(loaded.compiled.pack);
  // buildRpgRules takes an rng FACTORY (called per combat round); bestRng yields a fresh
  // best-for-player sequence each round, so every strike is max and every reply min.
  const rules = buildRpgRules(index, bestRng);
  const step = makeStep(rules);
  let state = initStateForRpgPack(index, SEED);

  const legal = (): RpgAction[] => rules.legalActions(state) as RpgAction[];
  // Step the one legal RpgAction matching `want` (type + the fields given); assert it exists.
  const act = (want: Partial<RpgAction> & { type: RpgAction["type"] }): void => {
    const match = legal().find((a) =>
      Object.entries(want).every(([k, v]) => (a as Record<string, unknown>)[k] === v),
    );
    expect(
      match,
      `prepared route expected a legal ${JSON.stringify(want)} but the legal set was ${JSON.stringify(legal())}`,
    ).toBeTruthy();
    const res = step(state, match as RpgAction);
    expect(res.ok, `engine rejected ${JSON.stringify(want)}: ${res.rejectionReason}`).toBe(true);
    state = res.state;
  };
  // Fight the enemy blocking the corridor until the north exit opens (its defeat flag gates it).
  const fightThroughNorth = (): void => {
    for (let r = 0; r < 50; r += 1) {
      if (state.ended) return;
      const north = legal().find((a) => a.type === "MOVE" && a.direction === "north");
      if (north) return; // the wolf is down; the way north has opened
      const attack = legal().find((a) => a.type === "ATTACK");
      expect(attack, `no ATTACK and no way north — stuck: ${JSON.stringify(legal())}`).toBeTruthy();
      const res = step(state, attack as RpgAction);
      expect(res.ok, `engine rejected ATTACK: ${res.rejectionReason}`).toBe(true);
      state = res.state;
    }
    throw new Error("a fight did not resolve within 50 rounds under best rolls");
  };

  act({ type: "MOVE", direction: "north" }); // steading_yard -> byre_yard
  act({ type: "READ", target: "day_book" }); // +5
  act({ type: "TALK", npc: "houndsman" }); // open the conversation
  act({ type: "ASK", npc: "houndsman", topic: "ask_wolves" }); // +5, +2 attack -> cade_wolves
  act({ type: "ASK", npc: "houndsman", topic: "wolves_back" }); // back to the root node
  act({ type: "ASK", npc: "houndsman", topic: "leave_cade" }); // end the conversation
  act({ type: "MOVE", direction: "west" }); // byre_yard -> store
  act({ type: "TAKE", item: "byre_jerkin" });
  act({ type: "USE", item: "byre_jerkin", target: "byre_jerkin" }); // don it: +5, +2 defense
  act({ type: "MOVE", direction: "east" }); // store -> byre_yard
  act({ type: "MOVE", direction: "north" }); // byre_yard -> paling_gap (yearling)
  fightThroughNorth();
  act({ type: "MOVE", direction: "north" }); // paling_gap -> byre_door (flank-wolf)
  fightThroughNorth();
  act({ type: "MOVE", direction: "north" }); // byre_door -> byre_mouth (grey leader)
  fightThroughNorth();
  act({ type: "MOVE", direction: "north" }); // byre_mouth -> cattle_stand (the win)

  expect(state.ended, "the prepared run must terminate").toBe(true);
  return state;
}

describe("bug_0239 — The Wolf-Winter: preparation carries a score signal", () => {
  it("the fully-prepared hunter scores the full 60 and holds the byre alive", () => {
    const state = playPrepared();
    // Witness the route really WAS the prepared one: all three prep flags set, the stat
    // buffs applied, and the win reached alive — not a reckless rush that happened to score.
    expect(state.flags.read_tally ?? false).toBe(true);
    expect(state.flags.heard_counsel ?? false).toBe(true);
    expect(state.flags.jerkin_donned ?? false).toBe(true);
    expect(state.vars.attack).toBe(7); // 5 + Cade's +2
    expect(state.vars.defense).toBe(5); // 3 + the jerkin's +2
    expect(state.endingId).toBe("ending_held");
    expect(state.vars[HP_VAR]).toBeGreaterThan(0);
    // The crux: 5 (day-book) + 5 (counsel) + 5 (jerkin) + 10·3 (wolves) + 15 (cattle) = 60.
    expect(state.vars.score).toBe(60);
  });

  it("the diligence GAP is real — the prepared win out-scores the unprepared rush by 15", () => {
    const prepared = playPrepared();
    // The companion bug_0195 test locks the unprepared rush at 45; together they pin that
    // preparation is worth 15 points, not the old 5 (the decoupling the playtest flagged).
    expect((prepared.vars.score ?? 0) - UNPREPARED_SCORE).toBe(15);
  });
});
