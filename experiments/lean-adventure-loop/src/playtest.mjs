#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateRecords } from "./aggregate.mjs";
import { projectBuildHash, PROJECT_ROOT } from "./build-hash.mjs";
import { createSeededRandom, loadWorld, sha256, stableStringify } from "./engine.mjs";
import { McpClient } from "./mcp-client.mjs";

const DEFAULT_STORE = resolve(PROJECT_ROOT, "artifacts/runs");
const SERVER_PATH = fileURLToPath(new URL("./mcp-server.mjs", import.meta.url));

function chooseAction(policy, payload, context) {
  const ids = (payload.actions ?? []).map(([id]) => id);
  if (!ids.length) return null;
  if (policy === "scripted") {
    const planned = context.plan[context.planIndex];
    if (ids.includes(planned)) {
      context.planIndex += 1;
      return planned;
    }
    return ids[0];
  }
  if (policy === "explorer") {
    const unseen = ids.filter((id) => !context.seen.has(id) && id !== "leave_island");
    const pool = unseen.length ? unseen : ids.filter((id) => id !== "leave_island");
    return (pool.length ? pool : ids)[Math.floor(context.random() * (pool.length || ids.length))];
  }
  return ids[Math.floor(context.random() * ids.length)];
}

function mechanicalFindings(policy, outcome, turns, maxTurns, error) {
  const findings = [];
  if (error) {
    findings.push({
      key: "mcp-play-failure",
      title: "MCP play failure",
      severity: 3,
      evidence: error,
    });
  } else if (policy === "scripted" && outcome !== "beacon") {
    findings.push({
      key: "scripted-route-broken",
      title: "Known winning route did not reach the beacon",
      severity: 3,
      evidence: `The scripted route ended as ${outcome ?? "incomplete"} after ${turns}/${maxTurns} turns.`,
    });
  } else if (!outcome && policy === "scripted") {
    findings.push({
      key: "missing-ending",
      title: "Playthrough stopped without an ending",
      severity: 3,
      evidence: `No ending was returned after ${turns} turn(s).`,
    });
  }
  return findings;
}

export async function runBuiltInSession({ policy = "random", seed = 1, worldPath } = {}) {
  const world = await loadWorld(worldPath);
  const client = new McpClient({ worldPath });
  const context = {
    plan: world.winningPlan ?? [],
    planIndex: 0,
    random: createSeededRandom(seed),
    seen: new Set(),
  };
  const actions = [];
  let payload;
  let failure = null;

  try {
    await client.connect();
    const started = await client.callTool("game_start", { seed });
    if (started.isError) throw new Error(started.payload.error);
    payload = started.payload;

    while (!payload.end && actions.length <= world.maxTurns) {
      const action = chooseAction(policy, payload, context);
      if (!action) break;
      context.seen.add(action);
      const stepped = await client.callTool("game_step", {
        sid: payload.sid,
        rev: payload.rev,
        action,
      });
      actions.push(action);
      if (stepped.isError) {
        failure = stepped.payload.error;
        break;
      }
      payload = stepped.payload;
    }
  } catch (error) {
    failure = error.message;
  } finally {
    await client.close();
  }

  const outcome = payload?.end?.[0] ?? null;
  const turns = payload?.rev ?? actions.length;
  return {
    outcome,
    turns,
    actions,
    ratings: null,
    findings: mechanicalFindings(policy, outcome, turns, world.maxTurns, failure),
    final: payload ?? null,
    traceVerified: true,
  };
}

function extractAgentJson(stdout) {
  const blocks = [...stdout.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (const block of blocks.reverse()) {
    try {
      return JSON.parse(block[1].trim());
    } catch {
      // Try the next candidate.
    }
  }
  const lines = stdout.trim().split(/\r?\n/).reverse();
  for (const line of lines) {
    try {
      return JSON.parse(line.trim());
    } catch {
      // Try the next line.
    }
  }
  throw new Error("Agent did not return a valid JSON object.");
}

function runCommand(command, { cwd, input, timeoutMs }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const cap = 256_000;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk).slice(-cap);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-cap);
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Agent timed out after ${timeoutMs} ms.`));
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Agent failed (code=${code}, signal=${signal}): ${stderr.slice(-2000)}`));
        return;
      }
      resolvePromise({ stdout, stderr });
    });
    child.stdin.end(input);
  });
}

