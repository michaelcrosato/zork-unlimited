#!/usr/bin/env -S npx tsx
import { createToolApi } from "../src/mcp/tools.js";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

async function main(): Promise<void> {
  const [, , command, storyPath] = process.argv;
  if (!command || !storyPath) {
    console.error("Usage: npm run cyoa -- validate <story.yaml> [--json]");
    process.exit(2);
  }

  const api = createToolApi({ root: process.cwd() });
  const json = process.argv.includes("--json");

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

  console.error(`Unknown command: ${command}`);
  process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
