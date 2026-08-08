import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parseBlindRunSidecar } from "../blind/run_evidence.js";

const CYCLE_STAMP_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/u;

function portablePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function physicalPath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}

function pathSegmentEquals(actual: string, expected: string): boolean {
  return process.platform === "win32"
    ? actual.toLocaleLowerCase("en-US") === expected.toLocaleLowerCase("en-US")
    : actual === expected;
}

/** True only for the exact wall-clock id emitted by ai-loop's cycleStamp(). */
export function isCycleStamp(value: string): boolean {
  const match = CYCLE_STAMP_RE.exec(value);
  if (!match) return false;
  const iso = `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
  const date = new Date(iso);
  return !Number.isNaN(date.valueOf()) && date.toISOString().replace(/[:.]/gu, "-") === value;
}

function isRegularFile(path: string): boolean {
  try {
    const stat = lstatSync(path);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function isRegularDirectory(path: string): boolean {
  try {
    const stat = lstatSync(path);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Return the stable evidence ref for an exact immediate
 * `ai-runs/<cycle-stamp>/playtest.md` path, or null for every other path.
 * This is deliberately a path-shape check; report admission still happens in
 * collectInputs through the existing sidecar, receipt, and provider gates.
 */
function canonicalRefFromRelative(rel: string): string | null {
  if (rel.length === 0 || isAbsolute(rel)) return null;
  const parts = portablePath(rel).split("/");
  if (
    parts.length !== 3 ||
    !pathSegmentEquals(parts[0]!, "ai-runs") ||
    !isCycleStamp(parts[1]!) ||
    !pathSegmentEquals(parts[2]!, "playtest.md")
  ) {
    return null;
  }
  return `ai-runs/${parts[1]!}/playtest.md`;
}

export function canonicalCycleReportRef(root: string, path: string): string | null {
  // Lexical shape keeps a canonical slot pure even when an explicit path walks
  // through a symlink/junction. Physical shape handles Windows case aliases and
  // callers that reach the same real file through another in-root spelling.
  const lexical = canonicalRefFromRelative(relative(resolve(root), resolve(path)));
  if (lexical) return lexical;
  return canonicalRefFromRelative(relative(physicalPath(root), physicalPath(path)));
}

/**
 * Discover build-bound pure publication candidates written directly under
 * ai-runs by ai-loop or an explicit blind run with a canonical --out. V1
 * sidecars, structural QA, partial publications, alternate report names,
 * nested outputs, and symlinks are never automatic. collectInputs still runs
 * the full report/receipt/provider gates; discovery never grants authority.
 * Explicit noncanonical inputs remain available, while the canonical
 * playtest slot itself is always pure.
 */
export function discoverCanonicalCycleReports(root: string): string[] {
  const aiRunsRoot = join(resolve(root), "ai-runs");
  if (!existsSync(aiRunsRoot) || !isRegularDirectory(aiRunsRoot)) return [];

  return readdirSync(aiRunsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isCycleStamp(entry.name))
    .map((entry) => {
      const report = join(aiRunsRoot, entry.name, "playtest.md");
      const sidecar = join(aiRunsRoot, entry.name, "playtest.run.json");
      if (!isRegularFile(report) || !isRegularFile(sidecar)) return null;

      let parsed: ReturnType<typeof parseBlindRunSidecar>;
      try {
        parsed = parseBlindRunSidecar(readFileSync(sidecar, "utf8"));
      } catch {
        // Discovery is best-effort across ignored local evidence. A candidate
        // removed between lstat and read must not hide every other valid run.
        return null;
      }
      if (
        !parsed.ok ||
        parsed.sidecar.play_mode !== "pure" ||
        parsed.sidecar.schema_version !== 2
      ) {
        return null;
      }
      return canonicalCycleReportRef(root, report);
    })
    .filter((path): path is string => path !== null)
    .sort();
}

/** Newest crawl findings path used by the no-flags compiler path. */
export function findNewestCrawlFindings(root: string): string | null {
  const crawlRoot = join(resolve(root), "ai-runs", "crawl");
  if (!existsSync(crawlRoot)) return null;
  const dirNames = readdirSync(crawlRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => isRegularFile(join(crawlRoot, name, "findings.jsonl")))
    .sort();
  const newest = dirNames.at(-1);
  return newest ? portablePath(join("ai-runs", "crawl", newest, "findings.jsonl")) : null;
}

/**
 * Explicit --in arguments replace discovery completely. With no explicit
 * inputs, keep the local report ledger first so it wins dedupe precedence,
 * then cycle-style pure publication candidates, then newest crawl findings.
 */
export function resolveFeedbackInputs(root: string, explicitInputs: readonly string[]): string[] {
  if (explicitInputs.length > 0) return [...explicitInputs];
  const inputs = ["blind-tester/reports", ...discoverCanonicalCycleReports(root)];
  const crawlFindings = findNewestCrawlFindings(root);
  if (crawlFindings) inputs.push(crawlFindings);
  return inputs;
}
