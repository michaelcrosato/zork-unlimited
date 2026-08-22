import { describe, expect, it } from "vitest";
import {
  HISTORICAL_CLIENT_BOUND_CODEX_ATTESTATION_SCHEMA_VERSION,
  HISTORICAL_CODE_MODE_CODEX_ATTESTATION_SCHEMA_VERSION,
  HISTORICAL_PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION,
  HISTORICAL_RECEIPT_BOUND_CODEX_ATTESTATION_SCHEMA_VERSION,
  HISTORICAL_STRICT_CODEX_ATTESTATION_SCHEMA_VERSION,
  HISTORICAL_TRANSPORT_CODEX_ATTESTATION_SCHEMA_VERSION,
  parsePureFleetAttestation,
  PURE_FLEET_ATTESTATION_SCHEMA_VERSION,
  PURE_FLEET_CODE_MODE_CONTRACT,
  PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION,
  PURE_FLEET_GAME_DIRECT_MCP_CODEX_CLI_VERSION,
  PURE_FLEET_GAME_DIRECT_MCP_TRANSPORT_CONTRACT,
  PURE_FLEET_SPARK_DIRECT_MCP_CODEX_CLI_VERSION,
  PURE_FLEET_SPARK_DIRECT_MCP_TRANSPORT_CONTRACT,
  PureFleetAttestationSchema,
  pureFleetAttestationPathFor,
} from "../../src/starting_slice/fleet_attestation.js";
import {
  fleetAttestationPathFor as runnerAttestationPathFor,
  parsePureFleetAttestation as parseRunnerAttestation,
  pureFleetAttestationMismatch,
  PURE_FLEET_ATTESTATION_SCHEMA_VERSION as RUNNER_ATTESTATION_SCHEMA_VERSION,
  PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION as RUNNER_CODEX_ATTESTATION_SCHEMA_VERSION,
  GAME_DIRECT_MCP_CODEX_CLI_VERSION as RUNNER_GAME_DIRECT_MCP_CODEX_CLI_VERSION,
  SPARK_DIRECT_MCP_CODEX_CLI_VERSION as RUNNER_SPARK_DIRECT_MCP_CODEX_CLI_VERSION,
  // @ts-expect-error — native runner module has no declaration file
} from "../../blind-tester/fleet.mjs";
import {
  codexClientAuthorityRecord,
  // @ts-expect-error — native runner module has no declaration file
} from "../../blind-tester/codex-rollout.mjs";

const CLIENT_IDENTITY = {
  device_id: "1",
  file_id: "2",
  size: "3",
  mtime_ns: "4",
  ctime_ns: "5",
};
const CLIENT_AUTHORITY_TOKEN = Buffer.from(
  JSON.stringify({
    schema_version: 2,
    launcher_kind: "direct",
    selected: { canonical_path: "/opt/codex", identity: CLIENT_IDENTITY },
    selected_symlink: null,
    package_manifest: null,
    javascript_entrypoint: null,
    executable: { canonical_path: "/opt/codex", identity: CLIENT_IDENTITY },
    declared_cli_version: null,
    test_script: false,
  }),
  "utf8",
).toString("base64url");
const CODEX_CLIENT = codexClientAuthorityRecord(CLIENT_AUTHORITY_TOKEN, "0.144.1");
const SPARK_CODEX_CLIENT = codexClientAuthorityRecord(
  CLIENT_AUTHORITY_TOKEN,
  PURE_FLEET_SPARK_DIRECT_MCP_CODEX_CLI_VERSION,
);
const GAME_DIRECT_CODEX_CLIENT = codexClientAuthorityRecord(
  CLIENT_AUTHORITY_TOKEN,
  PURE_FLEET_GAME_DIRECT_MCP_CODEX_CLI_VERSION,
);

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

