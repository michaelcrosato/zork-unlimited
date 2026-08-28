/**
 * The autonomous loop's shell driver is a safety boundary, not just glue: it must
 * run the verification bar before committing and must refuse commits without the
 * mandatory blind-playtest report. Blind game agents cannot observe this layer, so
 * the test suite has to lock it directly.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO_ROOT = process.cwd();
const loopText = readFileSync("loop.sh", "utf8");
const bashRuntime = spawnSync("bash", ["-c", 'pwd; node -p "process.platform"'], {
  cwd: REPO_ROOT,
  env: process.env,
  encoding: "utf8",
});
if (bashRuntime.status !== 0) {
  throw new Error(`Could not resolve the loop-test bash runtime: ${bashRuntime.stderr}`);
}
const [BASH_REPO_ROOT = "", BASH_NODE_PLATFORM = ""] = bashRuntime.stdout.trim().split(/\r?\n/u);
if (!BASH_REPO_ROOT || !BASH_NODE_PLATFORM) {
  throw new Error("Could not resolve the loop-test bash repository path and Node platform.");
}

function sectionBetween(start: string, end: string): string {
  const startAt = loopText.indexOf(start);
  const endAt = loopText.indexOf(end, startAt);
  expect(startAt, `missing ${start}`).toBeGreaterThanOrEqual(0);
  expect(endAt, `missing ${end}`).toBeGreaterThan(startAt);
  return loopText.slice(startAt, endAt);
}

function runGateHarness(
  body: string,
  env: Record<string, string> = {},
  invocation = "require_playtest_record",
  setup?: (root: string) => void,
): {
  status: number | null;
  output: string;
} {
  const root = mkdtempSync(join(tmpdir(), "loop-gate-"));
  try {
    setup?.(root);
    const exports = Object.entries(env).map(([key, value]) => {
      expect(key).toMatch(/^[A-Z0-9_]+$/);
      return `${key}='${value.replaceAll("'", "'\\''")}'; export ${key}`;
    });
    const script = ["set -uo pipefail", ...exports, body, invocation].join("\n");
    const result = spawnSync("bash", ["-s"], {
      cwd: root,
      env: process.env,
      input: script,
      encoding: "utf8",
    });
    return {
      status: result.status,
      output: `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`,
    };
  } finally {
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Git Bash can briefly retain its cwd handle on Windows after spawnSync returns.
      // The directory is under the OS temp root and contains only this test harness.
    }
  }
}

const initRepo = [
  "git init -q",
  "git config user.email loop@example.invalid",
  "git config user.name loop-test",
  "printf '%s\\n' '# state' > AI_LOOP_STATE.md",
  "git add AI_LOOP_STATE.md",
  "git commit -qm baseline",
  "start_ref=$(git rev-parse HEAD)",
].join("\n");

describe("loop.sh verification gates", () => {
  it("is syntactically valid bash", () => {
    const result = spawnSync("bash", ["-n", "loop.sh"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it("keeps the provisional and final commits in the exact-clean evidence order", () => {
    const runCycle = sectionBetween("run_cycle() {", "\n}\n\ncount=0");
    const ordered = [
      "require_clean_evidence_cycle_start",
      "refresh_intake_queue",
      "report_qa_bucket",
      "npm run ai:loop",
      "run_agent",
      'require_provisional_commit "$start_ref"',
      "npm run --silent loop:rotate-state",
      "npm run crawl:smoke",
      "npm run health",
      'npm run verify:integrity -- --against "$start_ref"',
      "require_final_ledger_only",
      "safe_commit_if_enabled",
      "git push",
    ];

    let previous = -1;
    for (const needle of ordered) {
      const index = runCycle.indexOf(needle, previous + 1);
      expect(index, `run_cycle is missing ${needle}`).toBeGreaterThan(previous);
      previous = index;
    }
  });

  it("rotates completed loop state in both modes before post-change verification", () => {
    const runCycle = sectionBetween("run_cycle() {", "\n}\n\ncount=0");
    const provisional = runCycle.indexOf('require_provisional_commit "$start_ref"');
    const rotation = runCycle.indexOf("npm run --silent loop:rotate-state", provisional);
    const postCrawl = runCycle.indexOf("npm run crawl:smoke", rotation);
    const health = runCycle.indexOf("npm run health", rotation);
    const rotationBlock = runCycle.slice(rotation, postCrawl);
    const scripts = (
      JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
        scripts: Record<string, string>;
      }
    ).scripts;

    expect(rotation).toBeGreaterThan(provisional);
    expect(postCrawl).toBeGreaterThan(rotation);
    expect(health).toBeGreaterThan(postCrawl);
    expect(runCycle.match(/npm run --silent loop:rotate-state/gu)).toHaveLength(1);
    expect(rotationBlock).toContain(
      '_reject_cycle "loop-state-rotation" "deterministic final loop-state rotation failed"',
    );
    expect(runCycle.slice(provisional, rotation)).not.toContain("AI_LOOP_COMMIT");
    expect(scripts["loop:rotate-state"]).toBe("tsx scripts/rotate-loop-state.ts");
  });

  it("safe_commit_if_enabled is inert unless AI_LOOP_COMMIT=1", () => {
    const safeCommit = sectionBetween("safe_commit_if_enabled() {", "\n}\n\nreport_qa_bucket()");

    expect(safeCommit.indexOf('[[ "${AI_LOOP_COMMIT:-0}" != "1" ]]')).toBeLessThan(
      safeCommit.indexOf("loop:seal-feedback"),
    );
    expect(safeCommit.indexOf("loop:seal-feedback")).toBeLessThan(
      safeCommit.indexOf("git add -- AI_LOOP_STATE.md"),
    );
    expect(safeCommit).toContain('--expected-commit "$current_ref"');
    expect(safeCommit).toContain('--start-ref "$cycle_failure_start_ref"');
    expect(safeCommit.indexOf("git add -- AI_LOOP_STATE.md")).toBeLessThan(
      safeCommit.indexOf("git commit"),
    );
    expect(safeCommit).not.toContain("git add -A");
  });

  it("installs both root and UI dependencies before cycles can reach health", () => {
    const rootInstall = loopText.indexOf("if [[ ! -d node_modules ]]");
    const uiInstall = loopText.indexOf("if [[ ! -d ui/node_modules ]]");
    const cycle = loopText.indexOf("run_cycle() {");

    expect(rootInstall).toBeGreaterThanOrEqual(0);
    expect(uiInstall).toBeGreaterThan(rootInstall);
    expect(loopText.slice(uiInstall, cycle)).toContain("npm --prefix ui install");
    expect(cycle).toBeGreaterThan(uiInstall);
  });

  it("stops continuous evidence-only mode when a successful cycle leaves pending work", () => {
    const mainLoop = loopText.slice(loopText.indexOf("while true; do"));
    const success = mainLoop.indexOf('echo "✓ cycle');
    const pending = mainLoop.indexOf("Evidence-only work remains uncommitted");
    const stop = mainLoop.indexOf("break", pending);

    expect(success).toBeGreaterThanOrEqual(0);
    expect(pending).toBeGreaterThan(success);
    expect(stop).toBeGreaterThan(pending);
  });
});

describe("loop.sh per-cycle clean baseline and scoped cleanup", () => {
  const cleanEvidence = `${sectionBetween(
    "require_clean_evidence_cycle_start() {",
    "\n}\n\nremove_new_untracked_since_cycle_start()",
  )}\n}`;
  const cleanup = `${sectionBetween(
    "remove_new_untracked_since_cycle_start() {",
    "\n}\n\nlatest_prompt()",
  )}\n}`;

  it("requires every evidence-only cycle to start clean, even with the dirty override", () => {
    const clean = runGateHarness(
      [initRepo, cleanEvidence].join("\n"),
      { AI_LOOP_COMMIT: "0", AI_LOOP_ALLOW_DIRTY: "1" },
      "require_clean_evidence_cycle_start",
    );
    expect(clean.status, clean.output).toBe(0);

    const dirty = runGateHarness(
      [initRepo, "mkdir -p docs", "printf '%s\\n' pending > docs/pending.md", cleanEvidence].join(
        "\n",
      ),
      { AI_LOOP_COMMIT: "0", AI_LOOP_ALLOW_DIRTY: "1" },
      "require_clean_evidence_cycle_start",
    );
    expect(dirty.status).toBe(1);
    expect(dirty.output).toContain("exact-clean worktree at cycle start");
    expect(dirty.output).toContain("does not waive pure-play evidence provenance");

    const explicitRisk = runGateHarness(
      [initRepo, "printf '%s\\n' pending > pending.md", cleanEvidence].join("\n"),
      { AI_LOOP_COMMIT: "1", AI_LOOP_ALLOW_DIRTY: "1" },
      "require_clean_evidence_cycle_start",
    );
    expect(explicitRisk.status, explicitRisk.output).toBe(0);
  });

  it("removes only cycle-created untracked paths across the repo", () => {
    expect(cleanup).not.toContain("git clean -fdq content traces tests");
    const result = runGateHarness(
      [
        initRepo,
        "printf '%s\\n' 'ai-runs/' > .gitignore",
        "git add .gitignore",
        "git commit -qm ignore-evidence",
        "mkdir -p src ai-runs",
        "printf '%s\\n' precious > src/preexisting.ts",
        "snapshot=$(mktemp)",
        'git ls-files --others --exclude-standard -z > "$snapshot"',
        "mkdir -p docs ui/new scripts bin traces content tests ai-runs",
        "printf '%s\\n' cycle > src/cycle.ts",
        "printf '%s\\n' cycle > 'docs/cycle note.md'",
        "printf '%s\\n' cycle > ui/new/cycle.tsx",
        "printf '%s\\n' cycle > scripts/cycle.mjs",
        "printf '%s\\n' cycle > bin/cycle.ts",
        "printf '%s\\n' cycle > traces/cycle.yaml",
        "printf '%s\\n' cycle > content/cycle.yaml",
        "printf '%s\\n' cycle > tests/cycle.test.ts",
        "printf '%s\\n' evidence > ai-runs/evidence.md",
        cleanup,
      ].join("\n"),
      {},
      [
        'remove_new_untracked_since_cycle_start "$snapshot"',
        "test -f src/preexisting.ts",
        'test "$(cat src/preexisting.ts)" = precious',
        "test -f ai-runs/evidence.md",
        "test ! -e src/cycle.ts",
        "test ! -e 'docs/cycle note.md'",
        "test ! -e ui/new/cycle.tsx",
        "test ! -e scripts/cycle.mjs",
        "test ! -e bin/cycle.ts",
        "test ! -e traces/cycle.yaml",
        "test ! -e content/cycle.yaml",
        "test ! -e tests/cycle.test.ts",
        'rm -f -- "$snapshot"',
      ].join("\n"),
    );

    expect(result.status, result.output).toBe(0);
  });

  it("refuses cleanup when its exact cycle-start snapshot is unavailable", () => {
    const result = runGateHarness(
      [initRepo, "printf '%s\\n' precious > preexisting.md", cleanup].join("\n"),
      {},
      'remove_new_untracked_since_cycle_start "missing.snapshot"',
    );

    expect(result.status).toBe(1);
    expect(result.output).toContain("refusing broad cleanup");
  });

  it("captures untracked paths before assessment and wires delta cleanup after reset", () => {
    const runCycle = sectionBetween("run_cycle() {", "\n}\n\ncount=0");
    const snapshot = runCycle.indexOf(
      'git ls-files --others --exclude-standard -z > "$untracked_snapshot"',
    );
    const assess = runCycle.indexOf("npm run ai:loop");
    const reset = runCycle.indexOf('git reset --hard "$start_ref"');
    const cleanDelta = runCycle.indexOf(
      'remove_new_untracked_since_cycle_start "$untracked_snapshot"',
      reset,
    );

    expect(snapshot).toBeGreaterThanOrEqual(0);
    expect(assess).toBeGreaterThan(snapshot);
    expect(reset).toBeGreaterThanOrEqual(0);
    expect(cleanDelta).toBeGreaterThan(reset);
    expect(runCycle).not.toContain("git clean -fdq content traces tests");
  });
});

describe("loop.sh provisional/final commit contracts", () => {
  const provisional = `${sectionBetween(
    "require_provisional_commit() {",
    "\n}\n\nrequire_final_ledger_only()",
  )}\n}`;
  const ledgerOnly = `${sectionBetween(
    "require_final_ledger_only() {",
    "\n}\n\nsafe_commit_if_enabled()",
  )}\n}`;
  it("requires an advancing local commit in commit-enabled mode", () => {
    const missing = runGateHarness(
      [initRepo, provisional].join("\n"),
      { AI_LOOP_COMMIT: "1" },
      'require_provisional_commit "$start_ref"',
    );
    expect(missing.status).toBe(1);
    expect(missing.output).toContain("No provisional implementation commit");

    const present = runGateHarness(
      [
        initRepo,
        "printf '%s\\n' implementation > game.txt",
        "git add game.txt",
        "git commit -qm provisional",
        provisional,
      ].join("\n"),
      { AI_LOOP_COMMIT: "1" },
      'require_provisional_commit "$start_ref"',
    );
    expect(present.status, present.output).toBe(0);
    expect(present.output).toContain("local provisional revision present");
  });

  it("allows exactly one post-play tracked change: AI_LOOP_STATE.md", () => {
    const valid = runGateHarness(
      [initRepo, "printf '%s\\n' result >> AI_LOOP_STATE.md", ledgerOnly].join("\n"),
      { AI_LOOP_COMMIT: "1" },
      "require_final_ledger_only",
    );
    expect(valid.status, valid.output).toBe(0);

    const invalid = runGateHarness(
      [
        initRepo,
        "printf '%s\\n' result >> AI_LOOP_STATE.md",
        "printf '%s\\n' late-fix > late.ts",
        ledgerOnly,
      ].join("\n"),
      { AI_LOOP_COMMIT: "1" },
      "require_final_ledger_only",
    );
    expect(invalid.status).toBe(1);
    expect(invalid.output).toContain("Expected AI_LOOP_STATE.md to be the only");
    expect(invalid.output).toContain("late.ts");
  });
});

describe("loop.sh agent selection", () => {
  const agentCommand = `${sectionBetween("agent_cmd() {", "\n}\n\nrun_agent()")}\n}`;
  const registry = `${sectionBetween("dev_agent_binary() {", "\n}\n\ndev_agent_command()")}\n}\n${sectionBetween("dev_agent_command() {", "\n}\n\n# Resolve")}\n}`;
  // Empty PATH so ONLY the stub functions below resolve. Without this the test
  // inherits whatever agents happen to be installed on the machine running it, and
  // "no agent available" becomes unassertable on a developer box.
  const preamble = [
    "set -uo pipefail",
    'PATH=""',
    "DEV_AGENT_IDS=(codex claude gemini)",
    registry,
  ].join("\n");

  function resolve(lines: string[]): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync("bash", ["-s"], {
      cwd: process.cwd(),
      env: process.env,
      input: [preamble, ...lines, agentCommand, "agent_cmd"].join("\n"),
      encoding: "utf8",
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  it("never inspects a vendor credential file to decide which agent to run", () => {
    expect(agentCommand).not.toMatch(new RegExp(["auth", "json"].join("\\."), "i"));
    expect(agentCommand).not.toMatch(/credential/i);
  });

  it("auto-detects any supported agent, not one privileged vendor", () => {
    const codexOnly = resolve(["unset AI_AGENT AI_AGENT_CMD AI_CODEX_SANDBOX", "codex() { :; }"]);
    expect(codexOnly.status, codexOnly.stderr).toBe(0);
    expect(codexOnly.stdout).toContain("codex -a never exec --sandbox workspace-write --cd ");

    // With no codex installed the loop still runs — on whatever IS installed.
    const claudeOnly = resolve(["unset AI_AGENT AI_AGENT_CMD", "claude() { :; }"]);
    expect(claudeOnly.status, claudeOnly.stderr).toBe(0);
    expect(claudeOnly.stdout).toContain("claude -p");

    const geminiOnly = resolve(["unset AI_AGENT AI_AGENT_CMD", "gemini() { :; }"]);
    expect(geminiOnly.status, geminiOnly.stderr).toBe(0);
    expect(geminiOnly.stdout).toContain("gemini");
  });

  it("honours AI_AGENT over auto-detection order", () => {
    const result = resolve([
      "unset AI_AGENT_CMD",
      "codex() { :; }",
      "claude() { :; }",
      'AI_AGENT="claude"',
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("claude -p");
    expect(result.stdout).not.toContain("codex");
  });

  it("refuses to silently substitute another vendor when the requested one is absent", () => {
    // Substituting would make the cycle ledger claim work an agent never did.
    const result = resolve(["unset AI_AGENT_CMD", "codex() { :; }", 'AI_AGENT="gemini"']);
    expect(result.stdout.trim()).toBe("");
    expect(result.stderr).toContain("gemini");
    expect(result.stderr).toContain("not on PATH");
  });

  it("rejects an unknown AI_AGENT id instead of guessing", () => {
    const result = resolve(["unset AI_AGENT_CMD", "codex() { :; }", 'AI_AGENT="not-an-agent"']);
    expect(result.stdout.trim()).toBe("");
    expect(result.stderr).toContain("is not a known dev agent");
  });

  it("gives an explicit AI_AGENT_CMD precedence over every registry entry", () => {
    const result = resolve([
      "unset AI_CODEX_SANDBOX",
      "codex() { :; }",
      'AI_AGENT="codex"',
      'AI_AGENT_CMD="explicit-agent --headless"',
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("explicit-agent --headless\n");
  });

  it("emits nothing when no agent is available, so the cycle degrades to evidence-only", () => {
    const result = resolve(["unset AI_AGENT AI_AGENT_CMD"]);
    expect(result.stdout.trim()).toBe("");
  });
});

describe("the dev loop does not gate on a playtest", () => {
  const driver = readFileSync("loop.sh", "utf8");

  it("has no playtest gate left to fail a cycle", () => {
    // The whole point of splitting the loops: experience evidence is an INPUT to a
    // cycle, never a condition on landing one.
    expect(driver).not.toContain("require_playtest_record");
    expect(driver).not.toContain("loop:verify-playtest");
  });

  it("reads the intake queue instead, and cannot fail the cycle on it", () => {
    const bucket = `${sectionBetween("report_qa_bucket() {", "\n}\n\nawait_queued_work")}\n}`;
    // The queue, not just the QA bucket: an audit finding or a human request is work
    // too, and a loop that could only see playtest output would be blind to both.
    expect(bucket).toContain("run --silent work");
    // Every path returns 0: an empty or unreadable bucket is a normal state.
    expect(bucket).toContain("return 0");
    expect(bucket).not.toMatch(/return 1/);
  });

  it("keeps the mechanical gates as the whole bar", () => {
    expect(driver).toContain("crawl:smoke");
    expect(driver).toContain("npm run health");
    expect(driver).toContain("verify:integrity");
  });

  it("still rejects a cycle whose outer gates go red", () => {
    expect(driver).toContain('_reject_cycle "health"');
    expect(driver).toContain('_reject_cycle "integrity"');
    expect(driver).toContain('_reject_cycle "crawl-post"');
  });
});
