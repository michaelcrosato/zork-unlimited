import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("blind runner MCP config contract", () => {
  it("launches the MCP server cwd-independently on every platform", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");

    expect(runner).toContain('"command": "cmd.exe"');
    expect(runner).toContain("cd /d");
    expect(runner).toContain('"command": "npm"');
    // npm --prefix makes npm itself cd to the game dir. The config must NOT rely
    // on a `cwd` field: the Claude CLI on Windows silently ignores stdio-server
    // cwd, so the server would inherit the agent's isolated temp cwd and die
    // ("Missing script: mcp") — tools never load and the report is rejected.
    expect(runner).toContain('"args": ["--silent", "--prefix", "$GAME_DIR_MCP", "run", "mcp"');
    expect(runner).not.toContain('"cwd":');
    // Native Windows (Git Bash) must hand the native path form to claude.exe.
    expect(runner).toContain("cygpath -m");
    expect(runner).not.toContain('"command": "bash"');
    expect(runner).not.toContain('"command": "wsl.exe"');
  });

  it("forwards spectate mode to the server as argv (clients may ignore env/cwd)", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");
    expect(runner).toContain("--spectate");
    expect(runner).toContain("--spectate-delay-ms");
    // The launcher shim keeps `npm run blind` off the WSL System32 bash trap.
    const pkg = readFileSync(join(process.cwd(), "package.json"), "utf8");
    expect(pkg).toContain('"blind": "node blind-tester/blind-launch.mjs"');
  });

  it("binds every MCP launch form to runner-owned seed and Git provenance", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");
    expect(runner).toContain("--run-seed");
    expect(runner).toContain("--build-commit");
    expect(runner).toContain("--tracked-worktree-clean");
    expect(runner).toContain("RUN_PROVENANCE_ARGS_JSON");
    expect(runner).toContain("RUN_PROVENANCE_CMD_SUFFIX");
    expect(runner).toContain("cmd.exe metacharacter");
    expect(runner).toContain('git -C "$GAME_DIR" diff --quiet --ignore-submodules=untracked --');
    expect(runner).toContain(
      'git -C "$GAME_DIR" diff --cached --quiet --ignore-submodules=untracked --',
    );
    expect(runner).not.toContain("git status --porcelain");
  });

  it("emits canonical private provenance while ignoring untracked files", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-blind-provenance-"));
    const out = join(dir, "capture");
    const untracked = join(
      process.cwd(),
      `.af-untracked-provenance-${process.pid}-${Date.now()}.tmp`,
    );
    try {
      writeFileSync(untracked, "untracked provenance fixture\n", "utf8");
      const result = spawnSync(
        process.execPath,
        ["blind-tester/blind-launch.mjs", "--mock", "--seed", "-17", "--out", out],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            BLIND_MOCK_AGENT_CMD: 'cat "$BLIND_MCP_CONFIG"; exit 93',
            BLIND_PERSONA: "default",
          },
          timeout: 30_000,
        },
      );
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
      expect(result.status, output).toBe(93);

      const config = JSON.parse(readFileSync(`${out}.md`, "utf8")) as {
        mcpServers: { adventureforge: { args: string[] } };
      };
      const args = config.mcpServers.adventureforge.args;
      const valueAfter = (flag: string) => args[args.indexOf(flag) + 1];

      const head = spawnSync("git", ["rev-parse", "--verify", "HEAD^{commit}"], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(head.status).toBe(0);
      const unstaged = spawnSync(
        "git",
        ["diff", "--quiet", "--ignore-submodules=untracked", "--"],
        { cwd: process.cwd() },
      );
      const staged = spawnSync(
        "git",
        ["diff", "--cached", "--quiet", "--ignore-submodules=untracked", "--"],
        { cwd: process.cwd() },
      );
      const expectedClean = unstaged.status === 0 && staged.status === 0;

      expect(valueAfter("--run-seed")).toBe("-17");
      expect(valueAfter("--build-commit")).toBe(head.stdout.trim());
      expect(valueAfter("--tracked-worktree-clean")).toBe(String(expectedClean));
    } finally {
      rmSync(untracked, { force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects non-integer and unsafe seeds before constructing MCP argv", () => {
    for (const seed of ["7&whoami", "1.5", "9007199254740992"]) {
      const result = spawnSync(
        process.execPath,
        ["blind-tester/blind-launch.mjs", "--mock", "--seed", seed],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, BLIND_MOCK_AGENT_CMD: "exit 93" },
          timeout: 30_000,
        },
      );
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
      expect(result.status, `${seed}: ${output}`).toBe(2);
      expect(output).toContain("--seed requires a JavaScript safe integer");
      expect(output).not.toContain("Using structural BLIND_AGENT_CMD override");
    }
  }, 30_000);

  it("DEFAULTS live play to the CORE GAME overworld and reserves quest mode for structural tests", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");
    const owPrompt = readFileSync(
      join(process.cwd(), "blind-tester", "prompt-overworld.md"),
      "utf8",
    );
    const launcher = readFileSync(join(process.cwd(), "blind-tester", "blind-launch.mjs"), "utf8");

    // The overworld core game is the DEFAULT blind test: with no quest id from
    // any source, run.sh resolves to overworld mode. Targeted single-quest mode
    // remains only for --smoke/--mock structural coverage; a real agent cannot
    // opt into it through CLI args, env, or an arbitrary BLIND_AGENT_CMD.
    expect(runner).toContain('if [[ -z "$QUEST_ID" ]]; then\n  OVERWORLD=1\nfi');
    expect(runner).toContain('if [[ "$OVERWORLD" == "1" && -n "$QUEST_ID" ]]; then');
    expect(runner).toContain('if [[ -n "$QUEST_ID" && "$SMOKE" != "1" && "$MOCK" != "1" ]]; then');
    expect(runner).toContain("Live blind LLM runs must start a fresh overworld game");
    expect(runner).toContain("Ambiguous: --overworld and a quest id were both given");
    expect(runner).not.toContain('QUEST_ID="breaking_weir"');
    expect(runner).toContain("--overworld");
    expect(runner).toContain("prompt-overworld.md");
    expect(runner).toContain("mcp__adventureforge__start_overworld");
    // The pure prompt carries only transport syntax. Gameplay objectives,
    // routes, coverage targets, and stopping are owned by the game itself.
    expect(owPrompt).toContain("mcp__adventureforge__start_overworld");
    expect(owPrompt).toContain("first and only pre-game tool invocation");
    expect(owPrompt).toContain("one-time tutorial");
    expect(owPrompt).not.toMatch(/30.?45|tool calls|take at least one road/i);
    expect(owPrompt).not.toMatch(
      /(?:stop|end|exit|finish|quit).{0,80}(?:after|at|around|within|once).{0,50}(?:\d+|ten|twenty|thirty|forty|fifty).{0,30}(?:mcp|tool)?\s*(?:calls?|invocations?|requests?|turns?)/is,
    );
    expect(owPrompt).not.toMatch(/(?:call|turn|request|invocation)\s*(?:budget|limit|quota)/i);
    expect(owPrompt).not.toContain("resolve_overworld_session_road_encounter");
    expect(owPrompt).toContain("mcp__adventureforge__start_overworld_session_quest");
    expect(owPrompt).toContain("context.quest_starts");
    expect(owPrompt).toContain("mcp__adventureforge__start_world_quest");
    expect(owPrompt).toContain("forbidden structural tool");
    expect(owPrompt).toContain("game presents its actual journey choice");
    expect(owPrompt).toContain("After the game confirms the end");
    expect(owPrompt).toContain("REPORT GATE — check every item immediately before sending");
    expect(owPrompt).toContain(
      "Do not write any part of the report until a game response contains",
    );
    expect(owPrompt).toContain("An active goal, checkpoint progress, or having enough material");
    expect(owPrompt).toContain("never invent an early receipt");
    expect(owPrompt).toContain("a `journey_exit_receipt` that is `null`, empty, partial");
    expect(owPrompt).toContain("current-state snapshot substituted for");
    expect(owPrompt).toContain("rejects the entire playtest");
    expect(owPrompt).toContain("Copy the entire `exitReceipt` object without omitting");
    expect(owPrompt).toContain("if you do not have it, continue playing instead of");
    expect(owPrompt).toContain("A plain `json` fence is invalid");
    expect(owPrompt).toContain("literal heading `Playthrough log`");
    expect(owPrompt.indexOf("REPORT GATE")).toBeGreaterThan(
      owPrompt.indexOf("After the game confirms the end"),
    );
    expect(owPrompt).toContain("json exit-interview");
    expect(owPrompt.match(/^```json exit-interview\r?$/gm)).toHaveLength(1);
    expect(owPrompt.indexOf("\n```json exit-interview")).toBeGreaterThan(
      owPrompt.indexOf("REPORT GATE"),
    );
    expect(owPrompt).toContain('"play_mode": "pure"');
    expect(owPrompt).not.toContain("pack_path");
    expect(runner).toContain("--play-mode");
    expect(runner).toContain("--run-evidence");
    expect(runner).toContain("--require-mode pure");
    expect(runner).toContain("--tools ToolSearch");
    expect(runner).toContain('--allowedTools ToolSearch "mcp__adventureforge__*"');
    expect(runner).toContain("--permission-mode dontAsk");
    expect(runner).not.toContain("--permission-mode bypassPermissions");
    const primaryLaunch = runner.slice(
      runner.indexOf("printf '%s' \"$PROMPT\""),
      runner.indexOf(') > "$OUT.json"'),
    );
    expect(primaryLaunch).toContain("--no-chrome");
    expect(primaryLaunch).toContain("--disable-slash-commands");
    expect(primaryLaunch).toContain("--prompt-suggestions false");
    expect(primaryLaunch).toContain('--name "adventureforge-blind-seed-$SEED"');
    expect(primaryLaunch).toContain("--setting-sources ''");
    expect(primaryLaunch).toContain('CLAUDE_CONFIG_DIR="$STERILE_CLAUDE_CONFIG_DIR"');
    expect(primaryLaunch).toContain("CLAUDE_CODE_DISABLE_AUTO_MEMORY=1");
    expect(primaryLaunch).not.toContain("--safe-mode");
    expect(primaryLaunch).not.toContain("--bare");
    // Structural flags survive PowerShell's `--` stripping via launcher recovery.
    expect(launcher).toContain('"--overworld"');
    expect(launcher).toContain('"--mock"');
    // Explicit --mock owns the bundled command; ambient agent overrides cannot
    // impersonate structural mode to bypass the live quest guard.
    expect(runner).toContain("printf -v BLIND_AGENT_CMD");
    expect(runner).toContain("$SCRIPT_DIR/mock-agent.mjs");
    expect(runner).toContain("BLIND_AGENT_CMD cannot produce pure retention evidence");
  });

  it("rejects an arbitrary agent override instead of labeling it pure", () => {
    const result = spawnSync(process.execPath, ["blind-tester/blind-launch.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, BLIND_AGENT_CMD: "exit 93" },
      timeout: 30_000,
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
    expect(result.status, output).toBe(2);
    expect(output).toContain("cannot produce pure retention evidence");
    expect(output).toContain("file/shell/web isolation is not enforceable");
    expect(output).not.toContain("Using structural BLIND_AGENT_CMD override");
  }, 30_000);

  it("offers a first-class fail-closed Codex pure provider without reopening overrides", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");
    const launcher = readFileSync(join(process.cwd(), "blind-tester", "blind-launch.mjs"), "utf8");
    const envelope = readFileSync(
      join(process.cwd(), "blind-tester", "codex-pure-envelope.mjs"),
      "utf8",
    );

    expect(runner).toContain('PROVIDER="${BLIND_PROVIDER:-codex}"');
    expect(runner).toContain("--provider)");
    expect(runner).toContain("--provider must be exactly claude or codex");
    expect(runner).toContain('MODEL="gpt-5.3-codex-spark"');
    expect(launcher).toContain('["provider", "--provider", true]');

    const launchAt = runner.indexOf('CODEX_EVENTS="$OUT.codex.jsonl"');
    const launchEnd = runner.indexOf("else\nprintf '%s'", launchAt);
    expect(launchAt).toBeGreaterThan(0);
    expect(launchEnd).toBeGreaterThan(launchAt);
    const codexLaunch = runner.slice(launchAt, launchEnd);
    expect(codexLaunch).toContain("codex exec");
    expect(codexLaunch).toContain("--sandbox read-only");
    expect(codexLaunch).not.toContain("--ephemeral");
    expect(codexLaunch).toContain('cd "$CODEX_PLAYER_CWD"');
    expect(codexLaunch).toContain('CODEX_HOME="$STERILE_CODEX_HOME_ARG"');
    expect(codexLaunch).toContain('CODEX_ROLLOUT="$OUT.codex-rollout.jsonl"');
    expect(codexLaunch).toContain('--rollout "$CODEX_ROLLOUT_ARG"');
    expect(codexLaunch).toContain('CODEX_CAPTURE="$OUT.codex-capture.json"');
    expect(codexLaunch).toContain('--receipt "$CODEX_CAPTURE_ARG"');
    expect(codexLaunch).toContain('--expected-cwd "$CODEX_PLAYER_CWD_ARG"');
    expect(codexLaunch).toContain("--code-mode-contract strict-code-mode-v2");
    expect(runner).toContain("codex-rollout.mjs");
    expect(codexLaunch).toContain("--ignore-user-config");
    expect(codexLaunch).toContain("--ignore-rules");
    expect(codexLaunch).toContain("--strict-config");
    expect(codexLaunch).toContain("--enable code_mode_only");
    expect(codexLaunch).toContain("--disable apps");
    expect(codexLaunch).toContain("--disable browser_use");
    expect(codexLaunch).toContain("--disable computer_use");
    expect(codexLaunch).toContain("--disable multi_agent");
    expect(codexLaunch).toContain("--disable plugins");
    expect(codexLaunch).toContain("--disable shell_snapshot");
    expect(codexLaunch).toContain("features.shell_tool=false");
    expect(codexLaunch).toContain('web_search="disabled"');
    expect(codexLaunch).toContain('approval_policy="never"');
    expect(codexLaunch).toContain("mcp_servers.adventureforge.enabled_tools");
    expect(codexLaunch).toContain("mcp_servers.adventureforge.required=true");
    expect(codexLaunch).not.toContain("dangerously-bypass");
    expect(codexLaunch).not.toContain("danger-full-access");

    expect(envelope).toContain('new Set(["agent_message", "reasoning", "mcp_tool_call"])');
    expect(envelope).toContain('item.server !== "adventureforge"');
    expect(envelope).toContain("CODEX_PURE_PLAYER_TOOLS.has(item.tool)");
    expect(envelope).toContain('rows.at(-1)?.type !== "turn.completed"');
    expect(runner).toContain('if [[ "$PROVIDER" == "codex" ]]; then');
    expect(runner).toContain("Codex has no resumed report turn");
    expect(runner).toContain("scripts/blind-receipt-binding.ts bind");
    expect(runner).toContain('--verifier-status "$VERIFY_STATUS" --attempt 0');
    expect(runner).toContain("was not eligible for receipt-only binding");

    const overrideGuard = runner.indexOf(
      'if [[ "$PLAY_MODE" == "pure" && -n "${BLIND_AGENT_CMD:-}" ]]',
    );
    expect(overrideGuard).toBeGreaterThan(0);
    expect(overrideGuard).toBeLessThan(launchAt);
    expect(runner.indexOf('DURABLE_RUN_EVIDENCE="$OUT.evidence.jsonl"')).toBeLessThan(launchAt);
    expect(runner.indexOf("PURE_PUBLICATION_COMPLETE=1")).toBeGreaterThan(launchEnd);
  });

  it("keeps the sterile Codex home out of the operating-system temp directory", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");

    expect(runner).toContain('CODEX_HOME_RUNTIME_ROOT="$GAME_DIR/.tmp/blind-codex-home"');
    expect(runner).toContain('STERILE_CODEX_HOME="$CODEX_HOME_RUNTIME_ROOT/$(basename "$WORK")"');
    expect(runner).not.toContain('STERILE_CODEX_HOME="$WORK/codex-home"');
    expect(runner).toContain('"${STERILE_CODEX_HOME_OWNED:-0}" == "1"');
    expect(runner).toContain('if ! mkdir "$STERILE_CODEX_HOME"; then');
    expect(runner.indexOf("STERILE_CODEX_HOME_OWNED=1")).toBeGreaterThan(
      runner.indexOf('if ! mkdir "$STERILE_CODEX_HOME"; then'),
    );
    expect(runner.indexOf('chmod 700 "$STERILE_CODEX_HOME"')).toBeGreaterThan(
      runner.indexOf("STERILE_CODEX_HOME_OWNED=1"),
    );
    expect(runner).toContain("--precreated-home");
    expect(runner).toContain('"$CODEX_HOME_RUNTIME_ROOT"/*) rm -rf -- "$STERILE_CODEX_HOME"');
    expect(runner).toContain("Refusing to remove unexpected sterile Codex home");
    expect(runner).toContain("Could not exclusively create sterile Codex home");
  });

  it("rejects an unknown pure provider before launching anything", () => {
    const result = spawnSync(
      process.execPath,
      ["blind-tester/blind-launch.mjs", "--provider", "not-a-provider"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, BLIND_PROVIDER: "claude" },
        timeout: 30_000,
      },
    );
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
    expect(result.status, output).toBe(2);
    expect(output).toContain("--provider must be exactly claude or codex");
    expect(output).not.toContain("Blind playtest →");
  }, 30_000);

  it("rejects every live quest source before launching an override agent", () => {
    const baseEnv: NodeJS.ProcessEnv = {
      ...process.env,
      BLIND_AGENT_CMD: "exit 93",
      BLIND_OVERWORLD: "0",
      BLIND_QUEST_ID: "",
    };
    delete baseEnv.npm_config_quest;
    delete baseEnv.npm_config_quest_id;

    const cases = [
      { label: "--quest", args: ["--quest", "breaking_weir"], env: baseEnv },
      { label: "positional", args: ["breaking_weir"], env: baseEnv },
      {
        label: "BLIND_QUEST_ID",
        args: [],
        env: { ...baseEnv, BLIND_QUEST_ID: "breaking_weir" },
      },
    ];

    for (const source of cases) {
      const result = spawnSync(
        process.execPath,
        ["blind-tester/blind-launch.mjs", ...source.args],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: source.env,
          timeout: 30_000,
        },
      );
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
      expect(result.status, `${source.label}: ${output}`).toBe(2);
      expect(output, source.label).toContain(
        "Live blind LLM runs must start a fresh overworld game",
      );
      expect(output, source.label).not.toContain("Using BLIND_AGENT_CMD override");
    }
  }, 30_000);

  it("rejects non-default live personas before launching an override agent", () => {
    const result = spawnSync(
      process.execPath,
      ["blind-tester/blind-launch.mjs", "--persona", "breaker"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, BLIND_AGENT_CMD: "exit 93", BLIND_PERSONA: "default" },
        timeout: 30_000,
      },
    );
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
    expect(result.status, output).toBe(2);
    expect(output).toContain("Pure live blind runs require --persona default");
    expect(output).not.toContain("Using BLIND_AGENT_CMD override");
  }, 30_000);

  it("keeps a 1200-second default failsafe and treats timeout as failure, never an exit", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");
    expect(runner).toContain('TIMEOUT="${BLIND_TIMEOUT:-1200}"');
    const dir = mkdtempSync(join(tmpdir(), "af-blind-timeout-"));
    try {
      const result = spawnSync(
        process.execPath,
        ["blind-tester/blind-launch.mjs", "--mock", "--out", join(dir, "timed-out")],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            BLIND_AGENT_CMD: "exit 93",
            BLIND_MOCK_AGENT_CMD: "sleep 5",
            BLIND_TIMEOUT: "1",
          },
          timeout: 15_000,
        },
      );
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
      expect(result.status, output).toBe(124);
      expect(output).toContain("technical timeout");
      expect(output).toContain("no exit interview or retention result is accepted");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("rejects a reused output prefix before launching an agent", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-blind-prefix-"));
    const out = join(dir, "attempt");
    try {
      writeFileSync(`${out}.md`, "prior accepted report\n", "utf8");
      writeFileSync(`${out}.run.json`, '{"prior":"sidecar"}\n', "utf8");
      const env = { ...process.env };
      delete env.BLIND_AGENT_CMD;
      delete env.BLIND_MOCK_AGENT_CMD;
      const result = spawnSync(process.execPath, ["blind-tester/blind-launch.mjs", "--out", out], {
        cwd: process.cwd(),
        encoding: "utf8",
        env,
        timeout: 30_000,
      });
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
      expect(result.status, output).toBe(4);
      expect(output).toContain("Refusing to reuse report prefix");
      expect(output).not.toContain("Using structural BLIND_AGENT_CMD override");
      expect(readFileSync(`${out}.md`, "utf8")).toBe("prior accepted report\n");
      expect(readFileSync(`${out}.run.json`, "utf8")).toBe('{"prior":"sidecar"}\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("allows only one authenticated, same-session, tool-free missing-interview repair", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");

    expect(runner).toContain("scripts/blind-report-recovery.ts prepare");
    expect(runner).toContain("--attempt 0");
    expect(runner).toContain('--resume "$CLAUDE_SESSION_ID"');
    expect(runner).toContain('--model "$MODEL"');
    expect(runner).not.toContain("--fork-session");
    expect(runner).toContain("--safe-mode");
    expect(runner).toContain("--no-chrome");
    expect(runner.match(/--setting-sources ''/g)).toHaveLength(2);
    expect(runner.match(/CLAUDE_CONFIG_DIR="\$STERILE_CLAUDE_CONFIG_DIR"/g)).toHaveLength(2);
    expect(runner.match(/CLAUDE_CODE_DISABLE_AUTO_MEMORY=1/g)).toHaveLength(2);
    expect(runner).toContain('--tools ""');
    expect(runner).toContain("printf '{\"mcpServers\":{}}\\n'");
    expect(runner).toContain('ToolSearch "mcp__adventureforge__*"');
    expect(runner).toContain("MAX_STRUCTURED_OUTPUT_RETRIES=0");
    expect(runner).toContain('--json-schema "$RECOVERY_JSON_SCHEMA"');
    expect(runner).toContain("--max-turns 1");
    expect(runner).toContain("scripts/blind-report-recovery.ts assert-evidence");
    expect(runner.match(/scripts\/blind-report-recovery\.ts assert-evidence/g)).toHaveLength(3);
    expect(runner).toContain('--initial-report "$INITIAL_REPORT_MARKER_ARG"');
    expect(runner).toContain("$OUT.initial-report.txt");
    expect(runner).toContain("$OUT.repair-report.txt");
    expect(runner).not.toContain("$OUT.initial.md");
    expect(runner).not.toContain("$OUT.repair.md");

    const canonicalCopy = runner.indexOf('cp -- "$REPAIR_REPORT" "$OUT.md"');
    const canonicalVerify = runner.indexOf(
      'scripts/verify-blind-report.ts "$REPORT_MD"',
      canonicalCopy,
    );
    expect(canonicalCopy).toBeGreaterThan(0);
    expect(canonicalVerify).toBeGreaterThan(canonicalCopy);
  });

  it("imports only subscription OAuth into an exclusive sterile Claude config", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");

    expect(runner).toContain('SOURCE_CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"');
    expect(runner).toContain('STERILE_CLAUDE_CONFIG_DIR="$WORK/claude-config"');
    expect(runner).toContain("parsed?.claudeAiOauth");
    expect(runner).toContain("JSON.stringify({ claudeAiOauth: oauth })");
    expect(runner).toContain('flag: "wx"');
    expect(runner).toContain("mode: 0o600");
    expect(runner).toContain("fs.chmodSync(destination, 0o600)");
    expect(runner).not.toMatch(/JSON\.stringify\(parsed\)/);
  });

  it("commits pure publication with an exclusive canonical sidecar only after every gate", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");
    expect(runner).toContain('DURABLE_RUN_EVIDENCE="$OUT.evidence.jsonl"');
    expect(runner).toContain('PRIVATE_RUN_SIDECAR="$WORK/verified-run-sidecar.json"');
    expect(runner).toContain("fs.constants.COPYFILE_EXCL");
    expect(runner).toContain("assert_launch_provenance_unchanged");
    expect(runner).not.toContain('--write-run-sidecar "$RUN_SIDECAR_ARG"');
    expect(runner.match(/--write-run-sidecar "\$PRIVATE_RUN_SIDECAR_ARG"/g)).toHaveLength(3);
    expect(runner).toContain('--require-mode pure --run-sidecar "$PRIVATE_RUN_SIDECAR_ARG"');

    const privateVerification = runner.indexOf('--write-run-sidecar "$PRIVATE_RUN_SIDECAR_ARG"');
    const evidencePublication = runner.indexOf(
      "published evidence bytes differ from private evidence",
    );
    const recoveryEvidenceGate = runner.indexOf(
      '--run-evidence "$DURABLE_RUN_EVIDENCE_ARG" --metadata "$RECOVERY_METADATA_ARG"',
    );
    const finalProvenanceGate = runner.lastIndexOf("if ! assert_launch_provenance_unchanged");
    const canonicalSidecarPublication = runner.indexOf(
      '"$PRIVATE_RUN_SIDECAR_ARG" "$RUN_SIDECAR_ARG"',
    );
    const publicationComplete = runner.indexOf("PURE_PUBLICATION_COMPLETE=1");

    expect(privateVerification).toBeGreaterThan(0);
    expect(evidencePublication).toBeGreaterThan(privateVerification);
    expect(recoveryEvidenceGate).toBeGreaterThan(evidencePublication);
    expect(finalProvenanceGate).toBeGreaterThan(recoveryEvidenceGate);
    expect(canonicalSidecarPublication).toBeGreaterThan(finalProvenanceGate);
    expect(publicationComplete).toBeGreaterThan(canonicalSidecarPublication);
    expect(runner.slice(publicationComplete)).not.toContain("assert_launch_provenance_unchanged");

    // An ordinary exit anywhere before the final marker removes the canonical
    // report/evidence too, while SIGKILL still leaves no sidecar for consumers.
    expect(runner).toContain('"${PURE_OUTPUT_PREFIX_OWNED:-0}" == "1"');
    expect(runner).toContain('"${PURE_PUBLICATION_COMPLETE:-0}" != "1"');
    expect(runner).toContain('rm -f -- "$OUT.md"');
    expect(runner).toContain('rm -f -- "$RUN_SIDECAR"');
    expect(runner).toContain('rm -f -- "$DURABLE_RUN_EVIDENCE"');
    expect(runner).toContain('rm -f -- "$RECEIPT_BINDING_METADATA"');

    expect(runner).toContain("record_playthrough_terminal verified");
    expect(runner).toContain("record_playthrough_terminal verified_recovered");
    expect(runner).toContain("record_playthrough_terminal verified_receipt_bound");
    expect(runner).toContain("record_playthrough_terminal verification_failed");
    expect(runner).not.toContain("transport_completed");
    expect(
      runner.match(/record_blind_telemetry "\$OUT\.json" playthrough "\$outcome"/g),
    ).toHaveLength(1);
  });

  it("smokes BOTH start surfaces — the default overworld and the quest drop-in", () => {
    const smoke = readFileSync(join(process.cwd(), "blind-tester", "smoke.mjs"), "utf8");
    expect(smoke).toContain('"start_overworld"');
    expect(smoke).toContain('"get_overworld_session_context"');
    expect(smoke).toContain("compact_context: true");
    expect(smoke).toContain("if_snapshot_hash");
    expect(smoke).toContain('"--play-mode", "structural"');
  });

  it("keeps structural targeted quest runs on world quest ids instead of raw pack starts", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");
    const prompt = readFileSync(join(process.cwd(), "blind-tester", "prompt.md"), "utf8");
    const smoke = readFileSync(join(process.cwd(), "blind-tester", "smoke.mjs"), "utf8");
    const mcpHarness = readFileSync(join(process.cwd(), "scripts", "mcp_play.ts"), "utf8");

    // The smoke's quest leg keeps a fallback id, but the real-run default is
    // the overworld — no quest id is baked into the run itself.
    expect(runner).toContain('"${QUEST_ID:-breaking_weir}"');
    expect(runner).toContain("--quest|--quest-id");
    expect(runner).toContain("mcp__adventureforge__start_world_quest");
    expect(runner).toContain("compact_observation = true");
    expect(runner).not.toContain("mcp__adventureforge__new_game");
    expect(runner).not.toContain("BLIND_PACK=");
    expect(runner).not.toContain("pack_path");
    expect(prompt).toContain("mcp__adventureforge__start_world_quest");
    expect(prompt).toContain("mcp__adventureforge__get_state");
    expect(prompt).toContain("compact_observation: true");
    expect(prompt).toContain("compact_state: true");
    expect(prompt).toContain("summary_only: true");
    expect(prompt).toContain("compact_summary: true");
    expect(prompt).toContain("compact_turns: true");
    expect(prompt).toContain("context");
    expect(prompt).toContain("{{START_INSTRUCTION}}");
    expect(prompt).not.toContain("mcp__adventureforge__new_game");
    expect(prompt).not.toContain("mcp__adventureforge__start_game");
    expect(prompt).not.toContain("pack_path");
    expect(prompt).not.toContain("story_path");
    expect(smoke).toContain('"breaking_weir"');
    expect(smoke).toContain('"start_world_quest"');
    expect(smoke).toContain("compact_observation: true");
    expect(smoke).toContain('"get_transcript"');
    expect(smoke).toContain('"get_state"');
    expect(smoke).toContain("compact_state: true");
    expect(smoke).toContain("summary_only: true");
    expect(smoke).toContain("compact_summary: true");
    expect(smoke).toContain("context");
    expect(smoke).not.toContain("start.mode");
    expect(smoke).not.toContain("mode ${start.mode}");
    expect(smoke).not.toContain('"new_game"');
    expect(smoke).not.toContain("pack_path");
    expect(smoke).not.toContain('"start_game"');
    expect(mcpHarness).toContain("<world_quest_id>");
    expect(mcpHarness).toContain('"start_world_quest"');
    expect(mcpHarness).toContain("world_quest_id: questId");
    expect(mcpHarness).toContain("compact_observation: true");
    expect(mcpHarness).toContain("compact_events: true");
    expect(mcpHarness).toContain("context: RpgCompactObservation");
    expect(mcpHarness).not.toContain("observation: Obs");
    expect(mcpHarness).not.toContain('"new_game"');
    expect(mcpHarness).not.toContain("pack_path");
  });

  it("asks for replay intent without prefilling a boolean answer", () => {
    const promptPaths = [
      join(process.cwd(), "blind-tester", "prompt.md"),
      join(process.cwd(), "blind-tester", "prompt-overworld.md"),
    ];

    for (const promptPath of promptPaths) {
      const prompt = readFileSync(promptPath, "utf8");
      expect(prompt).toContain(
        "Before writing the block, answer independently: “Would you personally choose to",
      );
      expect(prompt).toContain('"would_replay": <JSON boolean chosen after play>');
      expect(prompt).not.toMatch(/"would_replay"\s*:\s*(?:true|false)\b/);
    }
  });
});
