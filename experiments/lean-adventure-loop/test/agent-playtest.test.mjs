import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runAgentSession } from "../src/playtest.mjs";

test("external player command completes a game through MCP and returns a report", async () => {
  const fixture = fileURLToPath(new URL("../fixtures/fake-agent.mjs", import.meta.url));
  const report = await runAgentSession({
    command: `${JSON.stringify(process.execPath)} ${JSON.stringify(fixture)}`,
    seed: 17,
    timeoutMs: 10_000,
  });
  assert.equal(report.outcome, "beacon");
  assert.equal(report.traceVerified, true);
  assert.equal(report.ratings.clarity, 5);
  assert.equal(report.actions.at(-1), "light_beacon");
});


test("an AI report with a false action trace is rejected", async () => {
  const script = "process.stdout.write(JSON.stringify({outcome:'beacon',turns:0,actions:[],ratings:{fun:3,clarity:3},findings:[]})+'\\n')";
  await assert.rejects(
    runAgentSession({
      command: `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`,
      seed: 1,
      timeoutMs: 10_000,
    }),
    /does not reach an ending/,
  );
});
