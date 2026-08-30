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
  formatRecommendationConsoleLine,
  formatLoopStateAppend,
  playtestTargetSummary,
  playtestTarget,
  playtestTargetMetadata,
  playtestTargetWorldQuestId,
  shouldRunUltraplan,
} from "../../src/ai-loop.js";
import {
  OVERWORLD_PLAYTEST_TARGET,
  SATURATION_FLOOR,
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

function saturatedAssessment(top: ImprovementCandidate | null): Assessment {
  return {
    ...assessment(top),
    candidates: top ? [top] : [],
    top,
    allGeneratorsClean: true,
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

  it("still records the playtest slot the seal verifies when something lands in it", () => {
    // The dev cycle stopped playing, but the slot is still a real location: the
    // feedback seal verifies ai-runs/<runId>/playtest.* in full whenever a playtest
    // IS published there, so the metadata must keep naming it.
    const metadata = buildLatestCycleMetadata({
      runId: "2026-06-25T00-00-00-000Z",
      target: OVERWORLD_PLAYTEST_TARGET,
      playtestRecord,
      top: null,
      ultraplan: false,
      agentTimeoutSeconds: null,
    });

    expect(metadata.playtestRecord).toBe(playtestRecord);
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

  it("keeps automatic loop-state appends compact and free of unearned claims", () => {
    const top = {
      ...candidate("engine", "src/core/engine.ts"),
      id: "engine-runtime-cache",
      title: "Verbose title that should stay out of compact loop state",
      rationale: "Verbose rationale that should stay out of compact loop state.",
    };
    const text = formatLoopStateAppend("2026-07-04T00-00-00-000Z", assessment(top), false);

    expect(text).toContain("Rec: engine-runtime-cache (engine/M; score=1).");
    expect(text).not.toContain(top.title);
    expect(text).not.toContain(top.rationale);
    expect(text).not.toContain("Process: assessor ranks");
    // The scaffold is COMMITTED. A cycle that plays nothing must not write a per-cycle
    // playtest target or a blind-report guard into the tracked ledger — that is exactly
    // the unearned evidence claim this subsystem exists to keep out.
    expect(text).not.toContain("Playtest:");
    expect(text).not.toContain("blind report");
    expect(text).toContain("Guard: health + verify:integrity before commit.");
  });
});

/**
 * The dev cycle no longer plays the game.
 *
 * This is the regression these cases exist for, and it is not cosmetic. While the
 * prompt still ordered a blind run, a cycle that trusted the charter and skipped the
 * playtest passed every mechanical gate and was then hard-reset at the feedback seal —
 * and because only one vendor could mint the sidecar that seal demanded, a prompt that
 * says "play" is also what kept the harness vendor-locked. Experience evidence is an
 * INPUT produced asynchronously by the playtest loop (docs/two_loop_workflow.md), never
 * a condition on landing a dev cycle.
 */
function expectNoBlindPlaytestMandate(prompt: string): void {
  // The launch itself, in either prompt's phrasing.
  expect(prompt).not.toContain("npm run blind");
  expect(prompt).not.toContain("play_mode: pure");
  expect(prompt).not.toContain("start_surface: fresh_overworld");
  expect(prompt).not.toContain("Do not pass `--quest`");
  expect(prompt).not.toContain("call-count stopping rule");
  // The artifacts the runner had to publish, and the gate that bound them.
  expect(prompt).not.toContain("playtest.md");
  expect(prompt).not.toContain("playtest.run.json");
  expect(prompt).not.toContain("build/receipt sidecar");
  expect(prompt).not.toContain("report gates");
  // The step that carried the mandate, and every instruction that presumed it ran.
  expect(prompt).not.toMatch(/^## STEP -?\d+ — Play\b/mu);
  expect(prompt).not.toContain("clean evidence-only baseline");
  expect(prompt).not.toContain("pure play");
  expect(prompt).not.toContain("launch the player");
  expect(prompt).not.toContain("interview only after exit");
  expect(prompt).not.toContain("interview happens only afterward");
  expect(prompt).not.toContain("Do not edit source after play");
  expect(prompt).not.toContain("STOP without playing");
  expect(prompt).not.toContain("what you playtested");
}

/** Every `## STEP n — title` heading, in the order the prompt emits them. */
function promptSteps(prompt: string): string[] {
  return [...prompt.matchAll(/^## STEP (-?\d+) — (.+)$/gmu)].map(
    (match) => `${match[1]} — ${match[2]}`,
  );
}

/** Removing a step must renumber the rest, not leave a hole the agent has to guess at. */
function expectContiguousSteps(prompt: string, first: number): void {
  const numbers = promptSteps(prompt).map((step) => Number(step.split(" — ")[0]));
  expect(numbers.length).toBeGreaterThan(0);
  expect(numbers).toEqual(numbers.map((_value, index) => first + index));
}

describe("buildPrompt drops the blind-playtest mandate", () => {
  it.each([
    ["content_fix", "cold_forge"],
    ["engine", "src/core/engine.ts"],
    ["repo", "tooling"],
  ] as const)("%s evidence-only cycles improve without playing", (category, target) => {
    const top = candidate(category, target);
    const prompt = buildPrompt({ a: assessment(top), top });

    expect(promptSteps(prompt)).toEqual([
      "1 — Make ONE uncommitted improvement",
      "2 — Self-critique, run focused checks, and record evidence",
    ]);
    expectContiguousSteps(prompt, 1);
    expect(prompt).toContain(
      "one focused, high-impact AdventureForge maintenance improvement within this repo",
    );
    // The clean-tree requirement is NOT the playtest: loop.sh still measures an
    // evidence-only cycle against its clean starting ref, so it has to survive.
    expect(prompt).toContain("`git status --porcelain` to");
    expect(prompt).toContain("STOP without editing anything");
    expect(prompt).not.toContain("FULL authority");
    expectNoBlindPlaytestMandate(prompt);
  });

  it("keeps a quest-specific work recommendation without a launch instruction", () => {
    const top = {
      ...candidate("content_fix", "cold_forge"),
      title: 'Fix quest "cold_forge" — two validator warnings',
      rationale: "The recommended edit is deliberately quest-specific.",
    };
    const prompt = buildPrompt({ a: assessment(top), top });

    expect(prompt).toContain('Recommended: Fix quest "cold_forge"');
    expect(prompt).not.toContain("Playtest launch this cycle: cold_forge");
    expectNoBlindPlaytestMandate(prompt);
  });

  it("keeps a saturated floor pick executable without presenting strategic direction", () => {
    const top = {
      ...candidate("content_fix", "wolf_winter"),
      title: 'Maintenance rotation: review quest "wolf_winter"',
      score: SATURATION_FLOOR,
    };
    const a = saturatedAssessment(top);
    const prompt = buildPrompt({ a, top });
    const ultraplan = buildUltraplanPrompt({ a, currentPlanRecord });

    expect(formatRecommendationConsoleLine(a)).toContain("maintenance rotation only");
    expect(formatRecommendationConsoleLine(a)).toContain("no strategic recommendation");
    expect(formatRecommendationConsoleLine(a)).not.toContain("next best improvement");

    expect(prompt).toContain("maintenance rotation (deterministic; not strategic direction)");
    expect(prompt).toContain("floor candidate remains executable routine maintenance");
    expect(prompt).not.toContain("▶ Recommended:");
    expect(prompt).not.toContain("ranked next-best improvements");

    expect(ultraplan).toContain("maintenance floor, not strategic direction");
    expect(ultraplan).toContain("Do not carry this floor ordering into the ultraplan");
    expect(ultraplan).toContain("independently selects and justifies the structural re-aim");
    expect(ultraplan).not.toContain("▶ Recommended:");
    expectNoBlindPlaytestMandate(prompt);
    expectNoBlindPlaytestMandate(ultraplan);
  });

  it("the rotation's core-game opening review still orders no playtest of its own", () => {
    const top = candidate("content_fix", OVERWORLD_PLAYTEST_TARGET);
    const prompt = buildPrompt({ a: assessment(top), top });

    expectNoBlindPlaytestMandate(prompt);
  });

  it("content_new cycles author without a baseline run", () => {
    const top = candidate("content_new", "world");
    const prompt = buildPrompt({ a: assessment(top), top });

    expect(prompt).toContain("content_new: add and register one world-graph RPG quest");
    expectNoBlindPlaytestMandate(prompt);
  });

  it("commit-enabled cycles go improvement → provisional commit → ledger, with no play step", () => {
    const top = candidate("content_new", "world");
    const prompt = buildPrompt({ a: assessment(top), top, commitEnabled: true });

    expect(promptSteps(prompt)).toEqual([
      "1 — Make ONE improvement",
      "2 — Self-critique, run focused checks, and commit provisionally",
      "3 — Compile only at the real threshold, then finish the ledger",
    ]);
    expectContiguousSteps(prompt, 1);
    const improve = prompt.indexOf("## STEP 1 — Make ONE improvement");
    const provisional = prompt.indexOf("PROVISIONAL commit");
    const ledger = prompt.indexOf("AI_LOOP_STATE.md must be the only tracked change");
    expect(improve).toBeGreaterThanOrEqual(0);
    expect(provisional).toBeGreaterThan(improve);
    expect(ledger).toBeGreaterThan(provisional);
    expect(prompt).toContain("Never push");
    expect(prompt).toContain("npm run feedback:status");
    expect(prompt).toContain("only when status says ready");
    expect(prompt).toContain("Deterministic structural mocks never satisfy");
    // The compiler is not left looking starved: the prompt says whose corpus it is.
    expect(prompt).toContain("This cycle plays nothing and contributes no report of its own");
    expect(prompt).toContain("the playtest loop");
    expectNoBlindPlaytestMandate(prompt);
  });
});

describe("buildUltraplanPrompt drops the blind-playtest mandate", () => {
  it("uses an ignored sole handoff and commits provisionally without playing", () => {
    const prompt = buildUltraplanPrompt({
      a: saturatedAssessment(null),
      currentPlanRecord,
      commitEnabled: true,
    });

    expect(promptSteps(prompt)).toEqual([
      "0 — Read the decision log FIRST (docs/DECISION_LOG.md)",
      "1 — Run a LOCAL-ONLY ULTRAPLAN (the Workflow tool)",
      "2 — Persist the decision and the ignored per-cycle handoff",
      "3 — Implement in a FRESH context",
      "4 — Run focused checks and create the LOCAL provisional commit",
      "5 — Compile only at the real threshold, then finish the ledger",
    ]);
    expectContiguousSteps(prompt, 0);
    expect(prompt).toContain("one focused AdventureForge maintenance improvement");
    expect(prompt).not.toContain("FULL authority");
    expect(prompt).toContain(currentPlanRecord);
    expect(prompt).toContain("ONLY fresh-agent handoff");
    expect(prompt).toContain("Never edit docs/CURRENT_PLAN.md");
    expect(prompt).not.toContain("Overwrite docs/CURRENT_PLAN.md");
    expect(prompt).toContain("npm run feedback:status");
    expect(prompt).toContain("compile only when it reports ready");
    expect(prompt).toContain("Deterministic structural mocks never meet the threshold");
    expect(prompt).toContain("this cycle adds no report of its own");
    expectNoBlindPlaytestMandate(prompt);
  });

  it("still demands an exactly clean tree when ultraplan commits are disabled", () => {
    const prompt = buildUltraplanPrompt({ a: saturatedAssessment(null), currentPlanRecord });

    expect(prompt.indexOf("STEP -1")).toBeLessThan(prompt.indexOf("STEP 0"));
    expectContiguousSteps(prompt, -1);
    expect(prompt).toContain("`git status --porcelain` to be exactly empty");
    expect(prompt).toContain("STOP without editing");
    expect(prompt).toContain("Do not commit or push");
    expectNoBlindPlaytestMandate(prompt);
  });
});
