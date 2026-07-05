import type { CompiledRpgPack } from "../rpg/pack.js";
import type { ValidationReport } from "../validate/report.js";
import { resolvePackSource, type PackSourceArgs } from "../world/source.js";

export type WorldQuestReportLoadResult =
  | { ok: true; compiled: CompiledRpgPack; report: ValidationReport }
  | { ok: false; report: ValidationReport };

export type WorldQuestReportLoader = (packPath: string) => WorldQuestReportLoadResult;

export type WorldQuestValidationReportResponse = {
  ok: boolean;
  world_quest_id: string | null;
  report: ValidationReport;
};

export type WorldQuestLoadReportResponse = {
  ok: boolean;
  world_quest_id: string | null;
  meta?: CompiledRpgPack["pack"]["meta"];
  content_hash?: string;
  report: ValidationReport;
};

export function validateWorldQuestReport(
  root: string,
  args: PackSourceArgs,
  operation: string,
  loadAndReport: WorldQuestReportLoader,
): WorldQuestValidationReportResponse {
  const source = resolvePackSource(root, args, operation);
  const lr = loadAndReport(source.packPath);
  return {
    ok: lr.report.ok,
    world_quest_id: source.worldQuestId,
    report: lr.report,
  };
}

export function loadWorldQuestReport(
  root: string,
  args: PackSourceArgs,
  operation: string,
  loadAndReport: WorldQuestReportLoader,
): WorldQuestLoadReportResponse {
  const source = resolvePackSource(root, args, operation);
  const lr = loadAndReport(source.packPath);
  if (!lr.ok) {
    return {
      ok: false,
      world_quest_id: source.worldQuestId,
      report: lr.report,
    };
  }
  return {
    ok: lr.report.ok,
    world_quest_id: source.worldQuestId,
    meta: lr.compiled.pack.meta,
    content_hash: lr.compiled.contentHash,
    report: lr.report,
  };
}
