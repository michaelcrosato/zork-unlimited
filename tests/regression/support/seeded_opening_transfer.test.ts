import { describe, expect, it } from "vitest";

import { wolfWinterDispatchOverlayFlagForPack } from "../../../src/core/embedded_launch_overlay_receipt.js";
import type { RpgPack } from "../../../src/rpg/schema.js";
import { loadRpgSourceFile } from "../../../src/rpg/source.js";
import { validateRpg } from "../../../src/validate/rpg_validator.js";
import { relabelRpgPack } from "./relabel_rpg.js";
import {
  seededOpeningRelabelTransferSupportForPacks,
  seededOpeningTransferSupportForPack,
} from "./seeded_opening_transfer.js";

function wolf(): RpgPack {
  const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
  if (!loaded.ok) throw new Error("Wolf-Winter must compile");
  return structuredClone(loaded.compiled.pack);
}

function shippedUnseededPack(): RpgPack {
  const loaded = loadRpgSourceFile("content/rpg/quests/sunken_barrow.yaml");
  if (!loaded.ok) throw new Error("sunken_barrow must compile");
  return loaded.compiled.pack;
}

function failure(pack: RpgPack): string {
  const support = seededOpeningTransferSupportForPack(pack);
  expect(support.unsupported).toBe(true);
  expect(support.certified).toBe(false);
  return support.diagnostics.join("\n");
}

