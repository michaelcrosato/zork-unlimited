/** Usage accounting must remain fail-closed and independent of fleet I/O. */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain-JS fleet helper without type declarations.
import * as fleetUsage from "../../blind-tester/fleet-usage.mjs";

const {
  projectCodexClientForFleetSummary,
  skippedResumeUsageRecord,
  summarizeFleetUsage,
  usageRecordFromFailedAttempt,
  usageRecordFromStrictStreamDiagnostic,
  usageRecordFromVerifiedPrimaryEnvelope,
} = fleetUsage;

const TERMINAL_USAGE = {
  input_tokens: 100,
  cached_input_tokens: 60,
  output_tokens: 25,
  reasoning_output_tokens: 15,
};

const PRIMARY_USAGE = {
  input_tokens: 100,
  cache_read_input_tokens: 60,
  output_tokens: 25,
  reasoning_output_tokens: 15,
};

function primaryEnvelope(
  usage: {
    input_tokens: number;
    cache_read_input_tokens: number;
    output_tokens: number;
    reasoning_output_tokens?: number;
  } = PRIMARY_USAGE,
) {
  return {
    type: "result",
    subtype: "success",
    provider: "codex",
    is_error: false,
    terminal_reason: "completed",
    num_turns: 3,
    result: "The journey ended.",
    session_id: "019f7250-1ed0-7102-be6c-4f1d5513d91e",
    requested_model: "gpt-5.6-terra",
    usage,
    modelUsage: {
      "gpt-5.6-terra": {
        inputTokens: usage.input_tokens,
        cacheReadInputTokens: usage.cache_read_input_tokens,
        outputTokens: usage.output_tokens,
        ...(usage.reasoning_output_tokens === undefined
          ? {}
          : { reasoningOutputTokens: usage.reasoning_output_tokens }),
      },
    },
  };
}

function fleetClient(overrides: Record<string, unknown> = {}) {
  const authorityToken = "authority-token-for-safe-projection";
  return {
    schema_version: 2,
    launcher_kind: "direct",
    selected_binary: "C:\\tools\\codex.exe",
    executable_binary: "C:\\tools\\codex.exe",
    authority_token: authorityToken,
    authority_sha256: createHash("sha256").update(authorityToken, "utf8").digest("hex"),
    cli_version: "0.145.0",
    test_script: false,
    ...overrides,
  };
}

function jsonl(rows: unknown[]): string {
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

function strictStreamDiagnostic(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema_version: 2,
    acceptance_eligible: false,
    canonical: false,
    ignored: true,
    kind: "strict_stream_rejection_diagnostic",
    surface: "private_rollout",
    transport_contract: "spark-direct-mcp-v1",
    commitments: {},
    binding: {},
    rejection: { failure: "direct_output_mismatch" },
    usage_lower_bound: TERMINAL_USAGE,
    ...overrides,
  });
}

