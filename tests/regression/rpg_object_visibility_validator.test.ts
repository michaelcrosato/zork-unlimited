import { describe, expect, it } from "vitest";

import type { Condition } from "../../src/core/conditions.js";
import type { RpgPack } from "../../src/rpg/schema.js";
import { compileRpgSource } from "../../src/rpg/source.js";
import { validateRpgFoundation } from "../../src/validate/rpg_foundation_validator.js";
import type { Finding } from "../../src/validate/report.js";

const SOURCE = `
meta:
  id: visibility_validator_fixture
  title: Visibility Validator Fixture
  start_room: workshop
  vars_init: { hp: 10, attack: 2, defense: 1 }
rooms:
  - id: workshop
    name: Workshop
    description: A lever and specimen chest stand here.
    objects: [lever, panel, chest]
    exits: [{ direction: north, to: finish }]
  - id: finish
    name: Finish
    description: The far side of the workshop.
    exits: [{ direction: south, to: workshop }]
objects:
  - id: lever
    name: brass lever
    aliases: [lever]
    description: A lever wired to the display cases.
    interactions:
      - verb: USE
        target: lever
        effects:
          - { set_flag: panel_revealed }
          - { open_object: chest }
  - id: panel
    name: revealed panel
    aliases: [panel]
    description: A panel behind the wall.
    visible_when: [{ has_flag: panel_revealed }]
  - id: chest
    name: specimen chest
    aliases: [chest]
    description: A chest opened by the lever.
    visible_when: [{ has_item: seal }]
    container: true
    openable: true
    contents: [gem]
  - id: gem
    name: glass gem
    aliases: [gem]
    description: A bright specimen.
    visible_when: [{ is_open: chest }, { has_item: lens }]
    takeable: true
  - id: seal
    name: brass seal
    aliases: [seal]
    description: A seal that reveals the chest.
    held: true
  - id: lens
    name: survey lens
    aliases: [lens]
    description: A lens that reveals the specimen.
    held: true
win_conditions:
  - id: done
    conditions: [{ visited: finish }, { has_item: gem }]
    ending: ending_done
endings:
  - id: ending_done
    title: Done
    text: Done.
enemies: []
`;

const loaded = compileRpgSource(SOURCE);
if (!loaded.ok) throw loaded.error;
const basePack = loaded.compiled.pack;

function freshPack(): RpgPack {
  return structuredClone(basePack);
}

function validate(pack: RpgPack): Finding[] {
  return validateRpgFoundation(pack).findings;
}

