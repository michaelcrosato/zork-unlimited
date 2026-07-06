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
  it("discovers the full fixture corpus (mass-deletion tripwire)", () => {
    // Exactly the 25 witnesses recovered from main's retired parser corpus; adding
    // a fixture should consciously raise this floor, deleting one must fail here.
    expect(files.length).toBeGreaterThanOrEqual(25);
  });

  it("every fixture carries a machine-readable MUST FAIL/WARN header", () => {
    for (const e of expectations) {
      expect(`${e.file}: ${e.code}`).not.toContain("UNPARSEABLE_HEADER");
    }
  });

  it("the corpus covers the expected foundation finding codes (coverage pin)", () => {
    const covered = [...new Set(expectations.map((e) => e.code))].sort();
    expect(covered).toEqual([
      "AMBIGUOUS_ALIAS",
      "DIALOGUE_NONTERMINATING",
      "DUPLICATE_ID",
      "END_GAME_UNDECLARED",
      "EXIT_TARGET_MISSING",
      "HELD_ALSO_PLACED",
      "IMPOSSIBLE_GATE",
      "ITEM_REF_MISSING",
      "KEY_MISSING",
      "OBJECT_STATE_REF_MISSING",
      "SCHEMA",
      "SCORE_UNREACHABLE",
      "SOFTLOCK",
      "SOFTLOCK_QUEST_ITEM",
      "UNLOCK_EXIT_ROOM_MISSING",
      "UNREACHABLE_VARIANT",
      "UNRESOLVED_ROOM_REFERENCE",
      "UNSATISFIABLE_CONDITION",
      "WIN_FIRES_AT_START",
      "WIN_IS_DEATH",
      "WIN_UNREACHABLE",
    ]);
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
