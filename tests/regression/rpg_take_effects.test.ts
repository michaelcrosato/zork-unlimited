/**
 * Regression (§15) for bug_0107 — `take_effects`, the first-class TAKE content hook
 * (the symmetric twin of unlock_effects, bug_0077): a takeable object may carry
 * effects that fire AFTER it is picked up, so a goal item can award its climactic
 * points (or set a flag) on the deliberate CLAIM rather than on bare room entry.
 *
 * A blind playtester (ai-runs/2026-06-02T08-19-08-656Z/playtest.md, sunken_barrow
 * seeds 23/7) flagged TWICE that the barrow's score hit the full 50/50 the moment you
 * ENTER the relic chamber — before the final crown-vs-coffin choice — so the
 * irreversible DOOM ending (prising the sarcophagus → ending_woken) also read "50 of
 * 50," the same tally as the true victory, undercutting score as a win signal. The fix
 * moves the final +25 off relic_chamber.on_enter onto the circlet's take_effects, so
 * the doom fork tops out at 25/50 and only taking the crown reaches 50.
 *
 * Locked here (the general engine feature, then the barrow content fix that uses it):
 *   (1) take_effects fire on pickup (after add_item), mutating state (score + flag);
 *   (2) the award is one-shot — once held, the object isn't takeable-visible, so TAKE
 *       can't re-resolve and the effects can't re-fire;
 *   (3) the schema REJECTS take_effects without `takeable: true`;
 *   (4) the validator folds take_effects into the SCORE_UNREACHABLE upper bound (a pack
 *       whose only award is in take_effects validates; one that under-counts still fires);
 *   (5) BARROW: entering the relic chamber leaves score at 25; taking the circlet awards
 *       +25 → 50/50 + ending_victory; prising the sarcophagus (never taking the crown)
 *       ends at 25/50 — the score now distinguishes the true win from the doom.
 */
import { describe, it, expect } from "vitest";
import { compileParserPack } from "../../src/parser/pack.js";
import { indexParserPack, initStateForParserPack } from "../../src/parser/model.js";
import { buildParserRules } from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";

// A minimal parser pack: start room `a` holds a takeable `gem` carrying take_effects;
// `${award}` is spliced into the gem's take_effects; win = reach `b`.
const gemPack = (award: string, maxScore = 5): string => `
meta: { id: t, title: T, start_room: a, max_score: ${maxScore} }
rooms:
  - id: a
    name: A
    description: "base"
    objects: [gem]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: gem
    name: gem
    description: "a gem"
    takeable: true
    take_effects:
${award}
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;

describe("bug_0107 — take_effects: the first-class TAKE content hook", () => {
  it("(1) fire on pickup (after add_item): a takeable gem's take_effects mutate state", () => {
    const r = compileParserPack(
      gemPack("      - inc_var: { name: score, by: 5 }\n      - set_flag: got_gem"),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const index = indexParserPack(r.compiled.pack);
    const step = makeStep(buildParserRules(index));
    let s = initStateForParserPack(index, 1);
    expect(s.vars["score"] ?? 0).toBe(0);
    expect(s.flags["got_gem"]).toBeFalsy();

    const take = enumerateActions(index, s).find((o) => o.action.type === "TAKE")!;
    const res = step(s, take.action);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    s = res.state;
    // Item is held AND the take_effects fired.
    expect(s.inventory).toContain("gem");
    expect(s.vars["score"]).toBe(5);
    expect(s.flags["got_gem"]).toBe(true);
  });

  it("(2) the award is one-shot: a held gem is no longer takeable, so it can't re-fire", () => {
    const r = compileParserPack(gemPack("      - inc_var: { name: score, by: 5 }"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const index = indexParserPack(r.compiled.pack);
    const step = makeStep(buildParserRules(index));
    let s = initStateForParserPack(index, 1);
    s = (
      step(s, enumerateActions(index, s).find((o) => o.action.type === "TAKE")!.action) as {
        ok: true;
        state: GameState;
      }
    ).state;
    expect(s.vars["score"]).toBe(5);
    // No TAKE for the gem remains in the legal set (it's in inventory), so +5 is unfarmable.
    expect(enumerateActions(index, s).some((o) => o.action.type === "TAKE")).toBe(false);
  });

  it("(3) the schema rejects take_effects without takeable: true", () => {
    const src = `
