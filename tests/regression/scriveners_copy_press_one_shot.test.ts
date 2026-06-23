/**
 * Regression for bug_0384: Scrivener's Proof's optional copy-press check was
 * retryable after a failed roll, with no state change and no clue that it was an
 * optional tension beat. A blind playtest read it as a dead or unfinished mechanic.
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

const loaded = loadParserPackFile("content/parser/pack/scriveners_proof.yaml");
if (!loaded.ok) throw new Error("scriveners_proof must compile");
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

const ids = (s: GameState): string[] => enumerateActions(index, s).map((o) => o.id);

const ROUTE_TO_PRESS = [
  "read_client_complaint",
  "take_disputed_deed",
  "take_penknife",
  "go_east",
  "read_enrolled_register",
];

describe("bug_0384 — scriveners copy-press check retires after failure", () => {
  it("failure marks the optional press check spent and removes the retry action", () => {
    const atPress = play(initStateForParserPack(index, 2), ROUTE_TO_PRESS).state;
    expect(ids(atPress)).toContain("use_penknife_on_copy_press");

    const failed = play(atPress, ["use_penknife_on_copy_press"]);

    expect(failed.narration).toMatch(/steadiness check: d20 4 \+ 3 = 7 vs 11 . failure/i);
    expect(failed.narration).toMatch(/deed, the glass, and the enrolled copy/i);
    expect(failed.state.flags["press_checked"]).toBe(true);
    expect(failed.state.ended).toBe(false);
    expect(ids(failed.state)).not.toContain("use_penknife_on_copy_press");
  });

  it("the normal evidence route still wins 45/45 after the failed optional check", () => {
    const route = [
      ...ROUTE_TO_PRESS,
      "use_penknife_on_copy_press",
      "go_north",
      "take_magnifier",
      "read_private_memoranda",
      "go_south",
      "use_magnifier_on_disputed_deed",
      "use_disputed_deed_on_enrolled_register",
      "go_west",
      "go_north",
    ];
    const { state } = play(initStateForParserPack(index, 2), route);

    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_filed");
    expect(buildParserObservation(index, state).score).toBe(45);
  });

  it("the pack validates cleanly", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
