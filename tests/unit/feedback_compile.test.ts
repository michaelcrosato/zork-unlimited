import { createHash } from "node:crypto";
import { describe, expect, it, beforeAll } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  existsSync,
  readFileSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectInputs,
  compileFeedback,
  FeedbackCohortThresholdError,
} from "../../src/feedback/compile.js";
import {
  FeedbackEvidenceSummarySchema,
  summarizeFeedbackEvidence,
} from "../../src/feedback/evidence_summary.js";
import { PureExitInterviewV2Schema } from "../../src/blind/exit_interview.js";
import { HotspotsFileSchema } from "../../src/feedback/schema.js";
import { resolveFeedbackInputs } from "../../src/feedback/inputs.js";
import { CrawlFindingSchema, type CrawlFinding } from "../../src/crawl/findings.js";
import { hashState } from "../../src/core/hash.js";
import { pureFleetRunArtifactPaths } from "../../src/starting_slice/fleet_run_artifacts.js";
import { loadReportManifest, sha256File } from "../../src/feedback/report_manifest.js";
import type { FeedbackAcceptanceState } from "../../src/feedback/acceptance.js";

// Three hand-written, verifier-passing report skeletons (a real "Playthrough
// log"/"Verdict"/clarity+enjoyment rating section plus a fenced exit-interview
// block — see src/blind/report_verifier.ts). Report C deliberately omits the
// exit-interview block so it must be REJECTED and excluded from clustering.
//
// Report A's bug is planted at the real overworld node id "albany_city" (an
// exact rung-1 id hit — see src/feedback/normalize.ts); the crawl findings
// fixture below plants a WORLD finding at the SAME node with near-identical
// wording, so the two are expected to merge into one crawler+fleet cluster
// and earn the BOTH_SOURCES_BONUS.
const REPORT_A = `# Blind Playtest Report (fixture seed 1, overworld)

## Playthrough log

- Explored the opening town and reached the station quarter.

## Did it work mechanically?

No rejected actions this run.

## Understandable & fun?

Clarity: 4/5. Enjoyment: 3/5. Could tell what to do without getting stuck.

## Confusion / friction points

None noted this run.

## Bugs or design flaws

- **albany_city** (S3): notice board confusing about quest start

## Verdict

The opening held together well enough that a new player would likely keep going.

## Exit interview

\`\`\`json exit-interview
{
  "clarity": 4,
  "enjoyment": 3,
  "goal_understood": true,
  "got_stuck": false,
  "confusions": [],
  "bugs": [
    { "where": "albany_city", "severity": "S3", "note": "notice board confusing about quest start" }
  ],
  "best_moment": "Finding the road out of the opening town.",
  "worst_moment": "Running into the notice board confusion.",
  "would_replay": true,
  "verdict": "The opening held together well enough that a new player would likely keep going."
}
\`\`\`
`;

const REPORT_B = `# Blind Playtest Report (fixture seed 2, overworld)

## Playthrough log

- Wandered a stretch of the map with nothing much happening.

## Did it work mechanically?

No rejected actions this run.

## Understandable & fun?

Clarity: 3/5. Enjoyment: 3/5. Could tell what to do without getting stuck.

## Confusion / friction points

- nowhere in particular felt worth mentioning

## Bugs or design flaws

- **nowhere in particular** (S1): minor wording nit unrelated to anything else

## Verdict

A quiet run with nothing much standing out either way.

## Exit interview

\`\`\`json exit-interview
{
  "clarity": 3,
  "enjoyment": 3,
  "goal_understood": true,
  "got_stuck": false,
  "confusions": ["nowhere in particular felt worth mentioning"],
  "bugs": [
    { "where": "nowhere in particular", "severity": "S1", "note": "minor wording nit unrelated to anything else" }
  ],
  "best_moment": "A calm stretch of exploring.",
  "worst_moment": "Nothing much happened.",
  "would_replay": false,
  "verdict": "A quiet run with nothing much standing out either way."
}
\`\`\`
`;

// No exit-interview block at all — must be rejected by verifyBlindReportText
// and excluded from every downstream step (no IssueRecords, no metrics).
const REPORT_C = `# Blind Playtest Report (fixture seed 3, overworld)

## Playthrough log

- Started the run but the report ends here without a structured interview.

## Did it work mechanically?

No rejected actions this run.

## Understandable & fun?

Clarity: 2/5. Enjoyment: 2/5. Got stuck a bit.

## Confusion / friction points

None noted this run.

## Bugs or design flaws

None found this run.

## Verdict

This report is intentionally missing its exit interview block so the compiler must reject it.
`;

function pureReportAndSidecar(
  options: {
    proofCharacter?: string;
    continued?: boolean;
    earlyGoal?: boolean;
    contractVersion?: 1 | 2;
  } = {},
): {
  report: string;
  sidecar: string;
} {
  const proofCharacter = options.proofCharacter ?? "a";
  const continued = options.continued ?? false;
  const earlyGoal = options.earlyGoal ?? false;
  const contractVersion = options.contractVersion ?? 1;
  const firstDecisionProofHash = proofCharacter.repeat(64);
  const finalDecisionProofHash = continued
    ? String.fromCharCode(proofCharacter.charCodeAt(0) + 1).repeat(64)
    : firstDecisionProofHash;
  const acceptedDecisions = earlyGoal ? 12 : continued ? 80 : 40;
  const retentionHistory = earlyGoal
    ? [
        {
          sequence: 1,
          atDecision: 12,
          reasons: ["goal_completed"],
          checkpoint: null,
          choice: "end",
          decisionProofHash: finalDecisionProofHash,
        },
      ]
    : [
        {
          sequence: 1,
          atDecision: 40,
          reasons: ["checkpoint"],
          checkpoint: 40,
          choice: continued ? "continue" : "end",
          decisionProofHash: firstDecisionProofHash,
        },
        ...(continued
          ? [
              {
                sequence: 2,
                atDecision: 80,
                reasons: ["checkpoint"],
                checkpoint: 80,
                choice: "end",
                decisionProofHash: finalDecisionProofHash,
              },
            ]
          : []),
      ];
  const receiptPayload = {
    contractVersion,
    exitReason: "player_ended_at_choice",
    goalVersion: 1,
    goalId: "albany_local_lead",
    goalStatus: earlyGoal ? "completed" : "active",
    acceptedDecisions,
    exitReasons: [earlyGoal ? "goal_completed" : "checkpoint"],
    checkpoint: earlyGoal ? null : acceptedDecisions,
    decisionProofHash: finalDecisionProofHash,
    retentionHistory,
  };
  const receipt = { ...receiptPayload, receiptHash: hashState(receiptPayload) };
  const interview = {
    schema_version: 2,
    play_mode: "pure",
    start_surface: "fresh_overworld",
    retention_eligible: true,
    journey_exit_receipt: receipt,
    clarity: 4,
    enjoyment: 4,
    goal_understood: true,
    got_stuck: false,
    confusions: [],
    bugs: [],
    best_moment: "The game let me choose my own local lead.",
    worst_moment: "One transition felt slower than expected.",
    would_replay: true,
    verdict: "The player-facing goal and journey choice were both clear enough to continue.",
  };
  const report = `# Pure blind report

## Playthrough log

I played until the game presented its journey choice and chose to end.

## Did it work mechanically?

No mechanical failures.

## Understandable & fun?

Clarity 4/5. Enjoyment 4/5.

## Verdict

The player-facing goal and journey choice were both clear enough to continue.

\`\`\`json exit-interview
${JSON.stringify(interview, null, 2)}
\`\`\`
`;
  const sidecar = JSON.stringify({
    schema_version: 1,
    report_schema_version: 2,
    play_mode: "pure",
    start_surface: "fresh_overworld",
    retention_eligible: true,
    evidence_status: "verified",
    session_id: `o-${proofCharacter}`,
    receipt,
  });
  return { report, sidecar };
}

