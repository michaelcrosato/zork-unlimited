/**
 * Adapter agent (spec §12.2, §12.3).
 *
 * Input: a writer story + the engine contract. Output: a schema-valid content pack
 * plus a per-beat classification (§11). The adapter loops against the deterministic
 * validator (§12.3) — feeding each round's ERROR findings back into the prompt —
 * until the pack is green or a round budget is hit. This is the "iterate until the
 * report is green" loop from §10, with the validator (not the model) deciding
 * correctness (§16). Provider-agnostic; deterministic under MockAuthorProvider.
 *
 * The loop is mode-agnostic (`runAdaptLoop`): `runAdapter` routes a CYOA pack through
 * `validateCyoa`, `runParserAdapter` routes a Zork-style PARSER pack through the
 * richer `validateParser` (reference integrity / reachability / soft-lock / win
 * reachability), and `runRpgAdapter` routes an RPG pack through the RICHEST validator,
 * `validateRpg` (every parser invariant PLUS the Stage-4 layer: player stats, enemies
 * naming declared death endings, combat winnability, skill-check passability). Same
 * author → validate → revise machinery, now covering all three modes (ULTRAPLAN
 * §Week.4: the richest validators behind a real authoring loop).
 */
import type { Provider } from "../llm/provider.js";
import {
  AdapterOutputSchema,
  ParserAdapterOutputSchema,
  RpgAdapterOutputSchema,
  type BeatClassification,
} from "./schemas.js";
import type { CyoaPack } from "../../src/cyoa/schema.js";
import type { ParserPack } from "../../src/parser/schema.js";
import type { RpgPack } from "../../src/rpg/schema.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import type { Finding, ValidationReport } from "../../src/validate/report.js";
import type { WriterStory } from "./schemas.js";
import type { ZodType, ZodTypeDef } from "zod";

const CYOA_ADAPTER_SYSTEM =
  "You are a game designer. Adapt the story + beats into a schema-valid CYOA content " +
  "pack and classify every beat against the engine contract's adaptation labels. If " +
  "prior_errors are present, fix exactly those reference/reachability/soft-lock issues. " +
  "Respond as JSON.";

const PARSER_ADAPTER_SYSTEM =
  "You are a game designer. Adapt the story + beats into a schema-valid Zork-style " +
  "PARSER content pack (rooms, objects, exits, win_conditions, endings) and classify " +
  "every beat against the engine contract's adaptation labels. If prior_errors are " +
  "present, fix exactly those reference/reachability/soft-lock issues. Respond as JSON.";

const RPG_ADAPTER_SYSTEM =
  "You are a game designer. Adapt the story + beats into a schema-valid Stage-4 RPG " +
  "content pack (a parser pack PLUS player stats in meta.vars_init, enemies, and skill " +
  "checks) and classify every beat against the engine contract's adaptation labels. " +
  "Every enemy must stand in a real room and name a declared DEATH ending; every fight " +
  "must be winnable and every skill check passable. If prior_errors are present, fix " +
  "exactly those reference/reachability/soft-lock/combat/skill-check issues. Respond as JSON.";

export type AdaptResult<P = CyoaPack> = {
  ok: boolean;
  pack: P;
  classifications: BeatClassification[];
  report: ValidationReport;
  rounds: number;
};

/** One mode's wiring for the shared revise loop: the prompt, the output schema, and
 *  the deterministic validator that decides correctness for that pack type. */
type AdaptConfig<P> = {
  system: string;
  schemaName: string;
  // Same input/output split as CompletionRequest: the validated OUTPUT carries the
  // pack + classifications, while the INPUT is left open (`unknown`) so schemas that
  // apply `.default()` — where Zod's input type ≠ output type — are accepted.
  schema: ZodType<{ pack: P; classifications: BeatClassification[] }, ZodTypeDef, unknown>;
  validate: (pack: P) => ValidationReport;
};

/** Mode-agnostic author → validate → revise loop: emit a pack, validate it, feed any
 *  ERROR findings back into the next prompt, and stop when green or the budget is hit. */
