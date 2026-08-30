#!/usr/bin/env node
/**
 * blind-tester/qa/qa-fleet.mjs — the advisory persona QA fleet (cheap tier).
 *
 * Two-lane testing split (docs/qa_fleet.md, spec:
 * docs/superpowers/specs/2026-08-27-scaleout-design.md):
 *
 * - The RETENTION lane (run.sh / fleet.mjs) is unchanged: neutral default
 *   persona, pinned models at xhigh, full anti-forgery evidence pipeline. It
 *   answers "do players keep playing?" and certifies.
 * - This QA lane is cheap, persona-varied, and ADVISORY. It answers "what is
 *   confusing, broken, or weak?" with many inexpensive eyes. Its reports are
 *   unverified prose: they steer humans and lane agents toward problems, and
 *   every mechanical claim must be reproduced deterministically before code
 *   changes (the blind-playtest protocol's own stance).
 *
 * Quarantine: output goes to ai-runs/qa/<label>/ and NEVER to
 * blind-tester/reports/ — the assessor parses that directory for pure-lane
 * attendance, and QA runs must not contaminate retention evidence, pilots,
 * certification, or the feedback acceptance chain.
 *
 * Blindness is enforced server-side, not by prompt: each run launches the real
 * MCP server with --play-mode pure (PURE_PLAYER_TOOLS only — the human player
 * surface), the player process gets no shell tool, no web, no repo rules or
 * project docs, and plays from an isolated cwd.
 *
 * Cheap tier + max-think sampling: runs default to QA_TIERS.cheap
 * (gpt-5.3-codex-spark at model_reasoning_effort "low"). A seeded PRNG
 * upgrades ~--think-rate (default 1%) of planned runs to QA_TIERS.think
 * (gpt-5.6-terra at "xhigh"). The plan is a pure function of its inputs, so a
 * roster is reproducible from (count, seedBase, thinkRate, weights).
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// @ts-expect-error — plain .mjs module without type declarations
import { fillPrompt } from "../fill-prompt.mjs";

const QA_DIR = dirname(fileURLToPath(import.meta.url));
const GAME_DIR = resolve(QA_DIR, "..", "..");

/** Model/effort tiers. "cheap" is the default; "think" is the sampled upgrade. */
export const QA_TIERS = {
  cheap: { model: "gpt-5.3-codex-spark", effort: "low" },
  think: { model: "gpt-5.6-terra", effort: "xhigh" },
};

/**
 * Persona roster, weighted so critical / high-standards temperaments dominate
 * (~70% of a full cycle) while lighter play styles keep coverage broad. Every
 * persona file carries the shared anti-sycophancy CALIBRATION block.
 */
export const DEFAULT_PERSONA_WEIGHTS = [
  ["critic", 3],
  ["skeptic", 2],
  ["impatient", 2],
  ["breaker", 2],
  ["explorer", 1],
  ["speedrunner", 1],
  ["casual", 1],
  ["lore-reader", 1],
];

/** Deterministic PRNG (mulberry32) so fleet plans are reproducible. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Expand [name, weight] pairs into a flat cycle, e.g. 3x critic, 2x skeptic… */
export function buildPersonaCycle(weights) {
  const cycle = [];
  for (const [name, weight] of weights) {
    if (!Number.isInteger(weight) || weight < 1) {
      throw new Error(`persona weight for ${JSON.stringify(name)} must be a positive integer`);
    }
    for (let i = 0; i < weight; i++) cycle.push(name);
  }
  if (cycle.length === 0) throw new Error("persona weights expanded to an empty cycle");
  return cycle;
}

/**
 * Plan a QA fleet. Pure and deterministic: same inputs → same roster.
 * RNG consumption order is fixed and part of the contract (tests pin it):
 * first one Fisher-Yates shuffle of the persona cycle, then one tier roll per
 * run in run order.
 */
