/**
 * Feedback compiler orchestration — turns verified blind-tester reports
 * (Tier 3 fleet) and crawler `findings.jsonl` rows (Tier 2) into the ranked
 * `hotspots.json` / `hotspots.md` artifacts plus the mode-separated
 * `retention.json` evidence summary. NO LLM anywhere in this
 * pipeline: `collectInputs` gates and parses, `normalize`/`cluster`/`rank`
 * (Tasks 14-15) do the deterministic analysis, this module wires them
 * together and renders the two output files.
 *
 * Pipeline (see `compileFeedback`):
 *   collect inputs (verify reports, parse crawl findings) -> build fleet +
 *   crawler IssueRecords -> canonicalize locations -> cluster -> rank -> take
 *   the top K clusters -> build Hotspots -> apply trends vs. a previous
 *   compile -> compute the single recommended-next-fix -> compute metrics +
 *   sycophancy telemetry -> assemble + self-validate the HotspotsFile ->
 *   write hotspots.json (canonical bytes) + retention.json (mode-separated
 *   retention evidence) + hotspots.md (human report).
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { isPureExitInterviewV2, type ExitInterview } from "../blind/exit_interview.js";
import { verifyBlindReportText } from "../blind/report_verifier.js";
import { parseBlindRunSidecar } from "../blind/run_evidence.js";
import { CrawlFindingSchema, type CrawlFinding } from "../crawl/findings.js";
import { canonicalize, shortHash } from "../core/hash.js";
import { clusterIssues, type IssueCluster, type IssueRecord } from "./cluster.js";
import { summarizeFeedbackEvidence, type FeedbackEvidenceSummary } from "./evidence_summary.js";
import {
  sycophancyTelemetry,
  targetMetrics,
  type PersonaInterview,
  type TargetInterview,
} from "./metrics.js";
import { buildLocationIndex, canonicalizeLocation, type LocationIndex } from "./normalize.js";
import { recommendNextFix, scoreCluster, suggestFixLayer, SEVERITY_WEIGHT } from "./rank.js";
import { HOTSPOTS_VERSION, HotspotsFileSchema, type Hotspot, type HotspotsFile } from "./schema.js";
import { applyTrends, loadHotspotsFromDir, loadPreviousHotspots } from "./trends.js";

// --- CompileOptions ---------------------------------------------------------

/**
 * `prevDir` is not in the task brief's illustrative interface sketch, but the
 * brief's own acceptance-test design note requires it: "implement --prev
 * <dir> for testability" so a caller can pin the trend comparison to an
 * EXACT prior compile directory instead of depending on the wall-clock
 * `ai-runs/feedback/` auto-scan (`loadPreviousHotspots`). Required (not
 * optional) so a caller must say `null` to mean "auto-scan" — under this
 * repo's `exactOptionalPropertyTypes`, that reads better than an
 * optional-but-never-undefined field.
 */
export type CompileOptions = {
  root: string;
  inputs: string[];
  outDir: string;
  topK: number;
  llmLabels: boolean;
  prevDir: string | null;
};

// --- readLatestHotspots ------------------------------------------------------

/**
 * The assessor's (Task 17) read side of this module: the most recently
 * compiled `hotspots.json` under `<root>/ai-runs/feedback/`, schema-validated,
 * or `null` when there is no feedback directory yet, or every compile found
 * there is missing/unreadable/malformed. This is exactly `loadPreviousHotspots`
 * (trends.ts) called with no "before" cutoff — that function already scans
 * `ai-runs/feedback/*`, picks the lexicographically-newest directory that
 * holds a valid `HotspotsFileSchema` file, and resolves to `null` on a
 * missing dir or an all-invalid scan — so this is a thin, purpose-named
 * wrapper rather than a second implementation of the same disk walk. Kept in
 * `src/feedback` (re-exported by the assessor) so the hotspots schema/file
 * layout stays known in exactly one place.
 */
export function readLatestHotspots(root: string): HotspotsFile | null {
  return loadPreviousHotspots(root, null);
}

// --- collectInputs -----------------------------------------------------------

