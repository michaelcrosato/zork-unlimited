import { describe, it, expect } from "vitest";
import { instructsRetiredGateAsLive } from "../../src/afk/gate_coherence";

describe("instructsRetiredGateAsLive", () => {
  it("identifies texts that instruct the retired gate as live", () => {
    // "gated (§14)" / "gated** (§14)"
    expect(instructsRetiredGateAsLive("This is gated (§14) for human approval.")).toEqual([
      "gated (§14)",
    ]);
    expect(instructsRetiredGateAsLive("This is gated** (§14)")).toEqual(["gated** (§14)"]);
    expect(instructsRetiredGateAsLive("gated(§14)")).toEqual(["gated(§14)"]);

    // "propose only; a human reviews"
    expect(instructsRetiredGateAsLive("You must propose only; a human reviews it.")).toEqual([
      "propose only; a human reviews",
    ]);
    expect(instructsRetiredGateAsLive("propose only a human   reviews")).toEqual([
      "propose only a human   reviews",
    ]);

    // "do not silently change engine rules"
    expect(instructsRetiredGateAsLive("Remember: Do not silently change engine rules!")).toEqual([
      "Do not silently change engine rules",
    ]);

    // "proposals only (gated, §14)"
    expect(instructsRetiredGateAsLive("These are proposal only (gated, §14).")).toEqual([
      "proposal only (gated, §14)",
    ]);
    expect(instructsRetiredGateAsLive("proposals only (gated §14)")).toEqual([
      "proposals only (gated §14)",
    ]);

    // "code edits stay with the human supervisor"
    expect(
      instructsRetiredGateAsLive("Because code edits stay with the human supervisor."),
    ).toEqual(["code edits stay with the human supervisor"]);
  });

  it("ignores texts that do not instruct the retired gate as live", () => {
    // Negations
    expect(instructsRetiredGateAsLive("There is no §14 ceremony.")).toEqual([]);
    expect(instructsRetiredGateAsLive("We need no §14 ceremony here.")).toEqual([]);

    // Past-tense history
    expect(instructsRetiredGateAsLive("It went through the §14 gate.")).toEqual([]);

    // Legitimate spec references
    expect(instructsRetiredGateAsLive("See the (§14 testing strategy).")).toEqual([]);
    expect(instructsRetiredGateAsLive("The (§14 gate) is obsolete.")).toEqual([]);

    // Completely unrelated text
    expect(instructsRetiredGateAsLive("This is a completely normal string.")).toEqual([]);
    expect(instructsRetiredGateAsLive("")).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(instructsRetiredGateAsLive("GATED (§14)")).toEqual(["GATED (§14)"]);
    expect(instructsRetiredGateAsLive("PROPOSE ONLY; A HUMAN REVIEWS")).toEqual([
      "PROPOSE ONLY; A HUMAN REVIEWS",
    ]);
    expect(instructsRetiredGateAsLive("DO NOT SILENTLY CHANGE ENGINE RULES")).toEqual([
      "DO NOT SILENTLY CHANGE ENGINE RULES",
    ]);
    expect(instructsRetiredGateAsLive("PROPOSALS ONLY (GATED, §14)")).toEqual([
      "PROPOSALS ONLY (GATED, §14)",
    ]);
    expect(instructsRetiredGateAsLive("CODE EDITS STAY WITH THE HUMAN SUPERVISOR")).toEqual([
      "CODE EDITS STAY WITH THE HUMAN SUPERVISOR",
    ]);
  });

  it("can return multiple matches", () => {
    const text =
      "You must propose only; a human reviews it, because code edits stay with the human supervisor.";
    expect(instructsRetiredGateAsLive(text)).toEqual([
      "propose only; a human reviews",
      "code edits stay with the human supervisor",
    ]);
  });
});
