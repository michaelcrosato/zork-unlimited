import { ParserPackSchema, type ParserPack } from "../../../src/parser/schema.js";

export function makeParserFixturePack(): ParserPack {
  return ParserPackSchema.parse({
    meta: {
      id: "parser_fixture_v1",
      title: "Parser Fixture",
      start_room: "entrance",
      vars_init: { score: 0 },
      max_score: 0,
    },
    rooms: [
      {
        id: "entrance",
        name: "Entrance",
        description: "A small entrance chamber with a coffer and a guide.",
        objects: ["coffer", "hazard_key"],
        exits: [{ direction: "east", to: "hub" }],
      },
      {
        id: "hub",
        name: "Hub",
        description: "A workroom with a locked strongbox and an idle hazard.",
        objects: ["strongbox", "hazard"],
        exits: [
          { direction: "west", to: "entrance" },
          { direction: "east", to: "goal" },
        ],
      },
      {
        id: "goal",
        name: "Goal",
        description: "The final room waits beyond the hub.",
        objects: [],
        exits: [{ direction: "west", to: "hub" }],
      },
    ],
    objects: [
      {
        id: "coffer",
        name: "coffer",
        description: "A plain coffer with a small key inside.",
        container: true,
        openable: true,
        contents: ["lesser_key"],
      },
      {
        id: "lesser_key",
        name: "lesser key",
        description: "A key for the strongbox.",
        takeable: true,
      },
      {
        id: "strongbox",
        name: "strongbox",
        description: "A locked strongbox holding the proof.",
        container: true,
        openable: true,
        locked: true,
        key_id: "lesser_key",
        contents: ["deep_key"],
      },
      {
        id: "deep_key",
        name: "deep key",
        description: "The proof needed to complete the route.",
        takeable: true,
        quest_critical: true,
      },
      {
        id: "hazard_key",
        name: "hazard key",
        description: "A key for an off-route locked hazard.",
        takeable: true,
      },
      {
        id: "hazard",
        name: "hazard",
        description: "A locked off-route mechanism.",
        locked: true,
        key_id: "hazard_key",
      },
    ],
    npcs: [
      {
        id: "guide",
        name: "guide",
        description: "A guide who can explain the route.",
        room: "entrance",
        dialogue: {
          root: "greet",
          nodes: [
            {
              id: "greet",
              npc_text: "The guide waits for your question.",
              topics: [
                { id: "hint", prompt: "Ask for the hint.", goto: "tell" },
                { id: "bye", prompt: "End the conversation.", end: true },
              ],
            },
            {
              id: "tell",
              npc_text: "The strongbox holds the proof.",
              topics: [{ id: "bye", prompt: "End the conversation.", end: true }],
            },
          ],
        },
      },
    ],
    win_conditions: [
      {
        id: "win",
        conditions: [{ visited: "goal" }, { has_item: "deep_key" }],
        ending: "ending_win",
      },
    ],
    endings: [{ id: "ending_win", title: "Done", text: "You finish the fixture route." }],
  });
}
