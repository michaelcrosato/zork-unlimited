/**
 * bug_0163 — the held-out generator corpus is sealed, deterministic, and still clears the bar.
 *
 * The procedural generators (src/gen/{cyoa,rpg}_generator.ts) mint fresh, validator-clean packs
 * the assessor checks every cycle — but those windows were minted-and-DISCARDED in memory. bin/
 * seal-corpus.ts persists a FIXED seed window as a committed, content-hash-sealed artifact under
 * the top-level `corpus/` dir (NEVER under content/{cyoa,parser,rpg}/pack, so it adds no blind-
 * playtest obligation and keeps all_packs_validated_by_bar.test.ts's discovery at exactly the 10
 * curated packs). This is the contamination-control substrate the benchmark thesis requires: a
 * sealed, timestamped, held-out split (docs/CURRENT_PLAN.md "HELD-OUT CORPUS PERSISTENCE";
 * docs/ULTRAPLAN-2026-06-02.md).
 *
 * This guard is the STANDING re-mint-and-verify check that keeps the corpus honest. Mirroring
 * all_packs_validated_by_bar.test.ts's discovery/zero-error pattern, for EVERY corpus/manifest.json
 * entry it asserts ALL of:
 *   1. RE-MINT DETERMINISM — re-minting from the recorded seed via the same generator reproduces
 *      the recorded content_hash byte-for-byte (no wall-clock; the hashState seal IS the proof).
 *   2. GENERATOR VERSION MATCH — entry.generator_version equals the live CYOA/RPG_GENERATOR_VERSION,
 *      so a generator bump that forgets a re-seal is a loud, diagnosable "generator changed".
 *   3. YAML ROUND-TRIP STABILITY — the committed corpus/<mode>/<pack_id>.yaml parses and re-hashes
 *      to the recorded content_hash (the on-disk YAML is byte-faithful to the minted pack).
 *   4. PRODUCTION-BAR CLEAN — validateCyoa/validateRpg on the re-mint returns ZERO findings (the
 *      corpus clears the SAME bar the curated packs do — this STRENGTHENS, never weakens).
 *   5. MANIFEST COUNT — the entry count equals the seeded window size (no silent drop/add).
 *
 * A generator change that shifts an emitted pack, a tampered corpus file, a dropped/added entry,
 * or a forgotten re-seal all fail loudly here. Re-seal with `npm run corpus:seal`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { generateCyoaPack, CYOA_GENERATOR_VERSION } from "../../src/gen/cyoa_generator.js";
import { generateRpgPack, RPG_GENERATOR_VERSION } from "../../src/gen/rpg_generator.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { hashState } from "../../src/core/hash.js";

const root = process.cwd();

type ManifestEntry = {
  mode: "cyoa" | "rpg";
  seed: number;
  pack_id: string;
  generator_version: number;
  content_hash: string;
};

const manifest = JSON.parse(readFileSync(join(root, "corpus", "manifest.json"), "utf8")) as {
  generated_by: string;
  entries: ManifestEntry[];
};
const ENTRIES = manifest.entries;

// The fixed seed windows bin/seal-corpus.ts seals — kept in sync here so a silent drop/add of an
// entry (or a generator that stops emitting one) is caught by the count assertion below.
const CYOA_WINDOW = 4;
const RPG_WINDOW = 4;

describe("bug_0163 — the held-out generator corpus is sealed, deterministic, and bar-clean", () => {
  it("the manifest entry count equals the seeded window size (no silent drop/add)", () => {
    const cyoa = ENTRIES.filter((e) => e.mode === "cyoa");
    const rpg = ENTRIES.filter((e) => e.mode === "rpg");
    expect(cyoa.length, "cyoa corpus window size drifted").toBe(CYOA_WINDOW);
    expect(rpg.length, "rpg corpus window size drifted").toBe(RPG_WINDOW);
    expect(ENTRIES.length, "total corpus window size drifted").toBe(CYOA_WINDOW + RPG_WINDOW);
  });

  it.each(ENTRIES.map((e) => [`${e.mode}/${e.pack_id} (seed ${e.seed})`, e] as const))(
    "%s re-mints deterministically, round-trips, version-matches, and validates clean",
    (_label, entry) => {
      if (entry.mode === "cyoa") {
        // (1) re-mint determinism — same seed reproduces the recorded hash byte-for-byte.
        const remint = generateCyoaPack(entry.seed);
        expect(hashState(remint), "re-mint hash drifted from the sealed content_hash").toBe(
          entry.content_hash,
        );

        // (2) generator version match.
        expect(entry.generator_version, "generator_version mismatch — generator changed?").toBe(
          CYOA_GENERATOR_VERSION,
        );

        // (3) committed YAML round-trips to the same hash (on-disk is byte-faithful to the mint).
        const yamlPath = join(root, "corpus", "cyoa", `${entry.pack_id}.yaml`);
        const fromDisk = parseYaml(readFileSync(yamlPath, "utf8"));
        expect(hashState(fromDisk), "committed YAML does not round-trip to the sealed hash").toBe(
          entry.content_hash,
        );

        // (4) production-bar clean — zero findings of ANY severity.
        const report = validateCyoa(remint);
        expect(
          report.findings,
          `corpus pack ${entry.pack_id} has findings: ` +
            report.findings.map((f) => `${f.severity}/${f.code}: ${f.message}`).join(" | "),
        ).toEqual([]);
      } else {
        // (1) re-mint determinism.
        const remint = generateRpgPack(entry.seed);
        expect(hashState(remint), "re-mint hash drifted from the sealed content_hash").toBe(
          entry.content_hash,
        );

        // (2) generator version match.
        expect(entry.generator_version, "generator_version mismatch — generator changed?").toBe(
          RPG_GENERATOR_VERSION,
        );

        // (3) committed YAML round-trips to the same hash.
        const yamlPath = join(root, "corpus", "rpg", `${entry.pack_id}.yaml`);
        const fromDisk = parseYaml(readFileSync(yamlPath, "utf8"));
        expect(hashState(fromDisk), "committed YAML does not round-trip to the sealed hash").toBe(
          entry.content_hash,
        );

        // (4) production-bar clean — the full parser + RPG bar (combat/score included).
        const report = validateRpg(remint);
        expect(
          report.findings,
          `corpus pack ${entry.pack_id} has findings: ` +
            report.findings.map((f) => `${f.severity}/${f.code}: ${f.message}`).join(" | "),
        ).toEqual([]);
      }
    },
  );
});
