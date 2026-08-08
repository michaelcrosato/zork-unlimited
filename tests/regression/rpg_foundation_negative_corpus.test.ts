/**
 * A SoundnessBench-style NEGATIVE CORPUS for the RPG FOUNDATION validator — the
 * file-fixture twin of bug_0182's in-memory `validateRpg` corpus
 * (rpg_validator_negative_corpus.test.ts).
 *
 * The gap this closes: when the CYOA/parser runtimes were retired, the old parser
 * validator survived as src/validate/rpg_foundation_validator.ts (reached via
 * `validateRpg`) with all its finding codes intact — but the 25 negative fixtures
 * (content/broken-fixtures/parser_*.yaml on main) that were the REJECTION-DIRECTION
 * witnesses for those codes were deleted with the runtime. Per the SoundnessBench
 * standard (arXiv:2412.03154; the single-checker blind spot, arXiv:2510.14253), a
 * checker is only proven sound if its failing branches are exercised on input that
 * SHOULD fail: without these witnesses, a regression that silently broke any
 * foundation check (a dropped `findings.push`, an inverted guard) would pass every
 * remaining test GREEN. This corpus restores each deleted fixture in RPG-pack
 * format under content/broken-fixtures/foundation_*.yaml.
 *
 * DATA-DRIVEN by discovery: every `foundation_*.yaml` in content/broken-fixtures/
 * is picked up automatically and MUST carry a machine-readable first-line header:
 *   `# MUST FAIL: <CODE>`  — the validator must emit <CODE> as an ERROR (report not ok)
 *   `# MUST WARN: <CODE>`  — the validator must emit <CODE> as a WARNING
 *   `# MUST FAIL: SCHEMA`  — the pack must be rejected at the schema LOAD boundary
 *     (RpgPackSchema), before the validator ever runs (content is data, never code).
 * A fixture that unexpectedly validates clean, emits the code at the wrong
 * severity, or lacks a parseable header FAILS the suite — no silent skips.
 *
 * PURELY ADDITIVE: no source/validator/engine/schema change — the validator is
 * exercised exactly as shipped, through the same compileRpgSource load path the
 * other RPG tests use.
 */
import { readdirSync, readFileSync } from "node:fs";
// (readFileSync also backs the validator source scan below.)
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { compileRpgSource } from "../../src/rpg/source.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

const FIXTURE_DIR = "content/broken-fixtures";
const FIXTURE_FILE_RE = /^foundation_.*\.yaml$/;
/** First-line contract: `# MUST FAIL: CODE` or `# MUST WARN: CODE`. */
const HEADER_RE = /^#\s*MUST\s+(FAIL|WARN):\s*([A-Z][A-Z0-9_]*)\s*$/;

/** The load-boundary sentinel: not a validator finding code — the schema itself
 *  must reject the pack (loading fails before any validator runs). */
const SCHEMA_SENTINEL = "SCHEMA";

type Expectation = { file: string; kind: "FAIL" | "WARN"; code: string; source: string };

const files = readdirSync(FIXTURE_DIR)
  .filter((f) => FIXTURE_FILE_RE.test(f))
  .sort();

const expectations: Expectation[] = files.map((file) => {
  const source = readFileSync(join(FIXTURE_DIR, file), "utf8");
  const firstLine = source.split("\n", 1)[0] ?? "";
  const m = HEADER_RE.exec(firstLine);
  // An unparseable header is reported as a test failure below (never a silent skip);
  // encode it as an impossible expectation so the fixture still surfaces loudly.
  if (!m) return { file, kind: "FAIL", code: "UNPARSEABLE_HEADER", source };
  return { file, kind: m[1] as "FAIL" | "WARN", code: m[2]!, source };
});

