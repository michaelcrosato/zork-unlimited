/**
 * bug_0096 — every shipped pack must be inside the verification bar.
 *
 * The enforced bar is `npm run health` (AGENTS.md "trust, but verify": the automated
 * verification is the thing that stays honest). Its `validate --` chain, however, was
 * hand-listed and had silently fallen BEHIND the content: it validated only 4 of the 6
 * shipped packs — `clockwork_heist` (cyoa) and `alchemists_tower` (parser) were never
 * validated by `health` at all. A schema/soundness regression in either (or in any
 * future pack added without remembering to extend the string) would sail straight
 * through the bar. The per-pack regression tests cover specific scenes; nothing
 * guaranteed that EVERY pack still validates clean, nor that the bar even looks at it.
 *
 * This guard closes both holes structurally, by DISCOVERY rather than a hand list, so it
 * can never drift again:
 *   (1) every pack under content/{cyoa,parser,rpg}/pack/*.yaml loads and validates with
 *       ZERO errors (its mode auto-detected exactly as bin/validate.ts does);
 *   (2) the `health` npm script contains a `validate --` step for every discovered pack,
 *       so the human-facing bar can never silently omit one.
 * Adding a new pack now FAILS this test until it both validates clean and is wired into
 * health — the omission becomes loud instead of invisible.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { loadParserPackFile } from "../../src/parser/pack.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import type { Finding } from "../../src/validate/report.js";

const root = process.cwd();
const PACK_DIRS = ["content/cyoa/pack", "content/parser/pack", "content/rpg/pack"];

function discoverPacks(): string[] {
  const out: string[] = [];
  for (const dir of PACK_DIRS) {
    for (const file of readdirSync(join(root, dir))) {
      if (file.endsWith(".yaml")) out.push(`${dir}/${file}`);
    }
  }
  return out.sort();
}

/** Mirror bin/validate.ts's mode auto-detection exactly. */
function detectMode(path: string): "cyoa" | "parser" | "rpg" {
  const raw = parseYaml(readFileSync(join(root, path), "utf8")) as Record<string, unknown> | null;
  const isObj = !!raw && typeof raw === "object";
  if (isObj && "enemies" in raw) return "rpg";
  if (isObj && "rooms" in raw) return "parser";
  return "cyoa";
}

function validateByMode(path: string): Finding[] {
  switch (detectMode(path)) {
    case "rpg": {
      const r = loadRpgPackFile(path);
      expect(r.ok, `${path} failed to load (rpg schema)`).toBe(true);
      return r.ok ? validateRpg(r.compiled.pack).findings : [];
    }
    case "parser": {
      const r = loadParserPackFile(path);
      expect(r.ok, `${path} failed to load (parser schema)`).toBe(true);
      return r.ok ? validateParser(r.compiled.pack).findings : [];
    }
    default: {
      const r = loadPackFile(path);
      expect(r.ok, `${path} failed to load (cyoa schema)`).toBe(true);
      return r.ok ? validateCyoa(r.compiled.pack).findings : [];
    }
  }
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("bug_0096 — every shipped pack is inside the verification bar", () => {
  const packs = discoverPacks();

  it("discovers all thirty-nine shipped packs (sanity: discovery is finding them)", () => {
    expect(packs).toEqual([
      "content/cyoa/pack/alnagers_fault.yaml",
      "content/cyoa/pack/bellmans_round.yaml",
      "content/cyoa/pack/clockwork_heist.yaml",
      "content/cyoa/pack/croft_inquest.yaml",
      "content/cyoa/pack/dead_reckoning.yaml",
      "content/cyoa/pack/examiners_commission.yaml",
      "content/cyoa/pack/excise_surveyors_round.yaml",
      "content/cyoa/pack/ferrymansprice.yaml",
      "content/cyoa/pack/fire_office_examiner.yaml",
      "content/cyoa/pack/fishermans_privilege.yaml",
      "content/cyoa/pack/midnight_edition.yaml",
      "content/cyoa/pack/night_dispensary.yaml",
      "content/cyoa/pack/priors_cellar.yaml",
      "content/cyoa/pack/tidewaiters_watch.yaml",
      "content/cyoa/pack/tithe_barn.yaml",
      "content/cyoa/pack/watchtower_road.yaml",
      "content/cyoa/pack/white_stag.yaml",
      "content/cyoa/pack/wreckers_light.yaml",
      "content/parser/pack/alchemists_tower.yaml",
      "content/parser/pack/cellarmans_dark.yaml",
      "content/parser/pack/collectors_warrant.yaml",
      "content/parser/pack/coroners_errand.yaml",
      "content/parser/pack/friars_postern.yaml",
      "content/parser/pack/gaugers_register.yaml",
      "content/parser/pack/lamplighters_round.yaml",
      "content/parser/pack/scriveners_proof.yaml",
      "content/parser/pack/sealed_crypt.yaml",
      "content/parser/pack/tide_mill.yaml",
      "content/parser/pack/weighmasters_round.yaml",
      "content/rpg/pack/advocates_case.yaml",
      "content/rpg/pack/breaking_weir.yaml",
      "content/rpg/pack/cold_forge.yaml",
      "content/rpg/pack/dawn_beacon.yaml",
      "content/rpg/pack/factors_mark.yaml",
      "content/rpg/pack/falconers_ransom.yaml",
      "content/rpg/pack/gallowmere.yaml",
      "content/rpg/pack/sunken_barrow.yaml",
      "content/rpg/pack/tanners_fever.yaml",
      "content/rpg/pack/wolf_winter.yaml",
    ]);
  });

  it.each(packs)("%s loads and validates with zero errors", (path) => {
    const errors = validateByMode(path).filter((f) => f.severity === "error");
    expect(errors, `${path} has validation errors: ${JSON.stringify(errors)}`).toEqual([]);
  });

  it("npm run health validates every discovered pack (the bar can't omit one)", () => {
    const health = pkg.scripts.health;
    for (const path of packs) {
      expect(health, `health is missing a 'validate -- ${path}' step`).toContain(
        `npm run validate -- ${path}`,
      );
    }
  });
});
