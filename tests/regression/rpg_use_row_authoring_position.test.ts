/**
 * Regression (§15) — a USE row resolves by what it TARGETS, not by which object it was
 * authored under.
 *
 * Three surfaces already harvested USE interactions from EVERY object in the pack:
 * `enumerateRpgBaseActions` (it walks `objectsWithUseInteractions`), the natural-language
 * parser (`customUseByVerb`), and the foundation validator's winnability search, which
 * folds interaction effects in structurally. Only resolution disagreed: `useInteraction`
 * looked the row up in `index.objects.get(target).interactions`, so authoring position
 * silently became a load-bearing rule that nothing documents and no validator checks.
 *
 * The consequence was a pack that certifies clean and cannot be finished. `USE rope on
 * well` written under `rope` instead of under `well` was counted by validateRpg as a
 * reachable win route, was accepted by the parser, and was then dropped from the menu at
 * `option()` time because the resolution lookup never saw it — and `validateRpg` is the
 * SOLE gate for generate_rpg_pack / load_quest / validate_quest / apply_content_patch, so
 * an AI-authored quest with this shape shipped green and unwinnable.
 *
 * Locked here:
 *   (1) a USE authored under the item, targeting another object, is listed AND executes;
 *   (2) its `blocked_hint` projection follows it, so the friction hint and the action
 *       agree about the same row;
 *   (3) target-hosted rows are unaffected — every one of the 92 shipped USE-with-target
 *       rows sits on its own target, so this widens what resolves without moving any of
 *       them.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { makeStep } from "../../src/core/engine.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  enumerateRpgBlockedActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { compileRpgSource, loadRpgSourceFile } from "../../src/rpg/source.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

const QUEST_DIR = "content/rpg/quests";

// The only win route is `USE rope on well`, and that row is authored under the ROPE
// while the well hosts its own target-only row — mixed authoring positions on purpose.
const ropePack = `
meta:
  id: t
  title: T
  start_room: a
  max_score: 5
  vars_init: { hp: 10, attack: 2, defense: 1 }
rooms:
  - id: a
    name: A
    description: "A yard with an old well."
    objects: [rope, well]
    exits: []
objects:
  - id: rope
    name: rope
    description: "A coil of rope."
    takeable: true
    interactions:
      - verb: USE
        item: rope
        target: well
        conditions: [{ has_item: rope }, { has_flag: winch_cleared }]
        effects:
          - set_flag: descended
          - inc_var: { name: score, by: 5 }
          - narrate: "You tie the rope to the well-head and climb down."
        blocked_hint:
          visible_when: [{ has_item: rope }]
          reason: "The winch drum is still fouled; the rope has nowhere to run."
  - id: well
    name: well
    description: "An old well. The shaft runs out of sight."
    interactions:
      - verb: USE
        target: well
        command_verb: clear
        conditions: [{ not_flag: winch_cleared }]
        effects:
          - set_flag: winch_cleared
          - narrate: "You clear the fouled winch drum."
win_conditions: [{ id: w, conditions: [{ has_flag: descended }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
enemies: []
`;

const compile = (src: string) => {
  const r = compileRpgSource(src);
  if (!r.ok) throw new Error(`fixture must compile: ${r.error.message}`);
  return r.compiled.pack;
};

describe("USE: a row authored under the item still resolves against its target", () => {
  it("validateRpg certifies the pack — so the runtime must actually be able to finish it", () => {
    const findings = validateRpg(compile(ropePack)).findings;
    expect(findings.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("(1) the host-authored USE is listed and executes to the win", () => {
    const index = indexRpgPack(compile(ropePack));
    const step = makeStep(buildRpgRules(index));
    let state = initStateForRpgPack(index, 1);

    const take = enumerateRpgActions(index, state).find((o) => o.id === "take_rope");
    expect(take).toBeDefined();
    const taken = step(state, take!.action);
    expect(taken.ok).toBe(true);
    if (!taken.ok) return;
    state = taken.state;

    // The well hosts its own target-only row; that one always resolved.
    const clear = enumerateRpgActions(index, state).find((o) => o.id === "use_well");
    expect(clear).toBeDefined();
    const cleared = step(state, clear!.action);
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    state = cleared.state;

    // This row used to be silently absent: projected, then dropped because resolution
    // only ever looked at the WELL's own interaction list.
    const use = enumerateRpgActions(index, state).find((o) => o.id === "use_rope_on_well");
    expect(use, "the only win route must be offered").toBeDefined();

    const used = step(state, use!.action);
    expect(used.ok).toBe(true);
    if (!used.ok) return;
    expect(used.state.flags["descended"]).toBe(true);
    expect(used.state.vars["score"]).toBe(5);
    expect(used.state.ended).toBe(true);
    expect(used.state.endingId).toBe("e");
  });

  it("(2) its blocked_hint projects while the row is gated", () => {
    const index = indexRpgPack(compile(ropePack));
    const step = makeStep(buildRpgRules(index));
    const take = enumerateRpgActions(index, initStateForRpgPack(index, 1)).find(
      (o) => o.id === "take_rope",
    );
    expect(take).toBeDefined();
    const taken = step(initStateForRpgPack(index, 1), take!.action);
    expect(taken.ok).toBe(true);
    if (!taken.ok) return;

    // Rope in hand but the winch still fouled: the affordance is visible, not legal.
    // The hint projection used to require the row be hosted on its target, so a
    // host-authored row could never explain its own friction.
    const blocked = enumerateRpgBlockedActions(index, taken.state);
    expect(blocked.map((b) => b.id)).toContain("use_rope_on_well");
  });
});

describe("USE: shipped packs are unchanged by the target-keyed lookup", () => {
  it("(3) every shipped USE-with-target row is authored on its own target", () => {
    const files = readdirSync(QUEST_DIR)
      .filter((f) => f.endsWith(".yaml"))
      .sort();
    expect(files.length).toBeGreaterThan(0);

    const offHost: string[] = [];
    let rows = 0;
    for (const file of files) {
      const loaded = loadRpgSourceFile(join(QUEST_DIR, file));
      if (!loaded.ok) throw new Error(`${file} must compile`);
      for (const object of loaded.compiled.pack.objects) {
        for (const it of object.interactions) {
          if (it.verb !== "USE" || it.target === undefined) continue;
          rows += 1;
          if (it.target !== object.id) offHost.push(`${file}:${object.id}->${it.target}`);
        }
      }
    }
    expect(rows).toBeGreaterThan(0);
    // Not a rule — a fact about today's corpus, and the reason the lookup change is inert
    // for shipped content. A future off-host row is fine; it will simply resolve now.
    expect(offHost).toEqual([]);
  });
});
