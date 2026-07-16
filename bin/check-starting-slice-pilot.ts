#!/usr/bin/env -S npx tsx

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  startingSliceFleetDisplayName,
  validateStartingSlicePilot,
} from "../src/starting_slice/fleet_certifier.js";
import { writePilotArtifactSafely } from "./certify-starting-slice.js";

class StartingSlicePilotUsageError extends Error {}

function parseFleetDir(argv: string[]): string {
  if (argv.length !== 2 || argv[0] !== "--fleet" || argv[1]?.trim().length === 0) {
    throw new StartingSlicePilotUsageError(
      "usage: npm run starting-slice:pilot -- --fleet ai-runs/fleet/<label>",
    );
  }
  return resolve(argv[1]!);
}

function main(): void {
  let fleetDir: string;
  try {
    fleetDir = parseFleetDir(process.argv.slice(2));
  } catch (error) {
    if (error instanceof StartingSlicePilotUsageError) {
      console.error(error.message);
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  const result = validateStartingSlicePilot({
    root: process.cwd(),
    fleetDir,
  });
  let outputPath: string;
  try {
    outputPath = writePilotArtifactSafely(fleetDir, result);
  } catch (error) {
    console.error(
      `Could not write pilot artifact: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 2;
    return;
  }

  const name = startingSliceFleetDisplayName(result);
  if (!result.valid) {
    console.error(`${name}: invalid pilot evidence`);
    for (const error of result.validity_errors) console.error(`- ${error}`);
    console.error(`Wrote ${outputPath}`);
    process.exitCode = 2;
    return;
  }
  if (!result.pilot_passed) {
    console.error(
      `${name}: authenticated pilot missed ${result.gate_failures.length} quality and ${result.pilot_gate_failures.length} pilot gate(s)`,
    );
    for (const gate of result.gate_failures) console.error(`- quality:${gate}`);
    for (const gate of result.pilot_gate_failures) console.error(`- pilot:${gate}`);
    console.error(`Wrote ${outputPath}`);
    process.exitCode = 1;
    return;
  }

  console.log(`${name}: starting-slice readiness pilot passed`);
  console.log(`Authenticated actual model: ${result.authenticated_actual_model}`);
  console.log("Authority certification: false (a pilot can never certify the milestone)");
  console.log(`Wrote ${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
