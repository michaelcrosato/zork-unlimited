import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const prompt = readFileSync(join(ROOT, "blind-tester", "prompt-overworld.md"), "utf8");
const protocol = readFileSync(join(ROOT, "docs", "blind_playtest_protocol.md"), "utf8");
const runner = readFileSync(join(ROOT, "blind-tester", "run.sh"), "utf8");
const mockAgent = readFileSync(join(ROOT, "blind-tester", "mock-agent.mjs"), "utf8");

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function promptBullet(start: string): string {
  const startIndex = prompt.indexOf(start);
  if (startIndex < 0) throw new Error(`Missing prompt bullet: ${start}`);
  const endIndex = prompt.indexOf("\n- ", startIndex + start.length);
  if (endIndex < 0) throw new Error(`Unterminated prompt bullet: ${start}`);
  return normalizeWhitespace(prompt.slice(startIndex, endIndex));
}

function protocolParagraph(marker: string): string {
  const paragraph = protocol.split(/\r?\n\r?\n/).find((block) => block.includes(marker));
  if (!paragraph) throw new Error(`Missing protocol paragraph: ${marker}`);
  return normalizeWhitespace(paragraph);
}

describe("pure blind prompt + runner contract", () => {
  it("contains transport and game-owned exit instructions without guided coverage", () => {
    expect(prompt).toContain("fictional, deterministic TTRPG player-experience study");
    expect(prompt).toContain("PLAYER-SURFACE CONTRACT");
    expect(prompt).toContain("Use only AdventureForge gameplay actions exposed for this pure run");
    expect(prompt).toContain("`text(JSON.stringify(result));`");
    expect(prompt).toContain("A bare `text` forwards\n  nothing");
    expect(prompt).toContain("only after you have seen that response");
    expect(prompt).toContain("mcp__adventureforge__start_overworld");
    expect(prompt).toContain("first and only pre-game tool invocation");
    expect(prompt).toContain("with no arguments");
    expect(prompt).toContain(
      "do not\n  probe, substitute another tool, or attempt to discover one",
    );
    for (const forbidden of [
      "list_mcp_resources",
      "list_mcp_resource_templates",
      "read_mcp_resource",
      "ToolSearch",
    ]) {
      expect(prompt).not.toContain(forbidden);
    }
    expect(prompt).toContain("current in-game goal");
    expect(prompt).toContain("game presents its actual journey choice");
    expect(prompt).toContain("If you choose continue");
    expect(prompt).toContain("If you choose end");
    expect(prompt).toContain("mcp__adventureforge__choose_overworld_session_journey");
    expect(prompt).toContain("mcp__adventureforge__follow_overworld_session_goal");
    expect(prompt).not.toContain("advance_overworld_session_goal");
    expect(prompt).toContain("visible `id` value as the tool's `choice`");
    expect(prompt).toContain("`overworld_snapshot_hash`");
    expect(prompt).toContain("state-bearing compact embedded-quest");
    expect(prompt).toContain("current legal ids in `context.actions`");
    expect(prompt).toMatch(
      /`mcp__adventureforge__step_action`, passing\s+`session_id: current rpg_session_id`, `action_id: exact visible id`, and\s+`expected_state_hash: latest state_hash`/,
    );
    expect(prompt).toMatch(/replace\s+any older menu/);
    expect(prompt).toContain("unchanged hash reply has no context");
    expect(prompt).toContain("journey-choice pause suppresses");
    expect(prompt).toContain("mcp__adventureforge__list_legal_actions");
    expect(prompt).toContain("defaults to labeled `{ id, command }`");
    expect(prompt).toContain("`compact_actions: true`");
    expect(prompt).toContain("defaults to labeled `available_actions`");
    expect(prompt).toContain("Preserve both");
    expect(prompt).toContain("`overworld_session_id`");
    expect(prompt).toContain("`rpg_session_id`");
    expect(prompt).toContain("recoverable errors also repeat");
    expect(prompt).toContain("non-death quest ending folds back");
    expect(prompt).toContain("A death");
    expect(prompt).toContain("end-only journey choice");
    expect(prompt).toContain("truthful unfinished-goal");
    expect(prompt).toContain("Never invent a resurrection");
    expect(prompt).toContain("or request a separate technical foldback");
    expect(prompt).toContain("MCP resources, and other external\n  tools are not gameplay actions");
    expect(prompt).toContain("mcp__adventureforge__start_overworld_session_quest");
    expect(prompt).toContain("normal player");
    expect(prompt).toContain("context.quest_starts");
    expect(prompt).toContain("pass those values unchanged");
    expect(prompt).toContain("context.job_scenes");
    expect(prompt).toContain("context.job_choices");
    expect(prompt).toContain("exact `[job_id, option_id]` tuple");
    expect(prompt).toMatch(/passing\s+both values unchanged/);
    expect(prompt).toContain("mcp__adventureforge__start_world_quest");
    expect(prompt).toContain("forbidden structural tool");
    expect(prompt).toContain("Only then conduct the exit interview");
    expect(prompt).toContain("`exitReceipt`");
    expect(prompt).toContain("`run_evidence.recorded: false`");
    expect(prompt).toContain("make exactly one more call");
    expect(prompt).toContain("same `end` choice");
    expect(prompt).toContain("`retryable: false`");
    expect(prompt).toContain('"journey_exit_receipt": {}');
    expect(prompt).not.toMatch(/"journey_exit_receipt"\s*:\s*"/);

    expect(prompt).not.toMatch(/30\s*[–-]\s*45|30\s+to\s+45/i);
    expect(prompt).not.toMatch(
      /(?:stop|end|exit|finish|quit).{0,80}(?:after|at|around|within|once).{0,50}(?:\d+|ten|twenty|thirty|forty|fifty).{0,30}(?:mcp|tool)?\s*(?:calls?|invocations?|requests?|turns?)/is,
    );
    expect(prompt).not.toMatch(/(?:call|turn|request|invocation)\s*(?:budget|limit|quota)/i);
    expect(prompt).not.toMatch(/aim for roughly|take at least|if budget allows|watch for/i);
    expect(prompt).not.toMatch(/Albany|Colonie|Wolf-Winter|breaking_weir|cautious_scout/i);
    expect(prompt).not.toContain("resolve_overworld_session_road_encounter");
    expect(prompt).not.toContain("include_actions: false");
  });

  it("locks quest-only legal-action transport and exact session handles across prompt and protocol", () => {
    expect({
      promptLegalActions: promptBullet(
        "- Call `mcp__adventureforge__list_legal_actions` only while",
      ),
      protocolLegalActions: protocolParagraph("`list_legal_actions` is a child-quest tool"),
      promptSessionHandles: promptBullet("- Use only ids and choices visible"),
      protocolSessionHandles: protocolParagraph(
        "Pure mode repeats the parent `overworld_session_id`",
      ),
    }).toEqual({
      promptLegalActions:
        "- Call `mcp__adventureforge__list_legal_actions` only while an embedded quest is active and only with `session_id: exact current rpg_session_id` for that child. Never pass the parent `overworld_session_id` to this quest-only tool. Ordinary overworld legal choices are already in the current overworld response; use the corresponding overworld tools for them.",
      protocolLegalActions:
        "For an embedded quest, pure mode enforces `hide_graph = true`. State-bearing compact quest start, read, and `step_action` responses default to `compact_observation = true` and enforce `include_actions = true`, so the same response carries a bounded `context.actions` menu of current legal ids while quest play is active. An unchanged hash reply has no context, and a journey-choice pause suppresses quest actions until that choice is answered. The player replaces any older menu with the current one and guards `step_action` with `expected_state_hash = latest state_hash`. `list_legal_actions` defaults to labeled `{ id, command }` options in pure mode; `compact_actions = true` remains an explicit id-only transport option. Verbose pure observations likewise default to labeled `available_actions`. These projections expose only the same current commands a human sees; they neither select an action nor reveal authoring structure. `list_legal_actions` is a child-quest tool: the player calls it only while an embedded quest is active, with the exact current `rpg_session_id`, never the parent `overworld_session_id`. Ordinary overworld legal choices already appear in the current overworld response and use their corresponding overworld tools.",
      promptSessionHandles:
        "- Use only ids and choices visible in the current player response. Preserve both session handles: every overworld tool after the fresh start takes the parent `session_id`, while an embedded quest uses its child `rpg_session_id`. Embedded quest responses echo the parent as `overworld_session_id`; while a quest is unresolved, pure responses and recoverable errors also repeat its current `rpg_session_id`. Copy each exact current handle from the latest response; never reconstruct, shorten, or hand-type a handle or its suffix, and never substitute either handle for the other. Use the latest `state_hash` for the child and `snapshot_hash` for the parent when a tool offers those guards. Embedded quest responses can also return `overworld_snapshot_hash`; keep the latest one as the overworld guard when returning from that quest.",
      protocolSessionHandles:
        "Pure mode repeats the parent `overworld_session_id` on every successful player response. While an embedded quest is unresolved, it also repeats the current child `rpg_session_id`; the two handles are never interchangeable. Missing, mistyped, stale, or wrong-domain handles receive a structured error containing the authoritative recoverable handle(s) and the expected field. Starting again cannot mint a second fresh run, and parent gameplay mutations cannot orphan an active child. The player copies each exact current handle from the latest response and never reconstructs, shortens, or hand-types a handle or its suffix. Pure overworld reads always remain on the compact player surface; verbose observation, graph, id-catalog, and route-expansion knobs are absent.",
    });
  });

  it("locks the visible goal-passage id to its exact route-neutral transport", () => {
    expect({
      promptGoalPassage: promptBullet("- A non-null `journey.goalPassage`"),
      protocolGoalPassage: protocolParagraph(
        "A non-null `journey.goalPassage` exposes the optional player movement action",
      ),
    }).toEqual({
      promptGoalPassage:
        "- A non-null `journey.goalPassage` is a visible optional movement choice. If you choose its exact `id: follow_current_goal`, call `mcp__adventureforge__follow_overworld_session_goal` with the parent `session_id` and `expected_snapshot_hash: latest snapshot_hash`; do not invent, infer, or substitute a differently named goal tool. The game, not the harness, decides where that passage stops.",
      protocolGoalPassage:
        "A non-null `journey.goalPassage` exposes the optional player movement action `id: follow_current_goal`. If the player chooses it, the transport binding is exactly `follow_overworld_session_goal` with the parent `session_id` and latest `snapshot_hash` passed as `expected_snapshot_hash`; the player never invents, infers, or substitutes a differently named goal tool. This binding adds no route advice: the game owns the passage and stops it at the objective, a road choice, or a resource boundary.",
    });
  });

  it("keeps the deterministic selector on exact authored job tuples", () => {
    expect(mockAgent).toContain("ctx.job_choices");
    expect(mockAgent).toContain("optionId");
    expect(mockAgent).toContain("{ option_id: optionId }");
    expect(mockAgent).toContain("authoredJobIds");
  });

  it("pins live mode to pure/default and treats the 1200-second failsafe as failure only", () => {
    expect(runner).toContain('TIMEOUT="${BLIND_TIMEOUT:-1200}"');
    expect(runner).toContain('PLAY_MODE="pure"');
    expect(runner).toContain('if [[ "$PLAY_MODE" == "pure" && "$PERSONA" != "default" ]]');
    expect(runner).toContain("no exit interview or retention result is accepted");
    expect(runner).toContain("--play-mode");
    expect(runner).toContain("--run-evidence");
    expect(runner).toContain("--require-mode pure");
    expect(runner).toContain('rm -f "$PRIVATE_RUN_SIDECAR"');
    expect(runner).toContain("PURE_PUBLICATION_COMPLETE=1");
    for (const persona of ["breaker", "casual", "explorer", "lore-reader", "speedrunner"]) {
      expect(
        readFileSync(join(ROOT, "blind-tester", "personas", `${persona}.md`), "utf8"),
      ).toContain("structural mock persona only");
    }
  });
});
