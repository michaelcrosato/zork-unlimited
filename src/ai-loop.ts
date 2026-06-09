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
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assess,
  formatAssessment,
  isSaturated,
  type Assessment,
  type ImprovementCandidate,
  type PackHealth,
} from "./afk/assessor.js";
import { createToolApi } from "./mcp/tools.js";
import { rotateLoopState } from "./afk/loop_state.js";

// ── Saturation-triggered ultraplan (docs/afk_loop.md) ──────────────────────────
// When the deterministic assessor runs dry (isSaturated), a cycle re-aims the
// project with a bounded multi-agent ultraplan instead of another routine polish
// pass — but no more than once every COOLDOWN cycles, so persistent saturation
// can't make every ~15-min cycle spend a ~12-agent ultraplan. State lives in an
// ignored ai-runs marker; the ultraplan cycle also gets a larger agent budget.
const ULTRAPLAN_COOLDOWN = Number(process.env.AI_LOOP_ULTRAPLAN_COOLDOWN ?? 8);
const ULTRAPLAN_TIMEOUT_SECONDS = Number(process.env.AI_LOOP_ULTRAPLAN_TIMEOUT_SECONDS ?? 3600);
// Authoring a brand-new pack (content_new) is L-effort: it writes a whole pack +
// validates + blind-playtests + locks tests, and was observed to hit loop.sh's
// default 2400s routine budget (twice) and get terminated mid-author, wasting the
// cycle. Give content_new cycles the SAME larger budget as ultraplan cycles via the
// existing per-cycle agentTimeoutSeconds override loop.sh already reads. Routine
// content_fix cycles keep the lean default (a one-spot prose fix never needs more).
const AUTHORING_TIMEOUT_SECONDS = Number(process.env.AI_LOOP_AUTHORING_TIMEOUT_SECONDS ?? 3600);
const SATURATION_STATE_FILE = join("ai-runs", "saturation-state.json");
const CURRENT_PLAN_DOC = "docs/CURRENT_PLAN.md";
// Append-only memory of settled questions. CURRENT_PLAN_DOC is OVERWRITTEN each
// ultraplan, so it can't remember what was already ruled out; this file is the
// reviewers' missing "already closed" boundary (re-aim #19 alone re-confirmed six
// false alarms). See docs/DECISION_LOG.md and docs/afk_loop.md.
const DECISION_LOG_DOC = "docs/DECISION_LOG.md";

/** Pure decision: should THIS cycle run an ultraplan? Saturated AND off cooldown. */
export function shouldRunUltraplan(
  saturated: boolean,
  cyclesSinceUltraplan: number,
  cooldown: number,
): boolean {
  return saturated && cyclesSinceUltraplan >= cooldown;
}

