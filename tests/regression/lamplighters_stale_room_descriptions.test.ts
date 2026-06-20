/**
 * Regression (§15) for bug_0302 — three rooms in lamplighters_round had stale
 * descriptions that did not update after state-changing actions.
 *
 * A fresh blind MCP playtest (seed 7, 2026-06-08) found:
 *   • river_stair: prose still listed tinderbox + brass tally-key after both were taken
 *   • watch_box: cupboard description still said "its little lock shaped for a tally-key"
 *     after the player had unlocked it, opened it, and taken the store-key
 *   • lamp_walk: "The excise store stands shut to the east behind a stout barred door"
 *     persisted even after the store door was unlocked (most jarring — directly contradicted
 *     the newly available east exit)
 *
 * Same reactive-description-blindness class as bug_0282/0283/0287/0288.
 *
 * Fix: added `variants:` blocks to all three rooms (description: remains the fallback):
 *   • river_stair: when[has_item:tinderbox + has_item:brass_key + has_item:horn_windscreen]
 *     → bare-sill text; when[has_item:tinderbox + has_item:brass_key] → windscreen-only text
 *   • watch_box: when[has_item:store_key] → "wall-cupboard hangs open and empty"
 *   • lamp_walk: when[has_flag:store_open] → "excise store stands open to the east"
 *
 * Locked here:
 *   (1) river_stair base shows original text before items are taken
 *   (2) river_stair shows windscreen-only variant after tinderbox + brass_key taken
 *   (3) river_stair shows bare-sill variant when all three items taken
 *   (4) watch_box base shows locked-cupboard text before store_key taken
 *   (5) watch_box shows open-and-empty variant after store_key taken
 *   (6) lamp_walk base shows "shut" text before store_open flag is set
 *   (7) lamp_walk shows "open" variant after store door is unlocked
 *   (8) critical path still wins ending_guided at 35/35 after the fix
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

const loaded = loadParserPackFile("content/parser/pack/lamplighters_round.yaml");
if (!loaded.ok) throw new Error("lamplighters_round must compile");
const index = indexParserPack(loaded.compiled.pack);
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

const desc = (s: GameState): string => buildParserObservation(index, s).description;

// Route to watch_box with store_key in hand (opens cupboard along the way)
const TO_STORE_KEY = [
  "take_tinderbox",
  "take_brass_key",
  "go_north",
  "go_west",
  "unlock_wall_cupboard",
  "open_wall_cupboard",
  "take_store_key",
];

// Full winning route (read notice +5, unlock store +10, light lamp +20 = 35)
const WIN_ROUTE = [
  "read_night_notice",
  "take_tinderbox",
  "take_brass_key",
  "take_horn_windscreen",
  "go_north",
  "go_west",
  "unlock_wall_cupboard",
  "open_wall_cupboard",
  "take_store_key",
  "go_east",
  "unlock_store_door",
  "go_east",
  "unlock_oil_cask",
  "open_oil_cask",
  "take_whale_oil",
  "go_west",
  "go_north",
  "use_whale_oil_on_harbour_lamp",
  "use_tinderbox_on_harbour_lamp",
  "go_down",
];

describe("bug_0302 — lamplighters_round stale room descriptions", () => {
  // river_stair
  it("(1) river_stair base: original text shown before any items taken", () => {
    const s = initStateForParserPack(index, 7);
    expect(s.current).toBe("river_stair");
    expect(desc(s)).toContain("a tinderbox lies on the sill");
    expect(desc(s)).toContain("a small brass tally-key hangs on a nail");
  });

  it("(2) river_stair: after taking tinderbox + brass_key, shows windscreen-only variant (no stale item mention)", () => {
    const s = play(initStateForParserPack(index, 7), ["take_tinderbox", "take_brass_key"]);
    expect(s.current).toBe("river_stair");
    expect(desc(s)).toContain("horn windscreen leans forgotten");
    expect(desc(s)).not.toContain("tinderbox lies on the sill");
    expect(desc(s)).not.toContain("brass tally-key hangs on a nail");
  });

  it("(3) river_stair: after taking all three items, shows bare-sill variant (no stale item mention)", () => {
    const s = play(initStateForParserPack(index, 7), [
      "take_tinderbox",
      "take_brass_key",
      "take_horn_windscreen",
    ]);
    expect(s.current).toBe("river_stair");
    const d = desc(s);
    expect(d).not.toContain("tinderbox lies on the sill");
    expect(d).not.toContain("brass tally-key hangs on a nail");
    expect(d).not.toContain("horn windscreen leans forgotten");
    expect(d).toContain("the sill where the lighter's things lay is bare");
  });

  // watch_box
  it("(4) watch_box base: locked-cupboard text shown before store_key is taken", () => {
    const s = play(initStateForParserPack(index, 7), [
      "take_tinderbox",
      "take_brass_key",
      "go_north",
      "go_west",
    ]);
    expect(s.current).toBe("watch_box");
    expect(desc(s)).toContain("its little lock shaped for a tally-key");
    expect(desc(s)).not.toContain("hangs open and empty");
  });

  it("(5) watch_box: after taking store_key, shows open-and-empty variant", () => {
    const s = play(initStateForParserPack(index, 7), TO_STORE_KEY);
    expect(s.current).toBe("watch_box");
    expect(s.inventory).toContain("store_key");
    expect(desc(s)).toContain("wall-cupboard hangs open and empty");
    expect(desc(s)).not.toContain("its little lock shaped for a tally-key");
  });

  // lamp_walk
  it("(6) lamp_walk base: 'shut' text shown before store door is unlocked", () => {
    const s = play(initStateForParserPack(index, 7), [
      "take_tinderbox",
      "take_brass_key",
      "go_north",
    ]);
    expect(s.current).toBe("lamp_walk");
    expect(desc(s)).toContain("excise store stands shut to the east");
    expect(desc(s)).not.toContain("excise store stands open");
  });

  it("(7) lamp_walk: after unlocking the store door, shows 'open' variant (no stale 'shut' text)", () => {
    const s = play(initStateForParserPack(index, 7), [
      ...TO_STORE_KEY,
      "go_east",
      "unlock_store_door",
    ]);
    expect(s.current).toBe("lamp_walk");
    expect(s.flags["store_open"]).toBe(true);
    expect(desc(s)).toContain("excise store stands open to the east");
    expect(desc(s)).not.toContain("excise store stands shut");
  });

  // critical-path regression
  it("(8) critical path still wins ending_guided at 35/35 after the fix", () => {
    const s = play(initStateForParserPack(index, 7), WIN_ROUTE);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_guided");
    expect(buildParserObservation(index, s).score).toBe(35);
  });
});
