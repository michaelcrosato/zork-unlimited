/**
 * The loop status/stop helpers are part of the unattended safety surface. They
 * must act on this repo's recorded pid files, not broad process-name matches that
 * can read or kill another project. These tests run the real script bodies in
 * temporary roots so they never touch the worktree's actual ai-runs state.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const statusScript = readFileSync("scripts/loop-status.sh", "utf8");
const stopScript = readFileSync("scripts/loop-stop.sh", "utf8");

function withTempRoot(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "loop-process-"));
  try {
    run(root);
  } finally {
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Git Bash can briefly retain a cwd handle on Windows. The directory is a
      // disposable OS-temp test root with no repo data.
    }
  }
}

function runBashScript(
  script: string,
  cwd: string,
  args: string[] = [],
): {
  status: number | null;
  output: string;
} {
  const result = spawnSync("bash", ["-s", "--", ...args], {
    cwd,
    input: script,
    encoding: "utf8",
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`,
  };
}

describe("loop status/stop process helpers", () => {
  it("are syntactically valid bash", () => {
    for (const script of ["scripts/loop-status.sh", "scripts/loop-stop.sh"]) {
      const result = spawnSync("bash", ["-n", script], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(result.status, `${script}\n${result.stdout}\n${result.stderr}`).toBe(0);
    }
  });

  it("loop-status reports a stopped loop with no recorded live pids", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "ai-runs"));

      const result = runBashScript(statusScript, root);

      expect(result.status, result.output).toBe(0);
      expect(result.output).toContain("loop.sh pid=none");
      expect(result.output).toContain("worker pid=none");
      expect(result.output).toContain("STOPPED");
    });
  });

  it("loop-status detects a project-scoped orphan worker from agent.pid only", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "ai-runs"));
      writeFileSync(join(root, "loop-status.sh"), statusScript);
      const harness = [
        "sleep 30 &",
        "worker=$!",
        'echo "$worker" > ai-runs/agent.pid',
        "bash loop-status.sh",
        "rc=$?",
        'kill "$worker" 2>/dev/null || true',
        'wait "$worker" 2>/dev/null || true',
        'exit "$rc"',
      ].join("\n");

      const result = runBashScript(harness, root);

      expect(result.status, result.output).toBe(3);
      expect(result.output).toContain("ORPHAN-WORKER ANOMALY");
      expect(result.output).toContain("npm run loop:stop");
    });
  });

  it("loop-stop removes stale project pid files without scanning global process names", () => {
    withTempRoot((root) => {
      const aiRuns = join(root, "ai-runs");
      mkdirSync(aiRuns);
      writeFileSync(join(aiRuns, "loop.pid"), "999999");
      writeFileSync(join(aiRuns, "agent.pid"), "999998");

      const result = runBashScript(stopScript, root);

      expect(result.status, result.output).toBe(0);
      expect(result.output).toContain("No live processes for THIS project's loop");
      expect(existsSync(join(aiRuns, "loop.pid"))).toBe(false);
      expect(existsSync(join(aiRuns, "agent.pid"))).toBe(false);
    });
  });

  it("loop-stop dry-run names only recorded pids and descendants as kill targets", () => {
    expect(stopScript).toContain('loop_pid="$(cat ai-runs/loop.pid');
    expect(stopScript).toContain('agent_pid="$(cat ai-runs/agent.pid');

    const killSetSection = stopScript.slice(
      stopScript.indexOf("# Build the exact kill set"),
      stopScript.indexOf("if [ -z", stopScript.indexOf("# Build the exact kill set")),
    );

    expect(killSetSection).toContain('descendants "$loop_pid"');
    expect(killSetSection).toContain('descendants "$agent_pid"');
    expect(killSetSection).not.toMatch(/pgrep|pkill|grep\s+.*loop\.sh|grep\s+.*claude/);
  });
});
