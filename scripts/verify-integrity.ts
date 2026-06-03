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
 * It catches MECHANICAL tampering (skip/delete/empty/re-pin) AND assertion gutting,
 * on three independent counts that rise together only for an honest +tests cycle:
 * the test-case count guards the `it()`/`test()` SHELLS; the `expect()` count guards
 * that the bodies still ASSERT; and the STRONG-matcher count guards that those
 * assertions still PIN A VALUE — closing the launder where a cycle keeps every shell
 * and every `expect()` but swaps a strict matcher for a loose existence check
 * (`toBe(x)` → `toBeDefined()`), leaving a green test that no longer checks anything
 * specific. A net drop in ANY of the three across a cycle is a hard regression. Honest
 * limitation that remains: a count-preserving swap that keeps a STRONG matcher but
 * makes it vacuous (`expect(true).toBe(true)`) is still not caught — that needs a
 * semantic judge, which would forfeit this script's pure-determinism. An agent with
 * write access to this script could also edit the guard itself — the point is to make
 * tampering visible, effortful, and against the rules, not impossible.
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
  // The generator program is the eval-distribution credibility anchor. These files
  // mint the never-frozen procedural packs the assessor mint-and-check levers confront
  // every cycle (CYOA bug_0158 / RPG bug_0162 / parser bug_0166) AND seal the committed
  // held-out corpus the benchmark thesis rests on (bug_0163/bug_0165). A SILENT
  // weakening of a generator or the seal CLI would let a degraded eval distribution
  // through the OUTPUT gates unnoticed, so the SOURCE is guarded too: deleting one is
  // now a hard error and editing one (a deliberate deepen cycle behind a
  // generator_version bump) surfaces a VERIFIER_TOUCHED warning for review. bug_0167,
  // the bug_0164 deferred item c.
  //
  // NOTE: keep this comment free of apostrophes/quotes/brackets — parseGuardConstants
  // pure-parses this array literal and a stray quote would read as a phantom entry.
  "src/gen/cyoa_generator.ts",
  "src/gen/rpg_generator.ts",
  "src/gen/parser_generator.ts",
  "bin/seal-corpus.ts",
  // The sealed held-out corpus manifest is the OUTPUT of the seal CLI above and the
  // committed pin the contamination-free benchmark rests on (bug_0163/bug_0165): each
  // entry fixes a generated pack content_hash plus generator_version for a frozen seed
  // window. The generators that mint it are guarded above, but a manual re-seal that
  // rewrites these hashes WITHOUT a generator change would otherwise slip past the drift
  // check unseen, laundering a degraded eval distribution into the held-out split.
  // Guarding the manifest makes any re-seal surface VERIFIER_TOUCHED for review and a
  // deletion a hard PROTECTED_DELETED error, while held_out_corpus_sealed.test.ts proves
  // the pins still re-mint deterministically. bug_0176, the bug_0172 deferred lever c.
  "corpus/manifest.json",
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

/** Never drop below this many test cases (a mass-deletion tripwire). Currently ~890. */
export const MIN_TEST_CASES = 120;

/** Never drop below this many `expect()` assertions (the assertion-gutting tripwire,
 *  parallel to MIN_TEST_CASES). Currently ~2950; set well below as a mass-deletion
 *  floor, while the drift ASSERTION_COUNT_REGRESSION guards the precise per-cycle drop. */
export const MIN_ASSERTIONS = 400;

/** Never drop below this many STRONG (value-pinning) matchers — the strict→loose-swap
 *  tripwire, parallel to MIN_ASSERTIONS. Currently ~2890; set well below as a mass
 *  tripwire, while the drift STRONG_ASSERTION_REGRESSION guards the precise per-cycle drop. */
export const MIN_STRONG_ASSERTIONS = 400;

