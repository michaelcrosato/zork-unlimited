/**
 * Fail-closed, Git-common ledger for live pure fleet cohorts.
 *
 * A live fleet holds a short active lease while it starts, then writes one
 * immutable intent. The lease prevents concurrent starts; persisted intents
 * prevent a later linked worktree from accidentally replaying overlapping
 * member identities. There is deliberately no PID probing or stale recovery.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseJsonRejectingDuplicateKeys } from "./strict-json.mjs";

export const FLEET_COHORT_LEDGER_DIRECTORY = "adventureforge-fleet-cohort-ledger";
export const FLEET_COHORT_LEDGER_SCHEMA_VERSION = 1;
const ACTIVE_LEASE_NAME = "active-fleet.lock";
const INTENTS_DIRECTORY_NAME = "intents";
const FINGERPRINT = /^[a-f0-9]{64}$/u;
const INTENT_ID = /^[a-f0-9]{32}$/u;
const INTENT_FILENAME = /^[a-f0-9]{32}\.json$/u;
const UNSUPPORTED_DIRECTORY_SYNC_CODES = new Set([
  "EBADF",
  "EISDIR",
  "EINVAL",
  "ENOSYS",
  "ENOTSUP",
  "EPERM",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, label, keys) {
  if (!isPlainObject(value)) throw new Error(`fleet ledger: ${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`fleet ledger: ${label} has unexpected or missing fields`);
  }
}

/** Serialize JSON with a recursively sorted object-key order. Fingerprints and
 * persisted records use this exact representation, making identities portable
 * across Node versions and linked worktrees. */
export function canonicalFleetJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("fleet ledger: canonical JSON rejects non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalFleetJson(item)).join(",")}]`;
  if (!isPlainObject(value))
    throw new Error("fleet ledger: canonical JSON accepts only plain JSON values");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalFleetJson(value[key])}`)
    .join(",")}}`;
}

function sha256Canonical(value) {
  return createHash("sha256").update(canonicalFleetJson(value), "utf8").digest("hex");
}

function assertBuildIdentity(build) {
  assertExactKeys(build, "member build", [
    "git_commit",
    "tracked_worktree_clean",
    "world_hash",
    "world_id",
  ]);
  if (
    !/^[a-f0-9]{40}$/u.test(build.git_commit) ||
    build.tracked_worktree_clean !== true ||
    typeof build.world_id !== "string" ||
    build.world_id.length === 0 ||
    !FINGERPRINT.test(build.world_hash)
  ) {
    throw new Error("fleet ledger: member build identity is invalid");
  }
}

function assertClientIdentity(client) {
  assertExactKeys(client, "member client", ["authority_sha256", "cli_version"]);
  if (
    !FINGERPRINT.test(client.authority_sha256) ||
    typeof client.cli_version !== "string" ||
    !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(client.cli_version)
  ) {
    throw new Error("fleet ledger: member client identity is invalid");
  }
}

function assertMemberIdentity(identity) {
  assertExactKeys(identity, "member identity", [
    "build",
    "client",
    "model",
    "persona",
    "provider",
    "schema_version",
    "seed",
    "session_contract_version",
    "target",
  ]);
  if (
    identity.schema_version !== FLEET_COHORT_LEDGER_SCHEMA_VERSION ||
    !Number.isSafeInteger(identity.seed) ||
    !Number.isSafeInteger(identity.session_contract_version) ||
    identity.session_contract_version < 1 ||
    typeof identity.provider !== "string" ||
    identity.provider.length === 0 ||
    typeof identity.model !== "string" ||
    identity.model.length === 0 ||
    typeof identity.persona !== "string" ||
    identity.persona.length === 0 ||
    typeof identity.target !== "string" ||
    identity.target.length === 0
  ) {
    throw new Error("fleet ledger: member identity is invalid");
  }
  assertBuildIdentity(identity.build);
  assertClientIdentity(identity.client);
}

function memberFingerprint(identity) {
  assertMemberIdentity(identity);
  return sha256Canonical(identity);
}

function cohortFingerprint(members) {
  return sha256Canonical({ schema_version: FLEET_COHORT_LEDGER_SCHEMA_VERSION, members });
}

/** Build the exact identity that is both persisted and compared for overlap.
 * The client authority and clean build are deliberately member-bound: a seed
 * is the same live member only when every gameplay-relevant frozen identity is
 * the same. */
