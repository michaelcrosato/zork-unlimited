/**
 * Regression (§15) for bug_0004 — the hermit conversation, the part a blind
 * MCP playtester (and the coverage bot) found least reactive on *The Watchtower
 * Road*. Two findings are locked here:
 *   (1) hermit_about_tower now journals its lore (was silent, set only met_hermit);
 *   (2) "Ask about the burning tower" no longer loops — it is gated on
 *       not_flag heard_hermit_lore, so the lore is delivered exactly once.
 * The fix deliberately does NOT grant learned_truth from the hermit's hearsay:
 * the truth ending stays fenced behind real proof (ledger / broken letter).
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/watchtower_road.yaml");
if (!loaded.ok) throw new Error("watchtower pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 1);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const optionIds = (s: ReturnType<typeof play>): string[] =>
  buildObservation(index, s).available_actions.map((a) => a.id);

// West route to the hermit, ask about the tower, then return to the conversation.
const TO_HERMIT_LORE = [
  "go_west", "follow_to_camp", "talk_hermit", "ask_about_tower", "back_from_tower_talk",
];

describe("bug_0004 — hermit lore journals and no longer loops", () => {
  it("hearing the tower lore writes a journal entry and sets heard_hermit_lore", () => {
    const s = play(TO_HERMIT_LORE);
    expect(s.current).toBe("hermit_talk");
    expect(s.flags["heard_hermit_lore"]).toBe(true);
    expect(s.journal.some((j) => /smugglers/i.test(j) && /cellar/i.test(j))).toBe(true);
  });

  it("the lore is delivered exactly once — the ask option is gone and cannot restack the journal", () => {
    const s = play(TO_HERMIT_LORE);
    // The re-ask is gated out, so the dialogue can no longer loop.
    expect(optionIds(s)).not.toContain("ask_about_tower");
    // The journal entry appears exactly once (the gate guarantees single entry).
    const loreEntries = s.journal.filter((j) => /smugglers/i.test(j) && /cellar/i.test(j));
    expect(loreEntries.length).toBe(1);
    expect(new Set(s.journal).size).toBe(s.journal.length);
  });

  it("the hermit's hearsay does NOT grant learned_truth — the truth gate is preserved", () => {
    const s = play(TO_HERMIT_LORE);
    expect(s.flags["learned_truth"]).not.toBe(true);
    // Carry the hearsay to the climax with no proof: expose is still locked out.
    const atTown = play([...TO_HERMIT_LORE, "say_goodbye", "leave_camp", "ford_brook", "cross_north", "slip_into_woods"]);
    expect(atTown.current).toBe("decision_point");
    expect(optionIds(atTown)).not.toContain("expose_the_plot");
    expect(optionIds(atTown)).toContain("turn_back");
  });
});
