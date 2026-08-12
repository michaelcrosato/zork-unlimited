#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { closeSync, openSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { setInterval } from "node:timers";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

const WINDOWS_JOB_ANCHOR = fileURLToPath(
  new URL("./codex-windows-job-anchor.ps1", import.meta.url),
);

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function send(message) {
  if (typeof process.send === "function" && process.connected) {
    process.send(message);
  }
}

function terminateOwnTree() {
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(process.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 2_000,
    });
    return;
  }
  try {
    process.kill(-process.pid, "SIGKILL");
  } catch {
    process.exit(1);
  }
}

function quoteWindowsArgument(argument) {
  if (argument.length > 0 && !/[\s"]/u.test(argument)) return argument;
  let quoted = '"';
  let backslashes = 0;
  for (const character of argument) {
    if (character === "\\") {
      backslashes += 1;
    } else if (character === '"') {
      quoted += `${"\\".repeat(backslashes * 2 + 1)}"`;
      backslashes = 0;
    } else {
      quoted += `${"\\".repeat(backslashes)}${character}`;
      backslashes = 0;
    }
  }
  return `${quoted}${"\\".repeat(backslashes * 2)}"`;
}

function windowsCommandLine(executable, args) {
  return [executable, ...args].map(quoteWindowsArgument).join(" ");
}

/**
 * Launch the Windows provider suspended, assign it to a kill-on-close Job
 * Object, then resume it. The PowerShell keeper remains outside that job and
 * reports provider exit separately from verified zero-active-process cleanup.
 */
function startWindowsProvider(executable, args) {
  const pipeName = `adventureforge-codex-${process.pid}-${randomBytes(16).toString("hex")}`;
  const pipePath = `\\\\.\\pipe\\${pipeName}`;
  const terminationPath = join(
    tmpdir(),
    `adventureforge-codex-stop-${process.pid}-${randomBytes(16).toString("hex")}`,
  );
  const resumePath = join(
    tmpdir(),
    `adventureforge-codex-resume-${process.pid}-${randomBytes(16).toString("hex")}`,
  );
  let keeper = null;
  let connection = null;
  let ready = false;
  let started = false;
  let treeTerminated = false;
  let terminationRequested = false;
  let terminationSent = false;
  let resumeRequested = false;
  let resumeSent = false;
  let complete;
  let fail;
  const completion = new Promise((resolve, reject) => {
    complete = resolve;
    fail = reject;
  });
  let completeReady;
  let failReady;
  const readiness = new Promise((resolve, reject) => {
    completeReady = resolve;
    failReady = reject;
  });
  let completeStarted;
  let failStarted;
  const providerStarted = new Promise((resolve, reject) => {
    completeStarted = resolve;
    failStarted = reject;
  });
  void readiness.catch(() => {});
  void providerStarted.catch(() => {});
  const failController = (error) => {
    fail(error);
    failReady(error);
    failStarted(error);
  };
  const signalTermination = () => {
    if (connection === null || !ready || terminationSent) return false;
    terminationSent = true;
    try {
      const descriptor = openSync(terminationPath, "wx", 0o600);
      closeSync(descriptor);
    } catch (error) {
      if (error?.code !== "EEXIST") fail(error);
    }
    return true;
  };
  const signalResume = () => {
    if (connection === null || !ready || resumeSent || terminationRequested) return false;
    resumeSent = true;
    try {
      const descriptor = openSync(resumePath, "wx", 0o600);
      closeSync(descriptor);
    } catch (error) {
      if (error?.code !== "EEXIST") failController(error);
    }
    return true;
  };
  const server = createServer((socket) => {
    if (connection !== null) {
      socket.destroy();
      failController(new Error("Windows process-job control pipe accepted a second client"));
      return;
    }
    connection = socket;
    socket.setEncoding("utf8");
    let pending = "";
    socket.on("data", (chunk) => {
      pending += chunk;
      if (pending.length > 16_384) {
        failController(new Error("Windows process-job control receipt exceeded its byte ceiling"));
        return;
      }
      let newline = pending.indexOf("\n");
      while (newline >= 0) {
        const line = pending.slice(0, newline).replace(/\r$/u, "");
        pending = pending.slice(newline + 1);
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          failController(new Error("Windows process-job control receipt was not valid JSONL"));
          return;
        }
        if (message?.type === "custody_ready" && !ready) {
          ready = true;
          completeReady();
          if (terminationRequested) signalTermination();
          else if (resumeRequested) signalResume();
        } else if (message?.type === "provider_started" && ready && !started) {
          started = true;
          completeStarted();
        } else if (message?.type === "provider_exit" && started) {
          send({
            type: "provider_exit",
            code: message.code,
            signal: message.signal ?? null,
          });
        } else if (message?.type === "tree_terminated" && ready) {
          treeTerminated = true;
          if (!started) {
            failStarted(new Error("Windows process job terminated before provider start"));
          }
          complete();
        } else if (message?.type === "anchor_error" && typeof message.message === "string") {
          failController(new Error(message.message));
        } else {
          failController(new Error("Windows process-job control receipt was out of order"));
          return;
        }
        newline = pending.indexOf("\n");
      }
    });
    socket.once("error", (error) => failController(error));
    socket.once("close", () => {
      if (!treeTerminated) {
        failController(
          new Error("Windows process-job control pipe closed before tree termination"),
        );
      }
    });
  });
  server.once("error", (error) => failController(error));
  server.listen(pipePath, () => {
    keeper = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        WINDOWS_JOB_ANCHOR,
        "-AnchorPid",
        String(process.pid),
        "-ExecutableBase64",
        Buffer.from(executable, "utf8").toString("base64"),
        "-CommandLineBase64",
        Buffer.from(windowsCommandLine(executable, args), "utf8").toString("base64"),
        "-ControlPipe",
        pipeName,
        "-TerminationFileBase64",
        Buffer.from(terminationPath, "utf8").toString("base64"),
        "-ResumeFileBase64",
        Buffer.from(resumePath, "utf8").toString("base64"),
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["inherit", "inherit", "inherit"],
        windowsHide: true,
      },
    );
    keeper.once("error", (error) => failController(error));
    keeper.once("exit", (code) => {
      if (!treeTerminated) {
        failController(
          new Error(
            `Windows process-job keeper exited before verified termination (${String(code)})`,
          ),
        );
      }
    });
  });

  return {
    readiness,
    providerStarted,
    completion: completion.finally(() => {
      connection?.destroy();
      server.close();
      rmSync(terminationPath, { force: true });
      rmSync(resumePath, { force: true });
    }),
    resume() {
      resumeRequested = true;
      return signalResume();
    },
    terminate() {
      terminationRequested = true;
      return signalTermination();
    },
  };
}