const LEDGER_RE = /^(\d{8}T\d{6}Z)_(.+)_seed(-?\d+)\.md$/;

function parseLedgerFilename(name: string): { slug: string } | null {
  const m = LEDGER_RE.exec(name);
  return m ? { slug: m[2]! } : null;
}

function targetFromSlug(slug: string): string {
  return slug === "overworld" ? "overworld" : `quest:${slug}`;
}

type ManifestRow = { persona: string | null; target: string };

/**
 * Indexes every `ai-runs/fleet/<label>/manifest.jsonl` row under `root` by
 * `basename(report)` — a fleet run's manifest is written under
 * `ai-runs/fleet/<label>/`, never alongside the reports themselves (which
 * may live anywhere `--out`/`fleet.mjs --out` pointed at, including a tmp
 * dir), so matching on the report's basename is the only join key that
 * survives the report file moving. Malformed rows/lines are skipped rather
 * than failing the whole compile.
 */
function buildManifestIndex(root: string): Map<string, ManifestRow> {
  const index = new Map<string, ManifestRow>();
  const fleetRoot = join(root, "ai-runs", "fleet");
  if (!existsSync(fleetRoot)) return index;

  const labels = readdirSync(fleetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const label of labels) {
    const manifestPath = join(fleetRoot, label, "manifest.jsonl");
    if (!existsSync(manifestPath)) continue;
    const lines = readFileSync(manifestPath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (const line of lines) {
      let row: unknown;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof row !== "object" || row === null) continue;
      const r = row as Record<string, unknown>;
      if (typeof r.report !== "string" || typeof r.target !== "string") continue;
      const persona = typeof r.persona === "string" ? r.persona : null;
      index.set(basename(r.report), { persona, target: r.target });
    }
  }
  return index;
}

export type CollectedInterview = {
  /** Report basename — the evidence `ref` every IssueRecord from this report cites. */
  ref: string;
  persona: string | null;
  target: string; // "overworld" | "quest:<id>"
  interview: ExitInterview;
};

export type CollectInputsResult = {
  interviews: CollectedInterview[];
  crawlFindings: CrawlFinding[];
  /** Parallel to `crawlFindings` — `"<jsonl-basename>#<row-index>"` evidence refs. */
  crawlFindingRefs: string[];
  verified: number;
  rejected: number;
  reportDirs: string[];
  crawlFiles: string[];
};

type ReportOutcome = CollectedInterview | { rejected: true };

function resolveReport(
  filePath: string,
  fileName: string,
  text: string,
  manifestIndex: ReadonlyMap<string, ManifestRow>,
): ReportOutcome {
  let verification = verifyBlindReportText(text);
  if (!verification.ok) return { rejected: true };

  // Pure UX prose is not retention evidence by itself. Apply the same
  // adjacent-sidecar gate as the durable feedback ledger so a timed-out,
  // copied, or otherwise unverified V2-shaped report cannot enter Tier 3 as a
  // live-player run. Legacy reports stay readable as legacy-guided evidence;
  // structural V2 reports remain explicit QA inputs rather than pure evidence.
  if (isPureExitInterviewV2(verification.interview)) {
    const sidecarPath = filePath.replace(/\.md$/, ".run.json");
    if (!existsSync(sidecarPath)) return { rejected: true };
    // A reused explicit output prefix must not let an older successful run's
    // sidecar bless a newer timed-out/partial report. The verifier writes the
    // sidecar only after the report and server evidence both pass, so a valid
    // adjacent sidecar cannot predate its report.
    if (statSync(sidecarPath).mtimeMs < statSync(filePath).mtimeMs) return { rejected: true };
    const sidecar = parseBlindRunSidecar(readFileSync(sidecarPath, "utf8"));
    if (!sidecar.ok) return { rejected: true };
    verification = verifyBlindReportText(text, {
      requiredPlayMode: "pure",
      runSidecar: sidecar.sidecar,
    });
    if (!verification.ok) return { rejected: true };
  }

  const manifestRow = manifestIndex.get(fileName);
  if (manifestRow) {
    return {
      ref: fileName,
      persona: manifestRow.persona,
      target: manifestRow.target,
      interview: verification.interview,
    };
  }
  const ledger = parseLedgerFilename(fileName);
  return {
    ref: fileName,
    persona: null,
    target: ledger ? targetFromSlug(ledger.slug) : "overworld",
    interview: verification.interview,
  };
}

