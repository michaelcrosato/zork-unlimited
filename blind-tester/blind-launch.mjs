#!/usr/bin/env node
/**
 * blind-launch — run blind-tester/run.sh with the RIGHT bash on every platform,
 * and undo PowerShell/npm flag-eating so `npm run blind` flags survive.
 *
 * Why this exists:
 * 1. `npm run blind` used to be `bash blind-tester/run.sh`, and on Windows npm
 *    executes scripts through cmd.exe, which resolves `bash` from the parent
 *    PATH. Under a PowerShell/cmd parent that is C:\Windows\System32\bash.exe —
 *    the WSL launcher — so the harness silently ran inside WSL, where a
 *    Windows-installed node_modules (win32-x64 esbuild binary) kills the MCP
 *    server with "MCP error -32000: Connection closed". This launcher resolves
 *    Git Bash deterministically on win32 (override with BLIND_BASH) and plain
 *    `bash` everywhere else.
 * 2. PowerShell strips a bare `--` (it is PowerShell's own end-of-options
 *    token), so `npm run blind -- --spectate --delay-ms 1500` reaches npm
 *    without the separator and npm EATS the flags as unknown npm configs,
 *    forwarding only orphaned values ("1500" became the quest id). npm does
 *    expose eaten flags as npm_config_* env vars, so we reconstruct them here —
 *    `npm run blind --spectate --delay-ms=1500 --quest=<id>` works from any
 *    shell, with or without `--`.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN_SH = join(HERE, "run.sh");

// key in npm_config_* (npm maps dashes to underscores) → run.sh flag, takesValue.
const NPM_EATEN_FLAGS = [
  ["quest", "--quest", true],
  ["quest_id", "--quest", true],
  ["seed", "--seed", true],
  ["model", "--model", true],
  ["out", "--out", true],
  ["delay_ms", "--delay-ms", true],
  ["persona", "--persona", true],
  ["smoke", "--smoke", false],
  ["mock", "--mock", false],
  ["spectate", "--spectate", false],
  ["overworld", "--overworld", false],
];

/**
 * Reconstruct flags npm consumed (pure; exported for tests). For a value flag
 * passed space-separated (`--delay-ms 1500`), npm records `true` and orphans the
 * value as a bare positional — claim a leading all-digits positional as its
 * value. Flags already present in argv (a shell that forwarded `--` correctly)
 * are never duplicated.
 */
export function recoverNpmEatenFlags(argv, env) {
  const args = [...argv];
  const unresolvedValueFlags = NPM_EATEN_FLAGS.filter(
    ([key, flag, takesValue]) =>
      takesValue && env[`npm_config_${key}`] === "true" && !args.includes(flag),
  );
  const numericOrphans = args.filter((value) => /^-?\d+$/.test(value));
  if (
    unresolvedValueFlags.length > 1 ||
    (unresolvedValueFlags.length === 1 && numericOrphans.length !== 1)
  ) {
    throw new Error(
      `Cannot safely recover space-separated ${unresolvedValueFlags.map(([, flag]) => flag).join(" / ")} values from npm; use equals form (for example --seed=-17 --delay-ms=1500).`,
    );
  }
  let recovered = false;
  for (const [key, flag, takesValue] of NPM_EATEN_FLAGS) {
    const value = env[`npm_config_${key}`];
    if (value === undefined || value === "" || value === "false") continue;
    if (args.includes(flag)) continue;
    if (!takesValue) {
      args.push(flag);
      recovered = true;
    } else if (value !== "true") {
      args.push(flag, value);
      recovered = true;
    } else {
      const orphan = args.findIndex((t) => /^-?\d+$/.test(t));
      if (orphan >= 0) {
        const [num] = args.splice(orphan, 1);
        args.push(flag, num);
        recovered = true;
      }
    }
  }
  return { args, recovered };
}

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

function main() {
  let recovery;
  try {
    recovery = recoverNpmEatenFlags(process.argv.slice(2), process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  const { args, recovered } = recovery;
  if (recovered) {
    console.error(
      "(recovered flags npm consumed — PowerShell strips `--`; `npm run blind --flag=value` works directly)",
    );
  }
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
}

// Entry guard so tests can import recoverNpmEatenFlags without launching a run.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
