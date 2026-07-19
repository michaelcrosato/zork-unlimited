import { describe, expect, it } from "vitest";
import {
  parsePureFleetAttestation,
  PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION,
  PURE_FLEET_ATTESTATION_SCHEMA_VERSION,
  PureFleetAttestationSchema,
  pureFleetAttestationPathFor,
} from "../../src/starting_slice/fleet_attestation.js";
import {
  fleetAttestationPathFor as runnerAttestationPathFor,
  parsePureFleetAttestation as parseRunnerAttestation,
  pureFleetAttestationMismatch,
  PURE_FLEET_ATTESTATION_SCHEMA_VERSION as RUNNER_ATTESTATION_SCHEMA_VERSION,
  // @ts-expect-error — native runner module has no declaration file
} from "../../blind-tester/fleet.mjs";

const VALID_ATTESTATION = {
  schema_version: PURE_FLEET_ATTESTATION_SCHEMA_VERSION,
  run_seed: 42,
  model: "haiku",
  persona: "default",
  target: "overworld",
  play_mode: "pure",
  start_surface: "fresh_overworld",
  build: {
    git_commit: "a".repeat(40),
    tracked_worktree_clean: true,
    world_id: "new_york_overworld",
    world_hash: "b".repeat(64),
  },
  game_session_id: "ow-attested",
  claude_session_id: "10852ae5-43b1-424a-aa39-7ba347361cec",
  actual_model: "claude-haiku-4-5",
  report_recovered: false,
  receipt_hash: "c".repeat(64),
  report_sha256: "d".repeat(64),
  run_sidecar_sha256: "e".repeat(64),
  run_evidence_sha256: "f".repeat(64),
  primary_envelope_sha256: "0".repeat(64),
  initial_report_sha256: null,
  recovery_metadata_sha256: null,
  recovery_envelope_sha256: null,
} as const;

const VALID_CODEX_ATTESTATION = {
  schema_version: PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION,
  provider: "codex",
  run_seed: 43,
  model: "gpt-5.3-codex-spark",
  persona: "default",
  target: "overworld",
  play_mode: "pure",
  start_surface: "fresh_overworld",
  build: VALID_ATTESTATION.build,
  game_session_id: "ow-codex-attested",
  provider_session_id: "20852ae5-43b1-424a-aa39-7ba347361cec",
  actual_provider: "openai",
  actual_model: "gpt-5.3-codex-spark",
  reasoning_effort: "xhigh",
  provider_turn_id: "30852ae5-43b1-424a-aa39-7ba347361cec",
  provider_cwd: "C:\\private\\player",
  report_recovered: false,
  receipt_hash: "1".repeat(64),
  report_sha256: "2".repeat(64),
  run_sidecar_sha256: "3".repeat(64),
  run_evidence_sha256: "4".repeat(64),
  primary_envelope_sha256: "5".repeat(64),
  provider_events_sha256: "6".repeat(64),
  provider_rollout_sha256: "7".repeat(64),
  provider_capture_sha256: "8".repeat(64),
  initial_report_sha256: null,
  recovery_metadata_sha256: null,
  recovery_envelope_sha256: null,
} as const;

