/**
 * Mirror the intake queue to GitHub Issues, in both directions.
 *
 * Why an external tracker at all, when the queue is already a directory of JSON? Because
 * a person filing a feature request should not have to clone anything. GitHub Issues is
 * the system everyone already has: it has labels, search, assignment, comments,
 * notifications, and a mobile app. Rebuilding a worse version of that inside this repo
 * would be the classic mistake.
 *
 * Why not make Issues canonical, then? Because the dev loop must keep working when the
 * network is down, a token expires, or someone runs it on a plane. The local queue is
 * the source of truth the loop reads; GitHub is the surface humans touch. Sync
 * reconciles them, and every operation here is BEST-EFFORT: a failure is reported and
 * returned, never thrown, because a tracker outage must not be able to stop development.
 *
 * Idempotency comes from a marker embedded in the issue body:
 *
 *     <!-- af-submission-id: 1a2b3c4d5e6f7890 -->
 *
 * Because a submission's id is content-addressed on its stable identity, re-syncing the
 * same finding updates the issue it already has instead of opening a duplicate — which
 * is the failure mode every naive "file an issue per finding" integration hits within a
 * day of running on a loop.
 *
 * A human-filed issue has no marker. Sync mints a submission for it, then writes the
 * marker back, so from the second sync onward it is an ordinary tracked item.
 */
import { execFileSync } from "node:child_process";
import {
  defaultPriority,
  SubmissionKindSchema,
  SubmissionPrioritySchema,
  submissionId,
  SUBMISSION_SCHEMA_VERSION,
  titleKey,
  type Submission,
  type SubmissionPriority,
  type SubmissionStatus,
} from "./submission.js";

const MARKER = "af-submission-id";
export const SUBMISSION_LABEL = "af:submission";

export type GitHubSyncOutcome =
  | { ok: true; action: "created" | "updated" | "unchanged"; number: number; url: string }
  | { ok: false; reason: string };

function gh(args: string[]): { ok: true; stdout: string } | { ok: false; reason: string } {
  try {
    return {
      ok: true,
      stdout: execFileSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: message.split("\n").slice(0, 3).join(" ").trim() };
  }
}

/**
 * Is the GitHub CLI usable here?
 *
 * Checked once and reported plainly, because "gh is not installed" and "gh is installed
 * but you are logged out" are completely different fixes and an operator should not have
 * to guess which one they hit.
 */
export function gitHubAvailable(): { ok: true } | { ok: false; reason: string } {
  const version = gh(["--version"]);
  if (!version.ok) {
    return { ok: false, reason: "the GitHub CLI (`gh`) is not on PATH; install it or skip sync" };
  }
  const auth = gh(["auth", "status"]);
  if (!auth.ok)
    return { ok: false, reason: `\`gh\` is installed but not authenticated: ${auth.reason}` };
  return { ok: true };
}

export function submissionMarker(id: string): string {
  return `<!-- ${MARKER}: ${id} -->`;
}

export function readMarker(body: string): string | null {
  const match = new RegExp(`<!--\\s*${MARKER}:\\s*([0-9a-f]{16})\\s*-->`).exec(body);
  return match ? match[1]! : null;
}

/** Labels mirror the submission's own dimensions so the tracker stays filterable. */
export function submissionLabels(submission: Submission): string[] {
  return [
    SUBMISSION_LABEL,
    `af:source/${submission.source}`,
    `af:kind/${submission.kind}`,
    `af:${submission.priority}`,
    ...submission.labels,
  ];
}

function issueBody(submission: Submission): string {
  const refs =
    submission.evidence.refs.length > 0
      ? `\n\n**Evidence**\n${submission.evidence.refs.map((r) => `- \`${r}\``).join("\n")}`
      : "";
  const lineages =
    submission.evidence.lineages.length > 0
      ? `\n\nCorroborated by ${submission.evidence.lineages.length} independent model lineage(s): ${submission.evidence.lineages.join(", ")}.`
      : "";
  return [
    submission.body,
    `\n\n---\n`,
    `**Source** \`${submission.source}\` · **Kind** \`${submission.kind}\` · `,
    `**Priority** \`${submission.priority}\` · **Observations** ${submission.evidence.observations}`,
    submission.area ? ` · **Area** \`${submission.area}\`` : "",
    `\n\n> ${submission.evidence.summary}`,
    refs,
    lineages,
    `\n\n${submissionMarker(submission.id)}\n`,
  ].join("");
}

/** GitHub has two states; the queue has five. Only `open` maps to open. */
function issueStateFor(status: SubmissionStatus): "open" | "closed" {
  return status === "open" || status === "in_progress" ? "open" : "closed";
}

/**
 * Push one submission. Creates its issue, updates it, or reports that nothing changed.
 *
 * `--search` by marker rather than by title: titles get edited by humans, and matching on
 * them would fork one item into two the first time somebody clarified the wording.
 */
