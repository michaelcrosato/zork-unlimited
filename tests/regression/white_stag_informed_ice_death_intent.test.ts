/**
 * Regression (§15) for bug_0371 — content_fix: white_stag's informed ice death
 * no longer accuses the player of crossing to kill/take the stag.
 *
 * The informed ending_lost variant, added for bug_0293, correctly acknowledged
 * the stone but overreached: "You read the stone. You knew. ... crossed to take
 * it." A fresh blind playtest (20260620T070222Z_white_stag_seed7) pointed out
 * that `cross_ice` says only "toward the stag"; an attentive player may be trying
 * to approach it face-to-face, not to shoot it. The death can punish the rotten
 * ice gamble, but it should not assert hostile intent.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/white_stag.yaml");
if (!loaded.ok) throw new Error("white_stag pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 7);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

const obs = (ids: string[]) => buildObservation(index, play(ids));
const text = (ids: string[]) => obs(ids).text.toLowerCase();

const INFORMED_CROSSING = ["go_on", "read_stone", "decipher", "leave_stone", "cross_ice"];
const UNINFORMED_CROSSING = ["go_on", "cross_ice"];

describe("white_stag — informed ice death preserves ambiguous intent", () => {
  it("still acknowledges the stone's warning in the informed crossing", () => {
    const t = text(INFORMED_CROSSING);
    expect(t).toContain("stone's warning still fresh");
    expect(t).toContain("winter's keeper");
    expect(t).toContain("wood keeps its keeper");
  });

  it("does not accuse the informed player of crossing to take the stag", () => {
    const t = text(INFORMED_CROSSING);
    expect(t).toContain("perhaps you mean to stand before it");
    expect(t).toContain("no chance to prove which");
    expect(t).not.toContain("you knew");
    expect(t).not.toContain("crossed to take it");
  });

  it("keeps the uninformed base death distinct", () => {
    const t = text(UNINFORMED_CROSSING);
    expect(t).toContain("the foolish");
    expect(t).not.toContain("stone's warning still fresh");
    expect(obs(UNINFORMED_CROSSING).ending_id).toBe("ending_lost");
    expect(obs(INFORMED_CROSSING).ending_id).toBe("ending_lost");
  });
});
