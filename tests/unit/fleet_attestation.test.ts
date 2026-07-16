import { describe, expect, it } from "vitest";
import {
  parsePureFleetAttestation,
  PURE_FLEET_ATTESTATION_SCHEMA_VERSION,
  PureFleetAttestationSchema,
  pureFleetAttestationPathFor,
} from "../../src/starting_slice/fleet_attestation.js";
import {
  fleetAttestationPathFor as runnerAttestationPathFor,
  parsePureFleetAttestation as parseRunnerAttestation,
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
});
