import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
    expect(owPrompt).toContain("first game action");
    expect(owPrompt).toContain("one-time tutorial");
    expect(owPrompt).not.toContain("mcp__adventureforge__start_world_quest");
    expect(owPrompt).not.toMatch(/30.?45|tool calls|take at least one road/i);
    expect(owPrompt).not.toMatch(
      /(?:stop|end|exit|finish|quit).{0,80}(?:after|at|around|within|once).{0,50}(?:\d+|ten|twenty|thirty|forty|fifty).{0,30}(?:mcp|tool)?\s*(?:calls?|invocations?|requests?|turns?)/is,
    );
    expect(owPrompt).not.toMatch(/(?:call|turn|request|invocation)\s*(?:budget|limit|quota)/i);
    expect(owPrompt).not.toContain("resolve_overworld_session_road_encounter");
    expect(owPrompt).not.toContain("start_overworld_session_quest");
    expect(owPrompt).toContain("game presents its actual journey choice");
    expect(owPrompt).toContain("After the game confirms the end");
    expect(owPrompt).toContain("json exit-interview");
    expect(owPrompt).toContain('"play_mode": "pure"');
    expect(owPrompt).not.toContain("pack_path");
    expect(runner).toContain("--play-mode");
    expect(runner).toContain("--run-evidence");
    expect(runner).toContain("--require-mode pure");
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

  it("treats the 900-second runner timeout knob as technical failure, never an exit", () => {
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
