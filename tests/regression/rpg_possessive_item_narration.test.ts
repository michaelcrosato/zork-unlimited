import { describe, expect, it } from "vitest";

import type { StepResult } from "../../src/api/types.js";
import { makeStep } from "../../src/core/engine.js";
import { hashState } from "../../src/core/hash.js";
import type { GameState } from "../../src/core/state.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
  type RpgIndex,
} from "../../src/rpg/runner.js";
import { RpgPackSchema } from "../../src/rpg/schema.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";

const SYNTHETIC_PACK = RpgPackSchema.parse({
  meta: {
    id: "possessive_narration_fixture",
    title: "Possessive narration fixture",
    start_room: "room",
  },
  rooms: [
    {
      id: "room",
      name: "Fixture room",
      description: "A bare room for object narration.",
      objects: [
        "cade_feed",
        "fen_schedule",
        "barrow_circlet",
        "old_cade_ledger",
        "iron_lantern",
        "factor_ledger",
        "proper_coffer",
        "ordinary_box",
        "generic_box",
      ],
    },
  ],
  objects: [
    {
      id: "cade_feed",
      name: "Cade's feed sack",
      description: "A feed sack.",
      takeable: true,
    },
    {
      id: "fen_schedule",
      name: "Fen’s schedule",
      description: "A schedule.",
      takeable: true,
    },
    {
      id: "barrow_circlet",
      name: "Barrow-Lord's circlet",
      description: "A circlet.",
      takeable: true,
    },
    {
      id: "old_cade_ledger",
      name: "Old Cade's field ledger",
      description: "A field ledger.",
      takeable: true,
    },
    {
      id: "iron_lantern",
      name: "iron lantern",
      description: "An iron lantern.",
      takeable: true,
    },
    {
      id: "factor_ledger",
      name: "factor's ledger",
      description: "A factor's ledger.",
      takeable: true,
    },
    {
      id: "proper_coffer",
      name: "Old Barrow-Lord’s iron coffer",
      description: "A named owner's coffer.",
      container: true,
      openable: true,
      locked: true,
      key_id: "iron_key",
    },
    {
      id: "ordinary_box",
      name: "iron strongbox",
      description: "An ordinary strongbox.",
      container: true,
      openable: true,
    },
    {
      id: "generic_box",
      name: "factor's strongbox",
      description: "A generic owner's strongbox.",
      container: true,
      openable: true,
    },
    {
      id: "iron_key",
      name: "iron key",
      description: "A key.",
      held: true,
    },
  ],
  win_conditions: [
    {
      id: "unreachable",
      conditions: [{ has_flag: "unreachable" }],
      ending: "never",
    },
  ],
  endings: [{ id: "never", title: "Never", text: "Never reached." }],
});

const syntheticIndex = indexRpgPack(SYNTHETIC_PACK);

function stepById(index: RpgIndex, state: GameState, id: string): StepResult {
  const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === id);
  expect(
    option,
    `expected ${id} in ${state.current}; legal=${enumerateRpgActions(index, state)
      .map((candidate) => candidate.id)
      .join(",")}`,
  ).toBeDefined();
  if (!option) throw new Error(`missing ${id}`);
  const result = makeStep(buildRpgRules(index))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result;
}

function narrationTexts(result: StepResult): string[] {
  return result.events.flatMap((event) => (event.type === "narration" ? [event.text] : []));
}

const TAKE_DROP_CASES = [
  ["straight proper owner", "cade_feed", "Cade's feed sack"],
  ["curly proper owner", "fen_schedule", "Fen’s schedule"],
  ["hyphenated proper owner", "barrow_circlet", "Barrow-Lord's circlet"],
  ["multiword proper owner", "old_cade_ledger", "Old Cade's field ledger"],
  ["ordinary noun phrase", "iron_lantern", "the iron lantern"],
  ["lowercase generic owner", "factor_ledger", "the factor's ledger"],
] as const;

