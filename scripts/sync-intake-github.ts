#!/usr/bin/env -S npx tsx
/**
 * Reconcile the intake queue with GitHub Issues, both ways.
 *
 * Push: every local submission gets or updates its issue, so anything an agent filed is
 * visible to people in the tool they already use.
 *
 * Pull: every issue without a marker becomes a `human` submission, so a feature request
 * typed on a phone reaches the dev loop without anyone touching the repo. Issue state
 * comes back too, so closing an issue in the GitHub UI closes the work here.
 *
 * The whole thing is BEST-EFFORT by design. If `gh` is missing, unauthenticated, or the
 * network is down, this reports why and exits 0. The dev loop reads the local queue and
 * must never stop because a tracker was unreachable — an outage in a mirror is not an
 * outage in the work.
 *
 * Usage:
 *   npm run intake:sync                     both directions
 *   npm run intake:sync -- --push-only
 *   npm run intake:sync -- --pull-only
 *   npm run intake:sync -- --repo owner/name --dry-run
 */
import { execFileSync } from "node:child_process";
import { DEFAULT_QUEUE_DIR, type Submission } from "../src/intake/submission.js";
import { readQueue, upsertSubmission } from "../src/intake/queue.js";
import {
  gitHubAvailable,
  pullIssues,
  pushSubmission,
  readMarker,
  submissionFromIssue,
} from "../src/intake/github.js";

function arg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

/** Infer owner/name from the git remote, so the common case needs no flag. */
function defaultRepo(): string | null {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
    const match = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(url);
    return match ? `${match[1]}/${match[2]}` : null;
  } catch {
    return null;
  }
}

function main(): void {
  const dir = arg("--queue") ?? DEFAULT_QUEUE_DIR;
  const repo = arg("--repo") ?? defaultRepo();
  const dryRun = process.argv.includes("--dry-run");
  const pushOnly = process.argv.includes("--push-only");
  const pullOnly = process.argv.includes("--pull-only");

  if (!repo) {
    console.log("No GitHub repo could be inferred from the git remote; pass --repo owner/name.");
    return;
  }

  const available = gitHubAvailable();
  if (!available.ok) {
    // Exit 0: the queue is the source of truth and is unaffected. Say precisely what to
    // fix, because "install gh" and "log in to gh" are different problems.
    console.log(`Skipping GitHub sync — ${available.reason}.`);
    console.log("The local intake queue is unaffected; the dev loop reads it directly.");
    return;
  }

  const { submissions, unreadable } = readQueue(dir);
  for (const bad of unreadable) console.error(`! unreadable submission ${bad.file}: ${bad.reason}`);

  if (!pullOnly) {
    let created = 0;
    let updated = 0;
    let failed = 0;
    for (const submission of submissions) {
      if (dryRun) {
        console.log(`[dry-run] would push ${submission.id} (${submission.title})`);
        continue;
      }
      const result = pushSubmission(submission, repo);
      if (!result.ok) {
        console.error(`! push failed for ${submission.id}: ${result.reason}`);
        failed += 1;
        continue;
      }
      if (result.action === "created") created += 1;
      if (result.action === "updated") updated += 1;
      // Record where it landed so the next sync is a no-op rather than a search.
      upsertSubmission(
        {
          ...submission,
          external: {
            provider: "github",
            number: result.number,
            url: result.url,
            synced_status: submission.status,
          },
        },
        dir,
      );
    }
    if (!dryRun) {
      console.log(`push: ${created} created, ${updated} updated, ${failed} failed.`);
    }
  }

  if (!pushOnly) {
    const issues = pullIssues(repo);
    if ("error" in issues) {
      console.error(`! pull failed: ${issues.error}`);
      return;
    }
    const known = new Map(
      submissions.filter((s) => s.external).map((s) => [s.external!.number, s] as const),
    );
    let adopted = 0;
    let restated = 0;
    for (const issue of issues) {
      const marker = readMarker(issue.body);
      if (marker) {
        // Ours already. Bring back only the state a person can change in the UI.
        const local = known.get(issue.number);
        if (!local) continue;
        const closed = issue.state.toLowerCase() === "closed";
        const wanted: Submission["status"] = closed
          ? local.status === "declined"
            ? "declined"
            : "done"
          : local.status === "done" || local.status === "declined"
            ? "open"
            : local.status;
        if (wanted !== local.status) {
          if (dryRun) {
            console.log(`[dry-run] would set ${local.id} → ${wanted} (issue #${issue.number})`);
          } else {
            upsertSubmission({ ...local, status: wanted }, dir);
            restated += 1;
          }
        }
        continue;
      }
      // No marker: a person filed this. Adopt it.
      const minted = submissionFromIssue(issue);
      if (dryRun) {
        console.log(`[dry-run] would adopt issue #${issue.number} as ${minted.id}`);
        continue;
      }
      upsertSubmission(minted, dir);
      adopted += 1;
    }
    if (!dryRun) console.log(`pull: ${adopted} adopted, ${restated} state change(s).`);
  }
}

main();
