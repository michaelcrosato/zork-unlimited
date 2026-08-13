import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  type CleanTrackedGitCheckout,
  useCleanTrackedGitCheckout,
} from "./support/clean_git_checkout.js";

// @ts-expect-error — runner helper is intentionally plain ESM.
import * as strictStream from "../../blind-tester/codex-strict-stream.mjs";

const CAPTURED_PRIVATE_RESOURCE_PROBE = JSON.stringify({
  timestamp: "2026-08-09T18:48:15.455Z",
  type: "response_item",
  payload: {
    type: "function_call",
    id: "fc_03e7220d36f21d2d016a78cb6fac08819ab627628a0d144be7",
    name: "list_mcp_resources",
    arguments: "{}",
    call_id: "call_blDR18VQkrYjpIA0t8a1HPFC",
    internal_chat_message_metadata_passthrough: {
      turn_id: "019fe7da-a24d-7ac1-aa56-7c67d11cfba0",
    },
  },
});
const CAPTURED_PRIVATE_RESOURCE_PROBE_SHA256 =
  "027bc0038654b98e508b619c588dad78b8b1ee1a35e4b1f9d904562c9dfa065b";

const {
  appendCompleteJsonlBytes,
  createCompleteJsonlDecoder,
  latestPrivateUsageLowerBound,
  providerExitCodeFor,
  terminateOwnedProviderTree,
  writeStreamRejectionDiagnostic,
  writeStrictRejectionDiagnostic,
} = strictStream;

function bashPath(path: string): string {
  return path
    .replace(/^([A-Za-z]):\\/u, (_match, drive: string) => `/${drive.toLowerCase()}/`)
    .replaceAll("\\", "/");
}

function installFakeCodex(
  root: string,
  body: string,
  cliVersion = "0.146.0",
): { home: string; selected: string } {
  const home = join(root, "home");
  const selected = join(root, "fake-codex");
  mkdirSync(join(home, "sessions"), { recursive: true });
  writeFileSync(
    selected,
    `#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then
  printf 'codex-cli ${cliVersion}\\n'
  exit 0
fi
${body}`,
  );
  chmodSync(selected, 0o755);
  return { home, selected };
}