function writeCodexGameplayArtifacts(
  base: string,
  report: string,
  legacySidecar: string,
  {
    forbiddenWrapper = false,
    runSeed = 5,
    session = "019f7250-1ed0-7102-be6c-4f1d5513d91e",
    turn = "119f7250-1ed0-7102-be6c-4f1d5513d91e",
  } = {},
): void {
  const legacy = JSON.parse(legacySidecar) as Record<string, unknown>;
  const gameSessionId = legacy.session_id;
  const receipt = legacy.receipt;
  if (typeof gameSessionId !== "string" || receipt === null || typeof receipt !== "object") {
    throw new Error("invalid pure sidecar fixture");
  }
  const build = {
    git_commit: "a".repeat(40),
    tracked_worktree_clean: true,
    world_id: "new_york_overworld",
    world_hash: "b".repeat(64),
  };
  const sidecar = {
    ...legacy,
    schema_version: 2,
    run_seed: runSeed,
    build,
    quest_outcomes: [],
  };
  writeFileSync(`${base}.run.json`, `${JSON.stringify(sidecar)}\n`);
  const evidenceCommon = {
    schema_version: 2,
    play_mode: "pure",
    start_surface: "fresh_overworld",
    session_id: gameSessionId,
    run_seed: runSeed,
    build,
  };
  writeFileSync(
    `${base}.evidence.jsonl`,
    `${JSON.stringify({ ...evidenceCommon, event: "fresh_start" })}\n${JSON.stringify({
      ...evidenceCommon,
      event: "journey_exit",
      quest_outcomes: [],
      receipt,
    })}\n`,
  );
  const result = { content: [] };
  const call = {
    id: "item_1",
    type: "mcp_tool_call",
    server: "adventureforge",
    tool: "start_overworld",
    arguments: {},
  };
  writeFileSync(
    `${base}.json`,
    `${JSON.stringify({
      type: "result",
      subtype: "success",
      provider: "codex",
      is_error: false,
      duration_ms: 1,
      num_turns: 1,
      result: report,
      session_id: session,
      requested_model: "gpt-5.6-terra",
      terminal_reason: "completed",
      usage: {
        input_tokens: 1,
        cache_read_input_tokens: 0,
        output_tokens: 1,
        reasoning_output_tokens: 0,
      },
      modelUsage: {
        "gpt-5.6-terra": {
          inputTokens: 1,
          cacheReadInputTokens: 0,
          outputTokens: 1,
          reasoningOutputTokens: 0,
        },
      },
    })}\n`,
  );
  writeFileSync(
    `${base}.codex.jsonl`,
    `${[
      { type: "thread.started", thread_id: session },
      { type: "turn.started" },
      {
        type: "item.started",
        item: { ...call, result: null, error: null, status: "in_progress" },
      },
      {
        type: "item.completed",
        item: {
          ...call,
          result: { ...result, structured_content: null },
          error: null,
          status: "completed",
        },
      },
      {
        type: "item.completed",
        item: { id: "item_2", type: "agent_message", text: report },
      },
      {
        type: "turn.completed",
        usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 },
      },
    ]
      .map((row) => JSON.stringify(row))
      .join("\n")}\n`,
  );
  const cwd = "C:\\private\\player";
  const inputMessage = (role: "developer" | "user", ...texts: string[]) => ({
    type: "response_item",
    payload: {
      type: "message",
      role,
      content: texts.map((text) => ({ type: "input_text", text })),
      internal_chat_message_metadata_passthrough: { turn_id: turn },
    },
  });
  const rolloutRows = [
    {
      type: "session_meta",
      payload: { id: session, cwd, cli_version: "0.145.0", model_provider: "openai" },
    },
    { type: "event_msg", payload: { type: "task_started", turn_id: turn } },
    inputMessage(
      "developer",
      "<permissions instructions>read-only player</permissions instructions>",
      "<skills_instructions>player skills</skills_instructions>",
    ),
    inputMessage(
      "developer",
      "You are `/root`, the primary agent in a team of agents collaborating to fulfill the user's goals.",
    ),
    inputMessage(
      "developer",
      "<multi_agent_mode>Only explicit requests permit delegation.</multi_agent_mode>",
    ),
    inputMessage("user", "<environment_context>isolated player</environment_context>"),
    { type: "world_state", payload: { full: true } },
    {
      type: "turn_context",
      payload: {
        turn_id: turn,
        cwd,
        approval_policy: "never",
        sandbox_policy: { type: "read-only" },
        model: "gpt-5.6-terra",
        collaboration_mode: {
          mode: "default",
          settings: {
            model: "gpt-5.6-terra",
            reasoning_effort: "xhigh",
            developer_instructions: null,
          },
        },
        multi_agent_version: "v2",
        multi_agent_mode: "explicitRequestOnly",
        effort: "xhigh",
      },
    },
    inputMessage("user", "blind prompt"),
    {
      type: "event_msg",
      payload: {
        type: "user_message",
        message: "blind prompt",
        images: [],
        local_images: [],
        text_elements: [],
      },
    },
    {
      type: "response_item",
      payload: {
        type: "custom_tool_call",
        id: "wrapper-item-1",
        status: "completed",
        call_id: "call-wrapper-1",
        name: "exec",
        input: forbiddenWrapper
          ? "const hits = ALL_TOOLS.filter((tool) => tool.name);\ntext(hits);\n"
          : "const result = await tools.mcp__adventureforge__start_overworld({});\ntext(JSON.stringify(result));\n",
        internal_chat_message_metadata_passthrough: { turn_id: turn },
      },
    },
    {
      type: "event_msg",
      payload: {
        type: "mcp_tool_call_end",
        call_id: "exec-gameplay-1",
        invocation: { server: "adventureforge", tool: "start_overworld", arguments: {} },
        result: { Ok: result },
      },
    },
    {
      type: "response_item",
      payload: {
        type: "custom_tool_call_output",
        call_id: "call-wrapper-1",
        internal_chat_message_metadata_passthrough: { turn_id: turn },
        output: [
          { type: "input_text", text: "Script completed\nWall time 0.0 seconds\nOutput:\n" },
          { type: "input_text", text: JSON.stringify(result) },
        ],
      },
    },
    {
      type: "event_msg",
      payload: {
        type: "agent_message",
        message: report,
        phase: "final_answer",
        memory_citation: null,
      },
    },
    {
      type: "response_item",
      payload: {
        type: "message",
        id: "final-message",
        role: "assistant",
        content: [{ type: "output_text", text: report }],
        phase: "final_answer",
        internal_chat_message_metadata_passthrough: { turn_id: turn },
      },
    },
    {
      type: "event_msg",
      payload: { type: "task_complete", turn_id: turn, last_agent_message: report },
    },
  ];
  const rolloutText = `${rolloutRows.map((row) => JSON.stringify(row)).join("\n")}\n`;
  writeFileSync(`${base}.codex-rollout.jsonl`, rolloutText);
  writeFileSync(
    `${base}.codex-capture.json`,
    `${JSON.stringify({
      schema_version: 1,
      binding: "runner_work_player",
      recorded_session_cwd: cwd,
      recorded_turn_cwd: cwd,
      canonical_expected_cwd: cwd,
      canonical_session_cwd: cwd,
      canonical_turn_cwd: cwd,
      expected_directory_identity: { device_id: "1", file_id: "2" },
      session_directory_identity: { device_id: "1", file_id: "2" },
      turn_directory_identity: { device_id: "1", file_id: "2" },
      copied_rollout_sha256: createHash("sha256").update(rolloutText).digest("hex"),
    })}\n`,
  );
}

