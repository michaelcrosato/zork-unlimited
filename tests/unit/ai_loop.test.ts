/**
 * The AFK loop driver's saturation-triggered ultraplan gate (docs/afk_loop.md).
 * Importing src/ai-loop.ts must NOT run a cycle — main() is entry-point guarded —
 * so we can unit-test the pure decision in isolation.
 */
import { describe, it, expect } from "vitest";
import { buildPrompt, playtestTarget, shouldRunUltraplan } from "../../src/ai-loop.js";
import type { Assessment, ImprovementCandidate, PackHealth } from "../../src/afk/assessor.js";

const mainStory = "content/rpg/pack/breaking_weir.yaml";
const playtestRecord = "ai-runs/2026-06-25T00-00-00-000Z/playtest.md";

function candidate(
  category: ImprovementCandidate["category"],
  target: string,
): ImprovementCandidate {
  return {
    id: `${category}-${target}`,
    category,
    target,
    title: `${category} candidate`,
    rationale: "test rationale",
    evidence: ["test evidence"],
    impact: 3,
    effort: category === "content_new" ? "L" : "M",
    score: 1,
  };
}

function assessment(top: ImprovementCandidate | null): Assessment {
  return {
    packsByMode: { rpg: 16 },
    packs: [],
    allGeneratorsClean: true,
    candidates: top ? [top] : [],
    top,
  };
}

function packHealth(path: string, warnings = 0): PackHealth {
  return { path, mode: "rpg", playable: true, warnings };
}

describe("shouldRunUltraplan", () => {
  it("fires only when SATURATED and the cooldown has elapsed", () => {
    expect(shouldRunUltraplan(true, 8, 8)).toBe(true); // saturated, exactly at cooldown
    expect(shouldRunUltraplan(true, 12, 8)).toBe(true); // saturated, well past cooldown
  });

  it("does NOT fire while saturated but still on cooldown", () => {
    expect(shouldRunUltraplan(true, 0, 8)).toBe(false);
    expect(shouldRunUltraplan(true, 7, 8)).toBe(false);
  });

  it("never fires when not saturated, regardless of cooldown", () => {
    expect(shouldRunUltraplan(false, 0, 8)).toBe(false);
    expect(shouldRunUltraplan(false, 9999, 8)).toBe(false);
  });

  it("a cooldown of 0 means every saturated cycle fires (no throttle)", () => {
    expect(shouldRunUltraplan(true, 0, 0)).toBe(true);
    expect(shouldRunUltraplan(false, 0, 0)).toBe(false);
  });
});

describe("playtestTarget", () => {
  it("targets the pack being fixed for content_fix work", () => {
    const top = candidate("content_fix", "content/rpg/pack/cold_forge.yaml");

    expect(playtestTarget(assessment(top), top, mainStory)).toBe(
      "content/rpg/pack/cold_forge.yaml",
    );
  });

  it("uses the main story as the pre-authoring baseline for non-content-fix work", () => {
    for (const top of [
      candidate("content_new", "rpg"),
      candidate("engine", "src/core/engine.ts"),
      candidate("repo", "tooling"),
      null,
    ]) {
      expect(playtestTarget(assessment(top), top, mainStory)).toBe(mainStory);
    }
  });
});

describe("buildPrompt blind-playtest contract", () => {
  it("content_fix cycles require a blind playtest of the target pack and named report file", () => {
    const top = candidate("content_fix", "content/rpg/pack/cold_forge.yaml");
    const prompt = buildPrompt({
      a: assessment(top),
      top,
      target: top.target,
      targetHealth: packHealth(top.target, 2),
      playtestRecord,
    });

    expect(prompt).toContain("## STEP 1 — MANDATORY LLM playtest");
    expect(prompt).toContain("Playtest target this cycle: content/rpg/pack/cold_forge.yaml");
    expect(prompt).toContain("2 validator warning(s)");
    expect(prompt).toContain(`to: ${playtestRecord}`);
    expect(prompt).toContain("This file is REQUIRED");
    expect(prompt).toContain("loop.sh refuses to commit");
  });

  it("content_new cycles author first, then blind-playtest the newly authored pack", () => {
    const top = candidate("content_new", "rpg");
    const prompt = buildPrompt({
      a: assessment(top),
      top,
      target: mainStory,
      targetHealth: packHealth(mainStory),
      playtestRecord,
    });

    expect(prompt).toContain("## STEP 1 — Author the new pack, THEN blind-playtest IT");
    expect(prompt).toContain("You are authoring a new rpg this cycle");
    expect(prompt).toContain("pointed at the PACK YOU JUST AUTHORED");
    expect(prompt).toContain("Let the blind read of YOUR new pack drive a final polish pass");
    expect(prompt).toContain(`to: ${playtestRecord}`);
    expect(prompt).toContain(`Baseline ${mainStory} need not be replayed`);
    expect(prompt).not.toContain(`Playtest target this cycle: ${mainStory}`);
  });
});
