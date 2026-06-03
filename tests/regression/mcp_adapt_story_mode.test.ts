/**
 * bug_0193 — MCP authoring symmetry: `adapt_story` `mode` param.
 *
 * The generation surface reached all three modes (generate_pack / generate_rpg_pack /
 * generate_parser_pack, the last shipped bug_0192), but the AUTHORING surface —
 * `adapt_story` (writer → adapter → validator) — only ever routed through runAdapter
 * (CYOA). runParserAdapter / runRpgAdapter existed (agents/authoring/adapter.ts, the
 * bug_0139/0140 loops) but were unreachable from MCP, so the parser/RPG authoring loops
 * never faced the MCP boundary. This locks the `mode` param that closes that asymmetry:
 * the SAME writer story is re-adapted into each mode's pack type behind that mode's own
 * validator (validateCyoa / validateParser / validateRpg).
 *
 * Genuine witness: before the fix the `mode` arg is ignored, so the parser/RPG cases
 * would return the CYOA pack (`lighthouse_v1`) with no `mode` field — these assertions
 * fail on the pre-fix tool.
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

const api = () => createToolApi({ root: process.cwd() });
const PREMISE = "A keeper relights a dead lighthouse.";

describe("adapt_story mode routing (authoring symmetry, bug_0193)", () => {
  it("defaults to CYOA when no mode is given (back-compat)", async () => {
    const r = await api().adapt_story({ premise: PREMISE });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("cyoa");
    expect(r.pack?.meta.id).toBe("lighthouse_v1");
  });

  it("mode:cyoa routes through the CYOA adapter", async () => {
    const r = await api().adapt_story({ premise: PREMISE, mode: "cyoa" });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("cyoa");
    expect(r.pack?.meta.id).toBe("lighthouse_v1");
    expect(r.report.ok).toBe(true);
  });

  it("mode:parser authors a green PARSER pack behind validateParser", async () => {
    const r = await api().adapt_story({ premise: PREMISE, mode: "parser" });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("parser");
    expect(r.pack?.meta.id).toBe("lighthouse_parser_v1");
    expect(r.report.ok).toBe(true);
    // The returned pack is genuinely a parser pack (rooms, not CYOA scenes) and is
    // independently validateParser-clean — not a CYOA pack mislabelled.
    const pack = r.pack as Parameters<typeof validateParser>[0];
    expect(Array.isArray(pack.rooms)).toBe(true);
    expect(validateParser(pack).ok).toBe(true);
  });

  it("mode:rpg authors a green RPG pack behind the richest validateRpg", async () => {
    const r = await api().adapt_story({ premise: PREMISE, mode: "rpg" });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("rpg");
    expect(r.pack?.meta.id).toBe("lighthouse_rpg_v1");
    expect(r.report.ok).toBe(true);
    // Genuinely an RPG pack — carries the Stage-4 enemy layer — and validateRpg-clean.
    const pack = r.pack as Parameters<typeof validateRpg>[0];
    expect(Array.isArray(pack.enemies)).toBe(true);
    expect(pack.enemies.length).toBeGreaterThanOrEqual(1);
    expect(validateRpg(pack).ok).toBe(true);
  });

  it("each mode re-adapts the SAME story (classifications carry through every mode)", async () => {
    const modes = ["cyoa", "parser", "rpg"] as const;
    for (const mode of modes) {
      const r = await api().adapt_story({ premise: PREMISE, mode });
      expect(r.classifications.length).toBeGreaterThanOrEqual(3);
      expect(r.story.title).toBe("The Lighthouse");
    }
  });
});
