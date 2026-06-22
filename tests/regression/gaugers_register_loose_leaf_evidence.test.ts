/**
 * Regression for bug_0435 - gaugers_register told players the loose leaf was evidence
 * but only let them take the whole bribe purse.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { parseCommand } from "../../src/parser/command_map.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  buildParserRules,
  indexParserPack,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { validateParser } from "../../src/validate/parser_validator.js";

const loaded = loadParserPackFile("content/parser/pack/gaugers_register.yaml");
if (!loaded.ok) throw new Error("gaugers_register must compile");
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

const start = (): GameState => initStateForParserPack(index, 7);

describe("bug_0435 - gaugers_register loose bribe leaf is safe evidence", () => {
  it("offers a separate takeable leaf without aliasing it to the purse", () => {
    const office = play(start(), ["go_north"]).state;
    const ids = enumerateActions(index, office).map((o) => o.id);

    expect(ids).toContain("take_loose_leaf");
    expect(ids).toContain("take_bribe_purse");
    expect(parseCommand(index, office, "take leaf")).toEqual({
      ok: true,
      action: { type: "TAKE", item: "loose_leaf" },
    });
  });

  it("lets the player take the paper while leaving the bribe money behind", () => {
    const { state, narration } = play(start(), ["go_north", "take_loose_leaf"]);

    expect(state.ended).toBe(false);
    expect(state.inventory).toContain("loose_leaf");
    expect(state.inventory).not.toContain("bribe_purse");
    expect(narration).toMatch(/coin stays on the table/i);
    expect(buildParserObservation(index, state).score).toBe(0);
  });

  it("keeps the immediate purse ending truthful when the leaf was never taken", () => {
    const { state } = play(start(), ["go_north", "take_bribe_purse"]);
    const ending = buildParserObservation(index, state).ending;

    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_bribed");
    expect(state.inventory).not.toContain("loose_leaf");
    expect(ending?.text).toMatch(/still lying where you left it on the table/i);
    expect(ending?.text).not.toMatch(/loose leaf was in your coat/i);
  });

  it("keeps the purse ending truthful when the player took the leaf and then the money", () => {
    const { state } = play(start(), ["go_north", "take_loose_leaf", "take_bribe_purse"]);
    const ending = buildParserObservation(index, state).ending;

    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_bribed");
    expect(state.inventory).toContain("loose_leaf");
    expect(ending?.text).toMatch(/loose leaf was in your coat/i);
    expect(ending?.text).toMatch(/so was the purse/i);
  });

  it("lets the honest win carry the loose leaf as supporting evidence", () => {
    const { state } = play(start(), [
      "go_north",
      "read_duty_ledger",
      "take_loose_leaf",
      "take_marked_stave",
      "use_marked_stave_on_watchman",
      "go_north",
      "read_hayman_seal",
      "take_gauge_register",
      "go_west",
    ]);
    const obs = buildParserObservation(index, state);

    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_exposed");
    expect(obs.score).toBe(pack.meta.max_score);
    expect(obs.ending?.text).toMatch(/loose leaf of side-payments/i);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
