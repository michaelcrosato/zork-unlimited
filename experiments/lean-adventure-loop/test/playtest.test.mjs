import assert from "node:assert/strict";
import test from "node:test";
import { runBuiltInSession } from "../src/playtest.mjs";

test("scripted player completes a full game through MCP", async () => {
  const result = await runBuiltInSession({ policy: "scripted", seed: 5 });
  assert.equal(result.outcome, "beacon");
  assert.equal(result.findings.length, 0);
  assert.equal(result.actions.at(-1), "light_beacon");
});

test("random player is repeatable for a seed", async () => {
  const first = await runBuiltInSession({ policy: "random", seed: 11 });
  const second = await runBuiltInSession({ policy: "random", seed: 11 });
  assert.deepEqual(first.actions, second.actions);
  assert.equal(first.outcome, second.outcome);
});
