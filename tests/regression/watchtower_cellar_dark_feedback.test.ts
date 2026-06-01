/**
 * Regression (§15) for bug_0005 — the lantern-less cellar door.
 *
 * A blind MCP playtester's top friction (ai-runs/2026-06-01T05-06-44-014Z):
 * arriving at the cellar door WITHOUT a lantern offered only "step back," with
 * no in-fiction reason the clearly-described stair couldn't be descended. The
 * fix adds a `peer_into_dark` choice, shown only when the player holds no
 * lantern, that narrates the darkness and nudges toward finding a light, then
 * backs the player out to the watchtower (it must MAKE PROGRESS, not self-loop:
 * a same-scene no-state-change step is flagged by the playtester's sound
 * loop-detector, so the nudge routes out of the door rather than back to it).
 * Locked here:
 *   (1) lantern-less, the door offers the legible nudge (not a bare step-back);
 *   (2) peering down narrates a 'find a light' hint, takes no item/journal, and
 *       makes progress (moves to ruined_watchtower) — never a stuck self-loop;
 *   (3) once a lantern is carried, the nudge is gone and `light_lantern` takes over.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/watchtower_road.yaml");
if (!loaded.ok) throw new Error("watchtower pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function run(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 1);
  const events = [];
  for (const id of ids) {
    const r = step(s, choose(id));
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}
const optionIds = (s: ReturnType<typeof run>["state"]): string[] =>
  buildObservation(index, s).available_actions.map((a) => a.id);

// Circle straight to the cellar door, never having looted the cart.
const TO_CELLAR_NO_LANTERN = ["go_east", "circle_cellar"];

describe("bug_0005 — lantern-less cellar door gives a legible 'too dark' nudge", () => {
  it("offers peer_into_dark (not just step-back) when the player has no lantern", () => {
    const { state } = run(TO_CELLAR_NO_LANTERN);
    expect(state.current).toBe("cellar_door");
    expect(state.inventory).not.toContain("lantern");
    const opts = optionIds(state);
    expect(opts).toContain("peer_into_dark");
    expect(opts).toContain("cellar_back");
    // The real descent/light options stay gated out without a lantern.
    expect(opts).not.toContain("descend_cellar");
    expect(opts).not.toContain("light_lantern");
  });

  it("peering into the dark narrates a 'find a light' hint and makes progress (no self-loop)", () => {
    const before = run(TO_CELLAR_NO_LANTERN).state;
    const after = run([...TO_CELLAR_NO_LANTERN, "peer_into_dark"]);
    // Feedback only: no item or journal gained.
    expect(after.state.inventory).toEqual(before.inventory);
    expect(after.state.journal).toEqual(before.journal);
    // A narration event surfaced the hint to the player.
    const narr = after.events.filter((e) => e.type === "narration");
    expect(narr.length).toBe(1);
    expect(/light/i.test((narr[0] as { text: string }).text)).toBe(true);
    // Crucially it MOVES the player out (to the watchtower) rather than back to
    // the same door — a same-scene no-state-change step is a stuck self-loop the
    // playtester flags. Progress here means the scene changed.
    expect(after.state.current).toBe("ruined_watchtower");
    expect(after.state.current).not.toBe(before.current);
  });

  it("once a lantern is carried, the nudge is gone and light_lantern takes over", () => {
    const withLantern = run([
      "go_east", "approach_base", "search_rubble", "take_lantern", "carry_lantern_to_cellar",
    ]);
    expect(withLantern.state.current).toBe("cellar_door");
    expect(withLantern.state.inventory).toContain("lantern");
    const opts = optionIds(withLantern.state);
    expect(opts).not.toContain("peer_into_dark");
    expect(opts).toContain("light_lantern");
  });
});
