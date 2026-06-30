/**
 * Regression for bug_0364 -- blind-playtest polish for The Ferryman's Price.
 * A fresh MCP-only blind player found the mystery mechanically sound but flagged
 * stale hut/boat prose and an evidence inconsistency: the receipt could be
 * carried, but the murder's motive document could not. The fix makes the lease
 * notice a carried item and keeps testimony text route-honest.
 *
 * Regression for bug_0470 -- a later blind pass found the walk-away ending could
 * claim the player knew the receipt, blood, and hut denial after reading only the
 * lease notice. The ending must name only the evidence actually found.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/ferrymansprice.yaml");
if (!loaded.ok) throw new Error("ferrymansprice pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[], seed = 7) {
  const step = makeStep(rules);
  let state = initStateForPack(index, seed);
  for (const id of ids) state = step(state, choose(id)).state;
  return state;
}

const obs = (ids: string[]) => buildObservation(index, play(ids));

const CACHE_WITHOUT_MARKS = ["walk_upstream", "pull_bundle", "take_receipt", "read_lease_notice"];

describe("bug_0364 -- Ferryman's Price blind polish", () => {
  it("carries the lease notice as evidence alongside the receipt", () => {
    const cache = obs(CACHE_WITHOUT_MARKS);

    expect(cache.state.inventory).toContain("travel_receipt");
    expect(cache.state.inventory).toContain("lease_notice");
    expect(cache.state.flags).toContain("knows_truth");
    expect(cache.available_actions.map((a) => a.id)).not.toContain("read_lease_notice");
  });

  it("updates the ferryman's hut after his denial instead of repeating the neutral price beat", () => {
    const hut = obs(["go_to_hut", "ask_lost_traveler"]);

    expect(hut.text).toMatch(/lie about the missing traveler/i);
    expect(hut.text).toMatch(/courtesy has gone thin/i);
    expect(hut.text).not.toMatch(/names his price again/i);
  });

  it("updates the boat inspection after the bloodstain has been documented", () => {
    const boat = obs(["go_to_landing", "inspect_boat", "mark_bloodstain"]);

    expect(boat.text).toMatch(/given up what the scrubbing could not reach/i);
    expect(boat.text).toMatch(/old blood deep in the oak grain/i);
    expect(boat.text).not.toMatch(/someone has scrubbed the gunwale/i);
  });

  it("updates the willow cache as documents are removed from the pack", () => {
    const receiptOnly = obs(["walk_upstream", "pull_bundle", "take_receipt"]);
    expect(receiptOnly.text).toMatch(/folded receipt is no longer in its dry pocket/i);
    expect(receiptOnly.text).toMatch(/second piece of paper, heavily sealed/i);

    const leaseOnly = obs(["walk_upstream", "pull_bundle", "read_lease_notice"]);
    expect(leaseOnly.text).toMatch(/lease notice is no longer tucked inside/i);
    expect(leaseOnly.text).toMatch(/folded travel receipt remains/i);

    const emptied = obs(CACHE_WITHOUT_MARKS);
    expect(emptied.text).toMatch(/receipt and the sealed lease notice are gone/i);
    expect(emptied.text).not.toMatch(/folded travel receipt in a dry inner pocket/i);
    expect(emptied.text).not.toMatch(/second piece of paper, heavily sealed/i);
  });

  it("keeps testimony text honest when the player never inspected the drag marks", () => {
    const end = obs([
      ...CACHE_WITHOUT_MARKS,
      "leave_willows",
      "go_to_landing",
      "inspect_boat",
      "mark_bloodstain",
      "board_and_call",
      "say_nothing",
      "report_to_tollhouse",
    ]);

    expect(end.ending_id).toBe("ending_testimony");
    expect(end.text).toMatch(/lease notice/i);
    expect(end.text).not.toMatch(/drag marks|rope marks/i);
    expect(end.state.vars.score).toBe(35);
  });

  it("keeps the walk-away ending honest when the player only read the lease notice", () => {
    const end = obs([
      "walk_upstream",
      "pull_bundle",
      "read_lease_notice",
      "leave_willows",
      "go_to_landing",
      "hail_ferryman",
      "say_nothing",
      "walk_to_corwick",
    ]);

    expect(end.ending_id).toBe("ending_crossed");
    expect(end.text).toMatch(/lease notice/i);
    expect(end.text).toMatch(/ferryman stood to lose/i);
    expect(end.text).not.toMatch(/receipt/i);
    expect(end.text).not.toMatch(/blood/i);
    expect(end.text).not.toMatch(/denial/i);
  });

  it("keeps the stronger walk-away ending for a fully informed player", () => {
    const end = obs([
      "inspect_marks",
      ...CACHE_WITHOUT_MARKS,
      "leave_willows",
      "go_to_hut",
      "ask_lost_traveler",
      "leave_hut",
      "go_to_landing",
      "inspect_boat",
      "mark_bloodstain",
      "board_and_call",
      "accuse_midstream",
      "walk_past",
    ]);

    expect(end.ending_id).toBe("ending_crossed");
    expect(end.text).toMatch(/receipt/i);
    expect(end.text).toMatch(/lease notice/i);
    expect(end.text).toMatch(/blood/i);
    expect(end.text).toMatch(/denial/i);
  });

  it("leaves the full blind-playtest route and maximum score intact", () => {
    const end = obs([
      "inspect_marks",
      ...CACHE_WITHOUT_MARKS,
      "leave_willows",
      "go_to_hut",
      "ask_lost_traveler",
      "leave_hut",
      "go_to_landing",
      "inspect_boat",
      "mark_bloodstain",
      "board_and_call",
      "accuse_midstream",
      "go_to_warden",
    ]);

    expect(end.ending_id).toBe("ending_testimony");
    expect(end.text).toMatch(/drag marks/i);
    expect(end.state.vars.score).toBe(45);
    expect(index.pack.meta.max_score).toBe(45);
  });
});
