/**
 * Regression (§15) for bug_0088 — THE COLD FORGE's phantom "smith's hammer".
 *
 * The Founder's Cell names "a smith's hammer across his knees" in its room
 * description (and the founder's plate-taken examine variant repeats it), yet
 * until this cycle no `hammer` object backed that prose: the room's `objects`
 * list was [founder, epitaph, cold_iron_plate], so the hammer appeared in no
 * visible_objects entry and offered no examine/take action — a Chekhov's gun a
 * curious player hunts for and finds nothing. A fresh MCP-only, source-blind
 * blind playtester (seed 37, ai-runs/2026-06-01T23-06-34-239Z/playtest.md
 * §4/§5) re-surfaced it as the pack's #1 friction point; first flagged the
 * prior cycle's seed-23 pass and deferred to here.
 *
 * The fix adds a `hammer` object that is deliberately a FLAVOUR examine,
 * NON-TAKEABLE: it pays off the curiosity and deepens the founder without adding
 * a second tactical item to balance (the cold-iron plate stays the cell's one
 * earned tactical choice, bug_0076). Purely additive — no room/combat/score/
 * exit/flag/lever/ending is touched, and examining the hammer changes no state.
 *
 * Locked here:
 *   (1) the pack still validates green under the full RPG validator;
 *   (2) the Founder's Cell now exposes a `hammer` LOOK target whose prose names
 *       a hammer (the curiosity has a payoff);
 *   (3) the hammer is NON-TAKEABLE — no TAKE action is offered and a forced TAKE
 *       is rejected;
 *   (4) examining the hammer is INERT — no flag/var/score change, game not ended;
 *   (5) the room description and the founder's plate-taken variant both STILL name
 *       the hammer (the prose the object now answers is intact).
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadRpgPackFile("content/rpg/pack/cold_forge.yaml");
if (!loaded.ok) throw new Error("cold_forge must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));

const score = (s: GameState): number => buildRpgObservation(index, s).score;
const options = (s: GameState) => enumerateRpgActions(index, s);

function run(s: GameState, pred: (a: Action) => boolean): { state: GameState; events: unknown[] } {
  const opt = options(s).find((o) => pred(o.action));
  if (!opt)
    throw new Error(
      `no action; legal=[${options(s)
        .map((o) => o.id)
        .join(", ")}] in ${s.current}`,
    );
  const r = step(s, opt.action);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("step failed");
  return { state: r.state, events: r.events };
}
const act = (s: GameState, pred: (a: Action) => boolean): GameState => run(s, pred).state;

const move = (dir: string) => (a: Action) => a.type === "MOVE" && a.direction === dir;
const lookAt = (target: string) => (a: Action) =>
  a.type === "LOOK" && (a as { target?: string }).target === target;
const takeItem = (item: string) => (a: Action) =>
  a.type === "TAKE" && (a as { item?: string }).item === item;

/** Narration text produced by stepping an action (the reactive examine prose). */
function narration(s: GameState, pred: (a: Action) => boolean): string {
  const { events } = run(s, pred);
  return (events as { type: string; text?: string }[])
    .filter((e) => e.type === "narration")
    .map((e) => e.text ?? "")
    .join(" ");
}

/** Walk to the Outer Forge and step into the Founder's Cell to the west. */
function enterCell(seed = 37): GameState {
  let s = initStateForRpgPack(index, seed);
  s = act(s, move("down")); // → outer_forge
  s = act(s, move("west")); // → founder_cell
  expect(s.current).toBe("founder_cell");
  return s;
}

describe("bug_0088 — The Cold Forge's named 'smith's hammer' is now an interactable (flavour) object", () => {
  it("(1) the pack still validates green under the full RPG validator", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("(2) the Founder's Cell exposes a hammer LOOK target whose prose names a hammer", () => {
    const s = enterCell();
    expect(options(s).some((o) => lookAt("hammer")(o.action))).toBe(true);
    const text = narration(s, lookAt("hammer")).toLowerCase();
    expect(text).toContain("hammer");
    expect(text.length).toBeGreaterThan(0);
  });

  it("(3) the hammer is NON-TAKEABLE: no TAKE offered, and a forced TAKE is rejected", () => {
    const s = enterCell();
    expect(options(s).some((o) => takeItem("hammer")(o.action))).toBe(false);
    const forced: Action = { type: "TAKE", item: "hammer" };
    const r = step(s, forced);
    expect(r.ok).toBe(false);
    expect(s.inventory).not.toContain("hammer");
  });

  it("(4) examining the hammer is inert: no flag/var/score change and the game does not end", () => {
    const before = enterCell();
    const flagsBefore = JSON.stringify(before.flags);
    const varsBefore = JSON.stringify(before.vars);
    const scoreBefore = score(before);

    const { state: after } = run(before, lookAt("hammer"));
    expect(JSON.stringify(after.flags)).toBe(flagsBefore);
    expect(JSON.stringify(after.vars)).toBe(varsBefore);
    expect(score(after)).toBe(scoreBefore);
    expect(after.ended).toBe(false);
  });

  it("(5) the prose the hammer answers is intact: room text and the plate-taken founder variant still name it", () => {
    let s = enterCell();
    // The room description still names the hammer (the object did not displace prose).
    const room = index.pack.rooms.find((r) => r.id === "founder_cell");
    expect(room?.description.toLowerCase()).toContain("hammer");
    // The founder's plate-taken examine variant still names the hammer.
    s = act(s, takeItem("cold_iron_plate"));
    expect(narration(s, lookAt("founder")).toLowerCase()).toContain("hammer");
  });
});
