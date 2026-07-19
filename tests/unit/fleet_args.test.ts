import { describe, expect, it } from "vitest";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashState } from "../../src/core/hash.js";
import {
  INITIAL_JOURNEY_GOAL,
  JOURNEY_BASELINE_DECISIONS,
  JOURNEY_CONTRACT_VERSION,
} from "../../src/world/journey_contract.js";
// vitest can import .mjs fine:
// @ts-expect-error — plain .mjs module without type declarations
import { fillPrompt } from "../../blind-tester/fill-prompt.mjs";
import {
  acquireFleetReportLock,
  archiveFailedFleetAttemptArtifacts,
  classifyFleetAttempt,
  fleetAttestationPathFor,
  fleetReportLockSpec,
  isTrustedFleetArtifactFile,
  parseFleetArgs,
  planFleetRuns,
  pureFleetReportWasRecovered,
  pureFleetArtifactHashes,
  PURE_BASELINE_DECISIONS,
  PURE_FLEET_ATTESTATION_SCHEMA_VERSION,
  PURE_FLEET_EVIDENCE_SCHEMA_VERSION,
  PURE_SESSION_CONTRACT_VERSION,
  releaseFleetReportLock,
  renderClosedFleetManifest,
  reportPathFor,
  resumeCandidatesFor,
  runSidecarPathFor,
  summarizeFleetAttemptHistory,
  validateFleetLabel,
  verifyReportForResume,
  writeFreshPureFleetAttestation,
  // @ts-expect-error — plain .mjs module without type declarations
} from "../../blind-tester/fleet.mjs";

it("keeps the fleet resume contract pinned to the engine journey contract", () => {
  expect(PURE_SESSION_CONTRACT_VERSION).toBe(JOURNEY_CONTRACT_VERSION);
  expect(PURE_BASELINE_DECISIONS).toBe(JOURNEY_BASELINE_DECISIONS);
});

