/**
 * Regression (§15) for bug_0064 — *The Clockwork Heist*'s clockwork-deadline arc
 * (bug_0019/0040/0042/0043) made the gallery, the vault door, and the loot room all
 * feel the hour, but the hidden strongbox route to the truth — the crawlspace behind
 * the great clock's pendulum — was the ONE beat the clock never touched. A fresh,
 * MCP-only blind playtester (seed 47, report ai-runs/2026-06-01T17-35-11-427Z/playtest.md,
 * §4 + §6) reached all four endings, rated the pack clarity 5/5 / enjoyment 4/5 with zero
 * functional bugs, and named exactly one opportunity: "the headline tension mechanic — the
 * ticking clock and hourly watch — is completely bypassable via the strongbox route, so a
 * player who beelines the hidden letter may never discover the game's best system... the
 * two halves feel tonally disconnected."
 *
 * The fix mirrors bug_0043's loot-room treatment: content-only reactive `variants` on the
 * `crawlspace` scene (first-match-wins, higher threshold first), so a player who wandered
 * the manor's upstairs rooms before crawling back to crack the box feels the same clock the
 * rest of the manor drums up — carried down through the clockwork's gears into the passage.
 *   - ticks >= 4: the hour has come; the chime rolls down through the manor's gears and a
 *     slow tread answers beyond the wall along the vault's far side.
 *   - ticks >= 2: the great clock grinds toward the hour, felt even here; be gone before
 *     the chime wakes the house.
 * The clock is named only by the manor-wide motif (gears, chime), never by a watchman or
 * brass plate the crawler may not have met (the bug_0058 leak lesson). The base `text` is
 * UNCHANGED, so the bug_0017 framing it carries ("sealed letter", no "that same") stays
 * byte-identical. No choice, effect, flag, item, exit, gating, or reachable ending changes.
 *
 * Locked here:
 *   (1) a crawler who burned the clock to ticks 2-3 reading the box sees the
 *       grinds-toward-the-hour prose, NOT the on-the-hour prose;
 *   (2) a crawler at the hour (ticks >= 4) sees the chime/tread on-the-hour prose,
 *       NOT the running variant;
 *   (3) the base text is unchanged: it still carries the bug_0017 hidden-letter framing,
 *       and a fresh (ticks 0) state renders it verbatim with no clock prose;
 *   (4) the pure-foyer beeliner crawlspace route stays at low ticks (< 2), reads the still
 *       base text, and still reaches ending_truth — the quiet is earned by slipping past
 *       the gallery entirely;
 *   (5) reachability/feedback unchanged — all four endings still fire (text-only edit).
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack, sceneText } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[]): GameState {
  const step = makeStep(rules);
  let s = initStateForPack(index, 47);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

// Open the panel, fetch the pick, then wander the manor to burn the clock before
// re-entering the crawlspace from the foyer (enter_panel gates on the lockpick).
// ticks: kitchen(1) climb->landing(2)  -> crawlspace at tick 2 (tension band).
const CRAWL_AT_T2 = [
  "inspect_clock",
  "pry_panel",
  "back_crawl",
  "kitchens",
  "take_pick",
  "back_foyer",
  "climb_stairs",
  "back_down",
  "enter_panel",
];
// ...climb(2) study(3) landing(4) -> crawlspace at tick 4 (the hour).
const CRAWL_AT_T4 = [
  "inspect_clock",
  "pry_panel",
  "back_crawl",
  "kitchens",
  "take_pick",
  "back_foyer",
  "climb_stairs",
  "enter_study",
  "leave_study",
  "back_down",
  "enter_panel",
];
// The pure-foyer beeliner: straight from the foyer to the box, no gallery detour.
// ticks: kitchen(1) only -> crawlspace at tick 1 (still base text).
const CRAWL_BEELINE = [
  "inspect_clock",
  "kitchens",
  "take_pick",
  "back_foyer",
  "pry_panel",
  "open_strongbox",
];

const RUNNING = /great clock grinds toward the hour|before the chime wakes the sleeping house/i;
const HOUR = /hour has come round at last|chime rolls down through the manor|slow tread answers/i;
const LETTER = /sealed letter/i;

describe("bug_0064 — the clock deadline is felt in the crawlspace, on the hidden-letter route", () => {
  it("a crawler at ticks 2-3 reading the box sees the grinds-toward-the-hour prose", () => {
    const s = play(CRAWL_AT_T2);
    expect(s.current).toBe("crawlspace");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(2);
    expect(s.vars.ticks).toBeLessThan(4);
    const text = buildObservation(index, s).text;
    expect(text).toMatch(RUNNING);
    expect(text).not.toMatch(HOUR);
    expect(text).toMatch(LETTER); // still the hidden-letter beat
  });

  it("a crawler at the hour (ticks >= 4) sees the chime/tread on-the-hour prose", () => {
    const s = play(CRAWL_AT_T4);
    expect(s.current).toBe("crawlspace");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(4);
    const text = buildObservation(index, s).text;
    expect(text).toMatch(HOUR);
    expect(text).not.toMatch(RUNNING);
    expect(text).toMatch(LETTER);
  });

  it("the base text is unchanged — bug_0017 hidden-letter framing intact, no clock prose at ticks 0", () => {
    const crawlspace = index.pack.scenes.find((sc) => sc.id === "crawlspace")!;
    const base = crawlspace.text.toLowerCase();
    expect(base).toContain("sealed letter");
    expect(base).not.toContain("that same"); // bug_0017 continuity guard
    // A fresh state (ticks 0) falls through to the base text — no variant fires.
    const fresh = initStateForPack(index, 47);
    expect(fresh.vars.ticks).toBe(0);
    const rendered = sceneText(crawlspace, fresh);
    expect(rendered).toBe(crawlspace.text);
    expect(rendered).not.toMatch(HOUR);
    expect(rendered).not.toMatch(RUNNING);
  });

  it("the pure-foyer beeliner stays at low ticks, reads the still base text, and reaches the truth", () => {
    // Stop just before opening the box to inspect the rendered crawlspace text.
    const atBox = play(CRAWL_BEELINE.slice(0, -1));
    expect(atBox.current).toBe("crawlspace");
    expect(atBox.vars.ticks).toBeLessThan(2); // never stirred the gallery -> base text
    const text = buildObservation(index, atBox).text;
    expect(text).not.toMatch(RUNNING);
    expect(text).not.toMatch(HOUR);
    expect(text).toMatch(LETTER);
    // ...and the route still completes to the good ending.
    expect(play(CRAWL_BEELINE).endingId).toBe("ending_truth");
  });

  it("reachability/feedback unchanged — all four endings still fire (text-only edit)", () => {
    expect(play([...CRAWL_AT_T2, "open_strongbox"]).endingId).toBe("ending_truth");
    expect(play([...CRAWL_AT_T4, "open_strongbox"]).endingId).toBe("ending_truth");
    expect(
      play(["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock", "grab_gold"])
        .endingId,
    ).toBe("ending_rich");
    expect(play(["climb_stairs", "approach_vault", "force_door"]).endingId).toBe("ending_caught");
    expect(
      play([
        "kitchens",
        "take_pick",
        "dumbwaiter",
        "enter_study",
        "leave_study",
        "cross_to_vault_blind",
      ]).endingId,
    ).toBe("ending_patrol");
  });
});
