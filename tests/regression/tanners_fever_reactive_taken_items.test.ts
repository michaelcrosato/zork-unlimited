/**
 * Regression for stale room-item prose in tanners_fever: the stores kept
 * placing taken medical evidence at their starting positions.
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
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/quests/tanners_fever.yaml");
if (!loaded.ok) throw new Error("tanners_fever must compile");
const index = indexRpgPack(loaded.compiled.pack);
const step = makeStep(buildRpgRules(index));

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
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
    s = result.state;
  }
  return s;
}

const desc = (s: GameState): string => buildRpgObservation(index, s).description;

function lookNarration(s: GameState): string {
  const res = resolveRpgAction(index, s, { type: "LOOK" });
  const effect = res?.effects[0];
  if (!effect || !("narrate" in effect)) throw new Error("LOOK produced no narration");
  return effect.narrate;
}

describe("tanners_fever stores react to taken medical evidence", () => {
  it("removes the open-ledger prose after Godwin's case notes are taken", () => {
    const s = play(initStateForRpgPack(index, 79), ["go_west", "take_godwin_notes"]);

    expect(s.inventory).toContain("godwin_notes");
    expect(s.flags["godwin_notes_taken"]).toBe(true);
    expect(desc(s)).toContain(
      "Godwin's case notes were taken. Before treatment, retrieve and READ Godwin's case notes only if that evidence is unfinished",
    );
    expect(desc(s)).not.toContain("Before treatment, TAKE and READ them");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the notes' starting place empty after they are dropped", () => {
    const s = play(initStateForRpgPack(index, 79), [
      "go_west",
      "take_godwin_notes",
      "drop_godwin_notes",
    ]);

    expect(s.inventory).not.toContain("godwin_notes");
    expect(s.flags["godwin_notes_taken"]).toBe(true);
    expect(desc(s)).toContain(
      "Godwin's case notes were taken. Before treatment, retrieve and READ Godwin's case notes only if that evidence is unfinished",
    );
    expect(desc(s)).not.toContain("Before treatment, TAKE and READ them");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("does not claim the notes are in hand after they are read and dropped", () => {
    const s = play(initStateForRpgPack(index, 79), [
      "go_west",
      "take_godwin_notes",
      "read_godwin_notes",
      "drop_godwin_notes",
    ]);

    expect(s.inventory).not.toContain("godwin_notes");
    expect(s.flags["godwin_notes_taken"]).toBe(true);
    expect(s.flags["notes_read"]).toBe(true);
    expect(desc(s)).toContain("You READ Godwin's case notes and gained +3 physick");
    expect(desc(s)).not.toContain("You have Godwin's case notes");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps sickroom guidance truthful when case notes are dropped before or after reading", () => {
    const unread = play(initStateForRpgPack(index, 79), [
      "go_west",
      "take_godwin_notes",
      "drop_godwin_notes",
      "go_east",
    ]);
    expect(unread.inventory).not.toContain("godwin_notes");
    expect(desc(unread)).toContain("Godwin's case notes were taken");
    expect(desc(unread)).toContain(
      "Complete only unfinished reading, Edric's examination, or meadowsweet identification",
    );
    expect(desc(unread)).not.toMatch(/in your hand|you carry/i);
    expect(lookNarration(unread)).toBe(desc(unread));

    const read = play(initStateForRpgPack(index, 79), [
      "go_west",
      "take_godwin_notes",
      "read_godwin_notes",
      "drop_godwin_notes",
      "go_east",
    ]);
    expect(read.inventory).not.toContain("godwin_notes");
    expect(desc(read)).toContain(
      "You READ Godwin's case notes and confirmed the wormwood overdose",
    );
    expect(desc(read)).not.toMatch(/in your hand|you carry/i);
    expect(lookNarration(read)).toBe(desc(read));
  });

  it("removes the green-bundle prose after meadowsweet is taken", () => {
    const s = play(initStateForRpgPack(index, 79), ["go_east", "take_meadowsweet"]);

    expect(s.inventory).toContain("meadowsweet");
    expect(s.flags["meadowsweet_taken"]).toBe(true);
    expect(desc(s)).toContain("The meadowsweet was taken");
    expect(desc(s)).not.toContain("Before treatment, TAKE and INSPECT it");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the meadowsweet hook empty after the bundle is dropped", () => {
    const s = play(initStateForRpgPack(index, 79), [
      "go_east",
      "take_meadowsweet",
      "drop_meadowsweet",
    ]);

    expect(s.inventory).not.toContain("meadowsweet");
    expect(s.flags["meadowsweet_taken"]).toBe(true);
    expect(desc(s)).toContain("The meadowsweet was taken");
    expect(desc(s)).toContain(
      "If treatment and identification are unfinished, retrieve and LOOK AT meadowsweet",
    );
    expect(desc(s)).not.toContain("You have the meadowsweet");
    expect(lookNarration(s)).toBe(desc(s));
  });
});
