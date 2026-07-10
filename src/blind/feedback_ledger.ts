import { readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { verifyBlindReportText } from "./report_verifier.js";
import type { ExitInterview } from "./exit_interview.js";

export const DEFAULT_FEEDBACK_RECENT_LIMIT = 100;

export interface BlindFeedbackEntry {
  report: string;
  stamp: string;
  source: string;
  seed: number;
  clarity: number;
  enjoyment: number;
  goal_understood: boolean;
  got_stuck: boolean;
  would_replay: boolean;
  confusions: string[];
  bugs: ExitInterview["bugs"];
  best_moment: string;
  worst_moment: string;
  verdict: string;
}

export interface FeedbackTrait {
  key: string;
  category: string;
  text: string;
  count: number;
  latest_stamp: string;
  sources: string[];
}

export interface BlindFeedbackLedger {
  reports_dir: string;
  recent_limit: number;
  accepted_reports: number;
  rejected_reports: number;
  latest_stamp: string | null;
  recent_entries: BlindFeedbackEntry[];
  archived_entry_count: number;
  recent_traits: FeedbackTrait[];
  archived_traits: FeedbackTrait[];
}

interface ReportName {
  stamp: string;
  source: string;
  seed: number;
}

const REPORT_NAME_RE = /^(\d{8}T\d{6}Z)_(.+)_seed(-?\d+)\.md$/;

function parseReportName(name: string): ReportName | null {
  const match = REPORT_NAME_RE.exec(name);
  if (!match) return null;
  const [, stamp, source, seed] = match;
  if (stamp === undefined || source === undefined || seed === undefined) return null;
  return {
    stamp,
    source,
    seed: Number(seed),
  };
}

function sortEntriesNewestFirst(a: BlindFeedbackEntry, b: BlindFeedbackEntry): number {
  return b.stamp.localeCompare(a.stamp) || b.report.localeCompare(a.report);
}

function normalizeTraitText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?;:]+$/g, "")
    .trim();
}

function addTrait(
  traits: Map<string, FeedbackTrait>,
  category: string,
  text: string,
  source: string,
  stamp: string,
): void {
  const normalized = normalizeTraitText(text);
  if (!normalized) return;
  const key = `${category}:${normalized}`;
  const existing = traits.get(key);
  if (existing) {
    existing.count += 1;
    if (stamp > existing.latest_stamp) {
      existing.latest_stamp = stamp;
      existing.text = text;
    }
    if (!existing.sources.includes(source)) {
      existing.sources.push(source);
      existing.sources.sort();
    }
    return;
  }
  traits.set(key, {
    key,
    category,
    text,
    count: 1,
    latest_stamp: stamp,
    sources: [source],
  });
}

function traitsFor(entries: BlindFeedbackEntry[]): FeedbackTrait[] {
  const traits = new Map<string, FeedbackTrait>();
  for (const entry of entries) {
    for (const confusion of entry.confusions) {
      addTrait(traits, "confusion", confusion, entry.source, entry.stamp);
    }
    for (const bug of entry.bugs) {
      addTrait(
        traits,
        `bug ${bug.severity}`,
        `${bug.where}: ${bug.note}`,
        entry.source,
        entry.stamp,
      );
    }
    if (!entry.goal_understood) {
      addTrait(traits, "understanding", "goal was not understood", entry.source, entry.stamp);
    }
    if (entry.got_stuck) {
      addTrait(traits, "stuck", "player got stuck", entry.source, entry.stamp);
    }
    if (!entry.would_replay) {
      addTrait(traits, "replay", "player would not replay", entry.source, entry.stamp);
    }
    addTrait(traits, "worst moment", entry.worst_moment, entry.source, entry.stamp);
  }
  return [...traits.values()].sort(
    (a, b) =>
      b.count - a.count ||
      b.latest_stamp.localeCompare(a.latest_stamp) ||
      a.key.localeCompare(b.key),
  );
}