describe("RPG foundation validator negative corpus — rejection-direction witnesses", () => {
  it("discovers a non-vacuous fixture corpus", () => {
    // Coverage is pinned against validator emit sites below. Do not pin the raw file
    // count: authors may consolidate redundant fixtures while preserving every
    // rejection-direction witness.
    expect(files).not.toEqual([]);
  });

  it("every fixture carries a machine-readable MUST FAIL/WARN header", () => {
    for (const e of expectations) {
      expect(`${e.file}: ${e.code}`).not.toContain("UNPARSEABLE_HEADER");
    }
  });

  // The coverage pin used to derive its expectation FROM THE FIXTURES: `covered` was
  // compared against a hand-maintained copy of itself. It pinned what the corpus
  // happened to contain and never asked what the validator can actually emit, so a
  // brand-new finding code with no witness passed it green — and 17 codes had drifted
  // into exactly that state.
  //
  // Invert the direction. Read the emit sites out of the validator source and require
  // every one to have a witness, with the remainder as an EXPLICIT, shrinking
  // allowlist. Adding a code now fails this suite until it is either fixtured or
  // consciously listed. Source-parsing keeps the corpus purely additive, as its header
  // promises: no validator change is needed to make its codes machine-readable.
  const validatorSource = readFileSync("src/validate/rpg_foundation_validator.ts", "utf8");
  const emittedCodes = [
    ...new Set(
      [...validatorSource.matchAll(/\b(?:err|warn)\(\s*"([A-Z][A-Z0-9_]*)"/g)].map((m) => m[1]!),
    ),
  ].sort();

  /**
   * Foundation codes with no file fixture here. Every remaining entry carries a
   * direct rejection-direction witness elsewhere in tests; this allowlist keeps the
   * data-driven corpus honest without duplicating those already-strong probes.
   */
  const WITNESS_ALLOWLIST = [
    "ENDING_UNDECLARED",
    "IMPOSSIBLE_OBJECT_STATE",
    "ITEM_REQUIRED_UNOBTAINABLE",
  ];

  it("reads the validator's emit sites at all (the source scan is never vacuous)", () => {
    // If the emit shape changes, this must fail loudly rather than quietly concluding
    // the validator emits nothing and passing the coverage check by default.
    expect(emittedCodes.length).toBeGreaterThan(30);
    expect(emittedCodes).toContain("IMPOSSIBLE_GATE");
    expect(emittedCodes).toContain("SOFTLOCK");
    expect(emittedCodes).toContain("PHANTOM_VAR");
  });

  it("every foundation finding code has a rejection witness, or is explicitly allowlisted", () => {
    const covered = new Set(expectations.map((e) => e.code));
    expect(emittedCodes.filter((code) => !covered.has(code))).toEqual(WITNESS_ALLOWLIST);
  });

  it("the allowlist carries no stale entries", () => {
    const covered = new Set(expectations.map((e) => e.code));
    // A code that gained a witness must leave the list...
    expect(WITNESS_ALLOWLIST.filter((code) => covered.has(code))).toEqual([]);
    // ...and a code the validator no longer emits must leave it too.
    expect(WITNESS_ALLOWLIST.filter((code) => !emittedCodes.includes(code))).toEqual([]);
  });

  for (const e of expectations) {
    if (e.code === SCHEMA_SENTINEL) {
      it(`${e.file} is rejected at the schema load boundary (content is data, never code)`, () => {
        expect(compileRpgSource(e.source).ok).toBe(false);
      });
      continue;
    }

    it(`${e.file} ${e.kind === "FAIL" ? "fails" : "is flagged"} with ${e.code} (${e.kind === "FAIL" ? "error" : "warning"})`, () => {
      const loaded = compileRpgSource(e.source);
      // Validator fixtures must COMPILE (schema-valid) — they are unsound, not malformed.
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const report = validateRpg(loaded.compiled.pack);
      // The fixture must NOT validate clean, and must carry the declared code at
      // the declared severity — errors are errors, warns are warns.
      const hits = report.findings.filter((f) => f.code === e.code);
      expect(report.findings.map((f) => f.code)).toContain(e.code);
      for (const h of hits) {
        expect(h.severity).toBe(e.kind === "FAIL" ? "error" : "warning");
      }
      if (e.kind === "FAIL") {
        expect(report.ok).toBe(false);
      } else {
        // A MUST WARN pack stays playable (warnings never flip report.ok), but the
        // warning itself must be present — asserted via toContain above.
        expect(hits.length).toBeGreaterThanOrEqual(1);
      }
    });
  }
});
