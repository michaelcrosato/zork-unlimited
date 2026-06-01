/**
 * AdventureForge AFK loop driver (trust-but-verify).
 *
 * One cycle of the autonomous improvement loop. This driver is deterministic
 * tooling (not the engine): it
 *   1. ASSESSES the whole project (src/afk/assessor.ts) to rank the next-best
 *      improvement across content_new / content_fix / engine / repo;
 *   2. picks a target pack to playtest (the candidate's pack, or the main story as
 *      a regression baseline for engine/repo work);
 *   3. writes the cycle artifacts to an ignored ai-runs/<id>/ dir, including the
 *      exact path where the operating agent must drop its MANDATORY LLM playtest
 *      report; and
 *   4. emits a cycle prompt that requires the agent to run a blind LLM playtest,
 *      make ONE focused improvement, and keep `npm run health` (incl. the
 *      verifier-integrity guard) green.
 *
 * The driver does the deterministic *evaluation*; the per-cycle *quality* signal
 * comes from the agent's blind LLM playtest (docs/afk_loop.md, docs/blind_playtest_protocol.md).
 * loop.sh enforces the playtest as mandatory (it refuses to commit a cycle that
 * produced no playtest record) and runs health + the integrity drift gate before
 * committing. See docs/afk_loop.md for the whole picture.
 */
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import {
  assess,
  formatAssessment,
  type Assessment,
  type ImprovementCandidate,
  type PackHealth,
} from "./afk/assessor.js";
import { createToolApi } from "./mcp/tools.js";