function structuralReport(): string {
  const interview = {
    schema_version: 2,
    play_mode: "structural",
    start_surface: "fresh_overworld",
    retention_eligible: false,
    structural_kind: "mock",
    clarity: 3,
    enjoyment: 3,
    goal_understood: true,
    got_stuck: false,
    confusions: [],
    bugs: [],
    best_moment: "The structural path completed deterministically.",
    worst_moment: "This was QA rather than a live player journey.",
    would_replay: true,
    verdict: "Useful structural QA evidence, but deliberately not live-player retention evidence.",
  };
  return `# Structural blind report

## Playthrough log

Ran the explicit structural mock path.

## Did it work mechanically?

No mechanical failures.

## Understandable & fun?

Clarity 3/5. Enjoyment 3/5.

## Verdict

Useful structural QA evidence, but deliberately not live-player retention evidence.

\`\`\`json exit-interview
${JSON.stringify(interview, null, 2)}
\`\`\`
`;
}

function buildCrawlFinding(overrides: Partial<CrawlFinding>): CrawlFinding {
  return CrawlFindingSchema.parse({
    code: "ORPHAN",
    severity: "S0",
    seed: 42,
    policy: "mixed",
    step: 0,
    location: { region: null, node: null, questId: null, sceneId: null },
    action: null,
    message: "fixture finding",
    stateHash: null,
    commit: "fixture",
    repro: { kind: "none", trace: null, minimized: false },
    ...overrides,
  });
}

let reportsDir: string;
let crawlFindingsPath: string;

beforeAll(() => {
  const root = mkdtempSync(join(tmpdir(), "feedback-compile-"));
  reportsDir = join(root, "reports");
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, "20260101T000000Z_overworld_seed1.md"), REPORT_A);
  writeFileSync(join(reportsDir, "20260101T000000Z_overworld_seed2.md"), REPORT_B);
  writeFileSync(join(reportsDir, "20260101T000000Z_overworld_seed3.md"), REPORT_C);

  const findings = [
    // Overlaps report A's bug: same node, near-identical wording ⇒ same
    // cluster, both sources present ⇒ BOTH_SOURCES_BONUS.
    buildCrawlFinding({
      code: "WORLD",
      severity: "S3",
      location: { region: null, node: "albany_city", questId: null, sceneId: null },
      message: "notice board confusing about quest start",
    }),
    // Coverage row — must be counted in inputs.crawl_findings but EXCLUDED
    // from clustering entirely.
    buildCrawlFinding({
      code: "ORPHAN",
      severity: "S0",
      location: { region: null, node: "bethlehem_town", questId: null, sceneId: null },
      message: "node never visited this run",
    }),
  ];
  crawlFindingsPath = join(root, "findings.jsonl");
  writeFileSync(crawlFindingsPath, findings.map((f) => JSON.stringify(f)).join("\n") + "\n");
});