/** A disabled / focused test marker — any of these in a test file is a red flag. */
const DISABLED_RE =
  /\b(?:it|test|describe)\s*\.\s*(?:skip|only|todo)\b|\b(?:xit|xdescribe|xtest)\s*\(/;
const TESTCASE_RE = /\b(?:it|test)\s*\(/g;
/** An assertion call. Counting these guards the test BODIES (vitest's `expect(`),
 *  so gutting a test's assertions while keeping its `it()` shell is caught even
 *  though the case count is unchanged. */
const ASSERTION_RE = /\bexpect\s*\(/g;
/** A STRONG (value-pinning) matcher: one asserting a SPECIFIC value, content, or
 *  relationship — toBe/toEqual/toContain/toMatch, the ordering comparators, toThrow,
 *  toHaveLength, etc. Counting these catches the count-preserving strict→loose swap the
 *  expect() count alone misses: replacing `toBe(x)` with a weak existence matcher
 *  (toBeDefined/toBeTruthy/toBeUndefined/toBeNull/toBeFalsy) keeps the expect() count
 *  but drops the strong count, surfacing the laundered weakening. Negated specific
 *  matchers (`.not.toContain(`, `.not.toBe(`) count too — they still pin a value; the
 *  weak existence matchers are deliberately excluded. The `\s*\(` anchor stops the
 *  `toBe` alternative from also matching the `toBe`-prefixed weak matchers. */
const STRONG_ASSERTION_RE =
  /\.(?:toBe|toEqual|toStrictEqual|toContain|toContainEqual|toMatch|toMatchObject|toMatchSnapshot|toMatchInlineSnapshot|toThrow|toThrowError|toHaveLength|toHaveProperty|toHaveBeenCalledWith|toHaveReturnedWith|toBeGreaterThan|toBeGreaterThanOrEqual|toBeLessThan|toBeLessThanOrEqual|toBeCloseTo|toBeInstanceOf)\s*\(/g;

export type Finding = {
  severity: "error" | "warning";
  code: string;
  message: string;
  where: string;
};

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
        findings.push({
          severity: "error",
          code: "TEST_DISABLED",
          message: `disabled/focused test marker: ${line.trim().slice(0, 80)}`,
          where: `${f.path}:${i + 1}`,
        });
      }
    });
  }
  return findings;
}

export function countTestCases(files: { text: string }[]): number {
  return files.reduce((n, f) => n + (f.text.match(TESTCASE_RE)?.length ?? 0), 0);
}

export function countAssertions(files: { text: string }[]): number {
  return files.reduce((n, f) => n + (f.text.match(ASSERTION_RE)?.length ?? 0), 0);
}

export function countStrongAssertions(files: { text: string }[]): number {
  return files.reduce((n, f) => n + (f.text.match(STRONG_ASSERTION_RE)?.length ?? 0), 0);
}

function readAll(root: string, paths: string[]): { path: string; text: string }[] {
  return paths.map((p) => ({ path: p, text: readFileSync(join(root, p), "utf8") }));
}

/** Static integrity: protected files present, no disabled tests, count above floor. */
export function runStatic(root: string): { ok: boolean; findings: Finding[] } {
  const findings: Finding[] = [];
  for (const f of PROTECTED_FILES) {
    if (!existsSync(join(root, f)))
      findings.push({
        severity: "error",
        code: "PROTECTED_MISSING",
        message: `protected verification asset is missing: ${f}`,
        where: f,
      });
  }
  const testFiles = readAll(root, listTestFiles(root));
  findings.push(...detectDisabledTests(testFiles));
  const cases = countTestCases(testFiles);
  if (cases < MIN_TEST_CASES) {
    findings.push({
      severity: "error",
      code: "TEST_COUNT_FLOOR",
      message: `only ${cases} test cases found; floor is ${MIN_TEST_CASES} (tests may have been removed)`,
      where: "tests/",
    });
  }
  const assertions = countAssertions(testFiles);
  if (assertions < MIN_ASSERTIONS) {
    findings.push({
      severity: "error",
      code: "ASSERTION_COUNT_FLOOR",
      message: `only ${assertions} expect() assertions found; floor is ${MIN_ASSERTIONS} (test bodies may have been gutted while keeping their it() shells)`,
      where: "tests/",
    });
  }
  const strong = countStrongAssertions(testFiles);
  if (strong < MIN_STRONG_ASSERTIONS) {
    findings.push({
      severity: "error",
      code: "STRONG_ASSERTION_FLOOR",
      message: `only ${strong} strong (value-pinning) matchers found; floor is ${MIN_STRONG_ASSERTIONS} (strict asserts may have been swapped for loose existence checks)`,
      where: "tests/",
    });
  }
  return { ok: !findings.some((f) => f.severity === "error"), findings };
}

