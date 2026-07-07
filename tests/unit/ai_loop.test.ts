/**
 * The AFK loop driver's saturation-triggered ultraplan gate (docs/afk_loop.md).
 * Importing src/ai-loop.ts must NOT run a cycle — main() is entry-point guarded —
 * so we can unit-test the pure decision in isolation.
 */
import { describe, it, expect } from "vitest";
import {
  buildLatestCycleMetadata,
  buildPrompt,
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
  type QuestHealth,
} from "../../src/afk/assessor.js";

const mainWorldQuestId = "breaking_weir";
const mainQuestPath = "content/rpg/quests/breaking_weir.yaml";
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

function questHealth(worldQuestId: string, warnings = 0): QuestHealth {
  return {
    world_quest_id: worldQuestId.replace(/^content\/rpg\/quests\//, "").replace(/\.ya?ml$/, ""),
    playable: true,
    warnings,
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
  it("targets the quest being fixed for content_fix work", () => {
    const top = candidate("content_fix", "cold_forge");

    expect(playtestTarget(top)).toBe("cold_forge");
  });

  it("uses the CORE GAME (overworld fresh start) as the baseline for non-content-fix work", () => {
    // Engine/repo changes affect the whole game, so the regression baseline is the
    // core game itself — the same surface the default `npm run blind` plays — not a
    // replay of one fixed quest (the legacy story-era baseline).
    for (const top of [
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

describe("playtestTargetWorldQuestId", () => {
  it("uses world quest ids for shipped blind playtests", () => {
    expect(
      playtestTargetWorldQuestId(
        candidate("content_fix", "content/rpg/quests/cold_forge.yaml"),
        "cold_forge",
      ),
    ).toBe("cold_forge");
    expect(
      playtestTargetWorldQuestId(
        candidate("content_fix", "content/rpg/quests/unbound.yaml"),
        "content/rpg/quests/unbound.yaml",
      ),
    ).toBeNull();
  });

  it("resolves NO quest id for core-game (overworld) and pre-authoring baselines", () => {
    // Engine/repo/none → the overworld core game; content_new → the quest authored
    // this cycle. Neither maps to a pre-existing world quest id.
    expect(playtestTargetWorldQuestId(candidate("engine", "src/core/engine.ts"), null)).toBeNull();
    expect(playtestTargetWorldQuestId(candidate("repo", "tooling"), null)).toBeNull();
    expect(playtestTargetWorldQuestId(null, null)).toBeNull();
    expect(playtestTargetWorldQuestId(candidate("content_new", "world"), null)).toBeNull();
    expect(
      playtestTargetWorldQuestId(
        candidate("content_fix", OVERWORLD_PLAYTEST_TARGET),
        OVERWORLD_PLAYTEST_TARGET,
      ),
    ).toBeNull();
  });
});

describe("playtestTargetSummary", () => {
  it("keeps quest ids primary without echoing edit paths for content fixes", () => {
    expect(playtestTargetSummary("cold_forge", "cold_forge")).toBe("cold_forge");
    expect(playtestTargetSummary("content/rpg/quests/cold_forge.yaml", "cold_forge")).toBe(
      "cold_forge",
    );
    expect(playtestTargetSummary(mainWorldQuestId, "breaking_weir")).toBe("breaking_weir");
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
      target: "breaking_weir",
      targetWorldQuestId: "breaking_weir",
      recommendationId: "engine-runtime-cache",
      recommendationCategory: "engine",
    });
    expect("mode" in metadata).toBe(false);
    expect("runDir" in metadata).toBe(false);
    expect("recommendation" in metadata).toBe(false);
    expect(JSON.stringify(metadata)).not.toContain(top.title);
    expect(JSON.stringify(metadata)).not.toContain(top.rationale);
  });

  it("keeps playtest target metadata quest-id based", () => {
    expect(playtestTargetMetadata("content/rpg/quests/cold_forge.yaml", "cold_forge")).toEqual({
      target: "cold_forge",
      targetWorldQuestId: "cold_forge",
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
      "breaking_weir",
      false,
    );

    expect(text).toContain("Rec: engine-runtime-cache (engine/M; score=1).");
    expect(text).toContain("Playtest: breaking_weir.");
    expect(text).not.toContain(top.title);
    expect(text).not.toContain(top.rationale);
    expect(text).not.toContain("Process: assessor ranks");
  });
});

describe("buildPrompt blind-playtest contract", () => {
  it("content_fix cycles require a blind playtest of the target quest id and named report file", () => {
    const top = candidate("content_fix", "cold_forge");
    const prompt = buildPrompt({
      a: assessment(top),
      top,
      target: top.target,
      targetWorldQuestId: "cold_forge",
      targetHealth: questHealth("content/rpg/quests/cold_forge.yaml", 2),
      playtestRecord,
    });

    expect(prompt).toContain("## STEP 1 — MANDATORY LLM playtest");
    expect(prompt).toContain("Playtest target this cycle: cold_forge (2 validator warning(s))");
    expect(prompt).not.toContain("content/rpg/quests/cold_forge.yaml");
    expect(prompt).toContain("with world_quest_id=cold_forge and a seed");
    expect(prompt).not.toContain("with this pack and a seed");
    expect(prompt).toContain("2 validator warning(s)");
    expect(prompt).toContain(`to: ${playtestRecord}`);
    expect(prompt).toContain("This file is REQUIRED");
    expect(prompt).toContain("loop.sh refuses to commit");
  });

  it("engine baseline cycles blind-playtest the CORE GAME via the default harness", () => {
    const top = candidate("engine", "src/core/engine.ts");
    const prompt = buildPrompt({
      a: assessment(top),
      top,
      target: OVERWORLD_PLAYTEST_TARGET,
      targetWorldQuestId: null,
      targetHealth: null,
      playtestRecord,
    });

    expect(prompt).toContain("## STEP 1 — MANDATORY LLM playtest");
    expect(prompt).toContain("the CORE GAME — the open-world overworld");
    expect(prompt).toContain("npm run blind");
    expect(prompt).not.toContain("world_quest_id=");
    expect(prompt).toContain(`to: ${playtestRecord}`);
    expect(prompt).toContain("loop.sh refuses to commit");
  });

  it("the rotation's core-game opening review gets the same overworld playtest step", () => {
    const top = candidate("content_fix", OVERWORLD_PLAYTEST_TARGET);
    const prompt = buildPrompt({
      a: assessment(top),
      top,
      target: OVERWORLD_PLAYTEST_TARGET,
      targetWorldQuestId: null,
      targetHealth: null,
      playtestRecord,
    });

    expect(prompt).toContain("the CORE GAME — the open-world overworld");
    expect(prompt).toContain("npm run blind");
    expect(prompt).not.toContain("world_quest_id=");
  });

  it("refuses shipped blind-playtest prompts without a quest id", () => {
    const top = candidate("content_fix", "cold_forge");

    expect(() =>
      buildPrompt({
        a: assessment(top),
        top,
        target: top.target,
        targetHealth: questHealth(top.target, 2),
        playtestRecord,
      }),
    ).toThrow(/require a world quest id/);
  });

  it("content_new cycles register a world quest first, then blind-playtest its quest id", () => {
    const top = candidate("content_new", "world");
    const prompt = buildPrompt({
      a: assessment(top),
      top,
      target: OVERWORLD_PLAYTEST_TARGET,
      targetHealth: null,
      playtestRecord,
    });

    expect(prompt).toContain("## STEP 1 — Add the new world quest, THEN blind-playtest IT");
    expect(prompt).toContain("Author/register the RPG quest in the world graph/overworld manifest");
    expect(prompt).toContain("pointed at the QUEST_ID YOU JUST REGISTERED");
    expect(prompt).toContain(
      "Let the blind read of YOUR new world quest drive a final polish pass",
    );
    expect(prompt).toContain("playtest by world_quest_id");
    expect(prompt).toContain(`to: ${playtestRecord}`);
    expect(prompt).not.toContain(`Playtest target this cycle: ${mainQuestPath}`);
  });
});
