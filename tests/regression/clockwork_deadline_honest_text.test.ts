/**
 * Regression (§15) for bug_0061 — the clockwork deadline language was honest about
 * the wrong thing.
 *
 * A blind MCP playtester (seed 17) reached all five endings, rated the pack 5/5 clarity
 * / 4/5 enjoyment with zero functional bugs, and surfaced one actionable design note:
 * the `ticks>=2` foyer and gallery variants said "your time in the manor is running
 * short", which implies a GLOBAL run-out-of-time loss the engine never enforces. The
 * clock's only real bite is the watchman it wakes onto the gallery at the hour
 * (ticks>=4). The fix repoints both ticks>=2 lines at that real consequence — the house
 * stirring awake / this gallery being no place to stand at the chime — instead of an
 * unkept timeout. Atmospheric only (no specific unseen clue is quoted, per bug_0058),
 * and the ticks>=4 variants already name the watchman.
 *
 * Locked here:
 *   (1) the foyer ticks>=2 variant no longer claims "time ... running short" and now
 *       names the hour/house-waking consequence;
 *   (2) the gallery ticks>=2 variant likewise drops "running short" for the gallery's
 *       own at-the-hour danger;
 *   (3) the urgency variant still FIRES at tick 2 (the deadline is still surfaced, not
 *       deleted) and is distinct from the ticks>=4 patrol text;
 *   (4) no flag/tick/route/gating change: all five endings remain reachable.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function run(ids: string[], seed = 17) {
  const step = makeStep(rules);
  let s = initStateForPack(index, seed);
  for (const id of ids) {
    s = step(s, choose(id)).state;
  }
  return s;
}
const sceneText = (s: ReturnType<typeof run>): string => {
  const obs = buildObservation(index, s) as { scene?: { text?: string }; text?: string };
  return obs.scene?.text ?? obs.text ?? "";
};

describe("bug_0061 — the clockwork deadline text names the real consequence, not a phantom timeout", () => {
  it("foyer ticks>=2: drops 'time running short', names the hour waking the house", () => {
    // kitchens (tick1) -> dumbwaiter->landing (tick2) -> back_down to the foyer at ticks=2.
    const s = run(["kitchens", "dumbwaiter", "back_down"]);
    expect(s.current).toBe("foyer");
    expect(s.vars.ticks).toBe(2);
    const text = sceneText(s);
    // The overselling phrase is gone...
    expect(/time in the manor is running short/i.test(text)).toBe(false);
    // ...and the urgency is still surfaced, pointed at the real mechanic (the chime/hour
    // waking the house), not a vacant countdown.
    expect(/chime|hour/i.test(text)).toBe(true);
    expect(/stirs the manor awake|sleeping house/i.test(text)).toBe(true);
    // Not yet the ticks>=4 foyer variant that explicitly names the watchman's tread.
    expect(/watchman's tread answers it/i.test(text)).toBe(false);
  });

  it("gallery ticks>=2: drops 'time running short', names the gallery's at-the-hour danger", () => {
    // kitchens (tick1) -> dumbwaiter->landing (tick2): the gallery ticks>=2 no-ledger variant.
    // (bug_0292 split on read_ledger; this path has no ledger — gets the neutral framing.)
    const s = run(["kitchens", "dumbwaiter"]);
    expect(s.current).toBe("landing");
    expect(s.vars.ticks).toBe(2);
    expect((s.flags as Record<string, unknown>).read_ledger).toBeFalsy();
    const text = sceneText(s);
    expect(/time in the manor is running short/i.test(text)).toBe(false);
    // Clock urgency still surfaced via the shared "grinds toward the hour" line.
    expect(/grinds toward the hour/i.test(text)).toBe(true);
    // No-ledger variant uses the neutral "sleeping house" register, not the "caught" phrasing.
    expect(/sleeping house keeps its peace/i.test(text)).toBe(true);
    expect(/no place to be caught standing/i.test(text)).toBe(false);
    // Not the ticks>=4 patrol variant (the lantern actively sweeping the gallery).
    expect(/watchman's lantern now sweeps/i.test(text)).toBe(false);
  });

  it("all five endings remain reachable after the reframe", () => {
    expect(
      run(["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock", "grab_gold"])
        .current,
    ).toBe("ending_rich");
    expect(
      run(["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock", "take_letter"])
        .current,
    ).toBe("ending_truth");
    expect(
      run(["kitchens", "take_pick", "back_foyer", "inspect_clock", "pry_panel", "open_strongbox"])
        .current,
    ).toBe("ending_truth");
    expect(run(["climb_stairs", "approach_vault", "force_door"]).current).toBe("ending_caught");
    expect(
      run([
        "kitchens",
        "take_pick",
        "back_foyer",
        "climb_stairs",
        "enter_study",
        "leave_study",
        "cross_to_vault_blind",
      ]).current,
    ).toBe("ending_patrol");
  });
});
