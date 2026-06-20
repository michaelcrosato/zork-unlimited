/**
 * Regression for bug_0374 - apothecaries_standard must not say the shop door is
 * clear while the north exit is still blocked.
 *
 * A fresh blind playtest (20260620T105659Z_apothecaries_standard_seed7) proved the
 * substitution at the counter, then saw the room text say "the door north stands
 * clear" even though the structured observation still had north in blocked_exits
 * until the sealed sample vials were taken from the dispensary. The prose and
 * legal-action state must agree.
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

const loaded = loadParserPackFile("content/parser/pack/apothecaries_standard.yaml");
if (!loaded.ok) throw new Error("apothecaries_standard must compile");
const pack = loaded.compiled.pack;
const index = indexParserPack(pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): GameState {
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
  }
  return s;
}

const PROVE_AT_COUNTER = [
  "read_dispensatory",
  "take_glass_drawstick",
  "use_glass_drawstick_on_suspect_vial",
  "use_glass_drawstick_on_dispensatory",
];

describe("bug_0374 - apothecaries_standard counter door prose matches exit state", () => {
  it("after proving substitution but before taking samples, the room does not claim north is clear", () => {
    const s = play(initStateForParserPack(index, 1), PROVE_AT_COUNTER);
    expect(s.current).toBe("shop_counter");
    expect(s.flags["proved_substitution"]).toBe(true);
    expect(s.inventory).not.toContain("sample_vials");

    const obs = buildParserObservation(index, s);
    expect(obs.description).toContain("comparison complete");
    expect(obs.description).toMatch(/sealed sample vials still need to be taken/i);
    expect(obs.description).not.toMatch(/door north stands clear/i);
    expect(obs.exits.map((e) => e.direction)).not.toContain("north");
    expect(obs.blocked_exits.find((e) => e.direction === "north")?.message).toMatch(
      /comparison result and the sealed sample vials/i,
    );
  });

  it("once samples are taken too, the room says north is clear and the blocked hint retires", () => {
    const s = play(initStateForParserPack(index, 1), [
      ...PROVE_AT_COUNTER,
      "go_east",
      "take_sample_vials",
      "go_west",
    ]);
    expect(s.inventory).toContain("sample_vials");

    const obs = buildParserObservation(index, s);
    expect(obs.description).toMatch(/door north stands clear/i);
    expect(obs.exits.map((e) => e.direction)).toContain("north");
    expect(obs.blocked_exits.some((e) => e.direction === "north")).toBe(false);
  });

  it("canonical completion is unchanged", () => {
    const won = play(initStateForParserPack(index, 1), [
      ...PROVE_AT_COUNTER,
      "go_east",
      "read_dispensing_ledger",
      "take_sample_vials",
      "go_west",
      "go_north",
    ]);
    expect(won.ended).toBe(true);
    expect(won.endingId).toBe("ending_presented");
    expect(buildParserObservation(index, won).score).toBe(pack.meta.max_score);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
