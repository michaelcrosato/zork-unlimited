/**
 * Regression (§15) for bug_0301 — the `grip iron key` steadiness beat persisted in
 * the Great Hall AFTER the cellar hatch was already unlocked.
 *
 * A fresh blind MCP playtest (seed 7, 2026-06-08) found that after the player used
 * the iron key to unlock the cellar hatch, the `grip iron key / use_iron_key` action
 * was still present in the Great Hall's available actions. The beat's narration ("before
 * you set this key to anything down here") is past tense once the hatch is open — the
 * moment is over. Bug_0261 gated it to `{ in_room: great_hall }`, but did not retire
 * it when the hatch was unlocked.
 *
 * Fix: add `{ none_of: [{ is_unlocked: cellar_door }] }` to the grip interaction's
 * conditions (content-only, convergent — gates nothing structural on either roll
 * outcome; uses the condition DSL's universal negation without adding a new flag).
 *
 * Locked here:
 *   (1) In the Great Hall, iron key held, cellar hatch NOT yet unlocked → grip PRESENT
 *   (2) In the Great Hall, iron key held, cellar hatch UNLOCKED → grip ABSENT
 *   (3) After returning to Great Hall from the cellar (hatch stays unlocked) → grip ABSENT
 *   (4) Cosmetic — the cure route still wins ending_cured at 40/40 after the fix
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

const alch = loadParserPackFile("content/parser/pack/alchemists_tower.yaml");
if (!alch.ok) throw new Error("alchemists_tower must compile");
const index = indexParserPack(alch.compiled.pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): GameState {
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
  }
  return s;
}

const hasGrip = (s: GameState): boolean =>
  enumerateActions(index, s).some(
    (a) =>
      a.action.type === "USE" && a.action.item === "iron_key" && a.action.target === "iron_key",
  );

// Route to the Great Hall carrying the iron key, cellar hatch still locked.
const TO_GREAT_HALL_WITH_KEY = [
  "go_west",
  "read_spellbook",
  "go_east",
  "go_east",
  "take_herb",
  "take_brass_key",
  "go_west",
  "go_north",
  "go_up",
  "unlock_strongbox",
  "open_strongbox",
  "take_iron_key",
  "go_down",
];

describe("bug_0301 — grip iron key beat retires after cellar hatch is unlocked", () => {
  it("(1) in the Great Hall with iron key, cellar NOT yet unlocked → grip IS present", () => {
    const s = play(initStateForParserPack(index, 7), TO_GREAT_HALL_WITH_KEY);
    expect(s.current).toBe("great_hall");
    expect(s.inventory).toContain("iron_key");
    expect(s.objectState["cellar_door"]?.locked).not.toBe(false);
    expect(hasGrip(s)).toBe(true);
  });

  it("(2) in the Great Hall, cellar hatch UNLOCKED → grip is ABSENT", () => {
    let s = play(initStateForParserPack(index, 7), TO_GREAT_HALL_WITH_KEY);
    // Unlock the hatch — player stays in great_hall.
    s = play(s, ["unlock_cellar_door"]);
    expect(s.current).toBe("great_hall");
    expect(s.inventory).toContain("iron_key");
    expect(s.objectState["cellar_door"]?.locked).toBe(false);
    expect(hasGrip(s)).toBe(false);
  });

  it("(3) after returning to Great Hall from the cellar, grip still ABSENT (hatch stays unlocked)", () => {
    let s = play(initStateForParserPack(index, 7), TO_GREAT_HALL_WITH_KEY);
    s = play(s, ["unlock_cellar_door", "go_down", "take_water_vial", "go_up"]);
    expect(s.current).toBe("great_hall");
    expect(s.inventory).toContain("iron_key");
    expect(s.objectState["cellar_door"]?.locked).toBe(false);
    expect(hasGrip(s)).toBe(false);
  });

  it("(4) cosmetic — cure route still wins ending_cured at 40/40 after the fix", () => {
    const won = play(initStateForParserPack(index, 7), [
      ...TO_GREAT_HALL_WITH_KEY,
      "unlock_cellar_door",
      "go_down",
      "take_water_vial",
      "go_up",
      "go_north",
      "use_herb_on_cauldron",
      "use_water_vial_on_cauldron",
      "go_up",
      "use_antidote_on_master",
    ]);
    expect(won.ended).toBe(true);
    expect(won.endingId).toBe("ending_cured");
    expect(buildParserObservation(index, won).score).toBe(40);
  });
});
