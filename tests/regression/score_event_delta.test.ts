/**
 * Regression (§15) for bug_0060 — inc_var / dec_var state_change events now carry a
 * signed `delta` alongside the resulting `value`.
 *
 * A fresh blind MCP playtester (ai-runs/2026-06-01T16-49-53-395Z rotation, The
 * Sealed Crypt parser pack, seed 13) solved the crypt twice and, as its one
 * concrete engine finding (report §5), flagged that the score events are ambiguous:
 * the IDENTICAL rope-use milestone (USE rope on old_well, +10) reported `value:15`
 * in the run that had read the +5 headstone first and `value:10` in the run that
 * skipped it. The event's `value` is the var's running total, and there was no
 * field for the increment, so a consumer (a UI surfacing "+10 points!", a transcript
 * narrator, the AI experience log) could not recover "points just earned" from the
 * event alone — it would have to diff against the prior total it may not have kept.
 *
 * Engine fix (src/core/effects.ts): inc_var/dec_var events keep `value` as the
 * resulting total (consistent with set_var's "the var's new value") and add a signed
 * `delta` — `+by` for inc_var, `-by` for dec_var — so the change is readable directly
 * off the event. Additive and backward-compatible: GameEvent's state_change variant
 * already permits extra keys, and `value` is unchanged, so existing consumers (and the
 * observation's `score`, which reads state.vars, not events) are untouched.
 *
 * Locked here:
 *   (1) inc_var emits delta:+by and value:resulting-total; dec_var emits delta:-by;
 *   (2) the playtester's exact scenario — the same +10 award at two different running
 *       totals reports the SAME delta (10) but different value (15 vs 10);
 *   (3) set_var is unchanged (value:new-value, no delta) so the fix is scoped;
 *   (4) end-to-end through The Sealed Crypt: the rope-use milestone event carries
 *       delta:10 whether or not the +5 headstone was read first.
 */
import { describe, it, expect } from "vitest";
import { initState } from "../../src/core/state.js";
import { applyEffect } from "../../src/core/effects.js";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { GameEvent } from "../../src/core/events.js";

const base = () => initState({ seed: 1, start: "room0" });

describe("bug_0060 — inc_var/dec_var events carry a signed delta beside the running total", () => {
  it("inc_var emits delta:+by and value:resulting-total", () => {
    const seeded = applyEffect({ set_var: { name: "score", value: 5 } }, base()).state;
    const r = applyEffect({ inc_var: { name: "score", by: 10 } }, seeded);
    expect(r.state.vars["score"]).toBe(15);
    expect(r.event).toEqual({
      type: "state_change",
      effect: "inc_var",
      name: "score",
      value: 15,
      delta: 10,
    });
  });

  it("dec_var emits delta:-by and value:resulting-total", () => {
    const seeded = applyEffect({ set_var: { name: "hp", value: 8 } }, base()).state;
    const r = applyEffect({ dec_var: { name: "hp", by: 3 } }, seeded);
    expect(r.state.vars["hp"]).toBe(5);
    expect(r.event).toEqual({
      type: "state_change",
      effect: "dec_var",
      name: "hp",
      value: 5,
      delta: -3,
    });
  });

  it("the playtester's scenario: same +10 at two running totals → same delta, different value", () => {
    // Run that read the +5 headstone first: the +10 lands on a total of 5.
    const withBonus = applyEffect({ set_var: { name: "score", value: 5 } }, base()).state;
    const a = applyEffect({ inc_var: { name: "score", by: 10 } }, withBonus).event as Record<
      string,
      unknown
    >;
    // Run that skipped the headstone: the identical +10 lands on a total of 0.
    const b = applyEffect({ inc_var: { name: "score", by: 10 } }, base()).event as Record<
      string,
      unknown
    >;

    expect(a["value"]).toBe(15);
    expect(b["value"]).toBe(10);
    // The ambiguity the playtester hit: value differed across runs. delta does not —
    // "points just earned" is now recoverable from the event regardless of total.
    expect(a["delta"]).toBe(10);
    expect(b["delta"]).toBe(10);
  });

  it("set_var is unchanged — value is the new value, no delta — so the fix is scoped", () => {
    const r = applyEffect({ set_var: { name: "score", value: 7 } }, base());
    expect(r.event).toEqual({
      type: "state_change",
      effect: "set_var",
      name: "score",
      value: 7,
    });
    expect((r.event as Record<string, unknown>)["delta"]).toBeUndefined();
  });

  it("end-to-end: Sealed Crypt's rope-use milestone reports delta:10 with or without the headstone bonus", () => {
    const crypt = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
    if (!crypt.ok) throw new Error("sealed_crypt must compile");
    const index = indexParserPack(crypt.compiled.pack);
    const step = makeStep(buildParserRules(index));

    function playCollect(s: GameState, ids: string[]): { state: GameState; events: GameEvent[] } {
      let events: GameEvent[] = [];
      for (const id of ids) {
        const opt = enumerateActions(index, s).find((o) => o.id === id);
        if (!opt) throw new Error(`"${id}" not legal in ${s.current}`);
        const r = step(s, opt.action);
        expect(r.ok).toBe(true);
        s = r.state;
        events = r.events;
      }
      return { state: s, events };
    }

    const ropeDelta = (events: GameEvent[]): GameEvent | undefined =>
      events.find(
        (e) => e.type === "state_change" && (e as Record<string, unknown>)["effect"] === "inc_var",
      );

    // Route to the well-tie milestone WITH the +5 headstone read first (running total 5).
    const withBonus = playCollect(initStateForParserPack(index, 13), [
      "go_north",
      "go_west",
      "read_headstone", // +5
      "go_north",
      "open_stone_coffer",
      "take_brass_key",
      "go_south",
      "go_east",
      "go_up",
      "take_rope",
      "go_down",
      "go_east",
      "use_rope_on_old_well", // +10 — lands on total 15
    ]);
    const ropeWith = ropeDelta(withBonus.events) as Record<string, unknown>;
    expect(ropeWith?.["value"]).toBe(15);
    expect(ropeWith?.["delta"]).toBe(10);

    // Same milestone, headstone SKIPPED (running total 0 → 10).
    const noBonus = playCollect(initStateForParserPack(index, 13), [
      "go_north",
      "go_west",
      "go_north",
      "open_stone_coffer",
      "take_brass_key",
      "go_south",
      "go_east",
      "go_up",
      "take_rope",
      "go_down",
      "go_east",
      "use_rope_on_old_well", // +10 — lands on total 10
    ]);
    const ropeNo = ropeDelta(noBonus.events) as Record<string, unknown>;
    expect(ropeNo?.["value"]).toBe(10);
    expect(ropeNo?.["delta"]).toBe(10); // same award, same delta — the fix's whole point
  });
});
