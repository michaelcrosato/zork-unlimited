/**
 * Verifier-integrity guard — operationalizes the "don't route around the verifier"
 * principle from AGENTS.md (trust, but verify).
 *
 * Under full agent trust the loop can change anything, and the dominant failure
 * mode of unattended coding loops is REWARD-HACKING: silently weakening the very
 * checks that establish correctness — skipping/deleting/emptying tests, or
 * re-pinning a committed hash to launder a behavior change (see the EvilGenie
 * benchmark, arXiv:2511.21654, and Anthropic's long-running-agents harness which
 * forbids editing the verifier). This guard makes those mechanical hacks fail
 * loudly so the verification stays honest.
 *
 * Two modes:
 *   - STATIC (default): the repo, right now, must keep its verification intact —
 *     the protected verification assets exist, no test is disabled (.skip/.only/
 *     .todo/xit), and the test-case count is above a floor. Run in `npm run health`
 *     and CI; it is part of the bar.
 *   - DRIFT (`--against <ref>`): the autonomous loop runs this before committing a
 *     cycle. If the cycle deleted a protected file, introduced a disabled test, or
 *     changed a committed hash-pin, the guard REFUSES AND SURFACES it for human
 *     review (set AI_LOOP_ALLOW_VERIFIER_EDITS=1 to acknowledge a deliberate edit).
 *
 * Honest limitation: this catches MECHANICAL tampering (skip/delete/empty/re-pin),
 * not semantic weakening (e.g. swapping a strict assert for a loose one). An agent
 * with write access to this script could also edit the guard itself — the point is
 * to make tampering visible, effortful, and against the rules, not impossible.
 * Pure + deterministic: no clock, no RNG, no network.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Verification assets the project's correctness rests on. Must always exist. */
export const PROTECTED_FILES = [
  "tests/property/determinism.test.ts",
  "tests/property/parser_determinism.test.ts",
  "src/core/rng.ts",
  "src/core/hash.ts",
  "src/core/sha256.ts",
  "src/core/engine.ts",
  "src/validate/cyoa_validator.ts",
  "src/validate/parser_validator.ts",
  "src/validate/rpg_validator.ts",
  "src/persist/save_load.ts",
  "scripts/verify-integrity.ts",
];

/** Files holding committed hash pins / known-answer vectors that should not change
 *  silently — a change here in a cycle's diff is surfaced for human review. */
export const HASH_PIN_FILES = [
  "tests/unit/rpg_validator.test.ts",
  "tests/unit/sha256.test.ts",
  "traces/bugs/bug_0002_watchtower_blind_polish.yaml",
  "traces/rpg/barrow_victory.json",
];

/** Never drop below this many test cases (a mass-deletion tripwire). Currently ~165. */
export const MIN_TEST_CASES = 120;

/** A disabled / focused test marker — any of these in a test file is a red flag. */
const DISABLED_RE = /\b(?:it|test|describe)\s*\.\s*(?:skip|only|todo)\b|\b(?:xit|xdescribe|xtest)\s*\(/;
const TESTCASE_RE = /\b(?:it|test)\s*\(/g;

export type Finding = { severity: "error" | "warning"; code: string; message: string; where: string };

function listFiles(root: string, dir: string, match: (p: string) => boolean): string[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && match(p)) out.push(relative(root, p).replaceAll("\\", "/"));
    }
  };
  walk(abs);
  return out.sort();
}

export function listTestFiles(root: string): string[] {
  return listFiles(root, "tests", (p) => /\.test\.ts$/.test(p));
}

/** Test files that contain a disabled/focused marker. Pure over the given texts. */
export function detectDisabledTests(files: { path: string; text: string }[]): Finding[] {
  const findings: Finding[] = [];
  for (const f of files) {
    f.text.split("\n").forEach((line, i) => {
      if (DISABLED_RE.test(line)) {
        findings.push({ severity: "error", code: "TEST_DISABLED", message: `disabled/focused test marker: ${line.trim().slice(0, 80)}`, where: `${f.path}:${i + 1}` });
      }
    });
  }
  return findings;
}