function launchFakeCodex(
  cleanGit: CleanTrackedGitCheckout,
  fixture: { home: string; selected: string },
  out: string,
  seed: string,
  extraEnv: NodeJS.ProcessEnv = {},
  model = "gpt-5.6-terra",
) {
  return spawnSync(
    process.execPath,
    ["blind-tester/blind-launch.mjs", "--out", out, "--seed", seed, `--model=${model}`],
    {
      cwd: cleanGit.path,
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
  const cleanGit = useCleanTrackedGitCheckout();

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
      const result = launchFakeCodex(cleanGit, fixture, out, "73651");
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

  it("writes only a bounded noncanonical diagnostic for a bound private wrapper rejection", async () => {
    const root = mkdtempSync(join(tmpdir(), "af-strict-stream-private-"));
    const out = join(root, "reports", "attempt");
    const survived = join(root, "provider-descendant-survived");
    const threadId = "55555555-5555-4555-8555-555555555555";
    const turnId = "65555555-5555-4555-8555-555555555555";
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
printf '{"type":"turn_context","payload":{"turn_id":"${turnId}","cwd":"%s","model":"gpt-5.6-terra"}}\\n' "\${cwd}" >> "\${rollout}"
printf '%s\\n' '{"type":"response_item","payload":{"type":"custom_tool_call","id":"wrapper-item-1","status":"completed","call_id":"call-wrapper-1","name":"exec","input":"// @exec: {\\"yield_time_ms\\":120000}\\ntext(await tools.mcp__adventureforge__start_overworld({}));\\n"}}' >> "\${rollout}"
(
  sleep 2
  printf 'escaped\\n' > "\${FAKE_MCP_SURVIVED}"
) &
printf '%s\\n' '{"type":"thread.started","thread_id":"${threadId}"}'
while :; do sleep 1; done
`,
    );
    try {
      const result = launchFakeCodex(cleanGit, fixture, out, "73652", {
        FAKE_MCP_SURVIVED: bashPath(survived),
      });
      const output = combinedOutput(result);
      expect(result.error, output).toBeUndefined();
      expect(result.status, output).toBe(43);
      expect(output).toMatch(/strict stream rejected/i);
      expect(output).toMatch(/forbidden private response item/i);
      expectNoPublishedEvidence(out);
      const diagnosticPath = `${out}.strict-rejection.json`;
      const rawWrapper = "text(await tools.mcp__adventureforge__start_overworld({}));";
      const diagnostic = readFileSync(diagnosticPath, "utf8");
      expect(Buffer.byteLength(diagnostic, "utf8")).toBeLessThanOrEqual(4 * 1024);
      expect(diagnostic).not.toContain(rawWrapper);
      expect(diagnostic).not.toContain("wrapper-item-1");
      expect(diagnostic).not.toContain("call-wrapper-1");
      expect(diagnostic).not.toMatch(/reasoning|token|cwd|path|result/i);
      expect(JSON.parse(diagnostic)).toMatchObject({
        schema_version: 2,
        acceptance_eligible: false,
        canonical: false,
        ignored: true,
        kind: "strict_stream_rejection_diagnostic",
        surface: "private_rollout",
        transport_contract: "game-direct-mcp-v1",
        binding: {
          thread_id: threadId,
          row_projection_bytes: expect.any(Number),
          row_projection_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
        rejection: { failure: "forbidden_response_item" },
      });
      if (process.platform !== "win32") expect(statSync(diagnosticPath).mode & 0o777).toBe(0o600);
      await delay(2_500);
      expect(existsSync(survived)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("terminates Terra's owned provider tree when the fresh start completes with an error", async () => {
    const root = mkdtempSync(join(tmpdir(), "af-direct-failed-start-"));
    const out = join(root, "reports", "attempt");
    const survived = join(root, "provider-descendant-survived");
    const threadId = "75757575-7575-4757-8757-757575757575";
    const turnId = "85757575-7575-4757-8757-757575757575";
    const fixture = installFakeCodex(
      root,
      `home="\${CODEX_HOME}"
cwd="\${PWD}"
if command -v cygpath >/dev/null 2>&1; then
  home="$(cygpath -u "\${home}")"
  cwd="$(cygpath -m "\${cwd}")"
fi
rollout_dir="\${home}/sessions/2026/08/12"
mkdir -p "\${rollout_dir}"
rollout="\${rollout_dir}/rollout-2026-08-12T12-00-00-${threadId}.jsonl"
printf '{"type":"session_meta","payload":{"id":"%s","cwd":"%s"}}\\n' "${threadId}" "\${cwd}" > "\${rollout}"
printf '{"type":"turn_context","payload":{"turn_id":"${turnId}","cwd":"%s","model":"gpt-5.6-terra"}}\\n' "\${cwd}" >> "\${rollout}"
printf '%s\\n' '{"type":"response_item","payload":{"type":"function_call","id":"fresh-start-item","call_id":"fresh-start-call","name":"start_overworld","namespace":"mcp__adventureforge","arguments":"{}","internal_chat_message_metadata_passthrough":{"turn_id":"${turnId}"}}}' >> "\${rollout}"
printf '%s\\n' '{"type":"event_msg","payload":{"type":"mcp_tool_call_end","call_id":"fresh-start-call","invocation":{"server":"adventureforge","tool":"start_overworld","arguments":{}},"result":{"Ok":{"content":[{"type":"text","text":"SECRET_FAILED_START_OUTPUT"}],"isError":true}}}}' >> "\${rollout}"
(
  sleep 2
  printf 'escaped\\n' > "\${FAKE_MCP_SURVIVED}"
) &
printf '%s\\n' '{"type":"thread.started","thread_id":"${threadId}"}'
while :; do sleep 1; done
`,
    );
    try {
      const result = launchFakeCodex(cleanGit, fixture, out, "73658", {
        FAKE_MCP_SURVIVED: bashPath(survived),
      });
      const output = combinedOutput(result);
      expect(result.error, output).toBeUndefined();
      expect(result.status, output).toBe(43);
      expect(output).toMatch(/strict stream rejected/i);
      expect(output).toMatch(/fresh start completed with an error/i);
      expect(output).not.toContain("SECRET_FAILED_START_OUTPUT");
      expectNoPublishedEvidence(out);

      const diagnostic = readFileSync(`${out}.strict-rejection.json`, "utf8");
      expect(diagnostic).not.toContain("SECRET_FAILED_START_OUTPUT");
      expect(diagnostic).not.toContain("fresh-start-call");
      expect(JSON.parse(diagnostic)).toMatchObject({
        schema_version: 2,
        acceptance_eligible: false,
        canonical: false,
        ignored: true,
        kind: "strict_stream_rejection_diagnostic",
        surface: "private_rollout",
        transport_contract: "game-direct-mcp-v1",
        binding: { thread_id: threadId, row_ordinal: 4 },
        rejection: { failure: "direct_failed_fresh_start" },
        usage_lower_bound: null,
      });

      await delay(2_500);
      expect(existsSync(survived)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("leaves an exclusive diagnostic collision noncanonical without changing strict rejection handling", () => {
    const root = mkdtempSync(join(tmpdir(), "af-strict-stream-diagnostic-collision-"));
    const diagnosticPath = join(root, "attempt.strict-rejection.json");
    const config = {
      path: diagnosticPath,
      seed: "73654",
      buildCommit: "a".repeat(40),
      trackedWorktreeClean: true,
      model: "gpt-5.6-terra",
      cliVersion: "0.144.1",
      clientAuthoritySha256: "b".repeat(64),
    };
    const watch = {
      threadId: "77777777-7777-4777-8777-777777777777",
      identity: { dev: 7n, ino: 9n },
    };
    const row = {
      payload: {
        type: "custom_tool_call",
        id: "wrapper-item-7",
        call_id: "call-wrapper-7",
        input: "private wrapper source must never be published",
      },
    };
    try {
      expect(writeStrictRejectionDiagnostic(config, watch, row, "syntax_error")).toBe(true);
      const initial = readFileSync(diagnosticPath, "utf8");
      expect(writeStrictRejectionDiagnostic(config, watch, row, "syntax_error")).toBe(false);
      expect(readFileSync(diagnosticPath, "utf8")).toBe(initial);
      expect(JSON.parse(initial)).toMatchObject({ acceptance_eligible: false, canonical: false });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps only the latest valid cumulative private usage as a failed-run lower bound", () => {
    const first = {
      input_tokens: 120,
      cached_input_tokens: 80,
      output_tokens: 30,
      reasoning_output_tokens: 20,
      total_tokens: 150,
    };
    const latest = {
      input_tokens: 240,
      cached_input_tokens: 150,
      output_tokens: 60,
      reasoning_output_tokens: 35,
      total_tokens: 300,
    };
    expect(
      latestPrivateUsageLowerBound([
        { type: "event_msg", payload: { type: "token_count", info: { total_token_usage: first } } },
        {
          type: "event_msg",
          payload: { type: "token_count", info: { total_token_usage: latest } },
        },
        {
          type: "event_msg",
          payload: {
            type: "token_count",
            info: { total_token_usage: { ...latest, total_tokens: 301 } },
          },
        },
      ]),
    ).toEqual({
      input_tokens: 240,
      cached_input_tokens: 150,
      output_tokens: 60,
      reasoning_output_tokens: 35,
    });
  });

  it("writes an allowlisted failed-stream category and numeric usage without raw stream data", () => {
    const root = mkdtempSync(join(tmpdir(), "af-strict-stream-lower-bound-"));
    const diagnosticPath = join(root, "attempt.strict-rejection.json");
    const secret = "private game output and provider prose";
    const config = {
      path: diagnosticPath,
      seed: "73655",
      buildCommit: "a".repeat(40),
      trackedWorktreeClean: true,
      model: "gpt-5.3-codex-spark",
      cliVersion: "0.146.0",
      clientAuthoritySha256: "b".repeat(64),
    };
    const detail = {
      surface: "private_rollout",
      failure: "direct_output_mismatch",
      transportContract: "spark-direct-mcp-v1",
      threadId: "88888888-8888-4888-8888-888888888888",
      identity: { dev: 11n, ino: 13n },
      rowIndex: 8,
      row: { type: "response_item", payload: { output: secret } },
      usageLowerBound: {
        input_tokens: 240,
        cached_input_tokens: 150,
        output_tokens: 60,
        reasoning_output_tokens: 35,
      },
    };
    try {
      expect(writeStreamRejectionDiagnostic(config, detail)).toBe(true);

      const diagnostic = readFileSync(diagnosticPath, "utf8");
      expect(Buffer.byteLength(diagnostic, "utf8")).toBeLessThanOrEqual(4 * 1024);
      expect(diagnostic).not.toContain(secret);
      expect(JSON.parse(diagnostic)).toMatchObject({
        schema_version: 2,
        acceptance_eligible: false,
        canonical: false,
        ignored: true,
        kind: "strict_stream_rejection_diagnostic",
        surface: "private_rollout",
        transport_contract: "spark-direct-mcp-v1",
        binding: {
          thread_id: "88888888-8888-4888-8888-888888888888",
          row_ordinal: 9,
          row_projection_bytes: expect.any(Number),
          row_projection_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
        rejection: { failure: "direct_output_mismatch" },
        usage_lower_bound: {
          input_tokens: 240,
          cached_input_tokens: 150,
          output_tokens: 60,
          reasoning_output_tokens: 35,
        },
      });
      expect(
        writeStreamRejectionDiagnostic(
          { ...config, path: join(root, "unsafe.json") },
          { ...detail, failure: secret },
        ),
      ).toBe(false);
      expect(
        writeStreamRejectionDiagnostic(
          { ...config, path: join(root, "extra-usage-field.json") },
          {
            ...detail,
            usageLowerBound: { ...detail.usageLowerBound, provider_secret: secret },
          },
        ),
      ).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects the captured private no-namespace resource probe with its fixed category", async () => {
    const root = mkdtempSync(join(tmpdir(), "af-strict-stream-private-direct-"));
    const out = join(root, "reports", "attempt");
    const survived = join(root, "provider-descendant-survived");
    const threadId = "99999999-9999-4999-8999-999999999999";
    const turnId = "019fe7da-a24d-7ac1-aa56-7c67d11cfba0";
    const resourceCallId = "call_blDR18VQkrYjpIA0t8a1HPFC";
    expect(Buffer.byteLength(CAPTURED_PRIVATE_RESOURCE_PROBE, "utf8")).toBe(342);
    const fixture = installFakeCodex(
      root,
      `home="\${CODEX_HOME}"
cwd="\${PWD}"
if command -v cygpath >/dev/null 2>&1; then
  home="$(cygpath -u "\${home}")"
  cwd="$(cygpath -m "\${cwd}")"
fi
rollout_dir="\${home}/sessions/2026/08/09"
mkdir -p "\${rollout_dir}"
rollout="\${rollout_dir}/rollout-2026-08-09T18-48-13-${threadId}.jsonl"
printf '{"type":"session_meta","payload":{"id":"%s","cwd":"%s"}}\\n' "${threadId}" "\${cwd}" > "\${rollout}"
printf '{"type":"turn_context","payload":{"turn_id":"%s","cwd":"%s","model":"gpt-5.3-codex-spark"}}\\n' "${turnId}" "\${cwd}" >> "\${rollout}"
printf '%s\\n' '${CAPTURED_PRIVATE_RESOURCE_PROBE}' >> "\${rollout}"
(
  sleep 2
  printf 'escaped\\n' > "\${FAKE_MCP_SURVIVED}"
) &
printf '%s\\n' '{"type":"thread.started","thread_id":"${threadId}"}'
while :; do sleep 1; done
`,
      "0.146.0",
    );
    try {
      const result = launchFakeCodex(
        cleanGit,
        fixture,
        out,
        "73656",
        { FAKE_MCP_SURVIVED: bashPath(survived) },
        "gpt-5.3-codex-spark",
      );
      const output = combinedOutput(result);
      expect(result.error, output).toBeUndefined();
      expect(result.status, output).toBe(43);
      expect(output).toMatch(/strict stream rejected/i);
      expect(output).toContain("direct MCP call 1 used a forbidden direct function");
      expect(output).not.toMatch(/invalid or duplicate start/i);
      expect(output).not.toContain("list_mcp_resources");
      expectNoPublishedEvidence(out);

      const diagnosticPath = `${out}.strict-rejection.json`;
      const diagnostic = readFileSync(diagnosticPath, "utf8");
      expect(diagnostic).not.toContain("list_mcp_resources");
      expect(diagnostic).not.toContain(resourceCallId);
      expect(JSON.parse(diagnostic)).toMatchObject({
        schema_version: 2,
        acceptance_eligible: false,
        canonical: false,
        ignored: true,
        kind: "strict_stream_rejection_diagnostic",
        surface: "private_rollout",
        transport_contract: "spark-direct-mcp-v1",
        binding: {
          thread_id: threadId,
          row_ordinal: 3,
          row_projection_bytes: 342,
          row_projection_sha256: CAPTURED_PRIVATE_RESOURCE_PROBE_SHA256,
        },
        rejection: { failure: "direct_forbidden_function" },
        usage_lower_bound: null,
      });

      await delay(2_500);
      expect(existsSync(survived)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("keeps a public-first Spark resource probe fail-closed with the public category", async () => {
    const root = mkdtempSync(join(tmpdir(), "af-strict-stream-public-direct-"));
    const out = join(root, "reports", "attempt");
    const survived = join(root, "provider-descendant-survived");
    const threadId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const fixture = installFakeCodex(
      root,
      `(
  sleep 2
  printf 'escaped\\n' > "\${FAKE_MCP_SURVIVED}"
) &
printf '%s\\n' '{"type":"thread.started","thread_id":"${threadId}"}'
printf '%s\\n' '{"type":"turn.started"}'
printf '%s\\n' '{"type":"item.started","item":{"id":"item_0","type":"mcp_tool_call","server":"codex","tool":"list_mcp_resources","arguments":{},"result":null,"error":null,"status":"in_progress"}}'
while :; do sleep 1; done
`,
      "0.146.0",
    );
    try {
      const result = launchFakeCodex(
        cleanGit,
        fixture,
        out,
        "73657",
        { FAKE_MCP_SURVIVED: bashPath(survived) },
        "gpt-5.3-codex-spark",
      );
      const output = combinedOutput(result);
      expect(result.error, output).toBeUndefined();
      expect(result.status, output).toBe(43);
      expect(output).toMatch(/strict stream rejected/i);
      expect(output).toMatch(/forbidden MCP server codex/i);
      expectNoPublishedEvidence(out);

      const diagnostic = readFileSync(`${out}.strict-rejection.json`, "utf8");
      expect(diagnostic).not.toContain("list_mcp_resources");
      expect(JSON.parse(diagnostic)).toMatchObject({
        schema_version: 2,
        acceptance_eligible: false,
        canonical: false,
        ignored: true,
        kind: "strict_stream_rejection_diagnostic",
        surface: "public_events",
        transport_contract: "spark-direct-mcp-v1",
        binding: { thread_id: threadId, row_ordinal: 3 },
        rejection: { failure: "forbidden_mcp_server" },
        usage_lower_bound: null,
      });

      await delay(2_500);
      expect(existsSync(survived)).toBe(false);
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
      const result = launchFakeCodex(cleanGit, fixture, out, "73653", {
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
  printf 'codex-cli 0.146.0\\n'
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
printf '{"type":"turn_context","payload":{"cwd":"%s","model":"gpt-5.6-terra"}}\\n' "\${cwd}" >> "\${rollout}"
(
  sleep 2
  printf 'fake MCP escaped its provider tree\\n' > "\${FAKE_MCP_SURVIVED}"
) &
printf '%s\\n' '{"type":"thread.started","thread_id":"${threadId}"}'
printf '%s\\n' '{"type":"turn.started"}'
printf '%s\\n' '{"type":"item.started","item":{"id":"item_2","type":"mcp_tool_call","server":"codex","tool":"read_thread","arguments":{},"result":null,"error":null,"status":"in_progress"}}'
while :; do sleep 1; done
`,
    );
    chmodSync(selected, 0o755);

    try {
      const result = spawnSync(
        process.execPath,
        ["blind-tester/blind-launch.mjs", "--out", out, "--seed", "73650", "--model=gpt-5.6-terra"],
        {
          cwd: cleanGit.path,
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
      const diagnostic = readFileSync(`${out}.strict-rejection.json`, "utf8");
      expect(diagnostic).not.toContain("codex");
      expect(JSON.parse(diagnostic)).toMatchObject({
        schema_version: 2,
        acceptance_eligible: false,
        canonical: false,
        ignored: true,
        kind: "strict_stream_rejection_diagnostic",
        surface: "public_events",
        rejection: { failure: "forbidden_mcp_server" },
        usage_lower_bound: null,
      });

      await delay(2_500);
      expect(existsSync(survived)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});
