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
const currentPlanRecord = "ai-runs/2026-06-25T00-00-00-000Z/current-plan.md";

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
    expect("currentPlanRecord" in metadata).toBe(false);
    expect(JSON.stringify(metadata)).not.toContain(top.title);
    expect(JSON.stringify(metadata)).not.toContain(top.rationale);
  });

  it("records the ignored per-cycle handoff only for ultraplan cycles", () => {
    const metadata = buildLatestCycleMetadata({
      runId: "2026-06-25T00-00-00-000Z",
      target: OVERWORLD_PLAYTEST_TARGET,
      playtestRecord,
      top: null,
      ultraplan: true,
      currentPlanRecord,
      agentTimeoutSeconds: 3600,
    });

    expect(metadata.currentPlanRecord).toBe(currentPlanRecord);
    expect(
      buildLatestCycleMetadata({
        runId: "2026-06-25T00-00-00-000Z",
        target: OVERWORLD_PLAYTEST_TARGET,
        playtestRecord,
        top: null,
        ultraplan: true,
        agentTimeoutSeconds: 3600,
      }).currentPlanRecord,
    ).toBe(currentPlanRecord);
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
    expect(prompt).toContain(
      "Game context: AdventureForge is a fictional, deterministic text-based TTRPG.",
    );
    expect(prompt).toContain("Start as a new player and use only the game surface");
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
    expect(prompt).toContain("loop.sh checks for this report before the final commit");
    expect(prompt).not.toContain("player-experience harness");
    expect(prompt).not.toContain("packaged DEFAULT harness");
    expect(prompt).not.toContain("WRITE/COPY the verified");
  }

  it.each([
    ["content_fix", "cold_forge"],
    ["engine", "src/core/engine.ts"],
    ["repo", "tooling"],
  ] as const)("%s evidence-only cycles launch the same clean baseline", (category, target) => {
    const top = candidate(category, target);
    const prompt = buildPrompt({
      a: assessment(top),
      top,
      playtestRecord,
    });

    expect(prompt).toContain("## STEP 1 — Capture a clean evidence-only baseline BEFORE any edit");
    expect(prompt.indexOf("Capture a clean evidence-only baseline")).toBeLessThan(
      prompt.indexOf("Make ONE uncommitted improvement"),
    );
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

  it("content_new evidence-only cycles play the clean baseline before authoring", () => {
    const top = candidate("content_new", "world");
    const prompt = buildPrompt({
      a: assessment(top),
      top,
      playtestRecord,
    });

    expect(prompt).toContain("Capture a clean evidence-only baseline BEFORE any edit");
    expect(prompt).toContain("content_new: add and register one world-graph RPG quest");
    expect(prompt.indexOf("Capture a clean evidence-only baseline")).toBeLessThan(
      prompt.indexOf("content_new: add and register"),
    );
    expectFreshOverworldContract(prompt);
  });

  it("commit-enabled cycles freeze one improvement before exact-clean pure play", () => {
    const top = candidate("content_new", "world");
    const prompt = buildPrompt({ a: assessment(top), top, playtestRecord, commitEnabled: true });

    const improve = prompt.indexOf("## STEP 1 — Make ONE improvement");
    const provisional = prompt.indexOf("PROVISIONAL commit");
    const clean = prompt.indexOf("`git status --porcelain` must be exactly empty");
    const play = prompt.indexOf("## STEP 3 — Play the provisional revision");
    const ledger = prompt.indexOf("AI_LOOP_STATE.md must be the only tracked change");
    expect(improve).toBeGreaterThanOrEqual(0);
    expect(provisional).toBeGreaterThan(improve);
    expect(clean).toBeGreaterThan(provisional);
    expect(play).toBeGreaterThan(clean);
    expect(ledger).toBeGreaterThan(play);
    expect(prompt).toContain("Never push");
    expect(prompt).toContain("If and only if that count is at least 3");
    expect(prompt).toContain("Never guess or fabricate a report count");
    expect(prompt).not.toContain("clean evidence-only baseline");
    expectFreshOverworldContract(prompt);
  });
});

describe("buildUltraplanPrompt blind-playtest contract", () => {
  it("uses an ignored sole handoff and freezes it before fresh-overworld play", () => {
    const prompt = buildUltraplanPrompt({
      playtestRecord,
      currentPlanRecord,
      commitEnabled: true,
    });

    expect(prompt).toContain("overworld from a FRESH start");
    expect(prompt).toMatch(/default\s+`npm run blind`/);
    expect(prompt).toContain("one focused AdventureForge maintenance improvement");
    expect(prompt).not.toContain("FULL authority");
    expect(prompt).toContain(
      "Do not pass `--quest`, a quest id, a persona overlay, or a saved session",
    );
    expect(prompt).toContain("only through normal overworld play");
    expect(prompt).not.toContain("world_quest_id=");
    expect(prompt).toContain(playtestRecord);
    expect(prompt).toContain(currentPlanRecord);
    expect(prompt).toContain("ONLY fresh-agent handoff");
    expect(prompt).toContain("Never edit docs/CURRENT_PLAN.md");
    expect(prompt).not.toContain("Overwrite docs/CURRENT_PLAN.md");
    expect(prompt.indexOf("PROVISIONAL")).toBeLessThan(
      prompt.indexOf("## STEP 5 — Play the exact provisional revision"),
    );
    expect(prompt).toMatch(/if and only if the count is at least 3/i);
  });

  it("plays a clean baseline first when ultraplan commits are disabled", () => {
    const prompt = buildUltraplanPrompt({ playtestRecord, currentPlanRecord });

    expect(prompt.indexOf("STEP -1")).toBeLessThan(prompt.indexOf("STEP 0"));
    expect(prompt).toContain("STOP without playing or editing");
    expect(prompt).toContain("Do not commit or push");
  });
});
