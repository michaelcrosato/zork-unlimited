/**
 * Adapter agent (spec §12.2, §12.3).
 *
 * Input: a writer story + the engine contract. Output: a schema-valid CYOA pack
 * plus a per-beat classification (§11). The adapter loops against the deterministic
 * validator (§12.3) — feeding each round's ERROR findings back into the prompt —
 * until the pack is green or a round budget is hit. This is the "iterate until the
 * report is green" loop from §10, with the validator (not the model) deciding
 * correctness (§16). Provider-agnostic; deterministic under MockAuthorProvider.
 */
import type { Provider } from "../llm/provider.js";
import { AdapterOutputSchema, type BeatClassification } from "./schemas.js";
import type { CyoaPack } from "../../src/cyoa/schema.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";
import type { Finding, ValidationReport } from "../../src/validate/report.js";
import type { WriterStory } from "./schemas.js";

const ADAPTER_SYSTEM =
  "You are a game designer. Adapt the story + beats into a schema-valid CYOA content " +
  "pack and classify every beat against the engine contract's adaptation labels. If " +
  "prior_errors are present, fix exactly those reference/reachability/soft-lock issues. " +
  "Respond as JSON.";

export type AdaptResult = {
  ok: boolean;
  pack: CyoaPack;
  classifications: BeatClassification[];
  report: ValidationReport;
  rounds: number;
};

/** Adapt a story into a validated CYOA pack, looping until the validator is green. */
export async function runAdapter(
  provider: Provider,
  opts: { story: WriterStory; contract: unknown; maxRounds?: number },
): Promise<AdaptResult> {
  const maxRounds = opts.maxRounds ?? 4;
  let priorErrors: Finding[] = [];
  let last: AdaptResult | null = null;

  for (let round = 1; round <= maxRounds; round++) {
    const out = await provider.completeJson({
      system: ADAPTER_SYSTEM,
      user: JSON.stringify({
        story: opts.story,
        engine_contract: opts.contract,
        prior_errors: priorErrors,
      }),
      schemaName: "AdapterOutput",
      schema: AdapterOutputSchema,
    });
    const report = validateCyoa(out.pack);
    last = {
      ok: report.ok,
      pack: out.pack,
      classifications: out.classifications,
      report,
      rounds: round,
    };
    if (report.ok) return last;
    priorErrors = report.findings.filter((f) => f.severity === "error");
  }
  return last!;
}
