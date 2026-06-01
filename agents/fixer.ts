/**
 * Fixer agent (spec §12.5, §15, §16).
 *
 * The fixer proposes a STRUCTURED, single-layer patch (a `ContentPatchProposal`)
 * and our deterministic code applies it — the model never edits files, runs
 * shell, or writes code (§16). Each op is drawn from a CLOSED whitelist; an op
 * outside it is refused. After applying, the pack is re-parsed through its Zod
 * schema and re-validated, so a "fix" that breaks the contract is rejected rather
 * than silently shipped (§10). This is the safe analogue of a model "editing the
 * game": data in, validated data out.
 *
 * The fixer touches exactly one of {content, engine_rule, validator, test,
 * hint_text, quest_structure}. Content/hint/quest patches are expressed as the
 * ops below; engine_rule/validator/test changes are gated (§14) and produce a
 * proposal only — code edits stay with the human supervisor.
 */
import { z } from "zod";
import { CyoaPackSchema } from "../src/cyoa/schema.js";
import { ParserPackSchema } from "../src/parser/schema.js";
import { validateCyoa } from "../src/validate/cyoa_validator.js";
import { validateParser } from "../src/validate/parser_validator.js";
import { makeReport, type ValidationReport } from "../src/validate/report.js";
import type { Diagnosis, FixLayer } from "./debugger.js";

export const FixLayerSchema = z.enum([
  "content",
  "engine_rule",
  "validator",
  "test",
  "hint_text",
  "quest_structure",
]);

/** The closed op vocabulary. Each op is a small, reversible data edit. */
export const PatchOpSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("set_meta"),
      field: z.string().min(1),
      value: z.union([z.string(), z.number(), z.boolean()]),
    })
    .strict(),
  // CYOA narrative/hint edits.
  z
    .object({ op: z.literal("set_scene_text"), id: z.string().min(1), text: z.string().min(1) })
    .strict(),
  z
    .object({
      op: z.literal("set_choice_text"),
      scene: z.string().min(1),
      choice: z.string().min(1),
      text: z.string().min(1),
    })
    .strict(),
  z
    .object({
      op: z.literal("add_scene_journal_hint"),
      scene: z.string().min(1),
      text: z.string().min(1),
    })
    .strict(),
  // Parser content/hint/quest edits.
  z
    .object({
      op: z.literal("set_object_field"),
      id: z.string().min(1),
      field: z.enum(["description", "read_text", "quest_critical", "takeable", "locked"]),
      value: z.union([z.string(), z.boolean()]),
    })
    .strict(),
  z
    .object({
      op: z.literal("add_room_journal_hint"),
      room: z.string().min(1),
      text: z.string().min(1),
    })
    .strict(),
]);
export type PatchOp = z.infer<typeof PatchOpSchema>;

export const ContentPatchProposalSchema = z
  .object({
    layer: FixLayerSchema,
    mode: z.enum(["cyoa", "parser"]),
    summary: z.string().min(1),
    ops: z.array(PatchOpSchema).default([]),
  })
  .strict();
export type ContentPatchProposal = z.infer<typeof ContentPatchProposalSchema>;

export type ApplyResult =
  | { ok: true; applied: number; pack: unknown; report: ValidationReport }
  | { ok: false; report: ValidationReport };

/** A deep structural clone via JSON (content is plain data — no functions, §16). */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

type AnyPack = {
  meta: Record<string, unknown>;
  scenes?: {
    id: string;
    text?: string;
    on_enter?: unknown[];
    choices?: { id: string; text?: string }[];
  }[];
  objects?: Record<string, unknown>[];
  rooms?: { id: string; on_enter?: unknown[] }[];
};

/**
 * Apply a proposal to a raw (schema-shaped) pack object. Deterministic; mutates
 * only a clone. Returns the re-validated pack, or a report explaining why the
 * patch was refused (unknown target, schema break, or a still-failing validation).
 */
