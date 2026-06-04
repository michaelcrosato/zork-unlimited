/**
 * Regression (§15) for bug_0259 — THE COLD FORGE points a bar-less player back to
 * the pry-bar at the moment they hit the sealed grate.
 *
 * A fresh source-blind MCP playtester (cold_forge, seed 11,
 * ai-runs/2026-06-04T23-33-49-294Z/playtest.md §4) rated the pack clarity 5/5,
 * enjoyment 4/5 with ZERO functional bugs. Its one remaining friction: a player can
 * descend to the Forge Heart having skipped the iron pry-bar, find the slag grate
 * sealed, and have to backtrack — with no in-room reminder of WHERE the bar is. The
 * `down` exit's static `locked_msg` cannot reference inventory, so a reactive Forge
 * Heart room `variant` carries the cue: it fires only when the bar is NOT held and
 * the grate is not yet open, naming the cold trough in the outer forge (the same
 * place the lantern-spirit's heart-counsel names).
 *
 * The existing `grate_open` variant is declared FIRST, so the open prose always wins
 * once the grate is levered (first matching variant in declared order wins —
 * src/parser/model.ts roomDescription). The pry-bar is never consumed, so once taken
 * this nudge can never re-fire. Locked here:
 *   (1) the pack still validates green under the full RPG validator;
 *   (2) reaching the Forge Heart WITHOUT the bar reads the no-bar cue (points back
 *       to the trough), not the base "levered by bar and brawn" prose;
 *   (3) reaching it WITH the bar reads the base text — no nag for a prepared player;
 *   (4) declared-order precedence: with the grate open the open variant wins even
 *       while the bar is (still) held — the open prose is never shadowed.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadRpgPackFile("content/rpg/pack/cold_forge.yaml");
if (!loaded.ok) throw new Error("cold_forge must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));

const obs = (s: GameState) => buildParserObservation(index, s);
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
const takeBar = (a: Action) => a.type === "TAKE" && (a as { item?: string }).item === "pry_bar";

const CUE_PHRASE = "stout iron pry-bar by the cold trough";
const BASE_PHRASE = "made to be levered by bar and brawn";

/**
 * Walk to the Forge Heart, skipping combat by setting the sentinel-defeated flag
 * (the east exit only gates on `has_flag: sentinel_stilled`; this keeps the test
 * deterministic and free of combat RNG). `takeTheBar` toggles the one variable
 * under test — whether the pry-bar is in hand on arrival.
 */
function toForgeHeart(takeTheBar: boolean, seed = 11): GameState {
  let s = initStateForRpgPack(index, seed);
  s = act(s, move("down")); // forge_steps -> outer_forge
  expect(s.current).toBe("outer_forge");
  if (takeTheBar) {
    s = act(s, takeBar);
    expect(s.inventory).toContain("pry_bar");
  }
  s = act(s, move("north")); // -> bellows_walk
  expect(s.current).toBe("bellows_walk");
  // Skip the slag-sentinel fight (deterministic): the east exit only checks the flag.
  s = { ...s, flags: { ...s.flags, sentinel_stilled: true } };
  s = act(s, move("east")); // -> forge_heart
  expect(s.current).toBe("forge_heart");
  return s;
}

describe("bug_0259 — The Cold Forge cues the pry-bar at the sealed grate", () => {
  it("(1) the pack still validates green under the full RPG validator", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("(2) arriving WITHOUT the bar reads the no-bar cue, not the base prose", () => {
    const s = toForgeHeart(false);
    expect(s.inventory).not.toContain("pry_bar");
    const desc = norm(obs(s).description);
    expect(desc).toContain(CUE_PHRASE);
    expect(desc).toContain("you carry nothing strong enough");
    expect(desc).not.toContain(BASE_PHRASE);
  });

  it("(3) arriving WITH the bar reads the base prose, no nag", () => {
    const s = toForgeHeart(true);
    expect(s.inventory).toContain("pry_bar");
    const desc = norm(obs(s).description);
    expect(desc).toContain(BASE_PHRASE);
    expect(desc).not.toContain(CUE_PHRASE);
  });

  it("(4) declared-order precedence: an open grate's prose wins even with the bar held", () => {
    const s = toForgeHeart(true);
    const opened: GameState = {
      ...s,
      questStage: { ...s.questStage, forge: "grate_open" },
    };
    const desc = norm(obs(opened).description);
    expect(desc).toContain("has been levered up off its lip and stands open");
    expect(desc).not.toContain(CUE_PHRASE);
    expect(desc).not.toContain(BASE_PHRASE);
  });
});
