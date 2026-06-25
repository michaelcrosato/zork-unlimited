/**
 * Regression for bug_0382: the horn windscreen looked like an important tool but
 * behaved like an orphaned optional skill-check. It is now a real final-lighting
 * precondition, with no standalone `steady windscreen` roll left to distract the
 * player from the actual solve.
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
const pack = loaded.compiled.pack;
const index = indexParserPack(pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): { state: GameState; narration: string } {
  let narration = "";
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt) {
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateActions(index, s)
          .map((o) => o.id)
          .join(", ")}]`,
      );
    }
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

const ROUTE_TO_FILLED_FONT_WITHOUT_SCREEN = [
  "read_night_notice",
  "take_tinderbox",
  "take_brass_key",
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
];

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

describe("bug_0382 — horn windscreen is required for lighting, not an orphaned skill-check", () => {
  it("the windscreen is quest-critical and has no standalone steady skill-check action", () => {
    const horn = pack.objects.find((o) => o.id === "horn_windscreen")!;

    expect(horn.takeable).toBe(true);
    expect(horn.quest_critical).toBe(true);
    expect(horn.description).toMatch(/need it when you strike the great lamp/i);
    expect(horn.interactions).toHaveLength(0);
    expect(JSON.stringify(pack)).not.toContain("steadied_the_flame");
    expect(JSON.stringify(pack)).not.toContain("attempted_windscreen");
    expect(pack.meta.vars_init).not.toHaveProperty("steadiness");

    const carrying = play(initStateForParserPack(index, 7), ["take_horn_windscreen"]).state;
    expect(actionIds(carrying)).not.toContain("use_horn_windscreen");
  });

  it("a filled lamp cannot be lit until the player has the windscreen", () => {
    const { state } = play(initStateForParserPack(index, 7), ROUTE_TO_FILLED_FONT_WITHOUT_SCREEN);
    const obs = buildParserObservation(index, state);

    expect(state.current).toBe("harbour_head");
    expect(state.flags["font_filled"]).toBe(true);
    expect(state.inventory).not.toContain("horn_windscreen");
    expect(obs.description).toMatch(/horn windscreen/i);
    expect(obs.available_actions.map((a) => a.id)).not.toContain("use_tinderbox_on_harbour_lamp");
  });

  it("with the windscreen in hand, the light action appears and pays off the prop in narration", () => {
    const { state } = play(initStateForParserPack(index, 7), [
      "take_horn_windscreen",
      ...ROUTE_TO_FILLED_FONT_WITHOUT_SCREEN,
    ]);
    expect(state.inventory).toContain("horn_windscreen");
    expect(actionIds(state)).toContain("use_tinderbox_on_harbour_lamp");

    const lit = play(state, ["use_tinderbox_on_harbour_lamp"]);
    expect(lit.narration).toMatch(/horn windscreen/i);
    expect(lit.state.flags["lamp_lit"]).toBe(true);
    expect(buildParserObservation(index, lit.state).score).toBe(35);
  });

  it("the full solve now wins 35/35 through the windscreen", () => {
    const { state } = play(initStateForParserPack(index, 7), WIN_ROUTE);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_guided");
    expect(buildParserObservation(index, state).score).toBe(35);
  });
});
