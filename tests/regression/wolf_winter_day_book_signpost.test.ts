/**
 * Regression (§15) for bug_0399 — The Wolf-Winter's perfect score depends on
 * reading the byre-yard day-book, but the urgent first scene did not give a
 * player a strong reason to do it before following Cade's obvious combat plan.
 *
 * A blind playtest (2026-06-20, seed 7) followed the natural prepared route,
 * skipped the day-book, won cleanly, and ended at 55/60 with no idea where the
 * missing 5 points lived. The score economy is sound — the day-book is an
 * intentional +5 clue/prep beat — so the fix is a stronger in-room signpost, not
 * moving or deleting the award.
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
import { makeStep } from "../../src/core/engine.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

const options = (s: GameState) => enumerateRpgActions(index, s);
const desc = (s: GameState): string => buildRpgObservation(index, s).description;

function act(s: GameState, pred: (a: Action) => boolean): GameState {
  const opt = options(s).find((o) => pred(o.action));
  if (!opt)
    throw new Error(
      `no action; legal=[${options(s)
        .map((o) => o.id)
        .join(", ")}] in ${s.current}`,
    );
  const r = step(s, opt.action);
  expect(r.ok).toBe(true);
  return r.state;
}

const move = (dir: string) => (a: Action) => a.type === "MOVE" && a.direction === dir;
const read = (target: string) => (a: Action) =>
  a.type === "READ" && (a as { target?: string }).target === target;

describe("bug_0399 — wolf_winter signposts the score-bearing day-book", () => {
  it("before reading, the byre-yard text points at the day-book as worth reading", () => {
    let s = initStateForRpgPack(index, 7);
    s = act(s, move("north"));

    const text = desc(s).toLowerCase();
    expect(text).toContain("lantern");
    expect(text).toContain("day-book");
    expect(text).toContain("worth reading");
    expect(text).toContain("before you leave the yard");
    expect(options(s).map((o) => o.id)).toContain("read_day_book");
  });

  it("after reading, the room acknowledges the checked wolf-count instead of re-urging it", () => {
    let s = initStateForRpgPack(index, 7);
    s = act(s, move("north"));
    s = act(s, read("day_book"));

    const text = desc(s).toLowerCase();
    expect(text).toContain("you checked its last wolf-count");
    expect(text).not.toContain("worth reading before you leave the yard");
    expect(s.flags.read_tally).toBe(true);
  });

  it("the fix is signposting only: the day-book still awards exactly +5 and no stats", () => {
    let s = initStateForRpgPack(index, 7);
    s = act(s, move("north"));
    const before = s;
    s = act(s, read("day_book"));

    expect((s.vars.score ?? 0) - (before.vars.score ?? 0)).toBe(5);
    expect(s.vars.attack).toBe(before.vars.attack);
    expect(s.vars.defense).toBe(before.vars.defense);
    expect(s.vars.hp).toBe(before.vars.hp);
    expect(validateRpg(pack).findings).toHaveLength(0);
  });
});
