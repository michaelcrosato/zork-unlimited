import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");

describe("one-click Windows launcher contract", () => {
  it("checks the supported runtime, validates dependencies, and fails closed", () => {
    const launcher = read("PLAY.bat");
    expect(launcher).toContain("if %NODE_MAJOR% LSS 22 goto :nodefail");
    expect(launcher).toContain("call npm ls --depth=0");
    expect(launcher).toContain("call npm --prefix ui ls --depth=0");
    expect(launcher).toContain("call npm ci --no-audit --no-fund");
    expect(launcher).toContain("call npm --prefix ui ci --no-audit --no-fund");
    expect(launcher).toContain("call npm run ui:build || goto :buildfail");
    expect(launcher).toContain('if /i "%ADVENTUREFORGE_BUILD_ONLY%"=="1"');

    const buildFailure = launcher.slice(
      launcher.lastIndexOf(":buildfail"),
      launcher.lastIndexOf(":nodefail"),
    );
    expect(buildFailure).toContain("The game was not opened because the current build failed.");
    expect(buildFailure).not.toMatch(/\bstart\b/i);
  });

  it("builds one offline HTML file and preserves batch line endings on checkout", () => {
    const uiPackage = JSON.parse(read("ui/package.json")) as {
      scripts: { build: string };
    };
    const inliner = read("ui/scripts/inline-dist.mjs");
    const styles = read("ui/src/styles.css");

    expect(uiPackage.scripts.build).toBe("vite build && node scripts/inline-dist.mjs");
    expect(inliner).toContain("scriptCount !== 1 || stylesheetCount !== 1");
    expect(inliner).toContain('rmSync(join(dist, "assets")');
    expect(inliner).toContain("built CSS still imports a remote stylesheet");
    expect(styles).not.toMatch(/@import[^;]*https?:\/\//i);
    expect(read(".gitattributes")).toContain("*.bat text eol=crlf");
  });
});
