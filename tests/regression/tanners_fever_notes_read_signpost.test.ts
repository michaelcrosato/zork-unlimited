/**
 * Regression (§15) for bug_0404 — Tanner's Fever made EXAMINE and READ on
 * Godwin's notes look equivalent, but only READ awarded the overdose evidence.
 *
 * A blind playtest (2026-06-21, seed 7) examined the notes first, saw the exact
 * three-to-one formula, and reasonably treated that as sufficient. The stateful
 * evidence actually lives behind READ, so inspection must signpost close reading
 * instead of disclosing the load-bearing numbers without the matching state.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { makeStep } from "../../src/core/engine.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import type { GameEvent } from "../../src/core/events.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/quests/tanners_fever.yaml");
if (!loaded.ok) throw new Error("tanners_fever must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));

function play(s: GameState, id: string): { state: GameState; events: GameEvent[] } {
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

function narration(events: GameEvent[]): string {
  return events
    .filter((e): e is Extract<GameEvent, { type: "narration" }> => e.type === "narration")
    .map((e) => e.text)
    .join("\n");
}

describe("bug_0404 — tanners_fever signposts reading Godwin's notes", () => {
  it("does not reveal the exact overdose formula through examine-only play", () => {
    let s = initStateForRpgPack(index, 7);
    s = play(s, "go_west").state;

    const examined = play(s, "examine_godwin_notes");
    const examineText = narration(examined.events);
    expect(examineText).toMatch(/close read|read/i);
    expect(examineText).not.toMatch(/three parts wormwood extract to one part water/i);
    expect(examineText).not.toMatch(/three to one/i);
    expect(examined.state.flags.notes_read).toBeUndefined();
    expect(examined.state.vars.physick).toBe(3);

    const taken = play(examined.state, "take_godwin_notes");
    expect(narration(taken.events)).toMatch(/read the notes closely/i);
    expect(taken.state.flags.godwin_notes_taken).toBe(true);

    const examinedInHand = play(taken.state, "examine_godwin_notes");
    const inHandText = narration(examinedInHand.events);
    expect(inHandText).toMatch(/reading them carefully/i);
    expect(inHandText).not.toMatch(/three parts wormwood extract to one part water/i);
    expect(inHandText).not.toMatch(/three to one/i);
  });

  it("keeps the exact formula, score, and physick gain on READ", () => {
    let s = initStateForRpgPack(index, 7);
    s = play(s, "go_west").state;
    s = play(s, "take_godwin_notes").state;

    const read = play(s, "read_godwin_notes");
    const readText = narration(read.events);
    expect(readText).toMatch(/three parts extract to one part water/i);
    expect(readText).toMatch(/three to one against the reference standard of one to one/i);
    expect(read.state.flags.notes_read).toBe(true);
    expect(read.state.vars.physick).toBe(6);
    expect(read.state.vars.score).toBe(10);
    expect(validateRpg(pack).findings).toHaveLength(0);
  });
});
