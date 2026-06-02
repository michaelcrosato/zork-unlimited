/**
 * Regression (§15) for bug_0130 — The Sealed Crypt gains its first FAILURE POLE.
 *
 * Every blind playtest of this pack (most recently ai-runs/2026-06-02T14-04-41-399Z,
 * seeds 47/99) has rated it clarity 5/5 but enjoyment 4/5, and since bug_0105 added
 * the gate-vs-coffin moral fork the single repeated knock was that it is short and
 * "you cannot fail" — the pack had no death/failure ending, so the climactic choice
 * was between two safe outcomes (reach the catacombs, or rob the founder for silver).
 *
 * The fix (content only): a new lead-sealed tomb (bound_tomb) sits among the lesser
 * dead in the crypt, keyed — like the gate and the founder's coffin — to the iron key
 * the player already carries. The iron key is now a THREE-way fork:
 *   • UNLOCK the catacombs gate  → press on → ending_victory  (the unchanged win)
 *   • UNLOCK the founder's coffin → take its silver → ending_plunder  (greed; terminal)
 *   • UNLOCK the lead-sealed tomb → break the plague-seal → ending_doom  (hubris; DEATH)
 * ending_doom is the pack's first death ending (death: true), reached by an end_game in
 * unlock_effects (the bug_0077/0105 path), recoverable via an earlier save (§8.7). It
 * also answers what the fiction never did — WHY the crypt is "sealed" and the chapel a
 * "burnt shell": the parish plague was leaded shut down here and the chapel burned.
 *
 * Crucially the VICTORY and PLUNDER routes are byte-identical: the tomb adds no inc_var
 * (max_score stays 35), no flag, and no exit/gating, so every prior route/score test
 * (sealed_crypt_scoring, ending_score_summary, parser_acceptance,
 * sealed_crypt_final_step_legibility, sealed_crypt_plunder_fork) is unaffected.
 *
 * Locked here:
 *   (1) the fork is now THREE-way — at the crypt, holding the iron key, the gate, the
 *       coffin AND the tomb can all be unlocked in the SAME state;
 *   (2) breaking the seal fires ending_doom (a death), never reaches the catacombs, is
 *       distinct from victory and plunder, and its narration names the plague/seal;
 *   (3) ending_doom is the pack's ONLY death ending, reached only by end_game (no
 *       win_condition resolves to it); ending_victory stays the sole winnable win;
 *   (4) the tomb needs the iron key — without it the crypt offers it to examine but
 *       NOT to unlock;
 *   (5) the victory route still wins 35/35 and the plunder route still ends in
 *       ending_plunder (no regression); max_score stays 35;
 *   (6) the pack validates clean (no SOFTLOCK / END_GAME_UNDECLARED / WIN_IS_DEATH /
 *       NO_WINNABLE_ENDING).
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

const crypt = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!crypt.ok) throw new Error("sealed_crypt must compile");
const pack = crypt.compiled.pack;
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

// The full route to the crypt, holding the iron key, nothing yet unlocked — the point
// at which the three-way fork is live (mirrors sealed_crypt_plunder_fork / legibility).
const ROUTE_TO_CRYPT_WITH_KEY = [
  "go_north",
  "go_up",
  "take_rope",
  "go_down",
  "go_west",
  "read_headstone",
  "go_north",
  "open_stone_coffer",
  "take_brass_key",
  "go_south",
  "go_east",
  "go_east",
  "use_rope_on_old_well",
  "go_down",
  "unlock_oak_chest",
  "open_oak_chest",
  "take_iron_key",
  "go_up",
  "go_west",
  "go_north",
  "go_down",
];

describe("bug_0130 — The Sealed Crypt's third iron-key fork (the lead-sealed plague tomb → ending_doom)", () => {
  it("the fork is now three-way: at the crypt with the iron key, gate, coffin AND tomb can all be unlocked", () => {
    const { state } = play(initStateForParserPack(index, 47), ROUTE_TO_CRYPT_WITH_KEY);
    expect(state.current).toBe("crypt");
    expect(state.inventory).toContain("iron_key");
    const ids = actionIds(state);
    expect(ids).toContain("unlock_crypt_gate"); // press on to the win
    expect(ids).toContain("unlock_founders_coffin"); // OR rob the dead (bug_0105)
    expect(ids).toContain("unlock_bound_tomb"); // OR break the plague-seal (bug_0130)
  });

  it("breaking the lead seal ends the game in ending_doom (a death) — distinct from victory and plunder, no catacombs", () => {
    const { state, narration } = play(initStateForParserPack(index, 47), [
      ...ROUTE_TO_CRYPT_WITH_KEY,
      "unlock_bound_tomb",
    ]);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_doom");
    expect(state.endingId).not.toBe("ending_victory");
    expect(state.endingId).not.toBe("ending_plunder");
    // It is a deliberate alternative, not the way on: you never enter the catacombs.
    expect(state.visited.catacombs).toBeFalsy();
    expect(state.flags["catacombs_open"]).toBeFalsy();
    // The act is legible — the narration names what the seal held back.
    const n = narration.toLowerCase();
    expect(n).toContain("seal");
    expect(n).toContain("fever-dead");
    // No score is awarded for the doom act — the score sits where the route left it (15:
    // +5 headstone, +10 well; the +20 gate award never fired).
    expect(state.vars.score).toBe(15);
  });

  it("ending_doom is the pack's only death ending, reached ONLY by end_game — ending_victory stays the sole winnable win", () => {
    const doom = pack.endings.find((e) => e.id === "ending_doom");
    expect(doom).toBeTruthy();
    expect(doom!.death).toBe(true); // you break the seal, you die
    // It is the ONLY death ending; victory and plunder are non-death.
    expect(pack.endings.filter((e) => e.death).map((e) => e.id)).toEqual(["ending_doom"]);
    // No win_condition resolves to ending_doom — it is purely an end_game fork.
    expect(pack.win_conditions.some((w) => w.ending === "ending_doom")).toBe(false);
    expect(pack.win_conditions.every((w) => w.ending === "ending_victory")).toBe(true);
  });

  it("the tomb needs the iron key: reaching the crypt without it offers the tomb to examine but not unlock", () => {
    // forest → nave → crypt, carrying nothing.
    const { state } = play(initStateForParserPack(index, 47), ["go_north", "go_north", "go_down"]);
    expect(state.current).toBe("crypt");
    expect(state.inventory).not.toContain("iron_key");
    const ids = actionIds(state);
    expect(ids).toContain("examine_bound_tomb"); // visible…
    expect(ids).not.toContain("unlock_bound_tomb"); // …but not unlockable without the key
  });

  it("the victory and plunder routes are unchanged — victory still wins 35/35, plunder still ends in ending_plunder", () => {
    const victory = play(initStateForParserPack(index, 47), [
      ...ROUTE_TO_CRYPT_WITH_KEY,
      "unlock_crypt_gate",
      "go_north",
    ]);
    expect(victory.state.ended).toBe(true);
    expect(victory.state.endingId).toBe("ending_victory");
    expect(victory.state.visited.catacombs).toBe(true);
    expect(buildParserObservation(index, victory.state).score).toBe(35);

    const plunder = play(initStateForParserPack(index, 47), [
      ...ROUTE_TO_CRYPT_WITH_KEY,
      "unlock_founders_coffin",
    ]);
    expect(plunder.state.ended).toBe(true);
    expect(plunder.state.endingId).toBe("ending_plunder");

    // max_score is untouched by the new fork.
    expect(pack.meta.max_score).toBe(35);
  });

  it("the pack validates clean (no SOFTLOCK / END_GAME_UNDECLARED / WIN_IS_DEATH / NO_WINNABLE_ENDING)", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    const codes = report.findings.map((f) => f.code);
    for (const bad of ["SOFTLOCK", "END_GAME_UNDECLARED", "WIN_IS_DEATH", "NO_WINNABLE_ENDING"]) {
      expect(codes).not.toContain(bad);
    }
  });
});