function readCyclesSinceUltraplan(): number {
  try {
    const v = JSON.parse(readFileSync(SATURATION_STATE_FILE, "utf8")).cyclesSinceUltraplan;
    return typeof v === "number" ? v : ULTRAPLAN_COOLDOWN;
  } catch {
    // No marker yet → allow an ultraplan immediately if the repo is already saturated.
    return ULTRAPLAN_COOLDOWN;
  }
}

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
  // Keep the loop log token-small: archive all but the most recent cycles before we
  // assess and hand the prompt to the agent (which reads + prepends to it each cycle).
  rotateLoopState(root);
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

  // Saturation-triggered ultraplan: re-aim with a multi-agent ultraplan only when
  // the cheap assessor has run dry AND we're off the cooldown.
  const saturated = isSaturated(a);
  const cyclesSince = readCyclesSinceUltraplan();
  const ultraplan = shouldRunUltraplan(saturated, cyclesSince, ULTRAPLAN_COOLDOWN);

  const prompt = ultraplan
    ? buildUltraplanPrompt({ a, target, targetHealth, playtestRecord })
    : buildPrompt({ a, top, target, targetHealth, playtestRecord });

  // Per-cycle agent budget: ultraplan (multi-agent re-aim) and content_new (L-effort
  // pack authoring) both need more than the lean routine default; loop.sh reads this
  // agentTimeoutSeconds override and falls back to its own default when absent.
  const agentTimeoutSeconds = ultraplan
    ? ULTRAPLAN_TIMEOUT_SECONDS
    : top?.category === "content_new"
      ? AUTHORING_TIMEOUT_SECONDS
      : null;

  // Artifacts (all under the ignored ai-runs/).
  writeFileSync(join(runDir, "assessment.md"), formatAssessment(a));
  writeFileSync(join(runDir, "assessment.json"), JSON.stringify(a, null, 2));
  writeFileSync(join(runDir, "prompt.md"), prompt);
  // Stable pointer loop.sh reads to enforce the mandatory playtest AND to pick up a
  // per-cycle agent timeout (ultraplan cycles get a larger budget).
  writeFileSync(
    join("ai-runs", "latest-cycle.json"),
    JSON.stringify(
      {
        runId: stamp,
        runDir,
        target,
        playtestRecord,
        recommendation: top?.title ?? null,
        mode: ultraplan ? "ultraplan" : "standard",
        ...(agentTimeoutSeconds !== null ? { agentTimeoutSeconds } : {}),
      },
      null,
      2,
    ),
  );
  // Advance the cooldown marker (reset to 0 on an ultraplan cycle, else count up).
  writeFileSync(
    SATURATION_STATE_FILE,
    JSON.stringify({ saturated, cyclesSinceUltraplan: ultraplan ? 0 : cyclesSince + 1 }, null, 2),
  );
  appendState(stamp, a, target, ultraplan);

  console.log(`AFK cycle ${stamp}${ultraplan ? "  [ULTRAPLAN MODE — assessor saturated]" : ""}`);
  console.log(`  assessment: ${runDir}/assessment.md`);
  console.log(`  prompt:     ${runDir}/prompt.md`);
  console.log(`  playtest record required at: ${playtestRecord}`);
  if (ultraplan) console.log(`  ⟳ saturation re-aim → ultraplan; plan → ${CURRENT_PLAN_DOC}`);
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
    ? `${targetHealth.warnings} validator warning(s)`
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
    "- FIX THE CLASS, NOT THE INSTANCE. If recent cycles (see AI_LOOP_STATE.md) keep",
    "  surfacing the SAME class of finding — e.g. the long run of 'stale reactive",
    "  description' prose fixes (a room/dialogue naming an item/state after the player",
    "  changed it) — the higher-value move is a CLASS-LEVEL check (a validator/lint rule",
    "  that catches the whole family and stops it recurring), not another one-off instance.",
    "  Prefer that structural move when your judgement says the class is worth closing.",
    "",
    "## STEP 3 — Self-critique, then verify (the bar)",
    "",
    "- SELF-CRITIQUE before you commit (Opus 4.8 is strong at catching its own mistakes —",
    "  use it). In ONE or two lines, grade your own change against clear criteria: did this",
    "  raise player-facing quality or close a real defect, or is it busywork? Is there a",
    "  higher-value structural move (a class-level check, an above-floor lever) you are",
    "  avoiding? If it is busywork, do the higher-value thing instead. Record the verdict",
    "  in the AI_LOOP_STATE.md entry.",
    "- `npm run health` must pass (it runs verify:integrity + lint + tests + validate).",
    "- Do not disable/delete tests or silently re-pin hashes to go green.",
    "- Update AI_LOOP_STATE.md with a TERSE entry (≤8 lines): what you playtested +",
    "  clarity/enjoyment, what you changed + why, the self-critique verdict, evidence, next",
    "  focus. Prose essays bloat the log and cost tokens on EVERY future cycle's read — be",
    "  compact. Default to terse: no preamble, no narration of routine tool calls.",
    "",
    "## Hard constraints",
    "- Do not commit ai-runs/, node_modules/, dist/, coverage/, saves/*.json.",
    "- Keep the game playable; prefer a small, verified change over a broad rewrite.",
    "- Token economy: read files in RANGES (offset/limit), not wholesale, and don't",
    "  re-read unchanged files. AI_LOOP_STATE.md is auto-trimmed to recent cycles — older",
    "  history lives in the gitignored AI_LOOP_STATE_ARCHIVE.md (read it only if you truly",
    "  need deep history). `npm test` uses --reporter=dot, so keep diagnostics terse.",
    "",
  ].join("\n");
}

function appendState(stamp: string, a: Assessment, target: string, ultraplan: boolean): void {
  const top = a.top;
  const text = [
    "",
    `## AFK Cycle ${stamp}${ultraplan ? " — ULTRAPLAN (saturation re-aim)" : ""}`,
    "",
    `- Assessment: packs cyoa=${a.packsByMode["cyoa"] ?? 0} parser=${a.packsByMode["parser"] ?? 0} rpg=${a.packsByMode["rpg"] ?? 0}; ${a.candidates.length} candidate(s) ranked.`,
    `- Next best improvement (recommended): ${top ? `[${top.category}] ${top.title}` : "(none — healthy)"}.`,
    top ? `- Why: ${top.rationale}` : "",
    ultraplan
      ? "- ⟳ SATURATED: top candidate at the 0.5 floor → this cycle runs a multi-agent ultraplan to re-aim (plan → docs/CURRENT_PLAN.md), then implements in a fresh context."
      : "",
    `- Mandatory LLM playtest target this cycle: ${target}.`,
    "- Process: assessor ranks → blind LLM playtest for quality → one improvement → health + verify:integrity green → commit (trust-but-verify).",
    "",
  ]
    .filter((l) => l !== "")
    .join("\n");
  appendFileSync("AI_LOOP_STATE.md", text + "\n");
}

/**
 * The ULTRAPLAN-mode prompt, emitted only when the assessor is saturated (and off
 * cooldown). It tells the cycle's agent to RE-AIM the project with a bounded
 * multi-agent ultraplan, persist the plan to the rolling doc, then implement the
 * chosen move in a FRESH context — keeping the same mandatory-playtest + green-bar
 * discipline as a standard cycle.
 */
