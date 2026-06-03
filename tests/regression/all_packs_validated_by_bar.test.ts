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

  it("discovers all ten shipped packs (sanity: discovery is finding them)", () => {
    expect(packs).toEqual([
      "content/cyoa/pack/clockwork_heist.yaml",
      "content/cyoa/pack/dead_reckoning.yaml",
      "content/cyoa/pack/tithe_barn.yaml",
      "content/cyoa/pack/watchtower_road.yaml",
      "content/cyoa/pack/white_stag.yaml",
      "content/cyoa/pack/wreckers_light.yaml",
      "content/parser/pack/alchemists_tower.yaml",
      "content/parser/pack/sealed_crypt.yaml",
      "content/rpg/pack/cold_forge.yaml",
      "content/rpg/pack/sunken_barrow.yaml",
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
