import { describe, it, expect } from "vitest";
import { RpgPackSchema, type RpgPack } from "../../src/rpg/schema.js";
import { auditRpgPackForStaleRoomItems } from "../../src/afk/stale_reactive_audit.js";

const basePack = (): RpgPack =>
  RpgPackSchema.parse({
    meta: {
      id: "audit_fixture",
      title: "Audit Fixture",
      start_room: "room",
      vars_init: { hp: 10, attack: 2, defense: 1 },
    },
    rooms: [
      {
        id: "room",
        name: "Room",
        description: "A brass lamp waits on the table.",
        objects: ["lamp"],
      },
    ],
    objects: [
      {
        id: "lamp",
        name: "brass lamp",
        aliases: ["lamp"],
        description: "A useful lamp.",
        takeable: true,
      },
    ],
    win_conditions: [{ id: "win", conditions: [{ visited: "room" }], ending: "ending_win" }],
    endings: [{ id: "ending_win", title: "Done", text: "Done." }],
    enemies: [],
  });

describe("stale reactive room-item audit", () => {
  it("finds room base prose that names a takeable room object without an item-state variant", () => {
    const sites = auditRpgPackForStaleRoomItems(basePack(), "fixture_quest");

    expect(sites).toEqual([
      {
        worldQuestId: "fixture_quest",
        roomId: "room",
        objectId: "lamp",
        objectName: "brass lamp",
        matchedTerm: "brass lamp",
      },
    ]);
    expect(sites[0]).not.toHaveProperty("mode");
    expect(sites[0]).not.toHaveProperty("packId");
    expect(sites[0]).not.toHaveProperty("packPath");
  });

  it("suppresses the site when a room variant reads whether the item has been taken", () => {
    const pack = basePack();
    pack.rooms[0]!.variants = [
      {
        when: [{ has_item: "lamp" }],
        text: "The table is bare where the brass lamp used to wait.",
      },
    ];

    expect(auditRpgPackForStaleRoomItems(pack, "fixture_quest")).toEqual([]);
  });

  it("treats nested none_of item checks as a real item-state read", () => {
    const pack = basePack();
    pack.rooms[0]!.variants = [
      {
        when: [{ none_of: [{ has_item: "lamp" }] }],
        text: "The brass lamp still waits on the table.",
      },
    ];

    expect(auditRpgPackForStaleRoomItems(pack, "fixture_quest")).toEqual([]);
  });

  it("suppresses the site when a room variant reads state written by the item's take effects", () => {
    const pack = basePack();
    pack.objects[0]!.take_effects = [{ set_flag: "lamp_taken" }];
    pack.rooms[0]!.variants = [
      {
        when: [{ has_flag: "lamp_taken" }],
        text: "A bare ring on the table marks where the brass lamp waited.",
      },
    ];

    expect(auditRpgPackForStaleRoomItems(pack, "fixture_quest")).toEqual([]);
  });

  it("still reports a site when room variants read unrelated state", () => {
    const pack = basePack();
    pack.objects[0]!.take_effects = [{ set_flag: "lamp_taken" }];
    pack.rooms[0]!.variants = [
      {
        when: [{ has_flag: "storm_started" }],
        text: "Rain lashes the table where a brass lamp waits.",
      },
    ];

    expect(auditRpgPackForStaleRoomItems(pack, "fixture_quest")).toHaveLength(1);
  });

  it("suppresses the site when taking the item immediately satisfies a terminal condition", () => {
    const pack = basePack();
    pack.win_conditions = [
      { id: "win", conditions: [{ visited: "room" }, { has_item: "lamp" }], ending: "ending_win" },
    ];

    expect(auditRpgPackForStaleRoomItems(pack, "fixture_quest")).toEqual([]);
  });

  it("suppresses non-start rooms that become terminal as soon as the player enters", () => {
    const pack = basePack();
    pack.meta.start_room = "start";
    pack.rooms.unshift({
      id: "start",
      name: "Start",
      description: "A plain starting room.",
      objects: [],
      exits: [{ direction: "north", to: "room", conditions: [] }],
      on_enter: [],
    });
    pack.win_conditions = [{ id: "win", conditions: [{ visited: "room" }], ending: "ending_win" }];

    expect(auditRpgPackForStaleRoomItems(pack, "fixture_quest")).toEqual([]);
  });

  it("still reports start-room prose even if a visited-start win condition would be malformed content", () => {
    const sites = auditRpgPackForStaleRoomItems(basePack(), "fixture_quest");

    expect(sites).toHaveLength(1);
  });

  it("suppresses the site when the item's take effects immediately end the game", () => {
    const pack = basePack();
    pack.objects[0]!.take_effects = [{ end_game: "ending_win" }];

    expect(auditRpgPackForStaleRoomItems(pack, "fixture_quest")).toEqual([]);
  });

  it("does not treat a terminal requiring extra state as guaranteed by taking the item", () => {
    const pack = basePack();
    pack.win_conditions = [
      {
        id: "win",
        conditions: [{ visited: "room" }, { has_item: "lamp" }, { has_flag: "blessed" }],
        ending: "ending_win",
      },
    ];

    expect(auditRpgPackForStaleRoomItems(pack, "fixture_quest")).toHaveLength(1);
  });

  it("matches whole phrases only, not substrings inside other words", () => {
    const pack = basePack();
    pack.objects[0]!.name = "coin";
    pack.objects[0]!.aliases = [];
    pack.rooms[0]!.description = "The coincidence is hard to ignore.";

    expect(auditRpgPackForStaleRoomItems(pack, "fixture_quest")).toEqual([]);
  });
});
