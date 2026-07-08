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
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const root = process.cwd();
const RPG_PACK_DIR = "content/rpg/quests";

function discoverRpgPacks(): string[] {
  return readdirSync(join(root, RPG_PACK_DIR))
    .filter((file) => file.endsWith(".yaml"))
    .sort()
    .map((file) => `${RPG_PACK_DIR}/${file}`);
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string | undefined>;
};
const readme = readFileSync(join(root, "README.md"), "utf8");
const validateCli = readFileSync(join(root, "bin", "validate.ts"), "utf8");

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
  const worldQuestIds = loadOverworldManifest(root)
    .quests.map((quest) => quest.id)
    .sort();

  it("discovers the shipped RPG corpus and no legacy content packs", () => {
    expect(packs).toEqual([
      "content/rpg/quests/advocates_case.yaml",
      "content/rpg/quests/breaking_weir.yaml",
      "content/rpg/quests/cold_forge.yaml",
      "content/rpg/quests/dawn_beacon.yaml",
      "content/rpg/quests/factors_mark.yaml",
      "content/rpg/quests/falconers_ransom.yaml",
      "content/rpg/quests/gallowmere.yaml",
      "content/rpg/quests/printers_night.yaml",
      "content/rpg/quests/sunken_barrow.yaml",
      "content/rpg/quests/tanners_fever.yaml",
      "content/rpg/quests/tide_mill.yaml",
      "content/rpg/quests/wolf_winter.yaml",
    ]);
  });

  it("binds every shipped pack to exactly one overworld quest (single-world registry)", () => {
    expect(worldQuestIds).toEqual(packs.map((path) => path.replace(/^.*\/(.+)\.yaml$/, "$1")));
  });

  it.each(packs)("%s loads and validates with zero errors", (path) => {
    const loaded = loadRpgSourceFile(path);
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
    expect(output).not.toContain("mode: rpg");
    expect(output).not.toContain("Pack:");
    expect(output).not.toContain("Source:");
    expect(output).not.toContain("content/rpg/quests/");
    expect(output.match(/content_hash: [0-9a-f]{64}/g)?.length ?? 0).toBe(worldQuestIds.length);
    for (const worldQuestId of worldQuestIds) {
      expect(output).toContain(`== world_quest_id: ${worldQuestId} ==`);
    }
  });

  it("validate CLI loads shipped quests through the source runtime boundary", () => {
    expect(validateCli).toContain("RpgSourceRuntime");
    expect(validateCli).toContain("loadWorldQuestReport");
    expect(validateCli).not.toContain("loadRpgSourceFile");
    expect(validateCli).not.toContain("resolveWorldQuestPackPath");
  });

  it("npm run validate accepts targeted world quest ids without raw pack paths", () => {
    const result = runNpm("npm run validate -- sunken_barrow", 30_000);
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;

    expect(result.status, output).toBe(0);
    expect(output).toContain("== world_quest_id: sunken_barrow ==");
    expect(output).not.toContain("content/rpg/quests/sunken_barrow.yaml");
    expect(output).not.toContain("mode: rpg");
    expect(output).not.toContain("Pack:");
    expect(output).not.toContain("Source:");
    expect(output.match(/content_hash: [0-9a-f]{64}/g)?.length ?? 0).toBe(1);
  });

  it("npm run validate rejects positional raw pack path targets", () => {
    const result = runNpm("npm run validate -- content/rpg/quests/sunken_barrow.yaml", 30_000);
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;

    expect(result.status, output).toBe(2);
    expect(output).toContain("validate targets are world quest ids");
    expect(output).toContain("raw pack paths are not accepted");
  });

  it("npm run validate rejects explicit raw pack mode before loading a path", () => {
    const result = runNpm(
      "npm run validate -- --pack content/broken-fixtures/duplicate_id.yaml",
      30_000,
    );
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;

    expect(result.status, output).toBe(2);
    expect(output).toContain("validate accepts world quest ids");
    expect(output).toContain("not --pack");
    expect(output).not.toContain("unsupported legacy pack");
  });

  it("README quickstart documents world quest ids instead of raw pack-path selectors", () => {
    expect(readme).toContain("npm run validate -- sunken_barrow");
    expect(readme).toContain("npm run inspect -- sunken_barrow");
    expect(readme).toContain("public play, validation, inspection,");
    expect(readme).not.toContain("npm run validate -- content/rpg/quests/");
    expect(readme).not.toContain("npm run inspect -- content/rpg/quests/");
    expect(readme).not.toContain("Raw pack paths remain accepted");
  });
});
