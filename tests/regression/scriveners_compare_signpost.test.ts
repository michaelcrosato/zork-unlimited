/**
 * Regression for bug_0438: Scrivener's Proof hid the final `compare` action
 * behind `found_interlineation` without telling a player who had read the
 * enrolled copy why the obvious side-by-side comparison was not available yet.
 */
import { describe, expect, it } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  buildParserRules,
  indexParserPack,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/scriveners_proof.yaml");
if (!loaded.ok) throw new Error("scriveners_proof must compile");
const index = indexParserPack(loaded.compiled.pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): { state: GameState; narration: string } {
  let narration = "";
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((a) => a.id === id);
    if (!opt) {
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateActions(index, s)
          .map((a) => a.id)
          .join(", ")}]`,
      );
    }
    const result = step(s, opt.action);
    expect(result.ok).toBe(true);
    s = result.state;
    narration = result.events
      .filter((e): e is { type: "narration"; text: string } => e.type === "narration")
      .map((e) => e.text)
      .join(" ");
  }
  return { state: s, narration };
}

const ids = (s: GameState): string[] => enumerateActions(index, s).map((a) => a.id);

const READ_REGISTER_ROUTE = [
  "read_client_complaint",
  "take_disputed_deed",
  "go_east",
  "read_enrolled_register",
];

describe("bug_0438 — Scrivener's Proof signposts the magnifier before comparison", () => {
  it("reading the enrolled copy says the deed still needs the magnifier before comparison", () => {
    const read = play(initStateForParserPack(index, 7), READ_REGISTER_ROUTE);

    expect(read.narration).toMatch(/inspect the disputed deed through the magnifier/i);
    expect(read.narration).toMatch(/lay the two documents side by side/i);
    expect(ids(read.state)).not.toContain("use_disputed_deed_on_enrolled_register");
  });

  it("the deed room keeps that cue visible while compare is still gated", () => {
    const read = play(initStateForParserPack(index, 7), READ_REGISTER_ROUTE).state;
    const obs = buildParserObservation(index, read);

    expect(obs.description).toMatch(/deed itself needs the magnifier/i);
    expect(obs.description).toMatch(/side-by-side comparison/i);
  });

  it("the blocked north exit explains the missing proof instead of only saying compare", () => {
    const atDoor = play(initStateForParserPack(index, 7), [
      ...READ_REGISTER_ROUTE,
      "go_west",
    ]).state;
    const north = buildParserObservation(index, atDoor).blocked_exits.find(
      (exit) => exit.direction === "north",
    );

    expect(north?.message).toMatch(/wording differs/i);
    expect(north?.message).toMatch(/disputed deed still needs the magnifier/i);
  });

  it("after the magnifier discovery, compare appears and the full-score win remains intact", () => {
    const ready = play(initStateForParserPack(index, 7), [
      ...READ_REGISTER_ROUTE,
      "go_north",
      "take_magnifier",
      "read_private_memoranda",
      "use_magnifier_on_disputed_deed",
      "go_south",
    ]).state;

    const compare = enumerateActions(index, ready).find(
      (action) => action.id === "use_disputed_deed_on_enrolled_register",
    );
    expect(compare?.command).toBe("compare disputed deed with enrolled copy");

    const won = play(ready, [
      "use_disputed_deed_on_enrolled_register",
      "go_west",
      "go_north",
    ]).state;
    expect(won.ended).toBe(true);
    expect(won.endingId).toBe("ending_filed");
    expect(buildParserObservation(index, won).score).toBe(45);
  });
});
