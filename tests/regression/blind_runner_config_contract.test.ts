import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const CODEX_LOGIN_FILENAME = ["auth", ".json"].join("");
const RETIRED_CLAUDE_LOGIN_FILENAME = [".credentials", ".json"].join("");
const RETIRED_CLAUDE_OAUTH_FIELD = ["claude", "AiOauth"].join("");
const RETIRED_HOME_COMMAND = ["prepare", "-home"].join("");
const RETIRED_SOURCE_OPTION = ["--source", "-auth"].join("");
const RETIRED_PERMISSION_MODE = ["bypass", "Permissions"].join("");

describe("blind runner MCP config contract", () => {
  it("resolves caller-relative report prefixes before entering the isolated provider cwd", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");

    const normalization = runner.indexOf('OUT="$GAME_DIR/$OUT"');
    const providerReportArg = runner.indexOf('CODEX_REPORT_ARG="$(node_path_arg "$OUT.md")"');
    expect(runner).toContain('elif ! is_absolute_output_prefix "$OUT"; then');
    expect(normalization).toBeGreaterThan(0);
    expect(providerReportArg).toBeGreaterThan(normalization);
  });

  it("canonicalizes one relative linked Codex home before the provider cwd switch", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-codex-cli-owned-home-"));
    const bin = join(dir, "bin");
    const home = join(dir, "codex-home");
    const linkedHome = join(dir, "linked-codex-home");
    const capture = join(dir, "codex-invocation.txt");
    const relativeDirectory = `.tmp/blind-relative-out-${process.pid}-${Date.now()}`;
    const relativeOut = `${relativeDirectory}/attempt`;
    const auth = join(home, CODEX_LOGIN_FILENAME);
    const authBytes = '{"sentinel":"runner-must-not-copy-or-rewrite"}\n';
    const bashPath = (path: string): string =>
      path
        .replace(/^([A-Za-z]):\\/u, (_match, drive: string) => `/${drive.toLowerCase()}/`)
        .replaceAll("\\", "/");
    const comparablePath = (path: string): string =>
      path
        .replace(/^\/([A-Za-z])\//u, "$1:/")
        .replaceAll("\\", "/")
        .toLowerCase();

    try {
      mkdirSync(bin);
      mkdirSync(home);
      symlinkSync(home, linkedHome, "junction");
      writeFileSync(auth, authBytes);
      const fakeCodex = join(bin, "codex");
      writeFileSync(
        fakeCodex,
        `#!/usr/bin/env bash
{
  printf 'home=%s\\n' "\${CODEX_HOME:-}"
  printf 'arg=%s\\n' "$@"
} > "\${FAKE_CODEX_CAPTURE}"
exit 93
`,
        "utf8",
      );
      chmodSync(fakeCodex, 0o755);

      const result = spawnSync(
        process.execPath,
        ["blind-tester/blind-launch.mjs", "--out", relativeOut],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
            CODEX_HOME: relative(process.cwd(), linkedHome).replaceAll("\\", "/"),
            FAKE_CODEX_CAPTURE: bashPath(capture),
          },
          timeout: 30_000,
        },
      );
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
      expect(result.status, output).toBe(93);

      const invocation = readFileSync(capture, "utf8").trim().split(/\r?\n/u);
      const activeHome = invocation.find((line) => line.startsWith("home="))?.slice(5);
      const args = invocation
        .filter((line) => line.startsWith("arg="))
        .map((line) => line.slice(4));
      const reportIndex = args.indexOf("--output-last-message");
      const reportPath = args[reportIndex + 1] ?? "";
      expect(comparablePath(activeHome ?? "")).toBe(comparablePath(realpathSync.native(home)));
      expect(reportIndex).toBeGreaterThan(0);
      expect(reportPath).toMatch(/^(?:\/|[A-Za-z]:[\\/])/u);
      expect(reportPath.replaceAll("\\", "/")).toContain(`/${relativeOut}.md`);
      expect(args).toContain("--ignore-user-config");
      expect(args).toContain("--ignore-rules");
      expect(args).toContain("project_doc_max_bytes=0");
      expect(readFileSync(auth, "utf8")).toBe(authBytes);
    } finally {
      rmSync(join(process.cwd(), relativeDirectory), { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects pure and structural output prefixes inside an existing CODEX_HOME", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-codex-output-boundary-"));
    const home = join(dir, "codex-home");
    const auth = join(home, CODEX_LOGIN_FILENAME);
    const authBytes = '{"sentinel":"output-guard"}\n';
    mkdirSync(home);
    writeFileSync(auth, authBytes);
    try {
      for (const modeArgs of [[], ["--mock"]]) {
        const result = spawnSync(
          process.execPath,
          ["blind-tester/blind-launch.mjs", ...modeArgs, "--out", join(home, "reports", "attempt")],
          {
            cwd: process.cwd(),
            encoding: "utf8",
            env: { ...process.env, CODEX_HOME: home },
            timeout: 30_000,
          },
        );
        const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
        expect(result.status, `${modeArgs.join(" ")}: ${output}`).toBe(4);
        expect(output).toContain("Report output prefix must remain outside the Codex home");
        expect(output).toContain("no run artifacts were created");
        expect(readdirSync(home), modeArgs.join(" ")).toEqual([CODEX_LOGIN_FILENAME]);
        expect(readFileSync(auth, "utf8"), modeArgs.join(" ")).toBe(authBytes);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects directory and dot-segment output forms before suffixes can enter CODEX_HOME", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-codex-output-lexical-boundary-"));
    const home = join(dir, "codex-home");
    const auth = join(home, CODEX_LOGIN_FILENAME);
    const authBytes = '{"sentinel":"lexical-output-guard"}\n';
    mkdirSync(home);
    writeFileSync(auth, authBytes);
    const portableHome = home.replaceAll("\\", "/");
    try {
      for (const unsafeOut of [
        `${portableHome}/`,
        `${portableHome}/.`,
        `${portableHome}/scratch/../..`,
      ]) {
        const result = spawnSync(
          process.execPath,
          ["blind-tester/blind-launch.mjs", "--out", unsafeOut],
          {
            cwd: process.cwd(),
            encoding: "utf8",
            env: { ...process.env, CODEX_HOME: home },
            timeout: 30_000,
          },
        );
        const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
        expect(result.status, `${unsafeOut}: ${output}`).toBe(4);
        expect(output).toContain("must name a file prefix");
        expect(output).toContain("no run artifacts were created");
        expect(readdirSync(home), unsafeOut).toEqual([CODEX_LOGIN_FILENAME]);
        expect(readFileSync(auth, "utf8"), unsafeOut).toBe(authBytes);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects an NTFS alternate-stream-shaped prefix before creating artifacts", () => {
    if (process.platform !== "win32") return;
    const dir = mkdtempSync(join(tmpdir(), "af-codex-output-ads-boundary-"));
    const home = join(dir, "codex-home");
    const auth = join(home, CODEX_LOGIN_FILENAME);
    const authBytes = '{"sentinel":"ads-output-guard"}\n';
    mkdirSync(home);
    writeFileSync(auth, authBytes);
    try {
      const result = spawnSync(
        process.execPath,
        ["blind-tester/blind-launch.mjs", "--mock", "--out", `${home}:audit`],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, CODEX_HOME: home },
          timeout: 30_000,
        },
      );
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
      expect(result.status, output).toBe(4);
      expect(output).toContain("must not name a Windows alternate data stream");
      expect(output).toContain("no run artifacts were created");
      expect(readdirSync(home)).toEqual([CODEX_LOGIN_FILENAME]);
      expect(readFileSync(auth, "utf8")).toBe(authBytes);
      expect(readdirSync(dir)).toEqual(["codex-home"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("launches the MCP server cwd-independently on every platform", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");

    expect(runner).toContain('"command": "cmd.exe"');
    expect(runner).toContain("cd /d");
    expect(runner).toContain('"command": "npm"');
    // npm --prefix makes npm itself cd to the game dir. The config must NOT rely
    // on a `cwd` field: native Windows CLIs can ignore stdio-server
    // cwd, so the server would inherit the agent's isolated temp cwd and die
    // ("Missing script: mcp") — tools never load and the report is rejected.
    expect(runner).toContain('"args": ["--silent", "--prefix", "$GAME_DIR_MCP", "run", "mcp"');
    expect(runner).not.toContain('"cwd":');
    // Native Windows (Git Bash) must hand the native path form to the provider.
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
    expect(runner).not.toContain(`--permission-mode ${RETIRED_PERMISSION_MODE}`);
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
    expect(runner).toContain("--provider must be exactly codex");
    expect(runner).toContain("The live Claude blind provider is retired");
    expect(runner).toContain('MODEL="gpt-5.3-codex-spark"');
    expect(launcher).toContain('["provider", "--provider", true]');

    const launchAt = runner.indexOf('CODEX_EVENTS="$OUT.codex.jsonl"');
    const launchEnd = runner.indexOf("if [[ $STATUS -ne 0 ]]", launchAt);
    expect(launchAt).toBeGreaterThan(0);
    expect(launchEnd).toBeGreaterThan(launchAt);
    const codexLaunch = runner.slice(launchAt, launchEnd);
    expect(codexLaunch).toContain("codex exec");
    expect(codexLaunch).toContain("--sandbox read-only");
    expect(codexLaunch).not.toContain("--ephemeral");
    expect(codexLaunch).toContain('cd "$CODEX_PLAYER_CWD"');
    expect(codexLaunch).toContain('CODEX_HOME="$ACTIVE_CODEX_HOME_ARG"');
    expect(codexLaunch).toContain('CODEX_ROLLOUT="$OUT.codex-rollout.jsonl"');
    expect(codexLaunch).toContain('--home "$ACTIVE_CODEX_HOME_ARG"');
    expect(codexLaunch).toContain('--events "$CODEX_EVENTS_ARG"');
    expect(codexLaunch).toContain('--rollout "$CODEX_ROLLOUT_ARG"');
    expect(codexLaunch).toContain('CODEX_CAPTURE="$OUT.codex-capture.json"');
    expect(codexLaunch).toContain('--receipt "$CODEX_CAPTURE_ARG"');
    expect(codexLaunch).toContain('--expected-cwd "$CODEX_PLAYER_CWD_ARG"');
    expect(codexLaunch).toContain("--code-mode-contract strict-code-mode-v2");
    expect(runner).toContain("codex-rollout.mjs");
    expect(codexLaunch).toContain("--ignore-user-config");
    expect(codexLaunch).toContain("--ignore-rules");
    expect(codexLaunch).toContain("--strict-config");
    expect(codexLaunch).toContain("-c 'project_doc_max_bytes=0'");
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

  it("leaves Codex login state CLI-owned and captures only the public thread", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");
    const rolloutCapture = readFileSync(
      join(process.cwd(), "blind-tester", "codex-rollout.mjs"),
      "utf8",
    );

    expect(runner).toContain('RAW_CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"');
    expect(runner).toContain("resolve-home-if-present --home");
    expect(runner).toContain('ACTIVE_CODEX_HOME_ARG="$(node_path_arg "$ACTIVE_CODEX_HOME")"');
    expect(runner).toContain("validate-output");
    expect(runner.indexOf("validate-output")).toBeLessThan(runner.indexOf('WORK="$(mktemp -d)"'));
    expect(runner.indexOf("validate-output")).toBeLessThan(
      runner.indexOf('mkdir -p "$(dirname "$OUT")"'),
    );
    expect(runner).not.toContain("SOURCE_CODEX_AUTH");
    expect(runner).not.toContain("STERILE_CODEX_HOME");
    expect(runner).not.toContain("CODEX_HOME_RUNTIME_ROOT");
    expect(runner).not.toContain(RETIRED_HOME_COMMAND);
    expect(runner).not.toContain(RETIRED_SOURCE_OPTION);
    expect(runner).not.toContain(CODEX_LOGIN_FILENAME);
    expect(rolloutCapture).not.toContain(RETIRED_HOME_COMMAND);
    expect(rolloutCapture).not.toContain(RETIRED_SOURCE_OPTION);
    expect(rolloutCapture).not.toContain(CODEX_LOGIN_FILENAME);
    expect(rolloutCapture).toContain("publicCodexThreadId(eventsPath)");
    expect(rolloutCapture).toContain("walkMatchingRollouts(");
    expect(rolloutCapture).toContain("recorded.threadId !== threadId");
  });

  it("rejects unknown, explicit Claude, and ambient Claude providers before launch", () => {
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
    expect(output).toContain("--provider must be exactly codex");
    expect(output).not.toContain("Blind playtest →");

    for (const [args, env] of [
      [["--provider", "claude"], { ...process.env }],
      [[], { ...process.env, BLIND_PROVIDER: "claude" }],
    ] as const) {
      const retired = spawnSync(process.execPath, ["blind-tester/blind-launch.mjs", ...args], {
        cwd: process.cwd(),
        encoding: "utf8",
        env,
        timeout: 30_000,
      });
      const retiredOutput = `${retired.stdout ?? ""}\n${retired.stderr ?? ""}\n${retired.error?.message ?? ""}`;
      expect(retired.status, retiredOutput).toBe(2);
      expect(retiredOutput).toContain("live Claude blind provider is retired");
      expect(retiredOutput).not.toContain("Blind playtest →");
    }
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

  it("contains no current Claude runtime or direct credential handling", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");

    expect(existsSync(join(process.cwd(), "blind-tester", "loadtest.sh"))).toBe(false);
    expect(existsSync(join(process.cwd(), "blind-tester", "loadtest-fleet.sh"))).toBe(false);
    expect(runner).not.toContain("CLAUDE_CONFIG_DIR");
    expect(runner).not.toContain(RETIRED_CLAUDE_LOGIN_FILENAME);
    expect(runner).not.toContain(RETIRED_CLAUDE_OAUTH_FIELD);
    expect(runner).not.toMatch(/\btimeout\b[^\n]*\bclaude\b/u);
    expect(runner).not.toContain("scripts/blind-report-recovery.ts");
  });

  it("commits pure publication with an exclusive canonical sidecar only after every gate", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");
    expect(runner).toContain('DURABLE_RUN_EVIDENCE="$OUT.evidence.jsonl"');
    expect(runner).toContain('PRIVATE_RUN_SIDECAR="$WORK/verified-run-sidecar.json"');
    expect(runner).toContain("fs.constants.COPYFILE_EXCL");
    expect(runner).toContain("assert_launch_provenance_unchanged");
    expect(runner).not.toContain('--write-run-sidecar "$RUN_SIDECAR_ARG"');
    expect(runner.match(/--write-run-sidecar "\$PRIVATE_RUN_SIDECAR_ARG"/g)).toHaveLength(2);

    const privateVerification = runner.indexOf('--write-run-sidecar "$PRIVATE_RUN_SIDECAR_ARG"');
    const evidencePublication = runner.indexOf(
      "published evidence bytes differ from private evidence",
    );
    const finalProvenanceGate = runner.lastIndexOf("if ! assert_launch_provenance_unchanged");
    const canonicalSidecarPublication = runner.indexOf(
      '"$PRIVATE_RUN_SIDECAR_ARG" "$RUN_SIDECAR_ARG"',
    );
    const publicationComplete = runner.indexOf("PURE_PUBLICATION_COMPLETE=1");

    expect(privateVerification).toBeGreaterThan(0);
    expect(evidencePublication).toBeGreaterThan(privateVerification);
    expect(finalProvenanceGate).toBeGreaterThan(evidencePublication);
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
