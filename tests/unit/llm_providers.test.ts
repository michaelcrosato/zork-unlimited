/**
 * LLM provider factory + adapters (spec §12.7).
 *
 * These tests must NEVER touch the network: `resolveProvider` is exercised with a
 * fake env, and the real adapters are driven through an injected HTTP fake. This
 * proves the §0 guarantee that CI runs with no live calls and no keys.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { Provider } from "../../agents/llm/provider.js";
import {
  resolveProvider,
  extractJson,
  OpenAIProvider,
  AnthropicProvider,
  GoogleProvider,
} from "../../agents/llm/providers.js";

// A minimal stand-in Provider — resolveProvider only ever reads `.name` here; the
// real backends are exercised separately through an injected HTTP fake below.
const mock: Provider = {
  name: "mock:test",
  completeJson: () => Promise.reject(new Error("not used in resolveProvider tests")),
};

describe("resolveProvider", () => {
  it("returns the mock when no keys are present (CI default)", () => {
    expect(resolveProvider({ mock, env: {} }).name).toBe(mock.name);
  });

  it("uses the configured backend when its key is present", () => {
    expect(resolveProvider({ mock, env: { OPENAI_API_KEY: "sk-x" } }).name).toMatch(/^openai:/);
    expect(resolveProvider({ mock, env: { ANTHROPIC_API_KEY: "sk-x" } }).name).toMatch(
      /^anthropic:/,
    );
    expect(resolveProvider({ mock, env: { GEMINI_API_KEY: "sk-x" } }).name).toMatch(/^google:/);
  });

  it("honors an explicit preference but falls back to mock when that key is missing", () => {
    expect(resolveProvider({ mock, prefer: "google", env: { OPENAI_API_KEY: "sk-x" } }).name).toBe(
      mock.name,
    );
    expect(
      resolveProvider({ mock, prefer: "openai", env: { OPENAI_API_KEY: "sk-x" } }).name,
    ).toMatch(/^openai:/);
    expect(resolveProvider({ mock, prefer: "mock", env: { OPENAI_API_KEY: "sk-x" } }).name).toBe(
      mock.name,
    );
  });

  it("prefers anthropic when multiple keys are set and none is pinned", () => {
    const p = resolveProvider({ mock, env: { OPENAI_API_KEY: "a", ANTHROPIC_API_KEY: "b" } });
    expect(p.name).toMatch(/^anthropic:/);
  });
});

describe("extractJson", () => {
  it("parses bare JSON, fenced JSON, and JSON embedded in prose", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Sure! Here:\n{"a":3, "b":"x}{"}\nDone.')).toEqual({ a: 3, b: "x}{" });
  });
  it("throws when there is no JSON", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

const Schema = z.object({ action_id: z.string() }).strict();

describe("real adapters (HTTP injected, no network)", () => {
  const req = { system: "s", user: "u", schemaName: "X", schema: Schema };

  it("OpenAI adapter shapes the request and validates the reply", async () => {
    let seenUrl = "";
    const p = new OpenAIProvider("key", "gpt-test", async (url) => {
      seenUrl = url;
      return { choices: [{ message: { content: '{"action_id":"go"}' } }] };
    });
    expect(await p.completeJson(req)).toEqual({ action_id: "go" });
    expect(seenUrl).toContain("openai.com");
  });

  it("Anthropic adapter joins content blocks", async () => {
    const p = new AnthropicProvider("key", "claude-test", async () => ({
      content: [
        { type: "text", text: '{"action_id":' },
        { type: "text", text: '"stay"}' },
      ],
    }));
    expect(await p.completeJson(req)).toEqual({ action_id: "stay" });
  });

  it("Google adapter reads candidate parts", async () => {
    const p = new GoogleProvider("key", "gem-test", async () => ({
      candidates: [{ content: { parts: [{ text: '{"action_id":"look"}' }] } }],
    }));
    expect(await p.completeJson(req)).toEqual({ action_id: "look" });
  });
});
