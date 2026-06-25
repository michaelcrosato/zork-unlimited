/**
 * Regression for bug_0381: The Gauger's Register's bribe purse used to warn
 * "not safe to leave behind; not safe to take" while TAKE immediately ended the
 * game as bribery. A good-faith player could read that as "take it as evidence."
 *
 * The purse now exposes the loose-leaf evidence through READ, and its examine
 * text makes TAKE mean pocketing bait-money, not preserving evidence.
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

function narrationFor(s: GameState, action: Parameters<typeof resolveParserAction>[2]): string {
  const res = resolveParserAction(index, s, action);
  const effect = res?.effects.find((e) => "narrate" in e) as { narrate: string } | undefined;
  if (!effect) throw new Error(`no narration for ${JSON.stringify(action)}`);
  return effect.narrate;
}

describe("bug_0381 — gaugers_register bribe purse is readable evidence, not an ambush", () => {
  it("offers a harmless READ action for the loose-leaf evidence", () => {
    const inOffice = play(initStateForParserPack(index, 7), ["go_north"]).state;

    expect(enumerateActions(index, inOffice).map((o) => o.id)).toContain("read_bribe_purse");

    const { state, narration } = play(inOffice, ["read_bribe_purse"]);
    expect(state.ended).toBe(false);
    expect(state.endingId).toBeNull();
    expect(state.inventory).not.toContain("bribe_purse");
    expect(state.vars["score"] ?? 0).toBe(0);
    expect(narration).toMatch(/loose leaf names six months/i);
    expect(narration).toMatch(/coin is the trap/i);
  });

  it("examining the purse telegraphs that TAKE means pocketing bribe money", () => {
    const inOffice = play(initStateForParserPack(index, 7), ["go_north"]).state;
    const examine = narrationFor(inOffice, { type: "LOOK", target: "bribe_purse" });

    expect(examine).toMatch(/paper can be slipped free as evidence/i);
    expect(examine).toMatch(/purse is bait/i);
    expect(examine).toMatch(/Pocket it/i);
    expect(examine).not.toMatch(/Not safe to leave behind; not safe to take/i);
  });

  it("taking the purse still deliberately reaches the bribery ending", () => {
    const inOffice = play(initStateForParserPack(index, 7), ["go_north"]).state;
    const { state, narration } = play(inOffice, ["take_bribe_purse"]);

    expect(narration).toMatch(/You pocket the purse/i);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_bribed");
    expect(buildParserObservation(index, state).ending?.death).toBe(false);
  });

  it("the pack validates cleanly", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