export function planQaRuns({ count, seedBase, thinkRate, personaWeights }) {
  if (!Number.isInteger(count) || count < 1) throw new Error("--count must be a positive integer");
  if (!Number.isSafeInteger(seedBase) || seedBase < 0) {
    throw new Error("--seed-base must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(seedBase + count - 1)) {
    throw new Error("seed range exceeds safe integer bounds");
  }
  if (!(thinkRate >= 0 && thinkRate <= 1)) throw new Error("--think-rate must be in [0, 1]");
  const rng = mulberry32(seedBase % 4294967296);
  const cycle = buildPersonaCycle(personaWeights ?? DEFAULT_PERSONA_WEIGHTS);
  for (let i = cycle.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = cycle[i];
    cycle[i] = cycle[j];
    cycle[j] = tmp;
  }
  const runs = [];
  for (let i = 0; i < count; i++) {
    const tier = rng() < thinkRate ? "think" : "cheap";
    runs.push({
      index: i,
      seed: seedBase + i,
      persona: cycle[i % cycle.length],
      tier,
      model: QA_TIERS[tier].model,
      effort: QA_TIERS[tier].effort,
    });
  }
  return runs;
}

/**
 * Extract the single fenced `json exit-interview` block from a player's final
 * message. Mirrors the pure-lane fence contract: a plain ```json fence does
 * not count. Returns { ok: true, value } or { ok: false, error }.
 */
export function extractExitInterview(text) {
  if (typeof text !== "string") return { ok: false, error: "final message is not a string" };
  const matches = [...text.matchAll(/```json exit-interview\s*\n([\s\S]*?)```/g)];
  if (matches.length === 0) return { ok: false, error: "no `json exit-interview` fence found" };
  if (matches.length > 1) return { ok: false, error: "multiple exit-interview fences found" };
  try {
    const value = JSON.parse(matches[0][1]);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, error: "exit interview is not a JSON object" };
    }
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: `exit interview is not valid JSON: ${String(err)}` };
  }
}

const SEVERITIES = ["S0", "S1", "S2", "S3", "S4"];

/**
 * Aggregate parsed run entries ({ seed, persona, tier, model, interview|null,
 * error|null }) into a deterministic summary object.
 */
export function summarizeQaReports(entries) {
  const summary = {
    schema_version: 1,
    lane: "qa-advisory",
    total: entries.length,
    reported: 0,
    failed: 0,
    clarity_total: 0,
    enjoyment_total: 0,
    would_replay: 0,
    got_stuck: 0,
    bugs_by_severity: Object.fromEntries(SEVERITIES.map((s) => [s, 0])),
    by_persona: {},
    findings: [],
    failures: [],
  };
  for (const entry of entries) {
    const persona = (summary.by_persona[entry.persona] ??= {
      runs: 0,
      reported: 0,
      clarity_total: 0,
      enjoyment_total: 0,
      zero_negative: 0,
      bugs: 0,
    });
    persona.runs += 1;
    if (!entry.interview) {
      summary.failed += 1;
      summary.failures.push({
        seed: entry.seed,
        persona: entry.persona,
        error: entry.error ?? "unknown",
      });
      continue;
    }
    const iv = entry.interview;
    summary.reported += 1;
    persona.reported += 1;
    if (Number.isInteger(iv.clarity)) {
      summary.clarity_total += iv.clarity;
      persona.clarity_total += iv.clarity;
    }
    if (Number.isInteger(iv.enjoyment)) {
      summary.enjoyment_total += iv.enjoyment;
      persona.enjoyment_total += iv.enjoyment;
    }
    if (iv.would_replay === true) summary.would_replay += 1;
    if (iv.got_stuck === true) summary.got_stuck += 1;
    const bugs = Array.isArray(iv.bugs) ? iv.bugs : [];
    const confusions = Array.isArray(iv.confusions) ? iv.confusions : [];
    if (bugs.length === 0 && confusions.length === 0) persona.zero_negative += 1;
    persona.bugs += bugs.length;
    for (const bug of bugs) {
      const severity = SEVERITIES.includes(bug?.severity) ? bug.severity : "S0";
      summary.bugs_by_severity[severity] += 1;
      summary.findings.push({
        seed: entry.seed,
        persona: entry.persona,
        tier: entry.tier,
        severity,
        where: typeof bug?.where === "string" ? bug.where : "(unspecified)",
        note: typeof bug?.note === "string" ? bug.note : "",
      });
    }
    for (const confusion of confusions) {
      if (typeof confusion === "string" && confusion.trim() !== "") {
        summary.findings.push({
          seed: entry.seed,
          persona: entry.persona,
          tier: entry.tier,
          severity: "confusion",
          where: "(confusion)",
          note: confusion,
        });
      }
    }
  }
  const severityRank = (s) => (s === "confusion" ? -1 : SEVERITIES.indexOf(s));
  summary.findings.sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity) || a.seed - b.seed,
  );
  return summary;
}

