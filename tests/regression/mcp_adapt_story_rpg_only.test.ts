/**
 * MCP authoring is part of the consolidated RPG public surface.
 *
 * Older migration tests required `adapt_story` to route across CYOA/parser/RPG.
 * The public contract now mirrors `bin/author.ts`: authoring from prose produces
 * compact RPG validation proof, can opt into the full pack, and rejects stray
 * explicit mode selection.
 */
import { describe, expect, it } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

const api = () => createToolApi({ root: process.cwd() });
const PREMISE = "A keeper relights a dead lighthouse.";

describe("adapt_story RPG-only MCP authoring surface", () => {
  it("authors a green RPG pack by default", async () => {
    const r = await api().adapt_story({ premise: PREMISE });

    expect(r.ok).toBe(true);
    expect("mode" in r).toBe(false);
    expect("pack" in r).toBe(false);
    expect(r.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.report.ok).toBe(true);
    expect(r.story.title).toBe("The Lighthouse");
    expect(r.classifications.length).toBeGreaterThanOrEqual(3);

    const full = await api().adapt_story({ premise: PREMISE, include_pack: true });
    expect(full.pack?.meta.id).toBe("lighthouse_rpg_v1");
    const pack = full.pack as Parameters<typeof validateRpg>[0];
    expect(Array.isArray(pack.enemies)).toBe(true);
    expect(pack.enemies.length).toBeGreaterThanOrEqual(1);
    expect(validateRpg(pack).ok).toBe(true);
    expect(JSON.stringify(r).length).toBeLessThan(JSON.stringify(full).length);
  });

  it("rejects legacy mode selection", async () => {
    await expect(api().adapt_story({ premise: PREMISE, mode: "cyoa" } as never)).rejects.toThrow(
      "adapt_story is RPG-only",
    );
  });
});