async function verifyReportedTrace(report, seed) {
  const client = new McpClient();
  try {
    await client.connect();
    let result = await client.callTool("game_start", { seed });
    if (result.isError) throw new Error(result.payload.error);
    let payload = result.payload;
    for (const action of report.actions) {
      result = await client.callTool("game_step", {
        sid: payload.sid,
        rev: payload.rev,
        action,
      });
      if (result.isError) throw new Error(`Reported action trace is invalid: ${result.payload.error}`);
      payload = result.payload;
    }
    if (!payload.end) throw new Error("Reported action trace does not reach an ending.");
    if (payload.end[0] !== report.outcome) {
      throw new Error(`Reported outcome ${report.outcome} does not match replayed outcome ${payload.end[0]}.`);
    }
    if (payload.rev !== report.turns || report.actions.length !== report.turns) {
      throw new Error(
        `Reported turns ${report.turns} do not match replayed turns ${payload.rev} and ${report.actions.length} actions.`,
      );
    }
    return true;
  } finally {
    await client.close();
  }
}

function validateAgentReport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Agent report must be an object.");
  }
  if (typeof value.outcome !== "string") throw new Error("Agent report requires outcome.");
  if (!Number.isSafeInteger(value.turns) || value.turns < 0) {
    throw new Error("Agent report requires non-negative integer turns.");
  }
  if (!Array.isArray(value.actions) || value.actions.some((item) => typeof item !== "string")) {
    throw new Error("Agent report actions must be an array of action ids.");
  }
  const ratings = value.ratings ?? {};
  for (const key of ["fun", "clarity"]) {
    if (!Number.isFinite(ratings[key]) || ratings[key] < 1 || ratings[key] > 5) {
      throw new Error(`Agent report rating ${key} must be 1..5.`);
    }
  }
  const findings = Array.isArray(value.findings) ? value.findings : [];
  return {
    outcome: value.outcome,
    turns: value.turns,
    actions: value.actions.slice(0, 64),
    ratings: { fun: ratings.fun, clarity: ratings.clarity },
    findings: findings.slice(0, 8).map((finding, index) => ({
      key: String(finding.key ?? `finding-${index + 1}`).slice(0, 80),
      title: String(finding.title ?? finding.key ?? `Finding ${index + 1}`).slice(0, 140),
      severity: Math.max(1, Math.min(3, Number(finding.severity) || 1)),
      evidence: String(finding.evidence ?? "").slice(0, 400),
    })),
    final: null,
  };
}

