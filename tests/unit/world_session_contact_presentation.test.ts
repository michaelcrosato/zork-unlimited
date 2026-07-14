import { describe, expect, it } from "vitest";

import {
  OverworldCharacterSchema,
  overworldContactTalkJournalId,
  type OverworldCharacter,
  type OverworldCharacterView,
} from "../../src/world/overworld.js";
import {
  buildCampaignCharacterState,
  createInitialCampaignCharacterState,
} from "../../src/world/campaign_character_state.js";
import {
  cloneOverworldCharacter,
  cloneOverworldCharacterView,
} from "../../src/world/overworld_clone.js";
import {
  allOverworldContactPresentations,
  presentOverworldContact,
} from "../../src/world/session_contact_presentation.js";
import { planOverworldSessionContactTalk } from "../../src/world/session_local_lifecycle.js";

const HAYDEN: OverworldCharacter = {
  id: "albany_city__transport_hub__contact",
  home: "albany_city",
  area: "albany_city__transport_hub",
  name: "Hayden Hale",
  role: "route dispatcher",
  faction: "Road Wardens",
  summary: "Hayden watches the winter dispatch board.",
  agenda: "Cade's relief packet is still open.",
  variants: [
    {
      id: "both_closed",
      after_quests: ["wolf_winter", "gallowmere"],
      summary: "Both winter packets are filed closed.",
      agenda: "Follow the current visible journey goal.",
    },
    {
      id: "wolf_closed",
      after_quests: ["wolf_winter"],
      agenda: "Cade's packet is closed; consult the current visible journey goal.",
    },
  ],
};

const DEFAULT_CHARACTER = createInitialCampaignCharacterState();

const MEMORY_HAYDEN: OverworldCharacter = {
  ...HAYDEN,
  campaign_npc_id: "npc:hayden_hale",
  variants: [
    {
      id: "packet_and_wolf",
      after_quests: ["wolf_winter"],
      after_relationship_memories: ["memory:albany_relief_packet"],
      summary: "Hayden recognizes the packet and the closed winter road.",
    },
    {
      id: "packet_known",
      after_relationship_memories: ["memory:albany_relief_packet"],
      agenda: "Hayden recognizes the relief packet in your hand.",
    },
  ],
};

