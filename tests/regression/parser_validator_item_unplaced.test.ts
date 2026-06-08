/**
 * bug_0317 — ITEM_UNPLACED: objects defined in pack.objects with no spawn
 * location are now detected by validateParser.
 *
 * Acceptance criteria (CURRENT_PLAN.md §bug_0317):
 *   1. An orphan object (not in any room.objects, not in any container.contents,
 *      not held:true, and not granted by any add_item effect) emits ITEM_UNPLACED.
 *   2. A room-placed object does NOT emit ITEM_UNPLACED.
 *   3. A container-placed object does NOT emit ITEM_UNPLACED.
 *   4. A held:true object does NOT emit ITEM_UNPLACED.
 *   5. All 10 shipped parser+rpg packs produce zero ITEM_UNPLACED findings
 *      (confirming the gate is non-vacuous and current content is already clean).
 *
 * Method (the bug_0218 copy-mutate discipline): the GREEN base is
 * generateParserPack(0) — it validates clean with all objects placed.  Each
 * case structuredClone()s it and introduces EXACTLY ONE change.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { generateParserPack } from "../../src/gen/parser_generator.js";

describe("ITEM_UNPLACED — objects with no spawn location (bug_0317)", () => {
  // The canonical sound pack (generateParserPack(0)) validates clean and has all
  // objects placed.  Each case structuredClone()s it and mutates exactly ONE thing.

  it("emits ITEM_UNPLACED warn for an object not in any room, container, or held", () => {
    const pack = structuredClone(generateParserPack(0));
    // Add an orphan object: defined in pack.objects, not listed anywhere, not held.
    pack.objects.push({
      id: "orphan_coin",
      name: "orphan coin",
      aliases: [],
      description: "A coin no one can find.",
      takeable: false,
      quest_critical: false,
      container: false,
      openable: false,
      locked: false,
      contents: [],
      interactions: [],
    });
    const findings = validateParser(pack).findings;
    expect(findings.map((f) => f.code)).toContain("ITEM_UNPLACED");
    const finding = findings.find((f) => f.code === "ITEM_UNPLACED");
    expect(finding?.severity).toBe("warning");
    expect(finding?.where).toContain("object:orphan_coin");
  });

  it("does NOT emit ITEM_UNPLACED for an object listed in room.objects", () => {
    const pack = structuredClone(generateParserPack(0));
    // Add an object and place it in the first room.
    pack.objects.push({
      id: "room_placed_gem",
      name: "room placed gem",
      aliases: [],
      description: "A gem sitting in a room.",
      takeable: true,
      quest_critical: false,
      container: false,
      openable: false,
      locked: false,
      contents: [],
      interactions: [],
    });
    const firstRoom = pack.rooms[0];
    if (!firstRoom) throw new Error("base pack has no rooms");
    firstRoom.objects.push("room_placed_gem");
    const codes = validateParser(pack).findings.map((f) => f.code);
    expect(codes).not.toContain("ITEM_UNPLACED");
  });

  it("does NOT emit ITEM_UNPLACED for an object listed in a container's contents", () => {
    const pack = structuredClone(generateParserPack(0));
    // Add an object and place it inside the existing "coffer" container.
    pack.objects.push({
      id: "container_placed_key",
      name: "container placed key",
      aliases: [],
      description: "A key inside a container.",
      takeable: true,
      quest_critical: false,
      container: false,
      openable: false,
      locked: false,
      contents: [],
      interactions: [],
    });
    const coffer = pack.objects.find((o) => o.id === "coffer");
    if (!coffer) throw new Error("base pack has no coffer container to nest inside");
    coffer.contents.push("container_placed_key");
    const codes = validateParser(pack).findings.map((f) => f.code);
    expect(codes).not.toContain("ITEM_UNPLACED");
  });

  it("does NOT emit ITEM_UNPLACED for a held:true object with no room or container placement", () => {
    const pack = structuredClone(generateParserPack(0));
    // Add a held object: starts in inventory, no room/container entry needed.
    pack.objects.push({
      id: "held_lantern",
      name: "held lantern",
      aliases: [],
      description: "A lantern always carried.",
      held: true,
      takeable: false,
      quest_critical: false,
      container: false,
      openable: false,
      locked: false,
      contents: [],
      interactions: [],
    });
    const codes = validateParser(pack).findings.map((f) => f.code);
    expect(codes).not.toContain("ITEM_UNPLACED");
  });

  it("all 10 shipped parser+rpg packs produce zero ITEM_UNPLACED findings", () => {
    const parserPacks = [
      "content/parser/pack/alchemists_tower.yaml",
      "content/parser/pack/friars_postern.yaml",
      "content/parser/pack/lamplighters_round.yaml",
      "content/parser/pack/sealed_crypt.yaml",
      "content/parser/pack/tide_mill.yaml",
    ];
    const rpgPacks = [
      "content/rpg/pack/breaking_weir.yaml",
      "content/rpg/pack/cold_forge.yaml",
      "content/rpg/pack/dawn_beacon.yaml",
      "content/rpg/pack/sunken_barrow.yaml",
      "content/rpg/pack/wolf_winter.yaml",
    ];
    for (const path of parserPacks) {
      const loaded = loadParserPackFile(path);
      expect(loaded.ok, `${path} failed to load`).toBe(true);
      if (!loaded.ok) continue;
      const findings = validateParser(loaded.compiled.pack).findings.filter(
        (f) => f.code === "ITEM_UNPLACED",
      );
      expect(findings, `${path} has ITEM_UNPLACED findings: ${JSON.stringify(findings)}`).toEqual(
        [],
      );
    }
    for (const path of rpgPacks) {
      const loaded = loadRpgPackFile(path);
      expect(loaded.ok, `${path} failed to load`).toBe(true);
      if (!loaded.ok) continue;
      const findings = validateRpg(loaded.compiled.pack).findings.filter(
        (f) => f.code === "ITEM_UNPLACED",
      );
      expect(findings, `${path} has ITEM_UNPLACED findings: ${JSON.stringify(findings)}`).toEqual(
        [],
      );
    }
  });
});
