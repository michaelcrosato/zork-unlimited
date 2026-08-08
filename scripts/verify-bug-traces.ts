#!/usr/bin/env -S npx tsx
/**
 * Integrity gate for the historical bug-record corpus.
 *
 * Bug traces are durable evidence, not loose notes. Every checked-in YAML file must
 * parse, identify itself, contain a useful account of the defect, and reference only
 * paths that exist now or existed in reachable Git history. Historical paths matter:
 * many early traces correctly name the retired parser/CYOA runtimes, so requiring only
 * present-day files would make honest archive entries impossible to keep.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

const TRACE_DIRECTORY = "traces/bugs";
const TRACE_FILE_RE = /^bug_(\d{4})_[a-z0-9_]+\.yaml$/;
const TRACE_ID_RE = /^bug_(\d{4})(?:_[a-z0-9_]+)?$/;
const NARRATIVE_KEYS = [
  "title",
  "summary",
  "symptom",
  "description",
  "failure",
  "finding",
  "root_cause",
  "evidence",
] as const;

// Concrete first-party file references only. Globs, ellipses, URLs, and prose-like
// pseudo-paths deliberately do not match. A trailing :line reference is accepted.
const PATH_REFERENCE_RE =
  /(?:^|[\s`'"(])((?:(?:\.github|agents|bin|content|docs|scripts|src|tests|traces|ui)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|js|mjs|cjs|sh|yaml|yml|json|md)|(?:ADVENTUREFORGE_BUILD_SPEC|AGENTS|AI_LOOP_STATE|README)\.md))(?=$|[\s`'"),.;:\]}])/gm;

// This is the documented, intentionally ignored destination for ad-hoc recordings.
// It is an output path rather than a committed source/reference target.
const GENERATED_PATH_REFERENCES = new Set(["traces/run.json"]);

export type BugTraceFinding = Readonly<{
  file: string;
  code: string;
  message: string;
}>;

export type BugTraceStats = Readonly<{
  files: number;
  references: number;
  currentReferences: number;
  historicalReferences: number;
  generatedReferences: number;
}>;

export type BugTraceReport = Readonly<{
  findings: readonly BugTraceFinding[];
  stats: BugTraceStats;
}>;

export type BugTraceVerifierOptions = Readonly<{
  currentPaths?: ReadonlySet<string>;
  historicalPaths?: ReadonlySet<string>;
}>;

function gitLines(root: string, args: readonly string[]): string[] {
  return execFileSync("git", [...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  })
    .split(/\r?\n/)
    .filter(Boolean);
}

export function repositoryPathCatalog(root: string): {
  currentPaths: ReadonlySet<string>;
  historicalPaths: ReadonlySet<string>;
} {
  const currentPaths = new Set(gitLines(root, ["ls-files"]));
  const historicalPaths = new Set<string>();
  for (const row of gitLines(root, ["rev-list", "--objects", "--all"])) {
    const separator = row.indexOf(" ");
    if (separator >= 0) historicalPaths.add(row.slice(separator + 1));
  }
  return { currentPaths, historicalPaths };
}

function hasSubstance(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasSubstance);
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasSubstance);
  }
  return false;
}

function referencedPaths(source: string): string[] {
  return [...new Set([...source.matchAll(PATH_REFERENCE_RE)].map((match) => match[1]!))].sort();
}

function referenceCandidates(path: string): string[] {
  const candidates = [path];
  // TypeScript's ESM source imports use runtime `.js` specifiers. Treat the checked-in
  // `.ts`/`.tsx` source as the concrete target of such a reference.
  if (path.endsWith(".js")) {
    candidates.push(`${path.slice(0, -3)}.ts`, `${path.slice(0, -3)}.tsx`);
  }
  return candidates;
}

function referenceKind(
  root: string,
  path: string,
  currentPaths: ReadonlySet<string>,
  historicalPaths: ReadonlySet<string>,
): "current" | "historical" | "generated" | "missing" {
  if (GENERATED_PATH_REFERENCES.has(path)) return "generated";
  const candidates = referenceCandidates(path);
  if (
    candidates.some(
      (candidate) => currentPaths.has(candidate) || existsSync(resolve(root, candidate)),
    )
  ) {
    return "current";
  }
  if (candidates.some((candidate) => historicalPaths.has(candidate))) return "historical";
  return "missing";
}

export function verifyBugTraces(
  root: string,
  options: BugTraceVerifierOptions = {},
): BugTraceReport {
  const findings: BugTraceFinding[] = [];
  const directory = resolve(root, TRACE_DIRECTORY);
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    return {
      findings: [
        {
          file: TRACE_DIRECTORY,
          code: "TRACE_DIRECTORY_MISSING",
          message: "checked-in bug trace directory does not exist",
        },
      ],
      stats: {
        files: 0,
        references: 0,
        currentReferences: 0,
        historicalReferences: 0,
        generatedReferences: 0,
      },
    };
  }

  let catalogs: ReturnType<typeof repositoryPathCatalog> | undefined;
  if (options.currentPaths === undefined || options.historicalPaths === undefined) {
    try {
      catalogs = repositoryPathCatalog(root);
    } catch (error) {
      findings.push({
        file: TRACE_DIRECTORY,
        code: "GIT_HISTORY_UNAVAILABLE",
        message: `cannot verify current/historical path references: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  const currentPaths = options.currentPaths ?? catalogs?.currentPaths ?? new Set<string>();
  const historicalPaths = options.historicalPaths ?? catalogs?.historicalPaths ?? new Set<string>();

  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".yaml"))
    .sort();
  if (files.length === 0) {
    findings.push({
      file: TRACE_DIRECTORY,
      code: "TRACE_CORPUS_EMPTY",
      message: "bug trace directory contains no YAML artifacts",
    });
  }

  const seenIds = new Map<string, string>();
  let references = 0;
  let currentReferences = 0;
  let historicalReferences = 0;
  let generatedReferences = 0;

  for (const name of files) {
    const file = `${TRACE_DIRECTORY}/${name}`;
    const filenameMatch = TRACE_FILE_RE.exec(name);
    if (filenameMatch === null) {
      findings.push({
        file,
        code: "TRACE_FILENAME_INVALID",
        message: "expected bug_NNNN_lowercase_slug.yaml",
      });
    }

    const source = readFileSync(resolve(directory, name), "utf8");
    const document = parseDocument(source, { prettyErrors: false, uniqueKeys: true });
    for (const error of document.errors) {
      findings.push({ file, code: "YAML_PARSE_ERROR", message: error.message.split("\n")[0]! });
    }
    for (const warning of document.warnings) {
      findings.push({ file, code: "YAML_PARSE_WARNING", message: warning.message.split("\n")[0]! });
    }
    if (document.errors.length > 0) continue;

    const value: unknown = document.toJS();
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      findings.push({
        file,
        code: "TRACE_SCHEMA_ROOT",
        message: "top-level YAML value must be a mapping",
      });
      continue;
    }
    const trace = value as Record<string, unknown>;
    const identifiers = [trace.id, trace.bug_id].filter((candidate) => candidate !== undefined);
    if (identifiers.length === 0) {
      findings.push({ file, code: "TRACE_ID_MISSING", message: "expected an id or bug_id field" });
    } else {
      const uniqueIdentifiers = new Set(identifiers);
      if (uniqueIdentifiers.size > 1) {
        findings.push({
          file,
          code: "TRACE_ID_CONFLICT",
          message: "id and bug_id must agree when both are present",
        });
      }
      const id = identifiers[0];
      if (typeof id !== "string" || !TRACE_ID_RE.test(id)) {
        findings.push({
          file,
          code: "TRACE_ID_INVALID",
          message: "id must match bug_NNNN or bug_NNNN_lowercase_slug",
        });
      } else {
        const idNumber = TRACE_ID_RE.exec(id)![1]!;
        if (filenameMatch !== null && idNumber !== filenameMatch[1]) {
          findings.push({
            file,
            code: "TRACE_ID_FILENAME_MISMATCH",
            message: `id ${id} does not match filename number ${filenameMatch[1]}`,
          });
        }
        const previous = seenIds.get(id);
        if (previous !== undefined) {
          findings.push({
            file,
            code: "TRACE_ID_DUPLICATE",
            message: `id ${id} is already used by ${previous}`,
          });
        } else {
          seenIds.set(id, file);
        }
      }
    }

    if (!NARRATIVE_KEYS.some((key) => hasSubstance(trace[key]))) {
      findings.push({
        file,
        code: "TRACE_NARRATIVE_MISSING",
        message: `expected substantive ${NARRATIVE_KEYS.join(", ")}, or equivalent evidence`,
      });
    }

    for (const path of referencedPaths(source)) {
      references += 1;
      const kind = referenceKind(root, path, currentPaths, historicalPaths);
      if (kind === "current") currentReferences += 1;
      else if (kind === "historical") historicalReferences += 1;
      else if (kind === "generated") generatedReferences += 1;
      else {
        findings.push({
          file,
          code: "TRACE_REFERENCE_MISSING",
          message: `referenced path never existed in the current tree or reachable Git history: ${path}`,
        });
      }
    }
  }

  return {
    findings,
    stats: {
      files: files.length,
      references,
      currentReferences,
      historicalReferences,
      generatedReferences,
    },
  };
}

function main(): void {
  const root = resolve(process.cwd());
  const report = verifyBugTraces(root);
  for (const finding of report.findings) {
    console.error(`${finding.file} [${finding.code}] ${finding.message}`);
  }
  if (report.findings.length > 0) {
    console.error(`Bug trace integrity FAILED with ${report.findings.length} finding(s).`);
    process.exitCode = 1;
    return;
  }
  const stats = report.stats;
  console.log(
    `Bug trace integrity OK: ${stats.files} YAML files; ${stats.references} concrete path references (${stats.currentReferences} current, ${stats.historicalReferences} historical, ${stats.generatedReferences} generated-output).`,
  );
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
