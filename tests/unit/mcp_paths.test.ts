/**
 * Path confinement (§9.4, §16): safeResolve rejects lexical escapes and —
 * since the symlink hardening — canonical escapes through a link inside the
 * root that points outside it. The symlink case is exercised only where the
 * environment can create links (Windows needs Developer Mode; CI's Linux
 * always can) so the suite stays green on restricted machines without
 * weakening the check where it can run.
 */
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PathEscapeError, safeResolve } from "../../src/mcp/paths.js";

describe("safeResolve", () => {
  it("resolves in-root relative paths and rejects lexical escapes", () => {
    const root = mkdtempSync(join(tmpdir(), "af-paths-"));
    try {
      expect(safeResolve(root, "content/pack.yaml").startsWith(root)).toBe(true);
      expect(() => safeResolve(root, "../outside.yaml")).toThrow(PathEscapeError);
      expect(() => safeResolve(root, join(tmpdir(), "elsewhere.yaml"))).toThrow(PathEscapeError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts nonexistent in-root paths (error paths report not-found, not escape)", () => {
    const root = mkdtempSync(join(tmpdir(), "af-paths-"));
    try {
      expect(safeResolve(root, "content/does_not_exist.yaml").startsWith(root)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a symlink inside the root that points outside it", () => {
    const base = mkdtempSync(join(tmpdir(), "af-paths-"));
    const root = join(base, "root");
    const outside = join(base, "outside");
    mkdirSync(root);
    mkdirSync(outside);
    writeFileSync(join(outside, "secret.yaml"), "x: 1\n");
    let linked = false;
    try {
      try {
        symlinkSync(outside, join(root, "sneaky"), "junction");
        linked = true;
      } catch {
        // No link privilege in this environment — the lexical checks above
        // still ran; the canonical check is covered where links are possible.
      }
      if (linked) {
        expect(() => safeResolve(root, "sneaky/secret.yaml")).toThrow(PathEscapeError);
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
