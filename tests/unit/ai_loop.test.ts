/**
 * The AFK loop driver's saturation-triggered ultraplan gate (docs/afk_loop.md).
 * Importing src/ai-loop.ts must NOT run a cycle — main() is entry-point guarded —
 * so we can unit-test the pure decision in isolation.
 */
import { describe, it, expect } from "vitest";
import {
  buildLatestCycleMetadata,
  buildPrompt,
  buildUltraplanPrompt,
  formatLoopStateAppend,
  playtestTargetSummary,
  playtestTarget,
  playtestTargetMetadata,
  playtestTargetWorldQuestId,
  shouldRunUltraplan,
} from "../../src/ai-loop.js";
import {
  OVERWORLD_PLAYTEST_TARGET,
  type Assessment,
  type ImprovementCandidate,
} from "../../src/afk/assessor.js";

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
    rpgQuestCount: 16,
    worldQuestCount: 16,
    quests: [],
    allGeneratorsClean: true,
    candidates: top ? [top] : [],
    top,
  };
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
  it("always launches a fresh overworld, independently of the recommendation category", () => {
    for (const top of [
      candidate("content_fix", "cold_forge"),
      candidate("content_new", "world"),
      candidate("engine", "src/core/engine.ts"),
      candidate("repo", "tooling"),
      null,
    ]) {
      expect(playtestTarget(top)).toBe(OVERWORLD_PLAYTEST_TARGET);
    }
  });

  it("targets the overworld when the rotation nominates the core-game opening review", () => {
    const top = candidate("content_fix", OVERWORLD_PLAYTEST_TARGET);

    expect(playtestTarget(top)).toBe(OVERWORLD_PLAYTEST_TARGET);
  });
});

describe("fresh-overworld target normalization", () => {
  it("never resolves a direct quest id or quest-labeled summary", () => {
    const top = candidate("content_fix", "cold_forge");

    expect(playtestTargetWorldQuestId(top, "cold_forge")).toBeNull();
    expect(playtestTargetSummary("cold_forge", "cold_forge")).toBe(OVERWORLD_PLAYTEST_TARGET);
  });
});

describe("compact AFK handoff metadata", () => {
  it("writes latest-cycle metadata with recommendation ids instead of verbose titles", () => {
    const top = {
      ...candidate("engine", "src/core/engine.ts"),
      id: "engine-runtime-cache",
      title: "Refactor the runtime cache into something with a deliberately long title",
      rationale: "Long rationale that belongs in the prompt, not latest-cycle metadata.",
    };

    const metadata = buildLatestCycleMetadata({
      runId: "2026-07-04T00-00-00-000Z",
      target: "breaking_weir",
      targetWorldQuestId: "breaking_weir",
      playtestRecord: "ai-runs/2026-07-04T00-00-00-000Z/playtest.md",
      top,
      ultraplan: false,
      agentTimeoutSeconds: null,
    });

    expect(metadata).toMatchObject({
      target: OVERWORLD_PLAYTEST_TARGET,
      recommendationId: "engine-runtime-cache",
      recommendationCategory: "engine",
    });
    expect("targetWorldQuestId" in metadata).toBe(false);
    expect("mode" in metadata).toBe(false);
    expect("runDir" in metadata).toBe(false);
    expect("recommendation" in metadata).toBe(false);
    expect(JSON.stringify(metadata)).not.toContain(top.title);
    expect(JSON.stringify(metadata)).not.toContain(top.rationale);
  });

  it("normalizes even stale quest-target callers to an overworld launch", () => {
    expect(playtestTargetMetadata("content/rpg/quests/cold_forge.yaml", "cold_forge")).toEqual({
      target: OVERWORLD_PLAYTEST_TARGET,
    });
  });

  it("keeps automatic loop-state appends compact", () => {
    const top = {
      ...candidate("engine", "src/core/engine.ts"),
      id: "engine-runtime-cache",
      title: "Verbose title that should stay out of compact loop state",
      rationale: "Verbose rationale that should stay out of compact loop state.",
    };
    const text = formatLoopStateAppend(
      "2026-07-04T00-00-00-000Z",
      assessment(top),
      "breaking_weir",
      false,
    );

    expect(text).toContain("Rec: engine-runtime-cache (engine/M; score=1).");
    expect(text).toContain("Playtest: overworld.");
    expect(text).not.toContain(top.title);
    expect(text).not.toContain(top.rationale);
    expect(text).not.toContain("Process: assessor ranks");
  });
});

