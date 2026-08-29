import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parseBlindRunSidecar } from "../src/blind/run_evidence.js";
import { parseJsonRejectingDuplicateKeys } from "../src/blind/strict_json.js";
import { canonicalize, hashState } from "../src/core/hash.js";
import {
  FeedbackAcceptanceStateSchema,
  acceptedCycleReportRef,
  loadAcceptedFeedbackBundle,
  parseFeedbackAcceptanceStateText,
  parseFeedbackCycleSelection,
  pendingAcceptedCycleReportPaths,
  readCommittedFeedbackAcceptanceState,
  readFeedbackAcceptanceState,
  removeFeedbackCycleSelectionMarker,
  upsertFeedbackAcceptanceStateText,
  type AcceptedFeedbackBundle,
  type FeedbackAcceptanceState,
} from "../src/feedback/acceptance.js";
import { compileFeedback, type FeedbackCohortPolicy } from "../src/feedback/compile.js";
import { resolveFeedbackInputs } from "../src/feedback/inputs.js";
import {
  loadReportManifest,
  sha256Bytes,
  sha256File,
  type LoadedReportManifest,
} from "../src/feedback/report_manifest.js";
import { verifyCyclePlaytest } from "./verify-cycle-playtest.js";

const SHA256_RE = /^[0-9a-f]{64}$/u;
const COMMIT_RE = /^[0-9a-f]{40}$/u;
const CYCLE_RUN_ID_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/u;
const MANIFEST_REF_RE = /^ai-runs\/feedback\/(\d{8}T\d{6}Z)\/report-manifest\.json$/u;
const MIN_ACTIONABLE_REPORTS = 3;

const CycleMetadataSchema = z
  .object({
    runId: z.string().regex(CYCLE_RUN_ID_RE),
    /**
     * Where a cycle playtest WOULD land — never a claim that one happened.
     *
     * The dev loop no longer plays the game (loop.sh dropped require_playtest_record;
     * the playtest loop owns experience evidence now), so this slot is routinely empty
     * and the field itself is optional for callers that stop emitting it. Presence of
     * the ARTIFACT decides whether a playtest is verified below; presence of this
     * string never could, because it is written by the cycle before anything happens.
     */
    playtestRecord: z.string().min(1).optional(),
    recommendationId: z.string().min(1).nullable(),
  })
  .passthrough();

export const FeedbackCompilePointerSchema = z
  .object({
    schema_version: z.literal(1),
    run_id: z.string().regex(CYCLE_RUN_ID_RE),
    manifest_path: z.string().regex(MANIFEST_REF_RE),
    manifest_sha256: z.string().regex(SHA256_RE),
  })
  .strict();

export type FeedbackCompilePointer = z.infer<typeof FeedbackCompilePointerSchema>;

export type SealFeedbackAcceptanceOptions = {
  root?: string;
  /** Separate only for isolated tests; production verifies the repository's current world. */
  worldRoot?: string;
  metadataPath?: string;
  expectedCommit: string;
  /** Exact clean revision captured before ai:loop initialized this cycle. */
  startRef: string;
};

export type SealFeedbackAcceptanceResult = {
  runId: string;
  /** The sealed pure report identity, or null when the cycle published no playtest. */
  reportId: string | null;
  promotedManifestPath: string | null;
  consumedRecommendation: boolean;
  pendingReports: number;
};

/**
 * Everything a VERIFIED cycle playtest contributes to the seal.
 *
 * Built only when `ai-runs/<runId>/playtest.md` actually exists, and only after the
 * full verifyCyclePlaytest transaction has passed. Null in its place means the cycle
 * played nothing — never that a playtest was accepted on weaker terms.
 */
type SealedCyclePlaytest = {
  reportId: string;
  reportBytes: Buffer;
  evidenceBytes: Buffer;
  sidecarBytes: Buffer;
  /** (ref, bytes, label) triples re-read at each checkpoint to prove nothing moved. */
  stableArtifacts: readonly (readonly [string, Buffer, string])[];
};

function fail(message: string): never {
  throw new Error(`feedback acceptance seal rejected: ${message}`);
}

