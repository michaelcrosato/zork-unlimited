#!/usr/bin/env -S npx tsx

import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  certifyStartingSliceFleet,
  startingSliceFleetDisplayName,
} from "../src/starting_slice/fleet_certifier.js";

const AUTHORITATIVE_FLEET_SIZE = 100;

class StartingSliceCertificationUsageError extends Error {}

function parseFleetDir(argv: string[]): string {
  if (argv.length !== 2 || argv[0] !== "--fleet" || argv[1]?.trim().length === 0) {
    throw new StartingSliceCertificationUsageError(
      "usage: npm run starting-slice:certify -- --fleet ai-runs/fleet/<label>",
    );
  }
  return resolve(argv[1]!);
}

function canonicalRealpath(path: string): string {
  return realpathSync.native(path);
}

function containedPath(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function existingOutputIsSafe(outputPath: string, fleetRoot: string): void {
  let stats;
  try {
    stats = lstatSync(outputPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (stats.isSymbolicLink()) {
    throw new Error("existing certification output must not be a symbolic link");
  }
  if (!stats.isFile()) {
    throw new Error("existing certification output must be a regular file");
  }
  if (stats.nlink !== 1) {
    throw new Error("existing certification output must not have multiple hard links");
  }
  if (!containedPath(fleetRoot, canonicalRealpath(outputPath))) {
    throw new Error("existing certification output escapes the fleet directory");
  }
}

/** Safely publish one certification result without ever truncating a link target. */
export function writeCertificationArtifactSafely(fleetDir: string, result: unknown): string {
  const canonicalFleetDir = resolve(fleetDir);
  const fleetStats = lstatSync(canonicalFleetDir);
  if (fleetStats.isSymbolicLink() || !fleetStats.isDirectory()) {
    throw new Error("certification fleet directory must be a real directory");
  }
  const fleetRoot = canonicalRealpath(canonicalFleetDir);
  const outputPath = resolve(canonicalFleetDir, "starting-slice-certification.json");
  existingOutputIsSafe(outputPath, fleetRoot);

  const payload = `${JSON.stringify(result, null, 2)}\n`;
  let tempPath: string | null = null;
  let descriptor: number | null = null;
  try {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const candidate = join(
        canonicalFleetDir,
        `.starting-slice-certification.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
      );
      try {
        descriptor = openSync(candidate, "wx", 0o600);
        tempPath = candidate;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    if (descriptor === null || tempPath === null) {
      throw new Error("could not reserve an exclusive certification temp file");
    }
    writeFileSync(descriptor, payload, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;

    const tempStats = lstatSync(tempPath);
    if (!tempStats.isFile() || tempStats.isSymbolicLink() || tempStats.nlink !== 1) {
      throw new Error("certification temp artifact is not a private regular file");
    }
    if (!containedPath(fleetRoot, canonicalRealpath(tempPath))) {
      throw new Error("certification temp artifact escaped the fleet directory");
    }
    // Rename replaces the directory entry itself; it never opens or truncates
    // a destination symlink/hardlink target.
    renameSync(tempPath, outputPath);
    tempPath = null;
    return outputPath;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (tempPath !== null) {
      try {
        unlinkSync(tempPath);
      } catch {
        // Preserve the original publication error.
      }
    }
  }
}

function main(): void {
  let fleetDir: string;
  try {
    fleetDir = parseFleetDir(process.argv.slice(2));
  } catch (error) {
    if (error instanceof StartingSliceCertificationUsageError) {
      console.error(error.message);
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  const result = certifyStartingSliceFleet({
    root: process.cwd(),
    fleetDir,
    expectedCount: AUTHORITATIVE_FLEET_SIZE,
  });
  let outputPath: string;
  try {
    outputPath = writeCertificationArtifactSafely(fleetDir, result);
  } catch (error) {
    console.error(
      `Could not write certification artifact: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 2;
    return;
  }

  const name = startingSliceFleetDisplayName(result);
  if (!result.valid) {
    console.error(`${name}: invalid certification evidence`);
    for (const error of result.validity_errors) console.error(`- ${error}`);
    console.error(`Wrote ${outputPath}`);
    process.exitCode = 2;
    return;
  }
  if (!result.passed) {
    console.error(`${name}: authenticated cohort missed ${result.gate_failures.length} gate(s)`);
    for (const gate of result.gate_failures) console.error(`- ${gate}`);
    console.error(`Wrote ${outputPath}`);
    process.exitCode = 1;
    return;
  }

  console.log(`${name}: starting-slice certification passed`);
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
