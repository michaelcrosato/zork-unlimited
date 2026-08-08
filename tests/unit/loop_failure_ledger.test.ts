import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendLoopFailure,
  formatFailureLedgerSummary,
  readFailureLedger,
  type LoopFailureEntry,
} from "../../scripts/loop-failure-ledger.js";

function entry(index: number): LoopFailureEntry {
  return {
    timestamp: `2026-08-05T12:00:0${index}.000Z`,
    cycle_number: index,
    run_id: `run-${index}`,
    start_ref: String(index).repeat(40),
    stage: index === 3 ? "playtest" : "health",
    reason: `failure ${index}`,
    consecutive_failures: index,
    total_failures: index,
  };
}

describe("loop failure ledger", () => {
  it("atomically retains only the configured bounded tail", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-failures-"));
    const path = join(root, "ai-runs", "failure-ledger.json");
    try {
      appendLoopFailure(path, entry(1), 2);
      appendLoopFailure(path, entry(2), 2);
      const ledger = appendLoopFailure(path, entry(3), 2);

      expect(ledger.max_entries).toBe(2);
      expect(ledger.failures.map((failure) => failure.cycle_number)).toEqual([2, 3]);
      expect(readFailureLedger(path)).toEqual(ledger);
      expect(readFileSync(path, "utf8").endsWith("\n")).toBe(true);
      expect(formatFailureLedgerSummary(ledger)).toContain("stage=playtest");
      expect(formatFailureLedgerSummary(ledger)).toContain("retained=2/2");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to overwrite a malformed existing ledger", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-failures-"));
    const path = join(root, "failure-ledger.json");
    try {
      writeFileSync(path, "{not json}\n");
      expect(() => appendLoopFailure(path, entry(1), 2)).toThrow(/failure ledger/i);
      expect(readFileSync(path, "utf8")).toBe("{not json}\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