describe("seeded-opening structural transfer certificate", () => {
  it("certifies the exact reviewed Wolf-Winter surface and is inert for an unseeded pack", () => {
    expect(seededOpeningTransferSupportForPack(wolf())).toEqual({
      certified: true,
      unsupported: false,
      diagnostics: [],
      presentationReads: 49,
      mechanicalReads: 22,
    });

    expect(seededOpeningTransferSupportForPack(shippedUnseededPack())).toEqual({
      certified: false,
      unsupported: false,
      diagnostics: [],
      presentationReads: 0,
      mechanicalReads: 0,
    });

    const missingDeclaration = wolf();
    delete missingDeclaration.meta.seeded_opening_flags;
    expect(failure(missingDeclaration)).toContain("is missing meta.seeded_opening_flags");

    const { pack: missingTwin, relabeler } = relabelRpgPack(missingDeclaration);
    const missingRelabelSupport = seededOpeningRelabelTransferSupportForPacks(
      missingDeclaration,
      missingTwin,
      (id) => relabeler.map.get(id) ?? id,
    );
    expect(missingRelabelSupport.unsupported).toBe(true);
    expect(missingRelabelSupport.diagnostics.join("\n")).toContain(
      "is missing meta.seeded_opening_flags",
    );
  });

  it("certifies the exact relabeled twin surface through a non-mutating map lookup", () => {
    const original = wolf();
    const { pack: twin, relabeler } = relabelRpgPack(original);
    const mapId = (id: string): string => relabeler.map.get(id) ?? id;
    expect(seededOpeningRelabelTransferSupportForPacks(original, twin, mapId)).toEqual({
      certified: true,
      unsupported: false,
      diagnostics: [],
      presentationReads: 49,
      mechanicalReads: 22,
    });
    const originalCodes = validateRpg(original)
      .findings.map((finding) => finding.code)
      .sort();
    const launchOverlayFlag = wolfWinterDispatchOverlayFlagForPack(original.meta.id);
    expect(launchOverlayFlag).toBeDefined();
    const twinCodes = validateRpg(twin, {
      extraSettableFlags: launchOverlayFlag === undefined ? [] : [mapId(launchOverlayFlag)],
    })
      .findings.map((finding) => finding.code)
      .sort();
    expect(twinCodes).toEqual(originalCodes);

    const changedTwin = structuredClone(twin);
    changedTwin.rooms[0]!.description += " ";
    const changedSupport = seededOpeningRelabelTransferSupportForPacks(
      original,
      changedTwin,
      mapId,
    );
    expect(changedSupport.unsupported).toBe(true);
    expect(changedSupport.diagnostics.join("\n")).toContain(
      "certified Wolf-Winter relabeled twin hash changed",
    );
  });

  it("fails closed for an unknown seeded pack and forbidden routing/combat/win reads", () => {
    const unknown = wolf();
    unknown.meta.id = "another_pack";
    expect(failure(unknown)).toContain("unknown seeded-opening pack id");

    const cases: Array<[string, (pack: RpgPack) => void]> = [
      [
        "exit",
        (pack) =>
          pack.rooms[0]!.exits[0]!.conditions.push({
            has_flag: pack.meta.seeded_opening_flags![0]!,
          }),
      ],
      [
        "win",
        (pack) =>
          pack.win_conditions[0]!.conditions.push({
            has_flag: pack.meta.seeded_opening_flags![0]!,
          }),
      ],
      [
        "enemy",
        (pack) => {
          pack.enemies[0]!.conditions = [{ has_flag: pack.meta.seeded_opening_flags![0]! }];
        },
      ],
      [
        "dialogue topic visibility",
        (pack) => {
          pack.npcs[0]!.dialogue.nodes[0]!.topics[0]!.conditions = [
            { has_flag: pack.meta.seeded_opening_flags![0]! },
          ];
        },
      ],
      [
        "NPC location override",
        (pack) => {
          pack.npcs[0]!.variants = [
            {
              when: [{ has_flag: pack.meta.seeded_opening_flags![0]! }],
              room: pack.npcs[0]!.room,
            },
          ];
        },
      ],
    ];

    for (const [label, plant] of cases) {
      const pack = wolf();
      plant(pack);
      expect(failure(pack), label).toContain("neither a text-selection variant");
    }
  });

  it("rejects unapproved mechanics, seeded writes, score/terminal effects, and context drift", () => {
    const unapproved = wolf();
    unapproved.objects[2]!.interactions[0]!.conditions.push({
      has_flag: unapproved.meta.seeded_opening_flags![0]!,
    });
    expect(failure(unapproved)).toContain("seeded mechanical context census changed");

    const seededWrite = wolf();
    seededWrite.rooms[0]!.on_enter.push({ set_flag: seededWrite.meta.seeded_opening_flags![0]! });
    expect(failure(seededWrite)).toContain("neither a text-selection variant");

    const drive = wolf();
    drive.objects
      .find((object) => object.id === "drive_breach_signal")!
      .interactions[0]!.effects.push({ inc_var: { name: "score", by: 1 } });
    expect(failure(drive)).toContain("drive seeded family must not select a score write");

    const terminal = wolf();
    terminal.objects
      .find((object) => object.id === "paling_rail")!
      .interactions[0]!.effects.push({
        end_game: terminal.endings[0]!.id,
      });
    expect(failure(terminal)).toContain("must not select a terminal end_game effect");

    const context = wolf();
    context.objects
      .find((object) => object.id === "drive_breach_signal")!
      .interactions[0]!.conditions.push({ has_flag: "impossible_extra_guard" });
    expect(failure(context)).toContain("complete condition partition");
  });

  it("rejects missing/moved families, exact presentation drift, and lost ordinary recovery", () => {
    const missing = wolf();
    missing.objects.find((object) => object.id === "drive_breach_signal")!.interactions.shift();
    expect(failure(missing)).toContain("drive family must contain exactly");

    const moved = wolf();
    const paling = moved.objects.find((object) => object.id === "paling_rail")!;
    paling.interactions[0]!.target = "downwind_feed_line";
    expect(failure(moved)).toContain("must remain a USE on target");

    const presentation = wolf();
    presentation.rooms[1]!.variants![11]!.when[0] = {
      has_flag: presentation.meta.seeded_opening_flags![1]!,
    };
    expect(failure(presentation)).toContain("presentation reference census changed");

    const recovery = wolf();
    const wedge = recovery.objects
      .find((object) => object.id === "paling_rail")!
      .interactions.find((interaction) => interaction.command_verb === "wedge")!;
    wedge.skill_check!.on_failure = wedge.skill_check!.on_failure.filter(
      (effect) => !("set_flag" in effect && effect.set_flag === "rail_split"),
    );
    expect(failure(recovery)).toContain("lost its exact certified failure marker");
  });

  it("pins every downstream failure-cone dependency and exact transition partition", () => {
    const downstreamExit = wolf();
    const north = downstreamExit.rooms
      .find((room) => room.id === "paling_gap")!
      .exits.find((exit) => exit.direction === "north")!;
    north.conditions.push({
      any_of: [{ not_flag: "drive_opening_fouled" }, { not_flag: "heard_counsel" }],
    });
    expect(failure(downstreamExit)).toContain("certified Wolf-Winter pack hash changed");

    const downstreamRecovery = wolf();
    downstreamRecovery.objects
      .find((object) => object.id === "drive_hurdle_recovery")!
      .interactions[0]!.conditions.push({ not_flag: "heard_counsel" });
    expect(failure(downstreamRecovery)).toContain("certified Wolf-Winter pack hash changed");

    const transitionPartition = wolf();
    const bondDrive = transitionPartition.objects
      .find((object) => object.id === "drive_breach_signal")!
      .interactions.find((interaction) =>
        JSON.stringify(interaction.conditions).includes("relief_oath_unaffiliated_bond"),
      )!;
    const packDriveEffectIndex = bondDrive.effects.findIndex(
      (effect) =>
        "inc_var" in effect && effect.inc_var.name === "pack_drive" && effect.inc_var.by === 1,
    );
    expect(packDriveEffectIndex).toBeGreaterThanOrEqual(0);
    const [movedEffect] = bondDrive.effects.splice(packDriveEffectIndex, 1);
    bondDrive.skill_check!.on_success.unshift(movedEffect!);
    expect(failure(transitionPartition)).toContain("certified Wolf-Winter pack hash changed");
  });
});
