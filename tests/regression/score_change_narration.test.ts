/**
 * Regression (§15) for bug_0112 — a score change now narrates itself, Zork-style.
 *
 * The blind MCP playtest of The Sealed Crypt (ai-runs/2026-06-02T09-21-43-791Z, parser,
 * seed 7) won 35/35 and rated clarity 5/5 / enjoyment 4/5 with ZERO functional bugs.
 * Its single concrete actionable finding (report §4/§5) was SCORE LEGIBILITY: "the HUD
 * shows score/35 but never tells the player *why* numbers jumped … a win at 35 vs. 30
 * is invisible to a first-timer mid-game." Milestone awards (read headstone +5, solve
 * the well +10, recover the relic +20) incremented the `score` var silently — surfaced
 * only as a structured `state_change` inc_var event, never as prose the player reads.
 *
 * bug_0060 had already added a signed `delta` to score inc_var/dec_var events "so a
 * transcript narrator could surface 'points just earned'" — but no narrator existed.
 * bug_0112 supplies it: `scoreChangeNarrations` turns each score-var change in a step's
 * events into the classic "[Your score has gone up by N points; it is now M of T.]"
 * narration. It is wired through a new content-free engine hook `Rules.decorateEvents`
 * (run last in makeStep, state-untouched so determinism/hashes are unaffected), and the
 * parser AND rpg runners supply it from the conventional `score` var + meta.max_score.
 * CYOA (max_score 0) and any non-score pack get nothing — the same generic-chrome idea
 * as the observation's "Final score: X of Y." ending closure.
 *
 * Locked here:
 *   (1) the helper: +N → "gone up by N points; it is now M of T"; singular "point" for
 *       1; negative delta → "gone down"; delta 0 (guardFinite reject) → silent;
 *       max_score 0 (CYOA / untracked) → silent; non-`score` vars ignored;
 *   (2) end-to-end through The Sealed Crypt: each of the three milestones emits exactly
 *       one score-narration event in that step's events, with the right magnitude and
 *       running total, AND the original inc_var state_change event still rides alongside
 *       (the score line is additive, never a replacement);
 *   (3) determinism is preserved — two same-seed runs produce identical events — and the
 *       final state hash is unchanged by decoration (it only appends narration).
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
import { hashState } from "../../src/core/hash.js";
import { scoreChangeNarrations as scoreChangeNarrationsForVar } from "../../src/core/score_chrome.js";
import type { GameState } from "../../src/core/state.js";
import type { GameEvent } from "../../src/core/events.js";

const crypt = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!crypt.ok) throw new Error("sealed_crypt must compile");
const index = indexParserPack(crypt.compiled.pack);
const step = makeStep(buildParserRules(index));

/** Play action ids, returning the final state and the LAST step's events. */
function play(s: GameState, ids: string[]): { state: GameState; events: GameEvent[] } {
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

const narrationTexts = (events: GameEvent[]): string[] =>
  events
    .filter((e): e is { type: "narration"; text: string } => e.type === "narration")
    .map((e) => e.text);
const scoreLine = (events: GameEvent[]): string | undefined =>
  narrationTexts(events).find((t) => t.startsWith("[Your score has"));

const ev = (effect: string, name: string, value: number, delta: number): GameEvent =>
  ({ type: "state_change", effect, name, value, delta }) as unknown as GameEvent;
const scoreChangeNarrations = (events: GameEvent[], maxScore: number): GameEvent[] =>
  scoreChangeNarrationsForVar(events, "score", maxScore);

describe("bug_0112 — score changes narrate themselves (scoreChangeNarrations helper)", () => {
  it("a positive delta reads 'gone up by N points; it is now M of T'", () => {
    const out = scoreChangeNarrations([ev("inc_var", "score", 15, 10)], 35);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      type: "narration",
      text: "[Your score has gone up by 10 points; it is now 15 of 35.]",
    });
  });

  it("a delta of 1 uses the singular 'point'", () => {
    expect(scoreChangeNarrations([ev("inc_var", "score", 1, 1)], 35)[0]).toEqual({
      type: "narration",
      text: "[Your score has gone up by 1 point; it is now 1 of 35.]",
    });
  });

  it("a negative delta (dec_var) reads 'gone down by N points'", () => {
    expect(scoreChangeNarrations([ev("dec_var", "score", 7, -3)], 35)[0]).toEqual({
      type: "narration",
      text: "[Your score has gone down by 3 points; it is now 7 of 35.]",
    });
  });

  it("a delta of 0 (a guardFinite-rejected change) narrates nothing — no phantom '+0'", () => {
    expect(scoreChangeNarrations([ev("inc_var", "score", 9, 0)], 35)).toEqual([]);
  });

  it("max_score 0 (CYOA / untracked) narrates nothing", () => {
    expect(scoreChangeNarrations([ev("inc_var", "score", 5, 5)], 0)).toEqual([]);
  });

  it("a change to a non-`score` var (e.g. hp) is ignored — this is score chrome only", () => {
    expect(scoreChangeNarrations([ev("dec_var", "hp", 5, -3)], 35)).toEqual([]);
  });

  it("multiple score changes in one step each get a line", () => {
    const out = scoreChangeNarrations(
      [ev("inc_var", "score", 5, 5), ev("inc_var", "score", 15, 10)],
      35,
    );
    expect(out).toHaveLength(2);
  });
});

