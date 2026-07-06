/**
 * Regression (§15) for bug_0226 — The Dawn Beacon blind-pass: the climax fired on bare
 * room entry, not on a deliberate act.
 *
 * The mandated blind pass this cycle (The Dawn Beacon, rpg, seeds 7/23 — the most-overdue
 * dedicated-blind target per [[assessor-blind-pass-rotation]], rotated off the assessor's
 * recency-blind rank-1 parser pack) returned clarity 5/5, enjoyment 4/5, mechanics
 * flawless across a prepared 50/50 win and an unprepared 45/50 win. Its one concrete
 * friction finding: at the Crown of the Tower there was no explicit "light the beacon"
 * RpgAction — simply moving `up` auto-lit the beacon (+15 on the room's on_enter) and ended
 * the game, though the orders-board and the watchman both say plainly "LIGHT THE BEACON".
 * This is the SAME smell sunken_barrow's seed-71 pass surfaced (the climax narrated AT the
 * player on entry, no act to perform), fixed there by bug_0107 with the visited+has_item
 * win shape.
 *
 * The fix mirrors sunken_barrow exactly:
 *  - The crown gains a `beacon_fire` (the laid pitch-pine) and a `flint`; lighting is an
 *    explicit USE — "light beacon with flint" — that sets `beacon_lit` and carries the +15
 *    capstone (moved off the room's on_enter onto the act).
 *  - The win turns on BOTH `{ visited: beacon_crown }` AND `{ has_flag: beacon_lit }`:
 *    entering no longer wins (the beacon is still dark), yet the `visited` term is KEPT so
 *    the parser validator still derives its soft-lock guard from a real win-room. The
 *    engine's post-RpgAction checkWin (bug_0056) fires the win the same frame the spark lands.
 *
 * Locked here:
 *   (a) the win condition retains BOTH terms (visited beacon_crown + has_flag beacon_lit);
 *   (b) climbing to the crown does NOT end the game — score is 35 (< 50), the beacon is
 *       unlit, and no "light" RpgAction is offered until the flint is in hand;
 *   (c) once the flint is held the crown offers the explicit "light beacon with flint"
 *       command, and performing it sets beacon_lit, awards the final +15, and ends with
 *       ending_lit at the full 50 — the deliberate climactic act the prose calls for;
 *   (d) the pack still validates green under the RPG validator.
 */
import { describe, it, expect } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { RpgAction } from "../../src/api/types.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";