const VALID_STRICT_CODEX_ATTESTATION = {
  schema_version: HISTORICAL_TRANSPORT_CODEX_ATTESTATION_SCHEMA_VERSION,
  provider: "codex",
  codex_cli_version: CODEX_CLIENT.cli_version,
  codex_client_authority_sha256: CODEX_CLIENT.authority_sha256,
  code_mode_contract: PURE_FLEET_CODE_MODE_CONTRACT,
  run_seed: 43,
  model: "gpt-5.6-terra",
  persona: "default",
  target: "overworld",
  play_mode: "pure",
  start_surface: "fresh_overworld",
  build: VALID_ATTESTATION.build,
  game_session_id: "ow-codex-attested",
  provider_session_id: "20852ae5-43b1-424a-aa39-7ba347361cec",
  actual_provider: "openai",
  actual_model: "gpt-5.6-terra",
  reasoning_effort: "xhigh",
  provider_turn_id: "30852ae5-43b1-424a-aa39-7ba347361cec",
  provider_cwd: "C:\\private\\player",
  report_recovered: false,
  report_receipt_bound: false,
  receipt_hash: "1".repeat(64),
  report_sha256: "2".repeat(64),
  run_sidecar_sha256: "3".repeat(64),
  run_evidence_sha256: "4".repeat(64),
  primary_envelope_sha256: "5".repeat(64),
  provider_events_sha256: "6".repeat(64),
  provider_rollout_sha256: "7".repeat(64),
  provider_capture_sha256: "8".repeat(64),
  initial_report_sha256: null,
  receipt_binding_sha256: null,
  recovery_metadata_sha256: null,
  recovery_envelope_sha256: null,
} as const;

const { code_mode_contract: _currentCodeModeContract, ...CURRENT_CODEX_COMMON_ATTESTATION_FIELDS } =
  VALID_STRICT_CODEX_ATTESTATION;
const VALID_SPARK_DIRECT_CODEX_ATTESTATION = {
  ...CURRENT_CODEX_COMMON_ATTESTATION_FIELDS,
  schema_version: PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION,
  codex_cli_version: SPARK_CODEX_CLIENT.cli_version,
  codex_client_authority_sha256: SPARK_CODEX_CLIENT.authority_sha256,
  model: "gpt-5.3-codex-spark",
  actual_model: "gpt-5.3-codex-spark",
  transport_contract: PURE_FLEET_SPARK_DIRECT_MCP_TRANSPORT_CONTRACT,
} as const;
const VALID_GAME_DIRECT_CODEX_ATTESTATION = {
  ...CURRENT_CODEX_COMMON_ATTESTATION_FIELDS,
  schema_version: PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION,
  codex_cli_version: GAME_DIRECT_CODEX_CLIENT.cli_version,
  codex_client_authority_sha256: GAME_DIRECT_CODEX_CLIENT.authority_sha256,
  transport_contract: PURE_FLEET_GAME_DIRECT_MCP_TRANSPORT_CONTRACT,
} as const;
const VALID_CURRENT_SOL_STRICT_CODEX_ATTESTATION = {
  ...VALID_STRICT_CODEX_ATTESTATION,
  schema_version: PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION,
  model: "gpt-5.6-sol",
  actual_model: "gpt-5.6-sol",
} as const;
const VALID_CURRENT_LUNA_STRICT_CODEX_ATTESTATION = {
  ...VALID_STRICT_CODEX_ATTESTATION,
  schema_version: PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION,
  model: "gpt-5.6-luna",
  actual_model: "gpt-5.6-luna",
} as const;
const VALID_HISTORICAL_SPARK_DIRECT_CODEX_ATTESTATION = {
  ...CURRENT_CODEX_COMMON_ATTESTATION_FIELDS,
  codex_cli_version: SPARK_CODEX_CLIENT.cli_version,
  codex_client_authority_sha256: SPARK_CODEX_CLIENT.authority_sha256,
  model: "gpt-5.3-codex-spark",
  actual_model: "gpt-5.3-codex-spark",
  transport_contract: PURE_FLEET_SPARK_DIRECT_MCP_TRANSPORT_CONTRACT,
} as const;

