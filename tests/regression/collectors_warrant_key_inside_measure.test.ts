/**
 * Regression (§15) for bug_0400 — The Collector's Warrant told the player the
 * strong-room key was kept inside the gallon copper, but the key itself was a
 * top-level visible object in the salt-store.
 *
 * A blind playtest (2026-06-21, seed 7) caught the mismatch: the clue primed a
 * search/open step, while the mechanics let the player take the key without
 * touching the measure. The fix uses the parser's existing container model so
 * the gallon copper actually contains the key.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions, resolveParserAction } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/collectors_warrant.yaml");
if (!loaded.ok) throw new Error("collectors_warrant must compile");
const pack = loaded.compiled.pack;
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

const actionIds = (s: GameState): string[] => enumerateActions(index, s).map((o) => o.id);
const visibleIds = (s: GameState): string[] =>
  buildParserObservation(index, s).visible_objects.map((o) => o.id);

function examineNarration(s: GameState, target: string): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target });
  const narrate = res?.effects.find((e): e is { narrate: string } => "narrate" in e);
  return narrate?.narrate ?? "";
}

describe("bug_0400 — collectors_warrant key is actually inside the salt measure", () => {
  it("before opening the gallon copper, the key is not visible or takeable", () => {
    const s = play(initStateForParserPack(index, 7), ["go_east"]);

    expect(visibleIds(s)).toContain("salt_measure");
    expect(visibleIds(s)).not.toContain("strong_key");
    expect(actionIds(s)).toContain("open_salt_measure");
    expect(actionIds(s)).toContain("examine_salt_measure");
    expect(actionIds(s)).not.toContain("take_strong_key");
    expect(examineNarration(s, "salt_measure")).toContain("opening the measure");
  });

  it("opening the measure reveals the key, and taking it still awards exactly +15", () => {
    let s = play(initStateForParserPack(index, 7), ["go_east"]);
    const before = buildParserObservation(index, s).score;

    s = play(s, ["open_salt_measure"]);
    expect(s.objectState.salt_measure?.open).toBe(true);
    expect(visibleIds(s)).toContain("strong_key");
    expect(actionIds(s)).toContain("take_strong_key");
    expect(examineNarration(s, "salt_measure")).toContain("small iron key");

    s = play(s, ["take_strong_key"]);
    expect(s.inventory).toContain("strong_key");
    expect(buildParserObservation(index, s).score - before).toBe(15);
    expect(examineNarration(s, "salt_measure")).toContain("open and empty");
  });

  it("the quiet route remains a full-score recovery route", () => {
    const s = play(initStateForParserPack(index, 7), [
      "read_collector_ledger",
      "go_east",
      "open_salt_measure",
      "take_strong_key",
      "go_west",
      "use_strong_key_on_strong_room_door",
      "go_west",
      "take_salt_warrant",
      "go_east",
      "go_north",
    ]);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_recovered");
    expect(buildParserObservation(index, s).score).toBe(pack.meta.max_score);
    expect(validateParser(pack).findings).toHaveLength(0);
  });
});
