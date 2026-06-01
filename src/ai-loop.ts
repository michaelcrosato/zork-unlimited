import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };
type Observation = {
  scene_id: string;
  text: string;
  state: { flags: string[]; inventory: string[]; journal: string[] };
  available_actions: { id: string; text: string }[];
  ended: boolean;
  ending_id: string | null;
};

const TRUE_ROUTE = [
  "inspect_ground",
  "go_east",
  "approach_base",
  "search_rubble",
  "take_lantern",
  "take_letter",
  "leave_cart",
  "leave_base",
  "circle_cellar",
  "light_lantern",
  "descend_cellar",
  "search_cache",
  "take_ledger",
  "leave_cache",
  "climb_out",
  "cellar_back",
  "return_crossroads",
  "go_west",
  "follow_to_camp",
  "talk_hermit",
  "show_letter",
  "back_from_letter_talk",
  "say_goodbye",
  "leave_camp",
  "ford_brook",
  "cross_north",
  "approach_checkpoint",
  "show_papers",
  "reveal_evidence",
  "expose_the_plot",
];

async function main(): Promise<void> {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join("ai-runs", runId);
  mkdirSync(runDir, { recursive: true });

  const transport = new StdioClientTransport({ command: "npm", args: ["--silent", "run", "mcp"] });
  const client = new Client({ name: "adventureforge-afk-loop", version: "0.1.0" });
  await client.connect(transport);
  try {
    const stories = await call(client, "list_stories", {});
    const storyPath = stories.main_story ?? "content/cyoa/pack/watchtower_road.yaml";
    const validation = await call(client, "validate_story", { story_path: storyPath });
    if (!validation.ok) throw new Error(`Story validation failed for ${storyPath}`);

    const random = await call(client, "run_playtest", { story_path: storyPath, strategy: "random", runs: 100 });
    const coverage = await call(client, "run_playtest", { story_path: storyPath, strategy: "coverage", runs: 100 });
    const trueEnding = await playRoute(client, storyPath, 101, TRUE_ROUTE);
    if (!trueEnding.observation.ended || trueEnding.observation.ending_id !== "ending_truth") {
      throw new Error(`True-ending route failed: reached ${trueEnding.observation.ending_id ?? trueEnding.observation.scene_id}`);
    }
    const exploratory = await playExploratory(client, storyPath, 202, coverage.unvisited_scenes ?? []);

    const evidence = { stories, validation, random, coverage, trueEnding, exploratory };
    writeFileSync(join(runDir, "mcp-evidence.json"), JSON.stringify(evidence, null, 2));
    writeFileSync(join(runDir, "agent-prompt.md"), buildAgentPrompt(storyPath, random, coverage, trueEnding, exploratory));
    appendState(runId, storyPath, random, coverage, trueEnding, exploratory);

    console.log(`AFK evidence written to ${runDir}/mcp-evidence.json`);
    console.log(`Agent prompt written to ${runDir}/agent-prompt.md`);
    console.log(`Next task: ${nextTask(random, coverage)}`);
  } finally {
    await client.close();
  }
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<any> {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  if (result.isError) throw new Error(result.content[0]?.text ?? `${name} failed`);
  return JSON.parse(result.content[0]!.text);
}

async function playRoute(client: Client, storyPath: string, seed: number, route: string[]) {
  const start = await call(client, "start_game", { story_path: storyPath, seed });
  const sessionId = start.session_id as string;
  let observation = start.observation as Observation;
  for (const optionId of route) {
    const visible = observation.available_actions.map((a) => a.id);
    if (!visible.includes(optionId)) throw new Error(`Route wanted ${optionId}, but visible options were ${visible.join(", ")}`);
    const next = await call(client, "choose_option", { session_id: sessionId, option_id: optionId });
    observation = next.observation as Observation;
    if (observation.ended) break;
  }
  return { session_id: sessionId, observation, transcript: await call(client, "get_transcript", { session_id: sessionId }) };
}

async function playExploratory(client: Client, storyPath: string, seed: number, unvisitedScenes: string[]) {
  const start = await call(client, "start_game", { story_path: storyPath, seed });
  const sessionId = start.session_id as string;
  let observation = start.observation as Observation;
  const tried = new Set<string>();
  for (let i = 0; i < 14 && !observation.ended; i++) {
    const option = chooseExploratory(observation, tried, unvisitedScenes);
    tried.add(option.id);
    const next = await call(client, "choose_option", { session_id: sessionId, option_id: option.id });
    observation = next.observation as Observation;
  }
  return { session_id: sessionId, observation, transcript: await call(client, "get_transcript", { session_id: sessionId }) };
}

function chooseExploratory(observation: Observation, tried: Set<string>, unvisitedScenes: string[]) {
  const actions = observation.available_actions;
  const risky = actions.find((a) => /force|slip away|retreat|back|turn back|hesitate/i.test(a.text) && !tried.has(a.id));
  if (risky) return risky;
  const investigative = actions.find((a) => /inspect|search|read|ask|show|examine|talk/i.test(a.text) && !tried.has(a.id));
  if (investigative) return investigative;
  const target = actions.find((a) => unvisitedScenes.some((scene) => a.id.includes(scene) || a.text.includes(scene)));
  return target ?? actions.find((a) => !tried.has(a.id)) ?? actions[0]!;
}

function appendState(runId: string, storyPath: string, random: any, coverage: any, trueEnding: any, exploratory: any): void {
  const text = [
    "",
    `## AFK Cycle ${runId}`,
    "",
    `- Current objective: Keep AdventureForge ready for MCP-driven AFK improvement loops on ${storyPath}.`,
    `- Last completed improvement: Generated MCP evidence through list_stories, validate_story, random/coverage run_playtest, true-ending regression, and exploratory play.`,
    `- Evidence summary: random ended ${random.ended}/${random.runs}; coverage ended ${coverage.ended}/${coverage.runs}; coverage unvisited scenes ${coverage.unvisited_scenes.join(", ") || "(none)"}.`,
    `- MCP playtest notes: true route ended at ${trueEnding.observation.ending_id}; exploratory ended at ${exploratory.observation.ending_id ?? exploratory.observation.scene_id}.`,
    `- What improved: The loop now records compact JSON evidence under ignored ai-runs/ and keeps durable state here.`,
    `- What still feels weak: ${nextTask(random, coverage)}.`,
    `- Highest-priority next task: ${nextTask(random, coverage)}.`,
    "- Risks/blockers: Preserve uncommitted user content and avoid committing ai-runs/ evidence.",
    "- Repeated mistake to avoid: Do not treat CLI-only validation as playtesting; use MCP tools for the actual game loop.",
    "",
  ].join("\n");
  appendFileSync("AI_LOOP_STATE.md", text);
}

function buildAgentPrompt(storyPath: string, random: any, coverage: any, trueEnding: any, exploratory: any): string {
  return [
    "# AdventureForge AFK Improvement Task",
    "",
    "You are operating inside this repository. Make exactly one focused, high-impact improvement, then leave the repo green.",
    "",
    "Hard constraints:",
    "",
    "- Preserve unrelated user work and generated scratch files.",
    "- Do not commit ai-runs/, node_modules/, dist/, coverage/, saves/*.json, or transcripts/*.md.",
    "- Use MCP gameplay evidence, not prose-only playtesting.",
    "- Prefer a small story, tooling, transcript, or playtest-strategy improvement over broad rewrites.",
    "- Run npm run health before finishing.",
    "",
    "Required step — BLIND PLAYTEST (docs/blind_playtest_protocol.md):",
    "",
    "- Spawn a FRESH subagent with NO design context (Agent tool general-purpose, or a clean `claude -p` / `codex exec`).",
    `- Hand it ONLY the locked-down prompt in that doc, with pack_path = "${storyPath}" and a seed. It must play purely through the mcp__adventureforge__* tools and must NOT read content/, src/, ui/, or tests/.`,
    "- Collect its structured report (route, mechanics, clarity/enjoyment, confusion, bugs, verdict).",
    "- Turn its findings into ONE focused fix: content/hint/quest_structure via apply_content_patch or a re-validated YAML edit; engine-rule/validator/schema stay gated (§14, propose only).",
    "- Lock the fix with a traces/bugs/ artifact + a tests/regression/ test (§15), then re-validate and run health.",
    "",
    "Current MCP evidence:",
    "",
    `- Story: ${storyPath}`,
    `- Random playtest: ${random.ended}/${random.runs} ended; endings ${JSON.stringify(random.ending_distribution)}; unvisited ${random.unvisited_scenes.join(", ") || "(none)"}.`,
    `- Coverage playtest: ${coverage.ended}/${coverage.runs} ended; endings ${JSON.stringify(coverage.ending_distribution)}; unvisited ${coverage.unvisited_scenes.join(", ") || "(none)"}.`,
    `- True-ending regression: ${trueEnding.observation.ending_id}`,
    `- Exploratory route finished at: ${exploratory.observation.ending_id ?? exploratory.observation.scene_id}`,
    "",
    `Highest-priority next task: ${nextTask(random, coverage)}.`,
    "",
    "After changing anything, rerun MCP validation/playtests or the bounded loop and update AI_LOOP_STATE.md with concise durable notes.",
    "",
  ].join("\n");
}

function nextTask(random: any, coverage: any): string {
  if (coverage.unvisited_scenes.length > 0) return `Improve discoverability for ${coverage.unvisited_scenes[0]}`;
  if (random.unfinished > 0) return "Reduce random-route unfinished runs without flattening meaningful backtracking";
  if (!random.ending_distribution.ending_truth) return "Improve true-ending signposting for normal-player routes";
  return "Add one small validated story or transcript-quality improvement";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