meta: { id: t, title: T, start_room: a }
rooms:
  - id: a
    name: A
    description: "base"
    objects: [stone]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: stone
    name: stone
    description: "an immovable stone"
    take_effects:
      - inc_var: { name: score, by: 5 }
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    const r = compileParserPack(src);
    expect(r.ok).toBe(false);
  });

  it("(4) the validator folds take_effects into the SCORE_UNREACHABLE upper bound", () => {
    // The only award lives in take_effects; declared max matches it → no finding.
    const ok = compileParserPack(gemPack("      - inc_var: { name: score, by: 5 }", 5));
    expect(ok.ok).toBe(true);
    if (ok.ok)
      expect(
        validateParser(ok.compiled.pack).findings.some((f) => f.code === "SCORE_UNREACHABLE"),
      ).toBe(false);

    // Declared max exceeds the take_effects award → SCORE_UNREACHABLE still fires
    // (proving the +5 really is being counted, not ignored).
    const under = compileParserPack(gemPack("      - inc_var: { name: score, by: 5 }", 10));
    expect(under.ok).toBe(true);
    if (under.ok)
      expect(
        validateParser(under.compiled.pack).findings.some((f) => f.code === "SCORE_UNREACHABLE"),
      ).toBe(true);
  });
});

describe("bug_0107 — The Sunken Barrow: the +25 rides the claim, not chamber entry", () => {
  const loaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
  if (!loaded.ok) throw new Error("sunken_barrow must compile");
  const index = indexRpgPack(loaded.compiled.pack);
  const step = makeStep(buildRpgRules(index));
  const score = (s: GameState): number => buildParserObservation(index, s).score;
  const find = (s: GameState, pred: (a: Action) => boolean) =>
    enumerateRpgActions(index, s).find((o) => pred(o.action));
  const act = (s: GameState, pred: (a: Action) => boolean): GameState => {
    const opt = find(s, pred);
    if (!opt) throw new Error(`no action in ${s.current}`);
    const r = step(s, opt.action);
    if (!r.ok) throw new Error("step failed");
    return r.state;
  };
  const move = (dir: string) => (a: Action) => a.type === "MOVE" && a.direction === dir;
  const isPrise = (a: Action) =>
    a.type === "USE" && a.item === "iron_bar" && a.target === "sarcophagus";

  // Drive (seed 1) down to the relic chamber: take the bar, slay the wight, lever the slab.
  const descend = (): GameState => {
    let s = act(act(initStateForRpgPack(index, 1), move("down")), (a) => a.type === "TAKE"); // bar
    s = act(s, move("north"));
    let g = 0;
    while (!s.ended && !s.flags["wight_slain"]) {
      s = act(s, (a) => a.type === "ATTACK");
      if (++g > 30) throw new Error("wight never fell");
    }
    s = act(s, move("east"));
    g = 0;
    while (s.questStage["barrow"] !== "slab_moved") {
      s = act(s, (a) => a.type === "USE");
      if (++g > 40) throw new Error("slab never moved");
    }
    return act(s, move("down")); // → relic_chamber
  };

  it("the circlet carries take_effects (+25); entering the chamber leaves score at 25", () => {
    const circlet = loaded.compiled.pack.objects.find((o) => o.id === "circlet")!;
    expect(circlet.take_effects?.some((e) => "inc_var" in e && e.inc_var.name === "score")).toBe(
      true,
    );
    const s = descend();
    expect(s.current).toBe("relic_chamber");
    expect(s.ended).toBe(false);
    expect(score(s)).toBe(25); // NOT 50 — the final beat is unclaimed
  });

  it("VICTORY: taking the circlet awards +25 → 50/50 and ends ending_victory", () => {
    const s = act(descend(), (a) => a.type === "TAKE"); // claim the crown
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(score(s)).toBe(50);
    expect(score(s)).toBe(loaded.compiled.pack.meta.max_score);
  });

  it("DOOM: prising the sarcophagus (crown never taken) ends ending_woken at 25/50", () => {
    const s = act(descend(), isPrise);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_woken");
    expect(score(s)).toBe(25); // the take_effects +25 never fired — distinct from the 50/50 win
    expect(score(s)).toBeLessThan(loaded.compiled.pack.meta.max_score);
  });
});
