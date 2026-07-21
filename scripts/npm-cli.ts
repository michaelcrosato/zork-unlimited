import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

interface RunNpmScriptOptions {
  cwd?: string;
  stdio?: "ignore" | "inherit" | "pipe";
  timeout?: number;
}

function npmCliInvocation(): { command: string; args: string[] } {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return { command: process.execPath, args: [npmExecPath] };
  }

  const bundledNpmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(bundledNpmCli)) {
    return { command: process.execPath, args: [bundledNpmCli] };
  }

  if (process.platform !== "win32") {
    return { command: "npm", args: [] };
  }

  throw new Error("Could not resolve npm's JavaScript CLI entrypoint");
}

/** Runs an npm script without routing arguments through a command shell. */
export function runNpmScript(
  script: string,
  scriptArgs: readonly string[] = [],
  options: RunNpmScriptOptions = {},
) {
  const npm = npmCliInvocation();
  const forwardedArgs = scriptArgs.length > 0 ? ["--", ...scriptArgs] : [];

  return spawnSync(npm.command, [...npm.args, "run", script, ...forwardedArgs], {
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    timeout: options.timeout ?? 120_000,
  });
}
