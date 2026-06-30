/**
 * Regression (§15) for bug_0329 — content_fix: white_stag tarn post-knows_truth
 * now reflects stone already read, not still waiting.
 *
 * After reading the leaning stone (decipher sets knows_truth), the tarn's
 * knows_truth prose variant closed with "the leaning stone keeps its old vow at
 * the bank" — implying it could be re-approached. But read_stone is gated on
 * not_flag: knows_truth, so the action was absent. Prose overpromised an
 * unavailable action (the only text/action mismatch in the pack).
 *
 * Fix: changed the closing of the knows_truth tarn variant to
 * "You have read the stone; its vow is in you now." — reflects state accurately,
 * removes the implication of a re-visitable stone. Prose-only; no flag, choice,
 * route, or ending change.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/white_stag.yaml");
if (!loaded.ok) throw new Error("white_stag pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 7);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof play>) => buildObservation(index, s);
const text = (s: ReturnType<typeof play>) => obs(s).text.toLowerCase();
const actionIds = (s: ReturnType<typeof play>) => obs(s).available_actions.map((a) => a.id);

// Route: read the stone, then return to the tarn
const TO_TARN_AFTER_READ = ["go_on", "read_stone", "decipher", "leave_stone"];

describe("white_stag — tarn post-knows_truth prose reflects stone already read (bug_0329)", () => {
  it("tarn after reading stone does NOT show stale 'keeps its old vow at the bank'", () => {
    const t = text(play(TO_TARN_AFTER_READ));
    expect(t).not.toContain("keeps its old vow at the bank");
  });

  it("tarn after reading stone shows 'vow is in you now'", () => {
    const t = text(play(TO_TARN_AFTER_READ));
    expect(t).toContain("vow is in you now");
  });

  it("read_stone is absent from tarn actions once knows_truth is set", () => {
    const actions = actionIds(play(TO_TARN_AFTER_READ));
    expect(actions).not.toContain("read_stone");
  });

  it("tarn base text (first visit, no knows_truth) still shows the carved stone", () => {
    const t = text(play(["go_on"]));
    expect(t).toContain("old stone");
  });
});
