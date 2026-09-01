#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { projectBuildHash, PROJECT_ROOT } from "./build-hash.mjs";

const DEFAULT_STORE = resolve(PROJECT_ROOT, "artifacts/runs");
const DEFAULT_SUMMARY = resolve(PROJECT_ROOT, "artifacts/summary.json");
const DEFAULT_TASK = resolve(PROJECT_ROOT, "NEXT_TASK.md");

function severityNumber(value) {
  if (Number.isInteger(value)) return Math.max(1, Math.min(3, value));
  return { low: 1, medium: 2, high: 3, critical: 3 }[String(value).toLowerCase()] ?? 1;
}

function findingKey(value) {
  return String(value ?? "unspecified")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "unspecified";
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export async function readRecords(store = DEFAULT_STORE) {
  let names = [];
  try {
    names = (await readdir(store)).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const records = [];
  for (const name of names) {
    try {
      records.push(JSON.parse(await readFile(resolve(store, name), "utf8")));
    } catch (error) {
      throw new Error(`Invalid playtest record ${name}: ${error.message}`);
    }
  }
  return records;
}

export function summarize(records, build) {
  const current = records.filter(
    (record) => record.build === build && record.traceVerified === true,
  );
  const completed = current.filter((record) => typeof record.outcome === "string");
  const wins = completed.filter((record) => record.outcome === "beacon");
  const ratingRows = current.filter(
    (record) => Number.isFinite(record.ratings?.fun) && Number.isFinite(record.ratings?.clarity),
  );

  const clusters = new Map();
  for (const record of current) {
    for (const finding of record.findings ?? []) {
      const key = findingKey(finding.key ?? finding.title);
      const row = clusters.get(key) ?? {
        key,
        title: finding.title ?? key.replaceAll("-", " "),
        count: 0,
        maxSeverity: 1,
        players: new Set(),
        evidence: [],
        mechanical: false,
        agent: false,
      };
      row.count += 1;
      row.maxSeverity = Math.max(row.maxSeverity, severityNumber(finding.severity));
      row.players.add(`${record.player?.kind ?? "unknown"}:${record.player?.name ?? "unknown"}`);
      if (typeof finding.evidence === "string" && row.evidence.length < 3) {
        row.evidence.push(finding.evidence.slice(0, 280));
      }
      row.mechanical ||= record.player?.kind === "mechanical";
      row.agent ||= record.player?.kind === "agent";
      clusters.set(key, row);
    }
  }

  const ranked = [...clusters.values()]
    .map((row) => {
      const uniquePlayers = row.players.size;
      const promoted = row.mechanical || uniquePlayers >= 2 || row.maxSeverity >= 3;
      const score = row.maxSeverity * 10 + uniquePlayers * 4 + row.count * 2 + (row.mechanical ? 8 : 0);
      return {
        key: row.key,
        title: row.title,
        count: row.count,
        uniquePlayers,
        severity: row.maxSeverity,
        promoted,
        score,
        evidence: row.evidence,
        sources: [row.mechanical ? "mechanical" : null, row.agent ? "agent" : null].filter(Boolean),
      };
    })
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

  const top = ranked.find((row) => row.promoted) ?? null;
  return {
    schemaVersion: 1,
    build,
    records: current.length,
    outcomes: Object.fromEntries(
      [...new Set(current.map((record) => record.outcome ?? "unknown"))]
        .sort()
        .map((outcome) => [outcome, current.filter((record) => (record.outcome ?? "unknown") === outcome).length]),
    ),
    completionRate: completed.length ? wins.length / completed.length : null,
    meanTurns: average(current.map((record) => record.turns).filter(Number.isFinite)),
    ratings: {
      count: ratingRows.length,
      fun: average(ratingRows.map((record) => record.ratings.fun)),
      clarity: average(ratingRows.map((record) => record.ratings.clarity)),
    },
    top,
    clusters: ranked,
  };
}

export function taskMarkdown(summary) {
  if (!summary.top) {
    return [
      "# Next task",
      "",
      "No finding has enough evidence to promote.",
      "",
      "Collect more AI playtests. Do not invent a code change from empty evidence.",
      "",
    ].join("\n");
  }
  const top = summary.top;
  return [
    "# Next task",
    "",
    `Fix one issue: **${top.title}**.`,
    "",
    `Evidence: ${top.count} report(s), ${top.uniquePlayers} independent player(s), severity ${top.severity}.`,
    ...top.evidence.map((item) => `- ${item}`),
    "",
    "## Acceptance",
    "",
    "- Keep the MCP surface at two tools: `game_start` and `game_step`.",
    "- Keep each step result self-contained. Do not add observe or list-actions calls.",
    "- Add or update a focused test.",
    "- Run `npm test`.",
    "- Run `npm run playtest -- --player scripted --runs 1`.",
    "",
  ].join("\n");
}

export async function aggregateRecords({
  store = DEFAULT_STORE,
  outputPath = DEFAULT_SUMMARY,
  taskPath = DEFAULT_TASK,
  build,
} = {}) {
  const selectedBuild = build ?? (await projectBuildHash());
  const summary = summarize(await readRecords(store), selectedBuild);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(taskPath, taskMarkdown(summary));
  return summary;
}

function parseCli(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--store") options.store = resolve(argv[++index]);
    else if (flag === "--out") options.outputPath = resolve(argv[++index]);
    else if (flag === "--task") options.taskPath = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  aggregateRecords(parseCli(process.argv.slice(2)))
    .then((summary) => process.stdout.write(`${JSON.stringify(summary)}\n`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
