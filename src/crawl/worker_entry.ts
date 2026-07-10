/**
 * Worker-thread entry point for Task 10's fan-out (`run.ts`'s
 * `runWorkerShard`/`runPlanWithWorkers`). Thin shell only: read the slice of
 * the plan this worker was handed via `workerData`, run it single-process
 * with `runPlanInProcess` (the exact same deterministic code path a
 * `--workers 1` run uses — concurrency changes ONLY who runs which seeds,
 * never how a given seed is run), and post the resulting `CrawlRunSummary`
 * back to the parent for `mergeSummaries` to combine.
 *
 * Launched via `new Worker(new URL("./worker_entry.ts", import.meta.url), {
 * execArgv: ["--import", "tsx"] })` — a live probe on this machine (Node
 * 22+/Windows, tsx 4.19) confirmed this loads/transpiles a `.ts` worker
 * module (and its relative project imports) correctly, so the brief's
 * sanctioned `child_process` fallback was not needed (see `run.ts`'s
 * `runWorkerShard` doc comment and the Task 10 commit message).
 */
import { parentPort, workerData } from "node:worker_threads";
import { runPlanInProcess, type CrawlPlanItem, type CrawlRunOptions } from "./run.js";

type WorkerSliceData = {
  items: CrawlPlanItem[];
  opts: CrawlRunOptions;
};

function main(): void {
  if (!parentPort) {
    throw new Error("worker_entry.ts must be run as a worker_thread (no parentPort)");
  }
  const { items, opts } = workerData as WorkerSliceData;
  const summary = runPlanInProcess(items, opts);
  parentPort.postMessage(summary);
}

main();