describe("overworld contact presentation", () => {
  it("uses ordered all-of quest conditions and strips hidden variants from the public contact", () => {
    const rawBefore = structuredClone(HAYDEN);
    const base = presentOverworldContact(HAYDEN, {
      character: DEFAULT_CHARACTER,
      completedQuestIds: new Set(),
    });
    expect(base.character).toBe(HAYDEN);
    expect(base.presentationId).toBeNull();
    expect(base.journalId).toBe("talk:albany_city__transport_hub__contact");
    expect(base.afterQuestIds).toEqual([]);
    expect(base.afterRelationshipMemoryIds).toEqual([]);
    expect(base.contact).toMatchObject({
      summary: "Hayden watches the winter dispatch board.",
      agenda: "Cade's relief packet is still open.",
    });
    expect(base.contact).not.toHaveProperty("variants");
    expect(base.contact).not.toHaveProperty("campaign_npc_id");

    const gallowmereAlone = presentOverworldContact(HAYDEN, {
      character: DEFAULT_CHARACTER,
      completedQuestIds: new Set(["gallowmere"]),
    });
    expect(gallowmereAlone.presentationId).toBeNull();

    const wolf = presentOverworldContact(HAYDEN, {
      character: DEFAULT_CHARACTER,
      completedQuestIds: new Set(["wolf_winter"]),
    });
    expect(wolf.presentationId).toBe("wolf_closed");
    expect(wolf.contact.summary).toBe(HAYDEN.summary);
    expect(wolf.contact.agenda).toContain("Cade's packet is closed");
    expect(wolf.contact).not.toHaveProperty("variants");

    const both = presentOverworldContact(HAYDEN, {
      character: DEFAULT_CHARACTER,
      completedQuestIds: new Set(["gallowmere", "wolf_winter"]),
    });
    expect(both.presentationId).toBe("both_closed");
    expect(both.afterQuestIds).toEqual(["wolf_winter", "gallowmere"]);
    expect(both.contact).toMatchObject({
      summary: "Both winter packets are filed closed.",
      agenda: "Follow the current visible journey goal.",
    });
    expect(both.contact).not.toHaveProperty("variants");
    expect(HAYDEN).toEqual(rawBefore);
    expect(both.afterQuestIds).not.toBe(HAYDEN.variants?.[0]?.after_quests);
  });

  it("uses memories only from the relationship bound to this contact's campaign npc", () => {
    const wrongNpc = buildCampaignCharacterState({
      relationships: [
        {
          npcId: "npc:someone_else",
          trust: 0,
          regard: 0,
          owesPlayer: 0,
          playerOwes: 0,
          memories: ["memory:albany_relief_packet"],
        },
      ],
    });
    expect(
      presentOverworldContact(MEMORY_HAYDEN, {
        character: wrongNpc,
        completedQuestIds: new Set(),
      }).presentationId,
    ).toBeNull();

    const recognized = buildCampaignCharacterState({
      relationships: [
        {
          npcId: "npc:hayden_hale",
          trust: 0,
          regard: 0,
          owesPlayer: 0,
          playerOwes: 0,
          memories: ["memory:albany_relief_packet"],
        },
      ],
    });
    const memoryOnly = presentOverworldContact(MEMORY_HAYDEN, {
      character: recognized,
      completedQuestIds: new Set(),
    });
    expect(memoryOnly.presentationId).toBe("packet_known");
    expect(memoryOnly.afterRelationshipMemoryIds).toEqual(["memory:albany_relief_packet"]);
    expect(memoryOnly.contact).not.toHaveProperty("campaign_npc_id");
    expect(
      planOverworldSessionContactTalk({
        character: recognized,
        characterId: MEMORY_HAYDEN.id,
        charactersById: new Map([[MEMORY_HAYDEN.id, MEMORY_HAYDEN]]),
        completedQuestIds: new Set(),
        currentTownId: MEMORY_HAYDEN.home,
        currentAreaId: () => MEMORY_HAYDEN.area,
      }).action,
    ).toMatchObject({
      id: `talk:${MEMORY_HAYDEN.id}@packet_known`,
      text: expect.stringContaining("recognizes the relief packet"),
    });

    expect(
      presentOverworldContact(MEMORY_HAYDEN, {
        character: recognized,
        completedQuestIds: new Set(["wolf_winter"]),
      }).presentationId,
    ).toBe("packet_and_wolf");
  });

  it("validates namespaced bindings and requires a condition plus a copy override", () => {
    expect(() =>
      OverworldCharacterSchema.parse({ ...MEMORY_HAYDEN, campaign_npc_id: "hayden" }),
    ).toThrow();
    expect(() =>
      OverworldCharacterSchema.parse({
        ...MEMORY_HAYDEN,
        variants: [
          {
            id: "bad_memory",
            after_relationship_memories: ["not_namespaced"],
            agenda: "Invalid memory id.",
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      OverworldCharacterSchema.parse({
        ...MEMORY_HAYDEN,
        variants: [{ id: "no_condition", agenda: "No condition." }],
      }),
    ).toThrow(/must require a quest or relationship memory/);
    expect(() =>
      OverworldCharacterSchema.parse({
        ...MEMORY_HAYDEN,
        variants: [
          {
            id: "no_override",
            after_relationship_memories: ["memory:albany_relief_packet"],
          },
        ],
      }),
    ).toThrow(/must override summary or agenda/);
  });

  it("enumerates stable base and variant journal identities without exposing authoring state", () => {
    const presentations = allOverworldContactPresentations(HAYDEN);
    expect(
      presentations.map(({ presentationId, journalId }) => [presentationId, journalId]),
    ).toEqual([
      [null, "talk:albany_city__transport_hub__contact"],
      ["both_closed", "talk:albany_city__transport_hub__contact@both_closed"],
      ["wolf_closed", "talk:albany_city__transport_hub__contact@wolf_closed"],
    ]);
    expect(presentations.every(({ character }) => character === HAYDEN)).toBe(true);
    expect(presentations.every(({ contact }) => !("variants" in contact))).toBe(true);
    expect(overworldContactTalkJournalId("contact", null)).toBe("talk:contact");
    expect(overworldContactTalkJournalId("contact", "closed")).toBe("talk:contact@closed");
  });

  it("deep-clones raw variant conditions and separately clones stripped public views", () => {
    const rawClone = cloneOverworldCharacter(HAYDEN);
    expect(rawClone).not.toBe(HAYDEN);
    expect(rawClone.variants).not.toBe(HAYDEN.variants);
    expect(rawClone.variants?.[0]).not.toBe(HAYDEN.variants?.[0]);
    expect(rawClone.variants?.[0]?.after_quests).not.toBe(HAYDEN.variants?.[0]?.after_quests);

    const view: OverworldCharacterView = presentOverworldContact(HAYDEN, {
      character: DEFAULT_CHARACTER,
      completedQuestIds: new Set(["wolf_winter", "gallowmere"]),
    }).contact;
    const viewClone = cloneOverworldCharacterView(view);
    expect(viewClone).toEqual(view);
    expect(viewClone).not.toBe(view);
    expect(viewClone).not.toHaveProperty("variants");

    const memoryClone = cloneOverworldCharacter(MEMORY_HAYDEN);
    expect(memoryClone.variants?.[0]?.after_relationship_memories).not.toBe(
      MEMORY_HAYDEN.variants?.[0]?.after_relationship_memories,
    );
  });
});
