import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error — runner helper is intentionally plain ESM.
import * as strictStream from "../../blind-tester/codex-strict-stream.mjs";

const {
  appendCompleteJsonlBytes,
  createCompleteJsonlDecoder,
  providerExitCodeFor,
  terminateOwnedProviderTree,
} = strictStream;

function bashPath(path: string): string {
  return path
    .replace(/^([A-Za-z]):\\/u, (_match, drive: string) => `/${drive.toLowerCase()}/`)
    .replaceAll("\\", "/");
}

function installFakeCodex(root: string, body: string): { home: string; selected: string } {
  const home = join(root, "home");
  const selected = join(root, "fake-codex");
  mkdirSync(join(home, "sessions"), { recursive: true });
  writeFileSync(
    selected,
    `#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then
  printf 'codex-cli 0.144.1\\n'
  exit 0
fi
${body}`,
  );
  chmodSync(selected, 0o755);
  return { home, selected };
}

function launchFakeCodex(
  fixture: { home: string; selected: string },
  out: string,
  seed: string,
  extraEnv: NodeJS.ProcessEnv = {},
) {
  return spawnSync(
    process.execPath,
    ["blind-tester/blind-launch.mjs", "--out", out, "--seed", seed],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "test",
        CODEX_HOME: fixture.home,
        BLIND_CODEX_BIN: bashPath(fixture.selected),
        BLIND_CODEX_TEST_SCRIPT_CLIENT: "1",
        ...extraEnv,
      },
      timeout: 15_000,
    },
  );
}

function combinedOutput(result: ReturnType<typeof spawnSync>): string {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
}

function expectNoPublishedEvidence(out: string): void {
  expect(existsSync(`${out}.md`)).toBe(false);
  expect(existsSync(`${out}.run.json`)).toBe(false);
  expect(existsSync(`${out}.codex-rollout.jsonl`)).toBe(false);
  expect(existsSync(`${out}.codex-capture.json`)).toBe(false);
  expect(existsSync(`${out}.evidence.jsonl`)).toBe(false);
}

