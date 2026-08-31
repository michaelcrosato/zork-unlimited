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
const loopScript = readFileSync("loop.sh", "utf8");
const packageScripts = (
  JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  }
).scripts;

/** Independent test-side writer for the shipped `pid start_ticks` record format. */
const RECORD_PROCESS_IDENTITY = [
  "process_start_time() {",
  '  local pid="$1" stat tail',
  '  stat="$(<"/proc/$pid/stat")" || return 1',
  '  tail="${stat##*) }"',
  "  set -- $tail",
  '  printf "%s\\n" "${20}"',
  "}",
  "record_identity() {",
  '  local pid="$1" path="$2" start',
  '  start="$(process_start_time "$pid")" || return 1',
  '  printf "%s %s\\n" "$pid" "$start" > "$path"',
  "}",
].join("\n");

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
    for (const script of ["loop.sh", "scripts/loop-status.sh", "scripts/loop-stop.sh"]) {
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
      // Planting the worker retries until its recorded identity re-reads stable:
      // under heavy suite load, Git Bash's emulated /proc can transiently
      // mis-resolve a just-spawned background process, and this test then fails
      // on its SETUP (a dead or identity-shifted plant) rather than on the
      // classification it exists to witness. The retry hardens only the plant;
      // loop-status still must classify a live, authenticated, loop-less worker
      // as an orphan on its own.
      const harness = [
        RECORD_PROCESS_IDENTITY,
        "worker=",
        "for attempt in 1 2 3 4 5; do",
        "  sleep 300 &",
        "  worker=$!",
        '  if record_identity "$worker" ai-runs/agent.pid; then',
        "    sleep 0.2",
        '    now="$(process_start_time "$worker" 2>/dev/null || true)"',
        '    rec="$(cut -d" " -f2 ai-runs/agent.pid)"',
        '    if kill -0 "$worker" 2>/dev/null && [ -n "$now" ] && [ "$now" = "$rec" ]; then',
        "      break",
        "    fi",
        "  fi",
        '  kill "$worker" 2>/dev/null || true',
        '  wait "$worker" 2>/dev/null || true',
        "  worker=",
        "done",
        '[ -n "$worker" ] || { echo "precondition: could not plant a stable live worker"; exit 97; }',
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

  it("loop-status rejects a live reused pid whose start time does not match", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "ai-runs"));
      writeFileSync(join(root, "loop-status.sh"), statusScript);
      const harness = [
        RECORD_PROCESS_IDENTITY,
        "sleep 30 &",
        "worker=$!",
        'start="$(process_start_time "$worker")"',
        'printf "%s %s9\\n" "$worker" "$start" > ai-runs/loop.pid',
        "bash loop-status.sh",
        "rc=$?",
        'alive_after=0; kill -0 "$worker" 2>/dev/null && alive_after=1',
        'echo "status_rc=$rc alive_after=$alive_after"',
        'kill "$worker" 2>/dev/null || true',
        'wait "$worker" 2>/dev/null || true',
        "exit 0",
      ].join("\n");

      const result = runBashScript(harness, root);

      expect(result.status, result.output).toBe(0);
      expect(result.output).toContain("PROCESS-IDENTITY ANOMALY");
      expect(result.output).toContain("identity=mismatch");
      expect(result.output).toContain("status_rc=3 alive_after=1");
      expect(result.output).not.toContain("RUNNING (this project's loop.sh");
    });
  });

  it("loop-status fails closed when proc identity data is unavailable", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "ai-runs"));
      const noProcStatus = statusScript.replace(
        'AFK_PROC_ROOT="/proc"',
        'AFK_PROC_ROOT="/definitely-missing-proc"',
      );
      writeFileSync(join(root, "loop-status.sh"), noProcStatus);
      const harness = [
        RECORD_PROCESS_IDENTITY,
        "sleep 30 &",
        "worker=$!",
        'record_identity "$worker" ai-runs/loop.pid',
        "bash loop-status.sh",
        "rc=$?",
        'alive_after=0; kill -0 "$worker" 2>/dev/null && alive_after=1',
        'echo "status_rc=$rc alive_after=$alive_after"',
        'kill "$worker" 2>/dev/null || true',
        'wait "$worker" 2>/dev/null || true',
        "exit 0",
      ].join("\n");

      const result = runBashScript(harness, root);

      expect(result.status, result.output).toBe(0);
      expect(result.output).toContain("PROCESS-IDENTITY ANOMALY");
      expect(result.output).toContain("identity=unverifiable");
      expect(result.output).toContain("status_rc=3 alive_after=1");
      expect(result.output).not.toContain("RUNNING (this project's loop.sh");
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
      expect(result.output).toContain("No live authenticated processes for THIS project's loop");
      expect(existsSync(join(aiRuns, "loop.pid"))).toBe(false);
      expect(existsSync(join(aiRuns, "agent.pid"))).toBe(false);
    });
  });

  it("loop-stop refuses a mismatched live pid and leaves that unrelated process alive", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "ai-runs"));
      writeFileSync(join(root, "loop-stop.sh"), stopScript);
      const harness = [
        RECORD_PROCESS_IDENTITY,
        "sleep 30 &",
        "worker=$!",
        'start="$(process_start_time "$worker")"',
        'printf "%s %s9\\n" "$worker" "$start" > ai-runs/agent.pid',
        "bash loop-stop.sh",
        "rc=$?",
        'alive_after=0; kill -0 "$worker" 2>/dev/null && alive_after=1',
        'echo "stop_rc=$rc alive_after=$alive_after"',
        'kill "$worker" 2>/dev/null || true',
        'wait "$worker" 2>/dev/null || true',
        "exit 0",
      ].join("\n");

      const result = runBashScript(harness, root);

      expect(result.status, result.output).toBe(0);
      expect(result.output).toContain("pid was reused");
      expect(result.output).toContain("No signals sent");
      expect(result.output).toContain("stop_rc=3 alive_after=1");
    });
  });

  it("loop-stop kills a process only when both its pid and start time match", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "ai-runs"));
      writeFileSync(join(root, "loop-stop.sh"), stopScript);
      const harness = [
        RECORD_PROCESS_IDENTITY,
        "sleep 30 &",
        "worker=$!",
        'record_identity "$worker" ai-runs/agent.pid',
        "bash loop-stop.sh",
        "rc=$?",
        'alive_after=0; kill -0 "$worker" 2>/dev/null && alive_after=1',
        'echo "stop_rc=$rc alive_after=$alive_after"',
        'kill "$worker" 2>/dev/null || true',
        'wait "$worker" 2>/dev/null || true',
        "exit 0",
      ].join("\n");

      const result = runBashScript(harness, root);

      expect(result.status, result.output).toBe(0);
      expect(result.output).toContain("authenticated loop pids + descendants");
      expect(result.output).toContain("CONFIRMED STOPPED");
      expect(result.output).toContain("stop_rc=0 alive_after=0");
    });
  });

  it("loop-stop fails closed when proc identity data is unavailable", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "ai-runs"));
      const noProcStop = stopScript.replace(
        'AFK_PROC_ROOT="/proc"',
        'AFK_PROC_ROOT="/definitely-missing-proc"',
      );
      writeFileSync(join(root, "loop-stop.sh"), noProcStop);
      const harness = [
        RECORD_PROCESS_IDENTITY,
        "sleep 30 &",
        "worker=$!",
        'record_identity "$worker" ai-runs/agent.pid',
        "bash loop-stop.sh",
        "rc=$?",
        'alive_after=0; kill -0 "$worker" 2>/dev/null && alive_after=1',
        'echo "stop_rc=$rc alive_after=$alive_after"',
        'kill "$worker" 2>/dev/null || true',
        'wait "$worker" 2>/dev/null || true',
        "exit 0",
      ].join("\n");

      const result = runBashScript(harness, root);

      expect(result.status, result.output).toBe(0);
      expect(result.output).toContain("cannot be authenticated through /proc");
      expect(result.output).toContain("stop_rc=3 alive_after=1");
    });
  });

  it("never falls back to global process-name matching and cleans pid files on signals", () => {
    expect(stopScript).toContain("capture_descendants");
    expect(stopScript).toContain("identity_matches");
    expect(stopScript).not.toMatch(/pgrep|pkill|grep\s+.*loop\.sh|grep\s+.*claude/);

    expect(loopScript).toContain('write_process_record "$LOOP_PID_FILE" "$$"');
    expect(loopScript).toContain("trap 'on_loop_signal 130' INT");
    expect(loopScript).toContain("trap 'on_loop_signal 143' TERM");
    expect(loopScript).not.toContain('echo "$$" > "$LOOP_PID_FILE"');
  });

  it("fails the cycle on agent errors", () => {
    expect(loopScript).toContain('return "$rc"');
    expect(loopScript).toContain("agent_rc=$?");
    expect(loopScript).not.toContain("agent step reported an error — continuing to verify");
    expect(loopScript).toContain("loop:seal-feedback");
    expect(packageScripts["loop:seal-feedback"]).toBe("tsx scripts/seal-feedback-acceptance.ts");
  });

  it("pulls human Linear triage at cycle start, fail-open and opt-out-able", () => {
    // refresh_intake_queue runs at run_cycle start and inside the idle poll; the
    // Linear pull must be best-effort there (a keyless or offline lane continues
    // on the queue as it stands) and must never push from the loop.
    expect(loopScript).toContain("npm run --silent intake:sync:linear -- --pull-only || {");
    expect(loopScript).toContain('"${AI_LOOP_LINEAR_PULL:-1}" == "1"');
    expect(loopScript).toContain("Linear pull failed; continuing on the queue as it stands.");
    expect(packageScripts["intake:sync:linear"]).toBe("tsx scripts/sync-intake-linear.ts");
  });

  it("fails the cycle when an explicitly requested agent cannot run", () => {
    // "Fails loudly" must mean the exit code, not a stderr line: an unknown or
    // uninstalled AI_AGENT used to print and then proceed agent-less, so the
    // ledger could claim a cycle an absent vendor never worked.
    expect(loopScript).toContain("is not a known dev agent (${DEV_AGENT_IDS[*]})");
    expect(loopScript).toContain('was requested but \\"$requested_bin\\" is not on PATH');
    expect(loopScript).toContain(
      "The requested agent cannot run — failing this cycle rather than proceeding without it.",
    );
    expect(loopScript).toContain('if ! cmd="$(agent_cmd)"; then');
    // Both refusal branches must exit the resolver nonzero, not fall through.
    const resolver = loopScript.slice(
      loopScript.indexOf("agent_cmd() {"),
      loopScript.indexOf("run_agent() {"),
    );
    expect(resolver.match(/return 1/g)?.length).toBe(2);
  });

  it("rejects an evidence-only cycle whose agent committed anyway", () => {
    // AGENTS.md states "no provisional commit is allowed" as a driver property;
    // the driver must own it, not the prompt: a disobedient commit used to leave
    // a clean tree, so continuous mode kept going and unsealed commits (no
    // selection attestation, no acceptance-marker update) accumulated silently.
    expect(loopScript).toContain(
      'if [[ "${AI_LOOP_COMMIT:-0}" != "1" ]] && [[ "$(git rev-parse HEAD)" != "$start_ref" ]]; then',
    );
    expect(loopScript).toContain(
      "evidence-only cycle advanced HEAD; no commit is allowed with AI_LOOP_COMMIT=0",
    );
    expect(loopScript).toContain('_reject_cycle "evidence-commit"');
  });

  it("stops continuous mode after an agent-less auto-detect cycle instead of looping", () => {
    // With no vendor installed, every cycle "succeeds" on an unchanged tree and
    // burns the pre+post crawl plus the full health bar; the breakers count only
    // failures, so nothing ever tripped. One informative pass, then stop —
    // unless the operator explicitly asked for agent-less cycles.
    expect(loopScript).toContain("AGENTLESS_CYCLE=1");
    expect(loopScript).toContain(
      'if [[ "${AGENTLESS_CYCLE:-0}" == "1" && "${AI_LOOP_RUN_AGENT:-1}" == "1" ]]; then',
    );
    expect(loopScript).toContain("further cycles cannot make progress — stopping");
    // The deliberate agent-less mode keeps running: the stop is gated on
    // AI_LOOP_RUN_AGENT=1, and run_agent resets the marker at each cycle start.
    expect(loopScript).toContain("AGENTLESS_CYCLE=0");
  });

  it("reads the intake queue instead of verifying a per-cycle playtest", () => {
    // The dev loop no longer plays the game: experience evidence is an INPUT, produced
    // asynchronously by the playtest loop, never a condition on landing a change. And
    // the queue it reads is source-agnostic — playtest triage is one filer among
    // several, so an audit finding or a human request reaches the loop the same way.
    expect(loopScript).not.toContain("loop:verify-playtest");
    expect(loopScript).toContain("report_qa_bucket");
    expect(loopScript).toContain("run --silent work");
    expect(packageScripts["work"]).toBe("tsx bin/work.ts");
    expect(packageScripts["submit"]).toBe("tsx bin/submit.ts");
    expect(packageScripts["qa:triage"]).toBe("tsx bin/triage.ts");
  });

  it("can idle for queued work instead of inventing it", () => {
    expect(loopScript).toContain("AI_LOOP_IDLE_WHEN_EMPTY");
    expect(loopScript).toContain("await_queued_work");
    // Opt-in: the default must still fall through to assessor candidates, or an empty
    // queue would silently stall a loop nobody is watching.
    expect(loopScript).toContain('"${AI_LOOP_IDLE_WHEN_EMPTY:-0}" == "1"');
  });

  it("persists classified failures and exposes them through loop status", () => {
    expect(loopScript).toContain("failure-ledger.json");
    expect(loopScript).toContain("record_cycle_failure");
    // The classified gates that remain after the playtest gate was removed.
    expect(loopScript).toContain('_reject_cycle "health"');
    expect(loopScript).toContain('_reject_cycle "integrity"');
    expect(loopScript).not.toContain('_reject_cycle "playtest"');
    expect(statusScript).toContain("--- durable failure ledger ---");
    expect(statusScript).toContain("loop:failures -- summary");
  });
});
