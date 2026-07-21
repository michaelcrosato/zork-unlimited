/**
 * The public author command belongs to the consolidated RPG surface.
 *
 * Legacy CYOA/parser authoring loops remain in the repo as migration scaffolding,
 * but the CLI should no longer expose mode selection or default to CYOA.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runNpmScript } from "../../scripts/npm-cli.js";

function runAuthor(args: readonly string[], timeout = 120_000) {
  return runNpmScript("author", args, { timeout });
}

function outputOf(result: ReturnType<typeof runAuthor>): string {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
}

describe("author CLI RPG-only public surface", () => {
  it("authors a green RPG pack by default", () => {
    const result = runAuthor(["A keeper must relight a dead lighthouse before a ship wrecks."]);
    const output = outputOf(result);

    expect(result.status, output).toBe(0);
    expect(output).toContain("Adapter reached a GREEN rpg pack");
    expect(output).toContain("Source: lighthouse_rpg_v1");
    expect(output).not.toContain("GREEN cyoa");
    expect(output).not.toContain("GREEN parser");
  });

  it("rejects legacy mode selection", () => {
    const result = runAuthor(
      ["A keeper must relight a dead lighthouse before a ship wrecks.", "--mode", "cyoa"],
      30_000,
    );
    const output = outputOf(result);

    expect(result.status, output).toBe(2);
    expect(output).toContain("author is RPG-only; --mode is no longer supported.");
  });

  it("writes authored packs as drafts outside the shipped world graph", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-author-"));
    const out = join(dir, "draft.yaml");
    try {
      const result = runAuthor([
        "A keeper must relight a dead lighthouse before a ship wrecks.",
        "--",
        "--out",
        out,
      ]);
      const output = outputOf(result);

      expect(result.status, output).toBe(0);
      expect(output).toContain("Wrote draft RPG pack");
      expect(existsSync(out)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects direct writes into shipped RPG pack storage", () => {
    const result = runAuthor(
      [
        "A keeper must relight a dead lighthouse before a ship wrecks.",
        "--",
        "--out",
        "content/rpg/quests/new_lighthouse.yaml",
      ],
      30_000,
    );
    const output = outputOf(result);

    expect(result.status, output).toBe(2);
    expect(output).toContain("author writes draft RPG packs only");
    expect(output).toContain("canonical world graph");
  });
});
