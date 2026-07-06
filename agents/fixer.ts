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
 * whitelisted ops below and applied deterministically. engine_rule/validator/test
 * changes fall OUTSIDE this structured-patch vocabulary: the fixer surfaces them as
 * a diagnosis and the agent makes those code edits directly under trust, but verify
 * (AGENTS.md — full authority, no human-approval gate, no §14 ceremony), with the
 * automated verification (`npm run health`) as the bar. Keeping the model on the
 * data-in/validated-data-out path is the §16 safety property; it is no longer a
 * human-approval gate.
 */
import { z } from "zod";
import { RpgPackSchema } from "../src/rpg/schema.js";
import { validateRpg } from "../src/validate/rpg_validator.js";
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
  // RPG room/object content, hint, and quest edits.
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
  const reparsed = RpgPackSchema.safeParse(pack);
  if (!reparsed.success) {
    const findings = reparsed.error.issues.map((i) => ({
      severity: "error" as const,
      code: "PATCH_SCHEMA_BREAK",
      message: `${i.message} (${i.path.join(".") || "<root>"})`,
      where: [i.path.join(".") || "<root>"],
    }));
    return { ok: false, report: makeReport(String(pack.meta?.["id"] ?? "patch"), findings) };
  }
  const report = validateRpg(reparsed.data);
  return { ok: report.ok, applied: parsedProposal.data.ops.length, pack: reparsed.data, report };
}

/**
 * Heuristic: turn a diagnosis into a candidate single-layer proposal. The fixer
 * proposes; the validator disposes. A model can refine this, but even the
 * code-only default produces a legitimate, safe patch for the common cases.
 */
export function proposeFix(diagnosis: Diagnosis, ctx: { location?: string }): ContentPatchProposal {
  if (diagnosis.type === "soft_lock" && ctx.location) {
    return {
      layer: "hint_text",
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
  // Loops, rejected actions, and engine-touching fixes have no content-patch op:
  // the fixer surfaces them as a diagnosis (empty ops) for the agent to fix in code
  // directly under trust, but verify — not a human-approval gate.
  const layer: FixLayer = diagnosis.type === "loop" ? "quest_structure" : "content";
  return {
    layer,
    summary: `Direct code fix required (no content-patch op) for "${diagnosis.type}" at ${ctx.location ?? "unknown"}: ${diagnosis.description}`,
    ops: [],
  };
}

/** A regression-test source stub asserting the diagnosed failure cannot recur (§15). */
export function regressionTestStub(
  bugId: string,
  replayPath: string,
  worldQuestId: string,
): string {
  const replayPathLiteral = JSON.stringify(replayPath);
  const worldQuestIdLiteral = JSON.stringify(worldQuestId);
  return `import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { RpgSourceRuntime } from "../../src/mcp/rpg_source_runtime.js";
import { indexRpgPack, buildRpgRules } from "../../src/rpg/runner.js";
import { replayTrace } from "../../src/trace/replay.js";
import type { Trace } from "../../src/trace/record.js";

// Regression for ${bugId} (§15). The bug's trace must replay to its recorded
// hash forever — if a future change reintroduces the failure, this goes red.
describe("${bugId}", () => {
  it("replays the fixed trace to its expected final hash", () => {
    const trace = JSON.parse(readFileSync(${replayPathLiteral}, "utf8")) as Trace;
    const source = new RpgSourceRuntime(process.cwd()).requireWorldQuestPlayable(${worldQuestIdLiteral});
    const rules = buildRpgRules(indexRpgPack(source.compiled.pack));
    expect(replayTrace(trace, rules).ok).toBe(true);
  });
});
`;
}