async function runAdaptLoop<P>(
  provider: Provider,
  opts: { story: WriterStory; contract: unknown; maxRounds?: number },
  cfg: AdaptConfig<P>,
): Promise<AdaptResult<P>> {
  const maxRounds = opts.maxRounds ?? 4;
  let priorErrors: Finding[] = [];
  let last: AdaptResult<P> | null = null;
  let lastParseError: string | null = null;

  for (let round = 1; round <= maxRounds; round++) {
    let out: { pack: P; classifications: BeatClassification[] };
    try {
      out = await provider.completeJson({
        system: cfg.system,
        user: JSON.stringify({
          story: opts.story,
          engine_contract: opts.contract,
          prior_errors: priorErrors,
        }),
        schemaName: cfg.schemaName,
        schema: cfg.schema,
      });
    } catch (err) {
      // A real model can return prose, code fences, extra keys (the adapter OUTPUT
      // schemas are `.strict()`), or otherwise off-shape JSON — `completeJson` throws on
      // BOTH the `extractJson` failure and the Zod parse. The mock never does this, but a
      // live frontier model will (the keystone keyed-run risk). Treat a thrown completion
      // as a NON-GREEN round, not a fatal crash: surface it as an ERROR finding fed back
      // into the next prompt so the model can revise toward valid output, exactly as a
      // validator error would be. A transient bad reply must not abort the whole run.
      lastParseError = err instanceof Error ? err.message : String(err);
      priorErrors = [
        {
          severity: "error",
          code: "ADAPTER_OUTPUT_UNPARSEABLE",
          message:
            `Your previous reply could not be parsed as JSON for schema "${cfg.schemaName}": ` +
            `${lastParseError}. Reply with a SINGLE JSON object that matches the schema exactly — ` +
            `no prose, no code fences, and no keys beyond those the schema declares.`,
          where: [cfg.schemaName],
        },
      ];
      continue;
    }
    const report = cfg.validate(out.pack);
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
  if (last) return last;
  // Every round threw before producing a parseable pack, so there is no AdaptResult to
  // return. Fail loudly with the accumulated cause instead of a non-null-assertion lie on
  // a null `last` — the caller gets an attributable error, not a TypeError on `.pack`.
  throw new Error(
    `Adapter produced no schema-valid output for "${cfg.schemaName}" in ${maxRounds} round(s). ` +
      `Last parse error: ${lastParseError ?? "unknown"}.`,
  );
}

/** Adapt a story into a validated CYOA pack, looping until the validator is green. */
export function runAdapter(
  provider: Provider,
  opts: { story: WriterStory; contract: unknown; maxRounds?: number },
): Promise<AdaptResult<CyoaPack>> {
  return runAdaptLoop(provider, opts, {
    system: CYOA_ADAPTER_SYSTEM,
    schemaName: "AdapterOutput",
    schema: AdapterOutputSchema,
    validate: validateCyoa,
  });
}

/** Adapt a story into a validated PARSER pack, looping until the (richer) parser
 *  validator is green — the same loop as runAdapter, behind the Zork-style validator. */
export function runParserAdapter(
  provider: Provider,
  opts: { story: WriterStory; contract: unknown; maxRounds?: number },
): Promise<AdaptResult<ParserPack>> {
  return runAdaptLoop(provider, opts, {
    system: PARSER_ADAPTER_SYSTEM,
    schemaName: "ParserAdapterOutput",
    schema: ParserAdapterOutputSchema,
    validate: (pack) => validateParser(pack),
  });
}

/** Adapt a story into a validated RPG pack, looping until the RICHEST validator —
 *  `validateRpg` (the full parser checks PLUS the Stage-4 combat/skill-check layer) — is
 *  green. The same loop as runAdapter/runParserAdapter, behind the deepest validator;
 *  completes the authoring pipeline's coverage of all three engine modes. */
export function runRpgAdapter(
  provider: Provider,
  opts: { story: WriterStory; contract: unknown; maxRounds?: number },
): Promise<AdaptResult<RpgPack>> {
  return runAdaptLoop(provider, opts, {
    system: RPG_ADAPTER_SYSTEM,
    schemaName: "RpgAdapterOutput",
    schema: RpgAdapterOutputSchema,
    validate: (pack) => validateRpg(pack),
  });
}
