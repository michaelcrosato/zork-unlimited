/**
 * Regression (§15) for bug_0054/bug_0385 — the final step beyond the gate must be legible.
 *
 * Blind MCP playtest of The Sealed Crypt (ai-runs/2026-06-01T15-18-32-296Z, seed 29)
 * flagged that USING the iron key on the catacombs gate awarded the last +20 — the
 * score read "35 of 35" (= max_score) — yet the WIN only fired on ENTERING the
 * catacombs (`visited: catacombs`). With the old open-gate text ("…swung inward on
 * darkness. The stair climbs back up.") and the old unlock narration ("…the catacombs
 * gate swings inward."), a first-timer at max score could read the puzzle as solved and
 * climb back UP, stopping one step short of ending_victory. The climactic award and the
 * ending trigger are decoupled, and nothing pointed the player north through the gate.
 *
 * bug_0385 later made that remaining beat explicit: entering the catacombs reveals the
 * sealed relic, and TAKING it is now the scored win. The gate text must still point north,
 * but the score cap and ending now land on the promised relic recovery, not the unlock.
 *
 * This test pins the legibility invariant: before the unlock the gate "bars the way" and
 * there is no north exit; at the unlock BOTH the narration and the open-gate room text
 * name the north move/relic, and the north exit is present without ending the game; in
 * the catacombs the relic is visible and taking it wins at 35/35.
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
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const crypt = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!crypt.ok) throw new Error("sealed_crypt must compile");
const index = indexParserPack(crypt.compiled.pack);
const step = makeStep(buildParserRules(index));

/** Play a list of action ids, returning the final state. Collects the last step's narration. */
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
    const narrEvents = r.events.filter(
      (e): e is { type: "narration"; text: string } => e.type === "narration",
    );
    narration = narrEvents.map((e) => e.text).join(" ");
  }
  return { state: s, narration };
}

const obs = (s: GameState) => buildParserObservation(index, s);
const hasNorthExit = (s: GameState): boolean => obs(s).exits.some((e) => e.direction === "north");

// The route up to (but not through) the catacombs gate unlock.
const ROUTE_TO_GATE = [
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

describe("bug_0054 — the Sealed Crypt's final step into the catacombs is signposted", () => {
  it("before unlocking: the gate bars the way and there is no north exit", () => {
    const { state } = play(initStateForParserPack(index, 29), ROUTE_TO_GATE);
    expect(state.current).toBe("crypt");
    expect(state.flags["catacombs_open"]).toBeFalsy();
    expect(obs(state).description).toContain("bars the way");
    expect(hasNorthExit(state)).toBe(false);
  });

  it("at the unlock: the gate opens and both the narration and open-gate room text name the north relic recovery", () => {
    const { state, narration } = play(initStateForParserPack(index, 29), [
      ...ROUTE_TO_GATE,
      "unlock_crypt_gate",
    ]);
    expect(state.current).toBe("crypt");
    expect(state.flags["catacombs_open"]).toBe(true);
    expect(state.vars.score).toBe(15);
    expect(state.ended).toBe(false);
    // The remaining move and goal must be unmistakable. The unlock narration names it:
    expect(narration.toLowerCase()).toContain("north");
    expect(narration.toLowerCase()).toContain("relic");
    // ...and the persistent open-gate room text names it too (a player who looks again still sees it):
    const desc = obs(state).description;
    expect(desc.toLowerCase()).toContain("north");
    expect(desc.toLowerCase()).toContain("sealed relic");
    // The way out is now genuinely open.
    expect(hasNorthExit(state)).toBe(true);
  });

  it("entering the catacombs reveals the relic, and taking it wins ending_victory 35/35", () => {
    let result = play(initStateForParserPack(index, 29), [
      ...ROUTE_TO_GATE,
      "unlock_crypt_gate",
      "go_north",
    ]);
    expect(result.state.current).toBe("catacombs");
    expect(result.state.ended).toBe(false);
    expect(obs(result.state).visible_objects.map((o) => o.id)).toContain("sealed_relic");
    expect(obs(result.state).description.toLowerCase()).toContain("relic");

    result = play(result.state, ["take_sealed_relic"]);
    const { state } = result;
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_victory");
    expect(state.visited.catacombs).toBe(true);
    expect(state.inventory).toContain("sealed_relic");
    expect(state.vars.score).toBe(35);
  });
});
