#!/usr/bin/env -S npx tsx
/**
 * Reconcile the tracked intake queue with the AdventureForge Linear project.
 *
 * The queue JSON is authoritative. Pulling imports only human triage (priority and
 * assignee suggestions); it never imports Linear workflow state as a local close.
 * Pushing then makes the Linear issue match the local file, including repo-side closes.
 *
 * Usage:
 *   npm run intake:sync:linear -- --dry-run
 *   npm run intake:sync:linear
 *   npm run intake:sync:linear -- --push-only
 *   npm run intake:sync:linear -- --pull-only
 *   npm run intake:sync:linear -- --ids <id,id,...>
 *
 * Credentials are local-only: LINEAR_API_KEY is sent as a personal API key, or
 * LINEAR_OAUTH_TOKEN is sent as a Bearer token. A tracker outage never stops the
 * dev loop; the local queue remains usable and the reason is printed.
 */
import {
  DEFAULT_QUEUE_DIR,
  externalMirrorFor,
  withExternalMirror,
  type Submission,
} from "../src/intake/submission.js";
import { readQueue, upsertSubmission } from "../src/intake/queue.js";
import {
  DEFAULT_LINEAR_PROJECT,
  DEFAULT_LINEAR_TEAM,
  ensureLinearLabels,
  linearAssigneeName,
  linearAuthorization,
  linearAvailable,
  linearCredentialsFromEnv,
  linearIssueBody,
  linearIssueLabels,
  linearIssueTitle,
  linearStateForStatus,
  listLinearLabels,
  listLinearWorkflowStates,
  listTeamIssuesByPrefix,
  pushLinearIssue,
  readLinearMarker,
  resolveLinearProject,
  submissionFromLinearIssue,
  submissionPriorityForLinear,
  assigneeMatchesClaim,
  type LinearIssueSnapshot,
  type LinearWorkflowStateSnapshot,
} from "../src/intake/linear.js";

// A repo-root .env is the documented home for LINEAR_API_KEY (see
// docs/linear_workflow.md), so load it when present. Real environment variables
// win over the file, a missing file is normal, and no other dotenv magic applies.
try {
  process.loadEnvFile();
} catch {
  // No .env in the working directory — the plain environment is authoritative.
}

