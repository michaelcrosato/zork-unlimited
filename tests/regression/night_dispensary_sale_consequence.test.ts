/**
 * Regression for bug_0368 -- the immediate arsenic sale must have consequence.
 * A fresh blind playtest found `ending_sold` felt like placeholder text when the
 * player sold at once: the most morally loaded choice closed with no aftermath.
 * The base ending now makes the cost visible, while the existing partial/full
 * knowledge variants remain distinct.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/night_dispensary.yaml");
if (!loaded.ok) throw new Error("night_dispensary pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[]) {
  const step = makeStep(rules);
  let state = initStateForPack(index, 7);
  for (const id of ids) state = step(state, choose(id)).state;
  return buildObservation(index, state);
}

describe("bug_0368 -- Night Dispensary sale ending consequence", () => {
  it("gives the immediate sale concrete aftermath instead of placeholder closure", () => {
    const sold = play(["sell_arsenic"]);

    expect(sold.ending_id).toBe("ending_sold");
    expect(sold.text).toMatch(/wick lane/i);
    expect(sold.text).toMatch(/quiet anything he cares to quiet/i);
    expect(sold.text).toMatch(/if a cup is sweetened or a witness fails to wake/i);
    expect(sold.text).toMatch(/Cole, V\. — white arsenic, two drams, pest control/);
  });

  it("keeps the partial-knowledge sale distinct from the immediate sale", () => {
    const sold = play(["note_mourning_badge", "sell_arsenic"]);

    expect(sold.ending_id).toBe("ending_sold");
    expect(sold.text).toMatch(/something in the way he said his wife's name/i);
    expect(sold.text).toMatch(/thread you pulled at and then let go/i);
    expect(sold.text).not.toMatch(/quiet anything he cares to quiet/i);
  });

  it("keeps the full-knowledge sale distinct and explicit about complicity", () => {
    const sold = play([
      "question_the_warehouse",
      "go_to_ledger",
      "read_ledger",
      "leave_ledger",
      "read_city_register",
      "sell_arsenic",
    ]);

    expect(sold.ending_id).toBe("ending_sold");
    expect(sold.text).toMatch(/You know the lie about the street/i);
    expect(sold.text).toMatch(/You sold him the arsenic anyway/i);
    expect(sold.text).toMatch(/fact about you now/i);
  });
});
