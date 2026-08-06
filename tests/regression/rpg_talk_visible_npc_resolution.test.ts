/**
 * Free-text TALK resolves against people the player can SEE, not pack order.
 *
 * The TALK path called a resolver that scanned the whole pack and returned the
 * first substring match, with no room filter, no condition filter, and no
 * ambiguity handling. Wolf-Winter models one character in four mutually exclusive
 * states as four NPCs sharing the display name "Road Warden June Pike", so on the
 * LURE / DRIVE / FORTIFY branches a player read that name off the legal-action
 * menu, typed any abbreviation of it, and was told the action was unavailable:
 * the id it resolved to belonged to the common-path June, who is definitionally
 * absent on those branches. Only the byte-exact menu label worked, and only in the
 * CLI, through an exact-match short-circuit that bypasses the parser entirely.
 *
 * Nothing caught it because no verification layer models a human typing text: the
 * validator's AMBIGUOUS_ALIAS scans objects and never NPCs, the crawler drives
 * structured actions, and the blind testers play over MCP with stable action ids.
 * This file is that missing layer — text-entry resolution against room state.
 */
import { describe, expect, it } from "vitest";

import type { GameState } from "../../src/core/state.js";
import { parseCommand } from "../../src/rpg/command_map.js";
import { indexRpgPack, initStateForRpgPack, enumerateRpgActions } from "../../src/rpg/runner.js";
import { compileRpgSource, loadRpgSourceFile } from "../../src/rpg/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("Wolf-Winter must compile");
const index = indexRpgPack(loaded.compiled.pack);

/** Natural ways a player abbreviates "Road Warden June Pike" off the action menu. */
const PHRASINGS = [
  "talk to june",
  "talk to june pike",
  "talk to pike",
  "talk to warden",
  "talk to road warden june pike",
];

function withFlags(flags: Record<string, boolean>, room: string): GameState {
  const init = initStateForRpgPack(index, 541);
  return { ...init, current: room, flags: { ...init.flags, ...flags } };
}

describe("TALK resolves the visible June, not the first June in pack order", () => {
  // june_pike_combat_boundary is declared FIRST in the pack, so the old first-match
  // resolver returned it for every phrasing regardless of state. On this branch it is
  // gated off by not_flag strategy_drive_committed and is not in the room at all.
  const drive = withFlags(
    { june_pike_present: true, strategy_drive_committed: true, drive_flank_turned: true },
    "byre_mouth",
  );

  it("every abbreviation resolves to the branch-specific June who is actually present", () => {
    for (const phrase of PHRASINGS) {
      const parsed = parseCommand(index, drive, phrase);
      expect(parsed.ok, `${phrase}: ${parsed.ok ? "" : parsed.reason}`).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.action, phrase).toEqual({ type: "TALK", npc: "june_pike_drive" });
    }
  });

  it("the resolved action is genuinely legal — the player is not handed a dead command", () => {
    // This is the half that failed before: the parser produced a syntactically fine
    // TALK whose npc was absent, so the reducer rejected it with a flat refusal.
    const legalTalks = enumerateRpgActions(index, drive)
      .filter((option) => option.action.type === "TALK")
      .map((option) => option.action);
    expect(legalTalks).toEqual([{ type: "TALK", npc: "june_pike_drive" }]);

    for (const phrase of PHRASINGS) {
      const parsed = parseCommand(index, drive, phrase);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(legalTalks, phrase).toContainEqual(parsed.action);
    }
  });

  it("still resolves the common-path June where SHE is the visible one", () => {
    const yard = withFlags({ june_pike_present: true }, "byre_yard");
    for (const phrase of PHRASINGS) {
      const parsed = parseCommand(index, yard, phrase);
      expect(parsed.ok, phrase).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.action, phrase).toEqual({
        type: "TALK",
        npc: "june_pike_combat_boundary",
      });
    }
  });

  it("refuses informatively when nobody by that name is present", () => {
    const start = initStateForRpgPack(index, 541);
    const parsed = parseCommand(index, start, "talk to june");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    // The old message interpolated the raw rest, leading "to " and all.
    expect(parsed.reason).toBe(`There's no visible person called "june" here.`);
  });
});

describe("TALK fails closed when two co-present people share a name", () => {
  // The four Junes are mutually exclusive, so the shipped pack never reaches this
  // state — but the resolver must not silently pick one if a pack ever does.
  const twins = compileRpgSource(`
meta:
  id: twin_wardens
  title: Twin Wardens
  start_room: gate
  vars_init: { hp: 10, attack: 2, defense: 1 }
rooms:
  - id: gate
    name: Gate
    description: A gate with two wardens.
    exits: [{ direction: north, to: yard }]
  - id: yard
    name: Yard
    description: An empty yard.
    exits: [{ direction: south, to: gate }]
npcs:
  - id: warden_a
    name: Road Warden Ash
    description: One warden.
    room: gate
    dialogue:
      root: greet
      nodes:
        - id: greet
          npc_text: "Ash nods."
          topics: [{ id: leave, prompt: "Leave", end: true }]
  - id: warden_b
    name: Road Warden Ash
    description: The other warden, identically named.
    room: gate
    dialogue:
      root: greet
      nodes:
        - id: greet
          npc_text: "The other Ash nods."
          topics: [{ id: leave, prompt: "Leave", end: true }]
win_conditions: [{ id: w, conditions: [{ visited: yard }], ending: e }]
endings: [{ id: e, title: End, text: Done. }]
`);
  if (!twins.ok) throw new Error("twin fixture must compile");
  const twinIndex = indexRpgPack(twins.compiled.pack);
  const atGate = initStateForRpgPack(twinIndex, 3);

  it("reports the ambiguity instead of taking the first declaration", () => {
    for (const phrase of ["talk to ash", "talk to warden", "talk to road warden ash"]) {
      const parsed = parseCommand(twinIndex, atGate, phrase);
      expect(parsed.ok, phrase).toBe(false);
      if (parsed.ok) continue;
      expect(parsed.reason, phrase).toMatch(/matches more than one person here/i);
    }
  });

  it("the same phrase is unmatched, not ambiguous, from a room neither warden occupies", () => {
    const yard = { ...atGate, current: "yard" };
    const parsed = parseCommand(twinIndex, yard, "talk to ash");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toMatch(/no visible person called "ash"/i);
  });
});
