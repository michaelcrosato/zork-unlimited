/**
 * Regression for bug_0485 - dyers_weight's bribe fold must be an explicit
 * pocketing branch, not an ordinary TAKE that looks like evidence pickup.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { parseCommand } from "../../src/parser/command_map.js";
import { enumerateActions, resolveParserAction } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  buildParserRules,
  indexParserPack,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { validateParser } from "../../src/validate/parser_validator.js";

const loaded = loadParserPackFile("content/parser/pack/dyers_weight.yaml");
if (!loaded.ok) throw new Error("dyers_weight must compile");
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

function lookNarration(s: GameState, target: string): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target });
  const effect = res?.effects[0];
  if (!effect || !("narrate" in effect)) throw new Error(`no look narration for ${target}`);
  return effect.narrate;
}

const TO_STORE_ROOM = ["go_east"];
const FULL_SCORE_ROUTE = [
  "read_order_ledger",
  "take_indigo_cakes",
  "take_copper_tongs",
  "go_east",
  "take_acid_vial",
  "use_copper_tongs_on_vitriol_jar",
  "use_acid_vial_on_chalk_casks",
  "go_west",
  "use_acid_vial_on_dye_vat",
  "go_north",
];

describe("bug_0485 - dyers_weight payment fold is an explicit branch", () => {
  it("offers pocketing the fold, not taking it, in the store room", () => {
    const s = play(initStateForParserPack(index, 7), TO_STORE_ROOM);
    const actions = enumerateActions(index, s);

    expect(actions.some((a) => a.id === "take_payment_fold")).toBe(false);
    expect(actions.some((a) => a.command === "take payment fold")).toBe(false);

    const pocket = actions.find((a) => a.id === "use_payment_fold");
    expect(pocket).toBeDefined();
    expect(pocket?.command).toBe("pocket payment fold");
    expect(pocket?.action).toEqual({ type: "USE", target: "payment_fold" });
  });

  it("keeps the bribe warning visible before the pocket command", () => {
    const s = play(initStateForParserPack(index, 7), TO_STORE_ROOM);

    expect(lookNarration(s, "payment_fold")).toMatch(/For the Searcher's Patience/i);
    expect(lookNarration(s, "payment_fold")).toMatch(/Ruinous to pocket/i);
  });

  it("parses and executes the natural pocket command as the bought ending", () => {
    const s = play(initStateForParserPack(index, 7), TO_STORE_ROOM);
    const parsed = parseCommand(index, s, "pocket payment");
    expect(parsed).toEqual({ ok: true, action: { type: "USE", target: "payment_fold" } });

    const result = step(s, parsed.ok ? parsed.action : { type: "LOOK" });
    expect(result.ok).toBe(true);
    expect(result.state.ended).toBe(true);
    expect(result.state.endingId).toBe("ending_bought");
    expect(result.state.inventory).not.toContain("payment_fold");
    expect(buildParserObservation(index, result.state).ending?.text).toMatch(/bought/i);
  });

  it("canonical full-score seizure remains unchanged", () => {
    const s = play(initStateForParserPack(index, 7), FULL_SCORE_ROUTE);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_seized");
    expect(buildParserObservation(index, s).score).toBe(pack.meta.max_score);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
