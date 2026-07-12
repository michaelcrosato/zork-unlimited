/**
 * Regression for preparation-object state in wolf_winter. The jerkin remains a
 * takeable object whose room prose follows it; the rail starts as target-only scenery.
 * A failed wedge may bind its joined lengths into separate non-droppable guard gear,
 * which the flank-wolf consumes rather than leaving stale inventory behind.
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

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const index = indexRpgPack(loaded.compiled.pack);
const step = makeStep(buildRpgRules(index));

function actById(s: GameState, id: string): { state: GameState; events: GameEvent[] } {
  const options = enumerateRpgActions(index, s);
  const opt = options.find((o) => o.id === id);
  if (!opt) {
    throw new Error(`"${id}" not legal in ${s.current}: [${options.map((o) => o.id).join(", ")}]`);
  }
  const result = step(s, opt.action);
  expect(result.ok).toBe(true);
  return { state: result.state, events: result.events };
}

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    s = actById(s, id).state;
  }
  return s;
}

const desc = (s: GameState): string => buildRpgObservation(index, s).description;

const commands = (s: GameState): string[] => enumerateRpgActions(index, s).map((o) => o.command);

function narrations(events: GameEvent[]): string {
  return events
    .filter(
      (event): event is Extract<GameEvent, { type: "narration" }> => event.type === "narration",
    )
    .map((event) => event.text)
    .join(" ");
}

function lookNarration(s: GameState): string {
  const res = resolveRpgAction(index, s, { type: "LOOK" });
  const effect = res?.effects[0];
  if (!effect || !("narrate" in effect)) throw new Error("LOOK produced no narration");
  return effect.narrate;
}

describe("wolf_winter rooms react to preparation object state", () => {
  it("removes the peg-hung jerkin prose after the byre-jerkin is taken", () => {
    let s = play(initStateForRpgPack(index, 83), ["go_north", "go_west"]);
    const taken = actById(s, "take_byre_jerkin");
    s = taken.state;

    expect(s.inventory).toContain("byre_jerkin");
    expect(s.flags["byre_jerkin_taken"]).toBe(true);
    expect(s.flags["jerkin_donned"]).toBeUndefined();
    expect(s.vars.defense).toBe(3);
    expect(s.vars.score ?? 0).toBe(0);
    expect(narrations(taken.events)).toContain("not yet on your back");
    expect(narrations(taken.events)).toMatch(/Drag it on before you go north/i);
    expect(commands(s)).toContain("don padded byre-jerkin");
    expect(commands(s)).not.toContain("drop padded byre-jerkin");
    expect(desc(s)).toContain(
      "peg by the door is bare where the steading's padded byre-jerkin hung",
    );
    expect(desc(s)).toContain("not yet on your back");
    expect(desc(s)).toContain("carried hide will not turn teeth");
    expect(desc(s)).not.toContain("On a peg by the door hangs");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("retires the carried-but-unworn jerkin warning after the byre-jerkin is donned", () => {
    let s = play(initStateForRpgPack(index, 83), ["go_north", "go_west", "take_byre_jerkin"]);
    const donned = actById(s, "use_byre_jerkin");
    s = donned.state;

    expect(s.flags["jerkin_donned"]).toBe(true);
    expect(s.vars.defense).toBe(5);
    expect(s.vars.score).toBe(5);
    expect(s.inventory).toContain("byre_jerkin");
    expect(commands(s)).not.toContain("don padded byre-jerkin");
    expect(commands(s)).not.toContain("drop padded byre-jerkin");
    expect(narrations(donned.events)).toContain("drag the padded byre-jerkin on");
    expect(narrations(donned.events)).not.toContain("off its peg");
    expect(desc(s)).toContain(
      "peg by the door is bare where the steading's padded byre-jerkin hung",
    );
    expect(desc(s)).not.toContain("not yet on your back");
    expect(desc(s)).not.toContain("carried hide will not turn teeth");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("rejects a forced DROP after donning instead of retaining armor with no item", () => {
    const s = play(initStateForRpgPack(index, 83), [
      "go_north",
      "go_west",
      "take_byre_jerkin",
      "use_byre_jerkin",
    ]);
    const dropped = step(s, { type: "DROP", item: "byre_jerkin" });

    expect(dropped.ok).toBe(false);
    expect(dropped.state).toBe(s);
    expect(s.inventory).toContain("byre_jerkin");
    expect(s.flags["jerkin_donned"]).toBe(true);
    expect(s.vars.defense).toBe(5);
  });

  it("keeps the paling rail in-place and offers its target-only wedge, never TAKE/DROP", () => {
    const s = play(initStateForRpgPack(index, 83), ["go_north", "go_north"]);
    const ids = enumerateRpgActions(index, s).map((option) => option.id);
    const rail = loaded.compiled.pack.objects.find((object) => object.id === "paling_rail");

    expect(rail?.takeable).not.toBe(true);
    expect(s.inventory).not.toContain("paling_rail");
    expect(ids).toContain("use_paling_rail");
    expect(ids).not.toContain("take_paling_rail");
    expect(ids).not.toContain("drop_paling_rail");
    expect(desc(s)).toContain("fallen clear into the snow at your feet");
    expect(lookNarration(s)).toBe(desc(s));
  });
});
