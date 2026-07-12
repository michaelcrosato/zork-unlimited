import { describe, expect, it } from "vitest";

import {
  overworldContactTalkJournalId,
  type OverworldCharacter,
  type OverworldCharacterView,
} from "../../src/world/overworld.js";
import {
  cloneOverworldCharacter,
  cloneOverworldCharacterView,
} from "../../src/world/overworld_clone.js";
import {
  allOverworldContactPresentations,
  presentOverworldContact,
} from "../../src/world/session_contact_presentation.js";

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

describe("overworld contact presentation", () => {
  it("uses ordered all-of quest conditions and strips hidden variants from the public contact", () => {
    const rawBefore = structuredClone(HAYDEN);
    const base = presentOverworldContact(HAYDEN, { completedQuestIds: new Set() });
    expect(base.character).toBe(HAYDEN);
    expect(base.presentationId).toBeNull();
    expect(base.journalId).toBe("talk:albany_city__transport_hub__contact");
    expect(base.afterQuestIds).toEqual([]);
    expect(base.contact).toMatchObject({
      summary: "Hayden watches the winter dispatch board.",
      agenda: "Cade's relief packet is still open.",
    });
    expect(base.contact).not.toHaveProperty("variants");

    const gallowmereAlone = presentOverworldContact(HAYDEN, {
      completedQuestIds: new Set(["gallowmere"]),
    });
    expect(gallowmereAlone.presentationId).toBeNull();

    const wolf = presentOverworldContact(HAYDEN, {
      completedQuestIds: new Set(["wolf_winter"]),
    });
    expect(wolf.presentationId).toBe("wolf_closed");
    expect(wolf.contact.summary).toBe(HAYDEN.summary);
    expect(wolf.contact.agenda).toContain("Cade's packet is closed");
    expect(wolf.contact).not.toHaveProperty("variants");

    const both = presentOverworldContact(HAYDEN, {
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
      completedQuestIds: new Set(["wolf_winter", "gallowmere"]),
    }).contact;
    const viewClone = cloneOverworldCharacterView(view);
    expect(viewClone).toEqual(view);
    expect(viewClone).not.toBe(view);
    expect(viewClone).not.toHaveProperty("variants");
  });
});
