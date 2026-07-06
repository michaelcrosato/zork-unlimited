/**
 * Regression (§15) for bug_0094 — THE COLD FORGE's stale pry-bar prose.
 *
 * The Outer Forge room description statically read "By a cold trough lies a stout
 * iron pry-bar". Once the bar is taken it was correctly dropped from visible_objects,
 * but the prose kept narrating it lying by the trough for the rest of the game — the
 * one non-reactive seam in a pack whose Founder's Cell (plate taken), Bellows Walk
 * (sentinel killed) and stone_grate examine all already update (bug_0023). A fresh
 * blind playtester (seed 53, ai-runs/2026-06-02T00-23-22-281Z/playtest.md §5) flagged
 * it as the pack's lone concrete defect — "the one inconsistent room" — re-confirming
 * the bug_0088 seed-37 deferral.
 *
 * The fix: a reactive room `variant` on `outer_forge` gated on `has_item: pry_bar`
 * that drops the pry-bar clause and names the trough bare. Locked here:
 *   (1) the pack still validates green under the full RPG validator;
 *   (2) before taking the bar the room reads the base "lies a stout iron pry-bar";
 *   (3) after taking the bar the room reads the bare-trough variant — the stale line
 *       is gone, and visible_objects no longer lists the bar;
 *   (4) taking the bar is inert beyond inventory: no flag/var/quest/score change, so
 *       the variant cannot affect any route.
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
const takePryBar = (a: Action) => a.type === "TAKE" && (a as { item?: string }).item === "pry_bar";

/** Walk down to the Outer Forge. */
function enterForge(seed = 53): GameState {
  let s = initStateForRpgPack(index, seed);
  s = act(s, move("down"));
  expect(s.current).toBe("outer_forge");
  return s;
}

describe("bug_0094 — The Cold Forge's Outer Forge stops narrating the taken pry-bar", () => {
  it("(1) the pack still validates green under the full RPG validator", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("(2) before taking the bar the room reads the base 'lies a stout iron pry-bar'", () => {
    const s = enterForge();
    const desc = obs(s).description.replace(/\s+/g, " ");
    expect(desc).toContain("By a cold trough lies a stout iron pry-bar");
    expect(obs(s).visible_objects.map((o) => o.id)).toContain("pry_bar");
  });

  it("(3) after taking the bar the room reads the bare-trough variant; bar gone from objects", () => {
    let s = enterForge();
    s = act(s, takePryBar);
    expect(s.inventory).toContain("pry_bar");

    const desc = obs(s).description.replace(/\s+/g, " ");
    expect(desc).toContain("The cold trough stands bare now");
    // the stale static line is gone — no claim the bar still lies by the trough
    expect(desc).not.toContain("lies a stout iron pry-bar");
    expect(obs(s).visible_objects.map((o) => o.id)).not.toContain("pry_bar");
  });

  it("(4) taking the bar is inert beyond inventory (no flag/var/quest/score change)", () => {
    const before = enterForge();
    const after = act(before, takePryBar);
    expect(after.flags).toEqual(before.flags);
    expect(after.vars).toEqual(before.vars);
    expect(after.questStage).toEqual(before.questStage);
    expect(obs(after).score).toBe(obs(before).score);
    expect(after.ended).toBe(false);
  });
});
