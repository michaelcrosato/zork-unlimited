/**
 * Regression (§15) for bug_0056 — the climactic-agency engine gap.
 *
 * A fresh, MCP-only blind playtester (seed 71) reached The Sunken Barrow's relic
 * chamber and the game ENDED the instant they walked in: the circlet sat in
 * visible_objects with no actions, and the victory epilogue narrated "You lift the
 * circlet from its plinth" — an act the player never performed. The whole reason the
 * chamber existed (the goal item) was presented AND resolved in the same frame, so
 * the climax was narrated AT the player instead of earned by a final grab. This is the
 * shared gap flagged across bug_0047/0052/0054: the parser/RPG runners evaluated
 * win_conditions ONLY in onEnter (on a room transition), so a win that should turn on a
 * deliberate non-move action (claiming the relic) could only ever fire on bare entry.
 *
 * The fix has two layers:
 *  - ENGINE (src/core/engine.ts §8.4.5): a backward-compatible post-action `checkWin`
 *    hook. After an action's effects (and any onEnter), if the game has NOT already
 *    ended, the runner's checkWin may append an end_game. So a win can fire on a TAKE
 *    with no move. It is skipped once ended, so an onEnter/effect-level win never
 *    double-fires. Runners that only win on entry omit checkWin (CYOA) — unchanged.
 *  - CONTENT (sunken_barrow.yaml): the win now also requires `{ has_item: circlet }`
 *    alongside `{ visited: relic_chamber }`. Entering the chamber no longer wins (you
 *    do not hold the crown yet) — it shows the circlet on its plinth and offers
 *    "take circlet"; the win fires on that TAKE. `visited: relic_chamber` is KEPT: the
 *    parser validator derives its soft-lock guard from `visited` win-rooms, so dropping
 *    it would silently disable that check.
 *
 * Locked here:
 *   (a) ENGINE CONTRACT (synthetic Rules): checkWin fires a win on a non-move action,
 *       is skipped once the game has ended (no double-fire), and is optional.
 *   (b) CONTENT: entering relic_chamber does NOT end (score 25, win pending); taking the
 *       circlet awards the final +25 via take_effects AND ends with ending_victory at
 *       full score (bug_0107 moved the last beat off chamber entry onto the claim).
 *   (c) the win condition retains BOTH terms (visited + has_item).
 */
import { describe, it, expect } from "vitest";
import { makeStep, type Rules } from "../../src/core/engine.js";
import { initState, type GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";

describe("bug_0056 — engine post-action win hook (checkWin)", () => {
  // A minimal world: one action CLAIM (no move) sets a flag; checkWin ends the game
  // once that flag is set. This isolates the engine contract from any content.
  const claim: Action = { type: "TAKE", item: "prize" };
  const baseRules = (): Rules => ({
    legalActions: (s) => (s.ended ? [] : [claim]),
    resolve: () => ({ conditions: [], effects: [{ set_flag: "claimed" }] }),
    checkWin: (s) => (s.flags["claimed"] ? [{ end_game: "ending_win" }] : []),
  });
  const fresh = (): GameState => initState({ seed: 1, start: "room" });

  it("fires a win on a non-move action (the deliberate claim)", () => {
    const step = makeStep(baseRules());
    const r = step(fresh(), claim);
    expect(r.ok).toBe(true);
    expect(r.state.ended).toBe(true);
    expect(r.state.endingId).toBe("ending_win");
    // Exactly one ending event — the win fired once.
    expect(r.events.filter((e) => e.type === "ending")).toHaveLength(1);
  });

  it("is skipped once the game has ended — no double-fire", () => {
    // A rule set whose action's OWN effect already ends the game, plus a checkWin that
    // would also fire: the post-action hook must NOT append a second end_game.
    const rules: Rules = {
      legalActions: (s) => (s.ended ? [] : [claim]),
      resolve: () => ({ effects: [{ end_game: "ending_first" }], conditions: [] }),
      checkWin: () => [{ end_game: "ending_second" }],
    };
    const r = makeStep(rules)(fresh(), claim);
    expect(r.ok).toBe(true);
    expect(r.state.endingId).toBe("ending_first");
    expect(r.events.filter((e) => e.type === "ending")).toHaveLength(1);
  });

  it("is optional — a rule set without checkWin still steps normally", () => {
    const noWin: Rules = {
      legalActions: (s) => (s.ended ? [] : [claim]),
      resolve: () => ({ conditions: [], effects: [{ set_flag: "claimed" }] }),
    };
    const r = makeStep(noWin)(fresh(), claim);
    expect(r.ok).toBe(true);
    expect(r.state.ended).toBe(false);
    expect(r.state.flags["claimed"]).toBe(true);
  });
});

describe("bug_0056 — The Sunken Barrow wins on the claim, not on entry", () => {
  const loaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
  if (!loaded.ok) throw new Error("sunken_barrow must compile");
  const pack = loaded.compiled.pack;
  const index = indexRpgPack(pack);
  const rules = buildRpgRules(index);
  const step = makeStep(rules);

  /** Play the canonical route to the relic chamber (not yet claimed). */
  function toRelicChamber(seed: number): GameState {
    let s = initStateForRpgPack(index, seed);
    const drive = (a: Action) => {
      const r = step(s, a);
      expect(r.ok, `action ${JSON.stringify(a)} in ${s.current}`).toBe(true);
      s = r.state;
    };
    drive({ type: "MOVE", direction: "down" });
    drive({ type: "TAKE", item: "iron_bar" });
    drive({ type: "MOVE", direction: "north" });
    for (let i = 0; i < 40 && !s.flags["wight_slain"]; i++)
      drive({ type: "ATTACK", enemy: "barrow_wight" });
    drive({ type: "MOVE", direction: "east" });
    for (let i = 0; i < 40 && s.questStage["barrow"] !== "slab_moved"; i++)
      drive({ type: "USE", item: "iron_bar", target: "stone_slab" });
    drive({ type: "MOVE", direction: "down" });
    return s;
  }

  it("the win condition keeps BOTH the visited-room term and the has-item claim term", () => {
    const wc = pack.win_conditions.find((w) => w.ending === "ending_victory")!;
    expect(wc.conditions.some((c) => "visited" in c && c.visited === "relic_chamber")).toBe(true);
    expect(wc.conditions.some((c) => "has_item" in c && c.has_item === "circlet")).toBe(true);
  });

  it("entering the relic chamber does NOT end the game and offers the circlet to take", () => {
    const s = toRelicChamber(71);
    expect(s.current).toBe("relic_chamber");
    expect(s.ended).toBe(false);
    expect(s.endingId).toBeNull();
    // max score is NOT yet in hand on entry (bug_0107): the final +25 rides the claim
    // (the circlet's take_effects), so on entry the score is 25 and the win is pending.
    expect(s.vars["score"]).toBe(25);
    expect(s.vars["score"]).toBeLessThan(pack.meta.max_score);
    expect(s.inventory).not.toContain("circlet");
    const takeCirclet = rules
      .legalActions(s)
      .some((a) => a.type === "TAKE" && a.item === "circlet");
    expect(takeCirclet).toBe(true);
  });

  it("taking the circlet ends the game with ending_victory at full score", () => {
    const s = toRelicChamber(71);
    const r = step(s, { type: "TAKE", item: "circlet" });
    expect(r.ok).toBe(true);
    expect(r.state.inventory).toContain("circlet");
    expect(r.state.ended).toBe(true);
    expect(r.state.endingId).toBe("ending_victory");
    expect(r.state.vars["score"]).toBe(pack.meta.max_score);
  });

  it("still validates green under the RPG validator", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