describe("collectInputs", () => {
  it("derives pure bundle siblings from a case-varied markdown suffix", () => {
    expect(pureFleetRunArtifactPaths("C:/evidence/PLAYTEST.MD").runSidecar).toBe(
      "C:/evidence/PLAYTEST.run.json",
    );
  });

  it("excludes a rejected report from the verified count and interview list", () => {
    const result = collectInputs(process.cwd(), [reportsDir]);
    expect(result.verified).toBe(2);
    expect(result.rejected).toBe(1);
    expect(result.interviews).toHaveLength(2);
  });

  it("parses every crawl finding row, including ORPHAN coverage rows", () => {
    const result = collectInputs(process.cwd(), [crawlFindingsPath]);
    expect(result.crawlFindings).toHaveLength(2);
    expect(result.crawlFindingRefs).toHaveLength(2);
  });

  it("requires the matching verified sidecar before accepting a V2 pure report", () => {
    const dir = mkdtempSync(join(tmpdir(), "feedback-pure-sidecar-"));
    const base = join(dir, "20260101T000004Z_overworld_seed4");
    const fixture = pureReportAndSidecar();
    writeFileSync(`${base}.md`, fixture.report);
    // Simulate SIGKILL after the runner published durable JSONL but before its
    // final adjacent-sidecar commit. Raw evidence alone must not make the
    // discoverable markdown accepted or downgrade it to legacy evidence.
    writeFileSync(`${base}.evidence.jsonl`, '{"type":"journey_exit"}\n');

    expect(collectInputs(process.cwd(), [dir])).toMatchObject({ verified: 0, rejected: 1 });

    writeFileSync(`${base}.run.json`, pureReportAndSidecar({ proofCharacter: "c" }).sidecar);
    expect(collectInputs(process.cwd(), [dir])).toMatchObject({ verified: 0, rejected: 1 });

    writeFileSync(`${base}.run.json`, fixture.sidecar);
    expect(collectInputs(process.cwd(), [dir])).toMatchObject({ verified: 1, rejected: 0 });

    const staleTime = new Date("2000-01-01T00:00:00.000Z");
    utimesSync(`${base}.run.json`, staleTime, staleTime);
    expect(collectInputs(process.cwd(), [dir])).toMatchObject({ verified: 0, rejected: 1 });
  });

  it("compiles a complete terminal pure interview only through its verified sidecar", () => {
    const dir = mkdtempSync(join(tmpdir(), "feedback-terminal-pure-"));
    const base = join(dir, "20260101T000007Z_overworld_seed7");
    const fixture = pureReportAndSidecar();
    const terminalReport = fixture.report.replace(/\r?\n```\r?\n$/u, "");
    writeFileSync(`${base}.md`, terminalReport);

    expect(collectInputs(process.cwd(), [dir])).toMatchObject({ verified: 0, rejected: 1 });

    writeFileSync(`${base}.run.json`, fixture.sidecar);
    expect(collectInputs(process.cwd(), [dir])).toMatchObject({ verified: 1, rejected: 0 });
  });

  it("re-audits retained Codex wrapper evidence before compiling feedback", () => {
    const dir = mkdtempSync(join(tmpdir(), "feedback-codex-reaudit-"));
    const base = join(dir, "20260101T000005Z_overworld_seed5");
    const fixture = pureReportAndSidecar();
    writeFileSync(`${base}.md`, fixture.report);
    writeCodexGameplayArtifacts(base, fixture.report, fixture.sidecar);
    expect(collectInputs(process.cwd(), [dir])).toMatchObject({ verified: 1, rejected: 0 });

    writeCodexGameplayArtifacts(base, fixture.report, fixture.sidecar, {
      forbiddenWrapper: true,
    });
    expect(collectInputs(process.cwd(), [dir])).toMatchObject({ verified: 0, rejected: 1 });

    writeCodexGameplayArtifacts(base, fixture.report, fixture.sidecar);
    const unknownProvider = JSON.parse(readFileSync(`${base}.json`, "utf8")) as Record<
      string,
      unknown
    >;
    unknownProvider.provider = "untrusted-provider";
    writeFileSync(`${base}.json`, JSON.stringify(unknownProvider));
    expect(collectInputs(process.cwd(), [`${base}.md`])).toMatchObject({
      verified: 0,
      rejected: 1,
    });

    writeCodexGameplayArtifacts(base, fixture.report, fixture.sidecar);
    const transplantedFixture = pureReportAndSidecar({ proofCharacter: "c" });
    const transplantedBase = join(dir, "20260101T000006Z_overworld_seed6");
    writeFileSync(`${transplantedBase}.md`, transplantedFixture.report);
    writeCodexGameplayArtifacts(
      transplantedBase,
      transplantedFixture.report,
      transplantedFixture.sidecar,
      {
        runSeed: 6,
        session: "219f7250-1ed0-7102-be6c-4f1d5513d91e",
        turn: "319f7250-1ed0-7102-be6c-4f1d5513d91e",
      },
    );
    for (const suffix of [".codex.jsonl", ".codex-rollout.jsonl", ".codex-capture.json"]) {
      writeFileSync(`${transplantedBase}${suffix}`, readFileSync(`${base}${suffix}`));
    }
    expect(collectInputs(process.cwd(), [`${transplantedBase}.md`])).toMatchObject({
      verified: 0,
      rejected: 1,
    });
  });

  it("keeps canonical cycle refs unique and immune to fleet-manifest basename collisions", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-cycle-refs-"));
    const writeCycle = (stamp: string, proofCharacter: string, providerSession: string) => {
      const dir = join(root, "ai-runs", stamp);
      mkdirSync(dir, { recursive: true });
      const base = join(dir, "playtest");
      const fixture = pureReportAndSidecar({ proofCharacter });
      writeFileSync(`${base}.md`, fixture.report);
      writeCodexGameplayArtifacts(base, fixture.report, fixture.sidecar, {
        session: providerSession,
      });
      return `${base}.md`;
    };
    const first = writeCycle(
      "2026-08-08T20-00-00-001Z",
      "d",
      "319f7250-1ed0-7102-be6c-4f1d5513d91e",
    );
    const second = writeCycle(
      "2026-08-08T20-00-00-002Z",
      "e",
      "419f7250-1ed0-7102-be6c-4f1d5513d91e",
    );
    const fleetDir = join(root, "ai-runs", "fleet", "basename-collision");
    mkdirSync(fleetDir, { recursive: true });
    writeFileSync(
      join(fleetDir, "manifest.jsonl"),
      `${JSON.stringify({ report: "playtest.md", persona: "speedrunner", target: "quest:wolf_winter" })}\n`,
    );

    const result = collectInputs(root, [first, second]);
    expect(result).toMatchObject({ verified: 2, rejected: 0 });
    expect(result.interviews).toEqual([
      expect.objectContaining({
        ref: "ai-runs/2026-08-08T20-00-00-001Z/playtest.md",
        persona: null,
        target: "overworld",
      }),
      expect.objectContaining({
        ref: "ai-runs/2026-08-08T20-00-00-002Z/playtest.md",
        persona: null,
        target: "overworld",
      }),
    ]);
  });

  it("admits a hash-bound pending cycle report only through the full authority gate", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-cycle-default-admission-"));
    mkdirSync(join(root, "blind-tester", "reports"), { recursive: true });
    const cycleDir = join(root, "ai-runs", "2026-08-08T20-00-00-010Z");
    mkdirSync(cycleDir, { recursive: true });
    const base = join(cycleDir, "playtest");
    const fixture = pureReportAndSidecar({ proofCharacter: "b" });
    writeFileSync(`${base}.md`, fixture.report);
    writeCodexGameplayArtifacts(base, fixture.report, fixture.sidecar, {
      session: "619f7250-1ed0-7102-be6c-4f1d5513d91e",
    });

    const runId = "2026-08-08T20-00-00-010Z";
    const accepted: FeedbackAcceptanceState = {
      schema_version: 1,
      accepted_compile: null,
      pending_cycle_reports: [
        {
          run_id: runId,
          tested_commit: "b".repeat(40),
          report_id: `pure:${"a".repeat(64)}`,
          report_sha256: sha256File(`${base}.md`),
          evidence_sha256: sha256File(`${base}.evidence.jsonl`),
          sidecar_sha256: sha256File(`${base}.run.json`),
        },
      ],
    };
    const inputs = resolveFeedbackInputs(root, [], accepted);
    expect(inputs).toEqual([
      "blind-tester/reports",
      "ai-runs/2026-08-08T20-00-00-010Z/playtest.md",
    ]);
    const result = collectInputs(root, inputs);
    expect(result).toMatchObject({ verified: 1, rejected: 0 });
    expect(result.interviews[0]).toMatchObject({
      ref: "ai-runs/2026-08-08T20-00-00-010Z/playtest.md",
      target: "overworld",
    });
  });

  it("deduplicates copied pure runs by parsed sidecar identity after full verification", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-cycle-dedupe-"));
    const fixture = pureReportAndSidecar({ proofCharacter: "f" });
    const ledgerDir = join(root, "blind-tester", "reports");
    const cycleDir = join(root, "ai-runs", "2026-08-08T20-00-00-003Z");
    mkdirSync(ledgerDir, { recursive: true });
    mkdirSync(cycleDir, { recursive: true });
    const ledgerBase = join(ledgerDir, "20260808T200000Z_overworld_seed7");
    const cycleBase = join(cycleDir, "playtest");
    writeFileSync(`${ledgerBase}.md`, fixture.report);
    writeCodexGameplayArtifacts(ledgerBase, fixture.report, fixture.sidecar);
    writeFileSync(`${cycleBase}.md`, fixture.report);
    writeCodexGameplayArtifacts(cycleBase, fixture.report, fixture.sidecar);

    // Formatting/key whitespace is not report identity; collectInputs hashes the
    // parsed sidecar after authority verification rather than its raw bytes.
    const parsedCycleSidecar = JSON.parse(readFileSync(`${cycleBase}.run.json`, "utf8"));
    writeFileSync(`${cycleBase}.run.json`, `${JSON.stringify(parsedCycleSidecar, null, 2)}\n`);

    const result = collectInputs(root, [ledgerDir, `${cycleBase}.md`, `${cycleBase}.md`]);
    expect(result).toMatchObject({ verified: 1, rejected: 0 });
    expect(result.interviews).toHaveLength(1);
    expect(result.interviews[0]!.ref).toBe("20260808T200000Z_overworld_seed7.md");
  });

  it("deduplicates renamed non-pure copies by canonical verified interview", () => {
    const dir = mkdtempSync(join(tmpdir(), "feedback-legacy-copy-dedupe-"));
    writeFileSync(join(dir, "20260808T200010Z_overworld_seed10.md"), REPORT_A);
    writeFileSync(
      join(dir, "20260808T200011Z_overworld_seed11.md"),
      REPORT_A.replaceAll("\n", "\r\n"),
    );
    writeFileSync(join(dir, "20260808T200012Z_overworld_seed12.md"), REPORT_A);

    const result = collectInputs(process.cwd(), [dir]);
    expect(result).toMatchObject({ verified: 1, rejected: 0 });
    expect(result.interviews).toHaveLength(1);
    expect(result.interviews[0]!.ref).toMatch(
      /^external\/[0-9a-f]{8}\/20260808T200010Z_overworld_seed10\.md$/u,
    );
  });

  it("does not let an invalid first copy suppress a later verified pure run", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-cycle-invalid-copy-"));
    const fixture = pureReportAndSidecar({ proofCharacter: "c" });
    const ledgerDir = join(root, "blind-tester", "reports");
    const cycleDir = join(root, "ai-runs", "2026-08-08T20-00-00-004Z");
    mkdirSync(ledgerDir, { recursive: true });
    mkdirSync(cycleDir, { recursive: true });
    writeFileSync(join(ledgerDir, "20260808T200001Z_overworld_seed7.md"), fixture.report);
    const cycleBase = join(cycleDir, "playtest");
    writeFileSync(`${cycleBase}.md`, fixture.report);
    writeCodexGameplayArtifacts(cycleBase, fixture.report, fixture.sidecar);

    const result = collectInputs(root, [ledgerDir, `${cycleBase}.md`]);
    expect(result).toMatchObject({ verified: 1, rejected: 1 });
    expect(result.interviews[0]!.ref).toBe("ai-runs/2026-08-08T20-00-00-004Z/playtest.md");
  });

  it("retains independent sessions even when their exit receipts are identical", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-cycle-distinct-sessions-"));
    const fixture = pureReportAndSidecar({ proofCharacter: "a" });
    const paths: string[] = [];
    for (const [index, sessionId] of ["o-h-one", "o-h-two"].entries()) {
      const dir = join(root, "ai-runs", `2026-08-08T20-00-00-00${index + 5}Z`);
      mkdirSync(dir, { recursive: true });
      const base = join(dir, "playtest");
      const sidecar = JSON.parse(fixture.sidecar) as Record<string, unknown>;
      sidecar.session_id = sessionId;
      writeFileSync(`${base}.md`, fixture.report);
      writeCodexGameplayArtifacts(base, fixture.report, JSON.stringify(sidecar), {
        session: `${index + 5}19f7250-1ed0-7102-be6c-4f1d5513d91e`,
      });
      paths.push(`${base}.md`);
    }

    const result = collectInputs(root, paths);
    expect(result).toMatchObject({ verified: 2, rejected: 0 });
    expect(new Set(result.interviews.map((interview) => interview.ref)).size).toBe(2);
  });

  it("requires pure evidence for a canonical cycle report slot", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-cycle-mode-"));
    const dir = join(root, "ai-runs", "2026-08-08T20-00-00-007Z");
    mkdirSync(dir, { recursive: true });
    const report = join(dir, "playtest.md");
    writeFileSync(report, REPORT_A);
    expect(collectInputs(root, [report])).toMatchObject({ verified: 0, rejected: 1 });

    writeFileSync(report, structuralReport());
    writeFileSync(
      join(dir, "playtest.run.json"),
      JSON.stringify({
        schema_version: 1,
        report_schema_version: 2,
        play_mode: "structural",
        start_surface: "fresh_overworld",
        retention_eligible: false,
        evidence_status: "not_applicable",
        structural_kind: "mock",
      }),
    );
    expect(collectInputs(root, [report])).toMatchObject({ verified: 0, rejected: 1 });
  });

  it.runIf(process.platform === "win32")(
    "keeps canonical pure-mode enforcement through Windows path-case aliases",
    () => {
      const root = mkdtempSync(join(tmpdir(), "feedback-cycle-case-alias-"));
      const dir = join(root, "ai-runs", "2026-08-08T20-00-00-012Z");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "playtest.md"), structuralReport());
      writeFileSync(
        join(dir, "playtest.run.json"),
        JSON.stringify({
          schema_version: 1,
          report_schema_version: 2,
          play_mode: "structural",
          start_surface: "fresh_overworld",
          retention_eligible: false,
          evidence_status: "not_applicable",
          structural_kind: "mock",
        }),
      );
      const aliased = join(root, "AI-RUNS", "2026-08-08T20-00-00-012Z", "PLAYTEST.MD");
      expect(collectInputs(root, [aliased])).toMatchObject({ verified: 0, rejected: 1 });

      const fixture = pureReportAndSidecar({ proofCharacter: "c" });
      const base = join(dir, "playtest");
      writeFileSync(`${base}.md`, fixture.report);
      writeCodexGameplayArtifacts(base, fixture.report, fixture.sidecar, {
        session: "719f7250-1ed0-7102-be6c-4f1d5513d91e",
      });
      expect(collectInputs(root, [aliased])).toMatchObject({ verified: 1, rejected: 0 });
    },
  );

  it.runIf(process.platform === "win32")(
    "preserves fleet-ledger metadata through Windows filename-case aliases",
    () => {
      const root = mkdtempSync(join(tmpdir(), "feedback-ledger-case-alias-"));
      const reports = join(root, "reports");
      const fleetDir = join(root, "ai-runs", "fleet", "case-alias");
      mkdirSync(reports, { recursive: true });
      mkdirSync(fleetDir, { recursive: true });
      const fileName = "20260808T200000Z_wolf_winter_seed7.md";
      const base = join(reports, fileName.slice(0, -".md".length));
      const fixture = pureReportAndSidecar({ proofCharacter: "d" });
      writeFileSync(`${base}.md`, fixture.report);
      writeCodexGameplayArtifacts(base, fixture.report, fixture.sidecar, {
        session: "819f7250-1ed0-7102-be6c-4f1d5513d91e",
      });
      writeFileSync(
        join(fleetDir, "manifest.jsonl"),
        `${JSON.stringify({ report: fileName, persona: "completionist", target: "quest:wolf_winter" })}\n`,
      );

      const aliased = join(reports, fileName.toLocaleUpperCase("en-US"));
      const result = collectInputs(root, [aliased]);
      expect(result).toMatchObject({ verified: 1, rejected: 0 });
      expect(result.interviews[0]).toMatchObject({
        ref: fileName,
        persona: "completionist",
        target: "quest:wolf_winter",
      });
    },
  );

  it("keeps a symlinked canonical cycle slot pure-only", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-cycle-linked-slot-"));
    const external = mkdtempSync(join(tmpdir(), "feedback-cycle-linked-source-"));
    mkdirSync(join(root, "ai-runs"), { recursive: true });
    writeFileSync(join(external, "playtest.md"), structuralReport());
    writeFileSync(
      join(external, "playtest.run.json"),
      JSON.stringify({
        schema_version: 1,
        report_schema_version: 2,
        play_mode: "structural",
        start_surface: "fresh_overworld",
        retention_eligible: false,
        evidence_status: "not_applicable",
        structural_kind: "mock",
      }),
    );
    const linked = join(root, "ai-runs", "2026-08-08T20-00-00-013Z");
    symlinkSync(external, linked, process.platform === "win32" ? "junction" : "dir");
    expect(collectInputs(root, [join(linked, "playtest.md")])).toMatchObject({
      verified: 0,
      rejected: 1,
    });
  });

  it("gives same-named explicit reports outside the root distinct opaque refs", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-external-root-"));
    const firstDir = mkdtempSync(join(tmpdir(), "feedback-external-a-"));
    const secondDir = mkdtempSync(join(tmpdir(), "feedback-external-b-"));
    const fileName = "20260808T200000Z_overworld_seed7.md";
    const first = join(firstDir, fileName);
    const second = join(secondDir, fileName);
    writeFileSync(first, REPORT_A);
    writeFileSync(second, REPORT_B);

    const result = collectInputs(root, [first, second]);
    expect(result).toMatchObject({ verified: 2, rejected: 0 });
    expect(result.interviews.map((interview) => interview.ref)).toEqual([
      expect.stringMatching(/^external\/[0-9a-f]{8}\/20260808T200000Z_overworld_seed7\.md$/u),
      expect.stringMatching(/^external\/[0-9a-f]{8}\/20260808T200000Z_overworld_seed7\.md$/u),
    ]);
    expect(new Set(result.interviews.map((interview) => interview.ref)).size).toBe(2);
  });
});

describe("compileFeedback", () => {
  it("bootstraps the cumulative corpus, then compiles each three-report actionable delta once", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-cohort-root-"));
    const reports = join(root, "reports");
    mkdirSync(reports, { recursive: true });
    writeFileSync(join(reports, "20260808T210000Z_overworld_seed1.md"), REPORT_A);

    const bootstrapOut = join(root, "bootstrap");
    const bootstrap = compileFeedback({
      root: process.cwd(),
      inputs: [reports],
      outDir: bootstrapOut,
      topK: 5,
      llmLabels: false,
      prevDir: null,
      cohortPolicy: { kind: "bootstrap" },
    });
    expect(bootstrap.file.inputs).toMatchObject({
      verified_reports: 0,
      actionable_reports: 0,
      excluded_mock_reports: 0,
    });
    expect(bootstrap.file.hotspots).toEqual([]);
    expect(bootstrap.file.metrics).toEqual([]);
    expect(bootstrap.file.sycophancy.reports).toBe(0);
    expect(bootstrap.evidence.report_modes).toEqual({
      pure: 0,
      structural: 0,
      legacy_guided: 1,
    });
    expect(bootstrap.manifest).toMatchObject({
      kind: "bootstrap",
      previous_manifest_sha256: null,
      cohort: {
        verified_report_ids: [],
        actionable_report_ids: [],
        excluded_mock_report_ids: [],
      },
    });
    expect(bootstrap.manifest.corpus.verified_report_ids).toHaveLength(1);
    expect(loadReportManifest(bootstrap.manifestPath, bootstrap.manifestSha256)?.manifest).toEqual(
      bootstrap.manifest,
    );

    writeFileSync(
      join(reports, "20260808T210001Z_overworld_seed2.md"),
      REPORT_A.replaceAll(
        "notice board confusing about quest start",
        "notice board hides the quest departure prompt",
      ),
    );
    writeFileSync(join(reports, "20260808T210002Z_overworld_seed3.md"), REPORT_B);
    const belowThresholdOut = join(root, "below-threshold");
    expect(() =>
      compileFeedback({
        root: process.cwd(),
        inputs: [reports],
        outDir: belowThresholdOut,
        topK: 5,
        llmLabels: false,
        prevDir: null,
        cohortPolicy: {
          kind: "delta",
          previousManifest: bootstrap.manifest,
          previousManifestSha256: bootstrap.manifestSha256,
          previousHotspots: bootstrap.file,
          previousEvidence: bootstrap.evidence,
        },
      }),
    ).toThrow(FeedbackCohortThresholdError);
    expect(existsSync(belowThresholdOut)).toBe(false);

    writeFileSync(
      join(reports, "20260808T210003Z_overworld_seed4.md"),
      REPORT_A.replaceAll(
        "notice board confusing about quest start",
        "notice board repeats the wrong destination label",
      ),
    );
    writeFileSync(join(reports, "20260808T210004Z_overworld_seed5.md"), structuralReport());
    const delta = compileFeedback({
      root: process.cwd(),
      inputs: [reports],
      outDir: join(root, "delta"),
      topK: 5,
      llmLabels: false,
      prevDir: null,
      cohortPolicy: {
        kind: "delta",
        previousManifest: bootstrap.manifest,
        previousManifestSha256: bootstrap.manifestSha256,
        previousHotspots: bootstrap.file,
        previousEvidence: bootstrap.evidence,
      },
    });
    expect(delta.file.inputs).toMatchObject({
      verified_reports: 4,
      actionable_reports: 3,
      excluded_mock_reports: 1,
    });
    expect(delta.file.sycophancy.reports).toBe(3);
    expect(delta.evidence.report_modes).toEqual({
      pure: 0,
      structural: 1,
      legacy_guided: 4,
    });
    expect(delta.manifest).toMatchObject({
      kind: "delta",
      previous_manifest_sha256: bootstrap.manifestSha256,
    });
    expect(delta.manifest.corpus.verified_report_ids).toHaveLength(5);
    expect(delta.manifest.cohort.verified_report_ids).toHaveLength(4);
    expect(delta.manifest.cohort.actionable_report_ids).toHaveLength(3);
    expect(delta.manifest.cohort.excluded_mock_report_ids).toHaveLength(1);

    const replayOut = join(root, "same-corpus-again");
    expect(() =>
      compileFeedback({
        root: process.cwd(),
        inputs: [reports],
        outDir: replayOut,
        topK: 5,
        llmLabels: false,
        prevDir: null,
        cohortPolicy: {
          kind: "delta",
          previousManifest: delta.manifest,
          previousManifestSha256: delta.manifestSha256,
          previousHotspots: delta.file,
          previousEvidence: delta.evidence,
        },
      }),
    ).toThrow(/0 new actionable reports/u);
    expect(existsSync(replayOut)).toBe(false);

    // Consumed cycle files need not stay in the next default input set. The
    // accepted evidence summary carries cumulative retention forward while
    // the next manifest admits only genuinely new identities.
    const nextReports = join(root, "next-reports");
    mkdirSync(nextReports);
    for (const [index, note] of [
      "station sign omits the platform number",
      "station sign reverses the route direction",
      "station sign repeats a completed objective",
    ].entries()) {
      writeFileSync(
        join(nextReports, `20260808T22000${index}Z_overworld_seed${index + 6}.md`),
        REPORT_A.replaceAll("notice board confusing about quest start", note),
      );
    }
    const secondDelta = compileFeedback({
      root: process.cwd(),
      inputs: [nextReports],
      outDir: join(root, "second-delta"),
      topK: 5,
      llmLabels: false,
      prevDir: null,
      cohortPolicy: {
        kind: "delta",
        previousManifest: delta.manifest,
        previousManifestSha256: delta.manifestSha256,
        previousHotspots: delta.file,
        previousEvidence: delta.evidence,
      },
    });
    expect(secondDelta.file.inputs).toMatchObject({
      verified_reports: 3,
      actionable_reports: 3,
      excluded_mock_reports: 0,
    });
    expect(secondDelta.evidence.report_modes).toEqual({
      pure: 0,
      structural: 1,
      legacy_guided: 7,
    });
    expect(secondDelta.manifest.corpus.seen_report_ids).toHaveLength(8);
    expect(secondDelta.manifest.corpus.verified_report_ids).toHaveLength(3);
    expect(secondDelta.manifest.cohort.actionable_report_ids).toHaveLength(3);
  });

  it("merges the crawler+fleet overlap into one cluster with the BOTH_SOURCES_BONUS applied", () => {
    const outDir = mkdtempSync(join(tmpdir(), "feedback-out-"));
    const { file, jsonPath, mdPath } = compileFeedback({
      root: process.cwd(),
      inputs: [reportsDir, crawlFindingsPath],
      outDir,
      topK: 5,
      llmLabels: false,
      prevDir: null,
    });

    expect(file.inputs.verified_reports).toBe(2);
    expect(file.inputs.rejected_reports).toBe(1);
    expect(file.inputs.crawl_findings).toBe(2); // includes the ORPHAN coverage row

    const top = file.hotspots[0]!;
    expect(top.sources.slice().sort()).toEqual(["crawler", "fleet"]);
    // count=2 (one fleet issue, one crawler issue) × severity weight S3(8) × BOTH_SOURCES_BONUS(2).
    expect(top.score).toBe(2 * 8 * 2);
    expect(file.recommended_next_fix).not.toBeNull();
    expect(file.recommended_next_fix!.hotspot_id).toBe(top.id);

    // Self-validates under the strict schema (compileFeedback already does
    // this before writing; re-parse the written bytes as an end-to-end check).
    const writtenJson = JSON.parse(readFileSync(jsonPath, "utf8"));
    expect(HotspotsFileSchema.safeParse(writtenJson).success).toBe(true);

    const md = readFileSync(mdPath, "utf8");
    expect(md).toContain("Recommended next fix");
  });

  it("keeps all persisted counts unique when the same verified pure run is copied", () => {
    const dir = mkdtempSync(join(tmpdir(), "feedback-compile-dedupe-input-"));
    const fixture = pureReportAndSidecar({ proofCharacter: "d" });
    for (const [stamp, seed] of [
      ["20260101T000030Z", 30],
      ["20260101T000031Z", 31],
    ] as const) {
      const base = join(dir, `${stamp}_overworld_seed${seed}`);
      writeFileSync(`${base}.md`, fixture.report);
      writeFileSync(`${base}.run.json`, fixture.sidecar);
    }
    const outDir = mkdtempSync(join(tmpdir(), "feedback-compile-dedupe-out-"));
    const { file, evidence } = compileFeedback({
      root: process.cwd(),
      inputs: [dir],
      outDir,
      topK: 5,
      llmLabels: false,
      prevDir: null,
    });

    expect(file.inputs).toMatchObject({
      verified_reports: 1,
      actionable_reports: 1,
      excluded_mock_reports: 0,
      rejected_reports: 0,
    });
    expect(file.metrics).toEqual([expect.objectContaining({ target: "overworld", reports: 1 })]);
    expect(file.sycophancy.reports).toBe(1);
    expect(evidence.report_modes).toEqual({ pure: 1, structural: 0, legacy_guided: 0 });
    expect(evidence.pure_retention.eligible_reports).toBe(1);
  });

  it("separates report modes and summarizes game choices from sidecar-gated pure exits", () => {
    const dir = mkdtempSync(join(tmpdir(), "feedback-retention-input-"));
    const continuedBase = join(dir, "20260101T000010Z_overworld_seed10");
    const endedBase = join(dir, "20260101T000011Z_overworld_seed11");
    const earlyGoalBase = join(dir, "20260101T000012Z_overworld_seed12");
    const rejectedBase = join(dir, "20260101T000013Z_overworld_seed13");
    const continued = pureReportAndSidecar({ proofCharacter: "a", continued: true });
    const ended = pureReportAndSidecar({ proofCharacter: "c" });
    const earlyGoal = pureReportAndSidecar({ proofCharacter: "e", earlyGoal: true });
    const rejected = pureReportAndSidecar({ proofCharacter: "f" });
    writeFileSync(`${continuedBase}.md`, continued.report);
    writeFileSync(`${continuedBase}.run.json`, continued.sidecar);
    writeFileSync(`${endedBase}.md`, ended.report);
    writeFileSync(`${endedBase}.run.json`, ended.sidecar);
    writeFileSync(`${earlyGoalBase}.md`, earlyGoal.report);
    writeFileSync(`${earlyGoalBase}.run.json`, earlyGoal.sidecar);
    writeFileSync(`${rejectedBase}.md`, rejected.report); // no sidecar: cannot become retention
    writeFileSync(join(dir, "20260101T000014Z_overworld_seed14.md"), structuralReport());
    writeFileSync(join(dir, "20260101T000015Z_overworld_seed15.md"), REPORT_B);

    const outDir = mkdtempSync(join(tmpdir(), "feedback-retention-out-"));
    const { file, evidence, retentionPath, mdPath } = compileFeedback({
      root: process.cwd(),
      inputs: [dir],
      outDir,
      topK: 5,
      llmLabels: false,
      prevDir: null,
    });

    expect(file.inputs).toMatchObject({ verified_reports: 5, rejected_reports: 1 });
    expect(evidence.report_modes).toEqual({ pure: 3, structural: 1, legacy_guided: 1 });
    expect(evidence.pure_retention).toMatchObject({
      eligible_reports: 3,
      contract_versions: [
        {
          contract_version: 1,
          eligible_reports: 3,
          continued_reports: 1,
          ended_at_first_choice_reports: 2,
          forced_character_death_reports: 0,
          accepted_decisions: { minimum: 12, maximum: 80, mean: 44 },
          choices: { continue: 1, end: 3 },
          choice_triggers: {
            checkpoint: { continue: 1, end: 2 },
            goal_completed: { continue: 0, end: 1 },
            checkpoint_and_goal_completed: { continue: 0, end: 0 },
          },
          checkpoints: [
            { decision: 40, continue: 1, end: 1 },
            { decision: 80, continue: 0, end: 1 },
          ],
          exit_reasons: [{ reason: "player_ended_at_choice", count: 3 }],
        },
      ],
    });

    const persisted = JSON.parse(readFileSync(retentionPath, "utf8"));
    expect(FeedbackEvidenceSummarySchema.parse(persisted)).toEqual(evidence);
    const markdown = readFileSync(mdPath, "utf8");
    expect(markdown).toContain(
      "Verified report modes (cumulative corpus): pure 3, structural 1, legacy-guided 1",
    );
    expect(markdown).toContain("### Journey contract v1");
    expect(markdown).toContain("Actual voluntary game choices: 1 continue, 3 end");
    expect(markdown).toContain(
      "Forced character-death terminals (excluded from voluntary retention): 0",
    );
    expect(markdown).toContain("`would_replay` is a post-exit attitude metric");
  });

  it("keeps historical v1 and current v2 retention curves separate", () => {
    const dir = mkdtempSync(join(tmpdir(), "feedback-contract-cohorts-input-"));
    const historicalBase = join(dir, "20260101T000020Z_overworld_seed20");
    const currentBase = join(dir, "20260101T000021Z_overworld_seed21");
    const historical = pureReportAndSidecar({
      proofCharacter: "1",
      continued: true,
      contractVersion: 1,
    });
    const current = pureReportAndSidecar({
      proofCharacter: "3",
      contractVersion: 2,
    });
    writeFileSync(`${historicalBase}.md`, historical.report);
    writeFileSync(`${historicalBase}.run.json`, historical.sidecar);
    writeFileSync(`${currentBase}.md`, current.report);
    writeFileSync(`${currentBase}.run.json`, current.sidecar);

    const outDir = mkdtempSync(join(tmpdir(), "feedback-contract-cohorts-out-"));
    const { evidence, retentionPath, mdPath } = compileFeedback({
      root: process.cwd(),
      inputs: [dir],
      outDir,
      topK: 5,
      llmLabels: false,
      prevDir: null,
    });

    expect(evidence.pure_retention).toEqual({
      eligible_reports: 2,
      contract_versions: [
        {
          contract_version: 1,
          eligible_reports: 1,
          continued_reports: 1,
          ended_at_first_choice_reports: 0,
          forced_character_death_reports: 0,
          accepted_decisions: { minimum: 80, maximum: 80, mean: 80 },
          choices: { continue: 1, end: 1 },
          choice_triggers: {
            checkpoint: { continue: 1, end: 1 },
            goal_completed: { continue: 0, end: 0 },
            checkpoint_and_goal_completed: { continue: 0, end: 0 },
          },
          checkpoints: [
            { decision: 40, continue: 1, end: 0 },
            { decision: 80, continue: 0, end: 1 },
          ],
          exit_reasons: [{ reason: "player_ended_at_choice", count: 1 }],
        },
        {
          contract_version: 2,
          eligible_reports: 1,
          continued_reports: 0,
          ended_at_first_choice_reports: 1,
          forced_character_death_reports: 0,
          accepted_decisions: { minimum: 40, maximum: 40, mean: 40 },
          choices: { continue: 0, end: 1 },
          choice_triggers: {
            checkpoint: { continue: 0, end: 1 },
            goal_completed: { continue: 0, end: 0 },
            checkpoint_and_goal_completed: { continue: 0, end: 0 },
          },
          checkpoints: [{ decision: 40, continue: 0, end: 1 }],
          exit_reasons: [{ reason: "player_ended_at_choice", count: 1 }],
        },
      ],
    });
    expect(evidence.pure_retention).not.toHaveProperty("accepted_decisions");
    expect(evidence.pure_retention).not.toHaveProperty("checkpoints");

    const persisted = JSON.parse(readFileSync(retentionPath, "utf8"));
    expect(FeedbackEvidenceSummarySchema.parse(persisted)).toEqual(evidence);
    const markdown = readFileSync(mdPath, "utf8");
    expect(markdown).toContain("### Journey contract v1");
    expect(markdown).toContain("### Journey contract v2");
    expect(markdown).toContain("incompatible contracts are never pooled");
  });

  it("separates forced death from voluntary attrition while preserving earlier choices", () => {
    const deathInterview = (continued: boolean) => {
      const checkpointProofHash = "c".repeat(64);
      const deathProofHash = "d".repeat(64);
      const acceptedDecisions = continued ? 53 : 23;
      const payload = {
        contractVersion: 3,
        exitReason: "player_ended_at_choice",
        goalVersion: 1,
        goalId: "albany_local_lead",
        goalText: "Find one local lead in Albany and see it through.",
        goalStatus: "active",
        goalCompletedAtDecision: null,
        completedGoals: [],
        acceptedDecisions,
        exitReasons: ["character_died"],
        checkpoint: null,
        decisionProofHash: deathProofHash,
        retentionHistory: [
          ...(continued
            ? [
                {
                  sequence: 1,
                  atDecision: 40,
                  reasons: ["checkpoint"],
                  checkpoint: 40,
                  goalVersion: null,
                  goalId: null,
                  choice: "continue",
                  decisionProofHash: checkpointProofHash,
                },
              ]
            : []),
          {
            sequence: continued ? 2 : 1,
            atDecision: acceptedDecisions,
            reasons: ["character_died"],
            checkpoint: null,
            goalVersion: null,
            goalId: null,
            choice: "end",
            decisionProofHash: deathProofHash,
          },
        ],
      } as const;
      return PureExitInterviewV2Schema.parse({
        schema_version: 2,
        play_mode: "pure",
        start_surface: "fresh_overworld",
        retention_eligible: true,
        journey_exit_receipt: { ...payload, receiptHash: hashState(payload) },
        clarity: 4,
        enjoyment: 3,
        goal_understood: true,
        got_stuck: false,
        confusions: [],
        bugs: [],
        best_moment: "The fatal consequence remained legible and final.",
        worst_moment: "The character died before the lead was resolved.",
        would_replay: true,
        verdict: "The run ended honestly and I would replay to try another approach.",
      });
    };

    const evidence = summarizeFeedbackEvidence([
      { ref: "death-before-choice.md", interview: deathInterview(false) },
      { ref: "continued-then-death.md", interview: deathInterview(true) },
    ]);
    expect(evidence.pure_retention.contract_versions[0]).toMatchObject({
      contract_version: 3,
      eligible_reports: 2,
      continued_reports: 1,
      ended_at_first_choice_reports: 0,
      forced_character_death_reports: 2,
      choices: { continue: 1, end: 0 },
      choice_triggers: {
        checkpoint: { continue: 1, end: 0 },
        goal_completed: { continue: 0, end: 0 },
        checkpoint_and_goal_completed: { continue: 0, end: 0 },
      },
      checkpoints: [{ decision: 40, continue: 1, end: 0 }],
    });
  });
});
