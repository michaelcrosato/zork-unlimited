#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
} from "node:fs";
import { clearTimeout, setTimeout } from "node:timers";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import {
  CODEX_STRICT_CURRENT_CONTRACT,
  inspectCodexGameplayResultForwardingPrefix,
  inspectCodexPureEventPrefix,
} from "./codex-pure-envelope.mjs";
import {
  bindThreadBoundCodexRolloutRows,
  closeThreadBoundCodexRollout,
  readThreadBoundCodexRolloutChunk,
  tryCreateCodexRolloutWatchAuthority,
  tryOpenThreadBoundCodexRollout,
} from "./codex-rollout.mjs";

export const CODEX_STRICT_STREAM_REJECT_EXIT = 43;
const DEFAULT_POLL_MS = 50;
const TERMINATION_GRACE_MS = 2_000;
const PROCESS_ANCHOR = fileURLToPath(new URL("./codex-process-anchor.mjs", import.meta.url));

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function failure(message) {
  throw new Error(message);
}

export function createCompleteJsonlDecoder(label) {
  return { label, pending: Buffer.alloc(0), rows: [], lineNumber: 0 };
}

/**
 * Parse only newline-terminated JSONL records. An incomplete trailing byte
 * sequence stays private to the decoder until a later append completes it.
 */
export function appendCompleteJsonlBytes(decoder, appended) {
  if (!Buffer.isBuffer(appended)) failure(`${decoder.label} append must be bytes`);
  if (appended.byteLength === 0) return [];
  const combined =
    decoder.pending.byteLength === 0
      ? appended
      : Buffer.concat(
          [decoder.pending, appended],
          decoder.pending.byteLength + appended.byteLength,
        );
  const finalNewline = combined.lastIndexOf(0x0a);
  if (finalNewline < 0) {
    decoder.pending = combined;
    return [];
  }
  const complete = combined.subarray(0, finalNewline + 1);
  decoder.pending = Buffer.from(combined.subarray(finalNewline + 1));
  const parsed = [];
  for (const rawLine of complete.toString("utf8").split("\n").slice(0, -1)) {
    decoder.lineNumber += 1;
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.trim().length === 0) continue;
    try {
      const row = JSON.parse(line);
      decoder.rows.push(row);
      parsed.push(row);
    } catch {
      failure(`${decoder.label} contains invalid JSON at complete line ${decoder.lineNumber}`);
    }
  }
  return parsed;
}

function openOwnedOutput(path, label) {
  const descriptor = openSync(path, "wx+", 0o600);
  const linked = lstatSync(path, { bigint: true });
  const opened = fstatSync(descriptor, { bigint: true });
  const canonicalPath = realpathSync.native(path);
  if (
    linked.isSymbolicLink() ||
    !linked.isFile() ||
    linked.nlink !== 1n ||
    linked.dev !== opened.dev ||
    linked.ino !== opened.ino ||
    canonicalPath !== realpathSync.native(path)
  ) {
    closeSync(descriptor);
    failure(`${label} must be one runner-owned regular non-linked file`);
  }
  return {
    descriptor,
    path: canonicalPath,
    dev: opened.dev,
    ino: opened.ino,
    offset: 0n,
  };
}

function readOwnedOutputChunk(output, label) {
  const linked = lstatSync(output.path, { bigint: true });
  const opened = fstatSync(output.descriptor, { bigint: true });
  if (
    linked.isSymbolicLink() ||
    !linked.isFile() ||
    linked.nlink !== 1n ||
    linked.dev !== opened.dev ||
    linked.ino !== opened.ino ||
    opened.dev !== output.dev ||
    opened.ino !== output.ino ||
    opened.size < output.offset
  ) {
    failure(`${label} identity changed while the provider was running`);
  }
  const length = opened.size - output.offset;
  if (length === 0n) return Buffer.alloc(0);
  if (length > BigInt(Number.MAX_SAFE_INTEGER) || output.offset > BigInt(Number.MAX_SAFE_INTEGER)) {
    failure(`${label} append is too large to inspect safely`);
  }
  const bytes = Buffer.alloc(Number(length));
  let offset = 0;
  while (offset < bytes.byteLength) {
    const count = readSync(
      output.descriptor,
      bytes,
      offset,
      bytes.byteLength - offset,
      Number(output.offset) + offset,
    );
    if (count === 0) failure(`${label} changed while its prefix was read`);
    offset += count;
  }
  output.offset += BigInt(bytes.byteLength);
  return bytes;
}

function exitCodeFor(code, signal) {
  if (Number.isInteger(code) && code >= 0) return code;
  if (typeof signal === "string") return 128;
  return 1;
}

export function providerExitCodeFor(code, signal) {
  const status = exitCodeFor(code, signal);
  return status === CODEX_STRICT_STREAM_REJECT_EXIT ? 4 : status;
}

