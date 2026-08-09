/**
 * The autonomous loop's shell driver is a safety boundary, not just glue: it must
 * run the verification bar before committing and must refuse commits without the
 * mandatory blind-playtest report. Blind game agents cannot observe this layer, so
 * the test suite has to lock it directly.
 */
import { describe, expect, it } from "vitest";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { hashState } from "../../src/core/hash.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const REPO_ROOT = process.cwd();
const loopText = readFileSync("loop.sh", "utf8");
const CURRENT_WORLD = loadOverworldManifest(REPO_ROOT);
const CURRENT_WORLD_HASH = hashState(CURRENT_WORLD);
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

function stableWindowsNode(): string | null {
  if (process.platform !== "win32") return null;
  const located = spawnSync("where.exe", ["node"], { encoding: "utf8" });
  const candidates = located.stdout
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && existsSync(entry));
  return (
    candidates.find((entry) => /[\\/]Program Files[\\/]nodejs[\\/]node\.exe$/iu.test(entry)) ??
    candidates.at(-1) ??
    null
  );
}

function windowsPathForBash(path: string): string {
  const match = /^([A-Za-z]):[\\/](.*)$/u.exec(path);
  if (!match) return path.replaceAll("\\", "/");
  const drive = match[1]!.toLowerCase();
  const suffix = match[2]!.replaceAll("\\", "/");
  return BASH_REPO_ROOT.startsWith("/mnt/") ? `/mnt/${drive}/${suffix}` : `/${drive}/${suffix}`;
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

function cycleEvidenceFixture(expectedCommit: string): {
  report: string;
  evidence: string;
  sidecar: string;
} {
  const decisionProofHash = "b".repeat(64);
  const receiptPayload = {
    contractVersion: 1,
    exitReason: "player_ended_at_choice",
    goalVersion: 1,
    goalId: "albany_local_lead",
    goalStatus: "active",
    acceptedDecisions: 40,
    exitReasons: ["checkpoint"],
    checkpoint: 40,
    decisionProofHash,
    retentionHistory: [
      {
        sequence: 1,
        atDecision: 40,
        reasons: ["checkpoint"],
        checkpoint: 40,
        choice: "end",
        decisionProofHash,
      },
    ],
  };
  const receipt = { ...receiptPayload, receiptHash: hashState(receiptPayload) };
  const interview = {
    schema_version: 2,
    play_mode: "pure",
    start_surface: "fresh_overworld",
    retention_eligible: true,
    journey_exit_receipt: receipt,
    clarity: 4,
    enjoyment: 4,
    goal_understood: true,
    got_stuck: false,
    confusions: [],
    bugs: [],
    best_moment: "Following the local lead.",
    worst_moment: "The opening was dense.",
    would_replay: true,
    verdict: "The journey was coherent and worth continuing.",
  };
  const report = `# Cycle playtest

## Playthrough log

I followed the fresh-overworld goal until the journey checkpoint, then chose to end.

Clarity: 4/5. Enjoyment: 4/5.

## Verdict

The journey was coherent and worth continuing.

\`\`\`json exit-interview
${JSON.stringify(interview, null, 2)}
\`\`\`
`;
  const build = {
    git_commit: expectedCommit,
    tracked_worktree_clean: true,
    world_id: CURRENT_WORLD.id,
    world_hash: CURRENT_WORLD_HASH,
  };
  const evidence = `${JSON.stringify({
    schema_version: 2,
    play_mode: "pure",
    event: "fresh_start",
    start_surface: "fresh_overworld",
    session_id: "o-loop-driver-gate",
    run_seed: 17,
    build,
  })}\n${JSON.stringify({
    schema_version: 2,
    play_mode: "pure",
    event: "journey_exit",
    start_surface: "fresh_overworld",
    session_id: "o-loop-driver-gate",
    run_seed: 17,
    build,
    quest_outcomes: [],
    receipt,
  })}\n`;
  const sidecar = JSON.stringify({
    schema_version: 2,
    report_schema_version: 2,
    play_mode: "pure",
    start_surface: "fresh_overworld",
    retention_eligible: true,
    evidence_status: "verified",
    session_id: "o-loop-driver-gate",
    run_seed: 17,
    build,
    quest_outcomes: [],
    receipt,
  });
  return { report, evidence, sidecar };
}

function runGit(root: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function setupPlaytestGateFixture(root: string, reportMode: "missing" | "empty" | "valid"): void {
  mkdirSync(join(root, "content"), { recursive: true });
  cpSync(join(REPO_ROOT, "content", "world"), join(root, "content", "world"), {
    recursive: true,
  });
  mkdirSync(join(root, "content", "rpg"), { recursive: true });
  cpSync(join(REPO_ROOT, "content", "rpg", "quests"), join(root, "content", "rpg", "quests"), {
    recursive: true,
  });

  const windowsNode = stableWindowsNode();
  const useWindowsRuntime = windowsNode !== null;
  const loader = useWindowsRuntime
    ? pathToFileURL(join(REPO_ROOT, "node_modules", "tsx", "dist", "loader.mjs")).href
    : encodeURI(`file://${BASH_REPO_ROOT}/node_modules/tsx/dist/loader.mjs`);
  const verifier = useWindowsRuntime
    ? join(REPO_ROOT, "scripts", "verify-cycle-playtest.ts").replaceAll("\\", "/")
    : `${BASH_REPO_ROOT}/scripts/verify-cycle-playtest.ts`;
  const nodeCommand = windowsNode
    ? BASH_NODE_PLATFORM === "win32"
      ? windowsNode.replaceAll("\\", "/")
      : windowsPathForBash(windowsNode)
    : "node";
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      private: true,
      scripts: {
        "loop:verify-playtest": `"${nodeCommand}" --import "${loader}" "${verifier}"`,
      },
    }),
  );
  writeFileSync(join(root, ".gitignore"), "ai-runs/\n");
  writeFileSync(join(root, "AI_LOOP_STATE.md"), "# state\n");
  runGit(root, ["init", "-q"]);
  runGit(root, ["config", "user.email", "loop@example.invalid"]);
  runGit(root, ["config", "user.name", "loop-test"]);
  runGit(root, ["add", ".gitignore", "AI_LOOP_STATE.md", "package.json", "content"]);
  runGit(root, ["commit", "-qm", "baseline"]);
  const head = runGit(root, ["rev-parse", "HEAD"]);

  const runId = "2026-08-07T12-00-00-000Z";
  const runDir = join(root, "ai-runs", runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    join(root, "ai-runs", "latest-cycle.json"),
    JSON.stringify({ runId, playtestRecord: `ai-runs/${runId}/playtest.md` }),
  );
  const fixture = cycleEvidenceFixture(head);
  if (reportMode === "valid") writeFileSync(join(runDir, "playtest.md"), fixture.report);
  if (reportMode === "empty") writeFileSync(join(runDir, "playtest.md"), "");
  writeFileSync(join(runDir, "playtest.evidence.jsonl"), fixture.evidence);
  writeFileSync(join(runDir, "playtest.run.json"), fixture.sidecar);
}

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
      "npm run ai:loop",
      "run_agent",
      'require_provisional_commit "$start_ref"',
      "npm run crawl:smoke",
      "npm run health",
      'npm run verify:integrity -- --against "$start_ref"',
      "require_playtest_record",
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

  it("safe_commit_if_enabled is inert unless AI_LOOP_COMMIT=1", () => {
    const safeCommit = sectionBetween(
      "safe_commit_if_enabled() {",
      "\n}\n\nrequire_playtest_record()",
    );

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

  it("uses installed Codex as the only automatic agent and never inspects its login file", () => {
    expect(agentCommand).toContain("if command -v codex >/dev/null 2>&1; then");
    expect(agentCommand).not.toMatch(/claude/i);
    expect(agentCommand).not.toMatch(new RegExp(["auth", "json"].join("\\."), "i"));
  });

  it("resolves the installed Codex CLI for automatic runs", () => {
    const result = spawnSync("bash", ["-s"], {
      cwd: process.cwd(),
      env: process.env,
      input: [
        "set -uo pipefail",
        "unset AI_AGENT_CMD AI_CODEX_SANDBOX",
        "codex() { :; }",
        agentCommand,
        "agent_cmd",
      ].join("\n"),
      encoding: "utf8",
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("codex -a never exec --sandbox workspace-write --cd ");
  });

  it("gives an explicit AI_AGENT_CMD precedence over automatic Codex selection", () => {
    const result = spawnSync("bash", ["-s"], {
      cwd: process.cwd(),
      env: process.env,
      input: [
        "set -uo pipefail",
        "unset AI_CODEX_SANDBOX",
        "codex() { :; }",
        'AI_AGENT_CMD="explicit-agent --headless"',
        agentCommand,
        "agent_cmd",
      ].join("\n"),
      encoding: "utf8",
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toBe("explicit-agent --headless\n");
  });
});

describe("require_playtest_record", () => {
  const gate = `${sectionBetween("require_playtest_record() {", "\n}\n\nrun_cycle()")}\n}`;

  it("is a no-op for evidence-only runs", () => {
    const result = runGateHarness(gate, { AI_LOOP_COMMIT: "0" });

    expect(result.status, result.output).toBe(0);
  });

  it("refuses to commit when latest-cycle metadata is missing", () => {
    const result = runGateHarness(gate, { AI_LOOP_COMMIT: "1" });

    expect(result.status).toBe(1);
    expect(result.output).toContain("No cycle metadata");
    expect(result.output).toContain("Refusing to commit");
  });

  it("refuses to commit when the recorded report is absent or empty despite valid raw evidence", () => {
    const missing = runGateHarness(
      gate,
      { AI_LOOP_COMMIT: "1" },
      "require_playtest_record",
      (root) => setupPlaytestGateFixture(root, "missing"),
    );
    expect(missing.status).toBe(5);
    expect(missing.output).toContain("cycle playtest report is missing");

    const empty = runGateHarness(gate, { AI_LOOP_COMMIT: "1" }, "require_playtest_record", (root) =>
      setupPlaytestGateFixture(root, "empty"),
    );
    expect(empty.status).toBe(5);
    expect(empty.output).toContain("report is empty");
  });

  it("allows a commit only for a report reproduced by raw evidence and a sidecar", () => {
    const result = runGateHarness(
      gate,
      { AI_LOOP_COMMIT: "1" },
      "require_playtest_record",
      (root) => setupPlaytestGateFixture(root, "valid"),
    );

    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("verified pure cycle playtest");
  });
});
