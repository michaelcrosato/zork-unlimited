import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/watchtower_road.yaml");
if (!loaded.ok) throw new Error("watchtower pack must compile");

const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 13);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

const optionIds = (s: ReturnType<typeof play>): string[] =>
  buildObservation(index, s).available_actions.map((a) => a.id);

describe("bug_0003 — watchtower cellar discoverability", () => {
  it("points the lantern discovery at the cellar stair", () => {
    const s = play(["go_east", "approach_base", "search_rubble", "take_lantern"]);
    expect(s.inventory).toContain("lantern");
    expect(s.journal.at(-1)).toMatch(/cellar stair/i);
  });

  it("does not leave an exhausted cart search as the tower base's attractive loop", () => {
    const s = play([
      "go_east",
      "approach_base",
      "search_rubble",
      "take_lantern",
      "take_letter",
      "leave_cart",
    ]);
    expect(s.current).toBe("tower_base");
    expect(optionIds(s)).not.toContain("search_rubble");
    expect(optionIds(s)).toEqual(expect.arrayContaining(["climb_stairs", "leave_base"]));
  });

  it("offers a direct cellar follow-up once the lantern is carried", () => {
    const s = play(["go_east", "approach_base", "search_rubble", "take_lantern", "take_letter"]);
    expect(s.current).toBe("abandoned_cart");
    expect(optionIds(s)).toContain("carry_lantern_to_cellar");
  });

  it("keeps the cellar route reachable after the cart is exhausted", () => {
    const s = play([
      "go_east",
      "approach_base",
      "search_rubble",
      "take_lantern",
      "take_letter",
      "carry_lantern_to_cellar",
      "light_lantern",
      "descend_cellar",
    ]);
    expect(s.current).toBe("cellar");
    expect(s.flags["lantern_lit"]).toBe(true);
  });

  it("does not loop back into an emptied hidden cache after the ledger is collected", () => {
    const s = play([
      "go_east",
      "approach_base",
      "search_rubble",
      "take_lantern",
      "take_letter",
      "carry_lantern_to_cellar",
      "light_lantern",
      "descend_cellar",
      "search_cache",
      "take_ledger",
    ]);
    expect(s.current).toBe("cellar");
    expect(s.inventory).toContain("ledger");
    expect(optionIds(s)).not.toContain("search_cache");
    expect(optionIds(s)).toContain("climb_out");
  });

  it("exits the cleared cellar instead of re-descending after the ledger is carried", () => {
    const s = play([
      "go_east",
      "approach_base",
      "search_rubble",
      "take_lantern",
      "take_letter",
      "carry_lantern_to_cellar",
      "light_lantern",
      "descend_cellar",
      "search_cache",
      "take_ledger",
      "climb_out",
    ]);
    expect(s.current).toBe("cellar_door");
    expect(optionIds(s)).not.toContain("descend_cellar");
    expect(optionIds(s)).toContain("cellar_back");
  });
});
