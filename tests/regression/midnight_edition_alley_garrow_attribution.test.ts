/**
 * Regression (§15) for bug_0284 — *The Midnight Edition*'s alley_door base text named
 * "Garrow's yard-men" even when the player had not yet read the letter, giving the
 * player the antagonist's name and affiliation before any in-game context established it.
 *
 * The alley_door scene has quest_stage variants (story_in_hand / proof_sought / proof_found)
 * that correctly name Garrow because they fire only after read_letter sets a quest stage.
 * The base text — which fires when no stage is set — must use neutral attribution.
 *
 * A blind playtester (seed 42, ai-runs/2026-06-08T04-18-18-429Z/playtest.md §5 Bug 1)
 * noted: "the alley base text fires 'Garrow's yard-men' even when the player has not yet
 * read the letter and has no context for who Garrow is."
 *
 * Fix: "Garrow's yard-men" → "Hired men" in the base text only; all quest_stage variants
 * unchanged. Same reactive-description-blindness class as bug_0120/0134/0282/0283.
 *
 * This test locks:
 * (1) Base (letter unread): "Hired men" present, "Garrow's" absent from alley text.
 * (2) story_in_hand (letter read): "Garrow's" present (quest_stage variant fires).
 * (3) door_barred re-entry: barred variant fires; "Hired men" and "Garrow's yard-men"
 *     base not shown (door_barred is most-specific-first and wins over all stage variants).
 * (4) Cosmetic only: alley choices unchanged; vindicated route still reachable.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/midnight_edition.yaml");
if (!loaded.ok) throw new Error("midnight_edition pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[], seed = 42) {
  const step = makeStep(rules);
  let s = initStateForPack(index, seed);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof play>) => buildObservation(index, s);

// Navigate to alley_door with NO letter read (base fires).
const ALLEY_NO_LETTER = ["go_alley"];

// Navigate to alley_door AFTER reading the letter (story_in_hand fires).
const ALLEY_AFTER_LETTER = ["read_letter", "go_alley"];

// Bar the door then re-enter the alley (door_barred variant fires).
const ALLEY_AFTER_BAR = ["go_alley", "bar_door", "go_alley_barred"];

const GARROW = "garrow's"; // attribution that must be absent from base
const HIRED = "hired men"; // neutral attribution in fixed base
const BARRED_SIGNAL = "heavy bar is across"; // marker unique to door_barred variant

describe("bug_0284 — alley_door base text must not name Garrow before letter is read", () => {
  it("base (letter unread): 'hired men' shows; 'garrow's' absent from alley text", () => {
    const s = play(ALLEY_NO_LETTER);
    expect(s.current).toBe("alley_door");
    expect(s.flags["read_letter"]).not.toBe(true);
    const text = obs(s).text.toLowerCase();
    expect(text).toContain(HIRED);
    expect(text).not.toContain(GARROW);
  });

  it("after reading letter (story_in_hand): 'garrow's' present in quest_stage variant", () => {
    const s = play(ALLEY_AFTER_LETTER);
    expect(s.current).toBe("alley_door");
    expect(s.flags["read_letter"]).toBe(true);
    const text = obs(s).text.toLowerCase();
    expect(text).toContain(GARROW);
  });

  it("after barring door: door_barred variant fires; base phrasing absent", () => {
    const s = play(ALLEY_AFTER_BAR);
    expect(s.current).toBe("alley_door");
    expect(s.flags["door_barred"]).toBe(true);
    const text = obs(s).text.toLowerCase();
    expect(text).toContain(BARRED_SIGNAL);
    expect(text).not.toContain(HIRED);
  });

  it("cosmetic only: alley choices unchanged; vindicated route still reachable", () => {
    // Verify alley choices present in unbarred state.
    const s = play(ALLEY_NO_LETTER);
    const ids = obs(s).available_actions.map((a) => a.id);
    expect(ids).toContain("confront_men");
    expect(ids).toContain("steady_and_bar");
    expect(ids).toContain("bar_door");

    // Full vindicated route remains reachable after the press is secured.
    const final = play([
      "read_letter",
      "go_office",
      "search_desk",
      "open_safe",
      "read_report",
      "leave_office",
      "go_alley",
      "bar_door",
      "go_press",
      "print_verified",
    ]);
    expect(final.ended).toBe(true);
    expect(final.endingId).toBe("ending_vindicated");
    expect(final.vars["score"]).toBe(35);
  });
});
