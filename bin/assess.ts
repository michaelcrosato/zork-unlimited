#!/usr/bin/env -S npx tsx
/**
 * bin/assess — print the AFK loop's "next best improvement" assessment.
 *
 * Usage:
 *   npm run assess
 *   npm run assess -- -- --json
 *   npm run assess -- -- --full
 * Deterministic: scans the RPG catalog + repo signals and ranks improvement
 * candidates across content_new / content_fix / engine / repo. The loop uses this
 * to decide where to spend a cycle; a human can run --full to see the full backlog.
 */
import { assess, formatAssessment } from "../src/afk/assessor.js";

function main(): void {
  const a = assess(process.cwd());
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(a, null, 2));
    return;
  }
  console.log(formatAssessment(a, { full: process.argv.includes("--full") }));
}

main();
