/**
 * Feedback compiler schema — the deterministic contract for the `hotspots.json`
 * artifact Tier 3 (crawler findings + fleet blind-tester reports) compiles down
 * to. Every shape here is `.strict()`: an unrecognized key means the compiler
 * and one of its readers have drifted, and that should fail loudly rather than
 * pass silently through.
 */
import { z } from "zod";

/** Bump whenever the hotspots file shape changes in a way readers must react to. */
export const HOTSPOTS_VERSION = 1;

export const FixLayerSchema = z.enum([
  "content",
  "hint_text",
  "quest_structure",
  "engine_rule",
  "validator",
  "test",
]);

export const FeedbackSourceSchema = z.enum(["crawler", "fleet"]);

export const CanonicalLocationSchema = z
  .object({
    kind: z.enum(["quest", "overworld", "unmapped"]),
    questId: z.string().nullable(),
    region: z.string().nullable(),
    node: z.string().nullable(),
    sceneId: z.string().nullable(),
    raw: z.array(z.string()).min(1),
  })
  .strict();

export const HotspotSchema = z
  .object({
    id: z.string().min(1), // shortHash of cluster fingerprint — STABLE across compiles
    title: z.string().min(1), // deterministic: `<top 4 tokens> @ <location label>`
    location: CanonicalLocationSchema,
    severity_band: z.enum(["minor", "moderate", "severe"]), // S0–S1 | S2 | S3–S4
    max_severity: z.enum(["S0", "S1", "S2", "S3", "S4"]),
    count: z.number().int().positive(),
    sources: z.array(FeedbackSourceSchema).min(1),
    personas: z.array(z.string()),
    score: z.number().positive(),
    fix_layer: FixLayerSchema,
    evidence: z
      .array(
        z
          .object({ source: FeedbackSourceSchema, ref: z.string(), excerpt: z.string().max(300) })
          .strict(),
      )
      .min(1)
      .max(5),
    trend: z.enum(["new", "improved", "regressed", "flat"]),
    prev_score: z.number().nullable(),
  })
  .strict();

export const TargetMetricsSchema = z
  .object({
    target: z.string(),
    reports: z.number().int().nonnegative(),
    clarity: z
      .object({
        mean: z.number(),
        stddev: z.number(),
        histogram: z.array(z.number().int()).length(5),
      })
      .strict(),
    enjoyment: z
      .object({
        mean: z.number(),
        stddev: z.number(),
        histogram: z.array(z.number().int()).length(5),
      })
      .strict(),
    got_stuck_rate: z.number(),
    would_replay_rate: z.number(),
    by_persona: z.record(
      z
        .object({
          reports: z.number().int(),
          clarity_mean: z.number(),
          enjoyment_mean: z.number(),
          zero_negative_rate: z.number(),
        })
        .strict(),
    ),
  })
  .strict();

export const SycophancyTelemetrySchema = z
  .object({
    reports: z.number().int(),
    zero_negative_rate: z.number(),
    clarity_histogram: z.array(z.number().int()).length(5),
    enjoyment_histogram: z.array(z.number().int()).length(5),
    by_persona_zero_negative: z.record(z.number()),
  })
  .strict();

export const HotspotsFileSchema = z
  .object({
    version: z.literal(HOTSPOTS_VERSION),
    generated_at: z.string(),
    commit: z.string(),
    inputs: z
      .object({
        report_dirs: z.array(z.string()),
        crawl_files: z.array(z.string()),
        verified_reports: z.number().int(),
        rejected_reports: z.number().int(),
        crawl_findings: z.number().int(),
      })
      .strict(),
    metrics: z.array(TargetMetricsSchema),
    sycophancy: SycophancyTelemetrySchema,
    hotspots: z.array(HotspotSchema),
    recommended_next_fix: z
      .object({ hotspot_id: z.string(), rationale: z.string().min(1) })
      .strict()
      .nullable(),
  })
  .strict();

export type HotspotsFile = z.infer<typeof HotspotsFileSchema>;
export type Hotspot = z.infer<typeof HotspotSchema>;
export type CanonicalLocation = z.infer<typeof CanonicalLocationSchema>;
export type TargetMetrics = z.infer<typeof TargetMetricsSchema>;
export type SycophancyTelemetry = z.infer<typeof SycophancyTelemetrySchema>;
export type FixLayer = z.infer<typeof FixLayerSchema>;
export type FeedbackSource = z.infer<typeof FeedbackSourceSchema>;