export function createFleetCohort(runs, build, client, sessionContractVersion) {
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new Error("fleet ledger: a cohort requires at least one planned member");
  }
  if (!Number.isSafeInteger(sessionContractVersion) || sessionContractVersion < 1) {
    throw new Error("fleet ledger: session contract version must be a positive safe integer");
  }
  assertBuildIdentity(build);
  const clientIdentity = {
    authority_sha256: client?.authority_sha256,
    cli_version: client?.cli_version,
  };
  assertClientIdentity(clientIdentity);
  const members = runs.map((run) => {
    const identity = {
      schema_version: FLEET_COHORT_LEDGER_SCHEMA_VERSION,
      seed: run?.seed,
      provider: run?.provider,
      model: run?.model,
      persona: run?.persona,
      target: run?.target,
      session_contract_version: sessionContractVersion,
      build: {
        git_commit: build.git_commit,
        tracked_worktree_clean: build.tracked_worktree_clean,
        world_id: build.world_id,
        world_hash: build.world_hash,
      },
      client: clientIdentity,
    };
    return { fingerprint: memberFingerprint(identity), identity };
  });
  const fingerprints = new Set(members.map((member) => member.fingerprint));
  if (fingerprints.size !== members.length) {
    throw new Error("fleet ledger: cohort members must have unique exact identities");
  }
  return {
    schema_version: FLEET_COHORT_LEDGER_SCHEMA_VERSION,
    fingerprint: cohortFingerprint(members.map((member) => member.identity)),
    members,
  };
}

function assertCohort(cohort) {
  assertExactKeys(cohort, "cohort", ["fingerprint", "members", "schema_version"]);
  if (
    cohort.schema_version !== FLEET_COHORT_LEDGER_SCHEMA_VERSION ||
    !FINGERPRINT.test(cohort.fingerprint) ||
    !Array.isArray(cohort.members) ||
    cohort.members.length === 0
  ) {
    throw new Error("fleet ledger: cohort is invalid");
  }
  const seen = new Set();
  for (const member of cohort.members) {
    assertExactKeys(member, "cohort member", ["fingerprint", "identity"]);
    if (
      !FINGERPRINT.test(member.fingerprint) ||
      memberFingerprint(member.identity) !== member.fingerprint
    ) {
      throw new Error("fleet ledger: cohort member fingerprint does not match its identity");
    }
    if (seen.has(member.fingerprint)) {
      throw new Error("fleet ledger: cohort contains a duplicate member identity");
    }
    seen.add(member.fingerprint);
  }
  if (cohortFingerprint(cohort.members.map((member) => member.identity)) !== cohort.fingerprint) {
    throw new Error("fleet ledger: cohort fingerprint does not match its members");
  }
}

function assertIntentAudit(audit, cohort) {
  assertExactKeys(audit, "intent audit", [
    "canonical_worktree",
    "duplicate_override",
    "label",
    "overlaps",
    "stamp",
  ]);
  if (
    typeof audit.stamp !== "string" ||
    !/^\d{8}T\d{6}Z$/u.test(audit.stamp) ||
    typeof audit.label !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(audit.label) ||
    typeof audit.canonical_worktree !== "string" ||
    !isAbsolute(audit.canonical_worktree) ||
    resolve(audit.canonical_worktree) !== audit.canonical_worktree ||
    (audit.duplicate_override !== null && !FINGERPRINT.test(audit.duplicate_override)) ||
    !Array.isArray(audit.overlaps)
  ) {
    throw new Error("fleet ledger: intent audit is invalid");
  }
  if (
    (audit.duplicate_override === null) !== (audit.overlaps.length === 0) ||
    (audit.duplicate_override !== null && audit.duplicate_override !== cohort.fingerprint)
  ) {
    throw new Error("fleet ledger: intent audit duplicate override is invalid");
  }
  const currentMembers = cohort.members.map((member) => member.fingerprint).sort();
  let previousIntentId = "";
  for (const overlap of audit.overlaps) {
    assertExactKeys(overlap, "intent audit overlap", [
      "cohort_fingerprint",
      "intent_id",
      "member_fingerprints",
    ]);
    if (
      !INTENT_ID.test(overlap.intent_id) ||
      overlap.intent_id <= previousIntentId ||
      !FINGERPRINT.test(overlap.cohort_fingerprint) ||
      !Array.isArray(overlap.member_fingerprints) ||
      overlap.member_fingerprints.length === 0 ||
      overlap.member_fingerprints.some((fingerprint) => !FINGERPRINT.test(fingerprint))
    ) {
      throw new Error("fleet ledger: intent audit overlap is invalid");
    }
    const sortedMembers = [...overlap.member_fingerprints].sort();
    if (
      sortedMembers.some(
        (fingerprint, index) => fingerprint !== overlap.member_fingerprints[index],
      ) ||
      new Set(sortedMembers).size !== sortedMembers.length
    ) {
      throw new Error("fleet ledger: intent audit overlap members must be unique and sorted");
    }
    if (
      overlap.cohort_fingerprint !== cohort.fingerprint ||
      sortedMembers.length !== currentMembers.length ||
      sortedMembers.some((fingerprint, index) => fingerprint !== currentMembers[index])
    ) {
      throw new Error("fleet ledger: intent audit overlap does not match the current exact cohort");
    }
    previousIntentId = overlap.intent_id;
  }
}

