/**
 * ValidationReport (spec §10.3).
 *
 * A pack with ANY error-severity finding is unplayable; warnings are advisory.
 * Authoring agents iterate until the report is green (§10).
 */
export type Severity = "error" | "warning";

export type Finding = {
  severity: Severity;
  code: string;
  message: string;
  where: string[];
};

export type ValidationReport = {
  pack_id: string;
  ok: boolean;
  findings: Finding[];
};

export function makeReport(packId: string, findings: Finding[]): ValidationReport {
  return {
    pack_id: packId,
    ok: !findings.some((f) => f.severity === "error"),
    findings,
  };
}

type FormatReportOptions = {
  includePackId?: boolean;
};

/** Human-readable formatting for the CLI. */
export function formatReport(report: ValidationReport, opts: FormatReportOptions = {}): string {
  const includePackId = opts.includePackId ?? true;
  const lines: string[] = [];
  if (includePackId) lines.push(`Pack: ${report.pack_id}`);
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warnings = report.findings.filter((f) => f.severity === "warning").length;
  lines.push(
    `Result: ${report.ok ? "OK" : "FAILED"}  (${errors} error(s), ${warnings} warning(s))`,
  );
  for (const f of report.findings) {
    const tag = f.severity === "error" ? "ERROR" : "warn ";
    lines.push(`  [${tag}] ${f.code}: ${f.message}`);
    if (f.where.length) lines.push(`          where: ${f.where.join(", ")}`);
  }
  return lines.join("\n");
}
