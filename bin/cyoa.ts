#!/usr/bin/env -S npx tsx
import { createToolApi } from "../src/mcp/tools.js";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

async function main(): Promise<void> {
  const [, , command, storyPath, ...rest] = process.argv;
  if (!command || !storyPath) {
    console.error(
      "Usage: npm run cyoa -- <validate|playtest> <story.yaml> [--json] [--runs N] [--strategy random|coverage] [--summary]",
    );
    process.exit(2);
  }

  const api = createToolApi({ root: process.cwd() });
  const json = rest.includes("--json");

  if (command === "validate") {
    const result = api.validate_story({ story_path: storyPath });
    if (json) printJson(result);
    else {
      console.log(`Story: ${storyPath}`);
      console.log(`Result: ${result.ok ? "OK" : "FAILED"}`);
      for (const finding of result.report.findings) {
        console.log(`- ${finding.severity.toUpperCase()} ${finding.code}: ${finding.message}`);
      }
    }
    process.exit(result.ok ? 0 : 1);
  }

  if (command === "playtest") {
    const runs = numberFlag(rest, "--runs") ?? 100;
    const strategy = stringFlag(rest, "--strategy") ?? "coverage";
    if (strategy !== "random" && strategy !== "coverage") {
      console.error("--strategy must be random or coverage");
      process.exit(2);
    }
    const result = api.run_playtest({ story_path: storyPath, runs, strategy });
    if (json) printJson(result);
    else {
      console.log(`Playtest ${result.pack_id}: ${strategy}, ${runs} runs`);
      console.log(`ended: ${result.ended}  unfinished: ${result.unfinished}`);
      console.log(`visited scenes: ${result.visited_scenes.length}`);
      console.log(`unvisited scenes: ${result.unvisited_scenes.join(", ") || "(none)"}`);
      console.log(`ending distribution: ${JSON.stringify(result.ending_distribution)}`);
    }
    process.exit(0);
  }

  console.error(`Unknown command: ${command}`);
  process.exit(2);
}

function stringFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function numberFlag(args: string[], name: string): number | undefined {
  const raw = stringFlag(args, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
