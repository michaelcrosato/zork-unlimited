/**
 * Regression (§15) for bug_0001 — the one-way crypt soft-lock.
 *
 * The pre-fix pack let a player descend into the crypt with no way back up. The
 * §12.8 roster surfaced it (17/24 runs wedged in the crypt). The fix makes the
 * descent reversible (an `up` exit) and the SOFTLOCK_QUEST_ITEM validator check
 * now rejects the one-way variant. This test pins both: the broken variant is
 * rejected and leaves the player wedged, while the shipped pack stays escapable.
 *
 * See traces/bugs/bug_0001_crypt_one_way_softlock.yaml.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { indexParserPack, buildParserRules, initStateForParserPack } from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { makeStep } from "../../src/core/engine.js";
import { runParserRoster } from "../../agents/parser_playtester.js";
import type { ParserPack } from "../../src/parser/schema.js";

const loaded = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!loaded.ok) throw new Error("sealed_crypt must compile");
const goodPack = loaded.compiled.pack;

/** The pre-fix variant: crypt is a one-way descent (no `up` exit). */
function oneWayCryptVariant(): ParserPack {
  const broken: ParserPack = structuredClone(goodPack);
  const crypt = broken.rooms.find((r) => r.id === "crypt")!;
  crypt.exits = crypt.exits.filter((e) => e.direction !== "up");
  return broken;
}

/** Descend forest → nave → crypt and return the legal MOVE action ids there. */
function moveActionsInCrypt(pack: ParserPack): string[] {
  const index = indexParserPack(pack);
  const step = makeStep(buildParserRules(index));
  let state = initStateForParserPack(index, 1);
  for (const id of ["go_north", "go_north", "go_down"]) {
    const opt = enumerateActions(index, state).find((o) => o.id === id);
    if (!opt) throw new Error(`could not ${id} from ${state.current}`);
    state = step(state, opt.action).state;
  }
  expect(state.current).toBe("crypt");
  return enumerateActions(index, state).filter((o) => o.action.type === "MOVE").map((o) => o.id);
}

describe("bug_0001: one-way crypt soft-lock", () => {
  it("the validator rejects the one-way-crypt variant (soft-lock guard bites)", () => {
    const report = validateParser(oneWayCryptVariant());
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.code === "SOFTLOCK_QUEST_ITEM" || f.code === "SOFTLOCK")).toBe(true);
  });

  it("the broken variant wedges the player in the crypt (no exit)", () => {
    expect(moveActionsInCrypt(oneWayCryptVariant())).toEqual([]);
  });

  it("the shipped pack keeps the crypt escapable (the fix)", () => {
    expect(moveActionsInCrypt(goodPack)).toContain("go_up");
    // And the shipped pack validates clean.
    expect(validateParser(goodPack).ok).toBe(true);
  });

  it("no persona wedges in the crypt on the shipped pack", () => {
    const { records } = runParserRoster(goodPack, { seeds: [1, 2, 3] });
    expect(records.filter((r) => r.status === "stuck" && r.last_room === "crypt")).toHaveLength(0);
  });
});
