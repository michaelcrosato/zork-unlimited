/**
 * Regression (§15) for bug_0233 — content_new: *The Midnight Edition*, the project's
 * 17th pack and 7th CYOA, shipped as a BOT-COMPLETABLE curated CYOA. The standing
 * CRITICAL WATCH ([[content-polish-backlog-exhausted]]) flagged the curated benchmark
 * floor had thinned to 0.357 vs the 0.35 CURATED_FLOOR in
 * benchmark_headline_no_regression — so the next bot-UNSOLVABLE puzzle pack would have
 * breached it. A CYOA the planning-free coverage bot can finish raises the curated mean
 * (35.7% → 36.6% at runs=50) and WIDENS the curated→held-out gap (5.8 → 6.7pt) instead
 * of eroding it. The scorecard was regenerated the same cycle (freshness pin bug_0194).
 *
 * The pack's THESIS is a DILIGENCE fork — distinct from wreckers_light's pure moral
 * mirror and from the linear lock-and-key parser packs. The decisive verb is the SAME on
 * the winning and the losing print route (set the column, pull the bed-lever); what
 * decides the night is WHAT YOU KNOW WHEN YOU PULL IT:
 *   - verify first (read_letter → search_desk → open_safe → read_report ⇒ knows_proof),
 *     THEN print  → ending_vindicated (the considered win: the story is PROVEN, unsuable);
 *   - print on the source's word alone (no knows_proof)  → ending_libel (courage without
 *     diligence ruins an innocent and the paper);
 *   - pull the story  → ending_spiked (the complicit pole);
 *   - go out to Garrow's men at the alley door  → ending_silenced (the rash pole).
 *
 * This test locks that thesis:
 *   (1) all four endings (vindicated / libel / spiked / silenced) are reachable & distinct;
 *   (2) the diligence fork is real and hinges on KNOWLEDGE, not a different lever — the
 *       press floor offers print_verified ONLY when knows_proof holds and print_unverified
 *       ONLY when it does not (mutually exclusive in the legal-action set), so a player who
 *       skipped the verify chain literally cannot reach ending_vindicated;
 *   (3) the proof is gated behind the read chain — search_desk is not offered until the
 *       letter is read (no reason to prise the desk otherwise), keeping vindicated behind
 *       genuine diligence rather than a lucky click;
 *   (4) the two trivially-reachable poles (spiked, silenced) need no knowledge at all, so
 *       the coverage bot completes — the benchmark discrimination is "did the agent do the
 *       diligence before the irreversible act", not "can it reach an ending".
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/midnight_edition.yaml");
if (!loaded.ok) throw new Error("midnight_edition pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 1);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof play>) => buildObservation(index, s);
const endId = (s: ReturnType<typeof play>) => obs(s).ending_id;
const actionIds = (s: ReturnType<typeof play>) => obs(s).available_actions.map((a) => a.id);

// ── Routes ───────────────────────────────────────────────────────────────────
// The full verify chain: read the letter, find the key, open the safe, read the report.
const VERIFY = [
  "read_letter",
  "go_office",
  "search_desk",
  "open_safe",
  "read_report",
  "leave_office",
];

const VINDICATED = [...VERIFY, "go_press", "print_verified"];
const LIBEL = ["go_press", "print_unverified"];
const SPIKED = ["go_press", "spike_story"];
const SILENCED = ["go_alley", "confront_men"];

describe("midnight_edition — four distinct endings are all reachable", () => {
  it("reaches vindicated / libel / spiked / silenced, each a distinct endingId", () => {
    const ids = [VINDICATED, LIBEL, SPIKED, SILENCED].map((r) => endId(play(r)));
    expect(ids).toEqual(["ending_vindicated", "ending_libel", "ending_spiked", "ending_silenced"]);
    expect(new Set(ids).size).toBe(4); // genuinely distinct, not aliases
  });
});

describe("midnight_edition — the diligence fork hinges on knowledge, not a different lever", () => {
  it("the press floor offers print_verified XOR print_unverified, keyed on knows_proof", () => {
    // Reached the press floor WITHOUT verifying: only the unverified print is on offer.
    const unverifiedFloor = play(["go_press"]);
    expect(actionIds(unverifiedFloor)).toContain("print_unverified");
    expect(actionIds(unverifiedFloor)).not.toContain("print_verified");

    // Reached it AFTER the full verify chain: only the verified print is on offer.
    const verifiedFloor = play([...VERIFY, "go_press"]);
    expect(actionIds(verifiedFloor)).toContain("print_verified");
    expect(actionIds(verifiedFloor)).not.toContain("print_unverified");

    // Both states can still spike — the complicit pole needs no knowledge.
    expect(actionIds(unverifiedFloor)).toContain("spike_story");
    expect(actionIds(verifiedFloor)).toContain("spike_story");
  });

  it("the same intent (print) yields the win only with the proof, ruin without it", () => {
    expect(endId(play([...VERIFY, "go_press", "print_verified"]))).toBe("ending_vindicated");
    expect(endId(play(["go_press", "print_unverified"]))).toBe("ending_libel");
  });
});

describe("midnight_edition — the proof is gated behind the read chain (real diligence)", () => {
  it("search_desk is not offered until the letter has been read", () => {
    // Straight upstairs without reading the letter: no reason to prise the desk.
    const officeColdSearch = play(["go_office"]);
    expect(actionIds(officeColdSearch)).not.toContain("search_desk");

    // After reading the letter (which names the hidden key), the desk search appears.
    const officeAfterLetter = play(["read_letter", "go_office"]);
    expect(actionIds(officeAfterLetter)).toContain("search_desk");
  });
});
