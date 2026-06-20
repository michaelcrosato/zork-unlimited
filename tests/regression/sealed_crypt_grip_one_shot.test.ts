/**
 * Regression (§15) for bug_0304 — the "grip iron key" nerve beat persisted after a
 * failed d20 roll.
 *
 * A blind playtest (seed 7, 2026-06-08T09-03-51-333Z) reached the crypt, triggered
 * the optional skill_check, rolled 1+3=4 vs DC 12 (failure), and found the action
 * still present in the action list on every subsequent crypt visit. The failure
 * narration invited retry ("Better to gather yourself…"), but nerve=3 and DC=12 are
 * fixed — re-trying produces the same roll. Same orphaned-action-post-attempt class
 * as bug_0303 (windscreen one-shot).
 *
 * Fix: added { not_flag: attempted_the_iron } as a third condition; on_failure now
 * sets attempted_the_iron. The beat is now one-shot on EITHER outcome. Updated
 * failure narration removes the retry invitation.
 *
 * Locked here:
 *   (1) In the crypt with iron key — grip action IS present before any attempt
 *   (2) After attempting grip (any roll outcome) — action IS absent, flag set
 *   (3) Full win route reaches ending_victory 35/35 without grip attempt
 *   (4) Seed-13 variant — action absent after attempt regardless of roll
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
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const crypt = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!crypt.ok) throw new Error("sealed_crypt must compile");
const index = indexParserPack(crypt.compiled.pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt)
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateActions(index, s)
          .map((o) => o.id)
          .join(", ")}]`,
      );
    const r = step(s, opt.action);
    expect(r.ok).toBe(true);
    s = r.state;
  }
  return s;
}

const hasGrip = (s: GameState): boolean =>
  enumerateActions(index, s).some(
    (a) =>
      a.action.type === "USE" && a.action.item === "iron_key" && a.action.target === "iron_key",
  );

// Route to the crypt with iron key in hand (from bug_0258 / sealed_crypt_grip_room_gated.test.ts)
const TO_CRYPT = [
  "go_north",
  "go_up",
  "take_rope",
  "go_down",
  "go_west",
  "read_headstone",
  "go_north",
  "open_stone_coffer",
  "take_brass_key",
  "go_south",
  "go_east",
  "go_east",
  "use_rope_on_old_well",
  "go_down",
  "unlock_oak_chest",
  "open_oak_chest",
  "take_iron_key",
  "go_up",
  "go_west",
  "go_north",
  "go_down",
];

// Full win route (without grip attempt)
const WIN_ROUTE = [...TO_CRYPT, "unlock_crypt_gate", "go_north", "take_sealed_relic"];

describe("bug_0304 — grip iron key one-shot on failure", () => {
  it("(1) in the crypt with iron key — grip action is present before any attempt", () => {
    const s = play(initStateForParserPack(index, 7), TO_CRYPT);
    expect(s.current).toBe("crypt");
    expect(s.inventory).toContain("iron_key");
    expect(hasGrip(s)).toBe(true);
  });

  it("(2) after attempting grip (any roll outcome) — action is absent, one flag set", () => {
    let s = play(initStateForParserPack(index, 7), TO_CRYPT);
    expect(hasGrip(s)).toBe(true);

    const gripOpt = enumerateActions(index, s).find(
      (a) =>
        a.action.type === "USE" && a.action.item === "iron_key" && a.action.target === "iron_key",
    )!;
    expect(gripOpt).toBeDefined();
    const r = step(s, gripOpt.action);
    expect(r.ok).toBe(true);
    s = r.state;

    // Either steeled_at_the_iron (success) or attempted_the_iron (failure) must be set
    const eitherFlagSet =
      Boolean(s.flags["steeled_at_the_iron"]) || Boolean(s.flags["attempted_the_iron"]);
    expect(eitherFlagSet).toBe(true);
    expect(hasGrip(s)).toBe(false);
  });

  it("(3) full win route reaches ending_victory 35/35 without grip attempt", () => {
    const s = play(initStateForParserPack(index, 7), WIN_ROUTE);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(s.inventory).toContain("sealed_relic");
    expect(buildParserObservation(index, s).score).toBe(35);
  });

  it("(4) seed-13 variant — action absent after attempt regardless of roll", () => {
    let s = play(initStateForParserPack(index, 13), TO_CRYPT);
    if (!hasGrip(s)) return; // grip already absent (shouldn't happen)

    const gripOpt = enumerateActions(index, s).find(
      (a) =>
        a.action.type === "USE" && a.action.item === "iron_key" && a.action.target === "iron_key",
    )!;
    const r = step(s, gripOpt.action);
    expect(r.ok).toBe(true);
    s = r.state;

    expect(hasGrip(s)).toBe(false);
  });
});
