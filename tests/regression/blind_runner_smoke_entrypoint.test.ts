/**
 * Regression for bug_0389 — the blind runner's smoke path assumed `node` was a
 * POSIX command. In this Windows+Bash workspace only `node.exe` is on the Bash
 * PATH, so the mandatory blind gate failed before it could prove the MCP path.
 */
import { describe, expect, it } from "vitest";
import { runNpmScript } from "../../scripts/npm-cli.js";

describe("bug_0389 — blind runner smoke entrypoint resolves Node", () => {
  it("runs the no-LLM MCP smoke test through the normal npm blind script", () => {
    const result = runNpmScript("blind", ["--smoke", "--quest", "breaking_weir", "--seed", "7"]);
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
    expect(result.status, output).toBe(0);
    expect(output).toContain("SMOKE OK");
    expect(output).toContain("MCP path works");
  });
});
