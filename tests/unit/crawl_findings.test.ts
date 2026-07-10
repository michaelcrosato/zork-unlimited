import { describe, expect, it } from "vitest";
import {
  CODE_SEVERITY,
  CrawlFindingSchema,
  FindingCollector,
  findingFingerprint,
  normalizeFindingMessage,
} from "../../src/crawl/findings.js";

const loc = { region: null, node: null, questId: "sunken_barrow", sceneId: "barrow_mouth" };

describe("crawl findings", () => {
  it("normalizes messages so volatile bits do not split fingerprints", () => {
    const a = normalizeFindingMessage("Step 41 hash aa5f8649e2f7d677 mismatch at hp=12");
    const b = normalizeFindingMessage("Step 7 hash bb1234deadbeef99 mismatch at hp=3");
    expect(a).toBe(b);
    expect(a).toContain("<hash>");
    expect(a).toContain("#");
  });

  it("fingerprints on code + canonical location + normalized message", () => {
    const f = { code: "RENDER" as const, location: loc, message: "empty description in room 12" };
    const g = { code: "RENDER" as const, location: loc, message: "empty description in room 99" };
    expect(findingFingerprint(f)).toBe(findingFingerprint(g));
    expect(findingFingerprint({ ...f, code: "CRASH" })).not.toBe(findingFingerprint(f));
  });

  it("collector dedupes, validates, and applies the severity table", () => {
    const c = new FindingCollector({ seed: 7, policy: "mixed", commit: "abc1234" });
    const base = {
      code: "RENDER" as const,
      step: 3,
      location: loc,
      action: null,
      message: "empty description",
      stateHash: null,
      repro: { kind: "none" as const, trace: null, minimized: false },
    };
    expect(c.add(base)).toBe(true);
    expect(c.add({ ...base, step: 9, message: "empty description" })).toBe(false); // dupe
    expect(c.findings).toHaveLength(1);
    expect(c.totalRaw).toBe(2);
    expect(c.findings[0]!.severity).toBe(CODE_SEVERITY.RENDER);
    expect(() => CrawlFindingSchema.parse(c.findings[0]!)).not.toThrow();
    const rows = c.toJsonl().trim().split("\n");
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!).code).toBe("RENDER");
  });

  it("validates schema before dedup, so invalid finding throws even if fingerprint duplicates", () => {
    const c = new FindingCollector({ seed: 7, policy: "mixed", commit: "abc1234" });
    const base = {
      code: "RENDER" as const,
      step: 3,
      location: loc,
      action: null,
      message: "empty description",
      stateHash: null,
      repro: { kind: "none" as const, trace: null, minimized: false },
    };
    // First add succeeds
    expect(c.add(base)).toBe(true);
    expect(c.findings).toHaveLength(1);
    // Second add with same fingerprint but invalid schema (negative step) throws
    expect(() => c.add({ ...base, step: -1, message: "empty description" })).toThrow();
  });

  it("defaults severity to S2 for RENDER findings", () => {
    const c = new FindingCollector({ seed: 7, policy: "mixed", commit: "abc1234" });
    const base = {
      code: "RENDER" as const,
      step: 3,
      location: loc,
      action: null,
      message: "test message",
      stateHash: null,
      repro: { kind: "none" as const, trace: null, minimized: false },
    };
    c.add(base);
    expect(c.findings[0]!.severity).toBe("S2");
  });

  it("allows explicit severity override on findings", () => {
    const c = new FindingCollector({ seed: 7, policy: "mixed", commit: "abc1234" });
    const base = {
      code: "RENDER" as const,
      step: 3,
      location: loc,
      action: null,
      message: "test override",
      stateHash: null,
      repro: { kind: "none" as const, trace: null, minimized: false },
    };
    c.add({ ...base, severity: "S4" });
    expect(c.findings[0]!.severity).toBe("S4");
  });

  it("counts findings by code", () => {
    const c = new FindingCollector({ seed: 7, policy: "mixed", commit: "abc1234" });
    const base = {
      step: 3,
      location: loc,
      action: null,
      stateHash: null,
      repro: { kind: "none" as const, trace: null, minimized: false },
    };
    c.add({ ...base, code: "RENDER" as const, message: "render issue alpha" });
    c.add({ ...base, code: "RENDER" as const, message: "render issue bravo", step: 4 });
    c.add({ ...base, code: "CRASH" as const, message: "crash issue", step: 5 });

    const counts = c.countsByCode();
    expect(counts["RENDER"]).toBe(2);
    expect(counts["CRASH"]).toBe(1);
    expect(counts["ORPHAN"]).toBeUndefined();
  });

  it("toJsonl produces newline-terminated output", () => {
    const c = new FindingCollector({ seed: 7, policy: "mixed", commit: "abc1234" });
    const base = {
      code: "RENDER" as const,
      step: 3,
      location: loc,
      action: null,
      message: "test message",
      stateHash: null,
      repro: { kind: "none" as const, trace: null, minimized: false },
    };
    c.add(base);
    const jsonl = c.toJsonl();
    expect(jsonl.endsWith("\n")).toBe(true);
  });
});
