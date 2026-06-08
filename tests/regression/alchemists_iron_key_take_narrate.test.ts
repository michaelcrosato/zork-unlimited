/**
 * Regression (§15) for bug_0331 — taking the iron key produced no atmospheric
 * context, so the optional "grip iron key" steadiness beat in the Great Hall
 * appeared unexplained to players who skipped EXAMINE.
 *
 * Two consecutive blind playtesters (seed 47 → bug_0261; seed 7 → bug_0331)
 * flagged the `use_iron_key` ("grip iron key") action in the Great Hall as
 * "unexplained noise" or "a vestigial design stub." Its context — "the cold of
 * it climbs your wrist; before you set it to anything down here, you might grip
 * it a moment" — lives only in the iron key's EXAMINE description, not at take
 * time. Players who took the key without examining it reached the Great Hall
 * with no frame for why the action existed.
 *
 * Fix: added `take_effects` to iron_key with a brief atmospheric narrate that
 * fires on the first-class TAKE, priming the cold/grip context at the natural
 * pickup moment regardless of whether the player examines the key.
 *
 * Locked here:
 *   (1) STRUCTURAL — iron_key.take_effects exists and contains a narrate
 *       referencing the cold sensation
 *   (2) RUNTIME — taking the iron key emits a narration event referencing cold
 *   (3) One-shot: after taking, iron_key is not re-takeable (TAKE retired)
 *   (4) No score change on take (the +0 economy is unchanged; the 40-point
 *       capstone still lives on cure_administered)
 *   (5) Full cure route still wins ending_cured at 40/40 (no regression)
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
const pack = alch.compiled.pack;
const index = indexParserPack(pack);
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

/** Play ids and return the narration events emitted by the LAST step. */
function playCapture(s: GameState, ids: string[]): { state: GameState; narration: string } {
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

// Route to just before taking the iron key (study, strongbox open).
const TO_OPEN_STRONGBOX = [
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
];

describe("bug_0331 — iron key take_effects narrate primes the cold/grip context", () => {
  it("(1) STRUCTURAL — iron_key.take_effects contains a narrate referencing cold", () => {
    const ironKey = pack.objects.find((o) => o.id === "iron_key");
    expect(ironKey).toBeDefined();
    expect(ironKey!.take_effects).toBeDefined();
    const narrate = ironKey!.take_effects!.find((e): e is { narrate: string } => "narrate" in e);
    expect(narrate).toBeDefined();
    expect(narrate!.narrate.toLowerCase()).toContain("cold");
  });

  it("(2) RUNTIME — taking the iron key emits a narration event referencing cold", () => {
    const s0 = play(initStateForParserPack(index, 7), TO_OPEN_STRONGBOX);
    const { state: s1, narration } = playCapture(s0, ["take_iron_key"]);
    expect(s1.inventory).toContain("iron_key");
    expect(narration.toLowerCase()).toContain("cold");
  });

  it("(3) iron_key not re-takeable after pickup (take_effects one-shot)", () => {
    const s = play(initStateForParserPack(index, 7), [...TO_OPEN_STRONGBOX, "take_iron_key"]);
    expect(s.inventory).toContain("iron_key");
    const ids = enumerateActions(index, s).map((o) => o.id);
    expect(ids).not.toContain("take_iron_key");
  });

  it("(4) no score change on take — iron key awards 0 points (40-pt capstone stays on cure)", () => {
    const s0 = play(initStateForParserPack(index, 7), TO_OPEN_STRONGBOX);
    const scoreBefore = buildParserObservation(index, s0).score;
    const s1 = play(s0, ["take_iron_key"]);
    const scoreAfter = buildParserObservation(index, s1).score;
    expect(scoreAfter).toBe(scoreBefore);
  });

  it("(5) full cure route still wins ending_cured at 40/40", () => {
    const won = play(initStateForParserPack(index, 7), [
      ...TO_OPEN_STRONGBOX,
      "take_iron_key",
      "go_down",
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
