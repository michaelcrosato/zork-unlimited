/**
 * Parser runtime behaviors (§8.4, §9.2): object location/visibility, containers,
 * locked exits + USE puzzles, modal dialogue, and win-on-entry — driven through
 * the legal-action API exactly as a player would.
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
import type { Action } from "../../src/api/types.js";

const loaded = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!loaded.ok) throw new Error("compile");
const index = indexParserPack(loaded.compiled.pack);
const step = makeStep(buildParserRules(index));

const ids = (s: GameState): string[] => enumerateActions(index, s).map((o) => o.id);
function doId(s: GameState, id: string): GameState {
  const opt = enumerateActions(index, s).find((o) => o.id === id);
  if (!opt) throw new Error(`"${id}" not legal in ${s.current}; have ${ids(s).join(",")}`);
  const r = step(s, opt.action);
  expect(r.ok).toBe(true);
  return r.state;
}
function go(s: GameState, path: string[]): GameState {
  return path.reduce(doId, s);
}

describe("parser object model", () => {
  it("taking an object removes it from the room; dropping puts it back here", () => {
    let s = go(initStateForParserPack(index, 1), ["go_north", "go_up"]); // bell_tower
    expect(buildParserObservation(index, s).visible_objects.map((o) => o.id)).toContain("rope");
    s = doId(s, "take_rope");
    expect(s.inventory).toContain("rope");
    expect(buildParserObservation(index, s).visible_objects.map((o) => o.id)).not.toContain("rope");
    // Drop it in the bell tower; it becomes visible here again.
    s = doId(s, "drop_rope");
    expect(s.inventory).not.toContain("rope");
    expect(buildParserObservation(index, s).visible_objects.map((o) => o.id)).toContain("rope");
  });

  it("a closed container hides its contents until opened", () => {
    let s = go(initStateForParserPack(index, 1), ["go_north", "go_west", "go_north"]); // mausoleum
    expect(buildParserObservation(index, s).visible_objects.map((o) => o.id)).not.toContain(
      "brass_key",
    );
    expect(ids(s)).not.toContain("take_brass_key");
    s = doId(s, "open_stone_coffer");
    expect(buildParserObservation(index, s).visible_objects.map((o) => o.id)).toContain(
      "brass_key",
    );
    s = doId(s, "take_brass_key");
    expect(s.inventory).toContain("brass_key");
  });

  it("a locked container offers neither unlock (no key) nor open until its key is held", () => {
    // Reach well_bottom (rope puzzle) WITHOUT the brass key: the chest is locked,
    // and since legal ⊇ executable, neither unlock (no key) nor open is offered.
    let s = initStateForParserPack(index, 1);
    s = go(s, [
      "go_north",
      "go_up",
      "take_rope",
      "go_down",
      "go_east",
      "use_rope_on_old_well",
      "go_down",
    ]); // well_bottom
    expect(s.current).toBe("well_bottom");
    expect(ids(s)).not.toContain("unlock_oak_chest"); // no brass key in hand
    expect(ids(s)).not.toContain("open_oak_chest"); // locked ⇒ cannot open yet
    // Hand the player the brass key and the unlock action appears.
    s = { ...s, inventory: [...s.inventory, "brass_key"] };
    expect(ids(s)).toContain("unlock_oak_chest");
  });

  it("a USE puzzle unlocks a previously-locked exit", () => {
    let s = go(initStateForParserPack(index, 1), [
      "go_north",
      "go_up",
      "take_rope",
      "go_down",
      "go_east",
    ]); // old_well, holding rope
    expect(ids(s)).not.toContain("go_down"); // locked until rope tied
    s = doId(s, "use_rope_on_old_well");
    expect(s.flags["rope_attached_to_well"]).toBe(true);
    expect(ids(s)).toContain("go_down");
  });
});

describe("parser dialogue", () => {
  it("is modal: TALK opens topics, ASK advances, an end-topic leaves", () => {
    let s = go(initStateForParserPack(index, 1), ["go_north", "go_north"]); // chapel_nave (sexton)
    expect(ids(s)).toContain("talk_sexton");
    s = doId(s, "talk_sexton");
    // Modal: only ASK topics are offered now.
    expect(enumerateActions(index, s).every((o) => (o.action as Action).type === "ASK")).toBe(true);
    s = doId(s, "ask_crypt"); // sets the rumor flag
    expect(s.flags["heard_crypt_rumor"]).toBe(true);
    expect(buildParserObservation(index, s).dialogue).not.toBeNull();
    s = doId(s, "ask_bye");
    expect(buildParserObservation(index, s).dialogue).toBeNull(); // back to the room
    expect(ids(s)).toContain("go_south");
  });
});

describe("parser win condition", () => {
  it("entering the catacombs ends the game with ending_victory", () => {
    const walkthrough = [
      "go_north",
      "go_up",
      "take_rope",
      "go_down",
      "go_west",
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
      "use_iron_key_on_crypt_gate",
      "go_north",
    ];
    const s = go(initStateForParserPack(index, 1), walkthrough);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(s.current).toBe("catacombs");
  });
});
