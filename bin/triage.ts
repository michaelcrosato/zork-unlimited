#!/usr/bin/env -S npx tsx
/**
 * Triage the playtest corpus into the QA bucket.
 *
 * This is the QA lead's pass: read every session record, cluster what players reported,
 * and write the promoted subset into `qa/tickets/` where the dev loop will find it.
 * Run it as often as you like — it is pure over the corpus, so re-running never
 * produces a different bucket for the same input, and an interrupted run leaves nothing
 * half-applied.
 *
 * Usage:
 *   npm run qa:triage                    triage and write the bucket
 *   npm run qa:triage -- --dry-run       report what would change, write nothing
 *   npm run qa:triage -- --store <dir>   triage a corpus somewhere else
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildLocationIndex } from "../src/feedback/normalize.js";
import { DEFAULT_QUEUE_DIR } from "../src/intake/submission.js";
import { upsertSubmission } from "../src/intake/queue.js";
import { DEFAULT_TICKET_DIR } from "../src/qa/ticket.js";
import { submissionsFromTickets } from "../src/qa/ticket_submission.js";
import { readTickets, summarizeBucket, writeTickets } from "../src/qa/ticket_store.js";
import { DEFAULT_SESSION_STORE, listPlaytestSessions } from "../src/qa/session_store.js";
import { triagePlaytestCorpus } from "../src/qa/triage.js";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

function argValue(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

/**
 * Recency spine for staleness: the commits this checkout knows about, newest first.
 *
 * Read from git rather than from the sessions themselves so that a build nobody has
 * played yet still counts as "newer" — otherwise a quiet period in the fleet would make
 * every ticket look freshly seen.
 *
 * The whole history, deliberately, not a window. `buildsSince` returns null for a commit
 * it cannot find and triage skips aging on null — a fail-open the comment there defends,
 * because expiring a ticket whose build simply was not published would be worse than
 * keeping it. But a truncated window turns that safety valve into the normal case: with
 * the previous `-n200` on a repository already past 1,500 commits, every session played
 * on a build older than the last two hundred was permanently exempt from
 * STALE_AFTER_BUILDS, which is precisely the ticket most likely to describe something
 * already fixed. Full history costs one 41-byte line per commit and is read once.
 */
function buildHistory(): string[] {
  try {
    return execFileSync("git", ["log", "--format=%H"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function main(): void {
  const store = argValue("--store", DEFAULT_SESSION_STORE);
  const ticketDir = argValue("--tickets", DEFAULT_TICKET_DIR);
  const dryRun = process.argv.includes("--dry-run");

  const { entries, unreadable } = listPlaytestSessions(store);
  for (const bad of unreadable) console.error(`! unreadable session ${bad.dir}: ${bad.reason}`);

  if (entries.length === 0) {
    console.log(`No playtest sessions in ${store}; the bucket is unchanged.`);
    return;
  }

  // Unreadable tickets are reported here for the same reason unreadable sessions are,
  // one screen up: they are workflow state — somebody's `wont_fix`, somebody's notes —
  // that this run is about to write around without seeing. `writeTickets` leaves those
  // files in place, so the operator can repair one instead of discovering from git
  // history that triage removed it.
  const { tickets: existing, unreadable: unreadableTickets } = readTickets(ticketDir);
  for (const bad of unreadableTickets) {
    console.error(`! unreadable ticket ${bad.file}: ${bad.reason} (left in place)`);
  }

  const result = triagePlaytestCorpus({
    sessions: entries.map((entry) => entry.record),
    locationIndex: buildLocationIndex(REPO_ROOT),
    buildHistory: buildHistory(),
    existingTickets: existing,
  });

  const { stats } = result;
  console.log(
    `Triaged ${stats.sessions} session(s) (${stats.sessionsWithInterview} with an interview): ` +
      `${stats.issues} issue(s) → ${stats.clusters} cluster(s).`,
  );
  console.log(
    `  verified ${stats.verified}, corroborated ${stats.corroborated}, ` +
      `accumulating ${stats.accumulating}, stale ${stats.stale}`,
  );
  // Retirement removes tracked files, so it is reported rather than left to be noticed
  // in a diff.
  if (stats.retired > 0) {
    console.log(`  retired ${stats.retired} aged-out ticket(s) with no notes or decision`);
  }

  const summary = summarizeBucket(result.tickets);
  console.log(`  bucket: ${summary.actionable} actionable of ${summary.total}`);
  if (summary.next) {
    console.log(
      `  next: ${summary.next.severity} ${summary.next.ticket_id} — ${summary.next.title}`,
    );
  }

  if (dryRun) {
    console.log("[dry-run] bucket not written.");
    return;
  }
  writeTickets(result.tickets, ticketDir);
  console.log(`Wrote ${result.tickets.length} ticket(s) to ${ticketDir}.`);

  // Only actionable tickets cross into the dev loop's queue. The rest stay visible in
  // the bucket — they are real evidence, just not yet work.
  const queueDir = argValue("--queue", DEFAULT_QUEUE_DIR);
  const promoted = submissionsFromTickets(result.tickets);
  for (const submission of promoted) upsertSubmission(submission, queueDir);
  console.log(
    promoted.length === 0
      ? `Nothing promoted to ${queueDir}: no ticket is corroborated or verified yet.`
      : `Promoted ${promoted.length} submission(s) to ${queueDir}.`,
  );
}

main();
