/**
 * ValidationReport (spec §10.3).
 *
 * A source with ANY error-severity finding is unplayable; warnings are advisory.
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
  source_id: string;
  ok: boolean;
  findings: Finding[];
};

function freezeFinding(finding: Finding): Finding {
  return Object.freeze({
    ...finding,
    where: Object.freeze([...finding.where]) as string[],
  });
}

export function makeReport(sourceId: string, findings: Finding[]): ValidationReport {
  const frozenFindings = Object.freeze(findings.map(freezeFinding)) as Finding[];
  return Object.freeze({
    source_id: sourceId,
    ok: !frozenFindings.some((f) => f.severity === "error"),
    findings: frozenFindings,
  });
}

type FormatReportOptions = {
  includeSourceId?: boolean;
};

/** Human-readable formatting for the CLI. */
export function formatReport(report: ValidationReport, opts: FormatReportOptions = {}): string {
  const includeSourceId = opts.includeSourceId ?? true;
  const lines: string[] = [];
  if (includeSourceId) lines.push(`Source: ${report.source_id}`);
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
