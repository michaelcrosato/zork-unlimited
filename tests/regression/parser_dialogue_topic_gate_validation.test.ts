/**
 * Regression for the parser validator's dialogue-topic gate coverage.
 *
 * Dialogue topic `conditions` are real player-facing gates: legal_actions hides a
 * topic while its guard is false, and ASK resolution re-checks it. The validator
 * already counted those gates for inert-flag and quest-item analysis, but its two
 * core gate passes skipped them: an unsettable positive requirement was not rejected
 * and an internally contradictory topic guard was not reported as dead content.
 */
import { describe, it, expect } from "vitest";
import type { Condition } from "../../src/core/conditions.js";
import { generateParserPack } from "../../src/gen/parser_generator.js";
import type { ParserPack } from "../../src/parser/schema.js";
import { validateParser } from "../../src/validate/parser_validator.js";

const GREEN: ParserPack = generateParserPack(0);

const setGuideHintGate = (pack: ParserPack, conditions: Condition[]): void => {
  const topic = guideGreet(pack)?.topics.find((candidate) => candidate.id === "hint");
  if (!topic) throw new Error("generated parser pack has no guide/greet/hint topic");
  topic.conditions = conditions;
};

const guideGreet = (pack: ParserPack) =>
  pack.npcs[0]?.dialogue.nodes.find((node) => node.id === "greet");

describe("parser validator — dialogue topic gates", () => {
  it("the generated base pack remains a clean differential anchor", () => {
    const report = validateParser(GREEN);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });

  it("rejects a topic gate requiring a flag no effect can ever set", () => {
    const pack = structuredClone(GREEN);
    setGuideHintGate(pack, [{ has_flag: "never_set_topic_flag" }]);

    const report = validateParser(pack);
    const finding = report.findings.find((f) => f.code === "IMPOSSIBLE_GATE");

    expect(report.ok).toBe(false);
    expect(finding?.where).toEqual(["npc:guide", "node:greet", "topic:hint"]);
    expect(finding?.message).toContain("never_set_topic_flag");
  });

  it("warns on an internally contradictory topic gate", () => {
    const pack = structuredClone(GREEN);
    const greet = guideGreet(pack);
    if (!greet) throw new Error("generated parser pack has no guide/greet node");
    greet.effects.push({ set_flag: "topic_seen" });
    setGuideHintGate(pack, [{ has_flag: "topic_seen" }, { not_flag: "topic_seen" }]);

    const report = validateParser(pack);
    const finding = report.findings.find((f) => f.code === "UNSATISFIABLE_CONDITION");

    expect(report.ok).toBe(true);
    expect(finding?.severity).toBe("warning");
    expect(finding?.where).toEqual(["npc:guide", "node:greet", "topic:hint"]);
  });
});
