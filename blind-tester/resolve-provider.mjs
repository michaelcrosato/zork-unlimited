#!/usr/bin/env node
/**
 * Resolve one provider + model against the registry, for shell callers.
 *
 * Plain ESM with no dependencies, deliberately. `run.sh` has to resolve a provider
 * before it can launch anything, and it runs in places with no TypeScript loader and
 * no installed dev dependencies — a bare temp clone in a test, a fresh machine, a
 * sandbox with no network. A `tsx` invocation here fails in exactly those places, and
 * the failure looks like "your provider is invalid" rather than "the toolchain is
 * missing", which is the worst possible error to debug.
 *
 * The typed module (src/blind/providers.ts) parses the SAME JSON file, so there is one
 * source of truth and nothing to keep in sync. Validation here is intentionally thin —
 * enough to give the shell an actionable message — because the typed module and its
 * tests own the full schema.
 *
 * Prints one TAB-separated line: kind, isolation, model, tier. Exits 2 with a
 * human-readable reason on failure; the caller surfaces it verbatim.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const [providerId, requestedModel] = process.argv.slice(2);
if (!providerId) fail("usage: resolve-provider.mjs <provider> [model]");

const registry = readJson(join(HERE, "providers.json"));
const providers = Array.isArray(registry?.providers) ? registry.providers : [];
if (providers.length === 0) fail("blind-tester/providers.json declares no providers");

const provider = providers.find((candidate) => candidate.id === providerId);
if (!provider) {
  const known = providers
    .map((candidate) => candidate.id)
    .sort()
    .join(", ");
  fail(`--provider "${providerId}" is not registered; known providers: ${known}`);
}

const catalog = readJson(join(REPO_ROOT, provider.catalogPath));
const models = Array.isArray(catalog?.models) ? catalog.models : [];
if (catalog?.provider !== provider.id) {
  fail(
    `catalog ${provider.catalogPath} declares provider "${catalog?.provider}" but is registered for "${provider.id}"`,
  );
}
if (models.length === 0) fail(`catalog ${provider.catalogPath} lists no models`);

// An alias is refused on purpose: it resolves to different weights over time, so a
// session recorded under one would stop meaning what its record says it means.
const model = requestedModel
  ? models.find((candidate) => candidate.id === requestedModel)
  : (models.find((candidate) => candidate.tier === "volume") ?? models[0]);

if (!model) {
  const known = models.map((candidate) => candidate.id).join(", ");
  fail(`model "${requestedModel}" is not in the ${provider.id} catalog; known models: ${known}`);
}

process.stdout.write(`${provider.kind}\t${provider.isolation}\t${model.id}\t${model.tier}\n`);
