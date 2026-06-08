/**
 * Regression (§15) for bug_0326 — *The Clockwork Heist*'s crawlspace no-pick
 * bounce-back gave no hint that the steward's study was worth visiting.
 *
 * A blind MCP playtester (seed 7, report
 * ai-runs/2026-06-08T15-44-14-673Z/playtest.md §5 Bug 1) took the natural
 * crawlspace-first route (inspect clock → kitchen for picks → crack strongbox)
 * and reached ending_truth at 20/45. The design intends the crawlspace truth
 * route to max at 30 (ledger +10 + confession +20), but the bounce-back narrated
 * only "Better search the manor for it before you crawl back here" — a generic
 * prompt that sent players straight to the kitchen, bypassing the study.
 *
 * Fix (content, pure prose): the study_strongbox narrate now names both
 * destinations — "the kitchens are off the foyer below, and the steward's study
 * waits up the stair" — so a crawlspace-first player sees a clear prompt to visit
 * the study before returning. No flag/score/choice/route/ending change.
 *
 * Locked here:
 *   (1) study_strongbox narrate references "study" and "kitchen";
 *   (2) crawlspace route without ledger scores 20/45 (baseline unchanged);
 *   (3) crawlspace route with ledger scores 30/45 (intended max, now reachable);
 *   (4) both routes still reach ending_truth.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[], seed = 7) {
  const step = makeStep(rules);
  let s = initStateForPack(index, seed);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

// Crawlspace-first route that skips the study (playtest agent's actual route).
const WITHOUT_LEDGER = [
  "inspect_clock",
  "kitchens",
  "take_pick",
  "back_foyer",
  "pry_panel",
  "open_strongbox",
];

// Crawlspace route that ALSO reads the ledger — the intended 30-point path.
const WITH_LEDGER = [
  "inspect_clock",
  "climb_stairs",
  "enter_study",
  "read_ledger",
  "leave_study",
  "back_down",
  "kitchens",
  "take_pick",
  "back_foyer",
  "pry_panel",
  "open_strongbox",
];

describe("bug_0326 — crawlspace bounce-back now names the study as a destination", () => {
  it("study_strongbox narrate references the study and the kitchens", () => {
    const crawlspace = index.pack.scenes.find((sc) => sc.id === "crawlspace");
    expect(crawlspace).toBeDefined();
    const studyBox = crawlspace!.choices.find((c) => c.id === "study_strongbox");
    expect(studyBox).toBeDefined();
    const narrateEffect = studyBox!.effects?.find((e) => "narrate" in e) as
      | { narrate: string }
      | undefined;
    expect(narrateEffect).toBeDefined();
    const narrate = narrateEffect!.narrate.toLowerCase();
    expect(narrate).toContain("study");
    expect(narrate).toContain("kitchen");
  });

  it("crawlspace route without ledger scores 20/45 (baseline)", () => {
    const s = play(WITHOUT_LEDGER);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_truth");
    expect(s.vars.score).toBe(20);
  });

  it("crawlspace route with ledger scores 30/45 (intended max)", () => {
    const s = play(WITH_LEDGER);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_truth");
    expect(s.vars.score).toBe(30);
  });

  it("both routes reach ending_truth", () => {
    expect(play(WITHOUT_LEDGER).endingId).toBe("ending_truth");
    expect(play(WITH_LEDGER).endingId).toBe("ending_truth");
  });
});