export function countTestCases(files: { text: string }[]): number {
  return files.reduce((n, f) => n + (f.text.match(TESTCASE_RE)?.length ?? 0), 0);
}

function readAll(root: string, paths: string[]): { path: string; text: string }[] {
  return paths.map((p) => ({ path: p, text: readFileSync(join(root, p), "utf8") }));
}

/** Static integrity: protected files present, no disabled tests, count above floor. */
export function runStatic(root: string): { ok: boolean; findings: Finding[] } {
  const findings: Finding[] = [];
  for (const f of PROTECTED_FILES) {
    if (!existsSync(join(root, f))) findings.push({ severity: "error", code: "PROTECTED_MISSING", message: `protected verification asset is missing: ${f}`, where: f });
  }
  const testFiles = readAll(root, listTestFiles(root));
  findings.push(...detectDisabledTests(testFiles));
  const cases = countTestCases(testFiles);
  if (cases < MIN_TEST_CASES) {
    findings.push({ severity: "error", code: "TEST_COUNT_FLOOR", message: `only ${cases} test cases found; floor is ${MIN_TEST_CASES} (tests may have been removed)`, where: "tests/" });
  }
  return { ok: !findings.some((f) => f.severity === "error"), findings };
}

function gitChangedFiles(root: string, ref: string): string[] {
  // Tracked changes vs ref (incl. working tree + deletions) plus untracked files.
  const tracked = execFileSync("git", ["diff", "--name-only", ref, "--"], { cwd: root, encoding: "utf8" });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" });
  return [...new Set([...tracked.split("\n"), ...untracked.split("\n")].map((s) => s.trim()).filter(Boolean))];
}

/**
 * Classify what a cycle's changed-file set means for verifier integrity. PURE
 * (testable without git). The severity model follows current reward-hacking
 * research (EvilGenie arXiv:2511.21654; METR 2025-06; Anthropic long-running-agents
 * 2025-11) + snapshot/approval-testing practice (Jest, cargo-insta):
 *
 *  - A pinned hash / snapshot is a CHANGE-DETECTOR, not a correctness oracle, and is
 *    *meant* to be updated when the artifact intentionally changes. So re-pinning a
 *    hash that is ACCOMPANIED by a real content change is the legitimate workflow →
 *    a surfaced WARNING (recorded for review, does not block). The behavioral test
 *    suite — which must be green — is the real guard.
 *  - A re-pin UNACCOMPANIED by any content change is the "regenerate to make red go
 *    green" launder pattern → a hard ERROR.
 *  - Modifying (not deleting) a protected verification file is surfaced (WARNING):
 *    the agent has free rein over code, and the mechanical weakening it must NOT do
 *    (disable/delete tests, drop the count) is caught by the static checks + the
 *    drift count-regression check, both hard errors.
 *  - Deleting a protected verification asset → hard ERROR.
 */
export function classifyDrift(changed: string[], existsFn: (rel: string) => boolean): Finding[] {
  const findings: Finding[] = [];
  const contentChanged = changed.some((f) => f.startsWith("content/"));
  for (const f of changed) {
    if (PROTECTED_FILES.includes(f)) {
      if (!existsFn(f)) findings.push({ severity: "error", code: "PROTECTED_DELETED", message: `a protected verification asset was deleted this cycle: ${f}`, where: f });
      else findings.push({ severity: "warning", code: "VERIFIER_TOUCHED", message: `this cycle modified a protected verification asset: ${f} — surfaced for review (the static + count-regression checks guard against weakening)`, where: f });
    }
    if (HASH_PIN_FILES.includes(f) && existsFn(f)) {
      if (contentChanged) {
        findings.push({ severity: "warning", code: "HASH_PIN_REPINNED", message: `re-pinned ${f} alongside an intentional content change — the legitimate snapshot-update workflow, recorded for review`, where: f });
      } else {
        findings.push({ severity: "error", code: "HASH_PIN_UNACCOMPANIED", message: `re-pinned ${f} with NO content change this cycle — a snapshot/hash update with no corresponding edit is the classic launder pattern (override with AI_LOOP_ALLOW_VERIFIER_EDITS=1 for a deliberate algorithm/format change)`, where: f });
      }
    }
  }
  return findings;
}

