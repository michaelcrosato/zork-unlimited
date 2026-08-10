/**
 * Regression for stale room-item prose in advocates_case: Marta's stall and
 * the charter office kept placing taken documents at their starting positions.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { resolveRpgAction } from "../../src/rpg/legal_actions.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameEvent } from "../../src/core/events.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/quests/advocates_case.yaml");
if (!loaded.ok) throw new Error("advocates_case must compile");
const index = indexRpgPack(loaded.compiled.pack);
const step = makeStep(buildRpgRules(index));

function act(s: GameState, id: string): { state: GameState; events: GameEvent[] } {
  const opt = enumerateRpgActions(index, s).find((o) => o.id === id);
  if (!opt) {
    throw new Error(
      `"${id}" not legal in ${s.current}: [${enumerateRpgActions(index, s)
        .map((o) => o.id)
        .join(", ")}]`,
    );
  }
  const result = step(s, opt.action);
  expect(result.ok).toBe(true);
  return { state: result.state, events: result.events };
}

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) s = act(s, id).state;
  return s;
}

const desc = (s: GameState): string => buildRpgObservation(index, s).description;

function lookNarration(s: GameState): string {
  const res = resolveRpgAction(index, s, { type: "LOOK" });
  const effect = res?.effects[0];
  if (!effect || !("narrate" in effect)) throw new Error("LOOK produced no narration");
  return effect.narrate;
}

function narrations(events: GameEvent[]): string {
  return events.flatMap((event) => (event.type === "narration" ? [event.text] : [])).join(" ");
}

function commandFor(s: GameState, id: string): string {
  const option = enumerateRpgActions(index, s).find((candidate) => candidate.id === id);
  if (!option) throw new Error(`Missing ${id} in ${s.current}`);
  return option.command;
}

describe("advocates_case rooms react to taken documents", () => {
  it("removes the charter-roll table prose after the charter roll is taken", () => {
    const s = play(initStateForRpgPack(index, 59), ["take_charter_roll"]);

    expect(s.inventory).toContain("charter_roll");
    expect(s.flags["charter_roll_taken"]).toBe(true);
    expect(desc(s)).toContain("near table is bare where Marta's charter roll lay");
    expect(desc(s)).not.toContain("The charter roll lies on the near table");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps Marta's table bare after the charter roll is dropped", () => {
    const s = play(initStateForRpgPack(index, 59), ["take_charter_roll", "drop_charter_roll"]);

    expect(s.inventory).not.toContain("charter_roll");
    expect(s.flags["charter_roll_taken"]).toBe(true);
    expect(desc(s)).toContain("near table is bare where Marta's charter roll lay");
    expect(desc(s)).not.toContain("The charter roll lies on the near table");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("takes and reads a certified register extract while the master register stays in the office", () => {
    const office = play(initStateForRpgPack(index, 59), ["go_east"]);
    const officeObs = buildRpgObservation(index, office);

    expect(officeObs.visible_objects).toContainEqual({
      id: "town_register",
      name: "certified register extract",
    });
    expect(officeObs.description).toContain("town's master charter register lies open");
    expect(officeObs.description).toContain("prepared a certified extract");
    expect(commandFor(office, "take_town_register")).toBe("take certified register extract");

    const taken = act(office, "take_town_register");
    expect(narrations(taken.events)).toBe("You take the certified register extract.");
    expect(taken.state.inventory).toContain("town_register");
    expect(taken.state.flags["town_register_taken"]).toBe(true);
    expect(desc(taken.state)).toContain("master charter register remains open");
    expect(desc(taken.state)).toContain("binding safely in the office");
    expect(commandFor(taken.state, "read_town_register")).toBe("read certified register extract");

    const inventory = act(taken.state, "inventory");
    expect(narrations(inventory.events)).toBe("You are carrying: certified register extract.");
    const read = act(inventory.state, "read_town_register");
    expect(narrations(read.events)).toContain(
      "The certified extract transcribes the third page of the master 1671 register",
    );
    expect(narrations(read.events)).toContain("The phrase is there in the clerk's certified copy");
    expect(read.state.inventory).toContain("town_register");
    expect(read.state.flags["register_read"]).toBe(true);
    expect(read.state.vars["rhetoric"]).toBe(6);
    expect(read.state.vars["score"]).toBe(10);
    expect(lookNarration(read.state)).toBe(desc(read.state));
  });

  it("keeps the master register in the office after its portable extract is dropped", () => {
    const s = play(initStateForRpgPack(index, 59), [
      "go_east",
      "take_town_register",
      "drop_town_register",
    ]);

    expect(s.inventory).not.toContain("town_register");
    expect(s.flags["town_register_taken"]).toBe(true);
    expect(desc(s)).toContain("master charter register remains open");
    expect(desc(s)).toContain("binding safely in the office");
    expect(desc(s)).toContain("space beside it is clear");
    expect(buildRpgObservation(index, s).visible_objects).toContainEqual({
      id: "town_register",
      name: "certified register extract",
    });
    expect(commandFor(s, "take_town_register")).toBe("take certified register extract");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("does not claim the register is still in hand after it is read and dropped", () => {
    const s = play(initStateForRpgPack(index, 59), [
      "go_east",
      "take_town_register",
      "read_town_register",
      "drop_town_register",
    ]);

    expect(s.inventory).not.toContain("town_register");
    expect(s.flags["register_read"]).toBe(true);
    expect(desc(s)).toContain("Walter Holm's certified extract has been read");
    expect(desc(s)).toContain("master 1671 register remains open");
    expect(desc(s)).toContain("bound pages stay in the office");
    expect(desc(s)).not.toMatch(
      /(?:extract|register) is (?:still )?(?:with you|in your hands)|you (?:carry|hold) (?:the )?(?:extract|register)/i,
    );
    expect(buildRpgObservation(index, s).visible_objects).toContainEqual({
      id: "town_register",
      name: "certified register extract",
    });
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("takes and reads a certified precedent packet while the master ledgers stay shelved", () => {
    const records = play(initStateForRpgPack(index, 59), ["go_west"]);
    const recordsObs = buildRpgObservation(index, records);

    expect(recordsObs.visible_objects).toContainEqual({
      id: "prior_convictions",
      name: "certified precedent packet",
    });
    expect(recordsObs.description).toContain("bound master conviction ledgers");
    expect(recordsObs.description).toContain("relevant master volume remains on its shelf");
    expect(recordsObs.description).toContain("clerk-certified packet");
    expect(commandFor(records, "take_prior_convictions")).toBe("take certified precedent packet");

    const taken = act(records, "take_prior_convictions");
    expect(narrations(taken.events)).toBe("You take the certified precedent packet.");
    expect(taken.state.inventory).toContain("prior_convictions");
    expect(taken.state.flags).toEqual(records.flags);
    expect(desc(taken.state)).toContain("bound master conviction ledgers");
    expect(desc(taken.state)).toContain("relevant master volume remains on its shelf");
    expect(commandFor(taken.state, "read_prior_convictions")).toBe(
      "read certified precedent packet",
    );

    const inventory = act(taken.state, "inventory");
    expect(narrations(inventory.events)).toBe("You are carrying: certified precedent packet.");
    const read = act(inventory.state, "read_prior_convictions");
    expect(narrations(read.events)).toContain("packet contains three certified extracts");
    expect(narrations(read.events)).toContain("The certified 1689 extract reproduces");
    expect(read.state.inventory).toContain("prior_convictions");
    expect(read.state.flags["priors_read"]).toBe(true);
    expect(read.state.vars["rhetoric"]).toBe(6);
    expect(read.state.vars["score"]).toBe(10);
  });

  it("never claims a read precedent packet is held after it is dropped", () => {
    const s = play(initStateForRpgPack(index, 59), [
      "go_west",
      "take_prior_convictions",
      "read_prior_convictions",
      "drop_prior_convictions",
    ]);

    expect(s.inventory).not.toContain("prior_convictions");
    expect(s.flags["priors_read"]).toBe(true);
    expect(desc(s)).toContain("certified precedent packet has been reviewed");
    expect(desc(s)).toContain("bound master conviction ledger remains on its shelf");
    expect(desc(s)).not.toMatch(
      /(?:packet|ledger) is (?:still )?(?:with you|in your hands)|you (?:carry|hold) (?:the )?(?:packet|ledger)/i,
    );
    expect(buildRpgObservation(index, s).visible_objects).toContainEqual({
      id: "prior_convictions",
      name: "certified precedent packet",
    });
    expect(commandFor(s, "take_prior_convictions")).toBe("take certified precedent packet");
    expect(lookNarration(s)).toBe(desc(s));
  });
});
