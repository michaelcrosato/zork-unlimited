import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyBlindReportText } from "../../src/blind/report_verifier.js";
import { extractExitInterview } from "../../src/blind/exit_interview.js";

describe("fleet:mock end to end (zero tokens)", () => {
  it("produces N verifier-passing reports with planted overlap", () => {
    const out = mkdtempSync(join(tmpdir(), "fleet-mock-"));
    execFileSync(
      "node",
      [
        "blind-tester/fleet.mjs",
        "--mock",
        "--count",
        "4",
        "--concurrency",
        "2",
        "--seed-base",
        "100",
        "--out",
        out,
        "--label",
        "citest",
      ],
      { stdio: "pipe", timeout: 240_000 },
    );
    const reports = readdirSync(out).filter((f) => f.endsWith(".md"));
    expect(reports).toHaveLength(4);
    let overlap = 0;
    for (const f of reports) {
      const text = readFileSync(join(out, f), "utf8");
      const v = verifyBlindReportText(text);
      expect(v.ok, `${f}: ${(v as { reason?: string }).reason ?? ""}`).toBe(true);
      const i = extractExitInterview(text);
      if (i.ok && i.interview.bugs.some((b) => b.where.includes("Albany Station Quarter")))
        overlap += 1;
    }
    expect(overlap).toBe(2); // seeds 100,102 of 100..103
  }, 300_000);
});
