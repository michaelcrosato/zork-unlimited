import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error — plain .mjs module without type declarations
import { renderRecords, resolveProvider } from "../../blind-tester/resolve-provider.mjs";
import {
  findPlaytestProvider,
  parsePlaytestCatalog,
  PLAYTEST_PROVIDERS,
} from "../../src/blind/providers.js";

const REPO_ROOT = join(__dirname, "..", "..");

/**
 * The operator asked for one exact default per vendor lane, so a launch with no
 * --model resolves to a deliberate choice instead of the volume-first
 * heuristic: codex plays gpt-5.6-luna at max effort, claude_code plays
 * claude-sonnet-5 at medium, grok_cli pins grok-4.6 at low (the instant-thinking
 * wave setting), and gemini_cli names its newest CLI-known flash slug.
 */
describe("blind provider catalog defaults", () => {
  it.each([
    ["codex", "gpt-5.6-luna", "max"],
    ["claude_code", "claude-sonnet-5", "medium"],
    ["grok_cli", "grok-4.6", "low"],
    ["gemini_cli", "gemini-3.5-flash", undefined],
  ])("resolves %s with no model to %s", (providerId, expectedModel, expectedEffort) => {
    const resolved = resolveProvider(providerId, undefined);
    expect(resolved.model).toBe(expectedModel);
    expect(resolved.modelDefault).toBe(true);
    expect(resolved.modelSettings.reasoning_effort).toBe(expectedEffort);
  });

  it("keeps an explicit model request authoritative over the default", () => {
    const resolved = resolveProvider("codex", "gpt-5.3-codex-spark");
    expect(resolved.model).toBe("gpt-5.3-codex-spark");
    expect(resolved.modelDefault).toBe(false);
    expect(resolved.modelSettings.reasoning_effort).toBe("xhigh");
  });

  it("renders the enforced effort knob and default marker as shell records", () => {
    const records = renderRecords(resolveProvider("codex", undefined));
    expect(records).toContain("model\tgpt-5.6-luna\n");
    expect(records).toContain("model_default\t1\n");
    expect(records).toContain("model_reasoning_effort\tmax\n");
    const geminiRecords = renderRecords(resolveProvider("gemini_cli", undefined));
    expect(geminiRecords).not.toContain("model_reasoning_effort");
  });

  it("parses every shipped catalog with at most one typed default", () => {
    for (const provider of PLAYTEST_PROVIDERS) {
      const raw = JSON.parse(readFileSync(join(REPO_ROOT, provider.catalogPath), "utf8"));
      const catalog = parsePlaytestCatalog(provider, raw);
      const defaults = catalog.models.filter((model) => model.default === true);
      expect(defaults.length).toBeLessThanOrEqual(1);
    }
  });

  it("refuses a catalog that marks two models as default", () => {
    const provider = findPlaytestProvider("codex");
    if (!provider) throw new Error("codex provider missing from registry");
    const raw = JSON.parse(readFileSync(join(REPO_ROOT, provider.catalogPath), "utf8")) as {
      models: Array<{ default?: boolean }>;
    };
    for (const model of raw.models) model.default = true;
    expect(() => parsePlaytestCatalog(provider, raw)).toThrow(/at most one is allowed/u);
  });
});