function awaitExit(child, milliseconds) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    let timer;
    let settled = false;
    const settle = (exited) => {
      if (settled) return;
      settled = true;
      child.off("exit", onExit);
      if (timer !== undefined) clearTimeout(timer);
      resolve(exited);
    };
    const onExit = () => settle(true);
    child.once("exit", onExit);
    timer = setTimeout(() => settle(false), milliseconds);
    if (child.exitCode !== null || child.signalCode !== null) settle(true);
  });
}

function processGroupExists(processGroupId) {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

/** Terminate exactly the detached provider tree owned by this supervisor. */
export async function terminateOwnedProviderTree(child, platform = process.platform) {
  if (!Number.isInteger(child.pid) || child.exitCode !== null || child.signalCode !== null) {
    throw new Error("Owned provider process-tree anchor was not alive for verified termination");
  }
  if (platform === "win32") {
    if (child.connected) {
      try {
        child.send({ type: "terminate_owned_tree" });
      } catch {
        // Forced tree termination below remains the bounded fallback.
      }
      if (await awaitExit(child, TERMINATION_GRACE_MS)) {
        if (child.exitCode === 0 && child.signalCode === null) return;
        throw new Error(
          "Windows provider process-tree anchor exited without its clean termination proof",
        );
      }
    }
    const killed = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      timeout: TERMINATION_GRACE_MS,
    });
    if (killed.error || killed.status !== 0) {
      throw new Error("Could not prove termination of the owned Windows provider process tree");
    }
    if (!(await awaitExit(child, TERMINATION_GRACE_MS))) {
      throw new Error("Owned provider process tree did not terminate within the forced-kill grace");
    }
    throw new Error(
      "Windows provider process tree required forced cleanup without a proof receipt",
    );
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
  const providerExited = await awaitExit(child, TERMINATION_GRACE_MS);
  if (processGroupExists(child.pid)) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
  if (!providerExited && !(await awaitExit(child, TERMINATION_GRACE_MS))) {
    throw new Error("Owned provider process tree did not terminate within the forced-kill grace");
  }
  const groupDeadline = Date.now() + TERMINATION_GRACE_MS;
  while (processGroupExists(child.pid) && Date.now() < groupDeadline) {
    await delay(25);
  }
  if (processGroupExists(child.pid)) {
    throw new Error("Owned provider process group remained alive after forced termination");
  }
}

function spawnProviderAnchor({
  binary,
  args,
  cwd,
  codexHome,
  prompt,
  eventsDescriptor,
  stderrDescriptor,
  testShell,
}) {
  const anchorArgs = [PROCESS_ANCHOR, "--binary", binary];
  if (testShell !== null) anchorArgs.push("--test-shell", testShell);
  anchorArgs.push("--", ...args);
  const child = spawn(process.execPath, anchorArgs, {
    cwd,
    detached: true,
    env: { ...process.env, CODEX_HOME: codexHome },
    stdio: ["pipe", eventsDescriptor, stderrDescriptor, "ipc"],
    windowsHide: true,
  });
  child.stdin.on("error", () => {
    // The anchor may fail closed before consuming the complete prompt. Its
    // launch status and process-tree cleanup remain authoritative.
  });
  child.stdin.end(prompt);
  return child;
}

function providerOutcome(anchor) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    anchor.on("message", (message) => {
      if (message?.type === "provider_exit") {
        settle({ kind: "provider_exit", code: message.code, signal: message.signal });
      } else if (message?.type === "provider_spawn_error" || message?.type === "anchor_error") {
        settle({
          kind: "launcher_error",
          error: new Error(
            typeof message.message === "string"
              ? message.message
              : "Codex process-tree anchor reported an invalid launch error",
          ),
        });
      }
    });
    anchor.once("error", (error) => settle({ kind: "anchor_spawn_error", error }));
    anchor.once("exit", (code, signal) => settle({ kind: "anchor_exit", code, signal }));
  });
}

