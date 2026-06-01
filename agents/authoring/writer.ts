/**
 * Writer agent (spec §12.1).
 *
 * Input: a premise + the engine contract (§11). Output: a chaptered prose story
 * plus a beat list. The writer drafts freely and does not need schema fluency —
 * it is the adapter's job to make the result engine-valid. Provider-agnostic; the
 * default MockAuthorProvider makes it deterministic in CI (§12.7).
 */
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { Provider } from "../llm/provider.js";
import { WriterStorySchema, type WriterStory } from "./schemas.js";

const WRITER_SYSTEM =
  "You are a game writer. Given a premise and the engine contract, draft a short " +
  "chaptered story and a beat list that stays within the engine's stated capabilities " +
  "and supported actions. Prefer beats the engine can render; flag richer moments for " +
  "the adapter. Respond as JSON.";

/** Load the machine-readable engine contract (§11). */
export function loadEngineContract(path = "content/engine_contract.yaml"): unknown {
  return parseYaml(readFileSync(path, "utf8"));
}

export async function runWriter(
  provider: Provider,
  opts: { premise: string; contract: unknown },
): Promise<WriterStory> {
  return provider.completeJson({
    system: WRITER_SYSTEM,
    user: JSON.stringify({ premise: opts.premise, engine_contract: opts.contract }),
    schemaName: "WriterStory",
    schema: WriterStorySchema,
  });
}
