/**
 * Regression for root dialogue re-greet validation.
 *
 * TALK always re-enters an NPC dialogue at its root. A one-shot root topic commonly
 * retires itself with `conditions: [{ not_flag: heard_x }]` while the target node
 * sets `heard_x`. Without a root variant keyed on that flag, ending the conversation
 * and talking again can replay the first-contact root line after that topic is gone.
 */
import { describe, it, expect } from "vitest";
import { generateParserPack } from "../../src/gen/parser_generator.js";
import type { ParserPack } from "../../src/parser/schema.js";
import { validateParser } from "../../src/validate/parser_validator.js";

const oneShotHintPack = (): ParserPack => {
  const pack = structuredClone(generateParserPack(0));
  const greet = pack.npcs[0]?.dialogue.nodes.find((node) => node.id === "greet");
  const tell = pack.npcs[0]?.dialogue.nodes.find((node) => node.id === "tell");
  const hint = greet?.topics.find((topic) => topic.id === "hint");
  if (!greet || !tell || !hint) throw new Error("generated parser dialogue shape changed");

  hint.conditions = [{ not_flag: "heard_hint" }];
  tell.effects.push({ set_flag: "heard_hint" });
  return pack;
};

describe("parser validator — dialogue root re-greets", () => {
  it("warns when a one-shot root topic can leave stale root text behind", () => {
    const report = validateParser(oneShotHintPack());
    const finding = report.findings.find((f) => f.code === "DIALOGUE_ROOT_REGREET_MISSING");

    expect(report.ok).toBe(true);
    expect(finding?.severity).toBe("warning");
    expect(finding?.where).toEqual(["npc:guide", "node:greet", "topic:hint", "flag:heard_hint"]);
    expect(finding?.message).toContain("has_flag: heard_hint");
  });

  it("accepts a root variant keyed on the retired topic flag", () => {
    const pack = oneShotHintPack();
    const greet = pack.npcs[0]?.dialogue.nodes.find((node) => node.id === "greet");
    if (!greet) throw new Error("generated parser dialogue shape changed");

    greet.variants = [
      {
        when: [{ has_flag: "heard_hint" }],
        text: "You have the route now. Ask if you need the reminder, or go put it to use.",
      },
    ];

    const report = validateParser(pack);

    expect(report.ok).toBe(true);
    expect(report.findings.some((f) => f.code === "DIALOGUE_ROOT_REGREET_MISSING")).toBe(false);
  });
});