describe("default RPG object narration uses grammatical definite noun phrases", () => {
  it.each(TAKE_DROP_CASES)("%s keeps TAKE/DROP state deterministic", (_label, id, phrase) => {
    const initial = initStateForRpgPack(syntheticIndex, 907);
    const initialHash = hashState(initial);

    const firstTake = stepById(syntheticIndex, initial, `take_${id}`);
    const secondTake = stepById(syntheticIndex, initial, `take_${id}`);
    expect(narrationTexts(firstTake)).toEqual([`You take ${phrase}.`]);
    expect(firstTake.state).toEqual({
      ...initial,
      step: initial.step + 1,
      inventory: [...initial.inventory, id],
    });
    expect(hashState(firstTake.state)).toBe(hashState(secondTake.state));
    expect(hashState(initial)).toBe(initialHash);

    const firstDrop = stepById(syntheticIndex, firstTake.state, `drop_${id}`);
    const secondDrop = stepById(syntheticIndex, secondTake.state, `drop_${id}`);
    expect(narrationTexts(firstDrop)).toEqual([`You drop ${phrase}.`]);
    expect(firstDrop.state).toEqual({
      ...initial,
      step: initial.step + 2,
      objectState: { [id]: { room: "room", takenBy: "player" } },
    });
    expect(hashState(firstDrop.state)).toBe(hashState(secondDrop.state));
  });

  it("applies the same noun phrase to UNLOCK/OPEN/CLOSE without changing their state", () => {
    const run = (): GameState => {
      let state = initStateForRpgPack(syntheticIndex, 908);

      const unlocked = stepById(syntheticIndex, state, "unlock_proper_coffer");
      expect(narrationTexts(unlocked)).toEqual(["You unlock Old Barrow-Lord’s iron coffer."]);
      state = unlocked.state;

      const openedProper = stepById(syntheticIndex, state, "open_proper_coffer");
      expect(narrationTexts(openedProper)).toEqual(["You open Old Barrow-Lord’s iron coffer."]);
      state = openedProper.state;

      const closedProper = stepById(syntheticIndex, state, "close_proper_coffer");
      expect(narrationTexts(closedProper)).toEqual(["You close Old Barrow-Lord’s iron coffer."]);
      state = closedProper.state;

      const openedOrdinary = stepById(syntheticIndex, state, "open_ordinary_box");
      expect(narrationTexts(openedOrdinary)).toEqual(["You open the iron strongbox."]);
      state = openedOrdinary.state;

      const closedOrdinary = stepById(syntheticIndex, state, "close_ordinary_box");
      expect(narrationTexts(closedOrdinary)).toEqual(["You close the iron strongbox."]);
      state = closedOrdinary.state;

      const openedGeneric = stepById(syntheticIndex, state, "open_generic_box");
      expect(narrationTexts(openedGeneric)).toEqual(["You open the factor's strongbox."]);
      state = openedGeneric.state;

      const closedGeneric = stepById(syntheticIndex, state, "close_generic_box");
      expect(narrationTexts(closedGeneric)).toEqual(["You close the factor's strongbox."]);
      return closedGeneric.state;
    };

    const first = run();
    const second = run();
    const initial = initStateForRpgPack(syntheticIndex, 908);
    expect(first).toEqual({
      ...initial,
      step: initial.step + 7,
      objectState: {
        proper_coffer: { locked: false, open: false },
        ordinary_box: { open: false },
        generic_box: { open: false },
      },
    });
    expect(hashState(first)).toBe(hashState(second));
  });
});

const loadedWolf = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loadedWolf.ok) throw new Error("wolf_winter must compile");
const wolfIndex = indexRpgPack(loadedWolf.compiled.pack);
const WOLF_FEED_JOURNAL =
  "You take Cade's finite feed. It must carry one trail through all three encounters; a fouled cast cannot be restocked.";

function reachWolfStore(): GameState {
  let state = initStateForRpgPack(wolfIndex, 4402);
  for (const id of [
    "go_north",
    "talk_houndsman",
    "ask_lure",
    "ask_commit_lure",
    "ask_leave",
    "go_west",
  ]) {
    state = stepById(wolfIndex, state, id).state;
  }
  return state;
}

describe("Wolf-Winter authored possessive item narration", () => {
  it("takes Cade's real winter-feed sack without a duplicate article or state drift", () => {
    const before = reachWolfStore();
    const beforeHash = hashState(before);
    const option = enumerateRpgActions(wolfIndex, before).find(
      (candidate) => candidate.id === "take_winter_feed_sack",
    );
    expect(option?.command).toBe("take Cade's winter-feed sack");

    const first = stepById(wolfIndex, before, "take_winter_feed_sack");
    const second = stepById(wolfIndex, before, "take_winter_feed_sack");
    expect(first.events).toEqual([
      { type: "take", item: "winter_feed_sack" },
      { type: "narration", text: "You take Cade's winter-feed sack." },
      { type: "state_change", effect: "add_journal", text: WOLF_FEED_JOURNAL },
    ]);
    expect(first.state).toEqual({
      ...before,
      step: before.step + 1,
      inventory: [...before.inventory, "winter_feed_sack"],
      journal: [...before.journal, WOLF_FEED_JOURNAL],
    });
    expect(hashState(first.state)).toBe(hashState(second.state));
    expect(hashState(before)).toBe(beforeHash);
  });
});