export function applyContentPatch(rawPack: unknown, proposal: ContentPatchProposal): ApplyResult {
  const parsedProposal = ContentPatchProposalSchema.safeParse(proposal);
  if (!parsedProposal.success) {
    return {
      ok: false,
      report: makeReport("patch", [
        {
          severity: "error",
          code: "PATCH_INVALID",
          message: parsedProposal.error.message,
          where: ["proposal"],
        },
      ]),
    };
  }
  const pack = clone(rawPack) as AnyPack;
  const fail = (code: string, message: string, where: string[]): ApplyResult => ({
    ok: false,
    report: makeReport(String(pack.meta?.["id"] ?? "patch"), [
      { severity: "error", code, message, where },
    ]),
  });

  for (const op of parsedProposal.data.ops) {
    switch (op.op) {
      case "set_meta": {
        pack.meta[op.field] = op.value;
        break;
      }
      case "set_scene_text": {
        const scene = pack.scenes?.find((s) => s.id === op.id);
        if (!scene) return fail("PATCH_TARGET_MISSING", `no scene "${op.id}".`, [`scene:${op.id}`]);
        scene.text = op.text;
        break;
      }
      case "set_choice_text": {
        const choice = pack.scenes
          ?.find((s) => s.id === op.scene)
          ?.choices?.find((c) => c.id === op.choice);
        if (!choice)
          return fail("PATCH_TARGET_MISSING", `no choice "${op.choice}" in scene "${op.scene}".`, [
            `scene:${op.scene}`,
          ]);
        choice.text = op.text;
        break;
      }
      case "add_scene_journal_hint": {
        const scene = pack.scenes?.find((s) => s.id === op.scene);
        if (!scene)
          return fail("PATCH_TARGET_MISSING", `no scene "${op.scene}".`, [`scene:${op.scene}`]);
        (scene.on_enter ??= []).push({ add_journal: op.text });
        break;
      }
      case "set_object_field": {
        const obj = pack.objects?.find((o) => o["id"] === op.id);
        if (!obj) return fail("PATCH_TARGET_MISSING", `no object "${op.id}".`, [`object:${op.id}`]);
        obj[op.field] = op.value;
        break;
      }
      case "add_room_journal_hint": {
        const room = pack.rooms?.find((r) => r.id === op.room);
        if (!room)
          return fail("PATCH_TARGET_MISSING", `no room "${op.room}".`, [`room:${op.room}`]);
        (room.on_enter ??= []).push({ add_journal: op.text });
        break;
      }
    }
  }

  // Re-parse through the contract: a patch that breaks the schema is refused (§16).
  const schema = parsedProposal.data.mode === "cyoa" ? CyoaPackSchema : ParserPackSchema;
  const reparsed = schema.safeParse(pack);
  if (!reparsed.success) {
    const findings = reparsed.error.issues.map((i) => ({
      severity: "error" as const,
      code: "PATCH_SCHEMA_BREAK",
      message: `${i.message} (${i.path.join(".") || "<root>"})`,
      where: [i.path.join(".") || "<root>"],
    }));
    return { ok: false, report: makeReport(String(pack.meta?.["id"] ?? "patch"), findings) };
  }
  const report =
    parsedProposal.data.mode === "cyoa"
      ? validateCyoa(reparsed.data as never)
      : validateParser(reparsed.data as never);
  return { ok: report.ok, applied: parsedProposal.data.ops.length, pack: reparsed.data, report };
}

/**
 * Heuristic: turn a diagnosis into a candidate single-layer proposal. The fixer
 * proposes; the validator disposes. A model can refine this, but even the
 * code-only default produces a legitimate, safe patch for the common cases.
 */
export function proposeFix(
  diagnosis: Diagnosis,
  ctx: { mode: "cyoa" | "parser"; location?: string },
): ContentPatchProposal {
  if (diagnosis.type === "soft_lock" && ctx.mode === "parser" && ctx.location) {
    return {
      layer: "hint_text",
      mode: "parser",
      summary: `Add an in-world hint at "${ctx.location}" so the player is never left without a signposted next step (§17.1, §17.7).`,
      ops: [
        {
          op: "add_room_journal_hint",
          room: ctx.location,
          text: "You sense there is still a way forward here — look closer at what you carry and what stands before you.",
        },
      ],
    };
  }
  if (diagnosis.type === "soft_lock" && ctx.mode === "cyoa" && ctx.location) {
    return {
      layer: "hint_text",
      mode: "cyoa",
      summary: `Add a journal hint on entering "${ctx.location}" so the route forward is discoverable (§17.7).`,
      ops: [
        {
          op: "add_scene_journal_hint",
          scene: ctx.location,
          text: "There must be another way on from here.",
        },
      ],
    };
  }
  // Loops, rejected actions, and engine-touching fixes are proposals only (gated, §14).
  const layer: FixLayer = diagnosis.type === "loop" ? "quest_structure" : "content";
  return {
    layer,
    mode: ctx.mode,
    summary: `Reviewer action required for "${diagnosis.type}" at ${ctx.location ?? "unknown"}: ${diagnosis.description}`,
    ops: [],
  };
}

/** A regression-test source stub asserting the diagnosed failure cannot recur (§15). */
export function regressionTestStub(bugId: string, replayPath: string, packPath: string): string {
  return `import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules } from "../../src/cyoa/runner.js";
import { replayTrace } from "../../src/trace/replay.js";
import type { Trace } from "../../src/trace/record.js";

// Regression for ${bugId} (§15). The bug's trace must replay to its recorded
// hash forever — if a future change reintroduces the failure, this goes red.
describe("${bugId}", () => {
  it("replays the fixed trace to its expected final hash", () => {
    const trace = JSON.parse(readFileSync("${replayPath}", "utf8")) as Trace;
    const loaded = loadPackFile("${packPath}");
    if (!loaded.ok) throw new Error("pack failed to compile");
    const rules = buildRules(indexPack(loaded.compiled.pack));
    expect(replayTrace(trace, rules).ok).toBe(true);
  });
});
`;
}
