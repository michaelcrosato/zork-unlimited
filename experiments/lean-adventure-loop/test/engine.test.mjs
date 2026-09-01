import assert from "node:assert/strict";
import test from "node:test";
import { createState, legalActions, loadWorld, step } from "../src/engine.mjs";

test("the shipped plan reaches the beacon deterministically", async () => {
  const world = await loadWorld();
  let first = createState(world, 7);
  let second = createState(world, 7);

  for (const action of world.winningPlan) {
    assert.ok(legalActions(world, first).includes(action), `${action} must be legal`);
    first = step(world, first, action).state;
    second = step(world, second, action).state;
    assert.deepEqual(first, second);
  }

  assert.equal(first.ending, "beacon");
  assert.equal(first.ended, true);
  assert.equal(first.turn, world.winningPlan.length);
});

test("an illegal action does not change state", async () => {
  const world = await loadWorld();
  const state = createState(world, 1);
  const result = step(world, state, "light_beacon");
  assert.equal(result.ok, false);
  assert.equal(result.state, state);
});
