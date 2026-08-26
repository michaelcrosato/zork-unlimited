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
    expect(desc(s)).toContain("You took the charter roll");
    expect(desc(s)).not.toContain("The charter roll is on the near table");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps Marta's table bare after the charter roll is dropped", () => {
    const s = play(initStateForRpgPack(index, 59), ["take_charter_roll", "drop_charter_roll"]);

    expect(s.inventory).not.toContain("charter_roll");
    expect(s.flags["charter_roll_taken"]).toBe(true);
    expect(desc(s)).toContain("You took the charter roll");
    expect(desc(s)).not.toContain("The charter roll is on the near table");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("takes and reads a certified register extract while the master register stays in the office", () => {
    const office = play(initStateForRpgPack(index, 59), ["go_east"]);
    const officeObs = buildRpgObservation(index, office);

    expect(officeObs.visible_objects).toContainEqual({
      id: "town_register",
      name: "certified register extract",
    });
    expect(officeObs.description).toContain(
      "A certified register extract of Walter Holm's 1671 entry is beside the open master charter register",
    );
    expect(officeObs.description).toContain(
      "The extract can be taken; the master register stays here",
    );
    expect(commandFor(office, "take_town_register")).toBe("take certified register extract");

    const taken = act(office, "take_town_register");
    expect(narrations(taken.events)).toBe("You take the certified register extract.");
    expect(taken.state.inventory).toContain("town_register");
    expect(taken.state.flags["town_register_taken"]).toBe(true);
    expect(desc(taken.state)).toContain("You took the certified register extract");
    expect(desc(taken.state)).toContain("master charter register remains on the counter");
    expect(commandFor(taken.state, "read_town_register")).toBe("read certified register extract");

    const inventory = act(taken.state, "inventory");
    expect(narrations(inventory.events)).toBe("You are carrying: certified register extract.");
    const read = act(inventory.state, "read_town_register");
    expect(narrations(read.events)).toContain(
      "The certified register extract confirms Walter Holm's Royal Warrant",
    );
    expect(narrations(read.events)).toContain("You confirm the registered terms");
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
    expect(desc(s)).toContain("You took the certified register extract");
    expect(desc(s)).toContain("master charter register remains on the counter");
    expect(desc(s)).toContain("Go west to Marta's Stall");
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
    expect(desc(s)).toContain("You have read Walter Holm's certified register extract");
    expect(desc(s)).toContain("master 1671 register remains on the counter");
    expect(desc(s)).toContain("Go west to Marta's Stall");
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
    expect(recordsObs.description).toContain(
      "A certified precedent packet was kept here. TAKE certified precedent packet if it is here, or retrieve that packet if needed",
    );
    expect(recordsObs.description).toContain("master conviction ledger stays on its shelf");
    expect(recordsObs.description).toContain(
      "READ certified precedent packet only while that evidence remains unfinished",
    );
    expect(commandFor(records, "take_prior_convictions")).toBe("take certified precedent packet");

    const taken = act(records, "take_prior_convictions");
    expect(narrations(taken.events)).toBe("You take the certified precedent packet.");
    expect(taken.state.inventory).toContain("prior_convictions");
    expect(taken.state.flags).toEqual(records.flags);
    expect(desc(taken.state)).toContain(
      "A certified precedent packet was kept here. TAKE certified precedent packet if it is here, or retrieve that packet if needed",
    );
    expect(desc(taken.state)).toContain("master conviction ledger stays on its shelf");
    expect(commandFor(taken.state, "read_prior_convictions")).toBe(
      "read certified precedent packet",
    );

    const inventory = act(taken.state, "inventory");
    expect(narrations(inventory.events)).toBe("You are carrying: certified precedent packet.");
    const read = act(inventory.state, "read_prior_convictions");
    expect(narrations(read.events)).toContain(
      "packet records three district rulings from 1683, 1689, and 1691",
    );
    expect(narrations(read.events)).toContain("You confirm three matching rulings");
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
    expect(desc(s)).toContain("You have read the certified precedent packet");
    expect(desc(s)).toContain("master conviction ledger remains here");
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
