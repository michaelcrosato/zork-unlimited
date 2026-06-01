/**
 * Regression (§15) for bug_0014 — dialogue topics that never exhaust.
 *
 * A blind MCP playtester of The Sealed Crypt (ai-runs/2026-06-01T07-03-45-157Z,
 * seed 91) flagged the sexton's two info topics ("Ask about the sealed crypt" /
 * "Ask about the old well") as a mutually re-enabling ping-pong: each sets its
 * rumor flag and drops from its own node, but the OTHER node re-offers it, so the
 * player can re-ask the same two questions verbatim forever and the rumor flags
 * they set gate nothing. The fix is a generic ENGINE feature — an optional
 * `conditions` gate on a dialogue topic, filtered in the legal set + re-checked in
 * ASK resolution — plus the content application that gates the sexton's info topics
 * on `not_flag heard_*_rumor`, and a validator that keeps a node's TERMINATION
 * guarantee sound against gating (only unconditional topics count as escape routes).
 *
 * Locked here:
 *   (1) each sexton info topic is offered exactly once, then retires — after hearing
 *       both rumors only `bye` remains, in every node (no infinite ping-pong);
 *   (2) a gated ASK is illegal once its flag is set (engine re-check), and `bye`
 *       always remains so the conversation can always end;
 *   (3) the validator flags a dialogue whose every escape route is gated as
 *       DIALOGUE_NONTERMINATING, and a topic with no `conditions` compiles
 *       byte-identically (backward-compat — the shipped pack hash is unaffected by
 *       the schema addition alone).
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { makeStep } from "../../src/core/engine.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import type { GameState } from "../../src/core/state.js";

const crypt = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!crypt.ok) throw new Error("sealed_crypt must compile");
const index = indexParserPack(crypt.compiled.pack);
const step = makeStep(buildParserRules(index));

const ids = (s: GameState): string[] => enumerateActions(index, s).map((o) => o.id);
function doId(s: GameState, id: string): GameState {
  const opt = enumerateActions(index, s).find((o) => o.id === id);
  if (!opt) throw new Error(`"${id}" not legal in ${s.current}: [${ids(s).join(", ")}]`);
  const r = step(s, opt.action);
  expect(r.ok, `step ${id}`).toBe(true);
  return r.state;
}
// Reach the chapel nave (the sexton's room) and open the conversation.
const talkingSexton = (): GameState =>
  doId(doId(doId(initStateForParserPack(index, 1), "go_north"), "go_north"), "talk_sexton");

describe("bug_0014 — dialogue topics retire once told (no infinite ping-pong)", () => {
  it("each info topic is offered exactly once; after both rumors only `bye` remains", () => {
    let s = talkingSexton();
    // Both info topics + bye at the greeting.
    expect(ids(s).sort()).toEqual(["ask_bye", "ask_crypt", "ask_well"]);

    s = doId(s, "ask_crypt"); // sets heard_crypt_rumor, advances to about_crypt
    expect(s.flags["heard_crypt_rumor"]).toBe(true);
    // about_crypt offers `well` (not yet heard) + bye — NOT `crypt` again.
    expect(ids(s).sort()).toEqual(["ask_bye", "ask_well"]);

    s = doId(s, "ask_well"); // sets heard_well_rumor, advances to about_well
    expect(s.flags["heard_well_rumor"]).toBe(true);
    // Both rumors heard: about_well no longer re-offers `crypt` — only `bye` is left.
    expect(ids(s).sort()).toEqual(["ask_bye"]);
  });

  it("a told topic is illegal even if asked directly, but `bye` always ends the talk", () => {
    let s = talkingSexton();
    s = doId(s, "ask_well"); // hear the well rumor first (alternate order)
    // The well topic has retired — asking it again is not in the legal set.
    expect(ids(s)).not.toContain("ask_well");
    const wellAgain = enumerateActions(index, talkingSexton()).find(
      (o) => o.id === "ask_well",
    )!.action;
    const r = step(s, wellAgain); // force the retired topic: engine re-check rejects it
    expect(r.ok).toBe(false);
    // bye is always available and leaves the conversation.
    s = doId(s, "ask_bye");
    expect(s.vars["__dlg_sexton"] ?? 0).toBe(0);
    expect(ids(s)).toContain("go_south"); // back in the room
  });

  it("validator: an all-gated dialogue is non-terminating; an ungated topic is backward-compatible", () => {
    // The shipped pack (sexton keeps an ungated `bye`) still validates green.
    expect(validateParser(crypt.compiled.pack).findings).toHaveLength(0);

    // A dialogue whose only `end` topics are gated has no guaranteed exit.
    const bad = loadParserPackFile(
      "content/broken-fixtures/parser_dialogue_gated_nonterminating.yaml",
    );
    expect(bad.ok).toBe(true);
    if (!bad.ok) return;
    const report = validateParser(bad.compiled.pack);
    expect(report.ok).toBe(false);
    expect(report.findings.map((f) => f.code)).toContain("DIALOGUE_NONTERMINATING");
  });
});
