/**
 * Regression (§15) for bug_0324 — dawn_beacon beacon_crown room description still
 * said "the watch's own flint lies in the bed beside it" after the player had picked
 * up the flint. visible_objects updated correctly; prose did not. Same
 * reactive-description-blindness class as bugs 0282–0323.
 *
 * Found: blind playtest seed 7, 2026-06-08T13-56-45-884Z.
 *
 * Fix: added `variants` to `beacon_crown` with `when: [{ has_item: flint }]` guard.
 * When the flint is in inventory the crown drops "flint lies in the bed" and notes
 * "The flint is in your hand." Base description (flint not yet taken) unchanged.
 * No flag / score / route / ending change; prose only.
 *
 * Locked here:
 *   (a) base state (flint not taken) → "flint lies in the bed" present
 *   (b) flint in inventory → "flint lies in the bed" absent; "flint is in your hand" present
 *   (c) pack validates green; ending_lit 50/50 reachable
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { indexRpgPack, initStateForRpgPack } from "../../src/rpg/runner.js";
import { roomDescription } from "../../src/rpg/model.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

const PACK_PATH = "content/rpg/pack/dawn_beacon.yaml";
const loaded = loadRpgPackFile(PACK_PATH);
if (!loaded.ok) throw new Error("dawn_beacon must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const crown = pack.rooms.find((r: { id: string }) => r.id === "beacon_crown")!;

function atCrown(inv: string[] = []) {
  const s = initStateForRpgPack(index, 1);
  return { ...s, current: "beacon_crown", inventory: inv };
}

describe("bug_0324 — beacon_crown description drops 'flint lies in the bed' once flint taken", () => {
  it("(a) base state (flint not in hand) → 'flint lies in the bed' present", () => {
    const desc = roomDescription(crown, atCrown([]));
    expect(desc.toLowerCase()).toContain("flint lies in the bed");
  });

  it("(b) flint in inventory → 'flint lies in the bed' absent", () => {
    const desc = roomDescription(crown, atCrown(["flint"]));
    expect(desc.toLowerCase()).not.toContain("flint lies in the bed");
  });

  it("(b) flint in inventory → 'flint is in your hand' present", () => {
    const desc = roomDescription(crown, atCrown(["flint"]));
    expect(desc.toLowerCase()).toContain("flint is in your hand");
  });

  it("(c) pack validates green and ending_lit is defined with max_score 50", () => {
    expect(
      validateRpg(pack).findings.filter((f: { severity: string }) => f.severity === "error"),
    ).toEqual([]);
    const litEnding = pack.endings.find((e: { id: string }) => e.id === "ending_lit");
    expect(litEnding).toBeDefined();
    expect(pack.meta.max_score).toBe(50);
  });
});
