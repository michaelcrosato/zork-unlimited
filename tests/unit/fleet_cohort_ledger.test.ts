import { spawnSync } from "node:child_process";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  acquireFleetCohortLease,
  assertFleetCohortOverlapAllowed,
  canonicalFleetJson,
  createFleetCohort,
  createFleetCohortIntentAudit,
  findFleetCohortOverlaps,
  publishFleetCohortIntent,
  releaseFleetCohortLease,
  resolveFleetCohortRegistry,
  scanFleetCohortIntents,
  // @ts-expect-error — plain .mjs module without type declarations
} from "../../blind-tester/fleet-cohort-ledger.mjs";
import {
  beginLiveFleetCohortStartup,
  // @ts-expect-error — plain .mjs module without type declarations
} from "../../blind-tester/fleet.mjs";

const COMMIT = "a".repeat(40);
const WORLD = "b".repeat(64);
const AUTHORITY = "c".repeat(64);

function git(root: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function makeGitRepository(): { base: string; root: string } {
  const base = mkdtempSync(join(tmpdir(), "af-fleet-cohort-ledger-"));
  const root = join(base, "repo");
  mkdirSync(root);
  git(root, "init");
  git(root, "config", "user.email", "fleet-ledger@example.invalid");
  git(root, "config", "user.name", "Fleet Ledger Test");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, "add", "README.md");
  git(root, "commit", "-m", "fixture");
  return { base, root };
}

function cohort(seedBase: number, count = 2) {
  return createFleetCohort(
    Array.from({ length: count }, (_, index) => ({
      seed: seedBase + index,
      provider: "codex",
      model: "gpt-5.6-terra",
      persona: "default",
      target: "overworld",
    })),
    {
      git_commit: COMMIT,
      tracked_worktree_clean: true,
      world_id: "overworld",
      world_hash: WORLD,
    },
    { authority_sha256: AUTHORITY, cli_version: "1.2.3" },
    3,
  );
}

function audit(
  root: string,
  value: ReturnType<typeof cohort>,
  duplicateOverride: string | null = null,
  overlaps: unknown[] = [],
) {
  return createFleetCohortIntentAudit({
    stamp: "20260728T120000Z",
    label: "test-ledger",
    canonicalWorktree: resolve(root),
    duplicateOverride,
    overlaps,
    cohort: value,
  });
}

function startupAudit(root: string, label: string) {
  return {
    stamp: "20260728T120000Z",
    label,
    canonicalWorktree: resolve(root),
  };
}

function expectNoPreIntentResidue(root: string, fleetDir: string) {
  const registry = resolveFleetCohortRegistry(root);
  expect(existsSync(join(registry, "active-fleet.lock"))).toBe(false);
  expect(readdirSync(join(registry, "intents"))).toEqual([]);
  expect(existsSync(fleetDir)).toBe(false);
}

function publish(root: string, value: ReturnType<typeof cohort>, intentId: string) {
  const lease = acquireFleetCohortLease(root, value);
  try {
    return {
      lease,
      published: publishFleetCohortIntent(lease, value, { intentId, audit: audit(root, value) }),
    };
  } finally {
    releaseFleetCohortLease(lease);
  }
}

