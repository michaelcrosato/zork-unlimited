/**
 * Regression (§15) for bug_0323 — dawn_beacon armory room description still said
 * "left hanging on its peg" after the garrison_mail was taken, contradicting the
 * empty peg and the mail already in the player's hands. Same reactive-description-
 * blindness class as bug_0282/0287/0302/0307/0321.
 *
 * Found: blind playtest seed 7, 2026-06-08T13-46-38-837Z.
 *
 * Fix: added `variants` to `armory` with `when: [{ has_item: garrison_mail }]`
 * guard. When the mail is in inventory the armory drops "hanging on its peg" and
 * notes the peg is bare. First visit (mail not yet taken) unchanged. No flag /
 * score / route / ending change; prose only.
 *
 * Locked here:
 *   - base state (mail not taken) → "hanging on its peg" present
 *   - mail in inventory (taken, not yet donned) → "hanging on its peg" absent
 *   - mail donned (mail_donned flag set, mail still in inventory) → phrase absent
 *   - pack validates green; ending_lit reachable
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { indexRpgPack, initStateForRpgPack } from "../../src/rpg/runner.js";
import { roomDescription } from "../../src/parser/model.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import type { GameState } from "../../src/core/state.js";

const PACK_PATH = "content/rpg/pack/dawn_beacon.yaml";
const loaded = loadRpgPackFile(PACK_PATH);
if (!loaded.ok) throw new Error("dawn_beacon must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const armory = pack.rooms.find((r: { id: string }) => r.id === "armory")!;

function inArmory(flags: Record<string, boolean>, inv: string[] = []): GameState {
  const s = initStateForRpgPack(index, 1);
  return { ...s, current: "armory", flags: { ...s.flags, ...flags }, inventory: inv };
}

describe("bug_0323 — dawn_beacon armory clears 'hanging on its peg' once garrison mail taken", () => {
  it("base state (mail not taken) → 'hanging on its peg' present", () => {
    const desc = roomDescription(armory, inArmory({}));
    expect(desc.toLowerCase()).toContain("hanging on its peg");
  });

  it("mail in inventory (taken, not yet donned) → 'hanging on its peg' absent", () => {
    const desc = roomDescription(armory, inArmory({}, ["garrison_mail"]));
    expect(desc.toLowerCase()).not.toContain("hanging on its peg");
  });

  it("mail donned (mail_donned flag, still in inventory) → 'hanging on its peg' absent", () => {
    const desc = roomDescription(armory, inArmory({ mail_donned: true }, ["garrison_mail"]));
    expect(desc.toLowerCase()).not.toContain("hanging on its peg");
  });

  it("pack validates green and ending_lit is reachable", () => {
    expect(
      validateRpg(pack).findings.filter((f: { severity: string }) => f.severity === "error"),
    ).toEqual([]);
    const winCond = pack.win_conditions.find((w: { id: string }) => w.id === "light_beacon");
    expect(winCond).toBeDefined();
    const litEnding = pack.endings.find((e: { id: string }) => e.id === "ending_lit");
    expect(litEnding).toBeDefined();
    expect(pack.meta.max_score).toBe(50);
  });
});