function containedRef(root: string, ref: string): string | null {
  if (ref.includes("\\") || isAbsolute(ref)) return null;
  const rootPath = resolve(root);
  const path = resolve(rootPath, ref);
  const rel = relative(rootPath, path).replaceAll("\\", "/");
  return rel === ref && rel !== ".." && !rel.startsWith("../") ? path : null;
}

function readContainedRegularBytes(root: string, ref: string, label: string): Buffer {
  const path = containedRef(root, ref);
  if (!path) fail(`${label} path escapes the repository: ${ref}`);
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail(`${label} must be a regular non-symlink file: ${ref}`);
    }
    const realRoot = realpathSync(resolve(root));
    const realPath = realpathSync(path);
    const realRel = relative(realRoot, realPath);
    if (
      realRel === ".." ||
      realRel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
      isAbsolute(realRel)
    ) {
      fail(`${label} resolves outside the repository: ${ref}`);
    }
    return readFileSync(path);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("feedback acceptance seal rejected:")) {
      throw error;
    }
    fail(`${label} could not be read: ${ref} (${String(error)})`);
  }
}

function parseStrictJson(bytes: Buffer, label: string): unknown {
  const parsed = parseJsonRejectingDuplicateKeys(bytes.toString("utf8"), label);
  if (!parsed.ok) fail(`${label} is invalid: ${parsed.reason}`);
  return parsed.value;
}

function assertCanonicalAcceptanceMarker(
  text: string,
  found: boolean,
  state: FeedbackAcceptanceState,
  label: string,
): void {
  const markerLines = text.split(/\r?\n/u).filter((line) => line.includes("feedback_acceptance:"));
  if (!found) {
    if (markerLines.length > 0)
      fail(`${label} contains an unrecognized feedback acceptance marker`);
    return;
  }
  const expected = `<!-- feedback_acceptance: ${canonicalize(state)} -->`;
  if (markerLines.length !== 1 || markerLines[0] !== expected) {
    fail(`${label} feedback acceptance marker does not use canonical bytes`);
  }
}

function readCycleMetadata(
  root: string,
  metadataRef: string,
): {
  bytes: Buffer;
  metadata: z.infer<typeof CycleMetadataSchema>;
} {
  const bytes = readContainedRegularBytes(root, metadataRef, "cycle metadata");
  const parsed = CycleMetadataSchema.safeParse(parseStrictJson(bytes, "cycle metadata"));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    fail(
      `cycle metadata is invalid at ${issue?.path.join(".") || "?"}: ${issue?.message ?? "schema mismatch"}`,
    );
  }
  return { bytes, metadata: parsed.data };
}

function parseCompilePointer(root: string, runId: string): FeedbackCompilePointer | null {
  const ref = `ai-runs/${runId}/feedback-compile.json`;
  if (!existsSync(resolve(root, ref))) return null;
  const bytes = readContainedRegularBytes(root, ref, "feedback compile pointer");
  const parsed = FeedbackCompilePointerSchema.safeParse(
    parseStrictJson(bytes, "feedback compile pointer"),
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    fail(
      `feedback compile pointer is invalid at ${issue?.path.join(".") || "?"}: ${issue?.message ?? "schema mismatch"}`,
    );
  }
  if (parsed.data.run_id !== runId) {
    fail(`feedback compile pointer belongs to ${parsed.data.run_id}, expected ${runId}`);
  }
  const canonicalBytes = `${canonicalize(parsed.data)}\n`;
  if (bytes.toString("utf8") !== canonicalBytes) {
    fail("feedback compile pointer must use canonical JSON bytes");
  }
  return parsed.data;
}

function assertBundleArtifacts(root: string, manifestRef: string): void {
  const match = MANIFEST_REF_RE.exec(manifestRef);
  if (!match) fail(`feedback manifest path is not canonical: ${manifestRef}`);
  const base = `ai-runs/feedback/${match[1]!}`;
  readContainedRegularBytes(root, `${base}/report-manifest.json`, "feedback manifest");
  readContainedRegularBytes(root, `${base}/hotspots.json`, "feedback hotspots");
  readContainedRegularBytes(root, `${base}/retention.json`, "feedback retention summary");
  readContainedRegularBytes(root, `${base}/hotspots.md`, "feedback markdown summary");
}