const VALID_HISTORICAL_CLIENT_BOUND_CODEX_ATTESTATION = {
  ...VALID_STRICT_CODEX_ATTESTATION,
  schema_version: HISTORICAL_CLIENT_BOUND_CODEX_ATTESTATION_SCHEMA_VERSION,
} as const;
const {
  codex_cli_version: _historicalCliVersion,
  codex_client_authority_sha256: _historicalClientAuthority,
  ...HISTORICAL_CODE_MODE_ATTESTATION_FIELDS
} = VALID_HISTORICAL_CLIENT_BOUND_CODEX_ATTESTATION;
const VALID_HISTORICAL_CODE_MODE_CODEX_ATTESTATION = {
  ...HISTORICAL_CODE_MODE_ATTESTATION_FIELDS,
  schema_version: HISTORICAL_CODE_MODE_CODEX_ATTESTATION_SCHEMA_VERSION,
} as const;
const VALID_HISTORICAL_STRICT_CODEX_ATTESTATION = {
  ...HISTORICAL_CODE_MODE_ATTESTATION_FIELDS,
  schema_version: HISTORICAL_STRICT_CODEX_ATTESTATION_SCHEMA_VERSION,
  code_mode_contract: "strict-code-mode-v1",
} as const;
const {
  code_mode_contract: _historicalCodeModeContract,
  ...HISTORICAL_RECEIPT_BOUND_ATTESTATION_FIELDS
} = VALID_HISTORICAL_CODE_MODE_CODEX_ATTESTATION;
const VALID_HISTORICAL_RECEIPT_BOUND_CODEX_ATTESTATION = {
  ...HISTORICAL_RECEIPT_BOUND_ATTESTATION_FIELDS,
  schema_version: HISTORICAL_RECEIPT_BOUND_CODEX_ATTESTATION_SCHEMA_VERSION,
} as const;
const {
  report_receipt_bound: _historicalReceiptBound,
  receipt_binding_sha256: _historicalReceiptBinding,
  ...HISTORICAL_PURE_ATTESTATION_FIELDS
} = VALID_HISTORICAL_RECEIPT_BOUND_CODEX_ATTESTATION;
const VALID_HISTORICAL_PURE_CODEX_ATTESTATION = {
  ...HISTORICAL_PURE_ATTESTATION_FIELDS,
  schema_version: HISTORICAL_PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION,
} as const;

