/**
 * The two-loop QA pipeline: provider registry → session record → store → triage.
 *
 * These tests pin the properties that make the split SAFE rather than merely fast.
 * Speed is easy; what is hard is keeping the evidence honest once playtests stop being
 * bound to the commit under test and start arriving in bulk from four vendors at once.
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  findCatalogModel,
  findPlaytestProvider,
  parsePlaytestCatalog,
  playtestFamilies,
  playtestProviderIds,
  PlaytestProviderSchema,
  PLAYTEST_PROVIDERS,
  resolvePlaytestArgv,
} from "../../src/blind/providers.js";
import {
  countsTowardExperienceMetrics,
  parsePlaytestSession,
  sealPlaytestSession,
  type PlaytestSessionBody,
} from "../../src/qa/session_record.js";
import {
  listPlaytestSessions,
  sha256Hex,
  summarizePlaytestStore,
  writePlaytestSession,
} from "../../src/qa/session_store.js";
import { derivePromotion, isActionable, ticketId } from "../../src/qa/ticket.js";
import { scoreCluster } from "../../src/feedback/rank.js";
import type { IssueCluster } from "../../src/feedback/cluster.js";

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "af-qa-test-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

const INTERVIEW = {
  clarity: 3,
  enjoyment: 3,
  goal_understood: true,
  got_stuck: false,
  confusions: ["the dispatch board did not say which option commits"],
  bugs: [{ where: "Albany Station Quarter", severity: "S2" as const, note: "stale board text" }],
  best_moment: "the wolf fight",
  worst_moment: "the dispatch board",
  would_replay: true,
  verdict: "Solid, but the opening asks too much before the first real decision.",
};

function body(overrides: Partial<PlaytestSessionBody> = {}): PlaytestSessionBody {
  const transcript = "line one\nline two\n";
  return {
    schema_version: 1,
    recorded_at: "2026-08-28T12:00:00.000Z",
    game_session_id: "o-test",
    run_seed: 7,
    build: {
      git_commit: "a".repeat(40),
      tracked_worktree_clean: true,
      world_id: "new_york_overworld",
      world_hash: "b".repeat(64),
    },
    provider: {
      id: "codex",
      vendor: "openai",
      family: "gpt",
      isolation: "runner_enforced",
      transport_contract: "game-direct-mcp-v1",
    },
    model: { id: "gpt-5.3-codex-spark", tier: "volume", settings: {} },
    persona: { id: "default", title: "default", source_sha256: "c".repeat(64) },
    outcome: "abandoned",
    log: {
      turns: 12,
      accepted_decisions: null,
      transcript_filename: "transcript.jsonl",
      transcript_sha256: sha256Hex(transcript),
      transcript_bytes: Buffer.byteLength(transcript, "utf8"),
    },
    exit_interview: INTERVIEW,
    journey_receipt: null,
    failure_note: "player stopped before a confirmed exit",
    ...overrides,
  };
}

describe("playtest provider registry", () => {
  it("registers every vendor with a distinct id and exposes them sorted", () => {
    expect(playtestProviderIds()).toEqual(["claude_code", "codex", "gemini_cli", "grok_desktop"]);
  });

  it("counts DISTINCT LINEAGES, so one vendor twice is not two witnesses", () => {
    expect(playtestFamilies(["codex", "codex"])).toEqual(["gpt"]);
    expect(playtestFamilies(["codex", "gemini_cli", "grok_desktop"])).toEqual([
      "gemini",
      "gpt",
      "grok",
    ]);
  });

  it("ignores unknown providers rather than letting them inflate independence", () => {
    expect(playtestFamilies(["codex", "not-a-provider"])).toEqual(["gpt"]);
  });

  it("refuses to let a desktop client claim runner-enforced blindness", () => {
    expect(() =>
      PlaytestProviderSchema.parse({
        id: "x",
        displayName: "X",
        vendor: "x",
        family: "x",
        kind: "desktop_client",
        isolation: "runner_enforced",
        catalogPath: "p.json",
        transportContract: "t",
      }),
    ).toThrow(/isolation can only be operator_attested/);
  });

  it("refuses a headless provider with no launch template", () => {
    expect(() =>
      PlaytestProviderSchema.parse({
        id: "x",
        displayName: "X",
        vendor: "x",
        family: "x",
        kind: "headless_cli",
        isolation: "runner_enforced",
        catalogPath: "p.json",
        transportContract: "t",
      }),
    ).toThrow(/must declare a launch template/);
  });

  it("substitutes launch tokens exactly, never expanding one argument into two", () => {
    const codex = findPlaytestProvider("codex")!;
    const { executable, argv } = resolvePlaytestArgv(codex, {
      model: "gpt-5.3-codex-spark",
      cwd: "/repo with space",
    });
    expect(executable).toBe("codex");
    expect(argv).toContain("/repo with space");
    expect(argv.filter((a) => a === "/repo with space")).toHaveLength(1);
  });

  it("will not launch a desktop provider", () => {
    const grok = findPlaytestProvider("grok_desktop")!;
    expect(() => resolvePlaytestArgv(grok, { model: "grok-4", cwd: "/repo" })).toThrow(
      /is not launched by the runner/,
    );
  });

  it("ships a parseable catalog for every registered provider", () => {
    for (const provider of PLAYTEST_PROVIDERS) {
      const raw = JSON.parse(readFileSync(provider.catalogPath, "utf8"));
      const catalog = parsePlaytestCatalog(provider, raw);
      expect(catalog.models.length).toBeGreaterThan(0);
      // Every vendor must offer a cheap player: the fleet's job is volume.
      expect(catalog.models.some((m) => m.tier === "volume")).toBe(true);
    }
  });

  it("rejects an alias that is not verbatim in the catalog", () => {
    const codex = findPlaytestProvider("codex")!;
    const catalog = parsePlaytestCatalog(
      codex,
      JSON.parse(readFileSync(codex.catalogPath, "utf8")),
    );
    expect(() => findCatalogModel(catalog, "latest")).toThrow(/is not in the codex catalog/);
  });
});

describe("playtest session record", () => {
  it("round-trips through its content address", () => {
    const record = sealPlaytestSession(body());
    expect(parsePlaytestSession(JSON.parse(JSON.stringify(record)))).toEqual(record);
  });

  it("detects a record edited after it was written", () => {
    const record = sealPlaytestSession(body());
    const tampered = { ...record, run_seed: 8 };
    expect(() => parsePlaytestSession(tampered)).toThrow(/modified after it was written/);
  });

  it("requires a completed session to carry both the interview and the receipt", () => {
    expect(() => sealPlaytestSession(body({ outcome: "completed", failure_note: null }))).toThrow(
      /journey receipt/,
    );
  });

  it("requires every non-completed session to explain itself", () => {
    expect(() => sealPlaytestSession(body({ failure_note: null }))).toThrow(/failure_note/);
  });

  it("keeps operator-attested sessions but excludes them from experience metrics", () => {
    const attested = sealPlaytestSession(
      body({
        provider: {
          id: "grok_desktop",
          vendor: "xai",
          family: "grok",
          isolation: "operator_attested",
          transport_contract: "operator-attested-mcp-v1",
          operator_attestation: {
            attested_by: "operator",
            method: "desktop client, AdventureForge MCP only",
            attested_at: "2026-08-28T12:00:00.000Z",
          },
        },
      }),
    );
    // Kept and readable …
    expect(attested.record_id).toMatch(/^[0-9a-f]{64}$/);
    // … but never counted as proven experience evidence.
    expect(countsTowardExperienceMetrics(attested)).toBe(false);
  });

  it("requires an attestation exactly when the runner could not prove isolation", () => {
    expect(() =>
      sealPlaytestSession(
        body({
          provider: {
            id: "grok_desktop",
            vendor: "xai",
            family: "grok",
            isolation: "operator_attested",
            transport_contract: "operator-attested-mcp-v1",
          },
        }),
      ),
    ).toThrow(/must record who attested/);
  });
});

describe("playtest session store", () => {
  const transcript = "line one\nline two\n";

  it("writes and reads a session, and is idempotent for identical content", () => {
    const store = tempDir();
    const record = sealPlaytestSession(body());
    const first = writePlaytestSession(store, record, transcript);
    const second = writePlaytestSession(store, record, transcript);
    expect(second).toBe(first);
    const { entries, unreadable } = listPlaytestSessions(store);
    expect(unreadable).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.record.record_id).toBe(record.record_id);
  });

  it("refuses a transcript that does not match the record's hash", () => {
    const store = tempDir();
    const record = sealPlaytestSession(body());
    expect(() => writePlaytestSession(store, record, "tampered\n")).toThrow(
      /transcript hash mismatch/,
    );
  });

  it("reports an unreadable session instead of silently skipping it", () => {
    const store = tempDir();
    const record = sealPlaytestSession(body());
    const dir = writePlaytestSession(store, record, transcript);
    writeFileSync(join(dir, "session.json"), '{"schema_version":1}', "utf8");
    const { entries, unreadable } = listPlaytestSessions(store);
    expect(entries).toHaveLength(0);
    expect(unreadable).toHaveLength(1);
  });

  it("summarizes the corpus by outcome, provider, tier and isolation", () => {
    const store = tempDir();
    writePlaytestSession(store, sealPlaytestSession(body()), transcript);
    writePlaytestSession(
      store,
      sealPlaytestSession(
        body({ run_seed: 99, model: { id: "gpt-5.6-terra", tier: "reference", settings: {} } }),
      ),
      transcript,
    );
    const summary = summarizePlaytestStore(listPlaytestSessions(store).entries);
    expect(summary.total).toBe(2);
    expect(summary.byTier).toEqual({ volume: 1, reference: 1 });
    expect(summary.families).toEqual(["gpt"]);
    // Neither is `completed`, so neither is metrics-eligible.
    expect(summary.metricsEligible).toBe(0);
  });
});

describe("ticket promotion", () => {
  it("keeps a stable id as evidence accumulates", () => {
    const identity = { kind: "bug" as const, location: "byre_yard", fingerprint: "abc" };
    expect(ticketId(identity)).toBe(ticketId({ ...identity }));
  });

  it("promotes on reference-tier confirmation alone", () => {
    expect(
      derivePromotion({ families: ["gemini"], tiers: ["reference"] }, { verified: false }),
    ).toBe("corroborated");
  });

  it("does NOT promote one cheap lineage no matter how loud it is", () => {
    expect(derivePromotion({ families: ["gemini"], tiers: ["volume"] }, { verified: false })).toBe(
      "accumulating",
    );
  });

  it("promotes once a second independent lineage agrees", () => {
    expect(
      derivePromotion({ families: ["gemini", "gpt"], tiers: ["volume"] }, { verified: false }),
    ).toBe("corroborated");
  });

  it("lets a reproduction outrank any amount of agreement", () => {
    expect(derivePromotion({ families: [], tiers: [] }, { verified: true })).toBe("verified");
  });

  it("hides accumulating tickets from the dev loop", () => {
    const base = {
      schema_version: 1 as const,
      ticket_id: "0".repeat(16),
      title: "t",
      kind: "bug" as const,
      severity: "S2" as const,
      status: "open" as const,
      location: "l",
      excerpts: [],
      evidence: {
        report_count: 1,
        families: ["gemini"],
        providers: ["gemini_cli"],
        tiers: ["volume" as const],
        has_runner_enforced_report: true,
        session_ids: ["s"],
        first_seen_build: "a",
        last_seen_build: "a",
        first_seen_at: "2026-08-28T12:00:00.000Z",
        last_seen_at: "2026-08-28T12:00:00.000Z",
      },
      priority: 1,
    };
    expect(isActionable({ ...base, promotion: "accumulating" })).toBe(false);
    expect(isActionable({ ...base, promotion: "corroborated" })).toBe(true);
    expect(isActionable({ ...base, promotion: "verified", status: "wont_fix" })).toBe(false);
  });
});

describe("ranking across a mixed-vendor fleet", () => {
  function cluster(over: Partial<IssueCluster>): IssueCluster {
    return {
      key: "k",
      issues: Array.from({ length: 3 }, () => ({}) as never),
      tokens: [],
      location: {
        kind: "unmapped",
        questId: null,
        region: null,
        node: null,
        sceneId: null,
        raw: ["x"],
      },
      maxSeverity: "S2",
      severityBand: "moderate",
      sources: ["fleet"],
      personas: [],
      families: [],
      tiers: [],
      ...over,
    } as IssueCluster;
  }

  it("scores legacy clusters with no provider metadata exactly as before", () => {
    expect(scoreCluster(cluster({}))).toBe(3 * 4);
  });

  it("ranks a small reference-only finding above a large single-lineage volume one", () => {
    const referenceOnly = cluster({
      issues: Array.from({ length: 3 }, () => ({}) as never),
      families: ["gpt"],
      tiers: ["reference"],
    });
    const volumeFlood = cluster({
      issues: Array.from({ length: 40 }, () => ({}) as never),
      families: ["gemini"],
      tiers: ["volume"],
    });
    expect(scoreCluster(referenceOnly)).toBeGreaterThan(scoreCluster(volumeFlood));
  });

  it("rewards independent lineages over repetition within one", () => {
    const fourVendors = cluster({
      issues: Array.from({ length: 8 }, () => ({}) as never),
      families: ["claude", "gemini", "gpt", "grok"],
      tiers: ["volume"],
    });
    const oneVendorLouder = cluster({
      issues: Array.from({ length: 64 }, () => ({}) as never),
      families: ["gemini"],
      tiers: ["volume"],
    });
    expect(scoreCluster(fourVendors)).toBeGreaterThan(scoreCluster(oneVendorLouder));
  });

  it("treats both tiers agreeing as the strongest experiential signal", () => {
    const both = cluster({ families: ["gpt", "gemini"], tiers: ["reference", "volume"] });
    const volumeOnly = cluster({ families: ["gpt", "gemini"], tiers: ["volume"] });
    expect(scoreCluster(both)).toBeGreaterThan(scoreCluster(volumeOnly));
  });
});