function gitChangedFiles(root: string, ref: string): string[] {
  // Tracked changes vs ref (incl. working tree + deletions) plus untracked files.
  const tracked = execFileSync("git", ["diff", "--name-only", ref, "--"], {
    cwd: root,
    encoding: "utf8",
  });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  });
  return [
    ...new Set(
      [...tracked.split("\n"), ...untracked.split("\n")].map((s) => s.trim()).filter(Boolean),
    ),
  ];
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
      if (!existsFn(f))
        findings.push({
          severity: "error",
          code: "PROTECTED_DELETED",
          message: `a protected verification asset was deleted this cycle: ${f}`,
          where: f,
        });
      else
        findings.push({
          severity: "warning",
          code: "VERIFIER_TOUCHED",
          message: `this cycle modified a protected verification asset: ${f} — surfaced for review (the static + count-regression checks guard against weakening)`,
          where: f,
        });
    }
    if (HASH_PIN_FILES.includes(f) && existsFn(f)) {
      if (contentChanged) {
        findings.push({
          severity: "warning",
          code: "HASH_PIN_REPINNED",
          message: `re-pinned ${f} alongside an intentional content change — the legitimate snapshot-update workflow, recorded for review`,
          where: f,
        });
      } else {
        findings.push({
          severity: "error",
          code: "HASH_PIN_UNACCOMPANIED",
          message: `re-pinned ${f} with NO content change this cycle — a snapshot/hash update with no corresponding edit is the classic launder pattern (override with AI_LOOP_ALLOW_VERIFIER_EDITS=1 for a deliberate algorithm/format change)`,
          where: f,
        });
      }
    }
  }
  return findings;
}

export type TestArtifactCounts = { cases: number; assertions: number; strong?: number };

/**
 * Pure regression detector: a cycle must not REDUCE the test-case count, the assertion
 * count, NOR the strong-matcher count vs the pre-cycle ref. The three counts close
 * three nested launders:
 *   - dropping `cases` = removing/skipping tests (TEST_COUNT_REGRESSION).
 *   - holding `cases` but dropping `assertions` = gutting a body of its expect()s while
 *     keeping its it() shell (ASSERTION_COUNT_REGRESSION).
 *   - holding both but dropping `strong` = swapping a strict matcher for a loose
 *     existence check (toBe(x) → toBeDefined()) — the body still asserts, but no longer
 *     pins a value (STRONG_ASSERTION_REGRESSION).
 * `strong` is optional so legacy {cases, assertions} call sites stay valid; the strong
 * guard only fires when both before/now supply it (runDrift always does). Pure (counts
 * in, findings out) so it unit-tests on synthetic numbers, mirroring classifyDrift.
 */
export function detectCountRegressions(
  before: TestArtifactCounts,
  now: TestArtifactCounts,
): Finding[] {
  const findings: Finding[] = [];
  if (now.cases < before.cases)
    findings.push({
      severity: "error",
      code: "TEST_COUNT_REGRESSION",
      message: `test cases dropped from ${before.cases} to ${now.cases} this cycle — tests were removed/skipped (weakening the verifier is not allowed)`,
      where: "tests/",
    });
  if (now.assertions < before.assertions)
    findings.push({
      severity: "error",
      code: "ASSERTION_COUNT_REGRESSION",
      message: `expect() assertions dropped from ${before.assertions} to ${now.assertions} this cycle — a test body was gutted of its assertions (weakening the verifier is not allowed)`,
      where: "tests/",
    });
  if (before.strong !== undefined && now.strong !== undefined && now.strong < before.strong)
    findings.push({
      severity: "error",
      code: "STRONG_ASSERTION_REGRESSION",
      message: `strong (value-pinning) matchers dropped from ${before.strong} to ${now.strong} this cycle — a strict assertion was swapped for a loose existence check (toBe(x) → toBeDefined()); weakening the verifier is not allowed`,
      where: "tests/",
    });
  return findings;
}

/**
 * The guard's OWN defensive surface: the floors and protected/hash-pin lists this
 * script enforces. Locking these closes the DGM-class launder where an agent tasked
 * to pass a checker simply edits the checker — deletes the marker it scans for, or
 * lowers the floor it compares against (Darwin Gödel Machine, arXiv:2505.22954;
 * EvilGenie, arXiv:2511.21654; agentic-self-learning, arXiv:2510.14253). The docstring
 * (lines 33–35) concedes this exact hole; `detectGuardWeakening` turns it from a
 * non-blocking VERIFIER_TOUCHED warning into a hard error when the surface SHRINKS.
 */
export type GuardConstants = {
  minTestCases: number;
  minAssertions: number;
  minStrongAssertions: number;
  protectedFiles: string[];
  hashPinFiles: string[];
};

/**
 * Pure parser over the TEXT of verify-integrity.ts. Extracts the three MIN_* floors
 * and the two protected/hash-pin array literals by regex/string parsing only (NO eval,
 * no fs/git/network/clock/RNG) so it is deterministic and unit-tests on synthetic input.
 * Returns null if ANY field can't be parsed — a malformed/absent ref is skipped, never a
 * false alarm (mirrors countTestArtifactsAtRef's null-on-failure contract).
 */
