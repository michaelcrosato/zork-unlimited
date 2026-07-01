/**
 * Regression (§15) for bug_0126 — The Sunken Barrow's TWO death endings
 * (ending_fallen "Another Niche Filled", ending_woken "What Sleeps Beneath")
 * RENDER cleanly to the player at the moment of death.
 *
 * This mirrors cold_forge's bug_0125 render lock onto the barrow, the cheap
 * next lock the prior cycle's handoff named (AI_LOOP_STATE.md, cycle
 * 2026-06-02T13-02-56-343Z): "sunken_barrow's death ending (ending_fallen) has
 * the same shape and the same gap ... the cheap next lock is to mirror this
 * render assertion onto the barrow's death path." The mandated blind playtest
 * this cycle (sunken_barrow, seed 42, ai-runs/2026-06-02T13-11-26-441Z/playtest.md)
 * came back clean — clarity 5/5, enjoyment 4/5, zero defects — and actually
 * REACHED both death endings (run 2 → ending_fallen 0/50, run 3 → ending_woken
 * 25/50), confirming the experience but not locking the rendered observation.
 *
 * The death endings' rendered layer was genuinely the untested seam:
 *   - bug_0124's exhaustive solver proves both are route-reachable, but over an
 *     abstract BFS — it never renders an observation.
 *   - rpg_barrow_wight_prep_matters.test.ts case (3) drives an under-armed thief
 *     to death and asserts state.endingId === "ending_fallen" + the pack's death
 *     boolean; rpg_barrow_lord_woken_fork.test.ts drives the prise to
 *     ending_woken and asserts state.endingId + score — but both inspect the
 *     GameState, never the player-facing observation.
 * So nothing locked that a DYING barrow player is actually SHOWN the death
 * ending's title and text (plus the renderer's honest score-closure tally). This
 * test closes that for BOTH death forks.
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

const loaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
if (!loaded.ok) throw new Error("sunken_barrow must compile");
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
const isLeverSlab = (a: Action) =>
  a.type === "USE" && (a as { target?: string }).target === "stone_slab";
const isPriseSarcophagus = (a: Action) =>
  a.type === "USE" && (a as { target?: string }).target === "sarcophagus";

/** Under-armed seed-2 route: take the bar, skip the shade, die to the wight. */
function dieToWight(): GameState {
  let s = initStateForRpgPack(index, 2);
  s = act(s, move("down")); // → entry_hall
  s = act(s, isTake); // iron bar, but skip the shade's ward → base defense 2
  expect(s.vars["defense"]).toBe(2);
  s = act(s, move("north")); // → guard_crypt, into the fight under-armed
  let guard = 0;
  while (!s.ended && !s.flags["wight_slain"]) {
    s = act(s, isAttack);
    if (++guard > 40) throw new Error("fight did not resolve");
  }
  return s;
}

/** Canonical descent (seed 1), then prise the sealed sarcophagus → the doom fork. */
function priseSarcophagus(): GameState {
  let s = initStateForRpgPack(index, 1);
  s = act(s, move("down")); // → entry_hall
  s = act(s, isTake); // iron bar
  s = act(s, move("north")); // → guard_crypt
  let guard = 0;
  while (!s.flags["wight_slain"] && !s.ended) {
    s = act(s, isAttack);
    if (++guard > 40) throw new Error("fight did not resolve");
  }
  s = act(s, move("east")); // → slab_passage
  guard = 0;
  while (s.questStage["barrow"] !== "slab_moved" && !s.ended) {
    s = act(s, isLeverSlab); // might check; free retry
    if (++guard > 40) throw new Error("slab never moved");
  }
  s = act(s, move("down")); // → relic_chamber
  expect(s.current).toBe("relic_chamber");
  s = act(s, isPriseSarcophagus); // the warned-against act → ending_woken
  return s;
}

describe("bug_0126 — The Sunken Barrow death endings render cleanly to the player", () => {
  it("ending_fallen: the under-armed seed-2 route ends in a genuine death, no wight kill credited", () => {
    const s = dieToWight();
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_fallen");
    // genuinely fatal: the wight never fell, so the +10 award never fired
    expect(s.flags["wight_slain"]).toBeUndefined();
    expect(s.vars["score"] ?? 0).toBe(0);
  });

  it("ending_fallen: the player-facing observation surfaces the death title, text, and death flag", () => {
    const s = dieToWight();
    const obs = buildRpgObservation(index, s);

    expect(obs.ended).toBe(true);
    expect(obs.ending_id).toBe("ending_fallen");

    // the structured ending block the renderers read
    expect(obs.ending).not.toBeNull();
    expect(obs.ending!.id).toBe("ending_fallen");
    expect(obs.ending!.death).toBe(true);
    expect(obs.ending!.title).toBe("Another Niche Filled");
    expect(obs.ending!.text.toLowerCase()).toContain("the cold closes over you");

    // the rendered, player-visible fields: at death the player sees the ending's
    // TITLE (not the room name) and its TEXT (not the room description)
    expect(obs.title).toBe("Another Niche Filled");
    expect(obs.description.toLowerCase()).toContain("the cold closes over you");
    expect(obs.description.toLowerCase()).toContain("something else will climb from the niche");
  });

  it("ending_fallen: the dying player gets honest score closure — 'Final score: 0 of 50.'", () => {
    const s = dieToWight();
    const obs = buildRpgObservation(index, s);
    // a wight death never scores, but the renderer still appends a tally so the run
    // closes with a number rather than trailing off (src/parser/observation.ts)
    expect(obs.score).toBe(0);
    expect(obs.max_score).toBe(50);
    expect(obs.description).toContain("Final score: 0 of 50.");
    // the closure rides the player-facing description only; the canonical ending text stays pure
    expect(obs.ending!.text).not.toContain("Final score");
  });

  it("ending_woken: prising the sarcophagus surfaces the doom title, text, and death flag", () => {
    const s = priseSarcophagus();
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_woken");

    const obs = buildRpgObservation(index, s);
    expect(obs.ended).toBe(true);
    expect(obs.ending_id).toBe("ending_woken");

    expect(obs.ending).not.toBeNull();
    expect(obs.ending!.id).toBe("ending_woken");
    expect(obs.ending!.death).toBe(true);
    expect(obs.ending!.title).toBe("What Sleeps Beneath");
    expect(obs.ending!.text.toLowerCase()).toContain("the barrow-lord opens his eyes");

    expect(obs.title).toBe("What Sleeps Beneath");
    expect(obs.description.toLowerCase()).toContain("the barrow-lord opens his eyes");
  });

  it("ending_woken: the doom fork closes at the partial tally — 'Final score: 25 of 50.'", () => {
    const s = priseSarcophagus();
    const obs = buildRpgObservation(index, s);
    // the doom never takes the crown, so the circlet's +25 take_effect never fires:
    // the run tops out at 25/50 (bug_0107), and the rendered closure shows it (a
    // partial tally the player reads as "incomplete", distinct from the 50/50 win)
    expect(obs.score).toBe(25);
    expect(obs.max_score).toBe(50);
    expect(obs.description).toContain("Final score: 25 of 50.");
    expect(obs.ending!.text).not.toContain("Final score");
  });
});
