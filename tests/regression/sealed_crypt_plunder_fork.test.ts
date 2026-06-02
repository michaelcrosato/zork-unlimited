/**
 * Regression (§15) for bug_0105 — The Sealed Crypt gains a climactic MORAL FORK.
 *
 * Every blind playtest of this pack (most recently ai-runs/2026-06-02T07-50-34-062Z,
 * seed 53) rated clarity 5/5 but enjoyment 3/5, and the single, repeated knock was
 * that it is "entirely linear with a single ending … no real choices." Linear parser
 * packs cap at enjoyment 3 across the whole loop; the branching packs (clockwork,
 * wreckers_light) rate 4–5. The standing top content next-focus was to retrofit a
 * branch onto a linear pack like this one.
 *
 * The fix (content only): the founder's own coffin now sits in the crypt under an
 * iron clasp keyed — like the catacombs gate — to the iron key the player already
 * carries. The iron key is therefore a FORK, not just a key:
 *   • UNLOCK the catacombs gate → press on → ending_victory  (the unchanged win)
 *   • UNLOCK the founder's coffin → take its silver → ending_plunder  (greed; terminal)
 * Both fire through the engine's first-class UNLOCK (the bug_0077 path the gate
 * already uses). ending_plunder is reached by an end_game in unlock_effects, so the
 * two endings are mutually exclusive — a genuine choice, not a detour.
 *
 * Crucially the VICTORY route is byte-identical: the coffin adds no inc_var
 * (max_score stays 35) and no exit/flag/gating to the win path, so every prior
 * route/score test (sealed_crypt_scoring, ending_score_summary, parser_acceptance,
 * sealed_crypt_final_step_legibility) is unaffected.
 *
 * Locked here:
 *   (1) the fork is REAL — at the crypt, holding the iron key, BOTH the gate-unlock
 *       and the coffin-unlock are legal in the SAME state;
 *   (2) plundering fires ending_plunder (non-death), never reaches the catacombs,
 *       and is distinct from ending_victory; its narration names the silver;
 *   (3) ending_plunder is a non-death ending reached ONLY by end_game (no
 *       win_condition resolves to it); ending_victory stays the sole winnable win;
 *   (4) the coffin needs the iron key — reaching the crypt without it offers the
 *       coffin to examine but NOT to unlock;
 *   (5) the canonical victory route still wins ending_victory 35/35 (no regression);
 *   (6) the pack validates clean (no SOFTLOCK / END_GAME_UNDECLARED / WIN_IS_DEATH).
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

// The full route to the crypt, holding the iron key, gate NOT yet unlocked — the
// point at which the fork is live (mirrors sealed_crypt_final_step_legibility).
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

describe("bug_0105 — The Sealed Crypt's climactic moral fork (gate vs. founder's coffin)", () => {
  it("the fork is real: at the crypt with the iron key, BOTH the gate and the coffin can be unlocked", () => {
    const { state } = play(initStateForParserPack(index, 53), ROUTE_TO_CRYPT_WITH_KEY);
    expect(state.current).toBe("crypt");
    expect(state.inventory).toContain("iron_key");
    const ids = actionIds(state);
    expect(ids).toContain("unlock_crypt_gate"); // press on to the win
    expect(ids).toContain("unlock_founders_coffin"); // OR rob the dead
  });

  it("unlocking the founder's coffin ends the game in ending_plunder — distinct from victory, no catacombs", () => {
    const { state, narration } = play(initStateForParserPack(index, 53), [
      ...ROUTE_TO_CRYPT_WITH_KEY,
      "unlock_founders_coffin",
    ]);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_plunder");
    expect(state.endingId).not.toBe("ending_victory");
    // It is a deliberate alternative, not the same place: you never enter the catacombs.
    expect(state.visited.catacombs).toBeFalsy();
    expect(state.flags["catacombs_open"]).toBeFalsy();
    // The act is legible — the narration names what you took.
    expect(narration.toLowerCase()).toContain("silver");
    expect(narration.toLowerCase()).toContain("reliquary");
  });

  it("ending_plunder is non-death and is reached ONLY by end_game — ending_victory stays the sole winnable win", () => {
    const plunder = pack.endings.find((e) => e.id === "ending_plunder");
    expect(plunder).toBeTruthy();
    expect(plunder!.death).toBe(false); // you choose greed, you do not die
    // No win_condition resolves to ending_plunder — it is purely an end_game fork.
    expect(pack.win_conditions.some((w) => w.ending === "ending_plunder")).toBe(false);
    expect(pack.win_conditions.every((w) => w.ending === "ending_victory")).toBe(true);
  });

  it("the coffin needs the iron key: reaching the crypt without it offers the coffin to examine but not unlock", () => {
    // forest → nave → crypt, carrying nothing.
    const { state } = play(initStateForParserPack(index, 53), ["go_north", "go_north", "go_down"]);
    expect(state.current).toBe("crypt");
    expect(state.inventory).not.toContain("iron_key");
    const ids = actionIds(state);
    expect(ids).toContain("examine_founders_coffin"); // visible…
    expect(ids).not.toContain("unlock_founders_coffin"); // …but not unlockable without the key
    expect(ids).not.toContain("unlock_crypt_gate");
  });

  it("the victory route is unchanged — the canonical solve still wins ending_victory 35/35", () => {
    const { state } = play(initStateForParserPack(index, 53), [
      ...ROUTE_TO_CRYPT_WITH_KEY,
      "unlock_crypt_gate",
      "go_north",
    ]);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_victory");
    expect(state.visited.catacombs).toBe(true);
    expect(buildParserObservation(index, state).score).toBe(35);
  });

  it("the pack validates clean (no SOFTLOCK / END_GAME_UNDECLARED / WIN_IS_DEATH)", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    const codes = report.findings.map((f) => f.code);
    for (const bad of ["SOFTLOCK", "END_GAME_UNDECLARED", "WIN_IS_DEATH", "NO_WINNABLE_ENDING"]) {
      expect(codes).not.toContain(bad);
    }
  });
});
