/**
 * The intake queue: one inbox, many sources.
 *
 * These tests pin the properties that make a queue fed by continuously-running agents
 * survivable — stable identity, idempotent re-filing, lifecycle state the sources cannot
 * stomp, and an ordering that a loud source cannot hijack.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  compareSubmissions,
  defaultPriority,
  isOpenWork,
  SUBMISSION_SCHEMA_VERSION,
  SubmissionSchema,
  submissionFileName,
  submissionId,
  titleKey,
  type Submission,
} from "../../src/intake/submission.js";
import {
  nextWork,
  readQueue,
  setSubmissionStatus,
  summarizeQueue,
  upsertSubmission,
} from "../../src/intake/queue.js";
import {
  readMarker,
  submissionFromIssue,
  submissionLabels,
  submissionMarker,
} from "../../src/intake/github.js";
import { submissionFromTicket, ticketPriority } from "../../src/qa/ticket_submission.js";
import type { QaTicket } from "../../src/qa/ticket.js";

const dirs: string[] = [];
function tempQueue(): string {
  const dir = mkdtempSync(join(tmpdir(), "af-intake-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function make(over: Partial<Submission> = {}): Submission {
  const source = over.source ?? "audit";
  const kind = over.kind ?? "bug";
  const now = "2026-08-28T12:00:00.000Z";
  return SubmissionSchema.parse({
    schema_version: SUBMISSION_SCHEMA_VERSION,
    id: submissionId({ source, kind, key: over.title ? titleKey(over.title) : "k" }),
    title: "a thing",
    body: "do the thing",
    source,
    kind,
    priority: "P2",
    status: "open",
    labels: [],
    area: null,
    evidence: { summary: "because", refs: [], lineages: [], observations: 1 },
    created_at: now,
    updated_at: now,
    external: null,
    ...over,
  });
}

describe("submission identity", () => {
  it("is stable across re-filing regardless of body or evidence", () => {
    const a = submissionId({ source: "audit", kind: "bug", key: "session-too-big" });
    const b = submissionId({ source: "audit", kind: "bug", key: "session-too-big" });
    expect(a).toBe(b);
  });

  it("separates the same key filed by different sources", () => {
    const audit = submissionId({ source: "audit", kind: "bug", key: "same" });
    const human = submissionId({ source: "human", kind: "bug", key: "same" });
    expect(audit).not.toBe(human);
  });

  it("defaults a human request above an unprompted agent proposal", () => {
    expect(defaultPriority("human", "feature")).toBe("P1");
    expect(defaultPriority("research", "feature")).toBe("P3");
    // A crawler bug is a reproduced invariant violation, not an opinion.
    expect(defaultPriority("crawler", "bug")).toBe("P0");
  });
});

describe("queue ordering", () => {
  it("sorts by priority before anything else", () => {
    const p0 = make({ priority: "P0", title: "p0" });
    const p3 = make({ priority: "P3", title: "p3" });
    expect([p3, p0].sort(compareSubmissions)[0]!.priority).toBe("P0");
  });

  it("does not let a loud source outrank a higher priority", () => {
    // 500 observations from one source must not beat a P1 with a single observation:
    // priority is a decision, and observation count is only an input to it.
    const loud = make({
      priority: "P2",
      title: "loud",
      evidence: { summary: "s", refs: [], lineages: ["gemini"], observations: 500 },
    });
    const considered = make({ priority: "P1", title: "considered" });
    expect([loud, considered].sort(compareSubmissions)[0]!.title).toBe("considered");
  });

  it("breaks ties on independent lineages before raw counts", () => {
    const broad = make({
      title: "broad",
      evidence: { summary: "s", refs: [], lineages: ["a", "b", "c"], observations: 5 },
    });
    const deep = make({
      title: "deep",
      evidence: { summary: "s", refs: [], lineages: ["a"], observations: 50 },
    });
    expect([deep, broad].sort(compareSubmissions)[0]!.title).toBe("broad");
  });
});

describe("queue persistence", () => {
  it("round-trips a submission", () => {
    const dir = tempQueue();
    const stored = upsertSubmission(make({ title: "round trip" }), dir);
    const { submissions, unreadable } = readQueue(dir);
    expect(unreadable).toEqual([]);
    expect(submissions).toHaveLength(1);
    expect(submissions[0]!.id).toBe(stored.id);
  });

  it("re-filing does NOT reset lifecycle state a dev agent set", () => {
    const dir = tempQueue();
    const filed = make({ title: "recurring" });
    upsertSubmission(filed, dir);
    setSubmissionStatus(filed.id, "in_progress", dir);

    // The source re-files every wave and must not stomp work already in flight.
    upsertSubmission({ ...filed, body: "new evidence arrived" }, dir);

    const stored = readQueue(dir).submissions.find((s) => s.id === filed.id)!;
    expect(stored.status).toBe("in_progress");
    expect(stored.body).toBe("new evidence arrived");
  });

  it("re-filing preserves the tracker issue it was mirrored to", () => {
    const dir = tempQueue();
    const filed = make({ title: "mirrored" });
    upsertSubmission(
      {
        ...filed,
        external: { provider: "github", number: 42, url: "u", synced_status: "open" },
      },
      dir,
    );
    upsertSubmission({ ...filed, body: "updated" }, dir);
    expect(readQueue(dir).submissions[0]!.external?.number).toBe(42);
  });

  it("revives a stale submission when fresh evidence re-files it", () => {
    const dir = tempQueue();
    const filed = make({ title: "revivable" });
    upsertSubmission(filed, dir);
    setSubmissionStatus(filed.id, "stale", dir);
    upsertSubmission(filed, dir);
    expect(readQueue(dir).submissions[0]!.status).toBe("open");
  });

  it("never holds one id twice when its priority changes", () => {
    const dir = tempQueue();
    const filed = make({ title: "escalating", priority: "P3" });
    upsertSubmission(filed, dir);
    upsertSubmission({ ...filed, priority: "P0" }, dir);
    const { submissions } = readQueue(dir);
    expect(submissions).toHaveLength(1);
    expect(submissions[0]!.priority).toBe("P0");
  });

  it("reports an unreadable submission instead of hiding it", () => {
    const dir = tempQueue();
    writeFileSync(join(dir, "P1-human-deadbeefdeadbeef.json"), "{ not json", "utf8");
    const { submissions, unreadable } = readQueue(dir);
    expect(submissions).toHaveLength(0);
    expect(unreadable).toHaveLength(1);
  });

  it("hides finished work from the dev loop but keeps it in the queue", () => {
    const dir = tempQueue();
    const filed = make({ title: "finished" });
    upsertSubmission(filed, dir);
    setSubmissionStatus(filed.id, "done", dir);
    const { submissions } = readQueue(dir);
    expect(summarizeQueue(submissions).total).toBe(1);
    expect(summarizeQueue(submissions).open).toBe(0);
    expect(nextWork(submissions)).toBeNull();
    expect(isOpenWork(submissions[0]!)).toBe(false);
  });

  it("names files so a plain listing is already the queue order", () => {
    expect(submissionFileName(make({ priority: "P0", source: "crawler" }))).toMatch(
      /^P0-crawler-[0-9a-f]{16}\.json$/,
    );
  });
});

describe("GitHub mirroring", () => {
  it("round-trips the idempotency marker", () => {
    const id = "0123456789abcdef";
    expect(readMarker(`body text\n${submissionMarker(id)}\n`)).toBe(id);
  });

  it("finds no marker in a human-written issue", () => {
    expect(readMarker("Please add horses. Thanks!")).toBeNull();
  });

  it("mirrors the submission's dimensions onto labels", () => {
    const labels = submissionLabels(
      make({ source: "playtest", kind: "experience", priority: "P1" }),
    );
    expect(labels).toContain("af:submission");
    expect(labels).toContain("af:source/playtest");
    expect(labels).toContain("af:kind/experience");
    expect(labels).toContain("af:P1");
  });

  it("adopts a human-filed issue, honouring a triaged priority label", () => {
    const adopted = submissionFromIssue({
      number: 7,
      url: "https://github.com/o/r/issues/7",
      title: "Add horses",
      body: "It would be nice.",
      state: "OPEN",
      labels: ["af:P0", "enhancement"],
    });
    expect(adopted.source).toBe("human");
    expect(adopted.priority).toBe("P0");
    expect(adopted.status).toBe("open");
    expect(adopted.external?.number).toBe(7);
    // Non-af labels survive; our own encoding does not get duplicated into labels.
    expect(adopted.labels).toEqual(["enhancement"]);
  });

  it("gives an adopted issue a stable id so re-syncing never duplicates it", () => {
    const issue = {
      number: 7,
      url: "u",
      title: "Add horses",
      body: "b",
      state: "OPEN",
      labels: [] as string[],
    };
    expect(submissionFromIssue(issue).id).toBe(
      submissionFromIssue({ ...issue, body: "edited" }).id,
    );
  });

  it("closes the local item when the issue is closed", () => {
    const adopted = submissionFromIssue({
      number: 8,
      url: "u",
      title: "Done thing",
      body: "b",
      state: "CLOSED",
      labels: [],
    });
    expect(adopted.status).toBe("done");
  });
});

describe("playtest tickets crossing into the queue", () => {
  function ticket(over: Partial<QaTicket> = {}): QaTicket {
    return {
      schema_version: 1,
      ticket_id: "1234567890abcdef",
      title: "dispatch board unclear @ albany",
      kind: "bug",
      severity: "S2",
      status: "open",
      promotion: "corroborated",
      location: "albany_city",
      excerpts: ["the board does not say which option commits"],
      evidence: {
        report_count: 4,
        families: ["claude", "gemini", "gpt"],
        providers: ["claude_code", "gemini_cli", "codex"],
        tiers: ["reference", "volume"],
        has_runner_enforced_report: true,
        session_ids: ["s1", "s2"],
        first_seen_build: "a".repeat(40),
        last_seen_build: "a".repeat(40),
        first_seen_at: "2026-08-28T12:00:00.000Z",
        last_seen_at: "2026-08-28T13:00:00.000Z",
      },
      priority: 79.7,
      ...over,
    };
  }

  it("lifts a reproduced ticket above a merely corroborated one", () => {
    expect(ticketPriority(ticket({ promotion: "corroborated" }))).toBe("P2");
    expect(ticketPriority(ticket({ promotion: "verified" }))).toBe("P1");
  });

  it("carries the corroboration through as queue evidence", () => {
    const submission = submissionFromTicket(ticket());
    expect(submission.source).toBe("playtest");
    expect(submission.evidence.lineages).toEqual(["claude", "gemini", "gpt"]);
    expect(submission.evidence.observations).toBe(4);
    expect(submission.body).toContain("claude, gemini, gpt");
  });

  it("keeps one queue item for a finding's whole life", () => {
    const first = submissionFromTicket(
      ticket({ evidence: { ...ticket().evidence, report_count: 4 } }),
    );
    const later = submissionFromTicket(
      ticket({ evidence: { ...ticket().evidence, report_count: 40 }, severity: "S3" }),
    );
    expect(later.id).toBe(first.id);
  });

  it("says so when only unattestable sessions back a finding", () => {
    const submission = submissionFromTicket(
      ticket({ evidence: { ...ticket().evidence, has_runner_enforced_report: false } }),
    );
    expect(submission.body).toContain("operator-attested");
  });
});
