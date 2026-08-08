import { randomBytes } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  futimesSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { pathToFileURL } from "node:url";

function regularFile(path, label) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file: ${path}`);
  }
  return stat;
}

/**
 * Atomically publishes immutable bytes without inheriting the source timestamp.
 *
 * The complete artifact is first written and synced beside its destination. An
 * exclusive hard link then makes that regular file visible at the canonical
 * path in one filesystem operation. `after` establishes the observable report
 * -> evidence -> sidecar publication order without changing the bound bytes.
 */
export function publishRegularArtifact(source, destination, { after } = {}) {
  regularFile(source, "publication source");
  const predecessorMtimeMs = after
    ? regularFile(after, "publication predecessor").mtimeMs
    : Number.NEGATIVE_INFINITY;
  const contents = readFileSync(source);
  const staging = `${destination}.publish-${process.pid}-${randomBytes(8).toString("hex")}.tmp`;
  let descriptor;
  let destinationPublished = false;

  try {
    descriptor = openSync(staging, "wx", 0o600);
    writeFileSync(descriptor, contents);
    fsyncSync(descriptor);

    const publicationTime = new Date(Math.max(Date.now(), Math.ceil(predecessorMtimeMs)));
    futimesSync(descriptor, publicationTime, publicationTime);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;

    const staged = regularFile(staging, "staged publication artifact");
    if (staged.mtimeMs < predecessorMtimeMs) {
      throw new Error("filesystem could not preserve publication ordering");
    }
    if (!readFileSync(staging).equals(contents)) {
      throw new Error("staged publication bytes differ from private source");
    }

    // Linking is atomic and fails when the canonical destination already exists.
    // Unlike a symlink, the resulting canonical path is itself a regular file.
    linkSync(staging, destination);
    destinationPublished = true;

    const published = regularFile(destination, "published artifact");
    if (published.mtimeMs < predecessorMtimeMs) {
      throw new Error("published artifact predates its predecessor");
    }
    if (!readFileSync(destination).equals(contents)) {
      throw new Error("published artifact bytes differ from private source");
    }

    unlinkSync(staging);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Best-effort cleanup after an earlier publication failure.
      }
    }
    if (destinationPublished) {
      try {
        unlinkSync(destination);
      } catch {
        // Best-effort cleanup after an earlier publication failure.
      }
    }
    try {
      unlinkSync(staging);
    } catch {
      // Best-effort cleanup after an earlier publication failure.
    }
    throw error;
  }
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined || values.has(flag)) {
      throw new Error(
        "Usage: publish-artifact.mjs --source <file> --destination <file> --after <file>",
      );
    }
    values.set(flag, value);
  }
  for (const flag of values.keys()) {
    if (!["--source", "--destination", "--after"].includes(flag)) {
      throw new Error(`Unknown option: ${flag}`);
    }
  }
  const source = values.get("--source");
  const destination = values.get("--destination");
  const after = values.get("--after");
  if (!source || !destination || !after) {
    throw new Error(
      "Usage: publish-artifact.mjs --source <file> --destination <file> --after <file>",
    );
  }
  return { source, destination, after };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { source, destination, after } = parseArgs(process.argv.slice(2));
    publishRegularArtifact(source, destination, { after });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
