/**
 * Local worktrees may have an older pre-commit hook that invokes
 * `npx ts-node scripts/assertion-shield.ts`. The hook is outside the repo, but
 * the target script must ship here so a normal verified commit does not force
 * `--no-verify`.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("pre-commit assertion shield compatibility", () => {
  it("ships the legacy hook target as a wrapper around the canonical verifier", () => {
    const script = join(root, "scripts", "assertion-shield.ts");
    expect(existsSync(script)).toBe(true);

    const text = readFileSync(script, "utf8");
    expect(text).toContain("npm");
    expect(text).toContain("verify:integrity");
    expect(text).toContain("spawnSync");
  });
});
