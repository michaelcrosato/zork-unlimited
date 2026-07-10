/**
 * Worker-thread entry point for Task 10's fan-out (`run.ts`'s
 * `runWorkerShard`/`runPlanWithWorkers`). Thin shell only: read the slice of
 * the plan this worker was handed via `workerData`, run it single-process
 * with `runPlanInProcess` (the exact same deterministic code path a
 * `--workers 1` run uses — concurrency changes ONLY who runs which seeds,
 * never how a given seed is run), and post the resulting `CrawlRunSummary`
 * back to the parent for `mergeSummaries` to combine.
 *
 * Launched indirectly via `worker_bootstrap.mjs` (plain JS the worker thread
 * can load natively), which registers tsx's ESM loader inside the thread via
 * `tsx/esm/api`'s `register()` and then imports this file — see
 * `run.ts`'s `runWorkerShard` doc comment for why the loader is registered
 * this way rather than via `execArgv: ["--import", "tsx"]` on the Worker
 * constructor (that approach worked on Node 24/Windows but failed on CI's
 * Node 22 with `ERR_MODULE_NOT_FOUND`). The brief's sanctioned
 * `child_process` fallback was not needed either way.
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
