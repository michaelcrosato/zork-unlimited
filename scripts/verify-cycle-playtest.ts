import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { parseBlindRunSidecar, parseRunEvidenceJsonl } from "../src/blind/run_evidence.js";
import { verifyBlindReportFile } from "../src/blind/report_verifier.js";
import { parseJsonRejectingDuplicateKeys } from "../src/blind/strict_json.js";
import { hashState } from "../src/core/hash.js";
import { loadOverworldManifest } from "../src/world/source.js";

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const CycleMetadataSchema = z
  .object({
    runId: z.string().regex(RUN_ID_PATTERN),
    playtestRecord: z.string().min(1),
  })
  .passthrough();

export interface CyclePlaytestVerificationOptions {
  root?: string;
  /** Separate only for isolated tests; production uses the same repository root. */
  worldRoot?: string;
  metadataPath?: string;
  expectedCommit: string;
}

export type CyclePlaytestVerification =
  | { ok: true; reportPath: string; sidecarPath: string; runId: string }
  | { ok: false; reason: string };

function reject(reason: string): CyclePlaytestVerification {
  return { ok: false, reason };
}

function regularArtifact(
  path: string,
  label: string,
): { ok: true; mtimeMs: number } | { ok: false; reason: string } {
  if (!existsSync(path)) return { ok: false, reason: `${label} is missing: ${path}` };
  try {
    const stat = lstatSync(path);
    if (!stat.isFile()) {
      return { ok: false, reason: `${label} must be a regular non-symlink file: ${path}` };
    }
    return { ok: true, mtimeMs: stat.mtimeMs };
  } catch (error) {
    return { ok: false, reason: `${label} could not be inspected: ${String(error)}` };
  }
}

/**
 * Verify that the current loop cycle published a complete, current-revision pure
 * playtest transaction. The runner publishes report, raw server evidence, then
 * the adjacent V2 sidecar as its commit marker. Replaying the raw evidence must
 * reproduce that sidecar exactly before its report can count.
 *
 * This is a fail-closed local consistency/provenance check, not cryptographic
 * authorship. These are ordinary local files; proving who produced them would
 * require an external witness or a signing secret unavailable to the writer.
 */
