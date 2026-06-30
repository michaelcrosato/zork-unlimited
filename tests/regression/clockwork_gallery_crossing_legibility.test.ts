/**
 * Regression (§15) for bug_0067 — the gallery's reader-crossing legibility in clockwork_heist.
 *
 * A blind MCP playtester (seed 73) found that after reading the ledger, the `landing` (gallery)
 * scene's at-the-hour variant still framed the crossing as running "right under his beam" — the
 * same danger framing as the non-reader's variant — even though for the reader that crossing is
 * the SAFE ledger payoff (`approach_vault`), the one the vault-door beat rewards with "just as
 * the ledger swore you could." The careful player read a solved threat as a live timing puzzle
 * and over-dodged it. The fix reframes the reader's `ticks>=4` line from danger to informed
 * confidence (he knows the rounds and can time the crossing in his wake), while the non-reader's
 * `ticks>=4` line keeps "right under his beam" — for that player (cross_to_vault_blind →
 * ending_patrol) the gamble is real.
 * Locked here:
 *   (1) at the hour WITH read_ledger: the gallery no longer says "right under his beam", still
 *       keeps the "ledger warned of" callback, signals a timed/in-his-wake crossing, and offers
 *       the safe crossing (approach_vault, not the blind gamble);
 *   (2) at the hour WITHOUT read_ledger: the danger framing ("right under his beam") and the
 *       blind crossing are preserved, with no ledger reference;
 *   (3) all four endings (rich/truth/caught/patrol) remain reachable.
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

function run(ids: string[], seed = 73) {
  const step = makeStep(rules);
  let s = initStateForPack(index, seed);
  for (const id of ids) {
    s = step(s, choose(id)).state;
  }
  return s;
}
function obs(s: ReturnType<typeof run>) {
  return buildObservation(index, s) as {
    scene?: { text?: string };
    text?: string;
    available_actions?: Array<{ id: string }>;
    actions?: Array<{ id: string }>;
  };
}
const sceneText = (s: ReturnType<typeof run>): string => {
  const o = obs(s);
  return o.scene?.text ?? o.text ?? "";
};
const actionIds = (s: ReturnType<typeof run>): string[] => {
  const o = obs(s);
  return (o.available_actions ?? o.actions ?? []).map((a) => a.id);
};

describe("bug_0067 — the gallery's reader-crossing reads as a solved, timed beat (not live danger)", () => {
  it("at the hour WITH read_ledger: no 'right under his beam' danger, keeps ledger callback, signals a timed crossing, offers the safe crossing", () => {
    const s = run([
      "kitchens", // ticks 1
      "take_pick",
      "back_foyer",
      "climb_stairs", // ticks 2
      "enter_study", // ticks 3
      "read_ledger",
      "leave_study", // ticks 4 — at the hour, ledger read
    ]);
    expect(s.current).toBe("landing");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(4);
    expect(s.flags.read_ledger).toBe(true);
    const text = sceneText(s);
    // The patrol is still visible and the ledger callback (the study payoff) is intact...
    expect(/watchman/i.test(text)).toBe(true);
    expect(/the steward's ledger warned of/i.test(text)).toBe(true);
    // ...but the reader's crossing is no longer framed as live danger...
    expect(/right under his beam/i.test(text)).toBe(false);
    // ...it now reads as a solved, time-it-in-his-wake beat (matching the vault-door payoff).
    expect(/his rounds by heart|in his wake|just as the ledger swore/i.test(text)).toBe(true);
    // The reader is offered the safe crossing, not the blind gamble.
    const ids = actionIds(s);
    expect(ids).toContain("approach_vault");
    expect(ids).not.toContain("cross_to_vault_blind");
  });

  it("at the hour WITHOUT read_ledger: danger framing and the blind crossing are preserved, no ledger reference", () => {
    const s = run([
      "climb_stairs", // ticks 1
      "back_down",
      "climb_stairs", // ticks 2
      "back_down",
      "climb_stairs", // ticks 3
      "back_down",
      "climb_stairs", // ticks 4 — at the hour, ledger unread
    ]);
    expect(s.current).toBe("landing");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(4);
    expect(s.flags.read_ledger).toBeFalsy();
    const text = sceneText(s);
    expect(/watchman/i.test(text)).toBe(true);
    // The non-reader keeps the real-gamble framing and never sees the ledger named.
    expect(/right under his beam/i.test(text)).toBe(true);
    expect(/ledger/i.test(text)).toBe(false);
    const ids = actionIds(s);
    expect(ids).toContain("cross_to_vault_blind");
    expect(ids).not.toContain("approach_vault");
  });

  it("all four endings remain reachable after the fix", () => {
    const rich = run([
      "kitchens",
      "take_pick",
      "dumbwaiter",
      "approach_vault",
      "pick_lock",
      "grab_gold",
    ]);
    expect(rich.current).toBe("ending_rich");

    const truth = run([
      "kitchens",
      "take_pick",
      "dumbwaiter",
      "approach_vault",
      "pick_lock",
      "take_letter",
    ]);
    expect(truth.current).toBe("ending_truth");

    const caught = run(["climb_stairs", "approach_vault", "force_door"]);
    expect(caught.current).toBe("ending_caught");

    const patrol = run([
      "kitchens",
      "take_pick",
      "back_foyer",
      "climb_stairs",
      "enter_study",
      "leave_study",
      "cross_to_vault_blind",
    ]);
    expect(patrol.current).toBe("ending_patrol");
  });
});