function arg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function requestedIds(): Set<string> | null {
  const raw = arg("--ids");
  if (!raw) return null;
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

function issueName(issue: LinearIssueSnapshot): string {
  return issue.identifier || issue.id;
}

function isManagedLabel(name: string): boolean {
  return (
    name === "intake-mirror" ||
    name.startsWith("source:") ||
    name.startsWith("lane:") ||
    name.startsWith("kind:")
  );
}

function sorted(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function issueForSubmission(
  issues: readonly LinearIssueSnapshot[],
  submission: Submission,
): LinearIssueSnapshot | null {
  const storedMirror = externalMirrorFor(submission, "linear");
  if (storedMirror?.provider === "linear") {
    const byId = issues.find((issue) => issue.id === storedMirror.id);
    if (byId) return byId;
  }
  return (
    issues.find(
      (issue) => readLinearMarker(issue.title, issue.description ?? "") === submission.id,
    ) ?? null
  );
}

function desiredChanges(
  issue: LinearIssueSnapshot,
  submission: Submission,
  state: LinearWorkflowStateSnapshot | null,
): string[] {
  const changes: string[] = [];
  if (issue.title !== linearIssueTitle(submission.id, submission.title)) changes.push("title");
  if (
    issue.description !== undefined &&
    (issue.description ?? "").trim() !== linearIssueBody(submission).trim()
  ) {
    changes.push("body");
  }
  const wantedPriority =
    submission.priority === "P0"
      ? 1
      : submission.priority === "P1"
        ? 2
        : submission.priority === "P2"
          ? 3
          : 4;
  if (issue.priority !== wantedPriority) changes.push("priority");
  if (state) {
    if (issue.stateId ? issue.stateId !== state.id : issue.state !== state.name) {
      changes.push("state");
    }
  }
  const currentManaged = sorted(issue.labels.filter(isManagedLabel));
  const wantedManaged = sorted(linearIssueLabels(submission));
  if (currentManaged.join("\n") !== wantedManaged.join("\n")) changes.push("labels");
  return changes;
}

type PullResult = {
  submissions: Submission[];
  adopted: number;
  reprioritized: number;
  suggestions: number;
  orphaned: number;
};

function pullLinear(
  issues: readonly LinearIssueSnapshot[],
  initial: Submission[],
  queueDir: string,
  dryRun: boolean,
  ids: Set<string> | null,
): PullResult {
  const effective = new Map(initial.map((submission) => [submission.id, submission] as const));
  let adopted = 0;
  let reprioritized = 0;
  let suggestions = 0;
  let orphaned = 0;

  for (const issue of issues) {
    const marker = readLinearMarker(issue.title, issue.description ?? "");
    if (!marker) {
      if (ids) continue;
      const minted = submissionFromLinearIssue(issue);
      const existing = effective.get(minted.id);
      if (dryRun) {
        if (!existing) effective.set(minted.id, minted);
        console.log(
          `[dry-run] would adopt ${issueName(issue)} as ${minted.id} (local status stays open)`,
        );
      } else {
        const stored = upsertSubmission(minted, queueDir);
        effective.set(stored.id, stored);
        console.log(`${issueName(issue)} -> adopted as ${stored.id} (local status open)`);
      }
      if (!existing) adopted += 1;
      continue;
    }

    if (ids && !ids.has(marker)) continue;
    const local = effective.get(marker);
    if (!local) {
      orphaned += 1;
      console.log(`! ${issueName(issue)} has marker ${marker} but no local queue file`);
      continue;
    }

    if (issue.priority > 0) {
      const wanted = submissionPriorityForLinear(issue.priority, local.priority);
      if (wanted !== local.priority) {
        if (dryRun) {
          effective.set(marker, { ...local, priority: wanted });
          console.log(`[dry-run] would reprioritize ${marker}: ${local.priority} -> ${wanted}`);
        } else {
          const stored = upsertSubmission({ ...local, priority: wanted }, queueDir);
          effective.set(marker, stored);
          console.log(`${marker} -> priority ${wanted} from Linear ${issueName(issue)}`);
        }
        reprioritized += 1;
      }
    }

    const current = effective.get(marker)!;
    const assignee = linearAssigneeName(issue);
    if (assignee && !assigneeMatchesClaim(issue, current)) {
      suggestions += 1;
      console.log(
        `[suggestion] ${marker}: Linear assignee "${assignee}" on ${issueName(issue)}; ` +
          `review, then run \`npm run work -- --claim ${marker}\` with that lane identity`,
      );
    }
    // Deliberately no read of issue.state changes current.status. Repo lifecycle wins.
  }

  return { submissions: [...effective.values()], adopted, reprioritized, suggestions, orphaned };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const pushOnly = process.argv.includes("--push-only");
  const pullOnly = process.argv.includes("--pull-only");
  if (pushOnly && pullOnly) throw new Error("--push-only and --pull-only cannot be combined");

  const available = linearAvailable();
  if (!available.ok) {
    console.log(`Skipping Linear sync - ${available.reason}.`);
    console.log("The local intake queue is unaffected; the dev loop reads it directly.");
    return;
  }
  const credentials = linearCredentialsFromEnv();
  const auth = linearAuthorization(credentials);
  if (!auth.ok) {
    console.log(`Skipping Linear sync - ${auth.reason}.`);
    return;
  }

  const queueDir = arg("--queue") ?? DEFAULT_QUEUE_DIR;
  const ids = requestedIds();
  const initial = readQueue(queueDir);
  for (const bad of initial.unreadable)
    console.error(`! unreadable submission ${bad.file}: ${bad.reason}`);

  try {
    const teamKey = arg("--team") ?? process.env.LINEAR_TEAM?.trim() ?? DEFAULT_LINEAR_TEAM;
    const projectSlug =
      arg("--project") ?? process.env.LINEAR_PROJECT?.trim() ?? DEFAULT_LINEAR_PROJECT;
    const project = await resolveLinearProject(auth.header, teamKey, projectSlug);
    if (!project.ok) throw new Error(project.reason);

    const listed = await listTeamIssuesByPrefix(auth.header, teamKey);
    if (!listed.ok) throw new Error(listed.reason);
    const issues = listed.data.filter((issue) => issue.projectId === project.data.projectId);
    console.log(
      `Linear ${project.data.projectName} (${teamKey}): ${issues.length} project issue(s).`,
    );

    let working = initial.submissions;
    if (!pushOnly) {
      const pulled = pullLinear(issues, working, queueDir, dryRun, ids);
      working = pulled.submissions;
      console.log(
        `pull: ${pulled.adopted} adopted, ${pulled.reprioritized} priority edit(s), ` +
          `${pulled.suggestions} claim suggestion(s), ${pulled.orphaned} orphan(s).`,
      );
    }

    if (pullOnly) return;
    const selected = working.filter((submission) => !ids || ids.has(submission.id));
    if (selected.length === 0) {
      console.log("push: no matching local submissions.");
      return;
    }

    const stateResult = await listLinearWorkflowStates(auth.header, project.data.teamId);
    if (!stateResult.ok) throw new Error(stateResult.reason);
    const states = stateResult.data;

    const allNames = sorted(
      selected
        .flatMap((submission) => linearIssueLabels(submission))
        .filter((name, index, all) => all.indexOf(name) === index),
    );
    let labelPairs: Array<{ name: string; id: string }>;
    if (dryRun) {
      const labels = await listLinearLabels(auth.header, project.data.teamId);
      if (!labels.ok) throw new Error(labels.reason);
      labelPairs = labels.data;
    } else {
      const labels = await ensureLinearLabels(auth.header, project.data.teamId, allNames);
      if (!labels.ok) throw new Error(labels.reason);
      labelPairs = allNames.map((name, index) => ({ name, id: labels.data[index]! }));
    }
    const labelIds = new Map(labelPairs.map((label) => [label.name, label.id] as const));

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let failed = 0;
    for (const submission of selected) {
      const state = linearStateForStatus(states, submission.status);
      if (!state) {
        console.error(
          `! push failed for ${submission.id}: no workflow state for ${submission.status}`,
        );
        failed += 1;
        continue;
      }
      const names = linearIssueLabels(submission);
      const missing = names.filter((name) => !labelIds.has(name));
      if (missing.length > 0) {
        console.error(
          `! push failed for ${submission.id}: missing Linear label(s) ${missing.join(", ")}`,
        );
        failed += 1;
        continue;
      }
      const issue = issueForSubmission(issues, submission);
      const changes = issue ? desiredChanges(issue, submission, state) : ["create"];
      if (issue && changes.length === 0) {
        unchanged += 1;
        if (!dryRun) {
          upsertSubmission(
            withExternalMirror(submission, {
              provider: "linear",
              id: issue.id,
              identifier: issue.identifier,
              url: issue.url,
              synced_status: submission.status,
            }),
            queueDir,
          );
        }
        console.log(
          `${dryRun ? "[dry-run] unchanged" : "unchanged"} ${submission.id} -> ${issueName(issue)}`,
        );
        continue;
      }

      if (dryRun) {
        if (issue) updated += 1;
        else created += 1;
        console.log(
          `[dry-run] would ${issue ? "update" : "create"} ${submission.id}` +
            ` -> ${issue ? issueName(issue) : "a new Linear issue"} (${changes.join(", ")})`,
        );
        continue;
      }

      const result = await pushLinearIssue(auth.header, {
        teamId: project.data.teamId,
        projectId: project.data.projectId,
        labelIds: names.map((name) => labelIds.get(name)!),
        existing: issues,
        submission,
        stateId: state.id,
      });
      if (!result.ok) {
        console.error(`! push failed for ${submission.id}: ${result.reason}`);
        failed += 1;
        continue;
      }
      if (result.action === "created") created += 1;
      if (result.action === "updated") updated += 1;
      const remote = result.issue;
      if (!dryRun) {
        upsertSubmission(
          withExternalMirror(submission, {
            provider: "linear",
            id: remote.id,
            identifier: remote.identifier,
            url: remote.url,
            synced_status: submission.status,
          }),
          queueDir,
        );
      }
      console.log(
        `${dryRun ? "[dry-run] would " : ""}${result.action} ${submission.id} -> ${issueName(remote)}`,
      );
      if (result.action === "created") issues.push(remote);
    }
    console.log(
      `push: ${created} created, ${updated} updated, ${unchanged} unchanged, ${failed} failed.`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`Skipping Linear sync - ${reason}.`);
    console.error(
      "The local intake queue is unaffected; re-authenticate or fix the local credential and retry.",
    );
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