export function verifyCyclePlaytest(
  options: CyclePlaytestVerificationOptions,
): CyclePlaytestVerification {
  const root = resolve(options.root ?? process.cwd());
  const worldRoot = resolve(options.worldRoot ?? root);
  const metadataPath = resolve(root, options.metadataPath ?? "ai-runs/latest-cycle.json");
  if (!COMMIT_PATTERN.test(options.expectedCommit)) {
    return reject("expected commit must be a lowercase 40-character Git object id");
  }
  const metadataArtifact = regularArtifact(metadataPath, "cycle metadata");
  if (!metadataArtifact.ok) return reject(metadataArtifact.reason);

  let metadataText: string;
  try {
    metadataText = readFileSync(metadataPath, "utf8");
  } catch (error) {
    return reject(`cycle metadata could not be read: ${String(error)}`);
  }
  const rawMetadata = parseJsonRejectingDuplicateKeys(metadataText, "cycle metadata");
  if (!rawMetadata.ok) return reject(rawMetadata.reason);
  const parsedMetadata = CycleMetadataSchema.safeParse(rawMetadata.value);
  if (!parsedMetadata.success) {
    const issue = parsedMetadata.error.issues[0];
    return reject(
      `cycle metadata invalid: ${issue?.path.join(".") ?? "?"} — ${issue?.message ?? "schema mismatch"}`,
    );
  }

  const { runId, playtestRecord } = parsedMetadata.data;
  const expectedRecord = `ai-runs/${runId}/playtest.md`;
  if (playtestRecord.replaceAll("\\", "/") !== expectedRecord) {
    return reject(`cycle metadata playtestRecord must be the current run path ${expectedRecord}`);
  }
  const reportPath = resolve(root, expectedRecord);
  const evidenceRecord = `ai-runs/${runId}/playtest.evidence.jsonl`;
  const evidencePath = resolve(root, evidenceRecord);
  const sidecarPath = resolve(root, `ai-runs/${runId}/playtest.run.json`);
  const reportArtifact = regularArtifact(reportPath, "cycle playtest report");
  if (!reportArtifact.ok) return reject(reportArtifact.reason);
  const evidenceArtifact = regularArtifact(evidencePath, "cycle raw run evidence");
  if (!evidenceArtifact.ok) return reject(evidenceArtifact.reason);
  const sidecarArtifact = regularArtifact(sidecarPath, "cycle playtest sidecar");
  if (!sidecarArtifact.ok) return reject(sidecarArtifact.reason);
  if (evidenceArtifact.mtimeMs < reportArtifact.mtimeMs) {
    return reject("cycle raw run evidence predates its report; runner publication is incomplete");
  }
  if (sidecarArtifact.mtimeMs < evidenceArtifact.mtimeMs) {
    return reject(
      "cycle playtest sidecar predates its raw run evidence; publication was not committed",
    );
  }

  let evidenceText: string;
  try {
    evidenceText = readFileSync(evidencePath, "utf8");
  } catch (error) {
    return reject(`cycle raw run evidence could not be read: ${String(error)}`);
  }
  const parsedEvidence = parseRunEvidenceJsonl(evidenceText);
  if (!parsedEvidence.ok) return reject(parsedEvidence.reason);
  if (parsedEvidence.sidecar.schema_version !== 2) {
    return reject("cycle playtest requires current V2 build-bound raw run evidence");
  }

  let sidecarText: string;
  try {
    sidecarText = readFileSync(sidecarPath, "utf8");
  } catch (error) {
    return reject(`cycle playtest sidecar could not be read: ${String(error)}`);
  }
  const parsedSidecar = parseBlindRunSidecar(sidecarText);
  if (!parsedSidecar.ok) return reject(parsedSidecar.reason);
  if (parsedSidecar.sidecar.play_mode !== "pure") {
    return reject("cycle playtest sidecar must attest a pure run");
  }
  if (parsedSidecar.sidecar.schema_version !== 2) {
    return reject("cycle playtest requires current V2 build-bound run evidence");
  }
  if (!isDeepStrictEqual(parsedEvidence.sidecar, parsedSidecar.sidecar)) {
    return reject("cycle raw run evidence does not reproduce the adjacent playtest sidecar");
  }

  const run = parsedEvidence.sidecar;
  if (!run.build.tracked_worktree_clean) {
    return reject("cycle playtest sidecar says the tracked worktree was dirty");
  }
  if (run.build.git_commit !== options.expectedCommit) {
    return reject(
      `cycle playtest exercised ${run.build.git_commit}, expected ${options.expectedCommit}`,
    );
  }

  try {
    const world = loadOverworldManifest(worldRoot);
    const currentWorldHash = hashState(world);
    if (run.build.world_id !== world.id) {
      return reject(
        `cycle playtest exercised world ${run.build.world_id}, expected current world ${world.id}`,
      );
    }
    if (run.build.world_hash !== currentWorldHash) {
      return reject(
        `cycle playtest exercised world hash ${run.build.world_hash}, expected current world hash ${currentWorldHash}`,
      );
    }
  } catch (error) {
    return reject(`current overworld provenance could not be verified: ${String(error)}`);
  }

  try {
    const report = verifyBlindReportFile(reportPath, {
      requiredPlayMode: "pure",
      requireStructuredIssueConsistency: true,
      runEvidenceText: evidenceText,
    });
    if (!report.ok) return reject(report.reason);
  } catch (error) {
    return reject(`cycle playtest report could not be verified: ${String(error)}`);
  }

  return { ok: true, reportPath: expectedRecord, sidecarPath, runId };
}

function valueOf(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function main(): void {
  const argv = process.argv.slice(2);
  const metadataPath = valueOf(argv, "--meta") ?? "ai-runs/latest-cycle.json";
  let expectedCommit = valueOf(argv, "--expected-commit");
  if (expectedCommit === undefined) {
    try {
      expectedCommit = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: process.cwd(),
        encoding: "utf8",
      }).trim();
    } catch (error) {
      console.error(`✗ cycle playtest rejected: cannot resolve HEAD: ${String(error)}`);
      process.exit(2);
    }
  }

  const result = verifyCyclePlaytest({ metadataPath, expectedCommit });
  if (!result.ok) {
    console.error(`✗ cycle playtest rejected: ${result.reason}`);
    process.exit(5);
  }
  console.log(`✓ verified pure cycle playtest: ${result.reportPath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