describe("Codex strict streaming fail-fast", () => {
  it("parses only complete JSONL lines and leaves an in-flight row undecided", () => {
    const decoder = createCompleteJsonlDecoder("test stream");
    expect(
      appendCompleteJsonlBytes(
        decoder,
        Buffer.from('{"type":"thread.started","thread_id":"partial'),
      ),
    ).toEqual([]);
    expect(decoder.rows).toEqual([]);
    expect(
      appendCompleteJsonlBytes(
        decoder,
        Buffer.from('"}\n{"type":"turn.started"}\n{"type":"item.started"'),
      ),
    ).toEqual([{ type: "thread.started", thread_id: "partial" }, { type: "turn.started" }]);
    expect(decoder.rows).toHaveLength(2);
  });

  it("keeps provider-owned exit 43 distinct from a proven stream rejection", () => {
    const root = mkdtempSync(join(tmpdir(), "af-strict-stream-exit-"));
    const out = join(root, "reports", "attempt");
    const fixture = installFakeCodex(root, "exit 43\n");
    try {
      expect(providerExitCodeFor(43, null)).toBe(4);
      const result = launchFakeCodex(fixture, out, "73651");
      const output = combinedOutput(result);
      expect(result.error, output).toBeUndefined();
      expect(result.status, output).toBe(4);
      expect(output).not.toMatch(/strict stream rejected/i);
      expectNoPublishedEvidence(out);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("does not treat a nonzero Windows anchor exit as a cleanup proof", async () => {
    const anchor = Object.assign(new EventEmitter(), {
      pid: 424_242,
      exitCode: null as number | null,
      signalCode: null as string | null,
      connected: true,
      send() {
        void Promise.resolve().then(() => {
          anchor.exitCode = 1;
          anchor.emit("exit", 1, null);
        });
      },
    });
    await expect(terminateOwnedProviderTree(anchor, "win32")).rejects.toThrow(
      /exited without its clean termination proof/i,
    );
  });

  it("releases termination-grace timers after immediate clean Windows exits", async () => {
    const activeTimeoutCount = () =>
      process.getActiveResourcesInfo().filter((resource) => resource === "Timeout").length;
    const baseline = activeTimeoutCount();

    for (let index = 0; index < 8; index += 1) {
      const anchor = Object.assign(new EventEmitter(), {
        pid: 424_300 + index,
        exitCode: null as number | null,
        signalCode: null as string | null,
        connected: true,
        send() {
          queueMicrotask(() => {
            anchor.exitCode = 0;
            anchor.emit("exit", 0, null);
          });
        },
      });
      await expect(terminateOwnedProviderTree(anchor, "win32")).resolves.toBeUndefined();
    }

    expect(activeTimeoutCount()).toBe(baseline);
  });

  it("rejects a malformed private gameplay wrapper before the provider finishes", () => {
    const root = mkdtempSync(join(tmpdir(), "af-strict-stream-private-"));
    const out = join(root, "reports", "attempt");
    const threadId = "55555555-5555-4555-8555-555555555555";
    const fixture = installFakeCodex(
      root,
      `home="\${CODEX_HOME}"
cwd="\${PWD}"
if command -v cygpath >/dev/null 2>&1; then
  home="$(cygpath -u "\${home}")"
  cwd="$(cygpath -m "\${cwd}")"
fi
rollout_dir="\${home}/sessions/2026/07/26"
mkdir -p "\${rollout_dir}"
rollout="\${rollout_dir}/rollout-2026-07-26T12-01-00-${threadId}.jsonl"
printf '{"type":"session_meta","payload":{"id":"%s","cwd":"%s"}}\\n' "${threadId}" "\${cwd}" > "\${rollout}"
printf '{"type":"turn_context","payload":{"cwd":"%s","model":"gpt-5.3-codex-spark"}}\\n' "\${cwd}" >> "\${rollout}"
printf '%s\\n' '{"type":"response_item","payload":{"type":"custom_tool_call","id":"wrapper-item-1","status":"completed","call_id":"call-wrapper-1","name":"exec","input":"// @exec: {\\"yield_time_ms\\":120000}\\ntext(await tools.mcp__adventureforge__start_overworld({}));\\n"}}' >> "\${rollout}"
printf '%s\\n' '{"type":"thread.started","thread_id":"${threadId}"}'
while :; do sleep 1; done
`,
    );
    try {
      const result = launchFakeCodex(fixture, out, "73652");
      const output = combinedOutput(result);
      expect(result.error, output).toBeUndefined();
      expect(result.status, output).toBe(43);
      expect(output).toMatch(/strict stream rejected/i);
      expect(output).toMatch(/forbidden wrapper program/i);
      expectNoPublishedEvidence(out);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("kills an owned descendant when the provider exits immediately after a violation", async () => {
    const root = mkdtempSync(join(tmpdir(), "af-strict-stream-exit-race-"));
    const survived = join(root, "fake-mcp-survived");
    const out = join(root, "reports", "attempt");
    const threadId = "66666666-6666-4666-8666-666666666666";
    const fixture = installFakeCodex(
      root,
      `(
  sleep 2
  printf 'fake MCP escaped its provider tree\\n' > "\${FAKE_MCP_SURVIVED}"
) &
printf '%s\\n' '{"type":"thread.started","thread_id":"${threadId}"}'
printf '%s\\n' '{"type":"item.started","item":{"id":"item_2","type":"mcp_tool_call","server":"codex","tool":"read_thread","arguments":{},"result":null,"error":null,"status":"in_progress"}}'
exit 0
`,
    );
    try {
      const result = launchFakeCodex(fixture, out, "73653", {
        FAKE_MCP_SURVIVED: bashPath(survived),
      });
      const output = combinedOutput(result);
      expect(result.error, output).toBeUndefined();
      expect([4, 43], output).toContain(result.status);
      expectNoPublishedEvidence(out);
      await delay(2_500);
      expect(existsSync(survived)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("stops the owned provider tree on a forbidden public server without publishing evidence", async () => {
    const root = mkdtempSync(join(tmpdir(), "af-strict-stream-tree-"));
    const home = join(root, "home");
    const selected = join(root, "fake-codex");
    const survived = join(root, "fake-mcp-survived");
    const out = join(root, "reports", "attempt");
    const threadId = "44444444-4444-4444-8444-444444444444";
    mkdirSync(join(home, "sessions"), { recursive: true });
    writeFileSync(
      selected,
      `#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then
  printf 'codex-cli 0.144.1\\n'
  exit 0
fi
home="\${CODEX_HOME}"
cwd="\${PWD}"
if command -v cygpath >/dev/null 2>&1; then
  home="$(cygpath -u "\${home}")"
  cwd="$(cygpath -m "\${cwd}")"
fi
rollout_dir="\${home}/sessions/2026/07/26"
mkdir -p "\${rollout_dir}"
rollout="\${rollout_dir}/rollout-2026-07-26T12-00-00-${threadId}.jsonl"
printf '{"type":"session_meta","payload":{"id":"%s","cwd":"%s"}}\\n' "${threadId}" "\${cwd}" > "\${rollout}"
printf '{"type":"turn_context","payload":{"cwd":"%s","model":"gpt-5.3-codex-spark"}}\\n' "\${cwd}" >> "\${rollout}"
(
  sleep 2
  printf 'fake MCP escaped its provider tree\\n' > "\${FAKE_MCP_SURVIVED}"
) &
printf '%s\\n' '{"type":"thread.started","thread_id":"${threadId}"}'
printf '%s\\n' '{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Under-development features enabled: code_mode_only. Under-development features are incomplete and may behave unpredictably. To suppress this warning, set \u0060suppress_unstable_features_warning = true\u0060 in /tmp/config.toml."}}'
printf '%s\\n' '{"type":"item.completed","item":{"id":"item_1","type":"error","message":"Code Mode is enabled in configuration, but model \u0060gpt-5.3-codex-spark\u0060 does not advertise Code Mode support. This may degrade model performance. Disable \u0060features.code_mode\u0060 and \u0060features.code_mode_only\u0060, or select a model whose metadata enables Code Mode."}}'
printf '%s\\n' '{"type":"turn.started"}'
printf '%s\\n' '{"type":"item.started","item":{"id":"item_2","type":"mcp_tool_call","server":"codex","tool":"read_thread","arguments":{},"result":null,"error":null,"status":"in_progress"}}'
while :; do sleep 1; done
`,
    );
    chmodSync(selected, 0o755);

    try {
      const result = spawnSync(
        process.execPath,
        ["blind-tester/blind-launch.mjs", "--out", out, "--seed", "73650"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            NODE_ENV: "test",
            CODEX_HOME: home,
            BLIND_CODEX_BIN: bashPath(selected),
            BLIND_CODEX_TEST_SCRIPT_CLIENT: "1",
            FAKE_MCP_SURVIVED: bashPath(survived),
          },
          timeout: 15_000,
        },
      );
      const output = combinedOutput(result);
      expect(result.error, output).toBeUndefined();
      expect(result.status, output).toBe(43);
      expect(output).toMatch(/strict stream rejected/i);
      expect(output).toMatch(/forbidden MCP server codex/i);
      expectNoPublishedEvidence(out);

      await delay(2_500);
      expect(existsSync(survived)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});
