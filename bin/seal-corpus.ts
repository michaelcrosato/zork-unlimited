#!/usr/bin/env -S npx tsx
/**
 * bin/seal-corpus — seal the held-out generator corpus (bug_0163, docs/CURRENT_PLAN.md
 * "HELD-OUT CORPUS PERSISTENCE").
 *
 * The procedural generators (src/gen/{cyoa,rpg}_generator.ts) already mint fresh, schema-valid,
 * validator-clean packs the assessor checks every cycle — but those windows are minted-and-
 * DISCARDED in memory. This CLI converts a FIXED, explicit seed window into a committed,
 * content-hash-sealed artifact under the top-level `corpus/` dir: the contamination-control
 * substrate the benchmark thesis requires (a sealed, timestamped, held-out split whose git
 * commit timestamp — post the relevant model cutoffs — supplies the chain-of-custody, and whose
 * `hashState` seal is the wall-clock-free reproducibility proof, §8.5/§8.6).
 *
 * Usage:
 *   npm run corpus:seal      # emit corpus/{cyoa,rpg,parser}/<pack_id>.yaml + corpus/manifest.json
 *
 * Deterministic and key-free: a fixed seed window, the pure mulberry32 generators, the same
 * `hashState` the MCP generate_pack/generate_rpg_pack tools emit, and a key-sorted manifest, so
 * re-running produces a BYTE-IDENTICAL tree (the regression test + a second run prove it). It
 * REFUSES to seal a dirty corpus: every minted pack must clear the SAME production validator the
 * curated packs do (validateCyoa / validateRpg / validateParser, zero findings) or it throws.
 * The corpus spans all three modes, so the held-out split exercises the whole verifier suite
 * (the parser validator is the strictest of the three) against fresh content every cycle.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import { generateCyoaPack, CYOA_GENERATOR_VERSION } from "../src/gen/cyoa_generator.js";
import { generateRpgPack, RPG_GENERATOR_VERSION } from "../src/gen/rpg_generator.js";
import { generateParserPack, PARSER_GENERATOR_VERSION } from "../src/gen/parser_generator.js";
import { validateCyoa } from "../src/validate/cyoa_validator.js";
import { validateRpg } from "../src/validate/rpg_validator.js";
import { validateParser } from "../src/validate/parser_validator.js";
import { hashState } from "../src/core/hash.js";

// Fixed, explicit seed windows — a STABLE committed snapshot, NOT a moving window. Do not source
// these from AI_LOOP_STATE.md: the corpus must stay byte-identical across re-seals.
const CYOA_SEEDS = [0, 1, 2, 3] as const;
const RPG_SEEDS = [0, 1, 2, 3] as const;
const PARSER_SEEDS = [0, 1, 2, 3] as const;

type ManifestEntry = {
  mode: "cyoa" | "rpg" | "parser";
  seed: number;
  pack_id: string;
  generator_version: number;
  content_hash: string;
};

/** Serialize an object with keys sorted recursively, so the committed JSON is byte-stable. */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = sortDeep(obj[key]);
    return out;
  }
  return value;
}

function main(): void {
  const root = process.cwd();
  const entries: ManifestEntry[] = [];

  for (const seed of CYOA_SEEDS) {
    const pack = generateCyoaPack(seed);
    const report = validateCyoa(pack);
    if (report.findings.length > 0) {
      throw new Error(
        `refusing to seal a dirty CYOA pack (seed ${seed}, ${pack.meta.id}): ` +
          report.findings.map((f) => `${f.severity}/${f.code}: ${f.message}`).join(" | "),
      );
    }
    const dir = join(root, "corpus", "cyoa");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${pack.meta.id}.yaml`), stringify(pack));
    entries.push({
      mode: "cyoa",
      seed,
      pack_id: pack.meta.id,
      generator_version: CYOA_GENERATOR_VERSION,
      content_hash: hashState(pack),
    });
  }

  for (const seed of RPG_SEEDS) {
    const pack = generateRpgPack(seed);
    const report = validateRpg(pack);
    if (report.findings.length > 0) {
      throw new Error(
        `refusing to seal a dirty RPG pack (seed ${seed}, ${pack.meta.id}): ` +
          report.findings.map((f) => `${f.severity}/${f.code}: ${f.message}`).join(" | "),
      );
    }
    const dir = join(root, "corpus", "rpg");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${pack.meta.id}.yaml`), stringify(pack));
    entries.push({
      mode: "rpg",
      seed,
      pack_id: pack.meta.id,
      generator_version: RPG_GENERATOR_VERSION,
      content_hash: hashState(pack),
    });
  }

  for (const seed of PARSER_SEEDS) {
    const pack = generateParserPack(seed);
    const report = validateParser(pack);
    if (report.findings.length > 0) {
      throw new Error(
        `refusing to seal a dirty PARSER pack (seed ${seed}, ${pack.meta.id}): ` +
          report.findings.map((f) => `${f.severity}/${f.code}: ${f.message}`).join(" | "),
      );
    }
    const dir = join(root, "corpus", "parser");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${pack.meta.id}.yaml`), stringify(pack));
    entries.push({
      mode: "parser",
      seed,
      pack_id: pack.meta.id,
      generator_version: PARSER_GENERATOR_VERSION,
      content_hash: hashState(pack),
    });
  }

  // Deterministic, key-sorted entry order so the committed manifest is byte-stable.
  entries.sort((a, b) => (a.mode === b.mode ? a.seed - b.seed : a.mode < b.mode ? -1 : 1));
  const manifest = { generated_by: "bin/seal-corpus.ts", entries: entries.map(sortDeep) };
  writeFileSync(join(root, "corpus", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  console.log(
    `Sealed ${entries.length} packs into corpus/ ` +
      `(${CYOA_SEEDS.length} cyoa + ${RPG_SEEDS.length} rpg + ${PARSER_SEEDS.length} parser); manifest written.`,
  );
}

main();