/** Construct the local-only audit portion of an immutable intent. It remains
 * outside the cohort/member fingerprints, so labels and acknowledgements do
 * not redefine what counts as the same live cohort. */
export function createFleetCohortIntentAudit({
  stamp,
  label,
  canonicalWorktree,
  duplicateOverride,
  overlaps,
  cohort,
}) {
  assertCohort(cohort);
  const audit = {
    stamp,
    label,
    canonical_worktree: canonicalWorktree,
    duplicate_override: duplicateOverride ?? null,
    overlaps: overlaps
      .map((overlap) => ({
        intent_id: overlap.intent.record.intent_id,
        cohort_fingerprint: overlap.intent.record.cohort.fingerprint,
        member_fingerprints: [...overlap.member_fingerprints].sort(),
      }))
      .sort((left, right) =>
        left.intent_id < right.intent_id ? -1 : left.intent_id > right.intent_id ? 1 : 0,
      ),
  };
  assertIntentAudit(audit, cohort);
  return audit;
}

function ledgerError(error, message, published = false) {
  const wrapped = new Error(message, { cause: error });
  if (published) wrapped.intentPublished = true;
  return wrapped;
}

function safeDirectory(path, label) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    throw ledgerError(error, `fleet ledger: ${label} is unavailable`);
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`fleet ledger: ${label} must be a real directory`);
  }
}

function safeRegularFile(path, label) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    throw ledgerError(error, `fleet ledger: ${label} is unavailable`);
  }
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) {
    throw new Error(`fleet ledger: ${label} must be an unlinked regular file`);
  }
  return stat;
}

