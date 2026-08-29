/**
 * The intake queue on disk — one JSON file per submission, tracked in git.
 *
 * Tracked, not gitignored, and that is the point: the dev loop runs against a checkout,
 * so a submission that only exists on the machine that filed it is a submission the dev
 * loop cannot act on. Keeping the queue in the repo also puts a request's whole life —
 * filed, worked, done — next to the commits that closed it, which no external tracker
 * can do.
 *
 * The external tracker (GitHub Issues, see `github.ts`) is a MIRROR of this, not the
 * other way round. That ordering is deliberate: the loop must keep working when the
 * network is down, when a token expires, when someone runs it offline. A queue whose
 * canonical copy lives behind an API is a loop with an outage dependency.
 *
 * Upsert semantics rather than wholesale rewrite: submissions arrive from several
 * independent sources that know nothing about each other, so a writer must be able to
 * add its own without stepping on anyone else's.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { canonicalize } from "../core/hash.js";
import {
  compareSubmissions,
  DEFAULT_QUEUE_DIR,
  isOpenWork,
  SubmissionSchema,
  submissionFileName,
  type Submission,
  type SubmissionPriority,
  type SubmissionSource,
  type SubmissionStatus,
} from "./submission.js";

export function readQueue(dir: string = DEFAULT_QUEUE_DIR): {
  submissions: Submission[];
  unreadable: { file: string; reason: string }[];
} {
  const root = resolve(dir);
  const submissions: Submission[] = [];
  const unreadable: { file: string; reason: string }[] = [];
  if (!existsSync(root)) return { submissions, unreadable };

  for (const name of readdirSync(root).sort()) {
    if (!name.endsWith(".json")) continue;
    const file = join(root, name);
    try {
      submissions.push(SubmissionSchema.parse(JSON.parse(readFileSync(file, "utf8"))));
    } catch (error) {
      // Reported, never skipped silently: a malformed submission is work nobody is
      // seeing, which is the quiet failure this whole queue exists to prevent.
      unreadable.push({ file, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  submissions.sort(compareSubmissions);
  return { submissions, unreadable };
}

/**
 * Add or update one submission, preserving fields the queue owns rather than the caller.
 *
 * `status` and `external` belong to the QUEUE's lifecycle — whoever is working the item,
 * and wherever it is mirrored — not to the source that keeps re-filing it. A playtest
 * loop re-triaging every wave must not reset an item a dev agent already marked
 * `in_progress`, or drop the issue number it was synced to. `created_at` is likewise
 * first-filing, not latest-filing.
 *
 * A re-file that changes nothing is a NO-OP, down to the bytes on disk. These files are
 * tracked, and `loop.sh` runs `qa:triage` (which upserts every actionable ticket) inside
 * the dev cycle AFTER the cycle-start cleanliness check — so an unconditional
 * `updated_at` bump manufactured a tracked-file diff out of an unchanged corpus and left
 * every cycle with a dirty tree it never intended to produce. "Re-filing is safe and
 * expected" (docs/two_loop_workflow.md) has to mean byte-identical when nothing moved.
 *
 * `external` is the one lifecycle field a caller MAY supply: `intake:sync` calls this
 * immediately after creating an issue, precisely to record where it landed. Keeping
 * `existing.external` unconditionally discarded that every time, so the number was never
 * stored and each sync re-searched by marker instead of being the no-op it claims to be.
 */
export function upsertSubmission(
  submission: Submission,
  dir: string = DEFAULT_QUEUE_DIR,
): Submission {
  const root = resolve(dir);
  mkdirSync(root, { recursive: true });

  const existing = readQueue(dir).submissions.find((s) => s.id === submission.id);
  let merged: Submission;
  if (existing) {
    const carried: Submission = {
      ...submission,
      status: existing.status === "stale" ? "open" : existing.status,
      external: submission.external ?? existing.external,
      created_at: existing.created_at,
      // Carried, not stamped, so the comparison below sees only real changes.
      updated_at: existing.updated_at,
    };
    if (canonicalize(carried) === canonicalize(existing)) return existing;
    merged = { ...carried, updated_at: new Date().toISOString() };
  } else {
    merged = submission;
  }

  // The filename encodes priority, so a re-file at a new priority must remove the old
  // file or the queue would hold the same id twice under two names.
  for (const name of readdirSync(root)) {
    if (name.endsWith(`-${submission.id}.json`) && name !== submissionFileName(merged)) {
      rmSync(join(root, name));
    }
  }
  writeFileSync(
    join(root, submissionFileName(merged)),
    `${JSON.stringify(merged, null, 2)}\n`,
    "utf8",
  );
  return merged;
}

/** Update just the lifecycle fields of one submission, by id. */
export function setSubmissionStatus(
  id: string,
  status: SubmissionStatus,
  dir: string = DEFAULT_QUEUE_DIR,
): Submission | null {
  const found = readQueue(dir).submissions.find((s) => s.id === id);
  if (!found) return null;
  const next: Submission = { ...found, status, updated_at: new Date().toISOString() };
  const root = resolve(dir);
  for (const name of readdirSync(root)) {
    if (name.endsWith(`-${id}.json`)) rmSync(join(root, name));
  }
  writeFileSync(join(root, submissionFileName(next)), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export type QueueSummary = {
  total: number;
  open: number;
  byPriority: Record<string, number>;
  bySource: Record<string, number>;
  byKind: Record<string, number>;
  byStatus: Record<string, number>;
  next: Submission | null;
};

export function summarizeQueue(submissions: readonly Submission[]): QueueSummary {
  const bump = (t: Record<string, number>, k: string): void => {
    t[k] = (t[k] ?? 0) + 1;
  };
  const byPriority: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const s of submissions) {
    bump(byPriority, s.priority);
    bump(bySource, s.source);
    bump(byKind, s.kind);
    bump(byStatus, s.status);
  }
  const open = submissions.filter(isOpenWork);
  return {
    total: submissions.length,
    open: open.length,
    byPriority,
    bySource,
    byKind,
    byStatus,
    next: open[0] ?? null,
  };
}

/** The single item the dev loop should pick up, honouring optional filters. */
export function nextWork(
  submissions: readonly Submission[],
  filters: { source?: SubmissionSource; maxPriority?: SubmissionPriority } = {},
): Submission | null {
  const eligible = submissions.filter((s) => {
    if (!isOpenWork(s)) return false;
    if (filters.source && s.source !== filters.source) return false;
    return true;
  });
  return eligible[0] ?? null;
}