describe("bug_0226 — The Dawn Beacon wins on the deliberate light act, not on bare entry", () => {
  const loaded = loadRpgSourceFile("content/rpg/pack/dawn_beacon.yaml");
  if (!loaded.ok) throw new Error("dawn_beacon must compile");
  const pack = loaded.compiled.pack;
  const index = indexRpgPack(pack);
  const rules = buildRpgRules(index);
  const step = makeStep(rules);

  /** The offered USE commands for lighting the beacon (flint on beacon_fire) in `s`. */
  const lightCommands = (s: GameState): string[] =>
    enumerateRpgActions(index, s)
      .filter(
        (o) =>
          o.action.type === "USE" && o.action.item === "flint" && o.action.target === "beacon_fire",
      )
      .map((o) => o.command);

  /** Play the canonical FULLY-PREPARED route to the crown (cresset righted, beacon unlit).
   *  Full prep (the watchman's +2 attack counsel + the garrison mail's +2 defense) makes the
   *  combat_guaranteed bound hold on EVERY roll, so the drive is seed-robust. */
  function toCrown(seed: number): GameState {
    let s = initStateForRpgPack(index, seed);
    const drive = (a: RpgAction): void => {
      const r = step(s, a);
      expect(r.ok, `RpgAction ${JSON.stringify(a)} in ${s.current}`).toBe(true);
      s = r.state;
    };
    drive({ type: "MOVE", direction: "north" }); // lower_ward
    drive({ type: "READ", target: "orders_board" }); // +5
    drive({ type: "TALK", npc: "watchman" });
    drive({ type: "ASK", npc: "watchman", topic: "ask_fight" }); // +2 attack
    drive({ type: "ASK", npc: "watchman", topic: "fight_back" }); // back to root
    drive({ type: "ASK", npc: "watchman", topic: "leave_watch" }); // end conversation
    drive({ type: "TAKE", item: "winch_bar" });
    drive({ type: "MOVE", direction: "west" }); // armory
    drive({ type: "TAKE", item: "garrison_mail" });
    drive({ type: "USE", item: "garrison_mail", target: "garrison_mail" }); // don, +2 def
    drive({ type: "MOVE", direction: "east" }); // lower_ward
    drive({ type: "MOVE", direction: "north" }); // gate_arch
    for (let i = 0; i < 60 && !s.flags["gate_raider_slain"]; i++)
      drive({ type: "ATTACK", enemy: "gate_raider" });
    drive({ type: "MOVE", direction: "north" }); // stair_head
    for (let i = 0; i < 60 && !s.flags["captain_slain"]; i++)
      drive({ type: "ATTACK", enemy: "raider_captain" });
    drive({ type: "MOVE", direction: "north" }); // beacon_stage
    for (let i = 0; i < 60 && s.questStage["beacon"] !== "cresset_raised"; i++)
      drive({ type: "USE", item: "winch_bar", target: "cresset" });
    drive({ type: "MOVE", direction: "up" }); // beacon_crown
    return s;
  }

  it("the win condition keeps BOTH the visited-room term and the has-flag light term", () => {
    const wc = pack.win_conditions.find((w) => w.ending === "ending_lit")!;
    expect(wc.conditions.some((c) => "visited" in c && c.visited === "beacon_crown")).toBe(true);
    expect(wc.conditions.some((c) => "has_flag" in c && c.has_flag === "beacon_lit")).toBe(true);
  });

  it("climbing to the crown does NOT end the game and offers no light until the flint is held", () => {
    const s = toCrown(7);
    expect(s.current).toBe("beacon_crown");
    expect(s.ended).toBe(false);
    expect(s.endingId).toBeNull();
    expect(s.flags["beacon_lit"]).toBeUndefined();
    // The +15 capstone is NOT yet awarded on entry (it rides the light act): 5 + 10 + 10 + 10.
    expect(s.vars["score"]).toBe(35);
    expect(s.vars["score"]).toBeLessThan(pack.meta.max_score);
    // No "light" command is offered while the flint is not in hand (USE needs the item held).
    expect(lightCommands(s)).toEqual([]);
    // ...but the flint is there to take.
    expect(rules.legalActions(s).some((a) => a.type === "TAKE" && a.item === "flint")).toBe(true);
  });

  it('once the flint is held the crown offers the explicit "light beacon with flint" command', () => {
    const s0 = toCrown(7);
    const r = step(s0, { type: "TAKE", item: "flint" });
    expect(r.ok).toBe(true);
    const s = r.state;
    expect(s.inventory).toContain("flint");
    expect(s.ended).toBe(false); // taking the flint is not the win — lighting is
    expect(lightCommands(s)).toEqual(["light beacon with flint"]);
  });

  it("lighting the beacon sets beacon_lit, awards the final +15, and ends with ending_lit at full score", () => {
    const s0 = toCrown(7);
    const s = step(s0, { type: "TAKE", item: "flint" }).state;
    const r = step(s, { type: "USE", item: "flint", target: "beacon_fire" });
    expect(r.ok).toBe(true);
    expect(r.state.flags["beacon_lit"]).toBe(true);
    expect(r.state.ended).toBe(true);
    expect(r.state.endingId).toBe("ending_lit");
    expect(r.state.vars["score"]).toBe(pack.meta.max_score);
    expect(r.state.vars["score"]).toBe(50);
    // The win fired exactly once.
    expect(r.events.filter((e) => e.type === "ending")).toHaveLength(1);
  });

  it("still validates green under the RPG validator", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