function syncFile(path, label) {
  let descriptor;
  try {
    // Windows requires a writable descriptor for FlushFileBuffers/fsync even
    // though this function performs no write after the exclusive creation.
    descriptor = openSync(path, "r+");
    fsyncSync(descriptor);
  } catch (error) {
    throw ledgerError(error, `fleet ledger: could not sync ${label}`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function syncDirectory(path) {
  let descriptor;
  try {
    descriptor = openSync(path, "r");
    fsyncSync(descriptor);
  } catch (error) {
    const code = error && typeof error === "object" ? error.code : undefined;
    if (!UNSUPPORTED_DIRECTORY_SYNC_CODES.has(code)) {
      throw ledgerError(error, "fleet ledger: could not sync ledger directory");
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/** Resolve one registry shared by all worktrees in a Git repository. A
 * non-Git directory is deliberately an error: falling back to a worktree-local
 * location would silently defeat the cross-worktree protection. */
export function resolveFleetCohortRegistry(root) {
  const worktree = resolve(root);
  const canonicalWorktree = realpathSync.native(worktree);
  const gitEnvironment = { ...process.env };
  delete gitEnvironment.GIT_DIR;
  delete gitEnvironment.GIT_WORK_TREE;
  delete gitEnvironment.GIT_COMMON_DIR;
  let gitOutput;
  try {
    gitOutput = execFileSync(
      "git",
      [
        "-C",
        canonicalWorktree,
        "rev-parse",
        "--is-inside-work-tree",
        "--show-toplevel",
        "--git-common-dir",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: gitEnvironment,
      },
    );
  } catch (error) {
    throw ledgerError(
      error,
      "fleet ledger: live cohorts require a Git worktree root with a common directory",
    );
  }
  const lines = gitOutput.trim().split(/\r?\n/u);
  if (lines.length !== 3 || lines[0] !== "true" || lines[1] === "" || lines[2] === "") {
    throw new Error("fleet ledger: Git returned an invalid common directory");
  }
  if (realpathSync.native(resolve(lines[1])) !== canonicalWorktree) {
    throw new Error("fleet ledger: root must be the exact Git worktree root");
  }
  // Git's top-level proof above is authoritative; this local marker is a
  // defense-in-depth check against a strange filesystem substitution.
  const worktreeGitMarker = lstatSync(join(canonicalWorktree, ".git"));
  if (
    worktreeGitMarker.isSymbolicLink() ||
    (!worktreeGitMarker.isDirectory() && !worktreeGitMarker.isFile())
  ) {
    throw new Error("fleet ledger: live cohorts require a real Git worktree marker");
  }
  const commonDirectory = isAbsolute(lines[2])
    ? resolve(lines[2])
    : resolve(canonicalWorktree, lines[2]);
  safeDirectory(commonDirectory, "Git common directory");
  return join(commonDirectory, FLEET_COHORT_LEDGER_DIRECTORY);
}

function createOrValidateDirectory(path, label) {
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if (!(error && typeof error === "object" && error.code === "EEXIST")) {
      throw ledgerError(error, `fleet ledger: could not create ${label}`);
    }
  }
  safeDirectory(path, label);
}

function prepareRegistry(registry) {
  createOrValidateDirectory(registry, "registry");
  const intentsDirectory = join(registry, INTENTS_DIRECTORY_NAME);
  createOrValidateDirectory(intentsDirectory, "intent directory");
  return intentsDirectory;
}

function leasePayload(cohort, leaseToken) {
  if (!INTENT_ID.test(leaseToken)) throw new Error("fleet ledger: lease token is invalid");
  return `${canonicalFleetJson({
    schema_version: FLEET_COHORT_LEDGER_SCHEMA_VERSION,
    cohort_fingerprint: cohort.fingerprint,
    lease_token: leaseToken,
  })}\n`;
}

function assertLeasePayload(payload, expectedCohortFingerprint, expectedLeaseToken) {
  const parsed = parseJsonRejectingDuplicateKeys(payload, "fleet ledger active lease");
  if (!parsed.ok) throw new Error(`fleet ledger: ${parsed.reason}`);
  assertExactKeys(parsed.value, "active fleet lease", [
    "cohort_fingerprint",
    "lease_token",
    "schema_version",
  ]);
  if (
    parsed.value.schema_version !== FLEET_COHORT_LEDGER_SCHEMA_VERSION ||
    parsed.value.cohort_fingerprint !== expectedCohortFingerprint ||
    parsed.value.lease_token !== expectedLeaseToken ||
    !FINGERPRINT.test(parsed.value.cohort_fingerprint) ||
    !INTENT_ID.test(parsed.value.lease_token) ||
    payload !== `${canonicalFleetJson(parsed.value)}\n`
  ) {
    throw new Error("fleet ledger: active fleet lease changed; refusing to remove it");
  }
}

function assertOwnedFleetCohortLease(lease) {
  safeRegularFile(lease.path, "active fleet lease");
  const payload = readFileSync(lease.path, "utf8");
  assertLeasePayload(payload, lease.cohortFingerprint, lease.leaseToken);
}

/** Acquire the active lease with O_EXCL semantics. An existing path always
 * rejects; we intentionally never read it for PID liveness, timestamps, or an
 * override token. */
export function acquireFleetCohortLease(root, cohort) {
  assertCohort(cohort);
  const canonicalWorktree = realpathSync.native(resolve(root));
  const registry = resolveFleetCohortRegistry(canonicalWorktree);
  prepareRegistry(registry);
  const path = join(registry, ACTIVE_LEASE_NAME);
  const leaseToken = randomIntentId();
  const payload = leasePayload(cohort, leaseToken);
  const lease = {
    registry,
    intentsDirectory: join(registry, INTENTS_DIRECTORY_NAME),
    path,
    payload,
    leaseToken,
    cohortFingerprint: cohort.fingerprint,
    canonicalWorktree,
  };
  let created = false;
  try {
    writeFileSync(path, payload, { encoding: "utf8", flag: "wx", mode: 0o600 });
    created = true;
    safeRegularFile(path, "active fleet lease");
    syncFile(path, "active fleet lease");
    syncDirectory(registry);
  } catch (error) {
    const cleanupErrors = [];
    if (created) {
      try {
        releaseFleetCohortLease(lease);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        "fleet ledger: active lease acquisition failed and owned rollback could not complete",
        { cause: error },
      );
    }
    if (error && typeof error === "object" && error.code === "EEXIST") {
      throw new Error(
        `fleet ledger: an active fleet lease already exists; do not override it automatically: ${path}`,
        { cause: error },
      );
    }
    throw error;
  }
  return lease;
}

export function releaseFleetCohortLease(lease) {
  assertOwnedFleetCohortLease(lease);
  unlinkSync(lease.path);
  syncDirectory(lease.registry);
}

function parseIntentRecord(path, intentId) {
  safeRegularFile(path, `intent record ${intentId}`);
  const bytes = readFileSync(path, "utf8");
  const parsed = parseJsonRejectingDuplicateKeys(bytes, `fleet ledger intent ${intentId}`);
  if (!parsed.ok) throw new Error(`fleet ledger: ${parsed.reason}`);
  const record = parsed.value;
  assertExactKeys(record, "intent record", ["audit", "cohort", "intent_id", "schema_version"]);
  if (
    record.schema_version !== FLEET_COHORT_LEDGER_SCHEMA_VERSION ||
    record.intent_id !== intentId ||
    !INTENT_ID.test(record.intent_id)
  ) {
    throw new Error("fleet ledger: intent record identity is invalid");
  }
  assertCohort(record.cohort);
  assertIntentAudit(record.audit, record.cohort);
  if (bytes !== `${canonicalFleetJson(record)}\n`) {
    throw new Error("fleet ledger: intent record is not canonically encoded");
  }
  return record;
}

/** Read every immutable intent and reject any malformed, linked, symlinked, or
 * unexpected registry entry. A damaged history is never silently ignored. */
export function scanFleetCohortIntents(lease) {
  assertOwnedFleetCohortLease(lease);
  safeDirectory(lease.registry, "registry");
  safeDirectory(lease.intentsDirectory, "intent directory");
  const registryEntries = readdirSync(lease.registry).sort();
  if (
    registryEntries.some((entry) => entry !== ACTIVE_LEASE_NAME && entry !== INTENTS_DIRECTORY_NAME)
  ) {
    throw new Error("fleet ledger: registry contains an unexpected entry");
  }
  const names = readdirSync(lease.intentsDirectory).sort();
  for (const name of names) {
    if (!INTENT_FILENAME.test(name)) {
      throw new Error("fleet ledger: intent directory contains an unexpected entry");
    }
  }
  return names.map((name) => {
    const intentId = name.slice(0, -".json".length);
    return {
      path: join(lease.intentsDirectory, name),
      record: parseIntentRecord(join(lease.intentsDirectory, name), intentId),
    };
  });
}

export function findFleetCohortOverlaps(cohort, intents) {
  assertCohort(cohort);
  const members = new Set(cohort.members.map((member) => member.fingerprint));
  return intents
    .map((intent) => ({
      intent,
      member_fingerprints: intent.record.cohort.members
        .map((member) => member.fingerprint)
        .filter((fingerprint) => members.has(fingerprint)),
    }))
    .filter((overlap) => overlap.member_fingerprints.length > 0);
}

/** The escape hatch is intentionally narrow: it must repeat this exact current
 * cohort fingerprint and every persisted overlap must itself be that cohort.
 * It is called only after active lease acquisition, so it cannot bypass a live
 * concurrent fleet. */
export function assertFleetCohortOverlapAllowed(cohort, overlaps, allowDuplicateCohort) {
  assertCohort(cohort);
  if (
    allowDuplicateCohort !== null &&
    allowDuplicateCohort !== undefined &&
    !FINGERPRINT.test(allowDuplicateCohort)
  ) {
    throw new Error(
      "fleet ledger: --allow-duplicate-cohort must be one lowercase SHA-256 fingerprint",
    );
  }
  if (overlaps.length === 0) {
    if (allowDuplicateCohort !== null && allowDuplicateCohort !== undefined) {
      throw new Error(
        "fleet ledger: --allow-duplicate-cohort is valid only for a persisted overlap",
      );
    }
    return;
  }
  if (overlaps.some((overlap) => overlap.intent.record.cohort.fingerprint !== cohort.fingerprint)) {
    throw new Error("fleet ledger: partial or superset cohort overlap cannot be overridden");
  }
  if (allowDuplicateCohort !== cohort.fingerprint) {
    throw new Error(
      `fleet ledger: persisted cohort overlap detected; only --allow-duplicate-cohort ${cohort.fingerprint} can acknowledge an exact duplicate`,
    );
  }
}

function randomIntentId() {
  return randomBytes(16).toString("hex");
}

function publishIntentBytes(intentsDirectory, name, bytes) {
  const destination = join(intentsDirectory, name);
  const temporary = join(
    intentsDirectory,
    `.${name}.${process.pid}.${randomBytes(12).toString("hex")}.tmp`,
  );
  let linked = false;
  let failure = null;
  let cleanupFailure = null;
  try {
    writeFileSync(temporary, bytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
    safeRegularFile(temporary, "private intent temporary file");
    syncFile(temporary, "private intent temporary file");
    linkSync(temporary, destination); // POSIX/NTFS no-clobber publication.
    linked = true;
    unlinkSync(temporary);
    safeRegularFile(destination, "published intent record");
    syncDirectory(intentsDirectory);
  } catch (error) {
    if (linked) {
      failure = ledgerError(error, "fleet ledger: intent publication did not fully sync", true);
    } else if (error && typeof error === "object" && error.code === "EEXIST") {
      failure = new Error(
        `fleet ledger: immutable intent destination already exists: ${destination}`,
        {
          cause: error,
        },
      );
    } else {
      failure = error;
    }
  } finally {
    try {
      if (lstatSync(temporary, { throwIfNoEntry: false }) !== undefined) unlinkSync(temporary);
    } catch (error) {
      cleanupFailure = ledgerError(
        error,
        "fleet ledger: could not remove private intent temporary file",
        linked,
      );
    }
  }
  if (failure !== null && cleanupFailure !== null) {
    const aggregate = new AggregateError(
      [failure, cleanupFailure],
      "fleet ledger: intent publication and temporary cleanup both failed",
      { cause: failure },
    );
    if (linked) aggregate.intentPublished = true;
    throw aggregate;
  }
  if (failure !== null) throw failure;
  if (cleanupFailure !== null) throw cleanupFailure;
  return destination;
}

/** Publish exactly one canonical, immutable intent for a startup. `intentId`
 * is injectable only for deterministic tests; production generates 128 bits
 * of entropy and still uses hard-link no-clobber publication. */
export function publishFleetCohortIntent(
  lease,
  cohort,
  { intentId = randomIntentId(), audit = null, beforeAtomicPublish = undefined } = {},
) {
  assertCohort(cohort);
  if (!INTENT_ID.test(intentId)) throw new Error("fleet ledger: intent id is invalid");
  assertIntentAudit(audit, cohort);
  assertOwnedFleetCohortLease(lease);
  if (lease.cohortFingerprint !== cohort.fingerprint) {
    throw new Error("fleet ledger: held active lease belongs to a different cohort");
  }
  if (audit.canonical_worktree !== lease.canonicalWorktree) {
    throw new Error("fleet ledger: intent audit worktree does not match the held lease");
  }
  const overlaps = findFleetCohortOverlaps(cohort, scanFleetCohortIntents(lease));
  assertFleetCohortOverlapAllowed(cohort, overlaps, audit.duplicate_override);
  const expectedAudit = createFleetCohortIntentAudit({
    stamp: audit.stamp,
    label: audit.label,
    canonicalWorktree: lease.canonicalWorktree,
    duplicateOverride: audit.duplicate_override,
    overlaps,
    cohort,
  });
  if (canonicalFleetJson(audit) !== canonicalFleetJson(expectedAudit)) {
    throw new Error("fleet ledger: intent audit does not match current persisted overlap evidence");
  }
  if (beforeAtomicPublish !== undefined && typeof beforeAtomicPublish !== "function") {
    throw new Error("fleet ledger: before-atomic-publish hook must be a function");
  }
  safeDirectory(lease.intentsDirectory, "intent directory");
  const record = {
    schema_version: FLEET_COHORT_LEDGER_SCHEMA_VERSION,
    intent_id: intentId,
    cohort,
    audit,
  };
  // A test-only hook lets the regression suite replace the path after the
  // scan. Production supplies no hook; both paths revalidate immediately
  // before the no-clobber link publication.
  beforeAtomicPublish?.();
  assertOwnedFleetCohortLease(lease);
  const path = publishIntentBytes(
    lease.intentsDirectory,
    `${intentId}.json`,
    `${canonicalFleetJson(record)}\n`,
  );
  return { path, record };
}

/** Remove only a directory this process created before intent publication. It
 * is intentionally a non-recursive rmdir: an unexpected file means ownership
 * is no longer certain and the ledger must leave it for inspection. */
export function removeOwnedEmptyFleetDirectory(path) {
  safeDirectory(path, "new local fleet directory");
  try {
    rmdirSync(path);
  } catch (error) {
    throw ledgerError(error, "fleet ledger: could not remove the empty local fleet directory");
  }
  const parent = dirname(path);
  if (parent === path) throw new Error("fleet ledger: invalid local fleet directory");
}
