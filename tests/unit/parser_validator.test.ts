/**
 * Parser validator (§10.2) + negative fixtures (§10.4).
 *
 * The shipped pack must validate green. Each broken fixture must fail with its
 * intended error code — a validator that never rejects is worthless, so these
 * double as the CI proof that validation actually bites.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import { validateParser } from "../../src/validate/parser_validator.js";

describe("parser validator — shipped packs", () => {
  for (const path of [
    "content/parser/pack/sealed_crypt.yaml",
    "content/parser/pack/alchemists_tower.yaml",
  ]) {
    it(`${path} validates with no errors or warnings`, () => {
      const loaded = loadParserPackFile(path);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const report = validateParser(loaded.compiled.pack);
      expect(report.ok).toBe(true);
      expect(report.findings).toHaveLength(0);
    });
  }
});

describe("parser validator — negative fixtures must fail (§10.4)", () => {
  const VALIDATOR_FIXTURES: [string, string][] = [
    ["parser_exit_target_missing", "EXIT_TARGET_MISSING"],
    ["parser_unresolved_room_reference", "UNRESOLVED_ROOM_REFERENCE"],
    ["parser_key_missing", "KEY_MISSING"],
    ["parser_impossible_gate", "IMPOSSIBLE_GATE"],
    ["parser_win_unreachable", "WIN_UNREACHABLE"],
    ["parser_softlock", "SOFTLOCK"],
    ["parser_softlock_quest_item", "SOFTLOCK_QUEST_ITEM"],
    ["parser_softlock_quest_item_consumed", "SOFTLOCK_QUEST_ITEM"],
    ["parser_duplicate_id", "DUPLICATE_ID"],
    ["parser_ambiguous_alias", "AMBIGUOUS_ALIAS"],
    ["parser_dialogue_nonterminating", "DIALOGUE_NONTERMINATING"],
    ["parser_dialogue_gated_nonterminating", "DIALOGUE_NONTERMINATING"],
    ["parser_score_unreachable", "SCORE_UNREACHABLE"],
    ["parser_end_game_undeclared", "END_GAME_UNDECLARED"],
    ["parser_win_is_death", "WIN_IS_DEATH"],
    ["parser_win_fires_at_start", "WIN_FIRES_AT_START"],
    ["parser_held_also_placed", "HELD_ALSO_PLACED"],
  ];

  for (const [file, code] of VALIDATOR_FIXTURES) {
    it(`${file} fails with ${code}`, () => {
      const loaded = loadParserPackFile(`content/broken-fixtures/${file}.yaml`);
      expect(loaded.ok).toBe(true); // compiles (schema-valid) but is unplayable
      if (!loaded.ok) return;
      const report = validateParser(loaded.compiled.pack);
      expect(report.ok).toBe(false);
      expect(report.findings.map((f) => f.code)).toContain(code);
    });
  }

  // Warning-severity fixtures: dead reactive content (a shadowed or unsatisfiable
  // variant/guard). These do NOT make the pack unplayable (report.ok stays true), so
  // we assert the code is present rather than report.ok === false (mirrors the CYOA
  // validator's UNREACHABLE_VARIANT / UNSATISFIABLE_CONDITION fixtures).
  const WARNING_FIXTURES: [string, string][] = [
    ["parser_unreachable_variant", "UNREACHABLE_VARIANT"],
    ["parser_unsatisfiable_condition", "UNSATISFIABLE_CONDITION"],
  ];
  for (const [file, code] of WARNING_FIXTURES) {
    it(`${file} is flagged ${code} (warning)`, () => {
      const loaded = loadParserPackFile(`content/broken-fixtures/${file}.yaml`);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const report = validateParser(loaded.compiled.pack);
      expect(report.findings.map((f) => f.code)).toContain(code);
    });
  }

  const SCHEMA_FIXTURES = ["parser_empty_text", "parser_unknown_effect", "parser_held_takeable"];
  for (const file of SCHEMA_FIXTURES) {
    it(`${file} is rejected by the schema (content is data, never code — §16)`, () => {
      expect(loadParserPackFile(`content/broken-fixtures/${file}.yaml`).ok).toBe(false);
    });
  }
});
