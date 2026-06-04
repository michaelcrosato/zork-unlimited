/**
 * Regression (§15) for bug_0231 — The Tide-Mill: the project's 16th pack and 5th PARSER pack
 * (content/parser/pack/tide_mill.yaml), and the FIRST parser pack with a NON-LINEAR win path.
 *
 * Every existing parser pack (sealed_crypt, alchemists_tower, friars_postern, lamplighters_round)
 * is a LINEAR CHAIN — read the clue, then A → B → C → choose a fork. That near-linearity is the
 * one standing note every fresh blind pass on the (otherwise clean) content set keeps returning
 * ("the win path is essentially linear once you've read the notice"; [[content-polish-backlog-exhausted]]).
 * This pack spends that note as its brief: the climax (winding the sea-gate, +20) is gated by a
 * true dependency DAG, not a chain — TWO INDEPENDENT sub-puzzles that may be solved in EITHER
 * ORDER and BOTH gate the finale:
 *   • cut the choked head-race clear with the billhook  → sluice_clear (+10)
 *   • free the dropped brake-pawl with the crow-bar      → pawl_free   (+10)
 * Only with BOTH flags set does `wind sea-gate winch with crank-handle` resolve (+20, opens the
 * way down to the staith → ending_saved, the win). The two BAD forks use DIFFERENT mechanisms
 * from lamplighters' one-key-opens-all, so the pack is not a re-skin:
 *   • GREED (ending_thief, non-death): a KEY-FREE take_effects end_game (bug_0107) — POCKETING the
 *     miller's coin-bag is the choice itself, the boat left to break.
 *   • DEATH (ending_drowned, the failure pole): `lever flood-hatch with crow-bar` — the same tool
 *     that frees the pawl, turned to the panicked shortcut, drops you into the wheel-pit.
 *     Telegraphed by the millboard AND the hatch examine (§8.7 / bug_0123 "never an ambush").
 *
 * The auto-discovered parser suites already prove the GENERIC structure the moment it ships
 * (all three of ending_saved/ending_thief/ending_drowned reachable; no soft-lock pocket; score
 * economy reachable-max == declared max 45; action-id uniqueness; variant liveness). This pins the
 * pack-SPECIFIC claim those generic suites do NOT — the NON-LINEARITY itself — on the REAL engine
 * (enumerateActions + makeStep):
 *   (1) the +20 climax is HARD-gated on BOTH sub-puzzle flags: with only one of {sluice_clear,
 *       pawl_free} set, `use_crank_handle_on_sea_winch` is not even legal (the wheel has no drive);
 *   (2) the two sub-puzzles are genuinely ORDER-INDEPENDENT — both sluice-first AND pawl-first
 *       routes reach ending_saved at the full 45/45;
 *   (3) GREED: taking the coin-bag fires ending_thief (NON-death), no gate wound, no score;
 *   (4) DEATH: levering the flood-hatch with the crow-bar fires ending_drowned (a DEATH), distinct
 *       from saved/thief, the staith never reached, no score — and it is reachable the moment the
 *       crow-bar is in hand, telegraphed in the board and the hatch examine;
 *   (5) ending_drowned is the pack's ONLY death ending, reached ONLY by end_game; ending_saved
 *       stays the sole winnable ending (no win_condition resolves to a fork).
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/tide_mill.yaml");
if (!loaded.ok) throw new Error("tide_mill must compile");
const pack = loaded.compiled.pack;
const index = indexParserPack(pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): { state: GameState; narration: string } {
  let narration = "";
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt)
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateActions(index, s)
          .map((o) => o.id)
          .join(", ")}]`,
      );
    const r = step(s, opt.action);
    expect(r.ok).toBe(true);
    s = r.state;
    narration = r.events
      .filter((e): e is { type: "narration"; text: string } => e.type === "narration")
      .map((e) => e.text)
      .join(" ");
  }
  return { state: s, narration };
}

const actionIds = (s: GameState): string[] => enumerateActions(index, s).map((o) => o.id);

// Gather all three tools (crank-handle in the wheel-room, billhook + crow-bar in the tool-shed),
// reading the millboard for its +5 on the way out — the point at which BOTH sub-puzzles are
// available and neither is solved, score 5.
const GATHER = [
  "read_millboard", // +5
  "go_north", // mill_house → wheel_room
  "take_crank_handle",
  "go_east", // wheel_room → tool_shed
  "take_billhook",
  "take_crow_bar",
  "go_west", // back to wheel_room
];

describe("bug_0231 — The Tide-Mill: a NON-LINEAR win (two order-independent sub-puzzles gate the climax)", () => {
  it("validates clean as a parser pack, max_score 45", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(pack.meta.max_score).toBe(45);
  });

  it("the +20 climax is HARD-gated on BOTH flags: with only the sluice cleared, winding the gate is not legal", () => {
    // Cut the sluice only (pawl still dropped), then stand at the winch with the handle in hand.
    const { state } = play(initStateForParserPack(index, 1), [
      ...GATHER,
      "go_west", // wheel_room → head_race
      "use_billhook_on_choked_sluice", // +10, sluice_clear
      "go_east", // back to wheel_room (winch present, crank-handle held)
    ]);
    expect(state.flags["sluice_clear"]).toBe(true);
    expect(state.flags["pawl_free"]).toBeFalsy();
    expect(state.vars.score).toBe(15); // +5 board, +10 sluice; the +20 not yet earnable
    const ids = actionIds(state);
    expect(ids).toContain("use_crow_bar_on_brake_pawl"); // the OTHER fault is still to do…
    expect(ids).not.toContain("use_crank_handle_on_sea_winch"); // …so the wheel has no drive — winch locked
    expect(ids).not.toContain("go_down"); // and the staith stays barred
  });

  it("symmetrically: with only the pawl freed, winding the gate is still not legal (the sluice is the missing drive)", () => {
    const { state } = play(initStateForParserPack(index, 1), [
      ...GATHER,
      "use_crow_bar_on_brake_pawl", // +10, pawl_free (done in the wheel-room, no travel)
    ]);
    expect(state.flags["pawl_free"]).toBe(true);
    expect(state.flags["sluice_clear"]).toBeFalsy();
    const ids = actionIds(state);
    expect(ids).not.toContain("use_crank_handle_on_sea_winch"); // a slack race gives no drive either
    expect(ids).not.toContain("go_down");
  });

  it("ORDER-INDEPENDENT (a): sluice-first reaches ending_saved at the full 45/45", () => {
    const win = play(initStateForParserPack(index, 1), [
      ...GATHER,
      "go_west",
      "use_billhook_on_choked_sluice", // sluice first…
      "go_east",
      "use_crow_bar_on_brake_pawl", // …then pawl
      "use_crank_handle_on_sea_winch", // BOTH done → +20, gate_up, way down opens
      "go_down",
    ]);
    expect(win.state.ended).toBe(true);
    expect(win.state.endingId).toBe("ending_saved");
    expect(win.state.visited.the_staith).toBe(true);
    expect(win.state.flags["gate_up"]).toBe(true);
    expect(buildParserObservation(index, win.state).score).toBe(45);
  });

  it("ORDER-INDEPENDENT (b): pawl-first reaches the SAME win at the SAME 45/45", () => {
    const win = play(initStateForParserPack(index, 1), [
      ...GATHER,
      "use_crow_bar_on_brake_pawl", // pawl first…
      "go_west",
      "use_billhook_on_choked_sluice", // …then sluice
      "go_east",
      "use_crank_handle_on_sea_winch",
      "go_down",
    ]);
    expect(win.state.ended).toBe(true);
    expect(win.state.endingId).toBe("ending_saved");
    expect(win.state.vars.score).toBe(45);
  });

  it("the two +10 milestones are one-shot (no farming): each sub-puzzle action retires once its flag is set", () => {
    const after = play(initStateForParserPack(index, 1), [
      ...GATHER,
      "use_crow_bar_on_brake_pawl",
      "go_west",
      "use_billhook_on_choked_sluice",
    ]);
    expect(after.state.vars.score).toBe(25); // 5 + 10 + 10, exactly once each
    expect(actionIds(after.state)).not.toContain("use_billhook_on_choked_sluice"); // sluice retired
    const back = play(after.state, ["go_east"]);
    expect(actionIds(back.state)).not.toContain("use_crow_bar_on_brake_pawl"); // pawl retired
  });

  it("GREED: pocketing the coin-bag fires ending_thief (a NON-death greed end) — no gate wound, no score", () => {
    const { state } = play(initStateForParserPack(index, 1), [
      "go_east", // mill_house → counting_nook
      "take_coin_bag", // take_effects end_game (key-free, distinct from lamplighters' unlock forks)
    ]);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_thief");
    expect(state.flags["gate_up"]).toBeFalsy(); // the boat is left above the weir
    expect(state.visited.the_staith).toBeFalsy();
    expect(state.vars.score ?? 0).toBe(0); // no score rides the greed fork
    const thief = pack.endings.find((e) => e.id === "ending_thief");
    expect(thief!.death).toBeFalsy(); // you are not killed; you chose the silver
  });

  it("DEATH: levering the flood-hatch with the crow-bar fires ending_drowned, distinct from saved/thief, the staith never reached", () => {
    const { state } = play(initStateForParserPack(index, 1), [
      "go_north", // mill_house → wheel_room
      "go_east", // → tool_shed
      "take_crow_bar",
      "go_west", // → wheel_room
      "go_west", // → head_race (the rotten flood-hatch is here)
      "use_crow_bar_on_flood_hatch", // the panicked shortcut — into the wheel-pit
    ]);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_drowned");
    expect(state.endingId).not.toBe("ending_saved");
    expect(state.endingId).not.toBe("ending_thief");
    expect(state.visited.the_staith).toBeFalsy();
    expect(state.vars.score ?? 0).toBe(0); // no score rides the death fork
  });

  it("the DEATH is reachable the moment the crow-bar is in hand AND is telegraphed twice (board + hatch examine) — never an ambush", () => {
    // After grabbing the crow-bar and reaching the head-race, the lever-the-hatch action is offered…
    const { state } = play(initStateForParserPack(index, 1), [
      "go_north",
      "go_east",
      "take_crow_bar",
      "go_west",
      "go_west",
    ]);
    expect(state.inventory).toContain("crow_bar");
    expect(actionIds(state)).toContain("use_crow_bar_on_flood_hatch"); // …visible, not hidden
    // …and both the board and the hatch's own examine warn the staging is rotten / the pit is under it.
    const board = pack.objects.find((o) => o.id === "millboard")!;
    expect(board.read_text!.toUpperCase()).toContain("NEVER LEVER THE OLD FLOOD-HATCH");
    const hatch = pack.objects.find((o) => o.id === "flood_hatch")!;
    const d = hatch.description.toLowerCase();
    expect(d).toContain("rot"); // "its staging is gone soft and black with rot"
    expect(d).toContain("wheel-pit");
  });

  it("ending_drowned is the pack's only death ending, reached ONLY by end_game — ending_saved stays the sole winnable win", () => {
    const drowned = pack.endings.find((e) => e.id === "ending_drowned");
    expect(drowned!.death).toBe(true);
    expect(pack.endings.filter((e) => e.death).map((e) => e.id)).toEqual(["ending_drowned"]);
    // No win_condition resolves to a fork ending — both forks are pure end_game.
    expect(pack.win_conditions.some((w) => w.ending === "ending_drowned")).toBe(false);
    expect(pack.win_conditions.some((w) => w.ending === "ending_thief")).toBe(false);
    expect(pack.win_conditions.every((w) => w.ending === "ending_saved")).toBe(true);
  });

  it("the two crow-bar uses (free pawl / lever hatch) are DIFFERENT natural verbs, so they never collide in the parser", () => {
    const pawl = pack.objects.find((o) => o.id === "brake_pawl")!;
    const hatch = pack.objects.find((o) => o.id === "flood_hatch")!;
    const pawlUse = pawl.interactions.find((it) => it.verb === "USE" && it.item === "crow_bar")!;
    const hatchUse = hatch.interactions.find((it) => it.verb === "USE" && it.item === "crow_bar")!;
    expect(pawlUse.command_verb).toBe("free");
    expect(hatchUse.command_verb).toBe("lever");
    expect(pawlUse.command_verb).not.toBe(hatchUse.command_verb);
  });
});