export function pushSubmission(submission: Submission, repo: string): GitHubSyncOutcome {
  const existingNumber = submission.external?.number ?? findIssueByMarker(submission.id, repo);

  if (existingNumber === null) {
    const created = gh([
      "issue",
      "create",
      "--repo",
      repo,
      "--title",
      submission.title,
      "--body",
      issueBody(submission),
      ...submissionLabels(submission).flatMap((label) => ["--label", label]),
    ]);
    if (!created.ok) return { ok: false, reason: created.reason };
    const url = created.stdout.split("\n").filter(Boolean).at(-1) ?? "";
    const number = Number.parseInt(url.split("/").at(-1) ?? "", 10);
    if (!Number.isSafeInteger(number)) {
      return { ok: false, reason: `could not read an issue number from: ${url}` };
    }
    return { ok: true, action: "created", number, url };
  }

  if (submission.external?.synced_status === submission.status) {
    return {
      ok: true,
      action: "unchanged",
      number: existingNumber,
      url: submission.external.url,
    };
  }

  const edited = gh([
    "issue",
    "edit",
    String(existingNumber),
    "--repo",
    repo,
    "--title",
    submission.title,
    "--body",
    issueBody(submission),
  ]);
  if (!edited.ok) return { ok: false, reason: edited.reason };

  const wanted = issueStateFor(submission.status);
  if (wanted === "closed") {
    gh(["issue", "close", String(existingNumber), "--repo", repo]);
  } else {
    gh(["issue", "reopen", String(existingNumber), "--repo", repo]);
  }

  return {
    ok: true,
    action: "updated",
    number: existingNumber,
    url: submission.external?.url ?? `https://github.com/${repo}/issues/${existingNumber}`,
  };
}

function findIssueByMarker(id: string, repo: string): number | null {
  const found = gh([
    "issue",
    "list",
    "--repo",
    repo,
    "--state",
    "all",
    "--search",
    submissionMarker(id),
    "--json",
    "number",
    "--limit",
    "1",
  ]);
  if (!found.ok) return null;
  try {
    const rows = JSON.parse(found.stdout) as { number: number }[];
    return rows[0]?.number ?? null;
  } catch {
    return null;
  }
}

export type PulledIssue = {
  number: number;
  url: string;
  title: string;
  body: string;
  state: string;
  labels: string[];
};

/** Every issue in the repo, so human-filed ones without a marker are seen too. */
export function pullIssues(repo: string, limit = 200): PulledIssue[] | { error: string } {
  const listed = gh([
    "issue",
    "list",
    "--repo",
    repo,
    "--state",
    "all",
    "--json",
    "number,url,title,body,state,labels",
    "--limit",
    String(limit),
  ]);
  if (!listed.ok) return { error: listed.reason };
  try {
    const rows = JSON.parse(listed.stdout) as {
      number: number;
      url: string;
      title: string;
      body: string | null;
      state: string;
      labels: { name: string }[];
    }[];
    return rows.map((row) => ({
      number: row.number,
      url: row.url,
      title: row.title,
      body: row.body ?? "",
      state: row.state,
      labels: row.labels.map((label) => label.name),
    }));
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Turn a human-filed issue into a submission.
 *
 * Priority is read from an `af:P<n>` label when one is present, so a maintainer can
 * triage in the GitHub UI and have the dev loop honour it. Absent that, it takes the
 * source default rather than guessing from the text — a heuristic that read urgency out
 * of prose would be wrong often enough to erode trust in the whole queue.
 */
export function submissionFromIssue(issue: PulledIssue): Submission {
  const labelled = issue.labels.find((label) => /^af:P[0-3]$/.test(label));
  const priority: SubmissionPriority = labelled
    ? SubmissionPrioritySchema.parse(labelled.slice(3))
    : defaultPriority("human", "feature");
  // Anyone with write access to the tracker can type `af:kind/frobnicate` onto an issue,
  // so the label is untrusted input and is parsed rather than cast. A cast produced a
  // submission whose `kind` was not in the schema at all, which the queue then wrote to
  // disk and could never read back — one unparseable file per sync, forever, for a
  // typo. An unrecognized kind falls back to the same default an unlabelled issue takes.
  const kindLabel = issue.labels.find((label) => label.startsWith("af:kind/"));
  const parsedKind = SubmissionKindSchema.safeParse(kindLabel?.slice("af:kind/".length));
  const kind: Submission["kind"] = parsedKind.success ? parsedKind.data : "feature";
  const now = new Date().toISOString();

  return {
    schema_version: SUBMISSION_SCHEMA_VERSION,
    id: submissionId({ source: "human", kind, key: titleKey(issue.title) }),
    title: issue.title,
    body: issue.body.trim().length > 0 ? issue.body : issue.title,
    source: "human",
    kind,
    priority,
    status: issue.state.toLowerCase() === "closed" ? "done" : "open",
    labels: issue.labels.filter((label) => !label.startsWith("af:")),
    area: null,
    evidence: {
      summary: `Filed by a person on GitHub as #${issue.number}.`,
      refs: [issue.url],
      lineages: [],
      observations: 1,
    },
    created_at: now,
    updated_at: now,
    external: {
      provider: "github",
      number: issue.number,
      url: issue.url,
      synced_status: issue.state.toLowerCase() === "closed" ? "done" : "open",
    },
  };
}