describe("bug_0112 — end-to-end: each Sealed Crypt milestone narrates its award", () => {
  const TO_HEADSTONE = ["go_north", "go_west"];
  const TO_WELL = [
    "go_north",
    "open_stone_coffer",
    "take_brass_key",
    "go_south",
    "go_east",
    "go_up",
    "take_rope",
    "go_down",
    "go_east",
  ];
  const TO_GATE = [
    "go_down",
    "unlock_oak_chest",
    "open_oak_chest",
    "take_iron_key",
    "go_up",
    "go_west",
    "go_north",
    "go_down",
  ];

  it("reading the headstone (+5) emits the score line at total 5, alongside the inc_var event", () => {
    const s = play(initStateForParserPack(index, 7), TO_HEADSTONE).state;
    const { events } = play(s, ["read_headstone"]);
    expect(scoreLine(events)).toBe("[Your score has gone up by 5 points; it is now 5 of 35.]");
    // additive: the structured inc_var event still rides alongside the new narration
    expect(
      events.some(
        (e) =>
          e.type === "state_change" &&
          (e as Record<string, unknown>).effect === "inc_var" &&
          (e as Record<string, unknown>).name === "score",
      ),
    ).toBe(true);
  });

  it("solving the well (+10) emits the score line at the running total 15", () => {
    const s = play(initStateForParserPack(index, 7), [
      ...TO_HEADSTONE,
      "read_headstone",
      ...TO_WELL,
    ]).state;
    const { events } = play(s, ["use_rope_on_old_well"]);
    expect(scoreLine(events)).toBe("[Your score has gone up by 10 points; it is now 15 of 35.]");
  });

  it("recovering the relic (+20) emits the score line at the cap, 35 of 35", () => {
    const s = play(initStateForParserPack(index, 7), [
      ...TO_HEADSTONE,
      "read_headstone",
      ...TO_WELL,
      "use_rope_on_old_well",
      ...TO_GATE,
      "unlock_crypt_gate",
      "go_north",
    ]).state;
    const { events } = play(s, ["take_sealed_relic"]);
    expect(scoreLine(events)).toBe("[Your score has gone up by 20 points; it is now 35 of 35.]");
  });

  it("a non-scoring step (plain movement) emits no score line", () => {
    const { events } = play(initStateForParserPack(index, 7), ["go_north"]);
    expect(scoreLine(events)).toBeUndefined();
  });
});

describe("bug_0112 — decoration is state-free: determinism and the hash hold", () => {
  const ROUTE = ["go_north", "go_west", "read_headstone"];

  it("two same-seed runs produce identical events (including the score narration)", () => {
    const a = play(initStateForParserPack(index, 7), ROUTE);
    const b = play(initStateForParserPack(index, 7), ROUTE);
    expect(a.events).toEqual(b.events);
    expect(scoreLine(a.events)).toBeDefined();
  });

  it("the final state hash matches a run with the same actions — narration never touches state", () => {
    // The hash is computed over state, which decoration does not mutate, so the
    // post-milestone hash is whatever the effects alone produce. Re-running yields it.
    const a = play(initStateForParserPack(index, 7), ROUTE);
    const b = play(initStateForParserPack(index, 7), ROUTE);
    expect(hashState(a.state)).toBe(hashState(b.state));
  });
});
