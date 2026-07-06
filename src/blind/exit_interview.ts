/**
 * The structured EXIT INTERVIEW a blind playtest must end with — the
 * machine-readable half of the flywheel's feedback edge (the prose report is
 * the human-readable half). The tester appends one fenced block:
 *
 *   ```json exit-interview
 *   { "clarity": 4, "enjoyment": 3, ... }
 *   ```
 *
 * The verifier (report_verifier.ts) refuses a report without a valid block,
 * exactly as it refuses a report that never connected to the MCP tools — so
 * a cycle can only count a playtest whose feedback the dev loop can actually
 * rank on. Scores are integers (no 3.5 hedging); bugs carry the same S0–S4
 * severity scale the prose report uses.
 */
import { z } from "zod";

export const ExitInterviewSchema = z
  .object({
    clarity: z.number().int().min(1).max(5),
    enjoyment: z.number().int().min(1).max(5),
    goal_understood: z.boolean(),
    got_stuck: z.boolean(),
    confusions: z.array(z.string().min(1)).default([]),
    bugs: z
      .array(
        z
          .object({
            where: z.string().min(1),
            severity: z.enum(["S0", "S1", "S2", "S3", "S4"]),
            note: z.string().min(1),
          })
          .strict(),
      )
      .default([]),
    best_moment: z.string().min(1),
    worst_moment: z.string().min(1),
    would_replay: z.boolean(),
    verdict: z.string().min(20),
  })
  .strict();

export type ExitInterview = z.infer<typeof ExitInterviewSchema>;

const BLOCK = /```json exit-interview\s*\n([\s\S]*?)```/;

export type ExitInterviewExtraction =
  | { ok: true; interview: ExitInterview }
  | { ok: false; reason: string };

export function extractExitInterview(text: string): ExitInterviewExtraction {
  const body = BLOCK.exec(text)?.[1];
  if (body === undefined) {
    return {
      ok: false,
      reason: "missing exit interview (a ```json exit-interview fenced block is mandatory)",
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, reason: "exit interview block is not valid JSON" };
  }
  const res = ExitInterviewSchema.safeParse(parsed);
  if (!res.success) {
    const first = res.error.issues[0];
    return {
      ok: false,
      reason: `exit interview invalid: ${first?.path.join(".") ?? "?"} — ${first?.message ?? "schema mismatch"}`,
    };
  }
  return { ok: true, interview: res.data };
}
