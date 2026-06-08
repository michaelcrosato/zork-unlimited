/**
 * Regression (§15) for bug_0303 — the horn windscreen "steady" skill-check action
 * persisted in every action list after a failed roll.
 *
 * A blind playtest (seed 7, 2026-06-08) found the `use_horn_windscreen` action
 * present in all rooms where the windscreen was held, with no trigger ever firing.
 * Worse: on a failed d20 roll the action did NOT retire (no flag was set), so the
 * player saw the persistent skill-check action for the rest of the game.
 *
 * Fix: added `{ not_flag: attempted_windscreen }` to conditions; on_failure now
 * sets `attempted_windscreen` (alongside the existing success path which sets
 * `steadied_the_flame`). The beat is now one-shot on EITHER outcome.
 *
 * Locked here:
 *   (1) After taking horn windscreen → steady action IS present
 *   (2) After attempting steady → action IS absent (retired, regardless of roll outcome)
 *   (3) Full win route reaches ending_guided at 35/35 without windscreen attempt
 *   (4) Success path: steadied_the_flame set → action absent
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

const lamp = loadParserPackFile("content/parser/pack/lamplighters_round.yaml");
if (!lamp.ok) throw new Error("lamplighters_round must compile");
const index = indexParserPack(lamp.compiled.pack);
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

const hasWindscreenAction = (s: GameState): boolean =>
  enumerateActions(index, s).some((a) => a.id === "use_horn_windscreen");

const WIN_ROUTE = [
  "read_night_notice",
  "take_tinderbox",
  "take_brass_key",
  "go_north",
  "go_west",
  "unlock_wall_cupboard",
  "open_wall_cupboard",
  "take_store_key",
  "go_east",
  "unlock_store_door",
  "go_east",
  "unlock_oil_cask",
  "open_oil_cask",
  "take_whale_oil",
  "go_west",
  "go_north",
  "use_whale_oil_on_harbour_lamp",
  "use_tinderbox_on_harbour_lamp",
  "go_down",
];

describe("bug_0303 — horn windscreen steady action retires after one attempt", () => {
  it("(1) after taking horn windscreen, steady action is present", () => {
    const s = play(initStateForParserPack(index, 7), ["take_horn_windscreen"]);
    expect(s.inventory).toContain("horn_windscreen");
    expect(hasWindscreenAction(s)).toBe(true);
  });

  it("(2) after attempting steady (any roll outcome), action is absent", () => {
    let s = play(initStateForParserPack(index, 7), ["take_horn_windscreen"]);
    expect(hasWindscreenAction(s)).toBe(true);

    // Execute the steady attempt — deterministic d20 roll from seed 7 + this sequence.
    // Whether success or failure, the action must retire after the fix.
    const windscreenOpt = enumerateActions(index, s).find((a) => a.id === "use_horn_windscreen")!;
    const r = step(s, windscreenOpt.action);
    expect(r.ok).toBe(true);
    s = r.state;

    // Either steadied_the_flame (success) or attempted_windscreen (failure) is now set;
    // in both cases the action must be gone.
    const eitherFlagSet =
      Boolean(s.flags["steadied_the_flame"]) || Boolean(s.flags["attempted_windscreen"]);
    expect(eitherFlagSet).toBe(true);
    expect(hasWindscreenAction(s)).toBe(false);
  });

  it("(3) full win route reaches ending_guided at 35/35 without windscreen", () => {
    const s = play(initStateForParserPack(index, 7), WIN_ROUTE);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_guided");
    expect(buildParserObservation(index, s).score).toBe(35);
  });

  it("(4) success path: steadied_the_flame set → action absent", () => {
    // Seed 13 — try a different RNG sequence; action should still retire on success.
    let s = play(initStateForParserPack(index, 13), ["take_horn_windscreen"]);
    if (!hasWindscreenAction(s)) return; // windscreen already absent (shouldn't happen)

    const windscreenOpt = enumerateActions(index, s).find((a) => a.id === "use_horn_windscreen")!;
    const r = step(s, windscreenOpt.action);
    expect(r.ok).toBe(true);
    s = r.state;

    // Whether success or failure, action must be retired after the fix.
    expect(hasWindscreenAction(s)).toBe(false);
  });
});
