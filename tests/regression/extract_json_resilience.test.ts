/**
 * bug_0238 — `extractJson` resilience to off-shape live-model replies.
 *
 * `extractJson` (agents/llm/providers.ts) is the single funnel every real backend
 * (OpenAI/Anthropic/Google) runs its reply through before the Zod schema sees it,
 * so it sits directly on the keyed-real-model-run path ([[ultraplan-true-goal-pivot]]).
 * The bug_0236/0237 catch-blocks now TOLERATE a thrown completion — but tolerating
 * means "fail this round and revise," so a brittle extractor makes a keyed run burn
 * rounds (or never converge) on replies that plainly contain valid JSON.
 *
 * Two such replies a frontier model routinely emits crashed the OLD extractor:
 *   (1) reasoning in one ``` fence and the JSON answer in a SECOND fence — the old
 *       `text.match(/```…/)` grabbed only the FIRST fence (the reasoning) and threw
 *       "No JSON found" though the answer was right there;
 *   (2) a stray `[`/`{` in a prose preamble before the object — the old scan
 *       committed to the first bracket and let `JSON.parse` throw.
 *
 * Each case below FAILS against the pre-fix extractor and PASSES against the fix.
 * The "strict superset" cases pin that every reply the old extractor parsed still
 * parses to the same value (no regression).
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { extractJson, AnthropicProvider } from "../../agents/llm/providers.js";

describe("bug_0238 — extractJson tolerates off-shape live-model replies", () => {
  it("finds the JSON when reasoning sits in an EARLIER code fence (old: grabbed only the first fence)", () => {
    const reply =
      "Let me work through it.\n" +
      "```\nstep 1: examine the desk\nstep 2: open the safe\n```\n" +
      "Final answer:\n" +
      '```json\n{"action_id":"open_safe"}\n```';
    expect(extractJson(reply)).toEqual({ action_id: "open_safe" });
  });

  it("finds the JSON when it is UNFENCED after a non-JSON fence (old: operated on the fence body, found no bracket)", () => {
    const reply = '```\nthinking out loud, no json in here\n```\n\n{"choice":"go_in"}';
    expect(extractJson(reply)).toEqual({ choice: "go_in" });
  });

  it("skips a stray bracket region in the prose preamble and parses the real object (old: committed to '[' and threw)", () => {
    const reply = 'Note [see schema X] — here is the result:\n{"action_id":"read_book"}';
    expect(extractJson(reply)).toEqual({ action_id: "read_book" });
  });

  it("skips a stray BRACE region in the preamble too", () => {
    const reply = 'I considered {alpha, beta} and chose this:\n{"pick":2}';
    expect(extractJson(reply)).toEqual({ pick: 2 });
  });

  it("STRICT SUPERSET: every old-extractor success still parses to the same value", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    // a brace/bracket *inside a JSON string* must not miscount depth
    expect(extractJson('Sure! Here:\n{"a":3, "b":"x}{"}\nDone.')).toEqual({ a: 3, b: "x}{" });
    // a nested array inside the object stays intact
    expect(extractJson('prefix {"xs":[1,2,3],"k":"v"} suffix')).toEqual({ xs: [1, 2, 3], k: "v" });
  });

  it("still throws — with an attributable message — when there is genuinely no JSON", () => {
    expect(() => extractJson("no json here at all")).toThrow(/no parseable json/i);
    expect(() => extractJson("```\nstill no json\n```")).toThrow(/no parseable json/i);
  });

  it("flows through a real adapter: a reasoning-fence + answer-fence reply validates against the schema", async () => {
    const Schema = z.object({ action_id: z.string() }).strict();
    const p = new AnthropicProvider("key", "claude-test", async () => ({
      content: [
        { type: "text", text: "```\nlet me think: I should open the safe\n```\n" },
        { type: "text", text: '```json\n{"action_id":"open_safe"}\n```' },
      ],
    }));
    expect(
      await p.completeJson({ system: "s", user: "u", schemaName: "X", schema: Schema }),
    ).toEqual({ action_id: "open_safe" });
  });
});
