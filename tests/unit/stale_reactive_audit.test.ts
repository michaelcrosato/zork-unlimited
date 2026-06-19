import { describe, it, expect } from "vitest";
import { ParserPackSchema, type ParserPack } from "../../src/parser/schema.js";
import { auditParserPackForStaleRoomItems } from "../../src/afk/stale_reactive_audit.js";

const basePack = (): ParserPack =>
  ParserPackSchema.parse({
    meta: { id: "audit_fixture", title: "Audit Fixture", start_room: "room" },
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
  });

describe("stale reactive room-item audit", () => {
  it("finds room base prose that names a takeable room object without an item-state variant", () => {
    const sites = auditParserPackForStaleRoomItems(basePack(), "fixture.yaml", "parser");

    expect(sites).toEqual([
      {
        packPath: "fixture.yaml",
        packId: "audit_fixture",
        mode: "parser",
        roomId: "room",
        objectId: "lamp",
        objectName: "brass lamp",
        matchedTerm: "brass lamp",
      },
    ]);
  });

  it("suppresses the site when a room variant reads whether the item has been taken", () => {
    const pack = basePack();
    pack.rooms[0]!.variants = [
      {
        when: [{ has_item: "lamp" }],
        text: "The table is bare where the brass lamp used to wait.",
      },
    ];

    expect(auditParserPackForStaleRoomItems(pack, "fixture.yaml", "parser")).toEqual([]);
  });

  it("treats nested none_of item checks as a real item-state read", () => {
    const pack = basePack();
    pack.rooms[0]!.variants = [
      {
        when: [{ none_of: [{ has_item: "lamp" }] }],
        text: "The brass lamp still waits on the table.",
      },
    ];

    expect(auditParserPackForStaleRoomItems(pack, "fixture.yaml", "parser")).toEqual([]);
  });

  it("matches whole phrases only, not substrings inside other words", () => {
    const pack = basePack();
    pack.objects[0]!.name = "coin";
    pack.objects[0]!.aliases = [];
    pack.rooms[0]!.description = "The coincidence is hard to ignore.";

    expect(auditParserPackForStaleRoomItems(pack, "fixture.yaml", "parser")).toEqual([]);
  });
});
