#!/usr/bin/env node
/**
 * blind-launch — run blind-tester/run.sh with the RIGHT bash on every platform.
 *
 * Why this exists: `npm run blind` used to be `bash blind-tester/run.sh`, and on
 * Windows npm executes scripts through cmd.exe, which resolves `bash` from the
 * parent PATH. Under a PowerShell/cmd parent that is C:\Windows\System32\bash.exe
 * — the WSL launcher — so the harness silently ran inside WSL, where a
 * Windows-installed node_modules (win32-x64 esbuild binary) kills the MCP server
 * with "MCP error -32000: Connection closed". This launcher resolves Git Bash
 * deterministically on win32 (via `where git` → <Git>\bin\bash.exe; override
 * with BLIND_BASH) and plain `bash` everywhere else, then passes all args through.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN_SH = join(HERE, "run.sh");

/** A usable bash: exists and is NOT the System32 WSL launcher. */
function isRealBash(p) {
  return typeof p === "string" && p !== "" && existsSync(p) && !/system32/i.test(p);
}

function gitBash() {
  if (isRealBash(process.env.BLIND_BASH)) return process.env.BLIND_BASH;
  // Already inside Git Bash? It exports SHELL / EXEPATH pointing at itself.
  if (
    process.env.SHELL &&
    /bash(\.exe)?$/i.test(process.env.SHELL) &&
    isRealBash(process.env.SHELL)
  )
    return process.env.SHELL;
  if (process.env.EXEPATH && isRealBash(join(process.env.EXEPATH, "bash.exe")))
    return join(process.env.EXEPATH, "bash.exe");
  const candidates = [];
  try {
    // git.exe may sit in <Git>\cmd, <Git>\bin, or <Git>\mingw64\bin — check every
    // `where` result and walk up one AND two levels to find the Git root.
    const lines = execFileSync("where", ["git"], { encoding: "utf8" })
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const git of lines) {
      for (const up of ["..", join("..", "..")]) {
        const root = resolve(dirname(git), up);
        candidates.push(join(root, "bin", "bash.exe"), join(root, "usr", "bin", "bash.exe"));
      }
    }
  } catch {
    // fall through to the well-known install locations
  }
  candidates.push(
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    join(process.env.LOCALAPPDATA ?? "", "Programs", "Git", "bin", "bash.exe"),
  );
  return candidates.find(isRealBash) ?? null;
}

const args = process.argv.slice(2);
let bash = "bash";
if (process.platform === "win32") {
  const found = gitBash();
  if (!found) {
    console.error(
      "Could not find Git Bash (looked via `where git`; System32 bash.exe is the WSL launcher and cannot run this harness against a Windows checkout).",
    );
    console.error("Install Git for Windows or set BLIND_BASH to a bash.exe path.");
    process.exit(3);
  }
  bash = found;
}

const result = spawnSync(bash, [RUN_SH, ...args], { stdio: "inherit" });
process.exit(result.status ?? 1);
