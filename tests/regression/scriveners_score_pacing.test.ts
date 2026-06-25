/**
 * Regression for bug_0490: Scrivener's Proof front-loaded 20/45 points onto
 * taking the disputed deed, while Bassett's own memoranda named the fraud's
 * timeline and motive but awarded nothing.
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

function play(s: GameState, ids: string[]): GameState {
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
  }
  return s;
}

const score = (s: GameState): number => buildParserObservation(index, s).score;

describe("bug_0490 — Scrivener's Proof scores the memoranda instead of overpaying deed pickup", () => {
  it("taking the disputed deed secures evidence for 10 points, not nearly half the case score", () => {
    const s = play(initStateForParserPack(index, 7), ["take_disputed_deed"]);

    expect(s.inventory).toContain("disputed_deed");
    expect(s.flags["disputed_deed_taken"]).toBe(true);
    expect(score(s)).toBe(10);
  });

  it("reading Bassett's memoranda is a scored discovery and records that the timeline was found", () => {
    const s = play(initStateForParserPack(index, 7), [
      "go_east",
      "go_north",
      "read_private_memoranda",
    ]);

    expect(s.current).toBe("private_study");
    expect(s.flags["read_private_memoranda"]).toBe(true);
    expect(score(s)).toBe(10);
  });

  it("the core forensic win still works below max if the memoranda are skipped", () => {
    const s = play(initStateForParserPack(index, 7), [
      "read_client_complaint",
      "take_disputed_deed",
      "go_east",
      "read_enrolled_register",
      "go_north",
      "take_magnifier",
      "use_magnifier_on_disputed_deed",
      "go_south",
      "use_disputed_deed_on_enrolled_register",
      "go_west",
      "go_north",
    ]);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_filed");
    expect(score(s)).toBe(35);
  });

  it("reading the memoranda restores the full 45/45 route", () => {
    const s = play(initStateForParserPack(index, 7), [
      "read_client_complaint",
      "take_disputed_deed",
      "go_east",
      "read_enrolled_register",
      "go_north",
      "take_magnifier",
      "read_private_memoranda",
      "use_magnifier_on_disputed_deed",
      "go_south",
      "use_disputed_deed_on_enrolled_register",
      "go_west",
      "go_north",
    ]);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_filed");
    expect(score(s)).toBe(45);
  });
});
