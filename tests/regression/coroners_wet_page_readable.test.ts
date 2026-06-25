/**
 * Regression for bug_0430 - coroners_errand foregrounds Calloway's wet page,
 * so the writing desk must let the player read that page.
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

const loaded = loadParserPackFile("content/parser/pack/coroners_errand.yaml");
if (!loaded.ok) throw new Error("coroners_errand must compile");
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

const JUSTICE_ROUTE = [
  "take_commission",
  "go_east",
  "use_commission_on_body",
  "take_sealed_letter",
  "go_north",
  "read_ledger",
  "read_draft_contract",
  "go_south",
  "go_west",
  "go_west",
  "use_commission_on_muddy_boots",
  "go_east",
  "go_north",
  "use_commission_on_nightshade_bottle",
  "use_commission_on_medicine_chest",
  "go_south",
  "go_south",
];

describe("bug_0430 - coroners_errand wet page is readable", () => {
  it("offers and parses reading the wet page at the writing desk", () => {
    const s = play(initStateForParserPack(index, 7), ["go_east"]);
    const obs = buildParserObservation(index, s);

    expect(obs.description).toMatch(/ink still wet on the page/i);
    expect(enumerateActions(index, s).map((o) => o.id)).toContain("read_writing_desk");
    expect(parseCommand(index, s, "read page")).toEqual({
      ok: true,
      action: { type: "READ", target: "writing_desk" },
    });
  });

  it("reading the page explains the wet ink without awarding score or creating a required gate", () => {
    const s = play(initStateForParserPack(index, 7), ["go_east"]);
    const beforeScore = buildParserObservation(index, s).score;

    const result = step(s, { type: "READ", target: "writing_desk" });
    expect(result.ok).toBe(true);
    expect(result.state.flags["wet_page_read"]).toBe(true);
    expect(buildParserObservation(index, result.state).score).toBe(beforeScore);
    expect(
      result.events
        .filter((e): e is { type: "narration"; text: string } => e.type === "narration")
        .map((e) => e.text)
        .join(" "),
    ).toMatch(/Rendell must sign the lease by noon/i);
    expect(lookNarration(result.state, "writing_desk")).toMatch(/unfinished memorandum/i);
  });

  it("canonical full-score justice route remains unchanged without reading the page", () => {
    const s = play(initStateForParserPack(index, 7), JUSTICE_ROUTE);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_justice");
    expect(buildParserObservation(index, s).score).toBe(pack.meta.max_score);
    expect(s.flags["wet_page_read"]).toBeUndefined();
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
