import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { aggregateRecords } from "../src/aggregate.mjs";

test("aggregation promotes a high-severity finding into one task", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "lean-aggregate-"));
  const store = resolve(root, "runs");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(store));
  const record = {
    build: "build-1",
    outcome: "timeout",
    turns: 16,
    player: { kind: "agent", name: "tester" },
    traceVerified: true,
    findings: [{ key: "unclear-goal", title: "Goal is unclear", severity: 3, evidence: "I did not know what to repair." }],
  };
  await writeFile(resolve(store, "one.json"), JSON.stringify(record));
  const taskPath = resolve(root, "NEXT_TASK.md");
  const summary = await aggregateRecords({
    store,
    build: "build-1",
    outputPath: resolve(root, "summary.json"),
    taskPath,
  });
  assert.equal(summary.top.key, "unclear-goal");
  assert.match(await readFile(taskPath, "utf8"), /Fix one issue/);
});
