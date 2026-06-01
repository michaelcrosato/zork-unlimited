/**
 * Regression (§15) for bug_0013 — the Stage-3 score system was declared-capable but
 * dead in the parser pack The Sealed Crypt: score stayed 0 from start through the
 * victory ending despite the player solving every puzzle.
 *
 * A blind MCP playtester (ai-runs/2026-06-01T06-51-15-149Z, seed 73) solved the
 * crypt to ending_victory and, as one of its two concrete findings (report §5),
 * flagged the score as "dead weight": meta.max_score was 0 and no inc_var award
 * existed, so the `score` the observation surfaces never moved off 0 — a present
 * but unused feedback system that reads as broken/placeholder.
 *
 * No engine change is needed: Stage-3 scoring (ParserMetaSchema.max_score, the
 * conventional `score` var, inc_var awards, and the validator's SCORE_UNREACHABLE
 * check) already exists and is used by alchemists_tower. This pack simply had not
 * opted in. The fix is pure CONTENT — meta.max_score: 35 plus three one-time gated
 * milestone awards mirroring alchemists' 5/10/20 shape:
 *   +5  read the headstone clue   (READ headstone, gated not_flag read_headstone)
 *   +10 solve the well            (USE rope on old_well, gated not_flag rope_attached_to_well)
 *   +20 unlock the catacombs gate (USE iron_key on crypt_gate, gated not_flag catacombs_open)
 * No flags' meaning, items, exits, gating, or reachable endings change — only the
 * score var now accrues.
 *
 * Locked here:
 *   (1) score is 0 at start, rises 0→5→15→35 across the three milestones, and is
 *       35/35 at the victory ending;
 *   (2) each award is one-time — re-visiting the milestone room does not re-award
 *       (the gating condition has flipped); the headstone READ in particular drops
 *       out of the legal-action set after the first read, so the +5 cannot be farmed;
 *   (3) meta.max_score is 35 and the pack validates (so SCORE_UNREACHABLE cannot
 *       fire — the declared max is genuinely awardable).
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import { indexParserPack, buildParserRules, initStateForParserPack } from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const crypt = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!crypt.ok) throw new Error("sealed_crypt must compile");
const pack = crypt.compiled.pack;
const index = indexParserPack(pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt) throw new Error(`"${id}" not legal in ${s.current}: [${enumerateActions(index, s).map((o) => o.id).join(", ")}]`);
    const r = step(s, opt.action);
    expect(r.ok).toBe(true);
    s = r.state;
  }
  return s;
}

const score = (s: GameState): number => buildParserObservation(index, s).score;
const actionIds = (s: GameState): string[] => enumerateActions(index, s).map((o) => o.id);

// The full solution path, milestones annotated.
const TO_HEADSTONE = ["go_north", "go_west"];
const READ = ["read_headstone"]; // +5
const TO_WELL_TIE = ["go_north", "open_stone_coffer", "take_brass_key", "go_south", "go_east", "go_up", "take_rope", "go_down", "go_east"];
const TIE = ["use_rope_on_old_well"]; // +10
const TO_GATE = ["go_down", "unlock_oak_chest", "open_oak_chest", "take_iron_key", "go_up", "go_west", "go_north", "go_down"];
const OPEN_GATE = ["use_iron_key_on_crypt_gate"]; // +20
const WIN = ["go_north"];

describe("bug_0013 — Sealed Crypt scoring accrues 0→5→15→35 across the three milestones", () => {
  it("score climbs at each milestone and is full (35/35) at the victory ending", () => {
    let s = initStateForParserPack(index, 73);
    expect(score(s)).toBe(0);

    s = play(s, TO_HEADSTONE);
    expect(score(s)).toBe(0);
    s = play(s, READ);
    expect(score(s)).toBe(5);

    s = play(s, TO_WELL_TIE);
    expect(score(s)).toBe(5);
    s = play(s, TIE);
    expect(score(s)).toBe(15);

    s = play(s, TO_GATE);
    expect(score(s)).toBe(15);
    s = play(s, OPEN_GATE);
    expect(score(s)).toBe(35);

    s = play(s, WIN);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(score(s)).toBe(35);
    expect(score(s)).toBe(pack.meta.max_score);
  });

  it("the headstone +5 is one-time: reading drops the READ action so it cannot be farmed", () => {
    let s = play(initStateForParserPack(index, 73), TO_HEADSTONE);
    expect(actionIds(s)).toContain("read_headstone");

    s = play(s, READ);
    expect(score(s)).toBe(5);
    // The READ interaction is gated not_flag read_headstone, so the whole READ
    // action is no longer legal once the clue has been read — no second +5.
    expect(actionIds(s)).not.toContain("read_headstone");
    expect(s.flags["read_headstone"]).toBe(true);
  });

  it("re-tying the well does not re-award: the milestone gate has flipped", () => {
    let s = play(initStateForParserPack(index, 73), [...TO_HEADSTONE, ...READ, ...TO_WELL_TIE, ...TIE]);
    expect(score(s)).toBe(15);
    // use_rope_on_old_well is gated not_flag rope_attached_to_well; after tying, the
    // interaction is gone, so the +10 cannot be repeated by returning to the well.
    expect(actionIds(s)).not.toContain("use_rope_on_old_well");
  });

  it("meta.max_score is 35 and the pack validates (SCORE_UNREACHABLE cannot fire)", () => {
    expect(pack.meta.max_score).toBe(35);
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings.find((f) => f.code === "SCORE_UNREACHABLE")).toBeUndefined();
  });
});
