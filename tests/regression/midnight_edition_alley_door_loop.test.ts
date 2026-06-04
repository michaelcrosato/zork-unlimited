/**
 * Regression (§15) for bug_0251 — *The Midnight Edition*'s alley_door scene was a byte-identical
 * no-progress LOOP, and barring the door left the composing-room hub showing stale "unknown
 * threat" prose.
 *
 * Root cause: `bar_door` and both branches of the `steady_and_bar` nerve check set NO flag and
 * routed back to composing_room. Re-entering the alley re-rendered the scene byte-for-byte
 * ("One of them tries the latch as you watch."), re-offered the same actions, and let the player
 * re-bar the same door forever; the menace never resolved. With the barred state unrecorded, the
 * composing room also re-showed its opening prose ("boots on the cobbles that do not sound like
 * printers going home") AFTER the player had seen Garrow's wrecking crew and barred the door —
 * the same stale-on-re-entry / bug_0232 class as bug_0248/0249/0250. Surfaced by the mandated
 * blind playtest (seed 53).
 *
 * Fix (content only): a monotonic `door_barred` flag, set identically by bar_door AND by BOTH
 * branches of the convergent check (so the check stays exactly convergent). It drives a barred
 * alley_door variant + gates the two bar choices off + surfaces a plain `back_inside` return (so
 * the scene resolves, not loops), and a composing_room variant that replaces the stale hub prose.
 * Reactive text + flow only — every ending stays reachable and the max_score path is untouched.
 *
 * This locks:
 *   (1) first alley entry shows the latch-being-tried menace and offers the three original actions;
 *   (2) after barring (plain bar_door), re-entering the alley shows DIFFERENT text (not the
 *       byte-identical loop), drops both bar choices, and surfaces back_inside while keeping
 *       confront_men — so the rash pole stays reachable and the loop is gone;
 *   (3) the convergent nerve check sets door_barred on BOTH outcomes (success and failure leave
 *       identical fingerprinted state at composing_room) — the score/ending proofs stay sound;
 *   (4) after barring without reading the letter, the composing-room hub no longer calls the men
 *       "boots … that do not sound like printers" but names the barred door against them.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/midnight_edition.yaml");
if (!loaded.ok) throw new Error("midnight_edition pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function playFrom(seed: number, ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, seed);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof playFrom>) => buildObservation(index, s);
const text = (s: ReturnType<typeof playFrom>) => obs(s).text;
const optionIds = (s: ReturnType<typeof playFrom>): string[] =>
  obs(s).available_actions.map((a) => a.id);

const STALE_HUB = "do not sound like printers"; // the naive opening-prose menace clause

describe("bug_0251 — the alley_door no-progress loop + stale hub menace text", () => {
  it("first alley entry shows the menace and offers confront / steady_and_bar / bar_door", () => {
    const s = playFrom(53, ["go_alley"]);
    expect(s.current).toBe("alley_door");
    expect(s.flags["door_barred"]).not.toBe(true);
    expect(text(s).toLowerCase()).toContain("tries the latch");
    expect(optionIds(s)).toEqual(
      expect.arrayContaining(["confront_men", "steady_and_bar", "bar_door"]),
    );
  });

  it("after barring (bar_door), re-entering the alley is NOT the byte-identical loop", () => {
    const firstEntry = playFrom(53, ["go_alley"]);
    const firstText = text(firstEntry);
    // bar the door, then come back to the alley from the hub.
    const reentry = playFrom(53, ["go_alley", "bar_door", "go_alley"]);
    expect(reentry.current).toBe("alley_door");
    expect(reentry.flags["door_barred"]).toBe(true);
    // The scene text changed — the loop is gone.
    expect(text(reentry)).not.toBe(firstText);
    expect(text(reentry).toLowerCase()).toContain("bar is across it now");
    // Cannot re-bar; can resolve via back_inside; the rash pole stays reachable.
    const ids = optionIds(reentry);
    expect(ids).not.toContain("bar_door");
    expect(ids).not.toContain("steady_and_bar");
    expect(ids).toContain("back_inside");
    expect(ids).toContain("confront_men");
    // back_inside actually returns to the composing room.
    const after = makeStep(rules)(reentry, choose("back_inside")).state;
    expect(after.current).toBe("composing_room");
  });

  it("the nerve check sets door_barred on BOTH outcomes and lands at composing_room (convergent)", () => {
    // Many seeds drive the d20 to both pass and fail; every one must converge to the same
    // fingerprinted state: door_barred set, at composing_room, nerve untouched.
    for (const seed of [1, 2, 3, 4, 5, 7, 11, 53]) {
      const s = playFrom(seed, ["go_alley", "steady_and_bar"]);
      expect(s.current).toBe("composing_room");
      expect(s.flags["door_barred"]).toBe(true);
      expect(s.vars["nerve"]).toBe(3);
    }
  });

  it("after barring without reading the letter, the hub drops the stale 'boots' menace prose", () => {
    const hub = playFrom(53, ["go_alley", "bar_door"]);
    expect(hub.current).toBe("composing_room");
    expect(hub.flags["read_letter"]).not.toBe(true);
    const t = text(hub).toLowerCase();
    expect(t).not.toContain(STALE_HUB);
    expect(t).toContain("the alley door is barred now");
  });
});
