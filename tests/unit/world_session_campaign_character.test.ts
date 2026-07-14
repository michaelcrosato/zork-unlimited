import { describe, expect, it } from "vitest";

import { createInitialCampaignCharacterState } from "../../src/world/campaign_character_state.js";
import { OVERWORLD_COMPACT_VIEW_VERSION } from "../../src/world/compact_view.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_SESSION_LEGACY_SAVE_VERSION,
  OVERWORLD_SESSION_SAVE_VERSION,
} from "../../src/world/session_snapshot.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());

describe("overworld campaign character integration", () => {
  it("projects the replay-proven fresh character through full and compact player views", () => {
    const session = new OverworldSession(WORLD);

    expect(session.view().character).toEqual({
      background: null,
      skills: [],
      values: [],
      health: { current: 30, max: 30 },
      wounds: [],
      equipment: [],
      money: 0,
      abilities: [],
      knowledge: [],
      promises: [],
      crimes: [],
      relationships: [],
      factionStanding: [],
    });

    const compact = session.compactView();
    expect(compact.v).toBe(OVERWORLD_COMPACT_VIEW_VERSION);
    expect(compact.character).toEqual([
      null,
      [30, 30],
      0,
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]);
  });

  it("keeps snapshot and full-view character graphs isolated from the live session", () => {
    const restored = OverworldSession.restore(WORLD, new OverworldSession(WORLD).snapshot());

    const snapshot = restored.snapshot();
    const view = restored.view();
    snapshot.character.health.current = 1;
    snapshot.character.knowledge.push("knowledge:outside_mutation");
    view.character.health.current = 2;
    view.character.knowledge.push("knowledge:view_mutation");

    expect(restored.snapshot().character).toEqual(createInitialCampaignCharacterState());
    expect(restored.view().character.health.current).toBe(30);
    expect(restored.view().character.knowledge).toEqual([]);
  });

  it("rejects structurally valid character state without replayable consequence proof", () => {
    const fresh = new OverworldSession(WORLD).snapshot();
    const tampered = structuredClone(fresh);
    tampered.character.money = 1_000_000_000;
    tampered.character.abilities.push("ability:god_mode");
    tampered.character.relationships.push({
      npcId: "npc:invented_witness",
      trust: 100,
      regard: 100,
      owesPlayer: 100,
      playerOwes: 0,
      memories: ["memory:invented_debt"],
    });

    expect(() => OverworldSession.restore(WORLD, tampered)).toThrow(
      /campaign character does not match replayed quest consequences/i,
    );
  });

  it("migrates strict v8 saves once and requires character state in canonical v9 saves", () => {
    const fresh = new OverworldSession(WORLD).snapshot();
    const { character: _character, ...withoutCharacter } = fresh;
    const legacy = {
      ...withoutCharacter,
      version: OVERWORLD_SESSION_LEGACY_SAVE_VERSION,
    };

    const migrated = OverworldSession.restore(WORLD, legacy).snapshot();
    expect(migrated.version).toBe(OVERWORLD_SESSION_SAVE_VERSION);
    expect(migrated.character).toEqual(createInitialCampaignCharacterState());
    expect(() => OverworldSession.restore(WORLD, withoutCharacter)).toThrow();
    expect(() =>
      OverworldSession.restore(WORLD, {
        ...legacy,
        character: createInitialCampaignCharacterState(),
      }),
    ).toThrow();
  });
});
