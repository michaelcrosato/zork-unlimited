/**
 * The AFK loop driver's saturation-triggered ultraplan gate (docs/afk_loop.md).
 * Importing src/ai-loop.ts must NOT run a cycle — main() is entry-point guarded —
 * so we can unit-test the pure decision in isolation.
 */
import { describe, it, expect } from "vitest";
import {
  buildPrompt,
  playtestTarget,
  playtestTargetWorldQuestId,
  shouldRunUltraplan,
} from "../../src/ai-loop.js";
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
      candidate("content_new", "world"),
      candidate("engine", "src/core/engine.ts"),
      candidate("repo", "tooling"),
      null,
    ]) {
      expect(playtestTarget(assessment(top), top, mainStory)).toBe(mainStory);
    }
  });
});

describe("playtestTargetWorldQuestId", () => {
  it("uses world quest ids only for shipped baseline engine/repo playtests", () => {
    expect(
      playtestTargetWorldQuestId(candidate("engine", "src/core/engine.ts"), "breaking_weir"),
    ).toBe("breaking_weir");
    expect(playtestTargetWorldQuestId(candidate("repo", "tooling"), "breaking_weir")).toBe(
      "breaking_weir",
    );
    expect(playtestTargetWorldQuestId(null, "breaking_weir")).toBe("breaking_weir");
    expect(
      playtestTargetWorldQuestId(
        candidate("content_fix", "content/rpg/pack/cold_forge.yaml"),
        "breaking_weir",
      ),
    ).toBeNull();
    expect(
      playtestTargetWorldQuestId(candidate("content_new", "world"), "breaking_weir"),
    ).toBeNull();
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

  it("engine baseline cycles prefer world quest ids over raw pack paths", () => {
    const top = candidate("engine", "src/core/engine.ts");
    const prompt = buildPrompt({
      a: assessment(top),
      top,
      target: mainStory,
      targetWorldQuestId: "breaking_weir",
      targetHealth: packHealth(mainStory),
      playtestRecord,
    });

    expect(prompt).toContain(`Playtest target this cycle: breaking_weir (${mainStory})`);
    expect(prompt).toContain("with quest_id=breaking_weir and a seed");
    expect(prompt).not.toContain("with this pack and a seed");
  });

  it("content_new cycles register a world quest first, then blind-playtest its quest id", () => {
    const top = candidate("content_new", "world");
    const prompt = buildPrompt({
      a: assessment(top),
      top,
      target: mainStory,
      targetHealth: packHealth(mainStory),
      playtestRecord,
    });

    expect(prompt).toContain("## STEP 1 — Add the new world quest, THEN blind-playtest IT");
    expect(prompt).toContain("register it in the world graph/overworld manifest");
    expect(prompt).toContain("pointed at the QUEST_ID YOU JUST REGISTERED");
    expect(prompt).toContain(
      "Let the blind read of YOUR new world quest drive a final polish pass",
    );
    expect(prompt).toContain("playtest by quest_id");
    expect(prompt).toContain(`to: ${playtestRecord}`);
    expect(prompt).toContain(`Baseline ${mainStory} need not be replayed`);
    expect(prompt).not.toContain(`Playtest target this cycle: ${mainStory}`);
  });
});