function object(pack: RpgPack, id: string) {
  const found = pack.objects.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing fixture object ${id}`);
  return found;
}

function hasFinding(findings: Finding[], code: string, location: string): boolean {
  return findings.some((finding) => finding.code === code && finding.where.includes(location));
}

describe("RPG object visible_when validator coverage", () => {
  it("treats presence guards as feasibility and liveness consumers", () => {
    const healthy = validate(freshPack());
    expect(healthy).toEqual([]);

    const impossibleFlag = freshPack();
    object(impossibleFlag, "panel").visible_when = [{ has_flag: "never_set" }];
    expect(hasFinding(validate(impossibleFlag), "IMPOSSIBLE_GATE", "visible_when")).toBe(true);

    const impossibleObjectState = freshPack();
    object(impossibleObjectState, "panel").visible_when = [{ is_open: "panel" }];
    expect(
      hasFinding(validate(impossibleObjectState), "IMPOSSIBLE_OBJECT_STATE", "visible_when"),
    ).toBe(true);

    const danglingRoom = freshPack();
    object(danglingRoom, "panel").visible_when = [
      { any_of: [{ has_flag: "panel_revealed" }, { in_room: "missing_annex" }] },
    ];
    expect(
      hasFinding(validate(danglingRoom), "UNRESOLVED_ROOM_REFERENCE", "room:missing_annex"),
    ).toBe(true);
  });

  it("checks a variant and interaction together with the object's presence gate", () => {
    const pack = freshPack();
    const panel = object(pack, "panel");
    panel.visible_when = [{ not_flag: "panel_revealed" }];
    panel.variants = [
      {
        when: [{ has_flag: "panel_revealed" }],
        text: "This text can only match while the panel is absent.",
      },
    ];
    panel.interactions.push({
      verb: "USE",
      target: "panel",
      conditions: [{ has_flag: "panel_revealed" }],
      effects: [],
    });

    const findings = validate(pack);
    expect(hasFinding(findings, "UNSATISFIABLE_CONDITION", "variant:0")).toBe(true);
    expect(hasFinding(findings, "UNSATISFIABLE_CONDITION", "verb:USE")).toBe(true);

    const contradictoryGate = freshPack();
    object(contradictoryGate, "panel").visible_when = [
      { has_flag: "panel_revealed" },
      { not_flag: "panel_revealed" },
    ];
    expect(hasFinding(validate(contradictoryGate), "UNSATISFIABLE_CONDITION", "visible_when")).toBe(
      true,
    );
  });

  it("does not combine the world gate for an inventory-capable object", () => {
    const pack = freshPack();
    const panel = object(pack, "panel");
    panel.takeable = true;
    panel.visible_when = [{ not_flag: "panel_revealed" }];
    panel.variants = [
      {
        when: [{ has_flag: "panel_revealed" }],
        text: "The carried panel remains examinable after its world copy retires.",
      },
    ];
    panel.interactions.push({
      verb: "USE",
      target: "panel",
      conditions: [{ has_flag: "panel_revealed" }],
      effects: [],
    });

    const contradictions = validate(pack).filter(
      (finding) =>
        finding.code === "UNSATISFIABLE_CONDITION" && finding.where.includes("object:panel"),
    );
    expect(contradictions).toEqual([]);
  });

  it.each([
    ["container", "seal"],
    ["child", "lens"],
  ] as const)(
    "does not call a contained item obtainable when its %s presence prerequisite is unavailable",
    (_kind, prerequisite) => {
      const pack = freshPack();
      object(pack, prerequisite).held = false;

      const findings = validate(pack);
      expect(
        findings.some(
          (finding) =>
            finding.code === "ITEM_REQUIRED_UNOBTAINABLE" &&
            finding.where.includes("win:done") &&
            finding.message.includes('item "gem"'),
        ),
      ).toBe(true);
    },
  );

  it("accepts a contained item once both child and container item prerequisites are obtainable", () => {
    const findings = validate(freshPack());
    expect(
      findings.some(
        (finding) =>
          finding.code === "ITEM_REQUIRED_UNOBTAINABLE" && finding.where.includes("win:done"),
      ),
    ).toBe(false);
  });

  it("does not overcredit mutually item-gated world objects as obtainable", () => {
    const pack = freshPack();
    const workshop = pack.rooms.find((room) => room.id === "workshop");
    if (!workshop) throw new Error("missing fixture workshop");
    workshop.objects.push("cycle_a", "cycle_b");
    const cycleObject = (id: string, required: string): RpgPack["objects"][number] => ({
      id,
      name: id,
      aliases: [],
      description: `${id} waits behind the other item gate.`,
      visible_when: [{ has_item: required }],
      takeable: true,
      quest_critical: false,
      container: false,
      openable: false,
      locked: false,
      contents: [],
      interactions: [],
    });
    pack.objects.push(cycleObject("cycle_a", "cycle_b"), cycleObject("cycle_b", "cycle_a"));

    const findings = validate(pack);
    for (const [objectId, required] of [
      ["cycle_a", "cycle_b"],
      ["cycle_b", "cycle_a"],
    ] as const) {
      expect(
        findings.some(
          (finding) =>
            finding.code === "ITEM_REQUIRED_UNOBTAINABLE" &&
            finding.where.includes(`object:${objectId}`) &&
            finding.where.includes("visible_when") &&
            finding.message.includes(`item "${required}"`),
        ),
      ).toBe(true);
    }
  });

  it("treats an item required by a presence gate as still needed after an unrelated consume", () => {
    const withoutPresenceRead = freshPack();
    const lensWithoutRead = object(withoutPresenceRead, "lens");
    lensWithoutRead.quest_critical = true;
    object(withoutPresenceRead, "gem").visible_when = [{ is_open: "chest" }];
    object(withoutPresenceRead, "lever").interactions[0]!.effects.push({ remove_item: "lens" });
    expect(hasFinding(validate(withoutPresenceRead), "SOFTLOCK_QUEST_ITEM", "object:lens")).toBe(
      false,
    );

    const withPresenceRead = freshPack();
    object(withPresenceRead, "lens").quest_critical = true;
    object(withPresenceRead, "lever").interactions[0]!.effects.push({ remove_item: "lens" });
    expect(hasFinding(validate(withPresenceRead), "SOFTLOCK_QUEST_ITEM", "object:lens")).toBe(true);
  });

  it("counts nested presence conditions in the generic readers", () => {
    const pack = freshPack();
    const guard: Condition = {
      all_of: [
        { has_flag: "panel_revealed" },
        { any_of: [{ is_open: "chest" }, { in_room: "workshop" }] },
      ],
    };
    object(pack, "panel").visible_when = [guard];

    const findings = validate(pack);
    expect(hasFinding(findings, "INERT_FLAG", "flag:panel_revealed")).toBe(false);
    expect(hasFinding(findings, "INERT_OBJECT_STATE", "object:chest")).toBe(false);
    expect(hasFinding(findings, "UNRESOLVED_ROOM_REFERENCE", "room:workshop")).toBe(false);
  });
});