function loadPointerManifest(root: string, pointer: FeedbackCompilePointer): LoadedReportManifest {
  assertBundleArtifacts(root, pointer.manifest_path);
  const manifestPath = containedRef(root, pointer.manifest_path);
  if (!manifestPath) fail("feedback manifest path escapes the repository");
  const loaded = loadReportManifest(manifestPath, pointer.manifest_sha256);
  if (!loaded) fail("feedback manifest is missing, malformed, non-canonical, or hash-mismatched");
  return loaded;
}

function assertReproducibleCompile(
  root: string,
  worldRoot: string,
  expectedCommit: string,
  state: FeedbackAcceptanceState,
  pointer: FeedbackCompilePointer,
  loaded: LoadedReportManifest,
  priorBundle: AcceptedFeedbackBundle | null,
): void {
  const manifest = loaded.manifest;
  let policy: FeedbackCohortPolicy;
  if (manifest.kind === "delta") {
    if (!priorBundle || !state.accepted_compile) {
      fail("a delta feedback compile has no available accepted predecessor");
    }
    policy = {
      kind: "delta",
      previousManifest: priorBundle.manifest,
      previousManifestSha256: state.accepted_compile.manifest_sha256,
      previousHotspots: priorBundle.hotspots,
      previousEvidence: priorBundle.evidence,
    };
  } else if (manifest.kind === "bootstrap") {
    policy = { kind: "bootstrap" };
  } else if (manifest.kind === "initial") {
    policy = { kind: "initial" };
  } else {
    fail("a standalone feedback compile cannot become loop authority");
  }

  const inputs = resolveFeedbackInputs(root, [], state);
  const scratch = mkdtempSync(join(tmpdir(), "feedback-seal-rebuild-"));
  try {
    const rebuilt = compileFeedback({
      root,
      worldRoot,
      inputs,
      outDir: scratch,
      topK: 10,
      llmLabels: false,
      prevDir: null,
      cohortPolicy: policy,
      generatedAt: manifest.generated_at,
      commit: expectedCommit,
    });
    const candidateDir = dirname(containedRef(root, pointer.manifest_path)!);
    const comparisons = [
      [rebuilt.jsonPath, join(candidateDir, "hotspots.json")],
      [rebuilt.retentionPath, join(candidateDir, "retention.json")],
      [rebuilt.mdPath, join(candidateDir, "hotspots.md")],
      [rebuilt.manifestPath, join(candidateDir, "report-manifest.json")],
    ] as const;
    for (const [actual, candidate] of comparisons) {
      if (!readFileSync(actual).equals(readFileSync(candidate))) {
        fail(`feedback compile is not the deterministic output of its accepted input cohort`);
      }
    }
    if (rebuilt.manifestSha256 !== pointer.manifest_sha256) {
      fail("feedback manifest digest differs from its deterministic rebuild");
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("feedback acceptance seal rejected:")) {
      throw error;
    }
    fail(`feedback compile could not be reproduced from accepted inputs: ${String(error)}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function atomicWriteLoopState(path: string, expectedText: string, nextText: string): void {
  if (readFileSync(path, "utf8") !== expectedText) {
    fail("AI_LOOP_STATE.md changed while the feedback acceptance seal was being prepared");
  }
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail("AI_LOOP_STATE.md must remain a regular non-symlink file");
  }
  const tempPath = join(
    dirname(path),
    `.${basename(path)}.seal-${process.pid}-${randomUUID()}.tmp`,
  );
  try {
    writeFileSync(tempPath, nextText, { encoding: "utf8", flag: "wx", mode: stat.mode });
    renameSync(tempPath, path);
  } finally {
    try {
      unlinkSync(tempPath);
    } catch {
      // A successful rename consumes the temporary path; a failed write may not create it.
    }
  }
}

/**
 * Seal the ignored evidence from one successful loop cycle into the sole
 * tracked authority marker. The caller must run this after every outer gate
 * and before staging AI_LOOP_STATE.md for the final ledger commit.
 *
 * A cycle playtest is an OPTIONAL input here, not a precondition. The dev loop stopped
 * playing the game when the two loops split, so most cycles arrive with an empty
 * `ai-runs/<runId>/` playtest slot and seal the acceptance marker on its own. When the
 * slot IS full the evidence is verified exactly as it always was — nothing about the
 * accepting path was relaxed to make the empty path possible.
 */
export function sealFeedbackAcceptance(
  options: SealFeedbackAcceptanceOptions,
): SealFeedbackAcceptanceResult {
  const root = resolve(options.root ?? process.cwd());
  const worldRoot = resolve(options.worldRoot ?? root);
  const metadataRef = (options.metadataPath ?? "ai-runs/latest-cycle.json").replaceAll("\\", "/");
  if (!COMMIT_RE.test(options.expectedCommit)) {
    fail("expected commit must be a lowercase 40-character Git object id");
  }
  if (!COMMIT_RE.test(options.startRef)) {
    fail("cycle start ref must be a lowercase 40-character Git object id");
  }
  let actualHead: string;
  try {
    actualHead = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch (error) {
    fail(`current Git HEAD could not be resolved: ${String(error)}`);
  }
  if (actualHead !== options.expectedCommit) {
    fail(`expected commit ${options.expectedCommit} is not current HEAD ${actualHead}`);
  }

  const metadataBefore = readCycleMetadata(root, metadataRef);
  const runId = metadataBefore.metadata.runId;
  const expectedRecord = `ai-runs/${runId}/playtest.md`;
  const evidenceRef = `ai-runs/${runId}/playtest.evidence.jsonl`;
  const sidecarRef = `ai-runs/${runId}/playtest.run.json`;
  const declaredRecord = metadataBefore.metadata.playtestRecord?.replaceAll("\\", "/");
  if (declaredRecord !== undefined && declaredRecord !== expectedRecord) {
    fail(`cycle metadata playtestRecord must be ${expectedRecord}`);
  }

  // OPTIONAL EVIDENCE, NEVER UNVERIFIED EVIDENCE.
  //
  // A dev cycle is no longer required to play the game, so the common case is that
  // this slot is empty and the seal records the acceptance marker alone. What must not
  // change is what happens when the slot is FULL: an existing report goes through the
  // identical verifyCyclePlaytest transaction, byte-stability checks and pure-V2
  // sidecar binding it always did. The two cases are separated by the artifact on
  // disk rather than by anything the cycle asserts about itself, because the seal is
  // the last place a claim can still be tested — a flag saying "I did not play" would
  // be exactly the unverifiable self-report this whole file exists to refuse.
  let playtest: SealedCyclePlaytest | null = null;
  if (existsSync(join(root, expectedRecord))) {
    const reportBytes = readContainedRegularBytes(root, expectedRecord, "cycle playtest report");
    const evidenceBytes = readContainedRegularBytes(root, evidenceRef, "cycle raw run evidence");
    const sidecarBytes = readContainedRegularBytes(root, sidecarRef, "cycle playtest sidecar");

    const verification = verifyCyclePlaytest({
      root,
      worldRoot,
      metadataPath: metadataRef,
      expectedCommit: options.expectedCommit,
    });
    if (!verification.ok) fail(verification.reason);
    if (verification.runId !== runId || verification.reportPath !== expectedRecord) {
      fail("cycle metadata changed while its pure playtest was being verified");
    }
    const metadataAfter = readCycleMetadata(root, metadataRef);
    if (sha256Bytes(metadataAfter.bytes) !== sha256Bytes(metadataBefore.bytes)) {
      fail("cycle metadata changed while its pure playtest was being verified");
    }
    const stableArtifacts = [
      [expectedRecord, reportBytes, "cycle playtest report"],
      [evidenceRef, evidenceBytes, "cycle raw run evidence"],
      [sidecarRef, sidecarBytes, "cycle playtest sidecar"],
    ] as const;
    for (const [ref, before, label] of stableArtifacts) {
      if (sha256Bytes(readContainedRegularBytes(root, ref, label)) !== sha256Bytes(before)) {
        fail(`${label} changed while the pure playtest was being verified`);
      }
    }

    const parsedSidecar = parseBlindRunSidecar(sidecarBytes.toString("utf8"));
    if (!parsedSidecar.ok) fail(`cycle playtest sidecar is invalid: ${parsedSidecar.reason}`);
    if (
      parsedSidecar.sidecar.schema_version !== 2 ||
      parsedSidecar.sidecar.play_mode !== "pure" ||
      parsedSidecar.sidecar.build.git_commit !== options.expectedCommit
    ) {
      fail("cycle playtest sidecar is not pure V2 evidence for the provisional commit");
    }
    playtest = {
      reportId: `pure:${hashState(parsedSidecar.sidecar)}`,
      reportBytes,
      evidenceBytes,
      sidecarBytes,
      stableArtifacts,
    };
  } else {
    // A half-published transaction is not the same thing as "this cycle played
    // nothing". The runner publishes the report FIRST, so raw evidence or a sidecar
    // with no report beside it means either a publication that broke midway or a
    // report deleted after the fact. Treating that as the deliberate no-playtest case
    // would let the weakest state in the system — orphaned evidence nobody verifies —
    // pass as the strongest-looking one, so it stays fail-closed.
    for (const orphan of [evidenceRef, sidecarRef]) {
      if (existsSync(join(root, orphan))) {
        fail(
          `${orphan} exists without ${expectedRecord}; the cycle playtest publication is incomplete`,
        );
      }
    }
  }
  const stableArtifacts = playtest?.stableArtifacts ?? [];

  const committed = readCommittedFeedbackAcceptanceState(root);
  if (!committed.ok) fail(committed.reason);
  let committedStateText: string;
  try {
    committedStateText = execFileSync("git", ["show", "HEAD:AI_LOOP_STATE.md"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (error) {
    fail(`committed AI_LOOP_STATE.md could not be read: ${String(error)}`);
  }
  assertCanonicalAcceptanceMarker(
    committedStateText,
    committed.found,
    committed.state,
    "committed AI_LOOP_STATE.md",
  );
  let startStateText: string;
  try {
    startStateText = execFileSync("git", ["show", `${options.startRef}:AI_LOOP_STATE.md`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (error) {
    fail(`cycle-start AI_LOOP_STATE.md could not be read: ${String(error)}`);
  }
  const startState = parseFeedbackAcceptanceStateText(startStateText);
  if (!startState.ok) fail(`cycle-start ${startState.reason}`);
  assertCanonicalAcceptanceMarker(
    startStateText,
    startState.found,
    startState.state,
    "cycle-start AI_LOOP_STATE.md",
  );
  if (canonicalize(startState.state) !== canonicalize(committed.state)) {
    fail("the provisional commit changed feedback acceptance authority from the cycle start");
  }
  const committedSelection = parseFeedbackCycleSelection(committedStateText, runId);
  if (!committedSelection.ok) fail(committedSelection.reason);
  if (!committedSelection.selection) {
    fail(`committed AI_LOOP_STATE.md has no actual-selection attestation for ${runId}`);
  }
  const worktree = readFeedbackAcceptanceState(root);
  if (!worktree.ok) fail(worktree.reason);
  if (
    committed.found !== worktree.found ||
    canonicalize(committed.state) !== canonicalize(worktree.state)
  ) {
    fail("the worktree feedback acceptance marker diverges from committed HEAD");
  }
  const statePath = join(root, "AI_LOOP_STATE.md");
  const stateText = readFileSync(statePath, "utf8");
  const worktreeSelection = parseFeedbackCycleSelection(stateText, runId);
  if (!worktreeSelection.ok) fail(worktreeSelection.reason);
  if (!worktreeSelection.selection) {
    fail(`worktree AI_LOOP_STATE.md has no frozen actual-selection attestation for ${runId}`);
  }
  if (canonicalize(worktreeSelection.selection) !== canonicalize(committedSelection.selection)) {
    fail("the worktree feedback cycle selection diverges from the provisional commit");
  }
  const parsedStateText = parseFeedbackAcceptanceStateText(stateText);
  if (!parsedStateText.ok) fail(parsedStateText.reason);
  assertCanonicalAcceptanceMarker(
    stateText,
    parsedStateText.found,
    parsedStateText.state,
    "worktree AI_LOOP_STATE.md",
  );
  if (
    parsedStateText.found !== committed.found ||
    canonicalize(parsedStateText.state) !== canonicalize(committed.state)
  ) {
    fail("the worktree feedback acceptance marker diverges from committed HEAD");
  }

  const priorBundle = committed.state.accepted_compile
    ? loadAcceptedFeedbackBundle(root, committed.state)
    : null;
  let acceptedCompile = committed.state.accepted_compile
    ? { ...committed.state.accepted_compile }
    : null;
  let consumedRecommendation = false;
  const priorRecommendation = priorBundle?.hotspots.recommended_next_fix?.hotspot_id;
  if (
    acceptedCompile &&
    acceptedCompile.consumed_by_run_id === null &&
    priorRecommendation !== undefined &&
    committedSelection.selection.selected_recommendation_id === `hotspot-${priorRecommendation}`
  ) {
    acceptedCompile.consumed_by_run_id = runId;
    consumedRecommendation = true;
  }

  let pending = committed.state.pending_cycle_reports.map((entry) => ({ ...entry }));
  const pointer = parseCompilePointer(root, runId);
  let promotedManifestPath: string | null = null;
  if (pointer) {
    const loaded = loadPointerManifest(root, pointer);
    const manifest = loaded.manifest;
    if (manifest.kind === "standalone") {
      fail("a standalone feedback compile cannot become loop authority");
    }
    if (
      (manifest.kind === "initial" || manifest.kind === "delta") &&
      manifest.cohort.actionable_report_ids.length < MIN_ACTIONABLE_REPORTS
    ) {
      fail(
        `${manifest.kind} feedback compile has ${manifest.cohort.actionable_report_ids.length} actionable reports; ${MIN_ACTIONABLE_REPORTS} required`,
      );
    }
    if (manifest.commit !== options.expectedCommit) {
      fail(`feedback compile exercised ${manifest.commit}, expected ${options.expectedCommit}`);
    }
    if (priorBundle) {
      if (
        manifest.kind !== "delta" ||
        manifest.previous_manifest_sha256 !== committed.state.accepted_compile!.manifest_sha256
      ) {
        fail("feedback compile does not extend the tracked accepted manifest");
      }
      const seen = new Set(manifest.corpus.seen_report_ids);
      if (priorBundle.manifest.corpus.seen_report_ids.some((id) => !seen.has(id))) {
        fail("feedback compile drops report identities seen by its accepted predecessor");
      }
    } else if (committed.state.accepted_compile) {
      if (manifest.kind !== "bootstrap") {
        fail("an unavailable accepted predecessor can only be replaced by an explicit bootstrap");
      }
    } else if (manifest.kind !== "bootstrap" && manifest.kind !== "initial") {
      fail("the first accepted feedback compile must be a bootstrap or initial manifest");
    }

    assertReproducibleCompile(
      root,
      worldRoot,
      options.expectedCommit,
      committed.state,
      pointer,
      loaded,
      priorBundle,
    );

    const seen = new Set(manifest.corpus.seen_report_ids);
    if (playtest && seen.has(playtest.reportId)) {
      fail("the current cycle report cannot be consumed before its outer-gate acceptance");
    }
    const validPendingRefs = new Set(
      pendingAcceptedCycleReportPaths(root, committed.state, sha256File),
    );
    for (const entry of pending) {
      if (
        seen.has(entry.report_id) &&
        !validPendingRefs.has(acceptedCycleReportRef(entry.run_id))
      ) {
        fail(`pending report ${entry.run_id} is missing or hash-mismatched but marked consumed`);
      }
    }
    pending = pending.filter((entry) => !seen.has(entry.report_id));

    const manifestMatch = MANIFEST_REF_RE.exec(pointer.manifest_path)!;
    const hotspotsPath = `ai-runs/feedback/${manifestMatch[1]!}/hotspots.json`;
    const candidateState: FeedbackAcceptanceState = {
      schema_version: 1,
      accepted_compile: {
        manifest_path: pointer.manifest_path,
        manifest_sha256: pointer.manifest_sha256,
        hotspots_path: hotspotsPath,
        hotspots_sha256: manifest.outputs.hotspots_sha256,
        consumed_by_run_id: null,
      },
      pending_cycle_reports: pending,
    };
    if (!loadAcceptedFeedbackBundle(root, candidateState)) {
      fail("feedback compile outputs do not match the promoted manifest");
    }
    acceptedCompile = candidateState.accepted_compile;
    promotedManifestPath = pointer.manifest_path;
  }

  // A cycle that played nothing queues nothing. It still owns the rest of the seal —
  // the acceptance marker, an accompanying compile promotion, the frozen selection —
  // so the pending ledger simply keeps whatever the committed state already carried.
  if (playtest) {
    const sealed = playtest;
    if (pending.some((entry) => entry.run_id === runId)) {
      fail(`cycle ${runId} is already pending in the committed acceptance state`);
    }
    if (pending.some((entry) => entry.report_id === sealed.reportId)) {
      fail(`cycle report identity ${sealed.reportId} is already pending under another run`);
    }
    pending.push({
      run_id: runId,
      tested_commit: options.expectedCommit,
      report_id: sealed.reportId,
      report_sha256: sha256Bytes(sealed.reportBytes),
      evidence_sha256: sha256Bytes(sealed.evidenceBytes),
      sidecar_sha256: sha256Bytes(sealed.sidecarBytes),
    });
  }
  pending.sort(
    (a, b) => a.run_id.localeCompare(b.run_id) || a.report_id.localeCompare(b.report_id),
  );

  const nextState = FeedbackAcceptanceStateSchema.parse({
    schema_version: 1,
    accepted_compile: acceptedCompile,
    pending_cycle_reports: pending,
  });
  const nextText = removeFeedbackCycleSelectionMarker(
    upsertFeedbackAcceptanceStateText(stateText, nextState),
    runId,
  );
  for (const [ref, before, label] of stableArtifacts) {
    if (sha256Bytes(readContainedRegularBytes(root, ref, label)) !== sha256Bytes(before)) {
      fail(`${label} changed before the feedback acceptance marker was sealed`);
    }
  }
  if (
    nextState.accepted_compile &&
    (priorBundle || promotedManifestPath) &&
    !loadAcceptedFeedbackBundle(root, nextState)
  ) {
    fail("the accepted feedback compile changed before its marker was sealed");
  }
  atomicWriteLoopState(statePath, stateText, nextText);

  return {
    runId,
    reportId: playtest?.reportId ?? null,
    promotedManifestPath,
    consumedRecommendation,
    pendingReports: pending.length,
  };
}

function valueOf(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function main(): void {
  const argv = process.argv.slice(2);
  const known = new Set(["--meta", "--expected-commit", "--start-ref"]);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!flag || !known.has(flag) || argv[index + 1] === undefined) {
      console.error(
        "usage: seal-feedback-acceptance --meta <latest-cycle.json> --expected-commit <full-sha> --start-ref <full-sha>",
      );
      process.exit(2);
    }
  }
  let expectedCommit = valueOf(argv, "--expected-commit");
  if (expectedCommit === undefined) {
    try {
      expectedCommit = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: process.cwd(),
        encoding: "utf8",
      }).trim();
    } catch (error) {
      console.error(`feedback acceptance seal rejected: cannot resolve HEAD: ${String(error)}`);
      process.exit(2);
    }
  }
  const startRef = valueOf(argv, "--start-ref");
  if (startRef === undefined) {
    console.error("feedback acceptance seal requires --start-ref <full-sha>");
    process.exit(2);
  }
  try {
    const result = sealFeedbackAcceptance({
      metadataPath: valueOf(argv, "--meta") ?? "ai-runs/latest-cycle.json",
      expectedCommit,
      startRef,
    });
    console.log(
      `✓ sealed feedback acceptance for ${result.runId}: ${result.pendingReports} pending report${result.pendingReports === 1 ? "" : "s"}`,
    );
    if (result.reportId === null) {
      // Say it out loud. An empty playtest slot is a normal state now, but a silent
      // seal would read identically to one that quietly dropped real evidence.
      console.log("  (no cycle playtest artifacts — sealed the acceptance marker alone)");
    }
    if (result.promotedManifestPath) {
      console.log(`✓ promoted feedback compile: ${result.promotedManifestPath}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(5);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