describe("PureFleetAttestationSchema", () => {
  it("accepts the exact runner-owned model attestation", () => {
    expect(RUNNER_ATTESTATION_SCHEMA_VERSION).toBe(PURE_FLEET_ATTESTATION_SCHEMA_VERSION);
    expect(RUNNER_CODEX_ATTESTATION_SCHEMA_VERSION).toBe(
      PURE_FLEET_CODEX_ATTESTATION_SCHEMA_VERSION,
    );
    expect(RUNNER_SPARK_DIRECT_MCP_CODEX_CLI_VERSION).toBe(
      PURE_FLEET_SPARK_DIRECT_MCP_CODEX_CLI_VERSION,
    );
    expect(RUNNER_GAME_DIRECT_MCP_CODEX_CLI_VERSION).toBe(
      PURE_FLEET_GAME_DIRECT_MCP_CODEX_CLI_VERSION,
    );
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

  it("accepts only the model-specific current Codex v9 transport branches", () => {
    for (const attestation of [
      VALID_SPARK_DIRECT_CODEX_ATTESTATION,
      VALID_GAME_DIRECT_CODEX_ATTESTATION,
      VALID_CURRENT_SOL_STRICT_CODEX_ATTESTATION,
      VALID_CURRENT_LUNA_STRICT_CODEX_ATTESTATION,
    ]) {
      expect(PureFleetAttestationSchema.parse(attestation)).toEqual(attestation);
      expect(parseRunnerAttestation(JSON.stringify(attestation))).toEqual({
        ok: true,
        attestation,
      });
    }

    expect(VALID_SPARK_DIRECT_CODEX_ATTESTATION).not.toHaveProperty("code_mode_contract");
    expect(VALID_GAME_DIRECT_CODEX_ATTESTATION).not.toHaveProperty("code_mode_contract");
    expect(VALID_CURRENT_SOL_STRICT_CODEX_ATTESTATION).not.toHaveProperty("transport_contract");

    for (const invalid of [
      {
        ...VALID_SPARK_DIRECT_CODEX_ATTESTATION,
        code_mode_contract: PURE_FLEET_CODE_MODE_CONTRACT,
      },
      { ...VALID_SPARK_DIRECT_CODEX_ATTESTATION, transport_contract: "legacy" },
      {
        ...VALID_SPARK_DIRECT_CODEX_ATTESTATION,
        codex_cli_version: CODEX_CLIENT.cli_version,
      },
      {
        ...VALID_STRICT_CODEX_ATTESTATION,
        transport_contract: PURE_FLEET_SPARK_DIRECT_MCP_TRANSPORT_CONTRACT,
      },
      {
        ...VALID_GAME_DIRECT_CODEX_ATTESTATION,
        transport_contract: PURE_FLEET_SPARK_DIRECT_MCP_TRANSPORT_CONTRACT,
      },
      { ...VALID_CURRENT_SOL_STRICT_CODEX_ATTESTATION, code_mode_contract: "legacy" },
      {
        ...VALID_SPARK_DIRECT_CODEX_ATTESTATION,
        model: "gpt-5.6-luna",
        actual_model: "gpt-5.6-luna",
      },
      {
        ...VALID_GAME_DIRECT_CODEX_ATTESTATION,
        model: "gpt-5.6-sol",
        actual_model: "gpt-5.6-sol",
      },
      {
        ...VALID_GAME_DIRECT_CODEX_ATTESTATION,
        model: "gpt-5.6-luna",
        actual_model: "gpt-5.6-luna",
      },
      {
        ...VALID_CURRENT_SOL_STRICT_CODEX_ATTESTATION,
        model: "gpt-5.6-terra",
        actual_model: "gpt-5.6-terra",
      },
      {
        ...VALID_GAME_DIRECT_CODEX_ATTESTATION,
        codex_cli_version: CODEX_CLIENT.cli_version,
      },
    ]) {
      expect(PureFleetAttestationSchema.safeParse(invalid).success).toBe(false);
      expect(parseRunnerAttestation(JSON.stringify(invalid)).ok).toBe(false);
    }
  });

  it("keeps historical Codex attestation schemas v3 through v8 readable", () => {
    for (const attestation of [
      VALID_HISTORICAL_PURE_CODEX_ATTESTATION,
      VALID_HISTORICAL_RECEIPT_BOUND_CODEX_ATTESTATION,
      VALID_HISTORICAL_STRICT_CODEX_ATTESTATION,
      VALID_HISTORICAL_CODE_MODE_CODEX_ATTESTATION,
      VALID_HISTORICAL_CLIENT_BOUND_CODEX_ATTESTATION,
      VALID_STRICT_CODEX_ATTESTATION,
      VALID_HISTORICAL_SPARK_DIRECT_CODEX_ATTESTATION,
    ]) {
      expect(PureFleetAttestationSchema.parse(attestation)).toEqual(attestation);
      expect(parseRunnerAttestation(JSON.stringify(attestation))).toEqual({
        ok: true,
        attestation,
      });
    }
  });

  it("requires complete current provenance for receipt-bound Codex reports", () => {
    const bound = {
      ...VALID_STRICT_CODEX_ATTESTATION,
      report_receipt_bound: true,
      initial_report_sha256: "9".repeat(64),
      receipt_binding_sha256: "a".repeat(64),
    } as const;
    expect(PureFleetAttestationSchema.parse(bound)).toEqual(bound);
    expect(parseRunnerAttestation(JSON.stringify(bound))).toEqual({
      ok: true,
      attestation: bound,
    });
    expect(
      PureFleetAttestationSchema.safeParse({ ...bound, receipt_binding_sha256: null }).success,
    ).toBe(false);
    expect(
      parseRunnerAttestation(JSON.stringify({ ...bound, report_receipt_bound: false })).ok,
    ).toBe(false);

    const duplicateBindingDigest = JSON.stringify(bound).replace(
      '"receipt_binding_sha256":',
      `"receipt_binding_sha256":"${"f".repeat(64)}","receipt_binding_sha256":`,
    );
    for (const parse of [parsePureFleetAttestation, parseRunnerAttestation]) {
      expect(parse(duplicateBindingDigest)).toMatchObject({
        ok: false,
        reason: expect.stringMatching(/duplicate JSON object key "receipt_binding_sha256"/i),
      });
    }

    const {
      code_mode_contract: _strictContract,
      codex_cli_version: _cliVersion,
      codex_client_authority_sha256: _clientAuthority,
      ...historicalFields
    } = bound;
    const historicalV4 = { ...historicalFields, schema_version: 4 } as const;
    expect(PureFleetAttestationSchema.parse(historicalV4)).toEqual(historicalV4);
    expect(parseRunnerAttestation(JSON.stringify(historicalV4))).toMatchObject({ ok: true });
    expect(
      PureFleetAttestationSchema.safeParse({
        ...historicalV4,
        code_mode_contract: "strict-code-mode-v1",
      }).success,
    ).toBe(false);
  });

  it("binds Codex provider, effort, turn, and cwd back to authenticated rollout facts", () => {
    const run = {
      run_seed: VALID_GAME_DIRECT_CODEX_ATTESTATION.run_seed,
      build: VALID_GAME_DIRECT_CODEX_ATTESTATION.build,
      session_id: VALID_GAME_DIRECT_CODEX_ATTESTATION.game_session_id,
      receipt: { receiptHash: VALID_GAME_DIRECT_CODEX_ATTESTATION.receipt_hash },
    };
    const artifactFacts = {
      run,
      game_session_id: VALID_GAME_DIRECT_CODEX_ATTESTATION.game_session_id,
      provider: "codex",
      provider_session_id: VALID_GAME_DIRECT_CODEX_ATTESTATION.provider_session_id,
      actual_model: VALID_GAME_DIRECT_CODEX_ATTESTATION.actual_model,
      actual_provider: VALID_GAME_DIRECT_CODEX_ATTESTATION.actual_provider,
      reasoning_effort: VALID_GAME_DIRECT_CODEX_ATTESTATION.reasoning_effort,
      provider_turn_id: VALID_GAME_DIRECT_CODEX_ATTESTATION.provider_turn_id,
      provider_cwd: VALID_GAME_DIRECT_CODEX_ATTESTATION.provider_cwd,
      code_mode_contract: null,
      transport_contract: PURE_FLEET_GAME_DIRECT_MCP_TRANSPORT_CONTRACT,
      report_recovered: false,
      report_receipt_bound: false,
      hashes: {
        report_sha256: VALID_GAME_DIRECT_CODEX_ATTESTATION.report_sha256,
        run_sidecar_sha256: VALID_GAME_DIRECT_CODEX_ATTESTATION.run_sidecar_sha256,
        run_evidence_sha256: VALID_GAME_DIRECT_CODEX_ATTESTATION.run_evidence_sha256,
        primary_envelope_sha256: VALID_GAME_DIRECT_CODEX_ATTESTATION.primary_envelope_sha256,
        initial_report_sha256: null,
        receipt_binding_sha256: null,
        recovery_metadata_sha256: null,
        recovery_envelope_sha256: null,
        provider_events_sha256: VALID_GAME_DIRECT_CODEX_ATTESTATION.provider_events_sha256,
        provider_rollout_sha256: VALID_GAME_DIRECT_CODEX_ATTESTATION.provider_rollout_sha256,
        provider_capture_sha256: VALID_GAME_DIRECT_CODEX_ATTESTATION.provider_capture_sha256,
      },
    };
    const expected = {
      seed: VALID_GAME_DIRECT_CODEX_ATTESTATION.run_seed,
      provider: "codex",
      model: VALID_GAME_DIRECT_CODEX_ATTESTATION.model,
      build: VALID_GAME_DIRECT_CODEX_ATTESTATION.build,
      client: GAME_DIRECT_CODEX_CLIENT,
    };
    expect(
      pureFleetAttestationMismatch(
        VALID_GAME_DIRECT_CODEX_ATTESTATION,
        run,
        expected,
        artifactFacts,
      ),
    ).toBeNull();
    expect(
      pureFleetAttestationMismatch(
        { ...VALID_GAME_DIRECT_CODEX_ATTESTATION, provider_cwd: "C:\\substituted" },
        run,
        expected,
        artifactFacts,
      ),
    ).toMatch(/rollout facts/i);
    expect(
      pureFleetAttestationMismatch(VALID_GAME_DIRECT_CODEX_ATTESTATION, run, expected, {
        ...artifactFacts,
        transport_contract: null,
      }),
    ).toMatch(/game-direct-mcp-v1 evidence/i);
    const sparkExpected = {
      ...expected,
      model: VALID_SPARK_DIRECT_CODEX_ATTESTATION.model,
      client: SPARK_CODEX_CLIENT,
    };
    const sparkArtifactFacts = {
      ...artifactFacts,
      actual_model: VALID_SPARK_DIRECT_CODEX_ATTESTATION.actual_model,
      code_mode_contract: null,
      transport_contract: PURE_FLEET_SPARK_DIRECT_MCP_TRANSPORT_CONTRACT,
    };
    expect(
      pureFleetAttestationMismatch(
        VALID_SPARK_DIRECT_CODEX_ATTESTATION,
        run,
        sparkExpected,
        sparkArtifactFacts,
      ),
    ).toBeNull();
    expect(
      pureFleetAttestationMismatch(VALID_SPARK_DIRECT_CODEX_ATTESTATION, run, sparkExpected, {
        ...sparkArtifactFacts,
        transport_contract: null,
      }),
    ).toMatch(/spark-direct-mcp-v1 evidence/i);
    expect(
      pureFleetAttestationMismatch(VALID_STRICT_CODEX_ATTESTATION, run, expected, artifactFacts),
    ).toMatch(/current Codex resume requires attestation v9/i);
  });
});
