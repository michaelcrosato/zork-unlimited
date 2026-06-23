/**
 * Regression for bug_0482 -- cellarmans_dark's cash-box fork should not read
 * like a checklist objective or preserve a perfect score.
 *
 * A fresh blind pass (blind-tester/reports/20260623T003003Z_cellarmans_dark_seed7.md)
 * found that the note's "DEED-BOX AND CASH" wording nudged players to retrieve
 * both boxes, while taking the cash after the deed still reported 35/35. The
 * theft branch is intended to be a visibly bad moral fork, not an alternate
 * perfect completion route.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  buildParserRules,
  indexParserPack,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { validateParser } from "../../src/validate/parser_validator.js";

const loaded = loadParserPackFile("content/parser/pack/cellarmans_dark.yaml");
if (!loaded.ok) throw new Error("cellarmans_dark must compile");
const pack = loaded.compiled.pack;
const index = indexParserPack(pack);
const step = makeStep(buildParserRules(index));

function playCapture(s: GameState, ids: string[]): { state: GameState; narration: string } {
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

function play(s: GameState, ids: string[]): GameState {
  return playCapture(s, ids).state;
}

const TO_LIT_VAULT_WITH_NOTE = [
  "go_down",
  "read_cellarman_note",
  "take_lamp",
  "take_tinderbox",
  "go_east",
  "take_oil_jar",
  "go_west",
  "use_oil_jar_on_lamp",
  "use_tinderbox_on_lamp",
  "go_west",
];

describe("bug_0482 -- cellarmans_dark frames and scores the cash-box fork as theft", () => {
  it("the note names the deed-box as the errand and the cash-box as explicitly not the errand", () => {
    const { narration } = playCapture(initStateForParserPack(index, 7), [
      "go_down",
      "read_cellarman_note",
    ]);

    expect(narration).toMatch(/deed-box in\s+the vault/i);
    expect(narration).toMatch(/cash-box beside it/i);
    expect(narration).toMatch(/not your\s+errand/i);
    expect(narration).not.toMatch(/deed-box and\s+cash in\s+the vault/i);
  });

  it("taking the cash before the deed reaches the theft ending below perfect score", () => {
    const stolen = play(initStateForParserPack(index, 7), [
      ...TO_LIT_VAULT_WITH_NOTE,
      "take_cash_box",
    ]);
    const observation = buildParserObservation(index, stolen);

    expect(stolen.ended).toBe(true);
    expect(stolen.endingId).toBe("ending_absconded");
    expect(observation.score).toBe(5);
    expect(observation.score).toBeLessThan(pack.meta.max_score);
    expect(observation.description).toMatch(/Final score: 5 of 35/i);
  });

  it("taking the cash after the deed still loses the perfect score before ending", () => {
    const stolen = play(initStateForParserPack(index, 7), [
      ...TO_LIT_VAULT_WITH_NOTE,
      "take_deed_box",
      "take_cash_box",
    ]);
    const observation = buildParserObservation(index, stolen);

    expect(stolen.ended).toBe(true);
    expect(stolen.endingId).toBe("ending_absconded");
    expect(observation.score).toBe(25);
    expect(observation.score).toBeLessThan(pack.meta.max_score);
    expect(observation.description).toMatch(/Final score: 25 of 35/i);
  });

  it("the honest route still reaches the full-score recovered ending", () => {
    const recovered = play(initStateForParserPack(index, 7), [
      ...TO_LIT_VAULT_WITH_NOTE,
      "take_deed_box",
      "go_east",
      "go_up",
      "go_north",
    ]);

    expect(recovered.ended).toBe(true);
    expect(recovered.endingId).toBe("ending_recovered");
    expect(buildParserObservation(index, recovered).score).toBe(pack.meta.max_score);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