/** Count test cases as they were at a git ref (null if the ref can't be read). */
function countTestCasesAtRef(root: string, ref: string): number | null {
  try {
    const listed = execFileSync("git", ["ls-tree", "-r", "--name-only", ref], { cwd: root, encoding: "utf8" });
    const files = listed.split("\n").map((s) => s.trim()).filter((p) => /^tests\/.*\.test\.ts$/.test(p));
    let n = 0;
    for (const p of files) {
      const text = execFileSync("git", ["show", `${ref}:${p}`], { cwd: root, encoding: "utf8" });
      n += text.match(TESTCASE_RE)?.length ?? 0;
    }
    return n;
  } catch {
    return null;
  }
}

/**
 * Drift check for the autonomous loop: what did THIS cycle (working tree vs `ref`)
 * do to the verifier? = static checks + classifyDrift + a test-count-regression
 * guard. AI_LOOP_ALLOW_VERIFIER_EDITS=1 downgrades ONLY the unaccompanied-re-pin
 * error (a deliberate algorithm/format re-pin); it never downgrades real weakening
 * (deleted/disabled tests, a dropped test count).
 */
export function runDrift(root: string, ref: string, env: NodeJS.ProcessEnv = process.env): { ok: boolean; findings: Finding[] } {
  const findings: Finding[] = [...runStatic(root).findings];
  let changed: string[];
  try {
    changed = gitChangedFiles(root, ref);
  } catch (e) {
    return { ok: false, findings: [...findings, { severity: "error", code: "GIT_DIFF_FAILED", message: `cannot diff against ${ref}: ${(e as Error).message}`, where: ref }] };
  }
  const acknowledged = env.AI_LOOP_ALLOW_VERIFIER_EDITS === "1";
  for (const f of classifyDrift(changed, (rel) => existsSync(join(root, rel)))) {
    // The only downgradable error is an unaccompanied re-pin (a deliberate human
    // re-pin of e.g. a hash algorithm). Weakening errors are never downgraded.
    if (acknowledged && f.code === "HASH_PIN_UNACCOMPANIED") findings.push({ ...f, severity: "warning", message: `${f.message} [acknowledged]` });
    else findings.push(f);
  }
  // Hard guard against silent test removal even while above the static floor: the
  // cycle must not REDUCE the test-case count vs the pre-cycle ref.
  const before = countTestCasesAtRef(root, ref);
  if (before !== null) {
    const now = countTestCases(readAll(root, listTestFiles(root)));
    if (now < before) findings.push({ severity: "error", code: "TEST_COUNT_REGRESSION", message: `test cases dropped from ${before} to ${now} this cycle — tests were removed/skipped (weakening the verifier is not allowed)`, where: "tests/" });
  }
  return { ok: !findings.some((f) => f.severity === "error"), findings };
}

function format(label: string, res: { ok: boolean; findings: Finding[] }): string {
  const errs = res.findings.filter((f) => f.severity === "error").length;
  const warns = res.findings.filter((f) => f.severity === "warning").length;
  const lines = [`verifier-integrity (${label}): ${res.ok ? "OK" : "FAILED"}  (${errs} error(s), ${warns} warning(s))`];
  for (const f of res.findings) lines.push(`  [${f.severity === "error" ? "ERROR" : "warn "}] ${f.code}: ${f.message}\n          ${f.where}`);
  return lines.join("\n");
}

function main(): void {
  const root = process.cwd();
  const argv = process.argv.slice(2);
  const againstIdx = argv.indexOf("--against");
  const ref = againstIdx >= 0 ? argv[againstIdx + 1] : undefined;
  const res = ref ? runDrift(root, ref) : runStatic(root);
  console.log(format(ref ? `drift vs ${ref}` : "static", res));
  process.exit(res.ok ? 0 : 1);
}

// Run as CLI only (not when imported by tests). `import.meta.url` ends with this file.
if (statSync(process.argv[1] ?? "").isFile() && (process.argv[1] ?? "").endsWith("verify-integrity.ts")) {
  main();
}