export async function superviseCodexStrictStream({
  binary,
  args,
  cwd,
  codexHome,
  eventsPath,
  providerStderrPath,
  model,
  timeoutSeconds,
  testShell = null,
  pollMs = DEFAULT_POLL_MS,
}) {
  const prompt = readFileSync(0);
  const eventsOutput = openOwnedOutput(eventsPath, "Codex provider events");
  let providerStderr;
  try {
    providerStderr = openOwnedOutput(providerStderrPath, "Codex provider stderr");
  } catch (error) {
    closeSync(eventsOutput.descriptor);
    throw error;
  }
  const publicDecoder = createCompleteJsonlDecoder("Codex provider event prefix");
  const privateDecoder = createCompleteJsonlDecoder("Codex private rollout prefix");
  let rolloutAuthority = null;
  let privateWatch = null;
  let anchor;
  try {
    anchor = spawnProviderAnchor({
      binary,
      args,
      cwd,
      codexHome,
      prompt,
      eventsDescriptor: eventsOutput.descriptor,
      stderrDescriptor: providerStderr.descriptor,
      testShell,
    });
  } catch (error) {
    closeSync(eventsOutput.descriptor);
    closeSync(providerStderr.descriptor);
    throw error;
  }
  closeSync(providerStderr.descriptor);
  const provider = providerOutcome(anchor);
  const deadline = Date.now() + timeoutSeconds * 1_000;
  let rejection;
  let terminalOutcome;
  try {
    while (true) {
      const waitMs = Math.max(0, Math.min(pollMs, deadline - Date.now()));
      const outcome = await Promise.race([provider, delay(waitMs).then(() => ({ kind: "poll" }))]);
      if (outcome.kind === "launcher_error" || outcome.kind === "anchor_spawn_error") {
        terminalOutcome = outcome;
        break;
      }
      if (outcome.kind === "anchor_exit") {
        terminalOutcome = {
          kind: "launcher_error",
          error: new Error(
            `Codex process-tree anchor exited before reporting provider status (${exitCodeFor(
              outcome.code,
              outcome.signal,
            )})`,
          ),
        };
        break;
      }
      if (outcome.kind === "provider_exit") {
        terminalOutcome = outcome;
        break;
      }
      if (Date.now() >= deadline) {
        terminalOutcome = { kind: "timeout" };
        break;
      }

      appendCompleteJsonlBytes(
        publicDecoder,
        readOwnedOutputChunk(eventsOutput, "Codex provider events"),
      );
      const publicInspection = inspectCodexPureEventPrefix(publicDecoder.rows, model, {
        codeModeContract: CODEX_STRICT_CURRENT_CONTRACT,
      });
      if (!publicInspection.ok) {
        rejection = publicInspection.reason;
        break;
      }

      if (publicInspection.threadId !== null && privateWatch === null) {
        rolloutAuthority ??= tryCreateCodexRolloutWatchAuthority(codexHome, cwd);
        if (rolloutAuthority !== null) {
          privateWatch = tryOpenThreadBoundCodexRollout(
            rolloutAuthority,
            publicInspection.threadId,
          );
        }
      }
      if (privateWatch !== null) {
        appendCompleteJsonlBytes(privateDecoder, readThreadBoundCodexRolloutChunk(privateWatch));
        const binding = bindThreadBoundCodexRolloutRows(privateWatch, privateDecoder.rows, model);
        if (binding.turnBound) {
          const privateInspection = inspectCodexGameplayResultForwardingPrefix(
            privateDecoder.rows,
            { codeModeContract: CODEX_STRICT_CURRENT_CONTRACT },
          );
          if (!privateInspection.ok) {
            rejection = privateInspection.reason;
            break;
          }
        }
      }
    }
  } catch (error) {
    rejection = `strict stream watcher failed closed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    terminalOutcome = { kind: "strict_rejection" };
  } finally {
    if (privateWatch !== null) closeThreadBoundCodexRollout(privateWatch);
  }

  if (terminalOutcome?.kind === "anchor_spawn_error") {
    closeSync(eventsOutput.descriptor);
    throw terminalOutcome.error;
  }
  try {
    await terminateOwnedProviderTree(anchor);
  } finally {
    closeSync(eventsOutput.descriptor);
  }
  if (terminalOutcome?.kind === "launcher_error") throw terminalOutcome.error;
  if (terminalOutcome?.kind === "provider_exit") {
    return providerExitCodeFor(terminalOutcome.code, terminalOutcome.signal);
  }
  if (terminalOutcome?.kind === "timeout") return 124;
  process.stderr.write(`Codex strict stream rejected: ${rejection}\n`);
  return CODEX_STRICT_STREAM_REJECT_EXIT;
}

async function main() {
  const argv = process.argv.slice(2);
  const separator = argv.indexOf("--");
  if (separator < 0) failure("codex-strict-stream requires `--` before provider arguments");
  const options = argv.slice(0, separator);
  const providerArgs = argv.slice(separator + 1);
  const binary = option(options, "--binary");
  const cwd = option(options, "--cwd");
  const codexHome = option(options, "--home");
  const eventsPath = option(options, "--events");
  const providerStderrPath = option(options, "--provider-stderr");
  const model = option(options, "--model");
  const timeoutSeconds = Number(option(options, "--timeout-seconds"));
  const testShell = option(options, "--test-shell") ?? null;
  if (
    !binary ||
    !cwd ||
    !codexHome ||
    !eventsPath ||
    !providerStderrPath ||
    !model ||
    !Number.isSafeInteger(timeoutSeconds) ||
    timeoutSeconds <= 0 ||
    providerArgs.length === 0
  ) {
    failure(
      "codex-strict-stream requires --binary, --cwd, --home, --events, --provider-stderr, --model, --timeout-seconds, and provider arguments",
    );
  }
  if (
    testShell !== null &&
    (process.env.NODE_ENV !== "test" || process.env.BLIND_CODEX_TEST_SCRIPT_CLIENT !== "1")
  ) {
    failure("codex-strict-stream test shell requires the explicit test-script client seam");
  }
  process.exitCode = await superviseCodexStrictStream({
    binary,
    args: providerArgs,
    cwd,
    codexHome,
    eventsPath,
    providerStderrPath,
    model,
    timeoutSeconds,
    testShell,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 4;
  });
}
