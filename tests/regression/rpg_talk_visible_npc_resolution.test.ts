/**
 * Free-text TALK resolves against people the player can SEE, not pack order.
 *
 * The TALK path called a resolver that scanned the whole pack and returned the
 * first substring match, with no room filter, no condition filter, and no
 * ambiguity handling. Wolf-Winter used to model one character in four mutually exclusive
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

import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { SAVE_MODE, load, save } from "../../src/persist/save_load.js";
import { parseCommand } from "../../src/rpg/command_map.js";
import { activeDialogue } from "../../src/rpg/model.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { compileRpgSource, loadRpgSourceFile } from "../../src/rpg/source.js";
import { assertRpgStateReferences } from "../../src/rpg/state_integrity.js";
import { buildCampaignCharacterState } from "../../src/world/campaign_character_state.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("Wolf-Winter must compile");
const index = indexRpgPack(loaded.compiled.pack);
const world = loadOverworldManifest(process.cwd());
const wolf = world.quests.find((quest) => quest.id === "wolf_winter")!;

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

function bestRng(): Rng {
  return {
    next: () => 0.999_999,
    int: (_minimum, maximum) => maximum,
  };
}

function importedJuneState(flags: Record<string, boolean>, room = "byre_mouth"): GameState {
  const character = buildCampaignCharacterState({ companions: ["albany:june_pike"] });
  const initial = initStateForRpgPack(index, 541, {
    character,
    imports: wolf.campaign_imports!,
  });
  return {
    ...initial,
    current: room,
    visited: { ...initial.visited, [room]: true },
    flags: { ...initial.flags, ...flags },
  };
}

function takeAction(state: GameState, actionId: string): GameState {
  const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === actionId);
  if (!option) {
    throw new Error(
      `Missing action "${actionId}" in "${state.current}"; legal=[${enumerateRpgActions(
        index,
        state,
      )
        .map((candidate) => candidate.id)
        .join(", ")}]`,
    );
  }
  const result = makeStep(buildRpgRules(index, () => bestRng()))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  if (!result.ok) throw new Error(`Action "${actionId}" was rejected.`);
  return result.state;
}

describe("TALK resolves June's current presentation", () => {
  // One stable NPC id now resolves to the DRIVE room and dialogue root through a
  // state-reactive presentation variant.
  const drive = withFlags(
    { june_pike_present: true, strategy_drive_committed: true, drive_flank_turned: true },
    "byre_mouth",
  );

  it("every abbreviation resolves to the stable id of the June who is present", () => {
    for (const phrase of PHRASINGS) {
      const parsed = parseCommand(index, drive, phrase);
      expect(parsed.ok, `${phrase}: ${parsed.ok ? "" : parsed.reason}`).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.action, phrase).toEqual({ type: "TALK", npc: "june_pike" });
    }
  });

  it("the resolved action is genuinely legal — the player is not handed a dead command", () => {
    // This is the half that failed before: the parser produced a syntactically fine
    // TALK whose npc was absent, so the reducer rejected it with a flat refusal.
    const legalTalks = enumerateRpgActions(index, drive)
      .filter((option) => option.action.type === "TALK")
      .map((option) => option.action);
    expect(legalTalks).toEqual([{ type: "TALK", npc: "june_pike" }]);

    for (const phrase of PHRASINGS) {
      const parsed = parseCommand(index, drive, phrase);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(legalTalks, phrase).toContainEqual(parsed.action);
    }
  });

  it("still resolves June at the uncommitted boundary", () => {
    const yard = withFlags({ june_pike_present: true }, "byre_yard");
    for (const phrase of PHRASINGS) {
      const parsed = parseCommand(index, yard, phrase);
      expect(parsed.ok, phrase).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.action, phrase).toEqual({
        type: "TALK",
        npc: "june_pike",
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

  it.each([
    {
      branch: "LURE",
      flags: {
        strategy_lure_committed: true,
        lure_trail_fouled: true,
        yearling_redirected: true,
        flank_redirected: true,
      },
      root: "june_cattle_first",
      takenFlag: "june_cattle_line_taken",
    },
    {
      branch: "DRIVE",
      flags: { strategy_drive_committed: true, drive_flank_turned: true },
      root: "june_drive_cattle_first",
      takenFlag: "june_drive_cattle_line_taken",
    },
    {
      branch: "FORTIFY",
      flags: { strategy_fortify_committed: true, fortify_threshold_sealed: true },
      root: "june_fortify_cattle_first",
      takenFlag: "june_fortify_cattle_line_taken",
    },
  ])("keeps June's $branch room and dialogue root stable after TALK effects", (fixture) => {
    const talked = takeAction(importedJuneState(fixture.flags), "talk_june_pike");
    expect(talked.flags[fixture.takenFlag]).toBe(true);
    expect(talked.current).toBe("byre_mouth");
    expect(activeDialogue(index, talked)).toMatchObject({
      npc: { id: "june_pike", room: "byre_mouth", dialogue: { root: fixture.root } },
      node: { id: fixture.root },
    });
    expect(enumerateRpgActions(index, talked).map((option) => option.id)).toContain(
      "ask_acknowledge",
    );
    expect(() => assertRpgStateReferences(index, talked)).not.toThrow();
  });

  it("keeps a reachable DRIVE exchange valid across save/load immediately after TALK", () => {
    let state = importedJuneState({}, loaded.compiled.pack.meta.start_room);
    for (const actionId of [
      "go_north",
      "talk_houndsman",
      "ask_drive",
      "ask_commit_drive",
      "ask_leave",
      "take_drive_signal_rope_kit",
      "go_north",
      "use_drive_signal_rope_kit_on_drive_breach_signal",
      "go_north",
      "use_drive_signal_rope_kit_on_drive_threshold_line",
      "go_north",
      "talk_june_pike",
    ]) {
      state = takeAction(state, actionId);
    }

    expect(state).toMatchObject({
      current: "byre_mouth",
      flags: { strategy_drive_committed: true, june_drive_cattle_line_taken: true },
    });
    expect(activeDialogue(index, state)).toMatchObject({
      npc: { id: "june_pike", room: "byre_mouth" },
      node: { id: "june_drive_cattle_first" },
    });
    expect(() => assertRpgStateReferences(index, state)).not.toThrow();

    const bytes = save(state, loaded.compiled.contentHash, SAVE_MODE, {
      worldQuestId: "wolf_winter",
    });
    const restored = load(bytes, loaded.compiled.contentHash).state;
    expect(restored).toEqual(state);
    expect(activeDialogue(index, restored)).toMatchObject({
      npc: { id: "june_pike", room: "byre_mouth" },
      node: { id: "june_drive_cattle_first" },
    });
    expect(enumerateRpgActions(index, restored).map((option) => option.id)).toContain(
      "ask_acknowledge",
    );
    expect(() => assertRpgStateReferences(index, restored)).not.toThrow();
  });
});

describe("TALK fails closed when two co-present people share a name", () => {
  // The shipped pack no longer duplicates June, but the resolver must still fail
  // closed if another pack authors two genuinely co-present identical names.
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
