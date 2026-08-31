#!/usr/bin/env -S npx tsx
/**
 * Push open intake submissions onto Linear (repo → Linear).
 *
 * Identity is the `[16-hex]` title prefix. Re-running updates the existing issue.
 * Credentials stay in the environment: LINEAR_API_KEY (raw) or LINEAR_OAUTH_TOKEN (Bearer).
 */
import { DEFAULT_QUEUE_DIR, withExternalMirror } from "../src/intake/submission.js";
import { readQueue, upsertSubmission } from "../src/intake/queue.js";
import {
  LINEAR_PRIORITY,
  LINEAR_PROJECT_SLUG,
  LINEAR_TEAM_KEY,
  ensureLinearLabels,
  linearAuthorization,
  linearCredentialsFromEnv,
  linearIssueLabels,
  linearIssueTitle,
  listTeamIssuesByPrefix,
  pushLinearIssue,
  resolveLinearProject,
  type LinearIssueSnapshot,
} from "../src/intake/linear.js";

function arg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

const WAVE_IDS = new Set([
  "33c83cbe8ead954b",
  "a38a43b74212d7cc",
  "fa0bcf219c803b70",
  "c3f6544dbf5cfa5b",
  "7536e060e73d565a",
  "8c57d00c90511374",
  "2f0ba051b0b45ded",
  "f0d64bf5b028c189",
]);

async function main(): Promise<void> {
  const dir = arg("--queue") ?? DEFAULT_QUEUE_DIR;
  const dryRun = process.argv.includes("--dry-run");
  const idsRaw = arg("--ids");
  const wanted = idsRaw
    ? new Set(
        idsRaw
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      )
    : WAVE_IDS;

  const auth = linearAuthorization(linearCredentialsFromEnv());
  if (!auth.ok) {
    console.error(auth.reason);
    process.exitCode = 1;
    return;
  }

  const project = await resolveLinearProject(auth.header, LINEAR_TEAM_KEY, LINEAR_PROJECT_SLUG);
  if (!project.ok) {
    console.error(project.reason);
    process.exitCode = 1;
    return;
  }

  const { submissions, unreadable } = readQueue(dir);
  for (const bad of unreadable) console.error(`! unreadable submission ${bad.file}: ${bad.reason}`);
  const skipped = new Set(["4806c6f8ade14c0b", "61d3b9dec4cb09fd"]);
  const selected = submissions.filter(
    (submission) => wanted.has(submission.id) && !skipped.has(submission.id),
  );
  if (selected.length === 0) {
    console.error("no matching submissions in the queue");
    process.exitCode = 1;
    return;
  }

  const listed = await listTeamIssuesByPrefix(auth.header, LINEAR_TEAM_KEY);
  if (!listed.ok) {
    console.error(listed.reason);
    process.exitCode = 1;
    return;
  }

  const results: LinearIssueSnapshot[] = [];
  for (const submission of selected) {
    const names = linearIssueLabels(submission);
    if (dryRun) {
      console.log(
        `[dry-run] ${linearIssueTitle(submission.id, submission.title)} labels=${names.join(",")} priority=${LINEAR_PRIORITY[submission.priority]}`,
      );
      continue;
    }
    const labels = await ensureLinearLabels(auth.header, project.data.teamId, names);
    if (!labels.ok) {
      console.error(`! labels failed for ${submission.id}: ${labels.reason}`);
      process.exitCode = 1;
      return;
    }
    const pushed = await pushLinearIssue(auth.header, {
      teamId: project.data.teamId,
      projectId: project.data.projectId,
      labelIds: labels.data,
      existing: listed.data,
      submission,
    });
    if (!pushed.ok) {
      console.error(`! push failed for ${submission.id}: ${pushed.reason}`);
      process.exitCode = 1;
      return;
    }
    results.push(pushed.issue);
    if (pushed.action === "created") listed.data.push(pushed.issue);
    upsertSubmission(
      withExternalMirror(submission, {
        provider: "linear",
        id: pushed.issue.id,
        identifier: pushed.issue.identifier,
        url: pushed.issue.url,
        synced_status: submission.status,
      }),
      dir,
    );
    console.error(`${pushed.action} ${pushed.issue.identifier} ${pushed.issue.title}`);
  }

  process.stdout.write(
    `${JSON.stringify(
      { ok: true, project: project.data.projectName, team: LINEAR_TEAM_KEY, issues: results },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
