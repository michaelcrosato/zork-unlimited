import { describe, expect, it } from "vitest";

import {
  DEFAULT_LINEAR_PROJECT,
  DEFAULT_LINEAR_TEAM,
  linearStateForStatus,
  resolveLinearTarget,
  listTeamIssuesByPrefix,
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

  it("lists team issues with a slim query under Linear's complexity cap", async () => {
    let query = "";
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      query = JSON.parse(String(init?.body ?? "{}")).query as string;
      return new Response(
        JSON.stringify({
          data: {
            teams: {
              nodes: [
                {
                  issues: {
                    nodes: [
                      {
                        id: "iss-1",
                        identifier: "MIC-33",
                        url: "https://linear.app/michael-crosato/issue/MIC-33",
                        title: "[33c83cbe8ead954b] Steading Yard north blocked",
                        project: { id: "proj" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const listed = await listTeamIssuesByPrefix("lin_api_test", "MIC", fetchImpl);
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.data[0]?.identifier).toBe("MIC-33");
      expect(listed.data[0]?.projectId).toBe("proj");
    }
    expect(query).toContain("issues(first: 100)");
    expect(query).toContain("id identifier url title");
    expect(query).not.toContain("assignee");
    expect(query).not.toContain("first: 250");
  });
});

describe("Linear sync target resolution", () => {
  /**
   * .env.example ships `LINEAR_PROJECT=` blank and says to copy it to .env, so the
   * common .env has a blank value. `??` does not fall through on "", so before this
   * the sync resolved an EMPTY project slug and failed to find the project — an error
   * that names Linear rather than the blank line that caused it.
   */
  it("treats a blank env override as unset, so the shipped .env.example works as-is", () => {
    const target = resolveLinearTarget({ LINEAR_PROJECT: "", LINEAR_TEAM: "" });
    expect(target.projectSlug).toBe(DEFAULT_LINEAR_PROJECT);
    expect(target.teamKey).toBe(DEFAULT_LINEAR_TEAM);
  });

  it("treats a whitespace-only override as unset", () => {
    expect(resolveLinearTarget({ LINEAR_PROJECT: "   " }).projectSlug).toBe(DEFAULT_LINEAR_PROJECT);
  });

  it("still honours a real env override", () => {
    const target = resolveLinearTarget({ LINEAR_TEAM: "OTHER", LINEAR_PROJECT: "other-slug" });
    expect(target.teamKey).toBe("OTHER");
    expect(target.projectSlug).toBe("other-slug");
  });

  it("lets an explicit flag win over the environment, and ignores a blank flag", () => {
    const env = { LINEAR_TEAM: "FROM_ENV" };
    expect(resolveLinearTarget(env, { team: "FROM_FLAG" }).teamKey).toBe("FROM_FLAG");
    expect(resolveLinearTarget(env, { team: "  " }).teamKey).toBe("FROM_ENV");
  });

  it("falls back to the repo defaults when nothing is set", () => {
    const target = resolveLinearTarget({});
    expect(target.teamKey).toBe("MIC");
    expect(target.projectSlug).toBe("adventureforge-59cb5298fba1");
  });
});
