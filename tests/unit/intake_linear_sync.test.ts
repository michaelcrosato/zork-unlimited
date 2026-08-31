import { describe, expect, it } from "vitest";

import {
  linearStateForStatus,
  submissionFromLinearIssue,
  type LinearIssueSnapshot,
  type LinearWorkflowStateSnapshot,
} from "../../src/intake/linear.js";
import {
  externalMirrors,
  SUBMISSION_SCHEMA_VERSION,
  SubmissionSchema,
  submissionId,
  titleKey,
  withExternalMirror,
  type Submission,
} from "../../src/intake/submission.js";

function submission(over: Partial<Submission> = {}): Submission {
  const title = over.title ?? "Linear mirror test";
  const source = over.source ?? "audit";
  const kind = over.kind ?? "bug";
  const now = "2026-08-30T12:00:00.000Z";
  return SubmissionSchema.parse({
    schema_version: SUBMISSION_SCHEMA_VERSION,
    id: submissionId({ source, kind, key: titleKey(title) }),
    title,
    body: "Keep the queue authoritative.",
    source,
    kind,
    priority: "P2",
    status: "open",
    labels: [],
    area: null,
    evidence: { summary: "test", refs: [], lineages: [], observations: 1 },
    created_at: now,
    updated_at: now,
    external: null,
    ...over,
  });
}

function issue(over: Partial<LinearIssueSnapshot> = {}): LinearIssueSnapshot {
  return {
    id: "linear-issue",
    identifier: "MIC-99",
    url: "https://linear.app/michael-crosato/issue/MIC-99",
    title: "A human request",
    priority: 1,
    state: "Done",
    labels: ["lane:ops"],
    ...over,
  };
}

describe("Linear queue synchronization invariants", () => {
  it("adopts a Linear issue as open even when Linear says Done", () => {
    const adopted = submissionFromLinearIssue(
      issue({ description: "Please expose this request.", priority: 2 }),
    );
    expect(adopted.status).toBe("open");
    expect(adopted.priority).toBe("P1");
    expect(adopted.body).toContain("Please expose");
    expect(adopted.mirrors?.[0]).toMatchObject({ provider: "linear", identifier: "MIC-99" });
  });

  it("maps local lifecycle statuses to team workflow types", () => {
    const states: LinearWorkflowStateSnapshot[] = [
      { id: "backlog", name: "Backlog", type: "backlog", teamId: "team" },
      { id: "todo", name: "Todo", type: "unstarted", teamId: "team" },
      { id: "doing", name: "Doing", type: "started", teamId: "team" },
      { id: "done", name: "Done", type: "completed", teamId: "team" },
    ];
    expect(linearStateForStatus(states, "open")?.id).toBe("todo");
    expect(linearStateForStatus(states, "in_progress")?.id).toBe("doing");
    expect(linearStateForStatus(states, "done")?.id).toBe("done");
  });

  it("keeps GitHub and Linear references when both mirrors are enabled", () => {
    const github = {
      provider: "github" as const,
      number: 7,
      url: "https://github.com/o/r/issues/7",
      synced_status: "open" as const,
    };
    const linear = {
      provider: "linear" as const,
      id: "linear-7",
      identifier: "MIC-7",
      url: "https://linear.app/michael-crosato/issue/MIC-7",
      synced_status: "open" as const,
    };
    const both = withExternalMirror(withExternalMirror(submission(), github), linear);
    expect(both.external).toEqual(github);
    expect(externalMirrors(both)).toEqual([github, linear]);
  });
});