describe("fleet usage accounting", () => {
  it("uses only the authenticated primary envelope for a verified attempt", () => {
    expect(usageRecordFromVerifiedPrimaryEnvelope(JSON.stringify(primaryEnvelope()))).toEqual({
      source: "primary_envelope",
      input_tokens: 100,
      cached_input_tokens: 60,
      output_tokens: 25,
      reasoning_output_tokens: 15,
    });
  });

  it("normalizes the primary cache-read field and the raw terminal cache field separately", () => {
    expect(
      usageRecordFromVerifiedPrimaryEnvelope(
        JSON.stringify(primaryEnvelope({ ...PRIMARY_USAGE, cache_read_input_tokens: 91 })),
      ),
    ).toMatchObject({ source: "primary_envelope", cached_input_tokens: 91 });
    expect(
      usageRecordFromFailedAttempt({
        providerEventsText: jsonl([
          { type: "turn.completed", usage: { ...TERMINAL_USAGE, cached_input_tokens: 19 } },
        ]),
      }),
    ).toMatchObject({ source: "terminal_turn_completed", cached_input_tokens: 19 });
  });

  it("rejects duplicate-key, malformed, incomplete, unsafe, and impossible primary usage", () => {
    for (const primary of [
      '{"type":"result","type":"result"}',
      "{not json}",
      JSON.stringify({ usage: PRIMARY_USAGE }),
      JSON.stringify(primaryEnvelope({ ...PRIMARY_USAGE, input_tokens: -1 })),
      JSON.stringify(primaryEnvelope({ ...PRIMARY_USAGE, cache_read_input_tokens: 101 })),
      JSON.stringify(
        primaryEnvelope({ ...PRIMARY_USAGE, output_tokens: Number.MAX_SAFE_INTEGER + 1 }),
      ),
      JSON.stringify(primaryEnvelope({ ...PRIMARY_USAGE, reasoning_output_tokens: 1.5 })),
      JSON.stringify({ ...primaryEnvelope(), terminal_reason: "failed" }),
      JSON.stringify({
        ...primaryEnvelope(),
        modelUsage: { "gpt-5.6-terra": { inputTokens: 1 } },
      }),
    ]) {
      expect(usageRecordFromVerifiedPrimaryEnvelope(primary)).toMatchObject({
        source: "unrecoverable",
        input_tokens: null,
        cached_input_tokens: null,
        output_tokens: null,
        reasoning_output_tokens: null,
      });
    }
  });

  it("requires primary reasoning usage but treats an omitted raw terminal count as zero", () => {
    const missingPrimaryReasoning = primaryEnvelope({
      input_tokens: 7,
      cache_read_input_tokens: 0,
      output_tokens: 3,
    });
    expect(
      usageRecordFromVerifiedPrimaryEnvelope(JSON.stringify(missingPrimaryReasoning)),
    ).toMatchObject({
      source: "unrecoverable",
    });
    expect(
      usageRecordFromFailedAttempt({
        providerEventsText: jsonl([
          {
            type: "turn.completed",
            usage: { input_tokens: 7, cached_input_tokens: 0, output_tokens: 3 },
          },
        ]),
      }),
    ).toMatchObject({ source: "terminal_turn_completed", reasoning_output_tokens: 0 });
  });

  it("uses an archived primary for a failed attempt and never falls through from malformed bytes", () => {
    const terminalEvents = jsonl([{ type: "turn.completed", usage: TERMINAL_USAGE }]);
    expect(
      usageRecordFromFailedAttempt({
        archivedPrimaryEnvelopeText: JSON.stringify(
          primaryEnvelope({ ...PRIMARY_USAGE, output_tokens: 4 }),
        ),
        providerEventsText: terminalEvents,
      }),
    ).toMatchObject({ source: "primary_envelope", output_tokens: 4 });
    expect(
      usageRecordFromFailedAttempt({
        archivedPrimaryEnvelopeText: "{bad primary",
        providerEventsText: terminalEvents,
      }),
    ).toMatchObject({ source: "unrecoverable" });
  });

  it("falls back only to a strict terminal turn.completed row when primary is absent", () => {
    expect(
      usageRecordFromFailedAttempt({
        providerEventsText: jsonl([
          { type: "turn.started" },
          { type: "turn.completed", usage: TERMINAL_USAGE },
        ]),
      }),
    ).toEqual({ source: "terminal_turn_completed", ...TERMINAL_USAGE });

    for (const events of [
      jsonl([{ type: "turn.completed", usage: TERMINAL_USAGE }, { type: "item.completed" }]),
      '{"type":"turn.completed","type":"turn.completed","usage":{}}\n',
      jsonl([
        {
          type: "turn.completed",
          usage: { ...TERMINAL_USAGE, cached_input_tokens: 101 },
        },
      ]),
    ]) {
      expect(usageRecordFromFailedAttempt({ providerEventsText: events })).toMatchObject({
        source: "unrecoverable",
      });
    }
  });

  it("retains an allowlisted strict-stream token lower bound without calling it complete", () => {
    const lowerBound = usageRecordFromStrictStreamDiagnostic(strictStreamDiagnostic());
    expect(lowerBound).toEqual({ source: "strict_stream_lower_bound", ...TERMINAL_USAGE });
    expect(summarizeFleetUsage([lowerBound])).toEqual({
      attempt_count: 1,
      launched_attempt_count: 1,
      measured_attempt_count: 0,
      skipped_resume_count: 0,
      unrecoverable_attempt_count: 1,
      complete: false,
      observed_input_tokens: 100,
      observed_cached_input_tokens: 60,
      observed_uncached_input_tokens: 40,
      observed_output_tokens: 25,
      observed_reasoning_output_tokens: 15,
      useful_tokens: 65,
    });
  });

  it("rejects unsafe categories and malformed strict-stream token lower bounds", () => {
    for (const diagnostic of [
      strictStreamDiagnostic({ rejection: { failure: "raw provider prose" } }),
      strictStreamDiagnostic({ transport_contract: "strict-code-mode-v2" }),
      strictStreamDiagnostic({ usage_lower_bound: null }),
      strictStreamDiagnostic({
        usage_lower_bound: { ...TERMINAL_USAGE, reasoning_output_tokens: 26 },
      }),
      strictStreamDiagnostic({
        usage_lower_bound: { ...TERMINAL_USAGE, provider_secret: 1 },
      }),
      '{"schema_version":2,"schema_version":2}',
    ]) {
      expect(usageRecordFromStrictStreamDiagnostic(diagnostic)).toMatchObject({
        source: "unrecoverable",
        input_tokens: null,
      });
    }
  });

  it("makes resumed work explicit zero usage and reports observed totals without laundering gaps", () => {
    expect(skippedResumeUsageRecord()).toEqual({
      source: "skipped_resume",
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
    });
    expect(
      summarizeFleetUsage([
        usageRecordFromVerifiedPrimaryEnvelope(JSON.stringify(primaryEnvelope())),
        usageRecordFromFailedAttempt({
          providerEventsText: jsonl([
            {
              type: "turn.completed",
              usage: { input_tokens: 30, cached_input_tokens: 5, output_tokens: 9 },
            },
          ]),
        }),
        skippedResumeUsageRecord(),
        usageRecordFromFailedAttempt(),
      ]),
    ).toEqual({
      attempt_count: 4,
      launched_attempt_count: 3,
      measured_attempt_count: 2,
      skipped_resume_count: 1,
      unrecoverable_attempt_count: 1,
      complete: false,
      observed_input_tokens: 130,
      observed_cached_input_tokens: 65,
      observed_uncached_input_tokens: 65,
      observed_output_tokens: 34,
      observed_reasoning_output_tokens: 15,
      useful_tokens: 99,
    });
  });

  it("rejects fabricated records instead of treating them as accounting input", () => {
    expect(() =>
      summarizeFleetUsage([
        {
          source: "primary_envelope",
          input_tokens: 1,
          cached_input_tokens: 2,
          output_tokens: 0,
          reasoning_output_tokens: 0,
        },
      ]),
    ).toThrow("exact accounting schema");
  });

  it("refuses totals that cannot remain exact JavaScript integers", () => {
    const nearlyMaximal = {
      source: "primary_envelope",
      input_tokens: Number.MAX_SAFE_INTEGER,
      cached_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
    };
    expect(() => summarizeFleetUsage([nearlyMaximal, nearlyMaximal])).toThrow(
      "exceeds the safe integer range",
    );
  });

  it("projects only non-sensitive Codex client fields for the fleet summary", () => {
    const client = fleetClient({ extra_secret: "must not leak" });
    expect(projectCodexClientForFleetSummary(client)).toEqual({
      schema_version: 2,
      launcher_kind: "direct",
      authority_sha256: client.authority_sha256,
      cli_version: "0.145.0",
    });
    expect(Object.keys(projectCodexClientForFleetSummary(client)).sort()).toEqual([
      "authority_sha256",
      "cli_version",
      "launcher_kind",
      "schema_version",
    ]);
  });

  it("rejects invalid or test-only Codex client records before projection", () => {
    expect(() => projectCodexClientForFleetSummary(fleetClient({ test_script: true }))).toThrow(
      "safe Codex authority contract",
    );
    expect(() =>
      projectCodexClientForFleetSummary(fleetClient({ authority_sha256: "0".repeat(64) })),
    ).toThrow("safe Codex authority contract");
    expect(() => projectCodexClientForFleetSummary(fleetClient({ schema_version: 3 }))).toThrow(
      "safe Codex authority contract",
    );
  });
});
