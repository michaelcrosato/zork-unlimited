/**
 * Regression (§15) for bug_0125 — The Cold Forge's death ending (ending_fallen,
 * "Cold on the Cinders") RENDERS cleanly to the player at the moment of death.
 *
 * The mandated blind playtest this cycle (cold_forge, seed 11,
 * ai-runs/2026-06-02T13-02-56-343Z/playtest.md) came back clean — clarity 5/5,
 * enjoyment 4/5, zero defects — but seed 11's combat variance was kind and even the
 * deliberately under-armed run survived, so the tester left one concrete §5 note:
 * it "can't confirm the death-ending text (ending_fallen) fires cleanly from actual
 * play — only that the death:false victory does."
 *
 * That seam was genuinely the one untested layer of the death ending:
 *   - bug_0124's exhaustive solver proves ending_fallen is route-reachable, but over
 *     an abstract BFS — it never renders an observation.
 *   - cold_forge_sentinel_prep_matters.test.ts case (3) drives an under-armed thief
 *     to death and asserts state.endingId === "ending_fallen" + the pack's death
 *     boolean — but it inspects the GameState, never the player-facing observation.
 * So nothing locked that a DYING player is actually shown the death ending's title
 * and text (plus the renderer's score-closure tally). This test closes that: it
 * drives the same under-armed seed-1 death and asserts the rendered observation.
 *
 * Pure test addition — no content/engine/validator/hash change.
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
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadRpgPackFile("content/rpg/pack/cold_forge.yaml");
if (!loaded.ok) throw new Error("cold_forge must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));

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
const isAttack = (a: Action) => a.type === "ATTACK";
const isTake = (a: Action) => a.type === "TAKE";

/** Drive the under-armed seed-1 route until the sentinel lands the killing blow. */
function dieUnderArmed(): GameState {
  let s = initStateForRpgPack(index, 1);
  s = act(s, move("down")); // → outer_forge
  s = act(s, isTake); // grab the pry-bar, but skip the spirit's counsel → base attack 4
  expect(s.vars["attack"]).toBe(4);
  s = act(s, move("north")); // → bellows_walk, into the fight
  let guard = 0;
  while (!s.ended && !s.flags["sentinel_stilled"]) {
    s = act(s, isAttack);
    if (++guard > 30) throw new Error("fight did not resolve");
  }
  return s;
}

describe("bug_0125 — The Cold Forge death ending renders cleanly to the player", () => {
  it("the under-armed seed-1 route ends in a genuine death (ending_fallen), no sentinel kill credited", () => {
    const s = dieUnderArmed();
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_fallen");
    // genuinely fatal: the player never stilled the sentinel, so the +15 award never fired
    expect(s.flags["sentinel_stilled"]).toBeUndefined();
    expect(s.vars["score"] ?? 0).toBe(0);
  });

  it("the player-facing observation surfaces the death ending's title, text, and death flag", () => {
    const s = dieUnderArmed();
    const obs = buildRpgObservation(index, s);

    expect(obs.ended).toBe(true);
    expect(obs.ending_id).toBe("ending_fallen");

    // the structured ending block the renderers read
    expect(obs.ending).not.toBeNull();
    expect(obs.ending!.id).toBe("ending_fallen");
    expect(obs.ending!.death).toBe(true);
    expect(obs.ending!.title).toBe("Cold on the Cinders");
    expect(obs.ending!.text.toLowerCase()).toContain("grave chill closes over you");

    // the rendered, player-visible fields: at death the player sees the ending's
    // TITLE (not the room name), and its TEXT (not the room description)
    expect(obs.title).toBe("Cold on the Cinders");
    expect(obs.description.toLowerCase()).toContain("the sentinel's last blow drops you");
  });

  it("the dying player still gets honest score closure — 'Final score: 0 of 50.' appended", () => {
    const s = dieUnderArmed();
    const obs = buildRpgObservation(index, s);
    // an under-armed death scores nothing, but the renderer still appends a tally so
    // the run closes with a number rather than trailing off (src/parser/observation.ts)
    expect(obs.score).toBe(0);
    expect(obs.max_score).toBe(50);
    expect(obs.description).toContain("Final score: 0 of 50.");
    // the closure rides the player-facing description only; the canonical ending text stays pure
    expect(obs.ending!.text).not.toContain("Final score");
  });
});
