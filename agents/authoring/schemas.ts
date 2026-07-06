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

/** The adapter's single output: a schema-valid RPG pack plus per-beat classification.
 *  Schema-valid output may still fail the richest validator, and that report drives the
 *  adapter→validator revise loop until `validateRpg` is green. */
export const RpgAdapterOutputSchema = z
  .object({
    pack: RpgPackSchema,
    classifications: z.array(BeatClassificationSchema).min(1),
  })
  .strict();
export type RpgAdapterOutput = z.infer<typeof RpgAdapterOutputSchema>;
