/**
 * Regression (§15) for bug_0298 — the bluff `knows_truth` variant closed "waits to see
 * whether you have understood" — a binary framing ("whether") that made `lower_bow` and
 * `lay_offering` feel like equivalent "yes, I understood" responses. The distinction is
 * that `lay_offering` is an active ceremonial rite (the best ending, gated on knows_truth),
 * while `lower_bow` is passive mercy.
 *
 * A blind playtester (seed 7, ai-runs/2026-06-08T07-33-24-573Z/playtest.md §5) flagged this:
 * "The bluff text closes 'waits to see whether you have understood' — framing the question as
 * binary, which makes both options feel like equivalent 'yes, I understood' responses."
 *
 * Fix (content, pure prose): changed the bluff knows_truth closing sentence from
 * "waits to see whether you have understood" →
 * "waits to see what you will do with knowing it"
 *
 * "What you will do with knowing it" signals knowledge requires action; different acts
 * (passive lower_bow vs. active lay_offering rite) are meaningfully distinct responses.
 * No flag/choice/gating/route/ending change. No hash re-pin (white_stag unpinned).
 *
 * Locks:
 * (1) bluff with knows_truth → new closing phrase present; old "whether you have understood" absent.
 * (2) bluff without knows_truth → base text fires; new phrase absent.
 * (3) lay_offering choice is present when knows_truth is set (the offered rite).
 * (4) lower_bow and lay_offering both lead to their respective endings.
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
const obsText = (s: ReturnType<typeof play>) => obs(s).text.toLowerCase();
const actionIds = (s: ReturnType<typeof play>) => obs(s).available_actions.map((a) => a.id);
const endId = (s: ReturnType<typeof play>) => obs(s).ending_id;

// bluff with knows_truth: read stone → decipher → leave → take_shore to bluff.
const BLUFF_INFORMED = ["go_on", "read_stone", "decipher", "leave_stone", "take_shore"];

// bluff without knows_truth: straight to bluff.
const BLUFF_IGNORANT = ["go_on", "take_shore"];

describe("bug_0298 — bluff knows_truth variant signals action required, not just knowledge", () => {
  it("(1) bluff with knows_truth: new active phrase present; old binary phrase absent", () => {
    const t = obsText(play(BLUFF_INFORMED));
    expect(t).toContain("what you will do with knowing it");
    expect(t).not.toContain("whether you have understood");
    // Ensure the knows_truth variant fired (its unique framing)
    expect(t).toContain("stone's warning is in you now");
  });

  it("(2) bluff without knows_truth: base text fires; new phrase absent", () => {
    const t = obsText(play(BLUFF_IGNORANT));
    expect(t).not.toContain("what you will do with knowing it");
    expect(t).not.toContain("stone's warning is in you now");
    // Base text anchor
    expect(t).toContain("calm as a thing that has already made its peace");
  });

  it("(3) lay_offering choice is available at bluff when knows_truth is set", () => {
    const ids = actionIds(play(BLUFF_INFORMED));
    expect(ids).toContain("lay_offering");
    expect(ids).toContain("lower_bow");
    expect(ids).toContain("loose_arrow");
  });

  it("(4) lower_bow → ending_thaw; lay_offering → ending_offering", () => {
    const thaw = endId(play([...BLUFF_INFORMED, "lower_bow"]));
    const offering = endId(play([...BLUFF_INFORMED, "lay_offering"]));
    expect(thaw).toBe("ending_thaw");
    expect(offering).toBe("ending_offering");
  });
});
