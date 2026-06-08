/**
 * Regression (§15) for bug_0327 — the deck scene had no `at_the_cask` variants,
 * so retreating from the cask via `back_deck` rendered the zero-quest-stage opening
 * text — identical to the very first turn. The world should know you've stepped back
 * from Tarrant's confrontation.
 *
 * Fix (content, pure prose): added four variants gated on quest_stage `at_the_cask`
 * (both/course/pilot/bare), placed before the `adrift` variants in the deck scene.
 * Each opens "You stepped back from the cask…". Base text fires only for first-turn
 * (quest unset). No flag/choice/ending change.
 *
 * Locks:
 * (1) back_deck with no knowledge → at_the_cask bare variant present; opening text absent.
 * (2) back_deck with knows_course → course variant present; opening text absent.
 * (3) back_deck with knows_pilot → pilot variant present; opening text absent.
 * (4) back_deck with both flags → full-knowledge variant present; opening text absent.
 * (5) first turn (no quest) → opening base text still fires; at_the_cask text absent.
 * (6) ending_landfall still reachable after back_deck detour.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/dead_reckoning.yaml");
if (!loaded.ok) throw new Error("dead_reckoning pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 7);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof play>) => buildObservation(index, s);
const obsText = (s: ReturnType<typeof play>) => obs(s).text.toLowerCase();
const endId = (s: ReturnType<typeof play>) => obs(s).ending_id;

// Opening text anchor — first-turn base text.
const OPENING_ANCHOR = "nine days without a breath of wind";

// at_the_cask variant anchors (one unique phrase per variant).
const BARE_ANCHOR = "you cannot step back from it again";
const COURSE_ANCHOR = "arithmetic the bosun is not making";
const PILOT_ANCHOR = "what you heard there will not leave you";
const BOTH_ANCHOR = "have looked at the whole of it";

describe("bug_0327 — back_deck triggers at_the_cask deck variants, not opening text", () => {
  it("(1) back_deck with no knowledge: bare at_the_cask variant; opening text absent", () => {
    // Go straight to cask, then step back.
    const t = obsText(play(["to_cask", "back_deck"]));
    expect(t).toContain(BARE_ANCHOR);
    expect(t).not.toContain(OPENING_ANCHOR);
  });

  it("(2) back_deck with knows_course: course variant; opening text absent", () => {
    // Read log, go to cask, step back.
    const t = obsText(play(["to_chest", "read_log", "leave_chest", "to_cask", "back_deck"]));
    expect(t).toContain(COURSE_ANCHOR);
    expect(t).not.toContain(OPENING_ANCHOR);
  });

  it("(3) back_deck with knows_pilot: pilot variant; opening text absent", () => {
    // Speak girl, go to cask, step back.
    const t = obsText(play(["to_hold", "speak_girl", "leave_hold", "to_cask", "back_deck"]));
    expect(t).toContain(PILOT_ANCHOR);
    expect(t).not.toContain(OPENING_ANCHOR);
  });

  it("(4) back_deck with both flags: full-knowledge variant; opening text absent", () => {
    // Read log + speak girl, go to cask, step back.
    const t = obsText(
      play([
        "to_chest",
        "read_log",
        "leave_chest",
        "to_hold",
        "speak_girl",
        "leave_hold",
        "to_cask",
        "back_deck",
      ]),
    );
    expect(t).toContain(BOTH_ANCHOR);
    expect(t).not.toContain(OPENING_ANCHOR);
    // Should NOT fire the pilot-only variant.
    expect(t).not.toContain(PILOT_ANCHOR);
  });

  it("(5) first turn (no quest): opening base text fires; at_the_cask text absent", () => {
    const t = obsText(play([]));
    expect(t).toContain(OPENING_ANCHOR);
    expect(t).not.toContain(BARE_ANCHOR);
    expect(t).not.toContain(BOTH_ANCHOR);
  });

  it("(6) ending_landfall reachable after back_deck detour", () => {
    // Full-knowledge route with a cask retreat before the final choice.
    const s = play([
      "to_chest",
      "read_log",
      "leave_chest",
      "to_hold",
      "speak_girl",
      "leave_hold",
      "to_cask",
      "back_deck",
      "to_cask",
      "trust_pilot",
    ]);
    expect(endId(s)).toBe("ending_landfall");
  });
});
