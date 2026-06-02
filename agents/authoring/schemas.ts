/**
 * Authoring data shapes (spec §12.1–2).
 *
 * The Writer drafts prose + a beat list; the Adapter turns that into a
 * schema-valid content pack plus a per-beat classification against the engine
 * contract (§11). Both are produced by an LLM via the provider abstraction
 * (§12.7) and validated at the tool-call boundary, so a model's output is data
 * our code checks — never trusted blind (§16).
 */
import { z } from "zod";
import { CyoaPackSchema } from "../../src/cyoa/schema.js";
import { ParserPackSchema } from "../../src/parser/schema.js";
import { RpgPackSchema } from "../../src/rpg/schema.js";

export const WriterStorySchema = z
  .object({
    title: z.string().min(1),
    premise: z.string().min(1),
    chapters: z
      .array(
        z
          .object({ id: z.string().min(1), title: z.string().min(1), prose: z.string().min(1) })
          .strict(),
      )
      .min(1),
    beats: z.array(z.object({ id: z.string().min(1), summary: z.string().min(1) }).strict()).min(1),
  })
  .strict();
export type WriterStory = z.infer<typeof WriterStorySchema>;

/** The §11 adaptation labels — exactly one per beat. */
export const AdaptationLabel = z.enum([
  "fully_supported",
  "supported_with_minor_rewrite",
  "requires_cutscene",
  "requires_engine_extension",
  "too_expensive_for_prototype",
]);
export type AdaptationLabelT = z.infer<typeof AdaptationLabel>;

export const BeatClassificationSchema = z
  .object({ beat_id: z.string().min(1), label: AdaptationLabel, note: z.string().default("") })
  .strict();
export type BeatClassification = z.infer<typeof BeatClassificationSchema>;

/** The Adapter's output: a CYOA pack (schema-valid by construction) + the per-beat
 *  classification. Reference integrity / reachability / soft-locks are the
 *  validator's job, so a schema-valid pack here may still fail validation — which
 *  is exactly what drives the adapter→validator revise loop. */
export const AdapterOutputSchema = z
  .object({
    pack: CyoaPackSchema,
    classifications: z.array(BeatClassificationSchema).min(1),
  })
  .strict();
export type AdapterOutput = z.infer<typeof AdapterOutputSchema>;

/** The parser-mode Adapter's output: a schema-valid PARSER pack (rooms, objects,
 *  exits, win_conditions, endings) + the same per-beat classification. Same role as
 *  AdapterOutputSchema but routed through the richer parser validator (reference
 *  integrity / reachability / soft-lock / win-reachability), so the same author →
 *  validate → revise loop now covers Zork-style packs, not just CYOA (ULTRAPLAN
 *  §Week.4: parser/RPG behind a real authoring loop). */
export const ParserAdapterOutputSchema = z
  .object({
    pack: ParserPackSchema,
    classifications: z.array(BeatClassificationSchema).min(1),
  })
  .strict();
export type ParserAdapterOutput = z.infer<typeof ParserAdapterOutputSchema>;

/** The RPG-mode Adapter's output: a schema-valid RPG pack (a parser pack PLUS enemies,
 *  stats, and skill checks — §13 Stage 4) + the same per-beat classification. Same role
 *  as the CYOA/parser schemas but routed through the RICHEST validator, `validateRpg`:
 *  every parser invariant (reference integrity / reachability / soft-lock / win) PLUS the
 *  Stage-4 layer — player stat vars, enemies in real rooms naming declared DEATH endings,
 *  combat winnability, and skill-check passability. This closes the authoring loop over all
 *  three modes (ULTRAPLAN §Week.4: the richest validators behind a real authoring loop). */
export const RpgAdapterOutputSchema = z
  .object({
    pack: RpgPackSchema,
    classifications: z.array(BeatClassificationSchema).min(1),
  })
  .strict();
export type RpgAdapterOutput = z.infer<typeof RpgAdapterOutputSchema>;