function startDirectProvider(executable, args) {
  const provider = spawn(executable, args, {
    cwd: process.cwd(),
    detached: false,
    env: process.env,
    stdio: ["pipe", "inherit", "inherit"],
    windowsHide: true,
  });
  process.stdin.pipe(provider.stdin);
  provider.stdin.on("error", () => {
    // A provider may reject before reading the complete prompt. Its process
    // status, public stream, and final terminal audit remain authoritative.
  });
  provider.once("error", (error) => {
    send({ type: "provider_spawn_error", message: error.message });
  });
  provider.once("exit", (code, signal) => {
    send({ type: "provider_exit", code, signal });
  });
}

/**
 * Keep a live, detached root above Codex and every MCP descendant even after
 * Codex exits. The supervisor owns this anchor and releases it only by killing
 * and verifying the complete anchored process tree.
 */
async function main() {
  const argv = process.argv.slice(2);
  const separator = argv.indexOf("--");
  if (separator < 0) throw new Error("codex process anchor requires provider arguments");
  const options = argv.slice(0, separator);
  const providerArgs = argv.slice(separator + 1);
  const binary = option(options, "--binary");
  const testShell = option(options, "--test-shell") ?? null;
  const deferredResume = options.includes("--deferred-resume");
  if (!binary || providerArgs.length === 0) {
    throw new Error("codex process anchor requires --binary and provider arguments");
  }

  const executable = testShell ?? binary;
  const args = testShell === null ? providerArgs : [binary, ...providerArgs];
  if (process.platform === "win32") {
    let terminationRequested = false;
    let resumeRequested = !deferredResume;
    let controller;
    const requestTermination = () => {
      terminationRequested = true;
      controller?.terminate();
    };
    const requestResume = () => {
      resumeRequested = true;
      controller?.resume();
    };
    process.on("message", (message) => {
      if (message?.type === "terminate_owned_tree") requestTermination();
      else if (message?.type === "resume_owned_tree") requestResume();
    });
    process.once("disconnect", requestTermination);
    controller = startWindowsProvider(executable, args);
    if (terminationRequested) controller.terminate();
    await controller.readiness;
    send({ type: "custody_ready" });
    if (resumeRequested && !terminationRequested) controller.resume();
    try {
      await controller.providerStarted;
      send({ type: "provider_started" });
    } catch (error) {
      if (!terminationRequested) throw error;
    }
    await controller.completion;
    if (process.connected) process.disconnect();
    return;
  }

  startDirectProvider(executable, args);
  process.once("disconnect", terminateOwnTree);
  setInterval(() => {}, 60_000);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    const message = {
      type: "anchor_error",
      message: error instanceof Error ? error.message : String(error),
    };
    process.exitCode = 1;
    if (typeof process.send === "function" && process.connected) {
      process.send(message, () => process.disconnect());
    }
  });
}
