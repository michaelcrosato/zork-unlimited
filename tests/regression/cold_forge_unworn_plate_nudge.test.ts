/**
 * Regression (§15) for bug_0118 — THE COLD FORGE's carried-but-unworn plate is
 * legible at the moment of choice.
 *
 * A fresh source-blind MCP playtester (cold_forge, seed 7,
 * ai-runs/2026-06-02T11-14-01-076Z/playtest.md §4) rated the pack clarity 5/5,
 * enjoyment 4/5 and found ZERO functional bugs — its one friction point was the
 * take-then-don two-step on the founder's cold-iron plate: TAKE only carries it,
 * a separate USE ("don") buckles it on for the +2 defense. A hasty player can
 * therefore walk into the slag-sentinel fight with the plate slung loose at +0
 * defense and no nudge that they are under-armed; the only "+2 defense" feedback is
 * the journal line that appears when you DO don it, so the silent gap is easy to miss.
 *
 * The fix is content-only: a reactive Bellows Walk room `variant` that fires only
 * PRE-combat and only when the plate is held but not yet donned, turning the silent
 * gap into an honest prompt to buckle it on before the anvil-weight lands. The
 * existing `sentinel_stilled` variant is declared FIRST, so the broken-sentinel
 * prose still wins once the fight is over (first matching variant in declared order
 * wins — src/parser/model.ts roomDescription). Locked here:
 *   (1) the pack still validates green under the full RPG validator;
 *   (2) reaching the Bellows Walk with NO plate reads the base threat text and
 *       carries no "unbuckled" nudge;
 *   (3) reaching it with the plate held-but-not-donned reads the nudge variant
 *       (the plate "hangs loose and unbuckled", prompting "better to don it now");
 *   (4) reaching it with the plate DONNED reads the base text again — the nudge is
 *       gone, so it cannot nag a properly-armoured player;
 *   (5) declared-order precedence: with sentinel_stilled set, the broken-sentinel
 *       variant wins even while the plate is carried-unworn (post-combat is not
 *       nagged), proving the new variant cannot shadow the kill-state prose.
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
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadRpgSourceFile("content/rpg/quests/cold_forge.yaml");
if (!loaded.ok) throw new Error("cold_forge must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));

const obs = (s: GameState) => buildRpgObservation(index, s);
const options = (s: GameState) => enumerateRpgActions(index, s);
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

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
  if (!r.ok) throw new Error("step failed");
  return r.state;
}

const move = (dir: string) => (a: Action) => a.type === "MOVE" && a.direction === dir;
const takePlate = (a: Action) =>
  a.type === "TAKE" && (a as { item?: string }).item === "cold_iron_plate";
const donPlate = (a: Action) =>
  a.type === "USE" && (a as { item?: string }).item === "cold_iron_plate";

const NUDGE_PHRASE = "hangs loose and unbuckled";

/** Walk down to the Outer Forge. */
function enterForge(seed = 7): GameState {
  let s = initStateForRpgPack(index, seed);
  s = act(s, move("down"));
  expect(s.current).toBe("outer_forge");
  return s;
}

/** Detour west to the Founder's Cell, take the plate, return to the Outer Forge. */
function fetchPlate(s: GameState): GameState {
  s = act(s, move("west"));
  expect(s.current).toBe("founder_cell");
  s = act(s, takePlate);
  expect(s.inventory).toContain("cold_iron_plate");
  s = act(s, move("east"));
  expect(s.current).toBe("outer_forge");
  return s;
}

function toBellows(s: GameState): GameState {
  s = act(s, move("north"));
  expect(s.current).toBe("bellows_walk");
  return s;
}

describe("bug_0118 — The Cold Forge nudges a carried-but-unworn plate at the fight", () => {
  it("(1) the pack still validates green under the full RPG validator", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("(2) with NO plate the Bellows Walk reads the base threat text, no nudge", () => {
    const s = toBellows(enterForge());
    expect(s.inventory).not.toContain("cold_iron_plate");
    const desc = norm(obs(s).description);
    expect(desc).toContain("face it with every edge you can bring to bear");
    expect(desc).not.toContain(NUDGE_PHRASE);
  });

  it("(3) with the plate held-but-not-donned the Bellows Walk reads the nudge variant", () => {
    let s = enterForge();
    s = fetchPlate(s);
    expect(s.flags.plate_donned).not.toBe(true);
    s = toBellows(s);
    const desc = norm(obs(s).description);
    expect(desc).toContain(NUDGE_PHRASE);
    expect(desc).toContain("better to don it now");
  });

  it("(4) with the plate DONNED the Bellows Walk reads the base text again (no nag)", () => {
    let s = enterForge();
    s = act(s, move("west"));
    s = act(s, takePlate);
    s = act(s, donPlate);
    expect(s.flags.plate_donned).toBe(true);
    s = act(s, move("east"));
    s = toBellows(s);
    const desc = norm(obs(s).description);
    expect(desc).not.toContain(NUDGE_PHRASE);
    expect(desc).toContain("face it with every edge you can bring to bear");
  });

  it("(5) declared-order precedence: sentinel_stilled wins over the carried-unworn nudge", () => {
    let s = enterForge();
    s = fetchPlate(s);
    s = toBellows(s);
    // Carried-unworn at the wall: the nudge shows.
    expect(norm(obs(s).description)).toContain(NUDGE_PHRASE);
    // Once the fight is won, the broken-sentinel variant (declared first) must win
    // even though the plate is still carried-unworn — post-combat is never nagged.
    const stilled: GameState = { ...s, flags: { ...s.flags, sentinel_stilled: true } };
    const desc = norm(obs(stilled).description);
    expect(desc).toContain("The slag sentinel lies broken across the floor");
    expect(desc).not.toContain(NUDGE_PHRASE);
  });
});
