/**
 * Regression (§15) for bug_0330 — wreckers_light oil_store no-key path gives no
 * hint pointing back to the keeper.
 *
 * A blind MCP playtester (seed 7, report
 * ai-runs/2026-06-08T16-39-13-594Z/playtest.md §5 B1) observed that a player who
 * takes the striker before hearing the keeper and then descends to the oil store finds
 * the sea-chest locked with no available action indicating where the key might be.
 * The only actions visible were "Fill a flask" and "Back up" — no pointer to the
 * dying keeper's closed fist.
 *
 * Fix (content, pure prose): added a try_lock choice to oil_store gated on
 * not_item keeper_key AND not_flag chest_open. Narration says: "The hasp holds fast
 * — iron through and through, and not your hand that will force it. A keeper would
 * keep such a key close; the old man at the stove had something white-knuckled in
 * his fist when he fell." Routes back to oil_store. No flag/score/route/ending change.
 *
 * Locked here:
 *   (1) try_lock narrate references "keeper" and "fist";
 *   (2) try_lock is present in oil_store when player has no key and chest is closed;
 *   (3) try_lock is absent when player holds the key;
 *   (4) after try_lock, player is still in oil_store (take_oil still available);
 *   (5) ending_saved still reachable via full route.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/wreckers_light.yaml");
if (!loaded.ok) throw new Error("wreckers_light pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 7);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof play>) => buildObservation(index, s);
const actionIds = (s: ReturnType<typeof play>) => obs(s).available_actions.map((a) => a.id);

// Route: straight to oil store, no key (skip hear_keeper)
const NO_KEY_IN_OIL_STORE = ["enter", "go_down"];
// Route: get key first, then oil store
const KEY_IN_OIL_STORE = ["enter", "hear_keeper", "search_keeper", "go_down"];
// Route: no key → oil store → try_lock
const TRY_LOCK_THEN_OIL = ["enter", "go_down", "try_lock"];
// Full winning route
const FULL_WIN = [
  "enter",
  "hear_keeper",
  "take_striker",
  "search_keeper",
  "go_down",
  "take_oil",
  "unlock_chest",
  "read_journal",
  "back_up",
  "climb_ladder",
  "light_lamp",
];

describe("wreckers_light — oil_store try_lock hints keeper key when chest locked (bug_0330)", () => {
  it("try_lock narrate references 'keeper' and 'fist'", () => {
    const oilStore = index.pack.scenes.find((sc) => sc.id === "oil_store");
    expect(oilStore).toBeDefined();
    const tryLock = oilStore!.choices.find((c) => c.id === "try_lock");
    expect(tryLock).toBeDefined();
    const narrateEffect = tryLock!.effects?.find((e) => "narrate" in e) as
      | { narrate: string }
      | undefined;
    expect(narrateEffect).toBeDefined();
    const narrate = narrateEffect!.narrate.toLowerCase();
    expect(narrate).toContain("keeper");
    expect(narrate).toContain("fist");
  });

  it("try_lock is present in oil_store when player has no key", () => {
    const actions = actionIds(play(NO_KEY_IN_OIL_STORE));
    expect(actions).toContain("try_lock");
  });

  it("try_lock is absent when player already holds the keeper key", () => {
    const actions = actionIds(play(KEY_IN_OIL_STORE));
    expect(actions).not.toContain("try_lock");
  });

  it("after try_lock, player is still in oil_store (take_oil available)", () => {
    const actions = actionIds(play(TRY_LOCK_THEN_OIL));
    expect(actions).toContain("take_oil");
  });

  it("ending_saved still reachable via full route (routing regression)", () => {
    const s = play(FULL_WIN);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_saved");
  });
});