describe("buildPrompt blind-playtest contract", () => {
  function expectFreshOverworldContract(prompt: string): void {
    expect(prompt).toContain("Game context: this is a fictional, deterministic text-based TTRPG.");
    expect(prompt).toContain(
      "The playtester starts as a new player and uses only the game surface",
    );
    expect(prompt).toContain("the CORE GAME — the open-world overworld from a FRESH start");
    expect(prompt).toContain("`npm run blind`");
    expect(prompt).toContain("`play_mode: pure`");
    expect(prompt).toContain("`start_surface: fresh_overworld`");
    expect(prompt).toContain(
      "Do not pass `--quest`, a quest id, a persona overlay, or a saved session",
    );
    expect(prompt).toContain("Do not add");
    expect(prompt).toContain("call-count stopping rule");
    expect(prompt).toContain("interview only after exit");
    expect(prompt).not.toContain("world_quest_id=");
    expect(prompt).not.toContain("QUEST_ID");
    expect(prompt).not.toContain("playtest by world_quest_id");
    expect(prompt).toContain(`to: ${playtestRecord}`);
    expect(prompt).toContain("This file is REQUIRED");
    expect(prompt).toContain("loop.sh refuses to commit");
  }

  it.each([
    ["content_fix", "cold_forge"],
    ["engine", "src/core/engine.ts"],
    ["repo", "tooling"],
  ] as const)("%s cycles launch the same fresh-overworld blind run", (category, target) => {
    const top = candidate(category, target);
    const prompt = buildPrompt({
      a: assessment(top),
      top,
      playtestRecord,
    });

    expect(prompt).toContain("## STEP 1 — MANDATORY fresh-overworld LLM playtest");
    expect(prompt).toContain(
      "one focused, high-impact AdventureForge maintenance improvement within this repo",
    );
    expect(prompt).not.toContain("FULL authority");
    expectFreshOverworldContract(prompt);
  });

  it("keeps a quest-specific work recommendation separate from the overworld launch", () => {
    const top = {
      ...candidate("content_fix", "cold_forge"),
      title: 'Fix quest "cold_forge" — two validator warnings',
      rationale: "The recommended edit is deliberately quest-specific.",
    };
    const prompt = buildPrompt({
      a: assessment(top),
      top,
      playtestRecord,
    });

    expect(prompt).toContain('Recommended: Fix quest "cold_forge"');
    expect(prompt).not.toContain("Playtest launch this cycle: cold_forge");
    expectFreshOverworldContract(prompt);
  });

  it("the rotation's core-game opening review gets the same overworld playtest step", () => {
    const top = candidate("content_fix", OVERWORLD_PLAYTEST_TARGET);
    const prompt = buildPrompt({
      a: assessment(top),
      top,
      playtestRecord,
    });

    expectFreshOverworldContract(prompt);
  });

  it("content_new registers first, then tests natural discovery from a fresh overworld", () => {
    const top = candidate("content_new", "world");
    const prompt = buildPrompt({
      a: assessment(top),
      top,
      playtestRecord,
    });

    expect(prompt).toContain(
      "## STEP 1 — Add the new world quest, THEN blind-playtest from a FRESH overworld",
    );
    expect(prompt).toContain(
      "Author the RPG quest and register it in the overworld quest registry",
    );
    expect(prompt).toContain("do not tell the blind player which quest was added or where it is");
    expect(prompt).toContain("test whether the new content is naturally discoverable");
    expectFreshOverworldContract(prompt);
  });
});

describe("buildUltraplanPrompt blind-playtest contract", () => {
  it("launches only a fresh overworld and carries no targeted quest invocation", () => {
    const prompt = buildUltraplanPrompt({ playtestRecord });

    expect(prompt).toContain("overworld from a FRESH start");
    expect(prompt).toContain("default `npm run blind`");
    expect(prompt).toContain("one focused AdventureForge maintenance improvement");
    expect(prompt).not.toContain("FULL authority");
    expect(prompt).toContain(
      "Do not pass `--quest`, a quest id, a persona overlay, or a saved session",
    );
    expect(prompt).toContain("only through normal overworld play");
    expect(prompt).not.toContain("world_quest_id=");
    expect(prompt).toContain(playtestRecord);
    expect(prompt).toContain("loop.sh refuses to commit");
  });
});
