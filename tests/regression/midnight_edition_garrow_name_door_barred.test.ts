/**
 * Regression (§15) for bug_0310 — *The Midnight Edition*'s composing_room hub variant
 * for `door_barred`-only (no knowledge flag set) said "Garrow's, by the hammers they
 * carried" even when the player had not yet read the letter. The player-character has no
 * in-fiction basis for knowing whose men they are until read_letter is set. The alley_door
 * base text (no quest stage) correctly names them "Hired men"; the hub's door_barred-only
 * variant must match that framing. Same reactive-description-blindness class as bugs
 * 0282-0288/0309.
 *
 * The fix changes "Garrow's, by the hammers they carried" to
 * "hired, by the hammers they carried" in the door_barred-only composing_room variant.
 * The read_letter+door_barred and knows_proof+door_barred variants above it (first-match-wins)
 * correctly retain "Garrow's" — those fire only after the letter is read.
 *
 * This test locks:
 * (1) door_barred without read_letter: hub must NOT contain "Garrow's" in the relevant line.
 * (2) door_barred without read_letter: hub MUST say "hired" (or equivalent) in place of it.
 * (3) read_letter + door_barred: hub MUST still contain "Garrow's" (guard above fires).
 * (4) knows_proof + door_barred: hub MUST still contain "Garrow's" (most-specific guard fires).
 * (5) Winning route (ending_vindicated, 35/35) still reachable end-to-end.
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

function play(ids: string[], seed = 7) {
  const step = makeStep(rules);
  let s = initStateForPack(index, seed);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof play>) => buildObservation(index, s);

// Bar the door WITHOUT reading the letter.
const BAR_NO_LETTER = ["go_alley", "bar_door"];

// Read the letter, THEN bar the door.
const BAR_AFTER_LETTER = ["read_letter", "go_alley", "bar_door"];

// Full proof chain: read letter → office → key → safe → report → back → bar door.
const BAR_AFTER_PROOF = [
  "read_letter",
  "go_office",
  "search_desk",
  "open_safe",
  "read_report",
  "leave_office",
  "go_alley",
  "bar_door",
];

// Full winning route: read, verify, bar, press → ending_vindicated 35/35.
const WINNING_ROUTE = [
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
];

describe("bug_0310 — composing_room door_barred-only variant must not name Garrow before letter is read", () => {
  it("door_barred without read_letter: 'Garrow' must not appear in the hub text", () => {
    const s = play(BAR_NO_LETTER);
    expect(s.current).toBe("composing_room");
    expect(s.flags["door_barred"]).toBe(true);
    expect(s.flags["read_letter"]).not.toBe(true);
    expect(s.flags["knows_proof"]).not.toBe(true);
    // The door_barred-only variant must not leak Garrow's name
    expect(obs(s).text.toLowerCase()).not.toMatch(/garrow's.*hammers/);
  });

  it("door_barred without read_letter: hub text acknowledges men as hired (not named)", () => {
    const s = play(BAR_NO_LETTER);
    expect(s.current).toBe("composing_room");
    // Fix uses "hired, by the hammers they carried"
    expect(obs(s).text.toLowerCase()).toContain("hired");
  });

  it("read_letter + door_barred: hub text DOES contain Garrow (read_letter guard fires)", () => {
    const s = play(BAR_AFTER_LETTER);
    expect(s.current).toBe("composing_room");
    expect(s.flags["read_letter"]).toBe(true);
    expect(s.flags["door_barred"]).toBe(true);
    // The read_letter+door_barred variant (above door_barred-only) correctly names Garrow
    expect(obs(s).text.toLowerCase()).toContain("garrow");
  });

  it("knows_proof + door_barred: hub text DOES contain Garrow (knows_proof guard fires)", () => {
    const s = play(BAR_AFTER_PROOF);
    expect(s.current).toBe("composing_room");
    expect(s.flags["knows_proof"]).toBe(true);
    expect(s.flags["door_barred"]).toBe(true);
    // The knows_proof+door_barred variant (most-specific) correctly names Garrow
    expect(obs(s).text.toLowerCase()).toContain("garrow");
  });

  it("winning route: ending_vindicated reachable with score 35", () => {
    const s = play(WINNING_ROUTE);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_vindicated");
    expect(s.vars["score"]).toBe(35);
  });
});