export function parseGuardConstants(text: string): GuardConstants | null {
  const num = (name: string): number | null => {
    const m = new RegExp(`export const ${name}\\s*=\\s*(\\d+)`).exec(text);
    return m ? Number(m[1]) : null;
  };
  const arr = (name: string): string[] | null => {
    const m = new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`).exec(text);
    if (!m) return null;
    const entries = m[1]!.match(/"([^"]*)"|'([^']*)'/g);
    if (!entries) return null;
    return entries.map((e) => e.slice(1, -1));
  };
  const minTestCases = num("MIN_TEST_CASES");
  const minAssertions = num("MIN_ASSERTIONS");
  const minStrongAssertions = num("MIN_STRONG_ASSERTIONS");
  const protectedFiles = arr("PROTECTED_FILES");
  const hashPinFiles = arr("HASH_PIN_FILES");
  if (
    minTestCases === null ||
    minAssertions === null ||
    minStrongAssertions === null ||
    protectedFiles === null ||
    hashPinFiles === null
  )
    return null;
  return { minTestCases, minAssertions, minStrongAssertions, protectedFiles, hashPinFiles };
}

/**
 * Pure comparator (mirrors detectCountRegressions / classifyDrift: synthetic structs in,
 * findings out; no git/fs/network/clock/RNG). Emits a single severity:"error",
 * code:"GUARD_WEAKENED" finding when the guard's defensive surface SHRINKS across a cycle:
 *   - any MIN_* floor is LOWERED (now.minX < before.minX), or
 *   - any entry is REMOVED from protectedFiles or hashPinFiles.
 * Raising a floor, adding an entry, and identical constants are all OK (no finding). The
 * message names exactly what was weakened and mentions the AI_LOOP_ALLOW_VERIFIER_EDITS=1
 * override (a deliberate, acknowledged loosening is allowed; a silent one is not).
 */
export function detectGuardWeakening(before: GuardConstants, now: GuardConstants): Finding[] {
  const weakened: string[] = [];
  if (now.minTestCases < before.minTestCases)
    weakened.push(`MIN_TEST_CASES lowered ${before.minTestCases} → ${now.minTestCases}`);
  if (now.minAssertions < before.minAssertions)
    weakened.push(`MIN_ASSERTIONS lowered ${before.minAssertions} → ${now.minAssertions}`);
  if (now.minStrongAssertions < before.minStrongAssertions)
    weakened.push(
      `MIN_STRONG_ASSERTIONS lowered ${before.minStrongAssertions} → ${now.minStrongAssertions}`,
    );
  const removedFrom = (name: string, was: string[], is: string[]): void => {
    const nowSet = new Set(is);
    for (const entry of was)
      if (!nowSet.has(entry)) weakened.push(`${name} entry removed: ${entry}`);
  };
  removedFrom("PROTECTED_FILES", before.protectedFiles, now.protectedFiles);
  removedFrom("HASH_PIN_FILES", before.hashPinFiles, now.hashPinFiles);
  if (weakened.length === 0) return [];
  return [
    {
      severity: "error",
      code: "GUARD_WEAKENED",
      message: `the verifier guard's own defensive surface was weakened this cycle: ${weakened.join("; ")} — lowering a floor or shrinking a protected/hash-pin list is the DGM "edit-the-checker" launder (override with AI_LOOP_ALLOW_VERIFIER_EDITS=1 for a deliberate, acknowledged loosening)`,
      where: "scripts/verify-integrity.ts",
    },
  ];
}

/** Count test cases AND expect() assertions as they were at a git ref, in a single
 *  pass over the ref's test files (null if the ref can't be read). */
function countTestArtifactsAtRef(root: string, ref: string): TestArtifactCounts | null {
  try {
    const listed = execFileSync("git", ["ls-tree", "-r", "--name-only", ref], {
      cwd: root,
      encoding: "utf8",
    });
    const files = listed
      .split("\n")
      .map((s) => s.trim())
      .filter((p) => /^tests\/.*\.test\.ts$/.test(p));
    let cases = 0;
    let assertions = 0;
    let strong = 0;
    for (const p of files) {
      const text = execFileSync("git", ["show", `${ref}:${p}`], { cwd: root, encoding: "utf8" });
      cases += text.match(TESTCASE_RE)?.length ?? 0;
      assertions += text.match(ASSERTION_RE)?.length ?? 0;
      strong += text.match(STRONG_ASSERTION_RE)?.length ?? 0;
    }
    return { cases, assertions, strong };
  } catch {
    return null;
  }
}