/**
 * Reads every `--in` path: a directory is scanned (non-recursively) for
 * `*.md` reports, each gated through `verifyBlindReportText` (a rejected
 * report is counted but excluded from every downstream step — no
 * IssueRecords, no metrics); a `.jsonl` path is parsed as crawler
 * `findings.jsonl` rows (schema-validated per row); a lone `.md` path is
 * treated as a single report. Any other extension, or a path that doesn't
 * exist, is a usage error (thrown, not silently skipped — a typo'd `--in`
 * should fail loudly).
 */
export function collectInputs(root: string, inputs: string[]): CollectInputsResult {
  const manifestIndex = buildManifestIndex(root);
  const interviews: CollectedInterview[] = [];
  const crawlFindings: CrawlFinding[] = [];
  const crawlFindingRefs: string[] = [];
  let verified = 0;
  let rejected = 0;
  const reportDirs: string[] = [];
  const crawlFiles: string[] = [];

  const addReport = (filePath: string, fileName: string): void => {
    const text = readFileSync(filePath, "utf8");
    const outcome = resolveReport(filePath, fileName, text, manifestIndex);
    if ("rejected" in outcome) {
      rejected++;
      return;
    }
    verified++;
    interviews.push(outcome);
  };

  for (const input of inputs) {
    const resolved = resolve(root, input);
    if (!existsSync(resolved)) {
      throw new Error(`feedback compile: --in path not found: "${input}"`);
    }
    const stat = statSync(resolved);
    if (stat.isDirectory()) {
      reportDirs.push(input);
      const mdFiles = readdirSync(resolved)
        .filter((f) => f.endsWith(".md"))
        .sort();
      for (const f of mdFiles) addReport(join(resolved, f), f);
    } else if (resolved.endsWith(".jsonl")) {
      crawlFiles.push(input);
      const base = basename(resolved);
      const lines = readFileSync(resolved, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      lines.forEach((line, i) => {
        const finding = CrawlFindingSchema.parse(JSON.parse(line));
        crawlFindings.push(finding);
        crawlFindingRefs.push(`${base}#${i}`);
      });
    } else if (resolved.endsWith(".md")) {
      reportDirs.push(input);
      addReport(resolved, basename(resolved));
    } else {
      throw new Error(
        `feedback compile: unsupported --in path "${input}" (expected a directory, .md file, or .jsonl file)`,
      );
    }
  }

  return {
    interviews,
    crawlFindings,
    crawlFindingRefs,
    verified,
    rejected,
    reportDirs,
    crawlFiles,
  };
}

// --- IssueRecord construction --------------------------------------------

/**
 * Fleet IssueRecords: one per interview bug (severity from the bug) plus one
 * per confusion at a fixed S1 — a confusion is real friction, but never
 * carries its own severity rating, so it is deliberately weighted low rather
 * than guessed. `text` is JUST the bug's note / the confusion string (never
 * prefixed with `where`) — location is tracked separately via
 * `canonicalizeLocation`, so folding it into `text` too would only pad every
 * token-overlap comparison with redundant words.
 */
function fleetIssueRecords(
  interviews: readonly CollectedInterview[],
  idx: LocationIndex,
): IssueRecord[] {
  const records: IssueRecord[] = [];
  for (const { ref, persona, target, interview } of interviews) {
    for (const bug of interview.bugs) {
      records.push({
        source: "fleet",
        ref,
        location: canonicalizeLocation(bug.where, idx),
        severity: bug.severity,
        text: bug.note,
        persona,
        target,
      });
    }
    for (const confusion of interview.confusions) {
      records.push({
        source: "fleet",
        ref,
        location: canonicalizeLocation(confusion, idx),
        severity: "S1",
        text: confusion,
        persona,
        target,
      });
    }
  }
  return records;
}

/** The most specific structured id a crawl finding's location carries — fed
 *  through the SAME `canonicalizeLocation` ladder as fleet free text. Crawler
 *  locations are already real engine ids, so this reliably lands on rung 1
 *  (exact id hit) rather than needing the fuzzy name rungs fleet prose does.
 *  Falls back to a non-empty marker (never `""`) when every field is null —
 *  an empty raw string would resolve to `unmapped` with `raw: [""]`, which
 *  could otherwise surface as a blank Hotspot title. */
function crawlerLocationRawText(location: CrawlFinding["location"]): string {
  return (
    location.sceneId ??
    location.questId ??
    location.node ??
    location.region ??
    "unmapped-crawler-finding"
  );
}

/** Crawler IssueRecords: one per finding, `text = "<CODE>: <message>"` (parsed
 *  back out by rank.ts's fix-layer routing) — EXCLUDING `ORPHAN` rows, which
 *  are coverage bookkeeping, not issues (counted in `inputs.crawl_findings`,
 *  never clustered). */
function crawlerIssueRecords(
  findings: readonly CrawlFinding[],
  refs: readonly string[],
  idx: LocationIndex,
): IssueRecord[] {
  const records: IssueRecord[] = [];
  findings.forEach((finding, i) => {
    if (finding.code === "ORPHAN") return;
    records.push({
      source: "crawler",
      ref: refs[i]!,
      location: canonicalizeLocation(crawlerLocationRawText(finding.location), idx),
      severity: finding.severity,
      text: `${finding.code}: ${finding.message}`,
      persona: null,
      target: finding.location.questId ? `quest:${finding.location.questId}` : "overworld",
    });
  });
  return records;
}

// --- Hotspot construction -----------------------------------------------

/** Up to 3 evidence excerpts, preferring DISTINCT refs (a report/finding that
 *  contributed several issues to one cluster should not crowd out other
 *  independent evidence). `cluster.issues` is never empty, so this always
 *  yields at least one entry (HotspotSchema's evidence.min(1)). */
function buildEvidence(cluster: IssueCluster): Hotspot["evidence"] {
  const evidence: Hotspot["evidence"] = [];
  const seenRefs = new Set<string>();
  for (const issue of cluster.issues) {
    if (evidence.length >= 3) break;
    if (seenRefs.has(issue.ref)) continue;
    seenRefs.add(issue.ref);
    evidence.push({ source: issue.source, ref: issue.ref, excerpt: issue.text.slice(0, 300) });
  }
  return evidence;
}

/** A location's `raw` audit trail can be a short place name ("Albany Station
 *  Quarter") or, when the only issue that resolved to this location was a
 *  free-text confusion sentence, an entire sentence — cap the TITLE's use of
 *  it so that case doesn't produce an unreadable wall of text. Purely
 *  cosmetic: `location.raw` itself (and every evidence excerpt) is untouched. */
const MAX_TITLE_LOCATION_LABEL = 60;

function titleLocationLabel(raw: string): string {
  return raw.length > MAX_TITLE_LOCATION_LABEL
    ? `${raw.slice(0, MAX_TITLE_LOCATION_LABEL - 1)}…`
    : raw;
}

/** `trend`/`prev_score` are placeholders here — `applyTrends` (trends.ts)
 *  overwrites both once the full current-hotspot list exists. */
function buildHotspotFromCluster(cluster: IssueCluster): Hotspot {
  const tokenPart = cluster.tokens.slice(0, 4).join(" ");
  const locationLabel = titleLocationLabel(cluster.location.raw[0]!);
  const title = tokenPart.length > 0 ? `${tokenPart} @ ${locationLabel}` : locationLabel;
  return {
    id: shortHash(cluster.key),
    title,
    location: cluster.location,
    severity_band: cluster.severityBand,
    max_severity: cluster.maxSeverity,
    count: cluster.issues.length,
    sources: cluster.sources,
    personas: cluster.personas,
    score: scoreCluster(cluster),
    fix_layer: suggestFixLayer(cluster),
    evidence: buildEvidence(cluster),
    trend: "new",
    prev_score: null,
  };
}

/** Deterministic tiebreak for equal scores: ascending cluster key — never
 *  input-array order (the clusters array itself is already order-independent
 *  per cluster.ts, but scoreCluster ties still need SOME fixed tiebreaker). */
function compareClustersByScoreDesc(a: IssueCluster, b: IssueCluster): number {
  const diff = scoreCluster(b) - scoreCluster(a);
  if (diff !== 0) return diff;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * YAGNI seam for an optional LLM labeling pass. Per the brief, `llmLabels`
 * may ONLY ever rewrite `Hotspot.title` via an external call — membership,
 * ordering, ids, and scores must stay untouched regardless. Not implemented:
 * bin/feedback.ts prints "labels pass skipped (not configured)" when the flag
 * is set, and this always returns `hotspots` unchanged either way.
 */
function applyLlmLabels(hotspots: Hotspot[], _enabled: boolean): Hotspot[] {
  return hotspots;
}

/** `git rev-parse --short HEAD`, trimmed; "unknown" on any failure (never
 *  throws) — content identity for the compile, not a timestamp. */
function resolveCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

// --- hotspots.md rendering ------------------------------------------------

function fmtPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function trendLabel(h: Hotspot): string {
  switch (h.trend) {
    case "new":
      return "new";
    case "improved":
      return `improved (prev score ${h.prev_score})`;
    case "regressed":
      return `regressed (prev score ${h.prev_score})`;
    case "flat":
      return `flat (prev score ${h.prev_score})`;
  }
}

function describeLocation(loc: Hotspot["location"]): string {
  if (loc.kind === "quest") {
    return loc.sceneId ? `quest:${loc.questId}/${loc.sceneId}` : `quest:${loc.questId}`;
  }
  if (loc.kind === "overworld") {
    if (loc.node) return `overworld:${loc.node}`;
    if (loc.region) return `overworld region:${loc.region}`;
    return "overworld";
  }
  return `unmapped (${loc.raw[0]})`;
}

type HotspotRenderRow = { hotspot: Hotspot; distinctReports: number };

function renderHotspotsMarkdown(
  file: HotspotsFile,
  rows: readonly HotspotRenderRow[],
  evidence: FeedbackEvidenceSummary,
): string {
  const lines: string[] = [];
  lines.push("# Feedback Hotspots");
  lines.push("");
  lines.push(`Generated: ${file.generated_at}`);
  lines.push(`Commit: ${file.commit}`);
  lines.push("");

  lines.push("## Inputs");
  lines.push(`- Report dirs: ${file.inputs.report_dirs.join(", ") || "(none)"}`);
  lines.push(`- Crawl files: ${file.inputs.crawl_files.join(", ") || "(none)"}`);
  lines.push(`- Verified reports: ${file.inputs.verified_reports}`);
  lines.push(`- Rejected reports: ${file.inputs.rejected_reports}`);
  lines.push(`- Crawl findings: ${file.inputs.crawl_findings}`);
  lines.push(
    `- Verified report modes: pure ${evidence.report_modes.pure}, structural ${evidence.report_modes.structural}, legacy-guided ${evidence.report_modes.legacy_guided}`,
  );
  lines.push(
    "- Experience metrics and hot spots include every verified mode; only the pure count below is retention evidence.",
  );
  lines.push("");

  const retention = evidence.pure_retention;
  lines.push("## Pure retention");
  lines.push("");
  lines.push(`- Evidence-eligible pure exits: ${retention.eligible_reports}`);
  lines.push(
    "- Decision counts, checkpoints, and continuation choices are reported within their journey-contract version; incompatible contracts are never pooled into one retention curve.",
  );
  lines.push(
    "- `would_replay` is a post-exit attitude metric; it is not counted as a continuation choice.",
  );
  lines.push("");
  if (retention.contract_versions.length === 0) {
    lines.push("No eligible pure exits were available for a contract-specific curve.");
    lines.push("");
  }

  for (const cohort of retention.contract_versions) {
    lines.push(`### Journey contract v${cohort.contract_version}`);
    lines.push("");
    lines.push(`- Eligible pure exits: ${cohort.eligible_reports}`);
    lines.push(`- Players who continued at least once: ${cohort.continued_reports}`);
    lines.push(
      `- Players who ended at their first choice: ${cohort.ended_at_first_choice_reports}`,
    );
    lines.push(
      `- Actual game choices: ${cohort.choices.continue} continue, ${cohort.choices.end} end`,
    );
    lines.push(
      `- Journey decisions under this contract: ${cohort.accepted_decisions.minimum}–${cohort.accepted_decisions.maximum} (mean ${cohort.accepted_decisions.mean.toFixed(2)})`,
    );
    lines.push(
      `- Exit reasons: ${cohort.exit_reasons.map((row) => `${row.reason} ${row.count}`).join(", ")}`,
    );
    lines.push("");
    lines.push("| choice trigger | continue | end |");
    lines.push("| --- | ---: | ---: |");
    for (const [trigger, counts] of Object.entries(cohort.choice_triggers)) {
      lines.push(`| ${trigger} | ${counts.continue} | ${counts.end} |`);
    }
    lines.push("");
    if (cohort.checkpoints.length > 0) {
      lines.push("| checkpoint decision | continue | end |");
      lines.push("| ---: | ---: | ---: |");
      for (const checkpoint of cohort.checkpoints) {
        lines.push(`| ${checkpoint.decision} | ${checkpoint.continue} | ${checkpoint.end} |`);
      }
      lines.push("");
    }
  }

  lines.push("## Sycophancy");
  lines.push(`- Reports: ${file.sycophancy.reports}`);
  lines.push(`- Zero-negative rate: ${fmtPct(file.sycophancy.zero_negative_rate)}`);
  lines.push(`- Clarity histogram (1-5): ${file.sycophancy.clarity_histogram.join(", ")}`);
  lines.push(`- Enjoyment histogram (1-5): ${file.sycophancy.enjoyment_histogram.join(", ")}`);
  const personaKeys = Object.keys(file.sycophancy.by_persona_zero_negative).sort();
  if (personaKeys.length > 0) {
    lines.push("- Per-persona zero-negative rate:");
    for (const persona of personaKeys) {
      lines.push(`  - ${persona}: ${fmtPct(file.sycophancy.by_persona_zero_negative[persona]!)}`);
    }
  }
  lines.push("");

  lines.push("## Per-target experience");
  lines.push("");
  lines.push("| target | reports | clarity mean | enjoyment mean | got stuck | would replay |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const m of file.metrics) {
    lines.push(
      `| ${m.target} | ${m.reports} | ${m.clarity.mean.toFixed(2)} | ${m.enjoyment.mean.toFixed(2)} | ${fmtPct(m.got_stuck_rate)} | ${fmtPct(m.would_replay_rate)} |`,
    );
  }
  lines.push("");

  lines.push(`## Top ${rows.length} hot spots`);
  lines.push("");
  rows.forEach(({ hotspot, distinctReports }, i) => {
    const sevWeight = SEVERITY_WEIGHT[hotspot.max_severity];
    // Exact recovery of the diversity factor (1 or BOTH_SOURCES_BONUS) baked
    // into `score` — integer division, always exact (score IS count*sev*diversity).
    const diversity = hotspot.score / (hotspot.count * sevWeight);
    lines.push(`### ${i + 1}. ${hotspot.title}`);
    lines.push("");
    lines.push(
      `- Score: ${hotspot.score} (${hotspot.count} issue mentions × severity weight ${sevWeight} × diversity ${diversity})`,
    );
    lines.push(`- Trend: ${trendLabel(hotspot)}`);
    lines.push(`- Location: ${describeLocation(hotspot.location)}`);
    lines.push(`- Fix layer: ${hotspot.fix_layer}`);
    lines.push(
      `- Count: ${hotspot.count} issue mentions across ${distinctReports} report${distinctReports === 1 ? "" : "s"}`,
    );
    lines.push(`- Sources: ${hotspot.sources.join(", ")}`);
    lines.push("- Evidence:");
    for (const ev of hotspot.evidence) {
      lines.push(`  - [${ev.source}] ${ev.ref}: ${ev.excerpt}`);
    }
    lines.push("");
  });

  lines.push("## Recommended next fix");
  lines.push("");
  if (file.recommended_next_fix) {
    const match = rows.find((r) => r.hotspot.id === file.recommended_next_fix!.hotspot_id);
    const label = match ? match.hotspot.title : file.recommended_next_fix.hotspot_id;
    lines.push(
      `Hotspot \`${file.recommended_next_fix.hotspot_id}\` — ${label}: ${file.recommended_next_fix.rationale}`,
    );
  } else {
    lines.push("None — no hotspots were found in this compile.");
  }
  lines.push("");

  return lines.join("\n");
}

// --- compileFeedback ---------------------------------------------------------

export function compileFeedback(opts: CompileOptions): {
  file: HotspotsFile;
  evidence: FeedbackEvidenceSummary;
  jsonPath: string;
  mdPath: string;
  retentionPath: string;
} {
  const idx = buildLocationIndex(opts.root);
  const collected = collectInputs(opts.root, opts.inputs);
  const evidence = summarizeFeedbackEvidence(collected.interviews);

  const issues = [
    ...fleetIssueRecords(collected.interviews, idx),
    ...crawlerIssueRecords(collected.crawlFindings, collected.crawlFindingRefs, idx),
  ];
  const clusters = clusterIssues(issues);
  const ranked = [...clusters].sort(compareClustersByScoreDesc);
  const top = ranked.slice(0, opts.topK);

  const rawHotspots = top.map(buildHotspotFromCluster);

  const previous = opts.prevDir
    ? loadHotspotsFromDir(opts.prevDir, /* isExplicit */ true)
    : loadPreviousHotspots(opts.root, basename(opts.outDir));
  const trended = applyTrends(rawHotspots, previous);
  const hotspots = applyLlmLabels(trended, opts.llmLabels);

  const recommendation = recommendNextFix(top);
  const recommended_next_fix = recommendation
    ? { hotspot_id: shortHash(recommendation.hotspot_id), rationale: recommendation.rationale }
    : null;

  const targetInterviews: TargetInterview[] = collected.interviews.map((r) => ({
    target: r.target,
    persona: r.persona,
    interview: r.interview,
  }));
  const personaInterviews: PersonaInterview[] = collected.interviews.map((r) => ({
    persona: r.persona,
    interview: r.interview,
  }));

  const file: HotspotsFile = {
    version: HOTSPOTS_VERSION,
    generated_at: new Date().toISOString(),
    commit: resolveCommit(),
    inputs: {
      report_dirs: collected.reportDirs,
      crawl_files: collected.crawlFiles,
      verified_reports: collected.verified,
      rejected_reports: collected.rejected,
      crawl_findings: collected.crawlFindings.length,
    },
    metrics: targetMetrics(targetInterviews),
    sycophancy: sycophancyTelemetry(personaInterviews),
    hotspots,
    recommended_next_fix,
  };

  // Self-validate before ever writing a byte — a compiler bug that produces a
  // malformed HotspotsFile must fail loudly here, not ship a file readers choke on.
  const validated = HotspotsFileSchema.parse(file);

  mkdirSync(opts.outDir, { recursive: true });
  const jsonPath = join(opts.outDir, "hotspots.json");
  writeFileSync(jsonPath, `${canonicalize(validated)}\n`, "utf8");
  const retentionPath = join(opts.outDir, "retention.json");
  writeFileSync(retentionPath, `${canonicalize(evidence)}\n`, "utf8");

  const rows: HotspotRenderRow[] = top.map((cluster, i) => ({
    hotspot: hotspots[i]!,
    distinctReports: new Set(cluster.issues.map((issue) => issue.ref)).size,
  }));
  const mdPath = join(opts.outDir, "hotspots.md");
  writeFileSync(mdPath, renderHotspotsMarkdown(validated, rows, evidence), "utf8");

  return { file: validated, evidence, jsonPath, mdPath, retentionPath };
}
