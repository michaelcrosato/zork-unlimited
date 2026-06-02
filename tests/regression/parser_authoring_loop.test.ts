/**
 * Regression (§15) for bug_0139 — the author → validate → revise loop now covers
 * PARSER packs, not just CYOA (ULTRAPLAN §Week.4: the richest validators behind a
 * real authoring loop). Until this, `agents/authoring` only ever produced CYOA packs
 * (validateCyoa); the Zork-style parser validator — the project's richest, with
 * reference integrity, reachability, soft-lock, and win-reachability analysis — was
 * never exercised by the authoring pipeline.
 *
 * `runParserAdapter` reuses the same deterministic mock author + revise machinery as
 * `runAdapter`, routed through `validateParser`. Mirroring the CYOA mock, the parser
 * mock's first attempt ships a dangling exit target (EXIT_TARGET_MISSING); once the
 * validator's errors are fed back, it returns the corrected, green pack.
 *
 * This pins: (a) the first attempt is genuinely rejected by the parser validator with
 * EXIT_TARGET_MISSING — so the loop is decided by the validator, not the model (§16);
 * (b) the loop converges to a GREEN parser pack in a corrective round; (c) the
 * produced pack independently re-validates green; (d) it is actually playable to its
 * ending through the parser engine; (e) the CYOA path is unaffected by the shared-loop
 * refactor.
 */
import { describe, it, expect } from "vitest";
import { MockAuthorProvider } from "../../agents/authoring/mock_author.js";
import { loadEngineContract, runWriter } from "../../agents/authoring/writer.js";
import { runAdapter, runParserAdapter } from "../../agents/authoring/adapter.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { makeStep } from "../../src/core/engine.js";

const provider = new MockAuthorProvider();
const contract = loadEngineContract();
const PREMISE = "A keeper must relight a dead lighthouse before a ship wrecks.";

describe("parser authoring loop (bug_0139, §12.2–3)", () => {
  it("the parser validator REJECTS the first attempt with a dangling exit (EXIT_TARGET_MISSING)", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    // Cap at one round: no corrective round runs, so we see the raw first attempt.
    const first = await runParserAdapter(provider, { story, contract, maxRounds: 1 });
    expect(first.ok).toBe(false);
    expect(first.rounds).toBe(1);
    const codes = first.report.findings.filter((f) => f.severity === "error").map((f) => f.code);
    expect(codes).toContain("EXIT_TARGET_MISSING");
  });

  it("loops against the PARSER validator and converges to a GREEN pack", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    const result = await runParserAdapter(provider, { story, contract });
    expect(result.ok).toBe(true);
    expect(result.report.ok).toBe(true);
    // The mock's first attempt is broken, so convergence takes a correcting round.
    expect(result.rounds).toBeGreaterThanOrEqual(2);
    // The produced pack independently re-validates green through the parser validator.
    expect(validateParser(result.pack).ok).toBe(true);
    // It is a genuine parser pack: rooms + exits + a win condition, not a CYOA shape.
    expect(result.pack.rooms.length).toBeGreaterThanOrEqual(2);
    expect(result.pack.win_conditions.length).toBeGreaterThanOrEqual(1);
  });

  it("classifies every beat against the §11 adaptation labels", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    const result = await runParserAdapter(provider, { story, contract });
    const beatIds = story.beats.map((b) => b.id).sort();
    expect(result.classifications.map((c) => c.beat_id).sort()).toEqual(beatIds);
  });

  it("the authored parser pack is actually playable to an ending through the engine", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    const { pack } = await runParserAdapter(provider, { story, contract });
    const index = indexParserPack(pack);
    const step = makeStep(buildParserRules(index));
    let state = initStateForParserPack(index, 1);
    // Drive the route the adapter wired: climb north to the door, up to the lamp room.
    for (const id of ["go_north", "go_up"]) {
      const opt = enumerateActions(index, state).find((o) => o.id === id);
      expect(opt, `action ${id} should be legal in ${state.current}`).toBeTruthy();
      const r = step(state, opt!.action);
      expect(r.ok).toBe(true);
      state = r.state;
    }
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_saved");
  });

  it("the shared-loop refactor leaves the CYOA path green (runAdapter unchanged)", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    const result = await runAdapter(provider, { story, contract });
    expect(result.ok).toBe(true);
    expect(result.rounds).toBeGreaterThanOrEqual(2);
    expect("scenes" in result.pack).toBe(true); // a CYOA pack, not a parser pack
  });
});