export async function runAgentSession({ command, seed = 1, timeoutMs = 240_000 } = {}) {
  if (!command) throw new Error("Agent play requires PLAYTEST_AGENT_CMD or --agent-cmd.");
  const sandbox = await mkdtemp(resolve(tmpdir(), "lean-player-"));
  const config = {
    mcpServers: {
      "lean-adventure": {
        command: process.execPath,
        args: [SERVER_PATH],
        env: { LEAN_WORLD: resolve(PROJECT_ROOT, "game/world.json") },
      },
    },
  };
  await writeFile(resolve(sandbox, ".mcp.json"), `${JSON.stringify(config, null, 2)}\n`);
  const prompt = [
    "You are a blind text-game playtester.",
    "Use only the lean-adventure MCP tools game_start and game_step.",
    `Start with seed ${seed}. Play until the server returns end.`,
    "Do not inspect files, run shell commands, or ask for source code.",
    "After play, output one JSON object and no other final text:",
    '{"outcome":"ending id","turns":0,"actions":["action ids"],"ratings":{"fun":1,"clarity":1},"findings":[{"key":"stable-key","title":"short title","severity":1,"evidence":"specific evidence"}]}',
    "Ratings are integers 1..5. Severity is 1 low, 2 medium, 3 high. Use at most 8 findings.",
  ].join("\n");

  try {
    const { stdout } = await runCommand(command, { cwd: sandbox, input: prompt, timeoutMs });
    const report = validateAgentReport(extractAgentJson(stdout));
    await verifyReportedTrace(report, seed);
    return { ...report, traceVerified: true };
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}

function contentAddress(record) {
  return sha256(stableStringify(record));
}

export async function writeRecord(result, {
  store = DEFAULT_STORE,
  build,
  player,
  seed,
  startedAt,
  durationMs,
} = {}) {
  const body = {
    schemaVersion: 1,
    build,
    startedAt,
    durationMs,
    seed,
    player,
    outcome: result.outcome,
    turns: result.turns,
    actions: result.actions,
    ratings: result.ratings,
    findings: result.findings,
    traceVerified: result.traceVerified === true,
  };
  const recordId = contentAddress(body);
  const record = { recordId, ...body };
  await mkdir(store, { recursive: true });
  await writeFile(resolve(store, `${recordId}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" }).catch(
    (error) => {
      if (error.code !== "EEXIST") throw error;
    },
  );
  return record;
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return results;
}

export async function runPlaytests({
  runs = 4,
  player = "mix",
  concurrency = 4,
  seedBase = 1,
  store = DEFAULT_STORE,
  agentCommand = process.env.PLAYTEST_AGENT_CMD,
  agentTimeoutMs = 240_000,
  aggregate = true,
} = {}) {
  if (!Number.isSafeInteger(runs) || runs < 1) throw new Error("runs must be a positive integer.");
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error("concurrency must be a positive integer.");
  }
  const build = await projectBuildHash();
  const jobs = Array.from({ length: runs }, (_, index) => ({ seed: seedBase + index, index }));
  const records = await mapConcurrent(jobs, concurrency, async ({ seed, index }) => {
    const selected = player === "mix" ? (index === 0 ? "scripted" : index % 2 ? "explorer" : "random") : player;
    const startedAt = new Date().toISOString();
    const start = performance.now();
    let result;
    let descriptor;
    if (selected === "agent") {
      result = await runAgentSession({ command: agentCommand, seed, timeoutMs: agentTimeoutMs });
      descriptor = {
        kind: "agent",
        name: basename(agentCommand?.split(/\s+/)[0] ?? "external-agent"),
        isolation: "instruction_only",
      };
    } else if (["scripted", "random", "explorer"].includes(selected)) {
      result = await runBuiltInSession({ policy: selected, seed });
      descriptor = { kind: "mechanical", name: selected, isolation: "in_process_mcp" };
    } else {
      throw new Error(`Unknown player: ${selected}`);
    }
    return writeRecord(result, {
      store,
      build,
      player: descriptor,
      seed,
      startedAt,
      durationMs: Math.round(performance.now() - start),
    });
  });
  const summary = aggregate ? await aggregateRecords({ store, build }) : null;
  return { build, records, summary };
}

function parseCli(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--runs") options.runs = Number(argv[++index]);
    else if (flag === "--player") options.player = argv[++index];
    else if (flag === "--concurrency") options.concurrency = Number(argv[++index]);
    else if (flag === "--seed") options.seedBase = Number(argv[++index]);
    else if (flag === "--store") options.store = resolve(argv[++index]);
    else if (flag === "--agent-cmd") options.agentCommand = argv[++index];
    else if (flag === "--agent-timeout-ms") options.agentTimeoutMs = Number(argv[++index]);
    else if (flag === "--no-aggregate") options.aggregate = false;
    else throw new Error(`Unknown argument: ${flag}${value ? ` ${value}` : ""}`);
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runPlaytests(parseCli(process.argv.slice(2)))
    .then(({ build, records, summary }) => {
      process.stdout.write(
        `${JSON.stringify({ build, records: records.length, top: summary?.top ?? null })}\n`,
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