describe("fill-prompt", () => {
  const template = "Intro.\n{{PERSONA}}\nRules __SEED__.\nGo: {{START_INSTRUCTION}}\n";
  it("substitutes all three placeholders", () => {
    const out = fillPrompt(template, {
      startInstruction: "start overworld",
      seed: 42,
      persona: "You are the BREAKER.",
    });
    expect(out).toContain("You are the BREAKER.");
    expect(out).toContain("Rules 42.");
    expect(out).toContain("Go: start overworld");
    expect(out).not.toMatch(/\{\{|__SEED__/);
  });
  it("empty persona leaves zero residue — byte-compatible with the pre-persona prompt", () => {
    const out = fillPrompt(template, { startInstruction: "x", seed: 1, persona: "" });
    expect(out).toBe("Intro.\nRules 1.\nGo: x\n");
  });
  it("real prompts contain exactly one persona slot each", () => {
    for (const p of ["blind-tester/prompt.md", "blind-tester/prompt-overworld.md"])
      expect(readFileSync(p, "utf8").match(/\{\{PERSONA\}\}/g)).toHaveLength(1);
  });
});

describe("fleet planning", () => {
  it("defaults milestone fleets to exactly 100 homogeneous-Spark fresh-overworld runs", () => {
    const opts = parseFleetArgs([]);
    expect(opts.count).toBe(100);
    expect(opts.target).toBe("overworld");
    expect(opts.personas).toBe("default");
    expect(opts.provider).toBe("codex");
    expect(opts.model).toBe("gpt-5.3-codex-spark");
    expect(opts.resume).toBe(true);
    const runs = planFleetRuns(opts);
    expect(runs).toHaveLength(100);
    expect(
      runs.every(
        (run: { provider: string; model: string }) =>
          run.provider === "codex" && run.model === "gpt-5.3-codex-spark",
      ),
    ).toBe(true);
  });

  it("makes authoritative no-resume behavior explicit without changing diagnostic defaults", () => {
    expect(parseFleetArgs([]).resume).toBe(true);
    expect(parseFleetArgs(["--no-resume"]).resume).toBe(false);
  });

  it("rotates personas only for explicit structural mocks and honors seed base", () => {
    const runs = planFleetRuns(
      parseFleetArgs(["--mock", "--count", "7", "--personas", "mixed", "--seed-base", "100"]),
    );
    expect(runs.map((r: { seed: number }) => r.seed)).toEqual([100, 101, 102, 103, 104, 105, 106]);
    expect(runs[0].persona).toBe("explorer");
    expect(runs[5].persona).toBe("explorer"); // 5 % 5 wraps
    expect(new Set(runs.map((r: { persona: string }) => r.persona)).size).toBe(5);
  });

  it("rejects persona-directed live fleets", () => {
    expect(() => parseFleetArgs(["--personas", "mixed"])).toThrow(/pure live runs/i);
    expect(() => parseFleetArgs(["--personas", "breaker"])).toThrow(/structural mode/i);
    expect(parseFleetArgs(["--mock", "--personas", "breaker"]).personas).toBe("breaker");
  });
  it("pins live model plans to supported aliases", () => {
    for (const model of ["haiku", "sonnet", "opus"] as const) {
      const opts = parseFleetArgs(["--provider", "claude", "--count", "3", "--model", model]);
      expect(opts.model).toBe(model);
      expect(planFleetRuns(opts).map((run: { model: string }) => run.model)).toEqual([
        model,
        model,
        model,
      ]);
    }
    const mixed = parseFleetArgs(["--provider", "claude", "--count", "10", "--model", "mix"]);
    expect(mixed.model).toBe("mix");
    expect(planFleetRuns(mixed).map((run: { model: string }) => run.model)).toEqual([
      "haiku",
      "haiku",
      "haiku",
      "haiku",
      "haiku",
      "haiku",
      "haiku",
      "haiku",
      "haiku",
      "sonnet",
    ]);
    expect(() => parseFleetArgs(["--provider", "claude", "--model", "claude-custom"])).toThrow(
      /haiku, sonnet, opus/i,
    );
    expect(parseFleetArgs(["--mock", "--model", "synthetic"]).model).toBe("synthetic");
  });
  it("pins Codex fleets to exact provider/model pairs without mix, aliases, or fallback", () => {
    for (const model of [
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.3-codex-spark",
    ] as const) {
      const opts = parseFleetArgs(["--provider", "codex", "--model", model, "--count", "2"]);
      expect(planFleetRuns(opts)).toEqual([
        { seed: 1000, persona: "default", provider: "codex", model, target: "overworld" },
        { seed: 1001, persona: "default", provider: "codex", model, target: "overworld" },
      ]);
    }
    expect(parseFleetArgs([]).model).toBe("gpt-5.3-codex-spark");
    expect(parseFleetArgs(["--provider", "claude"]).model).toBe("sonnet");
    expect(() => parseFleetArgs(["--provider", "codex", "--model", "sol"])).toThrow(/aliases/i);
    expect(() => parseFleetArgs(["--provider", "codex", "--model", "mix"])).toThrow(/mix/i);
    expect(() => parseFleetArgs(["--provider", "claude", "--model", "gpt-5.6-sol"])).toThrow(
      /Claude pure fleets/i,
    );
  });
  it("explicit mock quest targets parse and reach the structural plan", () => {
    const runs = planFleetRuns(
      parseFleetArgs(["--mock", "--count", "2", "--target", "quest:sunken_barrow"]),
    );
    expect(runs.every((r: { target: string }) => r.target === "quest:sunken_barrow")).toBe(true);
    expect(runs.every((r: { provider: string }) => r.provider === "codex")).toBe(true);
    const claudeMock = planFleetRuns(
      parseFleetArgs(["--mock", "--provider", "claude", "--count", "1", "--model", "synthetic"]),
    );
    expect(claudeMock[0]?.provider).toBe("claude");
  });

  it("rejects quest targets for live fleets regardless of flag order", () => {
    expect(() => parseFleetArgs(["--target", "quest:sunken_barrow"])).toThrow(
      /live blind LLM runs must target overworld/i,
    );
    expect(() => parseFleetArgs(["--target", "quest:sunken_barrow", "--count", "2"])).toThrow(
      /quest targets require explicit --mock/i,
    );
    expect(parseFleetArgs(["--target", "quest:sunken_barrow", "--mock"]).target).toBe(
      "quest:sunken_barrow",
    );

    const bypassedParser = parseFleetArgs([]);
    bypassedParser.target = "quest:sunken_barrow";
    expect(() => planFleetRuns(bypassedParser)).toThrow(
      /live blind LLM runs must target overworld/i,
    );
  });

  it("rejects malformed targets even for structural mock fleets", () => {
    expect(() => parseFleetArgs(["--mock", "--target", "sunken_barrow"])).toThrow(
      /overworld or quest:<id>/i,
    );
    expect(() => parseFleetArgs(["--mock", "--target", "quest:"])).toThrow(
      /overworld or quest:<id>/i,
    );
    expect(() => parseFleetArgs(["--mock", "--target", "quest:two words"])).toThrow(
      /overworld or quest:<id>/i,
    );
    for (const target of [
      "quest:../wolf_winter",
      "quest:wolf/winter",
      "quest:wolf\\winter",
      "quest:Wolf_Winter",
      "quest:wolf-winter",
      "quest:_wolf_winter",
      "quest:wolf__winter",
      "quest:wolf\nwinter",
    ]) {
      expect(() => parseFleetArgs(["--mock", "--target", target]), target).toThrow(
        /lowercase shipped quest id/i,
      );
    }
  });

  it("report filenames match the ledger regex", () => {
    const p = reportPathFor("blind-tester/reports", "20260709T010203Z", "overworld", 12);
    expect(p.replace(/\\/g, "/").split("/").pop()).toMatch(/^\d{8}T\d{6}Z_.+_seed-?\d+\.md$/);
  });
});

it("rejects symlinked or out-of-directory resume candidates", async () => {
  const reportsDir = mkdtempSync(join(tmpdir(), "af-fleet-symlink-"));
  const outsideDir = mkdtempSync(join(tmpdir(), "af-fleet-outside-"));
  try {
    const target = join(reportsDir, "real-report.md");
    const alias = join(reportsDir, "20270101T000000Z_overworld_seed5.md");
    writeFileSync(target, "not parsed because trust checks run first\n");
    writeFileSync(runSidecarPathFor(alias), "{}\n");
    const outside = join(outsideDir, "outside.md");
    writeFileSync(outside, "ordinary but outside the reports root\n");
    expect(isTrustedFleetArtifactFile(outside, reportsDir)).toBe(false);
    try {
      symlinkSync(target, alias, "file");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES" || code === "ENOSYS") {
        return;
      }
      throw error;
    }
    expect(isTrustedFleetArtifactFile(alias, reportsDir)).toBe(false);
    const rejected = await verifyReportForResume(alias, "structural", null, reportsDir);
    expect(rejected.ok).toBe(false);
    expect(rejected.stderr).toMatch(/regular non-symlink/i);
  } finally {
    rmSync(reportsDir, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
  }
});

it("rejects hardlinked resume artifacts that certification cannot accept", async () => {
  const reportsDir = mkdtempSync(join(tmpdir(), "af-fleet-hardlink-"));
  try {
    const target = join(reportsDir, "real-report.md");
    const alias = join(reportsDir, "20270101T000000Z_overworld_seed5.md");
    writeFileSync(target, "not parsed because trust checks run first\n");
    try {
      linkSync(target, alias);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES" || code === "ENOSYS") return;
      throw error;
    }
    writeFileSync(runSidecarPathFor(alias), "{}\n");
    expect(isTrustedFleetArtifactFile(alias, reportsDir)).toBe(false);
    const rejected = await verifyReportForResume(alias, "structural", null, reportsDir);
    expect(rejected.ok).toBe(false);
    expect(rejected.stderr).toMatch(/regular non-symlink/i);
  } finally {
    rmSync(reportsDir, { recursive: true, force: true });
  }
});

it("verifies a report beneath Windows shell-metacharacter paths without invoking a shell", async () => {
  const base = mkdtempSync(join(tmpdir(), "af-fleet-metachar-"));
  const reportsDir = join(base, "reports & %PATH% (literal)");
  mkdirSync(reportsDir);
  const reportPath = join(reportsDir, "structural report.md");
  try {
    writeFileSync(
      reportPath,
      `## Playthrough log

The structural opening completed.

## Verdict

The deterministic smoke route remained understandable.

\`\`\`json exit-interview
${JSON.stringify({
  schema_version: 2,
  play_mode: "structural",
  start_surface: "fresh_overworld",
  retention_eligible: false,
  structural_kind: "mock",
  clarity: 4,
  enjoyment: 4,
  goal_understood: true,
  got_stuck: false,
  confusions: [],
  bugs: [],
  best_moment: "The route exposed the opening state clearly.",
  worst_moment: "The smoke run was intentionally brief.",
  would_replay: true,
  verdict: "The deterministic route is suitable for structural verification only.",
})}
\`\`\`
`,
    );
    writeFileSync(
      runSidecarPathFor(reportPath),
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
    const verified = await verifyReportForResume(reportPath, "structural", null, reportsDir);
    expect(verified.ok).toBe(true);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

describe("resumeCandidatesFor", () => {
  it("anchors the seed so seed1 never matches seed10", () => {
    const entries = [
      "20260709T010203Z_overworld_seed10.md",
      "20260709T010203Z_overworld_seed1.md",
      "20260709T010203Z_overworld_seed1.md",
    ];
    expect(resumeCandidatesFor(entries, "overworld", 1)).toEqual([
      "20260709T010203Z_overworld_seed1.md",
    ]);
    expect(resumeCandidatesFor(entries, "overworld", 10)).toEqual([
      "20260709T010203Z_overworld_seed10.md",
    ]);
  });
  it("returns matches newest-stamp-first", () => {
    const entries = [
      "20260101T000000Z_overworld_seed5.md",
      "20260301T000000Z_overworld_seed5.md",
      "20260201T000000Z_overworld_seed5.md",
    ];
    expect(resumeCandidatesFor(entries, "overworld", 5)).toEqual([
      "20260301T000000Z_overworld_seed5.md",
      "20260201T000000Z_overworld_seed5.md",
      "20260101T000000Z_overworld_seed5.md",
    ]);
  });
  it("ignores non-matching slugs and unrelated files", () => {
    const entries = [
      "20260101T000000Z_sunken_barrow_seed5.md",
      "notes.txt",
      "20260101T000000Z_overworld_seed5.json",
    ];
    expect(resumeCandidatesFor(entries, "overworld", 5)).toEqual([]);
  });

  it("does not let a verifier-valid legacy report resume a pure fleet slot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "af-pure-resume-"));
    try {
      const reportPath = join(dir, "20260101T000000Z_overworld_seed5.md");
      writeFileSync(
        reportPath,
        `
1. Playthrough log: played a guided opening.
2. Did it work mechanically? Yes.
3. Understandable & fun? clarity 4/5 and enjoyment 4/5.
4. Confusion / friction points: none.
5. Bugs or design flaws: none.
6. Verdict: A real player could understand this legacy opening.
\`\`\`json exit-interview
${JSON.stringify({
  schema_version: 2,
  play_mode: "structural",
  start_surface: "fresh_overworld",
  retention_eligible: false,
  structural_kind: "mock",
  clarity: 4,
  enjoyment: 4,
  goal_understood: true,
  got_stuck: false,
  confusions: [],
  bugs: [],
  best_moment: "A visible choice landed clearly.",
  worst_moment: "One transition was slow.",
  would_replay: true,
  verdict: "A real player could understand this legacy opening and keep playing.",
})}
\`\`\`
`,
      );
      expect(runSidecarPathFor(reportPath)).toBe(reportPath.replace(/\.md$/, ".run.json"));
      expect((await verifyReportForResume(reportPath, "pure")).ok).toBe(false);
      writeFileSync(
        runSidecarPathFor(reportPath),
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
      expect((await verifyReportForResume(reportPath, "pure")).ok).toBe(false);
      expect((await verifyReportForResume(reportPath, "structural")).ok).toBe(true);

      const decisionProofHash = "a".repeat(64);
      const receiptPayload = {
        contractVersion: 1,
        exitReason: "player_ended_at_choice",
        goalVersion: 1,
        goalId: "albany_local_lead",
        goalStatus: "active",
        acceptedDecisions: 40,
        exitReasons: ["checkpoint"],
        checkpoint: 40,
        decisionProofHash,
        retentionHistory: [
          {
            sequence: 1,
            atDecision: 40,
            reasons: ["checkpoint"],
            checkpoint: 40,
            choice: "end",
            decisionProofHash,
          },
        ],
      };
      const receipt = { ...receiptPayload, receiptHash: hashState(receiptPayload) };
      const pureInterview = {
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
        best_moment: "A visible choice landed clearly.",
        worst_moment: "One transition was slow.",
        would_replay: true,
        verdict: "A real player could understand this pure opening and keep playing.",
      };
      writeFileSync(
        reportPath,
        `
1. Playthrough log: played naturally until the game offered an exit.
2. Did it work mechanically? Yes.
3. Understandable & fun? clarity 4/5 and enjoyment 4/5.
4. Confusion / friction points: none.
5. Bugs or design flaws: none.
6. Verdict: A real player could understand this pure opening.
\`\`\`json exit-interview
${JSON.stringify(pureInterview)}
\`\`\`
`,
      );
      writeFileSync(
        runSidecarPathFor(reportPath),
        JSON.stringify({
          schema_version: 1,
          report_schema_version: 2,
          play_mode: "pure",
          start_surface: "fresh_overworld",
          retention_eligible: true,
          evidence_status: "verified",
          session_id: "ow-resume",
          receipt,
        }),
      );
      const pureResume = await verifyReportForResume(reportPath, "pure");
      expect(pureResume.ok).toBe(false);
      expect(pureResume.run).toMatchObject({ play_mode: "pure", retention_eligible: true });

      const currentPayload = {
        ...receiptPayload,
        contractVersion: PURE_SESSION_CONTRACT_VERSION,
        goalText: INITIAL_JOURNEY_GOAL.text,
        goalCompletedAtDecision: null,
        completedGoals: [],
        retentionHistory: receiptPayload.retentionHistory.map((event) => ({
          ...event,
          goalVersion: null,
          goalId: null,
        })),
      };
      const currentReceipt = {
        ...currentPayload,
        receiptHash: hashState(currentPayload),
      };
      const expectedBuild = {
        git_commit: "b".repeat(40),
        tracked_worktree_clean: true,
        world_id: "new_york_overworld",
        world_hash: "c".repeat(64),
      };
      const expectedPure = { seed: 5, model: "haiku", build: expectedBuild };
      writeFileSync(
        reportPath,
        `
1. Playthrough log: played naturally until the game offered an exit.
2. Did it work mechanically? Yes.
3. Understandable & fun? clarity 4/5 and enjoyment 4/5.
4. Confusion / friction points: none.
5. Bugs or design flaws: none.
6. Verdict: A real player could understand this pure opening.
\`\`\`json exit-interview
${JSON.stringify({ ...pureInterview, journey_exit_receipt: currentReceipt })}
\`\`\`
`,
      );
      writeFileSync(
        runSidecarPathFor(reportPath),
        JSON.stringify({
          schema_version: 1,
          report_schema_version: 2,
          play_mode: "pure",
          start_surface: "fresh_overworld",
          retention_eligible: true,
          evidence_status: "verified",
          session_id: "ow-resume",
          receipt: currentReceipt,
        }),
      );
      const currentContractV1 = await verifyReportForResume(reportPath, "pure", expectedPure);
      expect(currentContractV1.ok).toBe(false);
      expect(currentContractV1.stderr).toMatch(/evidence schema v2/i);

      const validV2Sidecar = {
        schema_version: PURE_FLEET_EVIDENCE_SCHEMA_VERSION,
        report_schema_version: 2,
        play_mode: "pure",
        start_surface: "fresh_overworld",
        retention_eligible: true,
        evidence_status: "verified",
        session_id: "ow-resume",
        run_seed: 5,
        build: expectedBuild,
        quest_outcomes: [],
        receipt: currentReceipt,
      };
      writeFileSync(runSidecarPathFor(reportPath), JSON.stringify(validV2Sidecar));
      expect((await verifyReportForResume(reportPath, "pure", expectedPure)).ok).toBe(false);
      expect((await verifyReportForResume(reportPath, "pure")).ok).toBe(false);

      const claudeSessionId = "10852ae5-43b1-424a-aa39-7ba347361cec";
      const actualModel = "claude-haiku-4-5-20251001";
      const evidenceBody = `${[
        {
          schema_version: 2,
          play_mode: "pure",
          event: "fresh_start",
          start_surface: "fresh_overworld",
          session_id: validV2Sidecar.session_id,
          run_seed: 5,
          build: expectedBuild,
        },
        {
          schema_version: 2,
          play_mode: "pure",
          event: "journey_exit",
          start_surface: "fresh_overworld",
          session_id: validV2Sidecar.session_id,
          run_seed: 5,
          build: expectedBuild,
          quest_outcomes: [],
          receipt: currentReceipt,
        },
      ]
        .map((event) => JSON.stringify(event))
        .join("\n")}\n`;
      const primaryEnvelopeBody = JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        session_id: claudeSessionId,
        result: readFileSync(reportPath, "utf8"),
        stop_reason: "end_turn",
        terminal_reason: "completed",
        permission_denials: [],
        modelUsage: { [actualModel]: {} },
      });
      writeFileSync(reportPath.replace(/\.md$/, ".evidence.jsonl"), evidenceBody);
      writeFileSync(reportPath.replace(/\.md$/, ".json"), primaryEnvelopeBody);

      const {
        provider_events_sha256: _providerEventsSha256,
        provider_rollout_sha256: _providerRolloutSha256,
        provider_capture_sha256: _providerCaptureSha256,
        ...historicalClaudeArtifactHashes
      } = pureFleetArtifactHashes(reportPath);
      const validAttestation = {
        schema_version: PURE_FLEET_ATTESTATION_SCHEMA_VERSION,
        run_seed: 5,
        model: "haiku",
        persona: "default",
        target: "overworld",
        play_mode: "pure",
        start_surface: "fresh_overworld",
        build: expectedBuild,
        game_session_id: "ow-resume",
        claude_session_id: claudeSessionId,
        actual_model: actualModel,
        report_recovered: false,
        receipt_hash: currentReceipt.receiptHash,
        ...historicalClaudeArtifactHashes,
      };
      expect(fleetAttestationPathFor(reportPath)).toBe(reportPath.replace(/\.md$/, ".fleet.json"));
      writeFileSync(
        fleetAttestationPathFor(reportPath),
        JSON.stringify({ ...validAttestation, model: "sonnet" }),
      );
      expect((await verifyReportForResume(reportPath, "pure", expectedPure)).ok).toBe(false);
      writeFileSync(fleetAttestationPathFor(reportPath), JSON.stringify(validAttestation));
      const exactResume = await verifyReportForResume(reportPath, "pure", expectedPure);
      expect(exactResume.ok).toBe(true);
      expect(exactResume.attestation).toEqual(validAttestation);

      const reportBytes = readFileSync(reportPath);
      const sidecarBytes = readFileSync(runSidecarPathFor(reportPath));
      const qualitativelyTamperedReport = reportBytes
        .toString("utf8")
        .replace("clarity 4/5", "clarity 5/5")
        .replace('"clarity":4', '"clarity":5');
      writeFileSync(reportPath, qualitativelyTamperedReport);
      const markdownTamper = await verifyReportForResume(reportPath, "pure", expectedPure);
      expect(markdownTamper.ok).toBe(false);
      expect(markdownTamper.stderr).toMatch(/primary Claude result bytes/i);
      writeFileSync(reportPath, reportBytes);

      writeFileSync(
        runSidecarPathFor(reportPath),
        JSON.stringify({
          ...validV2Sidecar,
          quest_outcomes: [["wolf_winter", "ending_pack_diverted"]],
        }),
      );
      const sidecarTamper = await verifyReportForResume(reportPath, "pure", expectedPure);
      expect(sidecarTamper.ok).toBe(false);
      expect(sidecarTamper.stderr).toMatch(/raw run evidence/i);
      writeFileSync(runSidecarPathFor(reportPath), sidecarBytes);

      const freshReportPath = join(dir, "fresh.md");
      writeFileSync(freshReportPath, reportBytes);
      writeFileSync(runSidecarPathFor(freshReportPath), sidecarBytes);
      writeFileSync(freshReportPath.replace(/\.md$/, ".evidence.jsonl"), evidenceBody);
      writeFileSync(freshReportPath.replace(/\.md$/, ".json"), primaryEnvelopeBody);
      await expect(
        writeFreshPureFleetAttestation(freshReportPath, validV2Sidecar, expectedPure),
      ).resolves.toEqual(validAttestation);
      await expect(
        writeFreshPureFleetAttestation(freshReportPath, validV2Sidecar, expectedPure),
      ).rejects.toThrow();

      const attestationMismatches = [
        { ...validAttestation, game_session_id: "another-session" },
        { ...validAttestation, receipt_hash: "f".repeat(64) },
        {
          ...validAttestation,
          build: { ...expectedBuild, world_hash: "f".repeat(64) },
        },
      ];
      for (const attestation of attestationMismatches) {
        writeFileSync(fleetAttestationPathFor(reportPath), JSON.stringify(attestation));
        expect((await verifyReportForResume(reportPath, "pure", expectedPure)).ok).toBe(false);
      }
      writeFileSync(fleetAttestationPathFor(reportPath), JSON.stringify(validAttestation));

      const mismatches = [
        ["seed", { ...validV2Sidecar, run_seed: 6 }],
        [
          "commit",
          {
            ...validV2Sidecar,
            build: { ...expectedBuild, git_commit: "d".repeat(40) },
          },
        ],
        [
          "cleanliness",
          {
            ...validV2Sidecar,
            build: { ...expectedBuild, tracked_worktree_clean: false },
          },
        ],
        [
          "world id",
          {
            ...validV2Sidecar,
            build: { ...expectedBuild, world_id: "another_world" },
          },
        ],
        [
          "world hash",
          {
            ...validV2Sidecar,
            build: { ...expectedBuild, world_hash: "e".repeat(64) },
          },
        ],
      ];
      for (const [name, sidecar] of mismatches) {
        writeFileSync(runSidecarPathFor(reportPath), JSON.stringify(sidecar));
        expect(
          (await verifyReportForResume(reportPath, "pure", expectedPure)).ok,
          `${name} mismatch must fail closed`,
        ).toBe(false);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("fleet attempt evidence", () => {
  it("classifies timeout, launcher, verifier, and verified attempts from durable stages", () => {
    expect(
      classifyFleetAttempt({ runnerExit: 124, verifierAttempted: false, verified: false }),
    ).toBe("technical_timeout");
    expect(classifyFleetAttempt({ runnerExit: 9, verifierAttempted: false, verified: false })).toBe(
      "launcher_or_run_failure",
    );
    expect(classifyFleetAttempt({ runnerExit: 1, verifierAttempted: true, verified: false })).toBe(
      "verifier_failure",
    );
    expect(classifyFleetAttempt({ runnerExit: 0, verifierAttempted: true, verified: true })).toBe(
      "verified",
    );
    expect(
      classifyFleetAttempt({ runnerExit: 137, verifierAttempted: true, verified: false }),
    ).toBe("technical_timeout");
  });

  it("archives failed artifacts before retry and reduces every attempt, not only the terminal one", () => {
    const root = mkdtempSync(join(tmpdir(), "af-fleet-attempts-"));
    const reportsDir = join(root, "reports");
    const fleetDir = join(root, "fleet");
    mkdirSync(reportsDir);
    mkdirSync(fleetDir);
    const outPrefix = join(reportsDir, "20260716T120000Z_overworld_seed7");
    const reportPath = `${outPrefix}.md`;
    const sidecarPath = `${outPrefix}.run.json`;
    const unrelatedPath = join(reportsDir, "unrelated.md");
    try {
      writeFileSync(reportPath, "rejected report\n");
      writeFileSync(sidecarPath, '{"rejected":true}\n');
      writeFileSync(unrelatedPath, "keep me\n");
      const archive = archiveFailedFleetAttemptArtifacts({
        outPrefix,
        fleetDir,
        seed: 7,
        attempt: 1,
        diagnostic: "attempt=1\nclassification=verifier_failure\n",
      });

      expect(archive.directory).toBe("attempts/seed_7/attempt_1");
      expect(archive.artifacts.map((artifact: { name: string }) => artifact.name)).toEqual([
        "20260716T120000Z_overworld_seed7.md",
        "20260716T120000Z_overworld_seed7.run.json",
        "fleet-diagnostic.log",
      ]);
      for (const artifact of archive.artifacts as {
        name: string;
        bytes: number;
        sha256: string;
      }[]) {
        expect(artifact.bytes).toBeGreaterThan(0);
        expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(existsSync(join(fleetDir, archive.directory, artifact.name))).toBe(true);
      }
      expect(existsSync(reportPath)).toBe(false);
      expect(existsSync(sidecarPath)).toBe(false);
      expect(readFileSync(unrelatedPath, "utf8")).toBe("keep me\n");

      const summary = summarizeFleetAttemptHistory([
        {
          report_recovered: false,
          attempt_history: [
            { classification: "technical_timeout" },
            { classification: "verifier_failure" },
            { classification: "verified" },
          ],
        },
        { report_recovered: true, attempt_history: [] },
      ]);
      expect(summary).toEqual({
        total_attempts: 3,
        failed_attempts: 2,
        technical_timeouts: 1,
        report_recovered_runs: 1,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("declares report recovery only from the trusted adjacent durable marker", () => {
    const reportsDir = mkdtempSync(join(tmpdir(), "af-fleet-recovered-"));
    const reportPath = join(reportsDir, "report.md");
    const markerPath = join(reportsDir, "report.initial-report.txt");
    try {
      writeFileSync(reportPath, "accepted\n");
      expect(pureFleetReportWasRecovered(reportPath, reportsDir)).toBe(false);
      writeFileSync(join(reportsDir, "report.initial.md"), "legacy discoverable marker\n");
      expect(pureFleetReportWasRecovered(reportPath, reportsDir)).toBe(false);
      writeFileSync(markerPath, "rejected initial response\n");
      expect(pureFleetReportWasRecovered(reportPath, reportsDir)).toBe(true);
    } finally {
      rmSync(reportsDir, { recursive: true, force: true });
    }
  });
});

it("renders a closed fleet manifest in deterministic planned order", () => {
  const later = { planned_index: 1, seed: 101, status: "verified" };
  const earlier = { planned_index: 0, seed: 100, status: "verified" };
  const rendered = renderClosedFleetManifest([later, earlier]);
  expect(rendered.trim().split("\n").map(JSON.parse)).toEqual([earlier, later]);
  expect(rendered.endsWith("\n")).toBe(true);
});

it("rejects incomplete or noncontiguous closed manifest rows", () => {
  expect(() =>
    renderClosedFleetManifest([{ planned_index: 1, seed: 101, status: "verified" }]),
  ).toThrow(/contiguous from zero/i);
  expect(() =>
    renderClosedFleetManifest([
      { planned_index: 0, seed: 100, status: "verified" },
      { planned_index: 2, seed: 102, status: "verified" },
    ]),
  ).toThrow(/contiguous from zero/i);
  const sparse = new Array(2);
  sparse[0] = { planned_index: 0, seed: 100, status: "verified" };
  expect(() => renderClosedFleetManifest(sparse)).toThrow(/complete nonempty row set/i);
});

it("atomically locks a same-stamp report namespace across labels and model plans", () => {
  const reportsDir = mkdtempSync(join(tmpdir(), "af-fleet-lock-"));
  const stamp = "20260716T120000Z";
  const haikuRuns = [
    { seed: 100, model: "haiku", target: "overworld" },
    { seed: 101, model: "haiku", target: "overworld" },
  ];
  const sonnetRuns = haikuRuns.map((run) => ({ ...run, model: "sonnet" }));
  try {
    const haikuSpec = fleetReportLockSpec(reportsDir, stamp, haikuRuns);
    const sonnetSpec = fleetReportLockSpec(reportsDir, stamp, sonnetRuns);
    expect(haikuSpec.path).toBe(sonnetSpec.path);
    expect(haikuSpec.identity.model_plan).not.toEqual(sonnetSpec.identity.model_plan);

    const lock = acquireFleetReportLock(reportsDir, stamp, haikuRuns);
    expect(existsSync(lock.path)).toBe(true);
    expect(() => acquireFleetReportLock(reportsDir, stamp, sonnetRuns)).toThrow(/already locked/i);
    releaseFleetReportLock(lock);
    expect(existsSync(lock.path)).toBe(false);

    const reacquired = acquireFleetReportLock(reportsDir, stamp, sonnetRuns);
    releaseFleetReportLock(reacquired);
  } finally {
    rmSync(reportsDir, { recursive: true, force: true });
  }
});

describe("fleet labels", () => {
  it("accepts one bounded safe path segment", () => {
    expect(validateFleetLabel("slice-v1.2_candidate")).toBe("slice-v1.2_candidate");
    expect(parseFleetArgs(["--label", "slice-v1.2_candidate"]).label).toBe("slice-v1.2_candidate");
  });

  it.each([
    "",
    ".",
    "..",
    "../escape",
    "a/b",
    "a\\b",
    ".hidden",
    "release.",
    "CON",
    "con.txt",
    "NUL.json",
    "COM1",
    "lpt9.log",
    "a".repeat(81),
  ])("rejects unsafe label %j", (label) => {
    expect(() => parseFleetArgs(["--label", label])).toThrow(/one non-reserved 1-80 character/i);
  });
});

describe("parseFleetArgs numeric validation", () => {
  it("rejects --count 0 (would otherwise be vacuous success)", () => {
    expect(() => parseFleetArgs(["--count", "0"])).toThrow();
  });
  it("rejects a non-numeric --count", () => {
    expect(() => parseFleetArgs(["--count", "abc"])).toThrow();
  });
  it("rejects --concurrency 0", () => {
    expect(() => parseFleetArgs(["--concurrency", "0"])).toThrow();
  });
  it("rejects a non-integer --concurrency", () => {
    expect(() => parseFleetArgs(["--concurrency", "1.5"])).toThrow();
  });
  it("rejects a negative --max-retries", () => {
    expect(() => parseFleetArgs(["--max-retries", "-1"])).toThrow();
  });
  it("rejects a non-integer --seed-base", () => {
    expect(() => parseFleetArgs(["--seed-base", "NaN"])).toThrow();
  });
  it("accepts the sensible-minimum boundary values", () => {
    expect(() =>
      parseFleetArgs(["--count", "1", "--concurrency", "1", "--max-retries", "0"]),
    ).not.toThrow();
  });

  it("accepts the last two distinct safe seeds and rejects an unsafe final seed", () => {
    const max = Number.MAX_SAFE_INTEGER;
    const edge = parseFleetArgs(["--count", "2", "--seed-base", String(max - 1)]);
    expect(planFleetRuns(edge).map((run: { seed: number }) => run.seed)).toEqual([max - 1, max]);
    expect(() => parseFleetArgs(["--count", "2", "--seed-base", String(max)])).toThrow(
      /seed range.*safe integers/i,
    );
    expect(() => parseFleetArgs(["--seed-base", String(max + 1)])).toThrow(/safe integer/i);
  });

  it("rechecks safe seed uniqueness for programmatic plans", () => {
    const opts = parseFleetArgs(["--count", "1", "--seed-base", String(Number.MAX_SAFE_INTEGER)]);
    opts.count = 2;
    expect(() => planFleetRuns(opts)).toThrow(/seed range.*safe integers/i);
  });
});
