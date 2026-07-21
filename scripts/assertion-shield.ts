#!/usr/bin/env node
/**
 * Compatibility entrypoint for local git hooks that still call
 * `npx ts-node scripts/assertion-shield.ts`.
 *
 * The canonical verifier is `scripts/verify-integrity.ts` via
 * `npm run verify:integrity`; this wrapper keeps old hooks on that same bar
 * instead of forcing agents to bypass hooks when the old target is missing.
 */
import { runNpmScript } from "./npm-cli.js";

const result = runNpmScript("verify:integrity", [], { stdio: "inherit" });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
