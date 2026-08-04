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
import { basename, delimiter, dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error — plain .mjs module without type declarations
import { fillPrompt } from "../../blind-tester/fill-prompt.mjs";
import { useCleanTrackedGitCheckout } from "./support/clean_git_checkout.js";

const CODEX_LOGIN_FILENAME = ["auth", ".json"].join("");
const RETIRED_CLAUDE_LOGIN_FILENAME = [".credentials", ".json"].join("");
const RETIRED_CLAUDE_OAUTH_FIELD = ["claude", "AiOauth"].join("");
const RETIRED_HOME_COMMAND = ["prepare", "-home"].join("");
const RETIRED_SOURCE_OPTION = ["--source", "-auth"].join("");
const RETIRED_PERMISSION_MODE = ["bypass", "Permissions"].join("");
const SPARK_PLAYER_INSTRUCTIONS =
  "You are an autonomous first-time player of an AdventureForge text TTRPG. " +
  "Follow the user play request. Use only preloaded AdventureForge gameplay functions and " +
  "exact current player-visible values. Never use coding, planning, search, or MCP resource tools.";

interface SparkModelCatalog {
  models: Array<{
    slug: string;
    shell_type: string;
    base_instructions: string;
    include_skills_usage_instructions: boolean;
    apply_patch_tool_type: null;
    truncation_policy: { mode: string; limit: number };
    supports_parallel_tool_calls: boolean;
    context_window: number;
    auto_compact_token_limit: number | null;
    experimental_supported_tools: unknown[];
    supports_search_tool: boolean;
    tool_mode: string;
  }>;
}

interface PurePreflightTripwire {
  home: string;
  providerMarker: string;
  selected: string;
  versionMarker: string;
}

function bashPath(path: string): string {
  return path
    .replace(/^([A-Za-z]):\\/u, (_match, drive: string) => `/${drive.toLowerCase()}/`)
    .replaceAll("\\", "/");
}

function installPurePreflightTripwire(root: string): PurePreflightTripwire {
  const home = join(root, "codex-home");
  const selected = join(root, "preflight-tripwire-codex");
  const versionMarker = join(root, "selected-binary-version.txt");
  const providerMarker = join(root, "provider-exec.txt");
  mkdirSync(home);
  writeFileSync(
    selected,
    `#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then
  printf 'version\\n' >> "\${FAKE_VERSION_MARKER}"
  probe=0
  if [[ -n "\${FAKE_PROBE_COUNT:-}" ]]; then
    if [[ -f "\${FAKE_PROBE_COUNT}" ]]; then read -r probe < "\${FAKE_PROBE_COUNT}"; fi
    probe=$((probe + 1))
    printf '%s' "\${probe}" > "\${FAKE_PROBE_COUNT}"
  fi
  if [[ -n "\${FAKE_DRIFT_TARGET:-}" && "\${probe}" == "\${FAKE_DRIFT_ON_PROBE:-0}" ]]; then
    printf '\\ntracked setup drift\\n' >> "\${FAKE_DRIFT_TARGET}"
  fi
  printf 'codex-cli 0.146.0\\n'
  exit 0
fi
printf 'provider-exec\\n' > "\${FAKE_PROVIDER_MARKER}"
exit 93
`,
    "utf8",
  );
  chmodSync(selected, 0o755);
  return { home, providerMarker, selected, versionMarker };
}

function launchPureTripwire(
  checkout: string,
  tripwire: PurePreflightTripwire,
  out: string,
  extraEnv: NodeJS.ProcessEnv = {},
  extraArgs: string[] = [],
) {
  return spawnSync(
    process.execPath,
    ["blind-tester/blind-launch.mjs", "--out", out, ...extraArgs],
    {
      cwd: checkout,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "test",
        CODEX_HOME: tripwire.home,
        BLIND_CODEX_BIN: bashPath(tripwire.selected),
        BLIND_CODEX_TEST_SCRIPT_CLIENT: "1",
        FAKE_PROVIDER_MARKER: bashPath(tripwire.providerMarker),
        FAKE_VERSION_MARKER: bashPath(tripwire.versionMarker),
        ...extraEnv,
      },
      timeout: 30_000,
    },
  );
}

function expectNoOutputArtifacts(out: string): void {
  const directory = dirname(out);
  if (!existsSync(directory)) return;
  const ownedPrefix = `${basename(out)}.`;
  expect(readdirSync(directory).filter((name) => name.startsWith(ownedPrefix))).toEqual([]);
}

function expectRejectedBeforeSelectedBinary(
  result: ReturnType<typeof spawnSync>,
  tripwire: PurePreflightTripwire,
  out: string,
): void {
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
  expect(result.status, output).toBe(4);
  expect(output).toContain(
    "Pure blind runs require a clean tracked worktree; no provider was launched.",
  );
  expect(existsSync(tripwire.versionMarker)).toBe(false);
  expect(existsSync(tripwire.providerMarker)).toBe(false);
  expectNoOutputArtifacts(out);
}

function runGit(cwd: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env });
  expect(result.status, `${args.join(" ")}\n${result.stderr}`).toBe(0);
  return result;
}