describe("PureFleetAttestationSchema", () => {
  it("accepts the exact runner-owned model attestation", () => {
    expect(RUNNER_ATTESTATION_SCHEMA_VERSION).toBe(PURE_FLEET_ATTESTATION_SCHEMA_VERSION);
    expect(PureFleetAttestationSchema.parse(VALID_ATTESTATION)).toEqual(VALID_ATTESTATION);
    expect(parsePureFleetAttestation(JSON.stringify(VALID_ATTESTATION))).toEqual({
      ok: true,
      attestation: VALID_ATTESTATION,
    });
    expect(pureFleetAttestationPathFor("reports/run.md")).toBe("reports/run.fleet.json");
    expect(runnerAttestationPathFor("reports/run.md")).toBe(
      pureFleetAttestationPathFor("reports/run.md"),
    );
    expect(parseRunnerAttestation(JSON.stringify(VALID_ATTESTATION))).toEqual({
      ok: true,
      attestation: VALID_ATTESTATION,
    });
  });

  it("rejects unsupported models, dirty builds, and additional fields", () => {
    expect(
      PureFleetAttestationSchema.safeParse({ ...VALID_ATTESTATION, model: "claude-custom" })
        .success,
    ).toBe(false);
    expect(
      PureFleetAttestationSchema.safeParse({
        ...VALID_ATTESTATION,
        build: { ...VALID_ATTESTATION.build, tracked_worktree_clean: false },
      }).success,
    ).toBe(false);
    expect(
      PureFleetAttestationSchema.safeParse({ ...VALID_ATTESTATION, untrusted: true }).success,
    ).toBe(false);
  });

  it("accepts exact Codex rollout authority while retaining historical Claude v2", () => {
    expect(PureFleetAttestationSchema.parse(VALID_CODEX_ATTESTATION)).toEqual(
      VALID_CODEX_ATTESTATION,
    );
    expect(parseRunnerAttestation(JSON.stringify(VALID_CODEX_ATTESTATION))).toEqual({
      ok: true,
      attestation: VALID_CODEX_ATTESTATION,
    });
    expect(
      PureFleetAttestationSchema.safeParse({
        ...VALID_CODEX_ATTESTATION,
        actual_model: "gpt-5.6-sol",
      }).success,
    ).toBe(false);
    expect(
      PureFleetAttestationSchema.safeParse({
        ...VALID_CODEX_ATTESTATION,
        requested_model: VALID_CODEX_ATTESTATION.model,
      }).success,
    ).toBe(false);
    expect(
      PureFleetAttestationSchema.safeParse({
        ...VALID_CODEX_ATTESTATION,
        model: "gpt-5.6-luna",
        actual_model: "gpt-5.6-luna",
      }).success,
    ).toBe(true);
  });

  it("binds Codex provider, effort, turn, and cwd back to authenticated rollout facts", () => {
    const run = {
      run_seed: VALID_CODEX_ATTESTATION.run_seed,
      build: VALID_CODEX_ATTESTATION.build,
      session_id: VALID_CODEX_ATTESTATION.game_session_id,
      receipt: { receiptHash: VALID_CODEX_ATTESTATION.receipt_hash },
    };
    const artifactFacts = {
      run,
      game_session_id: VALID_CODEX_ATTESTATION.game_session_id,
      provider: "codex",
      provider_session_id: VALID_CODEX_ATTESTATION.provider_session_id,
      actual_model: VALID_CODEX_ATTESTATION.actual_model,
      actual_provider: VALID_CODEX_ATTESTATION.actual_provider,
      reasoning_effort: VALID_CODEX_ATTESTATION.reasoning_effort,
      provider_turn_id: VALID_CODEX_ATTESTATION.provider_turn_id,
      provider_cwd: VALID_CODEX_ATTESTATION.provider_cwd,
      report_recovered: false,
      hashes: {
        report_sha256: VALID_CODEX_ATTESTATION.report_sha256,
        run_sidecar_sha256: VALID_CODEX_ATTESTATION.run_sidecar_sha256,
        run_evidence_sha256: VALID_CODEX_ATTESTATION.run_evidence_sha256,
        primary_envelope_sha256: VALID_CODEX_ATTESTATION.primary_envelope_sha256,
        initial_report_sha256: null,
        recovery_metadata_sha256: null,
        recovery_envelope_sha256: null,
        provider_events_sha256: VALID_CODEX_ATTESTATION.provider_events_sha256,
        provider_rollout_sha256: VALID_CODEX_ATTESTATION.provider_rollout_sha256,
        provider_capture_sha256: VALID_CODEX_ATTESTATION.provider_capture_sha256,
      },
    };
    const expected = {
      seed: VALID_CODEX_ATTESTATION.run_seed,
      provider: "codex",
      model: VALID_CODEX_ATTESTATION.model,
      build: VALID_CODEX_ATTESTATION.build,
    };
    expect(
      pureFleetAttestationMismatch(VALID_CODEX_ATTESTATION, run, expected, artifactFacts),
    ).toBeNull();
    expect(
      pureFleetAttestationMismatch(
        { ...VALID_CODEX_ATTESTATION, provider_cwd: "C:\\substituted" },
        run,
        expected,
        artifactFacts,
      ),
    ).toMatch(/rollout facts/i);
  });
});
