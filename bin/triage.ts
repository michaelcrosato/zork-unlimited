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
import { resolve } from "node:path";
import { buildLocationIndex } from "../src/feedback/normalize.js";
import { DEFAULT_TICKET_DIR } from "../src/qa/ticket.js";
import { readTickets, summarizeBucket, writeTickets } from "../src/qa/ticket_store.js";
import { DEFAULT_SESSION_STORE, listPlaytestSessions } from "../src/qa/session_store.js";
import { triagePlaytestCorpus } from "../src/qa/triage.js";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);

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
 */
function buildHistory(limit: number): string[] {
  try {
    return execFileSync("git", ["log", "--format=%H", `-n${limit}`], {
      cwd: REPO_ROOT,
      encoding: "utf8",
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

  const existing = readTickets(ticketDir).tickets;
  const result = triagePlaytestCorpus({
    sessions: entries.map((entry) => entry.record),
    locationIndex: buildLocationIndex(REPO_ROOT),
    buildHistory: buildHistory(200),
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
}

main();