describe("blind runner MCP config contract", () => {
  const cleanGit = useCleanTrackedGitCheckout();

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
    const fallbackCapture = join(dir, "fallback-invocation.txt");
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
      const fakeCodex = join(dir, "selected codex");
      writeFileSync(
        fakeCodex,
        `#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then
  printf 'phase=version\\nhome=%s\\n' "\${CODEX_HOME:-}" >> "\${FAKE_CODEX_CAPTURE}"
  printf 'codex-cli 0.146.0\\n'
  exit 0
fi
{
  printf 'phase=exec\\n'
  printf 'home=%s\\n' "\${CODEX_HOME:-}"
  printf 'arg=%s\\n' "$@"
} >> "\${FAKE_CODEX_CAPTURE}"
exit 93
`,
        "utf8",
      );
      chmodSync(fakeCodex, 0o755);
      const fallbackCodex = join(bin, "codex");
      writeFileSync(
        fallbackCodex,
        `#!/usr/bin/env bash
printf 'fallback-used\\n' > "\${FAKE_FALLBACK_CAPTURE}"
printf 'codex-cli 9.9.9\\n'
exit 0
`,
        "utf8",
      );
      chmodSync(fallbackCodex, 0o755);

      const result = spawnSync(
        process.execPath,
        ["blind-tester/blind-launch.mjs", "--out", relativeOut],
        {
          cwd: cleanGit.path,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
            CODEX_HOME: relative(cleanGit.path, linkedHome).replaceAll("\\", "/"),
            BLIND_CODEX_BIN: bashPath(fakeCodex),
            BLIND_CODEX_TEST_SCRIPT_CLIENT: "1",
            FAKE_CODEX_CAPTURE: bashPath(capture),
            FAKE_FALLBACK_CAPTURE: bashPath(fallbackCapture),
          },
          timeout: 30_000,
        },
      );
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
      expect(result.status, output).toBe(93);

      const invocation = readFileSync(capture, "utf8").trim().split(/\r?\n/u);
      const activeHomes = invocation
        .filter((line) => line.startsWith("home="))
        .map((line) => line.slice(5));
      const args = invocation
        .filter((line) => line.startsWith("arg="))
        .map((line) => line.slice(4));
      const reportIndex = args.indexOf("--output-last-message");
      const reportPath = args[reportIndex + 1] ?? "";
      expect(invocation.filter((line) => line === "phase=version")).toHaveLength(3);
      expect(invocation.filter((line) => line === "phase=exec")).toHaveLength(1);
      expect(activeHomes).toHaveLength(4);
      expect(activeHomes.map(comparablePath)).toEqual([
        comparablePath(realpathSync.native(home)),
        comparablePath(realpathSync.native(home)),
        comparablePath(realpathSync.native(home)),
        comparablePath(realpathSync.native(home)),
      ]);
      expect(reportIndex).toBeGreaterThan(0);
      expect(reportPath).toMatch(/^(?:\/|[A-Za-z]:[\\/])/u);
      expect(reportPath.replaceAll("\\", "/")).toContain(`/${relativeOut}.md`);
      expect(args).toContain("--ignore-user-config");
      expect(args).toContain("--ignore-rules");
      expect(args).toContain("project_doc_max_bytes=0");
      expect(existsSync(fallbackCapture)).toBe(false);
      expect(readFileSync(auth, "utf8")).toBe(authBytes);
    } finally {
      rmSync(join(cleanGit.path, relativeDirectory), { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("fails closed when the bounded final client probe differs from launch", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-codex-final-version-drift-"));
    const home = join(dir, "home");
    const selected = join(dir, "selected-codex");
    const probeCount = join(dir, "probe-count.txt");
    const out = join(dir, "reports", "attempt");
    const bashPath = (path: string): string =>
      path
        .replace(/^([A-Za-z]):\\/u, (_match, drive: string) => `/${drive.toLowerCase()}/`)
        .replaceAll("\\", "/");
    try {
      mkdirSync(home);
      writeFileSync(
        selected,
        `#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then
  count=0
  [[ -f "\${PROBE_COUNT}" ]] && count="$(cat "\${PROBE_COUNT}")"
  count=$((count + 1))
  printf '%s' "$count" > "\${PROBE_COUNT}"
  if [[ "$count" -lt 3 ]]; then
    printf 'codex-cli 0.146.0\\n'
  else
    printf 'codex-cli 0.147.0\\n'
  fi
  exit 0
fi
exit 93
`,
      );
      chmodSync(selected, 0o755);
      const result = spawnSync(process.execPath, ["blind-tester/blind-launch.mjs", "--out", out], {
        cwd: cleanGit.path,
        encoding: "utf8",
        env: {
          ...process.env,
          CODEX_HOME: home,
          BLIND_CODEX_BIN: bashPath(selected),
          BLIND_CODEX_TEST_SCRIPT_CLIENT: "1",
          PROBE_COUNT: bashPath(probeCount),
        },
        timeout: 30_000,
      });
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
      expect(result.status, output).toBe(42);
      expect(output).toContain("expected cli=0.146.0");
      expect(output).toContain("observed cli=0.147.0");
      expect(readFileSync(probeCount, "utf8")).toBe("3");
      expect(existsSync(`${out}.md`)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("preserves caller errexit state so a post-probe capture failure reaches mapped diagnostics", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-codex-final-probe-errexit-"));
    const home = join(dir, "home");
    const selected = join(dir, "selected-codex");
    const probeCount = join(dir, "probe-count.txt");
    const out = join(dir, "reports", "attempt");
    const bashPath = (path: string): string =>
      path
        .replace(/^([A-Za-z]):\\/u, (_match, drive: string) => `/${drive.toLowerCase()}/`)
        .replaceAll("\\", "/");
    try {
      mkdirSync(home);
      writeFileSync(
        selected,
        `#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then
  count=0
  [[ -f "\${PROBE_COUNT}" ]] && count="$(cat "\${PROBE_COUNT}")"
  printf '%s' "$((count + 1))" > "\${PROBE_COUNT}"
  printf 'codex-cli 0.146.0\\n'
  exit 0
fi
printf '{"type":"thread.started","thread_id":"77777777-7777-4777-8777-777777777777"}\\n'
exit 0
`,
      );
      chmodSync(selected, 0o755);
      const result = spawnSync(process.execPath, ["blind-tester/blind-launch.mjs", "--out", out], {
        cwd: cleanGit.path,
        encoding: "utf8",
        env: {
          ...process.env,
          CODEX_HOME: home,
          BLIND_CODEX_BIN: bashPath(selected),
          BLIND_CODEX_TEST_SCRIPT_CLIENT: "1",
          PROBE_COUNT: bashPath(probeCount),
        },
        timeout: 30_000,
      });
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
      expect(result.status, output).toBe(4);
      expect(readFileSync(probeCount, "utf8")).toBe("3");
      expect(output).toContain("blind run failed (exit 4)");
      expect(output).toContain("telemetry:");
      expect(existsSync(`${out}.md`)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("preflight-only validates the selected CLI without resolving or inspecting CODEX_HOME", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-codex-client-preflight-"));
    const bin = join(dir, "bin");
    const homeTripwire = join(dir, "codex-home-is-a-file");
    const selected = join(dir, "selected-codex");
    const selectedCapture = join(dir, "selected-capture.txt");
    const fallbackCapture = join(dir, "fallback-capture.txt");
    const out = join(dir, "reports", "attempt");
    const homeTripwireBytes = "preflight-only must not require this path to be a directory\n";
    const bashPath = (path: string): string =>
      path
        .replace(/^([A-Za-z]):\\/u, (_match, drive: string) => `/${drive.toLowerCase()}/`)
        .replaceAll("\\", "/");

    try {
      mkdirSync(bin);
      writeFileSync(homeTripwire, homeTripwireBytes);
      writeFileSync(
        selected,
        `#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then
  printf 'version home=%s\\n' "\${CODEX_HOME:-}" >> "\${SELECTED_CAPTURE}"
  printf 'codex-cli 0.146.0\\n'
  exit 0
fi
printf 'gameplay reached\\n' >> "\${SELECTED_CAPTURE}"
exit 0
`,
      );
      chmodSync(selected, 0o755);
      const fallback = join(bin, "codex");
      writeFileSync(
        fallback,
        `#!/usr/bin/env bash
printf 'fallback reached\\n' > "\${FALLBACK_CAPTURE}"
printf 'codex-cli 0.145.0\\n'
exit 0
`,
      );
      chmodSync(fallback, 0o755);

      const result = spawnSync(
        process.execPath,
        [
          "blind-tester/blind-launch.mjs",
          "--preflight-only",
          "--client-authority-json",
          "--model",
          "gpt-5.3-codex-spark",
          "--out",
          out,
        ],
        {
          cwd: cleanGit.path,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
            CODEX_HOME: homeTripwire,
            BLIND_CODEX_BIN: bashPath(selected),
            BLIND_CODEX_TEST_SCRIPT_CLIENT: "1",
            SELECTED_CAPTURE: bashPath(selectedCapture),
            FALLBACK_CAPTURE: bashPath(fallbackCapture),
          },
          timeout: 30_000,
        },
      );
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
      expect(result.status, output).toBe(0);
      expect(output).toContain('"cli_version":"0.146.0"');
      expect(output).toContain("selected-codex");
      expect(JSON.parse(result.stdout ?? "")).toMatchObject({
        schema_version: 2,
        launcher_kind: "direct",
        cli_version: "0.146.0",
        test_script: true,
      });
      expect(output).not.toContain("models_cache");
      expect(readFileSync(selectedCapture, "utf8")).toMatch(/^version home=/u);
      expect(readFileSync(selectedCapture, "utf8")).not.toContain("gameplay reached");
      expect(existsSync(fallbackCapture)).toBe(false);
      expect(existsSync(`${out}.md`)).toBe(false);
      expect(existsSync(`${out}.log`)).toBe(false);
      expect(readFileSync(homeTripwire, "utf8")).toBe(homeTripwireBytes);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("requires exact CLI compatibility only for Spark direct transport", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-spark-cli-compatibility-"));
    const home = join(dir, "home");
    const selected = join(dir, "selected-codex");
    const capture = join(dir, "selected-capture.txt");
    const out = join(dir, "reports", "attempt");
    try {
      mkdirSync(home);
      writeFileSync(
        selected,
        `#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then
  printf 'version\\n' >> "\${SELECTED_CAPTURE}"
  printf 'codex-cli 0.144.1\\n'
  exit 0
fi
printf 'provider-launch\\n' >> "\${SELECTED_CAPTURE}"
exit 93
`,
        "utf8",
      );
      chmodSync(selected, 0o755);

      const result = spawnSync(process.execPath, ["blind-tester/blind-launch.mjs", "--out", out], {
        cwd: cleanGit.path,
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "test",
          CODEX_HOME: home,
          BLIND_CODEX_BIN: bashPath(selected),
          BLIND_CODEX_TEST_SCRIPT_CLIENT: "1",
          SELECTED_CAPTURE: bashPath(capture),
        },
        timeout: 30_000,
      });
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
      expect(result.status, output).toBe(42);
      expect(output).toContain("spark-direct-mcp-v1 requires exact codex-cli 0.146.0");
      expect(output).toContain("observed cli=0.144.1");
      expect(output).toContain("BLIND_CODEX_BIN");
      expect(readFileSync(capture, "utf8")).toBe("version\n");
      expectNoOutputArtifacts(out);

      const strictResult = spawnSync(
        process.execPath,
        [
          "blind-tester/blind-launch.mjs",
          "--preflight-only",
          "--client-authority-json",
          "--model",
          "gpt-5.6-terra",
          "--out",
          out,
        ],
        {
          cwd: cleanGit.path,
          encoding: "utf8",
          env: {
            ...process.env,
            NODE_ENV: "test",
            CODEX_HOME: home,
            BLIND_CODEX_BIN: bashPath(selected),
            BLIND_CODEX_TEST_SCRIPT_CLIENT: "1",
            SELECTED_CAPTURE: bashPath(capture),
          },
          timeout: 30_000,
        },
      );
      const strictOutput = `${strictResult.stdout ?? ""}\n${strictResult.stderr ?? ""}\n${strictResult.error?.message ?? ""}`;
      expect(strictResult.status, strictOutput).toBe(0);
      expect(JSON.parse(strictResult.stdout ?? "")).toMatchObject({
        cli_version: "0.144.1",
      });
      expect(readFileSync(capture, "utf8")).toBe("version\nversion\n");
      expectNoOutputArtifacts(out);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("treats BLIND_CODEX_BIN as one executable path, never a command plus arguments", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-codex-bin-one-argv-"));
    const bin = join(dir, "bin");
    const home = join(dir, "home");
    const selected = join(dir, "selected-codex");
    const selectedCapture = join(dir, "selected-used");
    const fallbackCapture = join(dir, "fallback-used");
    const bashPath = (path: string): string =>
      path
        .replace(/^([A-Za-z]):\\/u, (_match, drive: string) => `/${drive.toLowerCase()}/`)
        .replaceAll("\\", "/");
    try {
      mkdirSync(bin);
      mkdirSync(home);
      writeFileSync(
        selected,
        `#!/usr/bin/env bash
printf used > "\${SELECTED_CAPTURE}"
printf 'codex-cli 0.144.1\\n'
`,
      );
      chmodSync(selected, 0o755);
      const fallback = join(bin, "codex");
      writeFileSync(
        fallback,
        `#!/usr/bin/env bash
printf used > "\${FALLBACK_CAPTURE}"
printf 'codex-cli 0.144.1\\n'
`,
      );
      chmodSync(fallback, 0o755);

      const result = spawnSync(process.execPath, ["blind-tester/blind-launch.mjs"], {
        cwd: cleanGit.path,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
          CODEX_HOME: home,
          BLIND_CODEX_BIN: `${bashPath(selected)} --version`,
          SELECTED_CAPTURE: bashPath(selectedCapture),
          FALLBACK_CAPTURE: bashPath(fallbackCapture),
        },
        timeout: 30_000,
      });
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
      expect(result.status, output).toBe(42);
      expect(output).toContain("selected executable");
      expect(output).toContain("BLIND_CODEX_BIN");
      expect(existsSync(selectedCapture)).toBe(false);
      expect(existsSync(fallbackCapture)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("bounds a hung or noisy selected CLI version probe before gameplay", () => {
    for (const scenario of ["hung", "noisy"] as const) {
      const dir = mkdtempSync(join(tmpdir(), `af-codex-version-${scenario}-`));
      const bin = join(dir, "bin");
      const home = join(dir, "home");
      const selected = join(dir, "selected-codex");
      const selectedCapture = join(dir, "selected-capture");
      const fallbackCapture = join(dir, "fallback-capture");
      const out = join(dir, "reports", "attempt");
      const loginPath = join(home, CODEX_LOGIN_FILENAME);
      const loginBytes = `{"sentinel":"${scenario}-probe-bound"}\n`;
      const bashPath = (path: string): string =>
        path
          .replace(/^([A-Za-z]):\\/u, (_match, drive: string) => `/${drive.toLowerCase()}/`)
          .replaceAll("\\", "/");
      try {
        mkdirSync(bin);
        mkdirSync(home);
        writeFileSync(loginPath, loginBytes);
        writeFileSync(
          selected,
          `#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then
  printf 'version\\n' >> "\${SELECTED_CAPTURE}"
  if [[ "\${VERSION_SCENARIO}" == "hung" ]]; then
    trap '' TERM
    while :; do sleep 1; done
  fi
  head -c 4096 /dev/zero | tr '\\0' x
  exit 0
fi
printf 'gameplay\\n' >> "\${SELECTED_CAPTURE}"
exit 0
`,
        );
        chmodSync(selected, 0o755);
        const fallback = join(bin, "codex");
        writeFileSync(
          fallback,
          `#!/usr/bin/env bash
printf used > "\${FALLBACK_CAPTURE}"
printf 'codex-cli 0.144.1\\n'
`,
        );
        chmodSync(fallback, 0o755);

        const startedAt = Date.now();
        const result = spawnSync(
          process.execPath,
          ["blind-tester/blind-launch.mjs", "--model", "gpt-5.3-codex-spark", "--out", out],
          {
            cwd: cleanGit.path,
            encoding: "utf8",
            env: {
              ...process.env,
              PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
              CODEX_HOME: home,
              BLIND_CODEX_BIN: bashPath(selected),
              BLIND_CODEX_TEST_SCRIPT_CLIENT: "1",
              SELECTED_CAPTURE: bashPath(selectedCapture),
              FALLBACK_CAPTURE: bashPath(fallbackCapture),
              VERSION_SCENARIO: scenario,
            },
            timeout: 15_000,
          },
        );
        const elapsed = Date.now() - startedAt;
        const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
        expect(result.status, `${scenario}: ${output}`).toBe(42);
        expect(elapsed, scenario).toBeLessThan(12_000);
        expect(output.length, scenario).toBeLessThan(5_000);
        expect(readFileSync(selectedCapture, "utf8"), scenario).toBe("version\n");
        expect(existsSync(fallbackCapture), scenario).toBe(false);
        expect(existsSync(`${out}.log`), scenario).toBe(false);
        expect(output, scenario).not.toContain("Blind playtest");
        expect(readFileSync(loginPath, "utf8"), scenario).toBe(loginBytes);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
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
            cwd: cleanGit.path,
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
            cwd: cleanGit.path,
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
          cwd: cleanGit.path,
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
    expect(runner).toContain('git --git-dir="$GAME_DIR/.git" --work-tree="$GAME_DIR"');
    for (const key of [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_INDEX_FILE",
      "GIT_COMMON_DIR",
      "GIT_OBJECT_DIRECTORY",
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    ]) {
      expect(runner).toContain(`-u ${key}`);
    }
    expect(runner).toContain("game_git ls-files -v -z --");
    expect(runner).toContain("S|[a-z]) found=true");
    expect(runner).toContain("game_git diff --quiet --no-ext-diff --no-textconv");
    expect(runner).toContain("game_git diff --cached --quiet --no-ext-diff --no-textconv");
    expect(runner).not.toContain("git status --porcelain");

    const initialGuard = runner.indexOf(
      'if [[ "$PLAY_MODE" == "pure" && "$TRACKED_WORKTREE_CLEAN" != "true" ]]',
    );
    expect(initialGuard).toBeGreaterThan(0);
    expect(initialGuard).toBeLessThan(runner.indexOf('ACTIVE_CODEX_HOME=""'));
    expect(initialGuard).toBeLessThan(runner.indexOf('SELECTED_CODEX_BIN=""'));

    const gameplaySpawn = runner.indexOf('printf "%s" "$PROMPT" | "$NODE_CMD"');
    const finalClientProbe = runner.lastIndexOf("if ! preflight_codex_client 1", gameplaySpawn);
    const preSpawnProvenance = runner.indexOf(
      "if ! assert_launch_provenance_unchanged",
      finalClientProbe,
    );
    expect(finalClientProbe).toBeGreaterThan(initialGuard);
    expect(preSpawnProvenance).toBeGreaterThan(finalClientProbe);
    expect(preSpawnProvenance).toBeLessThan(gameplaySpawn);
  });

  it("emits canonical private provenance while ignoring untracked files", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-blind-provenance-"));
    const out = join(dir, "capture");
    const untracked = join(
      cleanGit.path,
      `.af-untracked-provenance-${process.pid}-${Date.now()}.tmp`,
    );
    try {
      writeFileSync(untracked, "untracked provenance fixture\n", "utf8");
      const result = spawnSync(
        process.execPath,
        ["blind-tester/blind-launch.mjs", "--mock", "--seed", "-17", "--out", out],
        {
          cwd: cleanGit.path,
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
        cwd: cleanGit.path,
        encoding: "utf8",
      });
      expect(head.status).toBe(0);
      const unstaged = spawnSync(
        "git",
        ["diff", "--quiet", "--ignore-submodules=untracked", "--"],
        { cwd: cleanGit.path },
      );
      const staged = spawnSync(
        "git",
        ["diff", "--cached", "--quiet", "--ignore-submodules=untracked", "--"],
        { cwd: cleanGit.path },
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

  it("rejects staged pure and fleet preflight before client execution while structural QA stays available", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-pure-staged-preflight-"));
    const tripwire = installPurePreflightTripwire(dir);
    const pureOut = join(dir, "pure", "attempt");
    const fleetOut = join(dir, "fleet", "attempt");
    const structuralOut = join(dir, "structural", "attempt");
    const structuralMarker = join(dir, "structural-launch.txt");
    const fixtureName = `.af-pure-clean-preflight-${process.pid}-${Date.now()}`;
    const untracked = join(cleanGit.path, `${fixtureName}.tmp`);
    const ignored = join(cleanGit.path, "ai-runs", `${fixtureName}.tmp`);
    let indexRestored = false;
    try {
      writeFileSync(untracked, "untracked files are outside tracked provenance\n", "utf8");
      mkdirSync(join(cleanGit.path, "ai-runs"), { recursive: true });
      writeFileSync(ignored, "ignored files are outside tracked provenance\n", "utf8");
      expect(
        spawnSync("git", ["check-ignore", "-q", "--", ignored], {
          cwd: cleanGit.path,
        }).status,
      ).toBe(0);

      runGit(cleanGit.path, ["update-index", "--force-remove", "--", "AGENTS.md"]);
      expectRejectedBeforeSelectedBinary(
        launchPureTripwire(cleanGit.path, tripwire, pureOut),
        tripwire,
        pureOut,
      );
      expectRejectedBeforeSelectedBinary(
        launchPureTripwire(cleanGit.path, tripwire, fleetOut, {}, ["--preflight-only"]),
        tripwire,
        fleetOut,
      );

      const structural = spawnSync(
        process.execPath,
        ["blind-tester/blind-launch.mjs", "--mock", "--out", structuralOut],
        {
          cwd: cleanGit.path,
          encoding: "utf8",
          env: {
            ...process.env,
            BLIND_MOCK_AGENT_CMD:
              'printf structural-launch > "$STRUCTURAL_LAUNCH"; cat "$BLIND_MCP_CONFIG"; exit 93',
            STRUCTURAL_LAUNCH: bashPath(structuralMarker),
          },
          timeout: 30_000,
        },
      );
      const structuralOutput = `${structural.stdout ?? ""}\n${structural.stderr ?? ""}\n${structural.error?.message ?? ""}`;
      expect(structural.status, structuralOutput).toBe(93);
      expect(readFileSync(structuralMarker, "utf8")).toBe("structural-launch");
      const structuralConfig = JSON.parse(readFileSync(`${structuralOut}.md`, "utf8")) as {
        mcpServers: { adventureforge: { args: string[] } };
      };
      const structuralArgs = structuralConfig.mcpServers.adventureforge.args;
      expect(structuralArgs[structuralArgs.indexOf("--tracked-worktree-clean") + 1]).toBe("false");

      const smoke = spawnSync(process.execPath, ["blind-tester/blind-launch.mjs", "--smoke"], {
        cwd: cleanGit.path,
        encoding: "utf8",
        env: { ...process.env },
        timeout: 30_000,
      });
      const smokeOutput = `${smoke.stdout ?? ""}\n${smoke.stderr ?? ""}\n${smoke.error?.message ?? ""}`;
      expect(smoke.status, smokeOutput).toBe(0);

      runGit(cleanGit.path, ["read-tree", "HEAD"]);
      indexRestored = true;
      const allowed = launchPureTripwire(cleanGit.path, tripwire, join(dir, "allowed", "attempt"));
      const allowedOutput = `${allowed.stdout ?? ""}\n${allowed.stderr ?? ""}\n${allowed.error?.message ?? ""}`;
      expect(allowed.status, allowedOutput).toBe(93);
      expect(existsSync(tripwire.versionMarker)).toBe(true);
      expect(existsSync(tripwire.providerMarker)).toBe(true);
    } finally {
      if (!indexRestored) runGit(cleanGit.path, ["read-tree", "HEAD"]);
      rmSync(untracked, { force: true });
      rmSync(ignored, { force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  }, 90_000);

  it("rejects ordinary unstaged tracked bytes before selected-client execution", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-pure-unstaged-preflight-"));
    const tripwire = installPurePreflightTripwire(dir);
    const out = join(dir, "reports", "attempt");
    const target = join(cleanGit.path, "AGENTS.md");
    const original = readFileSync(target, "utf8");
    try {
      writeFileSync(target, `${original}\nunstaged provenance fixture\n`, "utf8");
      expectRejectedBeforeSelectedBinary(
        launchPureTripwire(cleanGit.path, tripwire, out),
        tripwire,
        out,
      );
    } finally {
      writeFileSync(target, original, "utf8");
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects modified assume-unchanged tracked bytes before selected-client execution", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-pure-assume-unchanged-"));
    const tripwire = installPurePreflightTripwire(dir);
    const out = join(dir, "reports", "attempt");
    const target = join(cleanGit.path, "AGENTS.md");
    const original = readFileSync(target, "utf8");
    try {
      runGit(cleanGit.path, ["update-index", "--assume-unchanged", "--", "AGENTS.md"]);
      writeFileSync(target, `${original}\nassume-unchanged provenance fixture\n`, "utf8");
      expectRejectedBeforeSelectedBinary(
        launchPureTripwire(cleanGit.path, tripwire, out),
        tripwire,
        out,
      );
    } finally {
      writeFileSync(target, original, "utf8");
      runGit(cleanGit.path, ["update-index", "--no-assume-unchanged", "--", "AGENTS.md"]);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects modified skip-worktree tracked bytes before selected-client execution", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-pure-skip-worktree-"));
    const tripwire = installPurePreflightTripwire(dir);
    const out = join(dir, "reports", "attempt");
    const target = join(cleanGit.path, "AGENTS.md");
    const original = readFileSync(target, "utf8");
    try {
      runGit(cleanGit.path, ["update-index", "--skip-worktree", "--", "AGENTS.md"]);
      writeFileSync(target, `${original}\nskip-worktree provenance fixture\n`, "utf8");
      expectRejectedBeforeSelectedBinary(
        launchPureTripwire(cleanGit.path, tripwire, out),
        tripwire,
        out,
      );
    } finally {
      writeFileSync(target, original, "utf8");
      runGit(cleanGit.path, ["update-index", "--no-skip-worktree", "--", "AGENTS.md"]);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("ignores hostile Git repository redirection and checks the script checkout", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-pure-hostile-git-env-"));
    const tripwire = installPurePreflightTripwire(dir);
    const out = join(dir, "reports", "attempt");
    const hostile = join(dir, "hostile-clean-repo");
    const target = join(cleanGit.path, "AGENTS.md");
    const original = readFileSync(target, "utf8");
    try {
      mkdirSync(hostile);
      runGit(hostile, ["init"]);
      writeFileSync(join(hostile, "sentinel.txt"), "clean hostile repository\n", "utf8");
      runGit(hostile, ["add", "sentinel.txt"]);
      runGit(hostile, [
        "-c",
        "user.name=AdventureForge test",
        "-c",
        "user.email=tests@example.invalid",
        "commit",
        "--no-gpg-sign",
        "-m",
        "clean hostile repository",
      ]);
      writeFileSync(target, `${original}\nhostile Git environment fixture\n`, "utf8");
      expectRejectedBeforeSelectedBinary(
        launchPureTripwire(cleanGit.path, tripwire, out, {
          GIT_DIR: bashPath(join(hostile, ".git")),
          GIT_WORK_TREE: bashPath(hostile),
          GIT_INDEX_FILE: bashPath(join(hostile, ".git", "index")),
          GIT_COMMON_DIR: bashPath(join(hostile, ".git")),
          GIT_OBJECT_DIRECTORY: bashPath(join(hostile, ".git", "objects")),
          GIT_ALTERNATE_OBJECT_DIRECTORIES: bashPath(join(hostile, ".git", "objects")),
        }),
        tripwire,
        out,
      );
    } finally {
      writeFileSync(target, original, "utf8");
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("rechecks provenance after setup and before the gameplay process", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-pure-setup-drift-"));
    const tripwire = installPurePreflightTripwire(dir);
    const out = join(dir, "reports", "attempt");
    const target = join(cleanGit.path, "AGENTS.md");
    const original = readFileSync(target, "utf8");
    const probeCount = join(dir, "probe-count.txt");
    try {
      const result = launchPureTripwire(cleanGit.path, tripwire, out, {
        FAKE_PROBE_COUNT: bashPath(probeCount),
        FAKE_DRIFT_TARGET: bashPath(target),
        FAKE_DRIFT_ON_PROBE: "2",
      });
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
      expect(result.status, output).toBe(4);
      expect(output).toContain("Blind-run provenance changed after launch");
      expect(readFileSync(probeCount, "utf8")).toBe("2");
      expect(readFileSync(tripwire.versionMarker, "utf8")).toBe("version\nversion\n");
      expect(existsSync(tripwire.providerMarker)).toBe(false);
      expectNoOutputArtifacts(out);
    } finally {
      writeFileSync(target, original, "utf8");
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects non-integer and unsafe seeds before constructing MCP argv", () => {
    for (const seed of ["7&whoami", "1.5", "9007199254740992"]) {
      const result = spawnSync(
        process.execPath,
        ["blind-tester/blind-launch.mjs", "--mock", "--seed", seed],
        {
          cwd: cleanGit.path,
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
    const sparkPrompt = readFileSync(
      join(process.cwd(), "blind-tester", "prompt-overworld-spark.md"),
      "utf8",
    );
    const directTransport = readFileSync(
      join(process.cwd(), "blind-tester", "prompt-transports", "spark-direct-mcp-v1.md"),
      "utf8",
    );
    const directPrompt = fillPrompt(sparkPrompt, {
      startInstruction: "start",
      seed: 1,
      persona: "",
      transport: directTransport,
    });
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
    expect(runner).toContain('PROMPT_FILE="$SCRIPT_DIR/prompt-overworld-spark.md"');
    expect(runner).toContain("mcp__adventureforge__start_overworld");
    // The pure prompt carries only transport syntax. Gameplay objectives,
    // routes, coverage targets, and stopping are owned by the game itself.
    expect(owPrompt).toContain("mcp__adventureforge__start_overworld");
    expect(owPrompt).toContain("first **game action**");
    expect(owPrompt).not.toContain("Begin with one pre-game tool invocation");
    expect(directPrompt).toContain("`mcp__adventureforge__start_overworld({})` exactly once");
    expect(directPrompt).toContain("call only preloaded");
    expect(directPrompt).toContain("gameplay functions authorized by the latest game");
    expect(directPrompt).toContain("Never use any other tool");
    expect(directPrompt).not.toContain("functions.exec");
    expect(directPrompt).not.toContain("tool_search");
    expect(directPrompt).not.toContain('tool_search({"query"');
    expect(owPrompt).toContain("one-time tutorial");
    expect(owPrompt).not.toMatch(/30.?45|tool calls|take at least one road/i);
    expect(owPrompt).not.toMatch(
      /(?:stop|end|exit|finish|quit).{0,80}(?:after|at|around|within|once).{0,50}(?:\d+|ten|twenty|thirty|forty|fifty).{0,30}(?:mcp|tool)?\s*(?:calls?|invocations?|requests?|turns?)/is,
    );
    expect(owPrompt).not.toMatch(/(?:call|turn|request|invocation)\s*(?:budget|limit|quota)/i);
    expect(owPrompt).not.toContain("resolve_overworld_session_road_encounter");
    expect(owPrompt).toContain("mcp__adventureforge__start_overworld_session_quest");
    expect(owPrompt).toContain("context.quest_starts");
    expect(owPrompt).not.toContain("mcp__adventureforge__start_world_quest");
    expect(owPrompt).toContain("direct quest drop-in bypasses the overworld");
    expect(owPrompt).toContain("not part of this playthrough");
    expect(owPrompt).toContain("game presents its actual journey choice");
    expect(owPrompt).toContain("After the game confirms the end");
    expect(owPrompt).toContain("Before you send your report, check every item:");
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
    expect(owPrompt.indexOf("Before you send your report")).toBeGreaterThan(
      owPrompt.indexOf("After the game confirms the end"),
    );
    expect(owPrompt).toContain("json exit-interview");
    expect(owPrompt.match(/^```json exit-interview\r?$/gm)).toHaveLength(1);
    expect(owPrompt.indexOf("\n```json exit-interview")).toBeGreaterThan(
      owPrompt.indexOf("Before you send your report"),
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
      cwd: cleanGit.path,
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
    const strictStream = readFileSync(
      join(process.cwd(), "blind-tester", "codex-strict-stream.mjs"),
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
    expect(codexLaunch).toContain('"$NODE_CMD" "$CODEX_STRICT_STREAM_SCRIPT"');
    expect(codexLaunch).toContain('--binary "$SELECTED_CODEX_BIN"');
    expect(codexLaunch).toContain("\n    exec \\");
    expect(codexLaunch).toContain("--sandbox read-only");
    expect(codexLaunch).not.toContain("--ephemeral");
    expect(codexLaunch).toContain('--cwd "$CODEX_PLAYER_CWD_ARG"');
    expect(strictStream).toContain("detached: true");
    expect(strictStream).toContain("CODEX_HOME: codexHome");
    expect(strictStream).toContain('spawnSync("taskkill.exe"');
    expect(codexLaunch).toContain('CODEX_ROLLOUT="$OUT.codex-rollout.jsonl"');
    expect(codexLaunch).toContain('--home "$ACTIVE_CODEX_HOME_ARG"');
    expect(codexLaunch).toContain('--events "$CODEX_EVENTS_ARG"');
    expect(codexLaunch).toContain('--rollout "$CODEX_ROLLOUT_ARG"');
    expect(codexLaunch).toContain('CODEX_CAPTURE="$OUT.codex-capture.json"');
    expect(codexLaunch).toContain('--receipt "$CODEX_CAPTURE_ARG"');
    expect(codexLaunch).toContain('--expected-cwd "$CODEX_PLAYER_CWD_ARG"');
    expect(codexLaunch).toContain('--transport-contract "$CODEX_TRANSPORT_CONTRACT"');
    expect(codexLaunch).toContain('--cli-version "$CODEX_CLI_VERSION"');
    expect(runner).toContain("codex-rollout.mjs");
    expect(codexLaunch).toContain("--ignore-user-config");
    expect(codexLaunch).toContain("--ignore-rules");
    expect(codexLaunch).toContain("--strict-config");
    expect(codexLaunch).toContain("-c 'project_doc_max_bytes=0'");
    expect(codexLaunch).toContain("--enable code_mode_only");
    expect(codexLaunch).toContain("--disable code_mode_only");
    expect(codexLaunch).toContain("--disable tool_suggest");
    expect(codexLaunch).not.toContain("--enable tool_suggest");
    expect(runner).toContain('CODEX_TRANSPORT_CONTRACT="spark-direct-mcp-v1"');
    expect(runner).toContain('CODEX_TRANSPORT_CONTRACT="strict-code-mode-v2"');
    expect(runner).toContain('PROMPT_FILE="$SCRIPT_DIR/prompt-overworld-spark.md"');
    expect(runner).toContain("prompt-transports/spark-direct-mcp-v1.md");
    expect(runner).toContain("prompt-transports/strict-code-mode-v2.md");
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

  it("pins only Spark to the compact prompt and repo-owned game-only model catalog", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");
    const catalogPath = join(process.cwd(), "blind-tester", "codex-model-catalog-spark-v1.json");
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as SparkModelCatalog;

    const profileStart = runner.indexOf("  CODEX_PLAYER_PROFILE_ARGS=()");
    const profileEnd = runner.indexOf("\n  fi", profileStart);
    expect(profileStart).toBeGreaterThan(0);
    expect(profileEnd).toBeGreaterThan(profileStart);
    const sparkProfile = runner.slice(profileStart, profileEnd);

    expect(runner).toContain(
      'if [[ "$PLAY_MODE" == "pure" && "$MODEL" == "gpt-5.3-codex-spark" ]]',
    );
    expect(sparkProfile).toContain('if [[ "$CODEX_TRANSPORT_CONTRACT" == "spark-direct-mcp-v1" ]]');
    expect(runner).toContain('PROMPT_FILE="$SCRIPT_DIR/prompt-overworld-spark.md"');
    expect(sparkProfile).toContain(
      '--config "model_catalog_json=\\"$GAME_DIR_MCP/blind-tester/codex-model-catalog-spark-v1.json\\""',
    );
    expect(sparkProfile).toContain(`--config 'instructions="${SPARK_PLAYER_INSTRUCTIONS}"'`);
    for (const config of [
      "tools.update_plan.enabled=false",
      "tools.experimental_request_user_input.enabled=false",
      "skills.include_instructions=false",
      "include_environment_context=false",
      "include_apps_instructions=false",
      "include_permissions_instructions=false",
      "include_collaboration_mode_instructions=false",
    ]) {
      expect(sparkProfile).toContain(`--config '${config}'`);
      expect(runner.match(new RegExp(config.replaceAll(".", "\\."), "gu"))).toHaveLength(1);
    }
    expect(runner).toContain('"${CODEX_PLAYER_PROFILE_ARGS[@]}"');
    expect(runner.match(/CODEX_PLAYER_PROFILE_ARGS=/gu)).toHaveLength(2);

    expect(catalog.models).toHaveLength(1);
    expect(catalog.models[0]).toMatchObject({
      slug: "gpt-5.3-codex-spark",
      shell_type: "disabled",
      base_instructions: SPARK_PLAYER_INSTRUCTIONS,
      include_skills_usage_instructions: false,
      apply_patch_tool_type: null,
      truncation_policy: { mode: "bytes", limit: 16_384 },
      supports_parallel_tool_calls: false,
      context_window: 272_000,
      auto_compact_token_limit: null,
      experimental_supported_tools: [],
      supports_search_tool: false,
      tool_mode: "direct",
    });
  });

  it("passes the Spark player profile to Spark and not to Sol, Terra, or Luna", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-spark-profile-scope-"));
    const home = join(dir, "home");
    const selected = join(dir, "selected-codex");
    try {
      mkdirSync(home);
      writeFileSync(
        selected,
        `#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then
  printf 'codex-cli 0.146.0\\n'
  exit 0
fi
printf '%s\\n' "$@" > "\${FAKE_CODEX_CAPTURE}"
exit 93
`,
        "utf8",
      );
      chmodSync(selected, 0o755);

      for (const [model, isSpark] of [
        ["gpt-5.3-codex-spark", true],
        ["gpt-5.6-sol", false],
        ["gpt-5.6-terra", false],
        ["gpt-5.6-luna", false],
      ] as const) {
        const capture = join(dir, `${model}.argv.txt`);
        const out = join(dir, "reports", model);
        const result = spawnSync(
          process.execPath,
          ["blind-tester/blind-launch.mjs", "--model", model, "--out", out],
          {
            cwd: cleanGit.path,
            encoding: "utf8",
            env: {
              ...process.env,
              NODE_ENV: "test",
              CODEX_HOME: home,
              BLIND_CODEX_BIN: bashPath(selected),
              BLIND_CODEX_TEST_SCRIPT_CLIENT: "1",
              FAKE_CODEX_CAPTURE: bashPath(capture),
            },
            timeout: 30_000,
          },
        );
        const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
        expect(result.status, `${model}: ${output}`).toBe(93);
        const args = readFileSync(capture, "utf8");
        expect(args).toContain("code_mode_only");
        for (const sparkOnlyArg of [
          "codex-model-catalog-spark-v1.json",
          SPARK_PLAYER_INSTRUCTIONS,
          "tools.update_plan.enabled=false",
          "skills.include_instructions=false",
          "include_environment_context=false",
        ]) {
          if (isSpark) expect(args).toContain(sparkOnlyArg);
          else expect(args).not.toContain(sparkOnlyArg);
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("allows the local MCP server to cold-start while parallel verification is busy", () => {
    const runner = readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");
    const projectConfig = readFileSync(join(process.cwd(), ".codex", "config.toml"), "utf8");

    expect(runner.match(/mcp_servers\.adventureforge\.startup_timeout_sec=60/g)).toHaveLength(2);
    expect(runner).not.toContain("mcp_servers.adventureforge.startup_timeout_sec=20");
    expect(projectConfig).toContain("startup_timeout_sec = 60");
    expect(projectConfig).not.toContain("startup_timeout_sec = 20");
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
    expect(rolloutCapture).not.toContain("models_cache.json");
    expect(rolloutCapture).toContain("publicCodexThreadId(eventsPath)");
    expect(rolloutCapture).toContain("walkMatchingRollouts(");
    expect(rolloutCapture).toContain("recorded.threadId !== threadId");
  });

  it("rejects unknown, explicit Claude, and ambient Claude providers before launch", () => {
    const result = spawnSync(
      process.execPath,
      ["blind-tester/blind-launch.mjs", "--provider", "not-a-provider"],
      {
        cwd: cleanGit.path,
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
        cwd: cleanGit.path,
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

  it("parses direct equals-form values and never reclassifies unknown options as quests", () => {
    const baseEnv: NodeJS.ProcessEnv = {
      ...process.env,
      BLIND_AGENT_CMD: "exit 93",
      BLIND_OVERWORLD: "0",
      BLIND_QUEST_ID: "",
      BLIND_PROVIDER: "codex",
    };
    for (const key of [
      "npm_config_quest",
      "npm_config_quest_id",
      "npm_config_seed",
      "npm_config_provider",
      "npm_config_model",
      "npm_config_out",
      "npm_config_delay_ms",
      "npm_config_persona",
    ]) {
      delete baseEnv[key];
    }

    const inline = spawnSync(
      process.execPath,
      [
        "blind-tester/blind-launch.mjs",
        "--seed=72525",
        "--provider=not-a-provider",
        "--model=gpt-5.6-terra",
        "--persona=default",
        "--delay-ms=0",
      ],
      {
        cwd: cleanGit.path,
        encoding: "utf8",
        env: baseEnv,
        timeout: 30_000,
      },
    );
    const inlineOutput = `${inline.stdout ?? ""}\n${inline.stderr ?? ""}\n${inline.error?.message ?? ""}`;
    expect(inline.status, inlineOutput).toBe(2);
    expect(inlineOutput).toContain("--provider must be exactly codex");
    expect(inlineOutput).not.toContain("Live blind LLM runs must start");
    expect(inlineOutput).not.toContain("Ambiguous:");

    const unknown = spawnSync(
      process.execPath,
      ["blind-tester/blind-launch.mjs", "--seed=72525", "--bogus=value"],
      {
        cwd: cleanGit.path,
        encoding: "utf8",
        env: baseEnv,
        timeout: 30_000,
      },
    );
    const unknownOutput = `${unknown.stdout ?? ""}\n${unknown.stderr ?? ""}\n${unknown.error?.message ?? ""}`;
    expect(unknown.status, unknownOutput).toBe(2);
    expect(unknownOutput).toContain(
      'Unknown blind-run option "--bogus=value"; use --help for supported syntax.',
    );
    expect(unknownOutput).not.toContain("Live blind LLM runs must start");
    expect(unknownOutput).not.toContain("Ambiguous:");
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
          cwd: cleanGit.path,
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
        cwd: cleanGit.path,
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
          cwd: cleanGit.path,
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
    const codexHome = join(dir, "codex-home");
    try {
      mkdirSync(codexHome);
      writeFileSync(`${out}.md`, "prior accepted report\n", "utf8");
      writeFileSync(`${out}.run.json`, '{"prior":"sidecar"}\n', "utf8");
      const env: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: codexHome };
      delete env.BLIND_AGENT_CMD;
      delete env.BLIND_MOCK_AGENT_CMD;
      const result = spawnSync(process.execPath, ["blind-tester/blind-launch.mjs", "--out", out], {
        cwd: cleanGit.path,
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
    const testScriptPublicationGuard = runner.indexOf(
      "Codex test-script client reached a synthetic success",
    );

    expect(testScriptPublicationGuard).toBeGreaterThan(0);
    expect(testScriptPublicationGuard).toBeLessThan(privateVerification);
    expect(runner.slice(testScriptPublicationGuard, privateVerification)).toContain("STATUS=4");
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