function truncate(text: string, maxLength: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLength) return oneLine;
  return `${oneLine.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function buildBlindFeedbackLedger(
  reportsDir: string,
  options: { recentLimit?: number; cwd?: string } = {},
): BlindFeedbackLedger {
  const recentLimit = options.recentLimit ?? DEFAULT_FEEDBACK_RECENT_LIMIT;
  const cwd = options.cwd ?? process.cwd();
  const entries: BlindFeedbackEntry[] = [];
  let rejectedReports = 0;

  for (const name of readdirSync(reportsDir)) {
    if (!name.endsWith(".md")) continue;
    const parsedName = parseReportName(name);
    if (!parsedName) {
      rejectedReports += 1;
      continue;
    }
    const fullPath = join(reportsDir, name);
    const reportText = readFileSync(fullPath, "utf8");
    const verification = verifyBlindReportText(reportText);
    if (!verification.ok) {
      rejectedReports += 1;
      continue;
    }
    const interview = verification.interview;
    entries.push({
      report: relative(cwd, fullPath).replace(/\\/g, "/"),
      stamp: parsedName.stamp,
      source: parsedName.source,
      seed: parsedName.seed,
      clarity: interview.clarity,
      enjoyment: interview.enjoyment,
      goal_understood: interview.goal_understood,
      got_stuck: interview.got_stuck,
      would_replay: interview.would_replay,
      confusions: interview.confusions,
      bugs: interview.bugs,
      best_moment: interview.best_moment,
      worst_moment: interview.worst_moment,
      verdict: interview.verdict,
    });
  }

  entries.sort(sortEntriesNewestFirst);
  const recentEntries = entries.slice(0, recentLimit);
  const archivedEntries = entries.slice(recentLimit);

  return {
    reports_dir: relative(cwd, reportsDir).replace(/\\/g, "/") || basename(reportsDir),
    recent_limit: recentLimit,
    accepted_reports: entries.length,
    rejected_reports: rejectedReports,
    latest_stamp: entries[0]?.stamp ?? null,
    recent_entries: recentEntries,
    archived_entry_count: archivedEntries.length,
    recent_traits: traitsFor(recentEntries),
    archived_traits: traitsFor(archivedEntries),
  };
}

function renderTraits(traits: FeedbackTrait[], emptyText: string, limit: number): string {
  if (traits.length === 0) return `${emptyText}\n`;
  const rows = [
    "| Count | Latest | Category | Trait | Sources |",
    "| ---: | --- | --- | --- | --- |",
  ];
  for (const trait of traits.slice(0, limit)) {
    rows.push(
      `| ${trait.count} | ${trait.latest_stamp} | ${escapeCell(trait.category)} | ${escapeCell(
        truncate(trait.text, 120),
      )} | ${escapeCell(trait.sources.join(", "))} |`,
    );
  }
  return `${rows.join("\n")}\n`;
}

function renderEntrySummary(entry: BlindFeedbackEntry): string {
  const parts: string[] = [];
  if (entry.confusions.length > 0) {
    parts.push(`confusions: ${entry.confusions.join("; ")}`);
  }
  if (entry.bugs.length > 0) {
    parts.push(`bugs: ${entry.bugs.map((b) => `${b.severity} ${b.where}: ${b.note}`).join("; ")}`);
  }
  if (entry.got_stuck) parts.push("got stuck");
  if (!entry.goal_understood) parts.push("goal unclear");
  if (!entry.would_replay) parts.push("would not replay");
  if (parts.length === 0) parts.push(`worst: ${entry.worst_moment}`);
  return truncate(parts.join(" | "), 170);
}

export function renderBlindFeedbackLedgerMarkdown(ledger: BlindFeedbackLedger): string {
  const lines = [
    "# Blind Feedback Ledger",
    "",
    "Generated deterministically from verified blind reports. The latest entries stay explicit; older entries are collapsed into trait counts so repeated feedback remains visible without turning this file into a transcript.",
    "",
    "## Summary",
    "",
    `- Reports dir: \`${ledger.reports_dir}\``,
    `- Accepted reports: ${ledger.accepted_reports}`,
    `- Rejected or ignored markdown reports: ${ledger.rejected_reports}`,
    `- Latest report stamp: ${ledger.latest_stamp ?? "none"}`,
    `- Recent entry limit: ${ledger.recent_limit}`,
    `- Archived accepted entries collapsed into traits: ${ledger.archived_entry_count}`,
    "",
    "## Recent Common Traits",
    "",
    renderTraits(ledger.recent_traits, "No recent accepted feedback yet.", 25).trimEnd(),
    "",
    "## Recent Entries",
    "",
  ];

  if (ledger.recent_entries.length === 0) {
    lines.push("No accepted feedback entries yet.", "");
  } else {
    lines.push(
      "| Stamp | Source | Seed | C/E | Stuck | Replay | Report | Signal |",
      "| --- | --- | ---: | --- | --- | --- | --- | --- |",
    );
    for (const entry of ledger.recent_entries) {
      lines.push(
        `| ${entry.stamp} | ${escapeCell(entry.source)} | ${entry.seed} | ${entry.clarity}/${entry.enjoyment} | ${
          entry.got_stuck ? "yes" : "no"
        } | ${entry.would_replay ? "yes" : "no"} | \`${entry.report}\` | ${escapeCell(
          renderEntrySummary(entry),
        )} |`,
      );
    }
    lines.push("");
  }

  lines.push(
    "## Archived Trait Categories",
    "",
    renderTraits(ledger.archived_traits, "No archived accepted entries yet.", 25).trimEnd(),
    "",
  );

  return `${lines.join("\n").trimEnd()}\n`;
}
