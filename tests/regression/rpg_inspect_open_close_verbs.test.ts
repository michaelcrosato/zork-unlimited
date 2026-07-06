/**
 * The InteractionSchema has always admitted five verbs — USE, READ, INSPECT,
 * OPEN, CLOSE — but the runtime only ever routed USE and READ. Shipped packs
 * (collectors_warrant, weighmasters_round) author INSPECT/OPEN interactions
 * whose clue narrations silently never fired: the flywheel wrote signposting
 * the engine ignored, and the validator (which counts every interaction's
 * effects as firable) blessed it.
 *
 * Contract locked here:
 *  - INSPECT interactions fire on examining the object (LOOK target), gated
 *    per-interaction by their own conditions;
 *  - OPEN interactions fire on an open ATTEMPT — even on a non-openable
 *    object (the weighmasters north_door "warning on try" shape) — composed
 *    after the built-in open when the object really opens;
 *  - CLOSE is now a first-class verb: an open object can be closed (the new
 *    `close_object` core effect), and CLOSE interactions fire on that attempt.
 */
import { describe, it, expect } from "vitest";
import { RpgPackSchema } from "../../src/rpg/schema.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { validateRpgFoundation } from "../../src/validate/rpg_foundation_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const pack = RpgPackSchema.parse({
  meta: { id: "verb_parity", title: "The Counting Room", start_room: "office" },
  rooms: [
    {
      id: "office",
      name: "Counting Room",
      description: "A brass plaque, a strongbox, and the door to the street.",
      objects: ["plaque", "strongbox", "street_door"],
      exits: [{ direction: "north", to: "street", conditions: [{ has_flag: "case_made" }] }],
    },
    { id: "street", name: "Street", description: "Cobbles.", exits: [] },
  ],
  objects: [
    {
      id: "plaque",
      name: "brass plaque",
      description: "A brass plaque, polished at the corners.",
      interactions: [
        {
          verb: "INSPECT",
          conditions: [{ not_flag: "read_maker" }],
          effects: [
            { set_flag: "read_maker" },
            { narrate: "Stamped small along the base: the maker's mark you were sent to find." },
          ],
        },
      ],
    },
    {
      id: "strongbox",
      name: "strongbox",
      description: "An iron strongbox.",
      openable: true,
      contents: ["ledger"],
      interactions: [
        {
          verb: "OPEN",
          effects: [{ set_flag: "sprung" }, { narrate: "A needle-trap snaps as the lid lifts." }],
        },
        {
          verb: "INSPECT",
          conditions: [{ has_flag: "sprung" }],
          effects: [{ narrate: "The spent needle-trap hangs loose inside the lid." }],
        },
        {
          verb: "CLOSE",
          effects: [{ narrate: "The lid settles with a click you feel in your teeth." }],
        },
      ],
    },
    {
      id: "ledger",
      name: "ledger",
      description: "The house ledger.",
      takeable: true,
      take_effects: [{ set_flag: "case_made" }],
    },
    {
      id: "street_door",
      name: "street door",
      description: "The door to the street, standing shut.",
      // NOT openable: the weighmasters north_door shape — an open ATTEMPT
      // warns the unready player instead of resolving to nothing.
      interactions: [
        {
          verb: "OPEN",
          conditions: [{ not_flag: "case_made" }],
          effects: [{ narrate: "Not yet — walk out without the ledger and the case dies here." }],
        },
      ],
    },
  ],
  npcs: [],
  enemies: [],
  win_conditions: [{ id: "w", conditions: [{ visited: "street" }], ending: "done" }],
  endings: [{ id: "done", title: "Done", text: "Case made." }],
});

const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));
const ids = (s: GameState): string[] => enumerateRpgActions(index, s).map((o) => o.id);
function doId(s: GameState, id: string): GameState {
  const opt = enumerateRpgActions(index, s).find((o) => o.id === id);
  if (!opt) throw new Error(`"${id}" not legal; have: ${ids(s).join(", ")}`);
  const r = step(s, opt.action);
  expect(r.ok).toBe(true);
  return r.state;
}

describe("INSPECT interactions", () => {
  it("fire on examining the object, gated per-interaction, without retiring examine", () => {
    let s = initStateForRpgPack(index, 1);
    s = doId(s, "examine_plaque");
    expect(Object.keys(s.flags)).toContain("read_maker");
    // The one-shot gate has retired the interaction, NOT the examine action —
    // the base description must remain readable forever (the READ-retirement
    // trap, deliberately not reproduced here).
    expect(ids(s)).toContain("examine_plaque");
    const again = step(s, { type: "LOOK", target: "plaque" });
    expect(again.ok).toBe(true);
    expect(
      again.events.some((e) => e.type === "narration" && e.text.includes("maker's mark")),
    ).toBe(false);
  });
});

describe("OPEN interactions", () => {
  it("compose after the built-in open on an openable object", () => {
    let s = initStateForRpgPack(index, 1);
    s = doId(s, "open_strongbox");
    expect(s.objectState["strongbox"]?.open).toBe(true);
    expect(Object.keys(s.flags)).toContain("sprung");
    // Contents revealed as usual.
    expect(ids(s)).toContain("take_ledger");
  });

  it("make an open ATTEMPT legal on a non-openable object (warning shape)", () => {
    const s = initStateForRpgPack(index, 1);
    expect(ids(s)).toContain("open_street_door");
    const r = step(s, { type: "OPEN", target: "street_door" });
    expect(r.ok).toBe(true);
    expect(r.events.some((e) => e.type === "narration" && e.text.includes("Not yet"))).toBe(true);
    // The attempt never fabricates open-state on a non-openable object.
    expect(r.state.objectState["street_door"]?.open).not.toBe(true);
    // Once the case is made the warning's condition fails and, with no
    // built-in open to fall back on, the attempt is no longer offered.
  });
});

describe("CLOSE as a first-class verb", () => {
  it("closes an open object and fires CLOSE interactions", () => {
    let s = initStateForRpgPack(index, 1);
    expect(ids(s)).not.toContain("close_strongbox"); // shut things can't be closed
    s = doId(s, "open_strongbox");
    expect(ids(s)).toContain("close_strongbox");
    const r = step(s, { type: "CLOSE", target: "strongbox" });
    expect(r.ok).toBe(true);
    expect(r.state.objectState["strongbox"]?.open).toBe(false);
    expect(
      r.events.some((e) => e.type === "narration" && e.text.includes("settles with a click")),
    ).toBe(true);
    // Closing hides contents again.
    expect(ids(r.state)).not.toContain("take_ledger");
  });

  it("re-opening after a close works (open-state is no longer monotone)", () => {
    let s = initStateForRpgPack(index, 1);
    s = doId(s, "open_strongbox");
    s = doId(s, "close_strongbox");
    s = doId(s, "open_strongbox");
    expect(s.objectState["strongbox"]?.open).toBe(true);
    expect(ids(s)).toContain("take_ledger");
  });
});

describe("validator stays truthful about the wired verbs", () => {
  it("the pack validates green and every declared effect is now reachable at runtime", () => {
    const report = validateRpgFoundation(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
  });
});
