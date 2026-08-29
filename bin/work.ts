#!/usr/bin/env -S npx tsx
/**
 * What should the dev loop build next?
 *
 * One command, one answer. `loop.sh` calls this at the start of every cycle, and a dev
 * agent can call it directly to see its own queue. It reads the local intake queue only
 * — no network — so it always answers, and answers the same way twice.
 *
 * An empty queue is a normal answer, not an error. Exit code 0 with "nothing queued"
 * means the loop falls back to the assessor's own maintenance candidates, which is the
 * healthy steady state when QA has nothing corroborated and nobody has filed anything.
 *
 * Usage:
 *   npm run work                    the next item, human-readable
 *   npm run work -- --json          machine-readable, for a driver
 *   npm run work -- --list          the whole open queue in order
 *   npm run work -- --claim <id>    mark in_progress
 *   npm run work -- --done <id>     mark done
 *   npm run work -- --decline <id>  mark declined
 *   npm run work -- --next-id      just the id, or nothing — for shell callers
 */
import { DEFAULT_QUEUE_DIR, type Submission } from "../src/intake/submission.js";
import { nextWork, readQueue, setSubmissionStatus, summarizeQueue } from "../src/intake/queue.js";

// Piping to `head`/`less` closes stdout early; Node turns that into an unhandled EPIPE
// and a stack trace. A list-printing CLI is going to be piped, so swallow it and exit
// quietly rather than making a normal shell idiom look like a crash.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

function arg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function describe(s: Submission): string {
  const support =
    s.evidence.lineages.length > 0
      ? `${s.evidence.observations} observation(s) across ${s.evidence.lineages.length} lineage(s): ${s.evidence.lineages.join("+")}`
      : `${s.evidence.observations} observation(s)`;
  return (
    `${s.priority} ${s.source}/${s.kind} ${s.id} — ${s.title}\n` +
    `  ${s.evidence.summary}\n` +
    `  ${support}${s.area ? `; area ${s.area}` : ""}${s.external ? `; #${s.external.number}` : ""}`
  );
}

function main(): void {
  const dir = arg("--queue") ?? DEFAULT_QUEUE_DIR;

  for (const [flag, status] of [
    ["--claim", "in_progress"],
    ["--done", "done"],
    ["--decline", "declined"],
  ] as const) {
    const id = arg(flag);
    if (!id) continue;
    const updated = setSubmissionStatus(id, status, dir);
    if (!updated) {
      console.error(`no submission ${id} in ${dir}`);
      process.exit(1);
    }
    console.log(`${updated.id} → ${updated.status}`);
    return;
  }

  const { submissions, unreadable } = readQueue(dir);
  for (const bad of unreadable) console.error(`! unreadable submission ${bad.file}: ${bad.reason}`);
  const summary = summarizeQueue(submissions);

  // Bare id, or empty output. Exists so a shell can test "is there work?" with `[[ -n ]]`
  // instead of embedding a JSON parser in the driver, which is where quoting bugs live.
  if (process.argv.includes("--next-id")) {
    if (summary.next) console.log(summary.next.id);
    return;
  }

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ summary, next: summary.next, submissions }, null, 2));
    return;
  }

  if (process.argv.includes("--list")) {
    if (summary.open === 0) {
      console.log(`Intake queue (${dir}): nothing open.`);
      return;
    }
    console.log(`Intake queue (${dir}): ${summary.open} open of ${summary.total}.`);
    for (const s of submissions.filter((x) => x.status === "open" || x.status === "in_progress")) {
      console.log(describe(s));
    }
    return;
  }

  const next = nextWork(submissions);
  if (!next) {
    // Deliberately exit 0. "Nothing queued" is a healthy state, and a nonzero exit here
    // would make an empty queue look like a broken pipeline to every caller.
    console.log(
      `Intake queue (${dir}): nothing queued. The dev loop proceeds on assessor candidates.`,
    );
    return;
  }
  console.log(describe(next));
  const bySource = Object.entries(summary.bySource)
    .sort()
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
  console.log(`  (${summary.open} open of ${summary.total}; sources: ${bySource})`);
}

main();
