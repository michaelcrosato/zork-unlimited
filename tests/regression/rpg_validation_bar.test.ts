/**
 * Single-engine validation bar.
 *
 * `npm run validate` is the public content gate for the consolidated RPG mode.
 * It should validate every shipped RPG pack by discovery, while `npm run health`
 * should delegate to that gate instead of carrying a hand-maintained multi-mode
 * list of legacy CYOA/parser packs.
 */
import { spawnSync } from "node:child_process";
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

const root = process.cwd();
const RPG_PACK_DIR = "content/rpg/pack";

function discoverRpgPacks(): string[] {
  return readdirSync(join(root, RPG_PACK_DIR))
    .filter((file) => file.endsWith(".yaml"))
    .sort()
    .map((file) => `${RPG_PACK_DIR}/${file}`);
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string | undefined>;
};

function runNpm(command: string, timeout = 120_000) {
  return spawnSync(command, {
    cwd: root,
    encoding: "utf8",
    shell: true,
    timeout,
  });
}

describe("single-engine RPG validation bar", () => {
  const packs = discoverRpgPacks();

  it("discovers the shipped RPG corpus and no legacy content packs", () => {
    expect(packs).toEqual([
      "content/rpg/pack/advocates_case.yaml",
      "content/rpg/pack/bellfounders_alarm.yaml",
      "content/rpg/pack/breaking_weir.yaml",
      "content/rpg/pack/bridgewrights_proof.yaml",
      "content/rpg/pack/cold_forge.yaml",
      "content/rpg/pack/dawn_beacon.yaml",
      "content/rpg/pack/factors_mark.yaml",
      "content/rpg/pack/falconers_ransom.yaml",
      "content/rpg/pack/gallowmere.yaml",
      "content/rpg/pack/lockkeepers_toll.yaml",
      "content/rpg/pack/powder_mill_surety.yaml",
      "content/rpg/pack/printers_night.yaml",
      "content/rpg/pack/quarrymens_fault.yaml",
      "content/rpg/pack/sunken_barrow.yaml",
      "content/rpg/pack/tanners_fever.yaml",
      "content/rpg/pack/wolf_winter.yaml",
    ]);
  });

  it.each(packs)("%s loads and validates with zero errors", (path) => {
    const loaded = loadRpgPackFile(path);
    expect(loaded.ok, `${path} failed to load as RPG`).toBe(true);
    if (!loaded.ok) return;

    const errors = validateRpg(loaded.compiled.pack).findings.filter(
      (finding) => finding.severity === "error",
    );
    expect(errors, `${path} has validation errors: ${JSON.stringify(errors)}`).toEqual([]);
  });

  it("health delegates to the RPG validation gate without legacy pack targets", () => {
    const health = pkg.scripts.health ?? "";
    expect(health).toContain("npm run validate");
    expect(health).not.toContain("content/cyoa/");
    expect(health).not.toContain("content/parser/");
  });

  it("package scripts expose one public RPG play surface and no legacy play modes", () => {
    expect(pkg.scripts.play).toBe("tsx bin/rpg_play.ts");
    expect(pkg.scripts.cyoa).toBeUndefined();
    expect(pkg.scripts["play:parser"]).toBeUndefined();
    expect(pkg.scripts["play:rpg"]).toBeUndefined();
  });

  it("legacy CYOA/parser CLI binaries have been stripped from the public bin surface", () => {
    expect(existsSync(join(root, "bin", "cyoa.ts"))).toBe(false);
    expect(existsSync(join(root, "bin", "play.ts"))).toBe(false);
    expect(existsSync(join(root, "bin", "parser_play.ts"))).toBe(false);
  });

  it("npm run validate defaults to every shipped RPG pack", () => {
    const result = runNpm("npm run validate");
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;

    expect(result.status, output).toBe(0);
    expect(output).not.toContain("mode: cyoa");
    expect(output).not.toContain("mode: parser");
    expect(output.match(/mode: rpg/g)?.length ?? 0).toBe(packs.length);
    for (const path of packs) expect(output).toContain(`== ${path} ==`);
  });

  it("npm run validate rejects legacy CYOA/parser pack targets", () => {
    const result = runNpm("npm run validate -- content/cyoa/pack/watchtower_road.yaml", 30_000);
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;

    expect(result.status, output).toBe(1);
    expect(output).toContain("unsupported legacy pack");
    expect(output).toContain("public validation is RPG-only");
  });
});