/** The guard's OWN defensive constants as they were at a git ref (null if unreadable —
 *  a malformed/absent ref is skipped, never a false alarm). Pure-parse the same source. */
function parseGuardConstantsAtRef(root: string, ref: string): GuardConstants | null {
  try {
    const text = execFileSync("git", ["show", `${ref}:scripts/verify-integrity.ts`], {
      cwd: root,
      encoding: "utf8",
    });
    return parseGuardConstants(text);
  } catch {
    return null;
  }
}

/**
 * Drift check for the autonomous loop: what did THIS cycle (working tree vs `ref`)
 * do to the verifier? = static checks + classifyDrift + a test-count-regression
 * guard + a guard-self-integrity check. AI_LOOP_ALLOW_VERIFIER_EDITS=1 downgrades ONLY
 * the unaccompanied-re-pin error and a deliberately-acknowledged GUARD_WEAKENED; it
 * never downgrades real test weakening (deleted/disabled tests, a dropped count).
 */
export function runDrift(
  root: string,
  ref: string,
  env: NodeJS.ProcessEnv = process.env,
): { ok: boolean; findings: Finding[] } {
  const findings: Finding[] = [...runStatic(root).findings];
  let changed: string[];
  try {
    changed = gitChangedFiles(root, ref);
  } catch (e) {
    return {
      ok: false,
      findings: [
        ...findings,
        {
          severity: "error",
          code: "GIT_DIFF_FAILED",
          message: `cannot diff against ${ref}: ${(e as Error).message}`,
          where: ref,
        },
      ],
    };
  }
  const acknowledged = env.AI_LOOP_ALLOW_VERIFIER_EDITS === "1";
  // Guard-self-integrity: did this cycle weaken the guard's OWN defensive surface
  // (lower a MIN_* floor, drop a protected/hash-pin entry)? Read the ref's guard text
  // and the working-tree guard text through the SAME pure parser; only compare when
  // BOTH parse non-null (a malformed/absent ref is skipped, never a false alarm).
  const guardBefore = parseGuardConstantsAtRef(root, ref);
  const guardNow = parseGuardConstants(
    readFileSync(join(root, "scripts/verify-integrity.ts"), "utf8"),
  );
  const driftFindings = classifyDrift(changed, (rel) => existsSync(join(root, rel)));
  if (guardBefore !== null && guardNow !== null)
    driftFindings.push(...detectGuardWeakening(guardBefore, guardNow));
  for (const f of driftFindings) {
    // Downgradable errors (only with explicit acknowledgment): an unaccompanied re-pin
    // (a deliberate hash/format re-pin) and a deliberately-acknowledged guard loosening.
    // Real test weakening (deleted/disabled tests, a dropped count) is never downgraded.
    if (acknowledged && (f.code === "HASH_PIN_UNACCOMPANIED" || f.code === "GUARD_WEAKENED"))
      findings.push({ ...f, severity: "warning", message: `${f.message} [acknowledged]` });
    else findings.push(f);
  }
  // Hard guard against silent verification removal even while above the static
  // floors: the cycle must not REDUCE the test-case count, the assertion count, NOR
  // the strong-matcher count vs the pre-cycle ref. The assertion-count check closes
  // the gut-the-body launder (delete a test's expect()s, keep its it() shell); the
  // strong-matcher check closes the strict→loose swap launder (turn `toBe(x)` into
  // `toBeDefined()`) — the expect() count holds but the strong count drops, caught here.
  const before = countTestArtifactsAtRef(root, ref);
  if (before !== null) {
    const nowFiles = readAll(root, listTestFiles(root));
    const now = {
      cases: countTestCases(nowFiles),
      assertions: countAssertions(nowFiles),
      strong: countStrongAssertions(nowFiles),
    };
    findings.push(...detectCountRegressions(before, now));
  }
  return { ok: !findings.some((f) => f.severity === "error"), findings };
}

function format(label: string, res: { ok: boolean; findings: Finding[] }): string {
  const errs = res.findings.filter((f) => f.severity === "error").length;
  const warns = res.findings.filter((f) => f.severity === "warning").length;
  const lines = [
    `verifier-integrity (${label}): ${res.ok ? "OK" : "FAILED"}  (${errs} error(s), ${warns} warning(s))`,
  ];
  for (const f of res.findings)
    lines.push(
      `  [${f.severity === "error" ? "ERROR" : "warn "}] ${f.code}: ${f.message}\n          ${f.where}`,
    );
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
if (
  statSync(process.argv[1] ?? "").isFile() &&
  (process.argv[1] ?? "").endsWith("verify-integrity.ts")
) {
  main();
}