function buildUltraplanPrompt(ctx: {
  a: Assessment;
  target: string;
  targetHealth: PackHealth | null;
  playtestRecord: string;
}): string {
  const { target, targetHealth, playtestRecord } = ctx;
  const health = targetHealth
    ? `${targetHealth.warnings} validator warning(s)`
    : "(regression baseline)";
  return [
    "# AdventureForge AFK cycle — ULTRAPLAN MODE (the assessor is saturated)",
    "",
    "The deterministic assessor has run dry: every high-value lever has disarmed and",
    "only routine 0.5-floor blind passes remain. That is the signal to RE-AIM the",
    "project with a multi-agent ultraplan rather than spend another cycle on polish.",
    "You have FULL authority over all game code (AGENTS.md); verify everything.",
    "",
    `## STEP 0 — Read the decision log FIRST (${DECISION_LOG_DOC})`,
    `- Read ${DECISION_LOG_DOC} before fanning out. It is the append-only memory of`,
    '  SETTLED questions. Every reviewer MUST treat its "Confirmed CLOSED" list as a hard',
    '  boundary: do NOT re-nominate, re-investigate, or "confirm" any gap listed there — it',
    "  is already implemented, with the file:line proof recorded. Re-deriving closed gaps is",
    "  the exact redundant fan-out this log exists to stop (re-aim #19 re-confirmed SIX such",
    "  false alarms). Put the closed list in EVERY reviewer subagent's prompt as its boundary.",
    "",
    "## STEP 1 — Run a LOCAL-ONLY ULTRAPLAN (the Workflow tool)",
    "- Use the Workflow tool to fan out a BOUNDED, LOCAL-ONLY ultraplan (≈4-6 agents total):",
    "  parallel repo reviewers (engine/determinism · content/authoring · verification ·",
    "  loop/strategy) → ONE synthesis that picks the single highest-value STRUCTURAL",
    "  next move (not content polish). Fan out ONLY here, where the review dimensions are",
    "  genuinely independent; never fan out a single tightly-coupled fix (keep that one agent).",
    "- LOCAL ONLY — do NOT use web search, web fetch, or any network/external tool. Web",
    "  tools force an interactive approval prompt that STALLS this unattended loop. Ground",
    "  the re-aim entirely in the repo itself (source, tests, validators, generated packs).",
    "- Ground it in docs/ULTRAPLAN-2026-06-02.md and docs/ROADMAP.md (the strategic",
    "  layer) and the recent AI_LOOP_STATE.md — ADVANCE them, do not restart from zero.",
    "",
    "## STEP 2 — Persist the plan (two docs: append the log, overwrite the plan)",
    `- APPEND a dated entry to ${DECISION_LOG_DOC} recording the gaps you CONFIRMED CLOSED`,
    "  this cycle (each with its file:line proof) and the one move you chose. Append only —",
    "  never edit or delete prior entries. This is what stops the NEXT re-aim re-deriving them.",
    `- Overwrite ${CURRENT_PLAN_DOC} with the synthesis + the chosen next move (tight and`,
    "  actionable: what, why, the exact files, and the acceptance check). This doc is the",
    "  loop's living plan and the ONLY hand-off into Step 3.",
    "",
    "## STEP 3 — Implement in a FRESH context",
    `- Spawn a FRESH implementation subagent (Agent tool, general-purpose) that reads ONLY`,
    `  ${CURRENT_PLAN_DOC} and the specific files it names — NOT the whole repo. It makes`,
    "  the ONE chosen change and locks it (a traces/bugs/ artifact + a tests/regression/",
    "  test for a bug; tests for new behaviour).",
    "",
    "## STEP 4 — Mandatory blind playtest + verify (same bar as every cycle)",
    `- Blind-playtest ${target} (${health}) per docs/blind_playtest_protocol.md → write its`,
    `  structured report to ${playtestRecord} (REQUIRED — loop.sh refuses to commit without it).`,
    "- `npm run health` must pass; verify:integrity must stay green; never weaken a check.",
    "- Update AI_LOOP_STATE.md TERSELY (≤8 lines): that this was an ULTRAPLAN cycle, the",
    "  re-aim it chose, evidence. Keep it compact — the log is re-read every cycle.",
    "",
    "## Hard constraints",
    "- Do not commit ai-runs/, node_modules/, dist/, coverage/, saves/*.json.",
    "- ONE focused structural change; keep the game playable and the bar green.",
    "- Token economy: ranged file reads (offset/limit), no redundant re-reads; the loop",
    "  log is auto-trimmed (deep history in the gitignored AI_LOOP_STATE_ARCHIVE.md).",
    "",
  ].join("\n");
}

// Run a cycle only as the CLI entry point (npm run ai:loop), NOT when imported —
// so tests can import shouldRunUltraplan without executing a real cycle.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