describe("fleet cohort fingerprints", () => {
  it("canonicalizes exact member and cohort fingerprints independently of object-key order", () => {
    expect(canonicalFleetJson({ z: [true, { b: 2, a: 1 }], a: null })).toBe(
      '{"a":null,"z":[true,{"a":1,"b":2}]}',
    );
    const first = cohort(100);
    const same = cohort(100);
    const next = cohort(101);
    expect(first.fingerprint).toBe(same.fingerprint);
    expect(first.members.map((member: { fingerprint: string }) => member.fingerprint)).toEqual(
      same.members.map((member: { fingerprint: string }) => member.fingerprint),
    );
    expect(first.fingerprint).not.toBe(next.fingerprint);
    expect(first.members[1]!.fingerprint).toBe(next.members[0]!.fingerprint);
  });

  it("rejects an active lease even if it looks dead, with no override path", () => {
    const { base, root } = makeGitRepository();
    const value = cohort(200);
    try {
      const first = acquireFleetCohortLease(root, value);
      expect(() => acquireFleetCohortLease(root, value)).toThrow(
        /active fleet lease already exists/i,
      );
      releaseFleetCohortLease(first);

      writeFileSync(first.path, '{"pid":-999,"started":"yesterday"}\n', { mode: 0o600 });
      expect(() => acquireFleetCohortLease(root, value)).toThrow(
        /active fleet lease already exists/i,
      );
      expect(readFileSync(first.path, "utf8")).toContain("-999");
      unlinkSync(first.path);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("will not let an old owner release a manually recreated same-cohort lease", () => {
    const { base, root } = makeGitRepository();
    const value = cohort(250);
    try {
      const oldLease = acquireFleetCohortLease(root, value);
      unlinkSync(oldLease.path);
      const replacement = acquireFleetCohortLease(root, value);
      expect(replacement.leaseToken).not.toBe(oldLease.leaseToken);
      expect(() => scanFleetCohortIntents(oldLease)).toThrow(/lease changed/i);
      expect(() =>
        publishFleetCohortIntent(oldLease, value, {
          intentId: "f".repeat(32),
          audit: audit(root, value),
        }),
      ).toThrow(/lease changed/i);
      expect(() => releaseFleetCohortLease(oldLease)).toThrow(/lease changed/i);
      expect(existsSync(replacement.path)).toBe(true);
      releaseFleetCohortLease(replacement);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("revalidates lease ownership immediately before atomic publication", () => {
    const { base, root } = makeGitRepository();
    const value = cohort(275);
    let replacement: ReturnType<typeof acquireFleetCohortLease> | null = null;
    try {
      const oldLease = acquireFleetCohortLease(root, value);
      expect(() =>
        publishFleetCohortIntent(oldLease, value, {
          intentId: "d".repeat(32),
          audit: audit(root, value),
          beforeAtomicPublish: () => {
            unlinkSync(oldLease.path);
            replacement = acquireFleetCohortLease(root, value);
          },
        }),
      ).toThrow(/lease changed/i);
      expect(replacement).not.toBeNull();
      expect(existsSync(join(replacement!.intentsDirectory, `${"d".repeat(32)}.json`))).toBe(false);
      releaseFleetCohortLease(replacement!);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("does not let one cohort's held lease publish another cohort's intent", () => {
    const { base, root } = makeGitRepository();
    const held = cohort(280);
    const other = cohort(290);
    try {
      const lease = acquireFleetCohortLease(root, held);
      try {
        expect(() =>
          publishFleetCohortIntent(lease, other, {
            intentId: "c".repeat(32),
            audit: audit(root, other),
          }),
        ).toThrow(/belongs to a different cohort/i);
        expect(existsSync(join(lease.intentsDirectory, `${"c".repeat(32)}.json`))).toBe(false);
      } finally {
        releaseFleetCohortLease(lease);
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("persisted cohort overlap", () => {
  it("allows only an exact persisted duplicate and writes another immutable complete record", () => {
    const { base, root } = makeGitRepository();
    const exact = cohort(300);
    try {
      const first = publish(root, exact, "1".repeat(32));
      const lease = acquireFleetCohortLease(root, exact);
      try {
        const overlaps = findFleetCohortOverlaps(exact, scanFleetCohortIntents(lease));
        expect(overlaps).toHaveLength(1);
        expect(overlaps[0]!.member_fingerprints).toEqual(
          exact.members.map((member: { fingerprint: string }) => member.fingerprint),
        );
        expect(() => assertFleetCohortOverlapAllowed(exact, overlaps, null)).toThrow(
          /persisted cohort overlap/i,
        );
        expect(() =>
          assertFleetCohortOverlapAllowed(exact, overlaps, exact.fingerprint),
        ).not.toThrow();
        expect(() =>
          publishFleetCohortIntent(lease, exact, {
            intentId: "9".repeat(32),
            audit: audit(root, exact),
          }),
        ).toThrow(/persisted cohort overlap/i);

        const auditRecord = audit(root, exact, exact.fingerprint, overlaps);
        const second = publishFleetCohortIntent(lease, exact, {
          intentId: "2".repeat(32),
          audit: auditRecord,
        });
        const record = JSON.parse(readFileSync(second.path, "utf8"));
        expect(record.cohort.fingerprint).toBe(exact.fingerprint);
        expect(record.cohort.members).toEqual(exact.members);
        expect(record.audit).toEqual(auditRecord);
        expect(first.published.path).not.toBe(second.path);

        const tampered = JSON.parse(readFileSync(second.path, "utf8"));
        tampered.audit.overlaps[0].cohort_fingerprint = "0".repeat(64);
        writeFileSync(second.path, `${canonicalFleetJson(tampered)}\n`, { mode: 0o600 });
        expect(() => scanFleetCohortIntents(lease)).toThrow(
          /does not match the current exact cohort/i,
        );
      } finally {
        releaseFleetCohortLease(lease);
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("rejects partial and superset intersections even with the current fingerprint", () => {
    const { base, root } = makeGitRepository();
    const existing = cohort(400, 2);
    try {
      publish(root, existing, "3".repeat(32));
      for (const candidate of [cohort(400, 1), cohort(400, 3)]) {
        const lease = acquireFleetCohortLease(root, candidate);
        try {
          const overlaps = findFleetCohortOverlaps(candidate, scanFleetCohortIntents(lease));
          expect(overlaps).toHaveLength(1);
          expect(() => assertFleetCohortOverlapAllowed(candidate, overlaps, null)).toThrow(
            /partial or superset/i,
          );
          expect(() =>
            assertFleetCohortOverlapAllowed(candidate, overlaps, candidate.fingerprint),
          ).toThrow(/partial or superset/i);
        } finally {
          releaseFleetCohortLease(lease);
        }
      }

      const partial = cohort(400, 1);
      const lease = acquireFleetCohortLease(root, partial);
      try {
        const fabricatedAudit = {
          stamp: "20260728T120000Z",
          label: "direct-partial",
          canonical_worktree: resolve(root),
          duplicate_override: partial.fingerprint,
          overlaps: [
            {
              intent_id: "f".repeat(32),
              cohort_fingerprint: partial.fingerprint,
              member_fingerprints: partial.members
                .map((member: { fingerprint: string }) => member.fingerprint)
                .sort(),
            },
          ],
        };
        expect(() =>
          publishFleetCohortIntent(lease, partial, {
            intentId: "e".repeat(32),
            audit: fabricatedAudit,
          }),
        ).toThrow(/partial or superset/i);
      } finally {
        releaseFleetCohortLease(lease);
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("rejects an override when no persisted overlap exists or when it is not exact", () => {
    const { base, root } = makeGitRepository();
    const value = cohort(500);
    try {
      const lease = acquireFleetCohortLease(root, value);
      try {
        expect(() => assertFleetCohortOverlapAllowed(value, [], value.fingerprint)).toThrow(
          /only for a persisted overlap/i,
        );
      } finally {
        releaseFleetCohortLease(lease);
      }
      publish(root, value, "4".repeat(32));
      const retry = acquireFleetCohortLease(root, value);
      try {
        const overlaps = findFleetCohortOverlaps(value, scanFleetCohortIntents(retry));
        expect(() => assertFleetCohortOverlapAllowed(value, overlaps, "0".repeat(64))).toThrow(
          /only --allow-duplicate-cohort/i,
        );
      } finally {
        releaseFleetCohortLease(retry);
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("ledger filesystem integrity", () => {
  it("fails closed for corrupt, unexpected, linked, and symlinked intent entries", () => {
    const { base, root } = makeGitRepository();
    const value = cohort(600);
    try {
      const seeded = publish(root, value, "5".repeat(32));
      const intents = join(seeded.lease.intentsDirectory);

      const corrupt = join(intents, `${"6".repeat(32)}.json`);
      writeFileSync(corrupt, '{"schema_version":1}\n', { mode: 0o600 });
      let lease = acquireFleetCohortLease(root, value);
      try {
        expect(() => scanFleetCohortIntents(lease)).toThrow(/unexpected or missing fields/i);
      } finally {
        releaseFleetCohortLease(lease);
      }
      unlinkSync(corrupt);

      writeFileSync(join(intents, "interrupted.tmp"), "private residue\n", { mode: 0o600 });
      lease = acquireFleetCohortLease(root, value);
      try {
        expect(() => scanFleetCohortIntents(lease)).toThrow(/unexpected entry/i);
      } finally {
        releaseFleetCohortLease(lease);
      }
      unlinkSync(join(intents, "interrupted.tmp"));

      const hardLinked = join(intents, `${"7".repeat(32)}.json`);
      linkSync(seeded.published.path, hardLinked);
      lease = acquireFleetCohortLease(root, value);
      try {
        expect(() => scanFleetCohortIntents(lease)).toThrow(/unlinked regular file/i);
      } finally {
        releaseFleetCohortLease(lease);
      }
      unlinkSync(hardLinked);

      const symlinked = join(intents, `${"8".repeat(32)}.json`);
      try {
        symlinkSync(seeded.published.path, symlinked, "file");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EPERM" && code !== "EACCES" && code !== "ENOSYS") throw error;
        return;
      }
      lease = acquireFleetCohortLease(root, value);
      try {
        expect(() => scanFleetCohortIntents(lease)).toThrow(/unlinked regular file/i);
      } finally {
        releaseFleetCohortLease(lease);
      }
      unlinkSync(symlinked);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("uses one Git-common registry for linked worktrees and rejects non-Git roots", () => {
    const { base, root } = makeGitRepository();
    const linked = join(base, "linked");
    const nonGit = mkdtempSync(join(tmpdir(), "af-fleet-no-git-"));
    try {
      git(root, "worktree", "add", "--detach", linked, "HEAD");
      expect(resolveFleetCohortRegistry(linked)).toBe(resolveFleetCohortRegistry(root));
      const lease = acquireFleetCohortLease(root, cohort(700));
      try {
        expect(() => acquireFleetCohortLease(linked, cohort(700))).toThrow(/active fleet lease/i);
      } finally {
        releaseFleetCohortLease(lease);
      }
      expect(() => resolveFleetCohortRegistry(nonGit)).toThrow(/Git worktree root/i);
    } finally {
      rmSync(base, { recursive: true, force: true });
      rmSync(nonGit, { recursive: true, force: true });
    }
  });
});

describe("live fleet startup ledger ordering", () => {
  it("takes the lease before reports, publishes intent before returning, then releases report lock before lease", () => {
    const { base, root } = makeGitRepository();
    const value = cohort(800);
    const reports = join(root, "reports");
    const fleetDir = join(root, "ai-runs", "fleet", "fresh");
    const trace: string[] = [];
    const reportLock = { held: true };
    try {
      const startup = beginLiveFleetCohortStartup({
        root,
        cohort: value,
        intentAudit: {
          stamp: "20260728T120000Z",
          label: "startup-order",
          canonicalWorktree: resolve(root),
        },
        allowDuplicateCohort: null,
        createReportsDirectory: () => {
          trace.push("reports");
          expect(existsSync(join(resolveFleetCohortRegistry(root), "active-fleet.lock"))).toBe(
            true,
          );
          mkdirSync(reports);
        },
        acquireReportLock: () => {
          trace.push("report-lock");
          return reportLock;
        },
        releaseReportLock: (lock: typeof reportLock) => {
          expect(lock).toBe(reportLock);
          trace.push("report-release");
        },
        validateLocalFleetLabel: () => {
          trace.push("label");
          mkdirSync(join(root, "ai-runs", "fleet"), { recursive: true });
        },
        createLocalFleetDirectory: () => {
          trace.push("local-dir");
          mkdirSync(fleetDir);
          return fleetDir;
        },
      });
      expect(trace).toEqual(["reports", "report-lock", "label", "local-dir"]);
      expect(existsSync(startup.intent.path)).toBe(true);
      startup.release();
      expect(trace).toEqual(["reports", "report-lock", "label", "local-dir", "report-release"]);
      expect(existsSync(join(resolveFleetCohortRegistry(root), "active-fleet.lock"))).toBe(false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("rolls back only an unpublished empty local directory before report-lock then lease release", () => {
    const { base, root } = makeGitRepository();
    const value = cohort(900);
    const fleetDir = join(root, "ai-runs", "fleet", "rollback");
    const trace: string[] = [];
    try {
      expect(() =>
        beginLiveFleetCohortStartup({
          root,
          cohort: value,
          intentAudit: {
            stamp: "20260728T120000Z",
            label: "startup-rollback",
            canonicalWorktree: resolve(root),
          },
          allowDuplicateCohort: null,
          createReportsDirectory: () => trace.push("reports"),
          acquireReportLock: () => {
            trace.push("report-lock");
            return { held: true };
          },
          releaseReportLock: () => trace.push("report-release"),
          validateLocalFleetLabel: () => {
            trace.push("label");
            mkdirSync(join(root, "ai-runs", "fleet"), { recursive: true });
          },
          createLocalFleetDirectory: () => {
            trace.push("local-dir");
            mkdirSync(fleetDir);
            return fleetDir;
          },
          publishIntent: () => {
            trace.push("intent");
            throw new Error("injected publication failure");
          },
        }),
      ).toThrow(/injected publication failure/i);
      expect(trace).toEqual([
        "reports",
        "report-lock",
        "label",
        "local-dir",
        "intent",
        "report-release",
      ]);
      expect(existsSync(fleetDir)).toBe(false);
      expect(existsSync(join(resolveFleetCohortRegistry(root), "active-fleet.lock"))).toBe(false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it.each(["reports-mkdir", "report-lock"])(
    "releases the lease without intent or local directory when %s fails",
    (failurePoint) => {
      const { base, root } = makeGitRepository();
      const value = cohort(failurePoint === "reports-mkdir" ? 910 : 911);
      const fleetDir = join(root, "ai-runs", "fleet", failurePoint);
      try {
        expect(() =>
          beginLiveFleetCohortStartup({
            root,
            cohort: value,
            intentAudit: startupAudit(root, failurePoint),
            allowDuplicateCohort: null,
            createReportsDirectory: () => {
              if (failurePoint === "reports-mkdir")
                throw new Error("injected reports mkdir failure");
            },
            acquireReportLock: () => {
              if (failurePoint === "report-lock") throw new Error("injected report lock failure");
              return { held: true };
            },
            releaseReportLock: () => undefined,
            validateLocalFleetLabel: () => undefined,
            createLocalFleetDirectory: () => {
              mkdirSync(fleetDir, { recursive: true });
              return fleetDir;
            },
          }),
        ).toThrow(/injected (reports mkdir|report lock) failure/i);
        expectNoPreIntentResidue(root, fleetDir);
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    },
  );

  it("releases report lock then lease for a pre-intent label rejection", () => {
    const { base, root } = makeGitRepository();
    const value = cohort(920);
    const fleetDir = join(root, "ai-runs", "fleet", "label-rejected");
    const trace: string[] = [];
    try {
      expect(() =>
        beginLiveFleetCohortStartup({
          root,
          cohort: value,
          intentAudit: startupAudit(root, "label-rejected"),
          allowDuplicateCohort: null,
          createReportsDirectory: () => trace.push("reports"),
          acquireReportLock: () => {
            trace.push("report-lock");
            return { held: true };
          },
          releaseReportLock: () => trace.push("report-release"),
          validateLocalFleetLabel: () => {
            trace.push("label");
            throw new Error("injected label rejection");
          },
          createLocalFleetDirectory: () => {
            mkdirSync(fleetDir, { recursive: true });
            return fleetDir;
          },
        }),
      ).toThrow(/injected label rejection/i);
      expect(trace).toEqual(["reports", "report-lock", "label", "report-release"]);
      expectNoPreIntentResidue(root, fleetDir);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("still releases the active lease when report-lock release fails after intent publication", () => {
    const { base, root } = makeGitRepository();
    const value = cohort(930);
    const fleetDir = join(root, "ai-runs", "fleet", "release-failure");
    try {
      const startup = beginLiveFleetCohortStartup({
        root,
        cohort: value,
        intentAudit: startupAudit(root, "release-failure"),
        allowDuplicateCohort: null,
        createReportsDirectory: () => undefined,
        acquireReportLock: () => ({ held: true }),
        releaseReportLock: () => {
          throw new Error("injected report release failure");
        },
        validateLocalFleetLabel: () => undefined,
        createLocalFleetDirectory: () => {
          mkdirSync(fleetDir, { recursive: true });
          return fleetDir;
        },
      });
      expect(() => startup.release()).toThrow(/injected report release failure/i);
      expect(existsSync(join(resolveFleetCohortRegistry(root), "active-fleet.lock"))).toBe(false);
      expect(existsSync(startup.intent.path)).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("reports both normal-release failures after attempting the active lease release", () => {
    const { base, root } = makeGitRepository();
    const value = cohort(940);
    const fleetDir = join(root, "ai-runs", "fleet", "double-release-failure");
    try {
      const startup = beginLiveFleetCohortStartup({
        root,
        cohort: value,
        intentAudit: startupAudit(root, "double-release-failure"),
        allowDuplicateCohort: null,
        createReportsDirectory: () => undefined,
        acquireReportLock: () => ({ held: true }),
        releaseReportLock: () => {
          throw new Error("injected report release failure");
        },
        releaseCohortLease: (lease: unknown) => {
          releaseFleetCohortLease(lease);
          throw new Error("injected lease release failure");
        },
        validateLocalFleetLabel: () => undefined,
        createLocalFleetDirectory: () => {
          mkdirSync(fleetDir, { recursive: true });
          return fleetDir;
        },
      });
      let failure: unknown;
      try {
        startup.release();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors.map((error) => (error as Error).message)).toEqual([
        "injected report release failure",
        "injected lease release failure",
      ]);
      expect(existsSync(join(resolveFleetCohortRegistry(root), "active-fleet.lock"))).toBe(false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("retries only a transiently unreleased lease after the report lock already released", () => {
    const { base, root } = makeGitRepository();
    const value = cohort(950);
    const fleetDir = join(root, "ai-runs", "fleet", "lease-retry");
    let reportReleaseAttempts = 0;
    let leaseReleaseAttempts = 0;
    try {
      const startup = beginLiveFleetCohortStartup({
        root,
        cohort: value,
        intentAudit: startupAudit(root, "lease-retry"),
        allowDuplicateCohort: null,
        createReportsDirectory: () => undefined,
        acquireReportLock: () => ({ held: true }),
        releaseReportLock: () => {
          reportReleaseAttempts += 1;
        },
        releaseCohortLease: (lease: unknown) => {
          leaseReleaseAttempts += 1;
          if (leaseReleaseAttempts === 1)
            throw new Error("injected transient lease release failure");
          releaseFleetCohortLease(lease);
        },
        validateLocalFleetLabel: () => undefined,
        createLocalFleetDirectory: () => {
          mkdirSync(fleetDir, { recursive: true });
          return fleetDir;
        },
      });
      expect(() => startup.release()).toThrow(/transient lease release failure/i);
      expect(reportReleaseAttempts).toBe(1);
      expect(leaseReleaseAttempts).toBe(1);
      expect(existsSync(join(resolveFleetCohortRegistry(root), "active-fleet.lock"))).toBe(true);

      expect(() => startup.release()).not.toThrow();
      expect(reportReleaseAttempts).toBe(1);
      expect(leaseReleaseAttempts).toBe(2);
      expect(existsSync(join(resolveFleetCohortRegistry(root), "active-fleet.lock"))).toBe(false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