function cycleStamp(): string {
  // Tooling (not the engine), so a wall-clock id is fine here.
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Which pack the mandatory playtest targets this cycle. */
function playtestTarget(
  a: Assessment,
  top: ImprovementCandidate | null,
  mainStory: string,
): string {
  if (top && top.category === "content_fix") return top.target; // the pack to improve
  // content_new (a mode) / engine / repo: playtest the main story as a regression baseline.
  return mainStory;
}

function main(): void {
  const root = process.cwd();
  const stamp = cycleStamp();
  const runDir = join("ai-runs", stamp);
  mkdirSync(runDir, { recursive: true });

  const a = assess(root);
  const top = a.top;
  const mainStory =
    createToolApi({ root }).list_stories().main_story ?? "content/cyoa/pack/watchtower_road.yaml";
  const target = playtestTarget(a, top, mainStory);
  const playtestRecord = join(runDir, "playtest.md").replaceAll("\\", "/");

  const targetHealth = a.packs.find((p) => p.path === target) ?? null;
  const prompt = buildPrompt({ a, top, target, targetHealth, playtestRecord });

  // Artifacts (all under the ignored ai-runs/).
  writeFileSync(join(runDir, "assessment.md"), formatAssessment(a));
  writeFileSync(join(runDir, "assessment.json"), JSON.stringify(a, null, 2));
  writeFileSync(join(runDir, "prompt.md"), prompt);
  // Stable pointer loop.sh reads to enforce the mandatory playtest.
  writeFileSync(
    join("ai-runs", "latest-cycle.json"),
    JSON.stringify(
      { runId: stamp, runDir, target, playtestRecord, recommendation: top?.title ?? null },
      null,
      2,
    ),
  );
  appendState(stamp, a, target);

  console.log(`AFK cycle ${stamp}`);
  console.log(`  assessment: ${runDir}/assessment.md`);
  console.log(`  prompt:     ${runDir}/prompt.md`);
  console.log(`  playtest record required at: ${playtestRecord}`);
  console.log(`  ▶ next best improvement: ${top?.title ?? "(none — game is healthy)"}`);
}

function buildPrompt(ctx: {
  a: Assessment;
  top: ImprovementCandidate | null;
  target: string;
  targetHealth: PackHealth | null;
  playtestRecord: string;
}): string {
  const { a, top, target, targetHealth, playtestRecord } = ctx;
  const ranked = a.candidates
    .slice(0, 6)
    .map((c, i) => `  ${i + 1}. [${c.score}] (${c.category}/${c.effort}) ${c.title}`);
  const health = targetHealth
    ? `endings ${targetHealth.endingsReached}/${targetHealth.endingsDeclared}, unvisited ${targetHealth.unvisited.length}${targetHealth.unvisited.length ? ` (${targetHealth.unvisited.slice(0, 8).join(", ")})` : ""}, ${targetHealth.warnings} warning(s)`
    : "(not a pack — engine/repo work; the target pack is the regression baseline)";

  return [
    "# AdventureForge AFK improvement cycle (trust, but verify)",
    "",
    "You operate inside this repo with FULL authority over all game code (AGENTS.md).",
    "Make exactly ONE focused, high-impact improvement this cycle and leave the repo",
    "green. You have broad world knowledge — use it to choose and craft the best",
    "improvement, but verify everything (don't route around the verifier).",
    "",
    "## The assessor's ranked next-best improvements (deterministic)",
    ...ranked,
    "",
    `▶ Recommended: ${top ? `${top.title}` : "(none)"}`,
    top ? `   why: ${top.rationale}` : "",
    top ? `   evidence: ${top.evidence.join("; ")}` : "",
    "",
    "You MAY pick a different candidate (or something off-list) if your judgement and",
    "the playtest below say it's higher value — but justify it in AI_LOOP_STATE.md.",
    "",
    "## STEP 1 — MANDATORY LLM playtest (quality feedback, every cycle)",
    "",
    `Playtest target this cycle: ${target}  (${health})`,
    "",
    "- Spawn a FRESH subagent with NO design context (Agent tool general-purpose, or a",
    "  clean `claude -p` / `codex exec`). Hand it ONLY the locked-down prompt in",
    "  docs/blind_playtest_protocol.md, with this pack and a seed. It must play purely",
    "  through the mcp__adventureforge__* tools and must NOT read content/, src/, ui/, tests/.",
    `- WRITE its structured report (route, mechanics, clarity 1-5, enjoyment 1-5,`,
    `  confusion, concrete findings, verdict) to: ${playtestRecord}`,
    "  This file is REQUIRED — loop.sh refuses to commit a cycle with no playtest record.",
    "- Let the playtest's findings inform the improvement you choose.",
    "",
    "## STEP 2 — Make ONE improvement",
    "",
    "- content_fix / content_new: edit the pack (or apply_content_patch); re-validate.",
    "- engine / repo: change freely under trust-but-verify. New mechanics no longer need",
    "  a §14 ceremony, but keep the verification green and add tests for new behavior.",
    "- If you fix a bug, add a traces/bugs/ artifact + a tests/regression/ test (§15).",
    "- A content edit that changes a pinned hash must re-pin it deliberately",
    "  (tests/unit/rpg_validator.test.ts, traces/bugs/*.yaml) — that is allowed, but it is",
    "  surfaced; never weaken a check to pass.",
    "",
    "## STEP 3 — Verify (the bar)",
    "",
    "- `npm run health` must pass (it runs verify:integrity + lint + tests + validate + playtest).",
    "- Do not disable/delete tests or silently re-pin hashes to go green.",
    "- Update AI_LOOP_STATE.md with: what you playtested + its clarity/enjoyment scores,",
    "  what you improved and why, evidence, and the next suggested focus.",
    "",
    "## Hard constraints",
    "- Do not commit ai-runs/, node_modules/, dist/, coverage/, saves/*.json.",
    "- Keep the game playable; prefer a small, verified change over a broad rewrite.",
    "",
  ].join("\n");
}

function appendState(stamp: string, a: Assessment, target: string): void {
  const top = a.top;
  const text = [
    "",
    `## AFK Cycle ${stamp}`,
    "",
    `- Assessment: packs cyoa=${a.packsByMode["cyoa"] ?? 0} parser=${a.packsByMode["parser"] ?? 0} rpg=${a.packsByMode["rpg"] ?? 0}; ${a.candidates.length} candidate(s) ranked.`,
    `- Next best improvement (recommended): ${top ? `[${top.category}] ${top.title}` : "(none — healthy)"}.`,
    top ? `- Why: ${top.rationale}` : "",
    `- Mandatory LLM playtest target this cycle: ${target}.`,
    "- Process: assessor ranks → blind LLM playtest for quality → one improvement → health + verify:integrity green → commit (trust-but-verify).",
    "",
  ]
    .filter((l) => l !== "")
    .join("\n");
  appendFileSync("AI_LOOP_STATE.md", text + "\n");
}

main();
