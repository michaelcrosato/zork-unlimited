import { describe, expect, it } from "vitest";
import {
  EXIT_INTERVIEW_MAX_ITEMS,
  EXIT_INTERVIEW_MAX_TEXT,
  EXIT_INTERVIEW_MAX_VERDICT,
  SubjectiveExitInterviewSchema,
} from "../../src/blind/exit_interview.js";

/**
 * bug_0610 — every free-text interview field had `.min(1)` and no upper bound, and the
 * arrays had no cap, while triage copies that text into tracked ticket and queue files.
 * One runaway or adversarial report could therefore commit megabytes to the repository
 * through the dev loop's own ledger commit. The bounds below are far above anything the
 * corpus has produced (longest verdict on disk: 879 characters; longest list: 5 items).
 */
function interview(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    clarity: 4,
    enjoyment: 4,
    goal_understood: true,
    got_stuck: false,
    confusions: ["one"],
    bugs: [{ where: "Byre", severity: "S1", note: "a note" }],
    best_moment: "the feed",
    worst_moment: "the ridge",
    would_replay: true,
    verdict: "a verdict of at least twenty characters",
    ...overrides,
  };
}

describe("exit interview free-text bounds", () => {
  it("accepts a report at the bounds", () => {
    const parsed = SubjectiveExitInterviewSchema.safeParse(
      interview({
        verdict: "v".repeat(EXIT_INTERVIEW_MAX_VERDICT),
        best_moment: "b".repeat(EXIT_INTERVIEW_MAX_TEXT),
        confusions: Array.from({ length: EXIT_INTERVIEW_MAX_ITEMS }, () => "c"),
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it.each([
    ["verdict", { verdict: "v".repeat(EXIT_INTERVIEW_MAX_VERDICT + 1) }],
    ["best_moment", { best_moment: "b".repeat(EXIT_INTERVIEW_MAX_TEXT + 1) }],
    ["worst_moment", { worst_moment: "w".repeat(EXIT_INTERVIEW_MAX_TEXT + 1) }],
    ["a confusion entry", { confusions: ["x".repeat(EXIT_INTERVIEW_MAX_TEXT + 1)] }],
    [
      "a bug note",
      { bugs: [{ where: "here", severity: "S2", note: "n".repeat(EXIT_INTERVIEW_MAX_TEXT + 1) }] },
    ],
    [
      "a bug location",
      { bugs: [{ where: "w".repeat(EXIT_INTERVIEW_MAX_TEXT + 1), severity: "S2", note: "n" }] },
    ],
  ])("rejects an oversized %s", (_field, overrides) => {
    expect(SubjectiveExitInterviewSchema.safeParse(interview(overrides)).success).toBe(false);
  });

  it.each([
    ["confusions", { confusions: Array.from({ length: EXIT_INTERVIEW_MAX_ITEMS + 1 }, () => "c") }],
    [
      "bugs",
      {
        bugs: Array.from({ length: EXIT_INTERVIEW_MAX_ITEMS + 1 }, () => ({
          where: "w",
          severity: "S0",
          note: "n",
        })),
      },
    ],
  ])("rejects more than the maximum number of %s", (_field, overrides) => {
    expect(SubjectiveExitInterviewSchema.safeParse(interview(overrides)).success).toBe(false);
  });
});