/** Render the aggregate as a short human/agent-facing markdown digest. */
export function renderQaDigest(summary) {
  const lines = [];
  lines.push(`# QA fleet digest (advisory — not retention evidence)`);
  lines.push("");
  lines.push(
    `${summary.reported}/${summary.total} runs reported; ${summary.failed} failed. ` +
      `Clarity avg ${avg(summary.clarity_total, summary.reported)}, enjoyment avg ` +
      `${avg(summary.enjoyment_total, summary.reported)}, would_replay ${summary.would_replay}/${summary.reported}, ` +
      `got_stuck ${summary.got_stuck}/${summary.reported}.`,
  );
  lines.push("");
  lines.push(
    `Bugs by severity: ${SEVERITIES.map((s) => `${s}=${summary.bugs_by_severity[s]}`).join(" ")}`,
  );
  lines.push("");
  lines.push("| persona | runs | reported | clarity avg | zero-negative | bugs |");
  lines.push("|---|---|---|---|---|---|");
  for (const [name, p] of Object.entries(summary.by_persona).sort()) {
    lines.push(
      `| ${name} | ${p.runs} | ${p.reported} | ${avg(p.clarity_total, p.reported)} | ${p.zero_negative} | ${p.bugs} |`,
    );
  }
  lines.push("");
  lines.push("## Findings (most severe first)");
  lines.push("");
  if (summary.findings.length === 0) lines.push("(none reported)");
  for (const f of summary.findings) {
    lines.push(`- [${f.severity}] seed ${f.seed} (${f.persona}/${f.tier}) — ${f.where}: ${f.note}`);
  }
  if (summary.failures.length > 0) {
    lines.push("");
    lines.push("## Failed runs");
    lines.push("");
    for (const f of summary.failures) {
      lines.push(`- seed ${f.seed} (${f.persona}): ${f.error}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function avg(total, n) {
  return n > 0 ? (total / n).toFixed(2) : "n/a";
}

const QA_VALUE_FLAGS = [
  ["count", "--count"],
  ["seed_base", "--seed-base"],
  ["think_rate", "--think-rate"],
  ["concurrency", "--concurrency"],
  ["out", "--out"],
  ["label", "--label"],
  ["timeout_seconds", "--timeout-seconds"],
];
const QA_BOOL_FLAGS = [["dry_run", "--dry-run"]];

/**
 * Reconstruct flags npm consumed (pure; exported for tests). Same papercut and
 * recovery rule as blind-launch.mjs's recoverNpmEatenFlags, applied to this
 * driver's flag set: npm + PowerShell can swallow space-separated flags into
 * npm_config_* env vars, orphaning the value as a bare positional. Equals form
 * (`--count=20`) always passes through untouched and is the documented shape.
 */
export function recoverQaArgs(argv, env) {
  const args = [...argv];
  const hasExplicitFlag = (flag) => args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
  const unresolved = QA_VALUE_FLAGS.filter(
    ([key, flag]) => env[`npm_config_${key}`] === "true" && !hasExplicitFlag(flag),
  );
  const numericOrphans = args.filter((value) => /^-?[\d.]+$/.test(value));
  if (unresolved.length > 1 || (unresolved.length === 1 && numericOrphans.length !== 1)) {
    throw new Error(
      `Cannot safely recover space-separated ${unresolved.map(([, flag]) => flag).join(" / ")} values from npm; use equals form (for example --count=20 --seed-base=900500).`,
    );
  }
  for (const [key, flag] of QA_VALUE_FLAGS) {
    const value = env[`npm_config_${key}`];
    if (value === undefined || value === "" || value === "false") continue;
    if (hasExplicitFlag(flag)) continue;
    if (value !== "true") {
      args.push(flag, value);
    } else {
      const orphan = args.findIndex((t) => /^-?[\d.]+$/.test(t));
      if (orphan >= 0) {
        const [num] = args.splice(orphan, 1);
        args.push(flag, num);
      }
    }
  }
  for (const [key, flag] of QA_BOOL_FLAGS) {
    const value = env[`npm_config_${key}`];
    if ((value === "true" || value === "") && !args.includes(flag)) args.push(flag);
  }
  return args;
}

export function parseQaArgs(argv) {
  const args = {
    count: 8,
    seedBase: null,
    thinkRate: 0.01,
    concurrency: 2,
    out: null,
    dryRun: false,
    timeoutSeconds: 900,
    label: null,
  };
  const tokens = [];
  for (const raw of argv) {
    const eq = raw.startsWith("--") ? raw.indexOf("=") : -1;
    if (eq > 0) tokens.push(raw.slice(0, eq), raw.slice(eq + 1));
    else tokens.push(raw);
  }
  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i];
    if (a === "--count") args.count = Number(tokens[++i]);
    else if (a === "--seed-base") args.seedBase = Number(tokens[++i]);
    else if (a === "--think-rate") args.thinkRate = Number(tokens[++i]);
    else if (a === "--concurrency") args.concurrency = Number(tokens[++i]);
    else if (a === "--out") args.out = tokens[++i];
    else if (a === "--label") args.label = tokens[++i];
    else if (a === "--timeout-seconds") args.timeoutSeconds = Number(tokens[++i]);
    else if (a === "--dry-run") args.dryRun = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) {
    throw new Error("--concurrency must be a positive integer");
  }
  if (!Number.isInteger(args.timeoutSeconds) || args.timeoutSeconds < 1) {
    throw new Error("--timeout-seconds must be a positive integer");
  }
  if (args.seedBase === null) {
    // Deterministic same-day default: yyyymmdd × 1000. Reruns the same UTC day
    // reuse the seed window (and therefore the same roster) unless overridden.
    const now = new Date();
    const ymd = now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
    args.seedBase = ymd * 1000;
  }
  return args;
}

function personaOverlayText(personaName) {
  const path = join(QA_DIR, "..", "personas", `${personaName}.md`);
  const raw = readFileSync(path, "utf8");
  const withoutComments = raw
    .split("\n")
    .filter((line) => !/^\s*<!--.*-->\s*$/.test(line))
    .join("\n");
  return withoutComments.trim();
}

function toForwardSlashes(p) {
  return p.replace(/\\/g, "/");
}

function assertTomlSafePath(p, label) {
  if (/["\n\r]/.test(p) || /\s/.test(p)) {
    throw new Error(
      `${label} path ${JSON.stringify(p)} contains spaces or quotes; ` +
        `the MCP server TOML embedding cannot represent it safely — relocate the checkout/output.`,
    );
  }
}

/** Build the codex `exec` argv for one run. Exported for tests. */
export function buildCodexExecArgs({ model, effort, evidencePath, seed, lastMessagePath }) {
  const gameDir = toForwardSlashes(GAME_DIR);
  const evidence = toForwardSlashes(evidencePath);
  assertTomlSafePath(gameDir, "game dir");
  assertTomlSafePath(evidence, "evidence");
  const serverArgs =
    process.platform === "win32"
      ? `["/c", "cd /d ${gameDir} && npm --silent run mcp -- --play-mode pure --run-seed ${seed} --run-evidence ${evidence}"]`
      : `["--silent", "--prefix", "${gameDir}", "run", "mcp", "--", "--play-mode", "pure", "--run-seed", "${seed}", "--run-evidence", "${evidence}"]`;
  const serverCommand = process.platform === "win32" ? "cmd.exe" : "npm";
  return [
    "exec",
    "--model",
    model,
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--ignore-rules",
    "-c",
    "project_doc_max_bytes=0",
    "--config",
    `model_reasoning_effort="${effort}"`,
    "--config",
    'approval_policy="never"',
    "--config",
    'web_search="disabled"',
    "--config",
    "features.shell_tool=false",
    "--config",
    `mcp_servers.adventureforge.command="${serverCommand}"`,
    "--config",
    `mcp_servers.adventureforge.args=${serverArgs}`,
    "--config",
    "mcp_servers.adventureforge.startup_timeout_sec=60",
    "--config",
    "mcp_servers.adventureforge.tool_timeout_sec=60",
    "--config",
    "mcp_servers.adventureforge.required=true",
    "--output-last-message",
    lastMessagePath,
    "-",
  ];
}

/**
 * Resolve how to launch the Codex CLI without a shell (shell quoting would
 * mangle the TOML --config values). Windows npm installs expose codex as a
 * .cmd/.ps1 shim that spawn() cannot exec directly, so we locate the real JS
 * entry behind the shim and run it with the current node. Overridable via
 * QA_CODEX_JS (path to codex.js).
 */
function resolveCodexInvocation(env) {
  if (env.QA_CODEX_JS) return { command: process.execPath, prefixArgs: [env.QA_CODEX_JS] };
  if (process.platform !== "win32") return { command: "codex", prefixArgs: [] };
  let whereOut;
  try {
    whereOut = execFileSync("where.exe", ["codex"], { encoding: "utf8" });
  } catch {
    throw new Error("codex CLI not found on PATH; install it or set QA_CODEX_JS");
  }
  for (const line of whereOut.split(/\r?\n/)) {
    const shim = line.trim();
    if (!/codex(\.cmd|\.ps1)$/i.test(shim)) continue;
    const candidate = join(dirname(shim), "node_modules", "@openai", "codex", "bin", "codex.js");
    if (existsSync(candidate)) return { command: process.execPath, prefixArgs: [candidate] };
  }
  throw new Error(
    "could not locate codex.js behind the npm shim; set QA_CODEX_JS to the full path of @openai/codex/bin/codex.js",
  );
}

function runOne(run, opts, codexInvocation) {
  const runDir = join(opts.out, "runs", `${run.seed}_${run.persona}`);
  mkdirSync(runDir, { recursive: true });
  const lastMessagePath = join(runDir, "last-message.md");
  const evidencePath = join(runDir, "evidence.jsonl");
  const template = readFileSync(join(QA_DIR, "prompt-qa.md"), "utf8");
  const prompt = fillPrompt(template, {
    startInstruction: "",
    seed: run.seed,
    persona: personaOverlayText(run.persona),
    transport: "",
  });
  writeFileSync(join(runDir, "prompt.md"), prompt);
  const args = [
    ...codexInvocation.prefixArgs,
    ...buildCodexExecArgs({
      model: run.model,
      effort: run.effort,
      evidencePath,
      seed: run.seed,
      lastMessagePath,
    }),
  ];
  return new Promise((resolvePromise) => {
    const child = spawn(codexInvocation.command, args, {
      cwd: runDir,
      timeout: opts.timeoutSeconds * 1000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      resolvePromise({ ...run, interview: null, error: `spawn failed: ${String(err)}` });
    });
    child.on("close", (code) => {
      writeFileSync(
        join(runDir, "provider.log"),
        stdout + (stderr ? `\n--- stderr ---\n${stderr}` : ""),
      );
      if (code !== 0) {
        resolvePromise({ ...run, interview: null, error: `codex exited with status ${code}` });
        return;
      }
      let finalMessage;
      try {
        finalMessage = readFileSync(lastMessagePath, "utf8");
      } catch {
        resolvePromise({ ...run, interview: null, error: "no final message was produced" });
        return;
      }
      const extracted = extractExitInterview(finalMessage);
      if (!extracted.ok) {
        resolvePromise({ ...run, interview: null, error: extracted.error });
        return;
      }
      writeFileSync(join(runDir, "interview.json"), JSON.stringify(extracted.value, null, 2));
      resolvePromise({ ...run, interview: extracted.value, error: null });
    });
    child.stdin.on("error", () => {});
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function runPoolSimple(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, lane));
  return results;
}

async function main() {
  const opts = parseQaArgs(recoverQaArgs(process.argv.slice(2), process.env));
  const plan = planQaRuns({
    count: opts.count,
    seedBase: opts.seedBase,
    thinkRate: opts.thinkRate,
  });
  if (opts.dryRun) {
    console.log(JSON.stringify({ dry_run: true, opts, plan }, null, 2));
    return 0;
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "Z");
  const label = opts.label ?? `qa-${stamp}`;
  opts.out = resolve(opts.out ?? join(GAME_DIR, "ai-runs", "qa", label));
  mkdirSync(opts.out, { recursive: true });
  const codexInvocation = resolveCodexInvocation(process.env);
  console.log(
    `QA fleet ${label}: ${plan.length} runs (concurrency ${opts.concurrency}) → ${opts.out}`,
  );
  const entries = await runPoolSimple(
    plan,
    (run) => {
      console.log(
        `  ▶ seed ${run.seed} persona=${run.persona} tier=${run.tier} (${run.model}/${run.effort})`,
      );
      return runOne(run, opts, codexInvocation);
    },
    opts.concurrency,
  );
  const summary = summarizeQaReports(entries);
  writeFileSync(join(opts.out, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(opts.out, "qa-digest.md"), renderQaDigest(summary));
  console.log(
    `Done: ${summary.reported}/${summary.total} reported, ${summary.failed} failed. Digest: ${join(opts.out, "qa-digest.md")}`,
  );
  return summary.reported > 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(String(err?.stack ?? err));
      process.exit(1);
    },
  );
}
