import { describe, expect, it, vi } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { WOLF_WINTER_DISPATCH_DELAY_FLAG } from "../../src/core/embedded_launch_overlay_receipt.js";
import { startOverworldQuestThroughRpg } from "../../src/mcp/overworld_quest_bridge.js";
import { SaveIntegrityError, load, save } from "../../src/persist/save_load.js";
import { indexRpgPack, initStateForRpgPack } from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { assertRpgStateReferences } from "../../src/rpg/state_integrity.js";
import { createInitialCampaignCharacterState } from "../../src/world/campaign_character_state.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";

const wolf = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!wolf.ok) throw new Error("Wolf-Winter must compile.");
const wolfIndex = indexRpgPack(wolf.compiled.pack);
const gallowmere = loadRpgSourceFile("content/rpg/quests/gallowmere.yaml");
if (!gallowmere.ok) throw new Error("Gallowmere must compile.");
const gallowmereIndex = indexRpgPack(gallowmere.compiled.pack);
const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const RELIEF_OATH = WORLD.opening_relief_oath!;
const PREPARATION = WORLD.opening_preparation!;
const RELIEF_ALLOCATION = WORLD.opening_relief_allocation!;
const ALLY = WORLD.opening_ally!;
const WOLF = WORLD.quests.find((quest) => quest.id === "wolf_winter")!;

function moveToArea(session: OverworldSession, targetAreaId: string): void {
  const currentAreaId = session.view().currentArea?.id;
  if (!currentAreaId || currentAreaId === targetAreaId) return;
  const edges = WORLD.area_edges.filter((edge) => edge.home === session.view().current.id);
  const queue = [currentAreaId];
  const previous = new Map<string, string>();
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (current === targetAreaId) break;
    for (const edge of edges.filter(
      (candidate) => candidate.from_area === current || candidate.to_area === current,
    )) {
      const next = edge.from_area === current ? edge.to_area : edge.from_area;
      if (next === currentAreaId || previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  const path: string[] = [];
  for (let cursor = targetAreaId; cursor !== currentAreaId; ) {
    const prior = previous.get(cursor);
    if (!prior) throw new Error(`No area route to ${targetAreaId}.`);
    path.unshift(cursor);
    cursor = prior;
  }
  for (const areaId of path) {
    const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
    if (!route) throw new Error(`Area route to ${areaId} is not visible.`);
    session.moveArea(route.id);
  }
}

function preparedDispatch(args: {
  registrationId: string;
  sourceId: string;
  preparationId: string;
  allyId: string;
}): OverworldSession {
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory(args.registrationId);
  revealCurrentJourneyStoryOptions(session, RELIEF_OATH.id);
  session.chooseJourneyStory(RELIEF_OATH.options[0]!.id);
  session.chooseJourneyStory(args.sourceId);
  moveToArea(session, PREPARATION.area);
  session.chooseJourneyStory(args.preparationId);
  session.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id);
  session.talkToCharacter(ALLY.contact);
  session.chooseJourneyStory(args.allyId);
  return session;
}

function delayedDispatchSession(): OverworldSession {
  return preparedDispatch({
    registrationId: "albany:ironhands_repairer",
    sourceId: "albany:source_hayden_frost_report",
    preparationId: "albany:prep_relief_protocol",
    allyId: "albany:ally_travel_solo",
  });
}

function onTimeDispatchSession(): OverworldSession {
  return preparedDispatch({
    registrationId: "albany:ledger_advocate",
    sourceId: "albany:source_jamie_market_testimony",
    preparationId: "albany:prep_relief_protocol",
    allyId: "albany:ally_travel_solo",
  });
}

function dispatchWindow(status: "on_time" | "delayed" | "legacy_neutral", ledgerMinutes?: number) {
  if (status === "legacy_neutral") {
    return {
      schemaVersion: 1,
      questId: "wolf_winter",
      status,
      proofHash: hashState({ schemaVersion: 1, questId: "wolf_winter", status }),
    };
  }
  const receipt = { departure: "authenticated", boundaries: ["a", "b"] };
  return {
    schemaVersion: 1,
    questId: "wolf_winter",
    status,
    ledgerMinutes,
    receipt,
    proofHash: hashState({
      schemaVersion: 1,
      questId: "wolf_winter",
      status,
      ledgerMinutes,
      receipt,
    }),
  };
}

function questSession(window: unknown) {
  const plan = {
    quest: { id: "wolf_winter" },
    characterAfter: createInitialCampaignCharacterState(),
    dispatchWindow: window,
  };
  const commitQuestStart = vi.fn(() => ({ id: "wolf_winter" }));
  return {
    session: {
      prepareQuestStart: vi.fn(() => plan),
      commitQuestStart,
    } as unknown as OverworldSession,
    commitQuestStart,
  };
}

describe("embedded dispatch opening overlay", () => {
  it("applies only a proven current delayed Wolf-Winter window and persists its local receipt", () => {
    const session = delayedDispatchSession();
    const window = session.prepareQuestStart(WOLF.id, WOLF.launch!.options[0]!.id).dispatchWindow;
    const commitQuestStart = vi.spyOn(session, "commitQuestStart");

    const started = startOverworldQuestThroughRpg({
      session,
      overworldSessionId: "ow-dispatch-window",
      questId: WOLF.id,
      approachId: WOLF.launch!.options[0]!.id,
      startOptions: { seed: 505 },
      startEmbeddedWorldQuest: (_args, context) => {
        expect(context.launchOverlay).toBeDefined();
        expect(Object.isFrozen(context.launchOverlay)).toBe(true);
        const state = initStateForRpgPack(wolfIndex, 505, undefined, context.launchOverlay);
        expect(state.flags[WOLF_WINTER_DISPATCH_DELAY_FLAG]).toBe(true);
        expect(state.embeddedLaunchOverlayReceipt).toMatchObject({
          world_quest_id: "wolf_winter",
          overworld_session_id: "ow-dispatch-window",
          status: "delayed",
          ledger_minutes: 65,
          provenance_hash: window.proofHash,
          applied_flag: WOLF_WINTER_DISPATCH_DELAY_FLAG,
        });
        // The state carries a local opening condition, not a character import.
        expect(state.campaignImportReceipt).toBeUndefined();
        assertRpgStateReferences(wolfIndex, state);
        expect(() =>
          initStateForRpgPack(gallowmereIndex, 505, undefined, context.launchOverlay),
        ).toThrow(/cannot consume this embedded launch overlay/i);

        const bytes = save(state, wolf.compiled.contentHash, "rpg", {
          worldQuestId: "wolf_winter",
        });
        const restored = load(bytes, wolf.compiled.contentHash);
        expect(restored.state).toEqual(state);
        expect(() =>
          save(state, wolf.compiled.contentHash, "rpg", { worldQuestId: "gallowmere" }),
        ).toThrow(/belongs to world quest "wolf_winter"/i);

        const wrongSource = JSON.parse(bytes) as { source_ref: [string, string] };
        wrongSource.source_ref = ["wq", "gallowmere"];
        expect(() => load(JSON.stringify(wrongSource), wolf.compiled.contentHash)).toThrow(
          /belongs to world quest "wolf_winter"/i,
        );

        const invalidBoundary = JSON.parse(bytes) as {
          state: { embeddedLaunchOverlayReceipt: { ledger_minutes: number } };
        };
        invalidBoundary.state.embeddedLaunchOverlayReceipt.ledger_minutes = 60;
        expect(() => load(JSON.stringify(invalidBoundary), wolf.compiled.contentHash)).toThrow(
          SaveIntegrityError,
        );
        return { session_id: "r-delayed" };
      },
    });

    expect(started.rpgSession.session_id).toBe("r-delayed");
    expect(commitQuestStart).toHaveBeenCalledTimes(1);
  });

  it("keeps a proven on-time start neutral", () => {
    const session = onTimeDispatchSession();
    startOverworldQuestThroughRpg({
      session,
      overworldSessionId: "ow-neutral",
      questId: WOLF.id,
      approachId: WOLF.launch!.options[0]!.id,
      startOptions: {},
      startEmbeddedWorldQuest: (_args, context) => {
        expect(context.launchOverlay).toBeUndefined();
        const state = initStateForRpgPack(wolfIndex, 1);
        expect(state.flags[WOLF_WINTER_DISPATCH_DELAY_FLAG]).toBeUndefined();
        expect(state.embeddedLaunchOverlayReceipt).toBeUndefined();
        return { session_id: "r-neutral" };
      },
    });
  });

  it("rejects a structurally forged session before minting an RPG session", () => {
    const { session, commitQuestStart } = questSession(dispatchWindow("delayed", 65));
    const startEmbeddedWorldQuest = vi.fn(() => ({ session_id: "r-should-not-exist" }));

    expect(() =>
      startOverworldQuestThroughRpg({
        session,
        overworldSessionId: "ow-forged-session",
        questId: WOLF.id,
        approachId: WOLF.launch!.options[0]!.id,
        startOptions: {},
        startEmbeddedWorldQuest,
      }),
    ).toThrow(/lacks live session provenance/i);
    expect(startEmbeddedWorldQuest).not.toHaveBeenCalled();
    expect(commitQuestStart).not.toHaveBeenCalled();
  });

  it("rejects a mutated authenticated preparation before minting or committing", () => {
    const session = delayedDispatchSession();
    const plan = session.prepareQuestStart(WOLF.id, WOLF.launch!.options[0]!.id);
    const incomplete = {
      ...dispatchWindow("delayed", 65),
      proofHash: "0".repeat(64),
    };
    (plan as { dispatchWindow: unknown }).dispatchWindow = incomplete;
    vi.spyOn(session, "prepareQuestStart").mockReturnValue(plan);
    const commitQuestStart = vi.spyOn(session, "commitQuestStart");
    const startEmbeddedWorldQuest = vi.fn(() => ({ session_id: "r-should-not-exist" }));

    expect(() =>
      startOverworldQuestThroughRpg({
        session,
        overworldSessionId: "ow-incomplete",
        questId: WOLF.id,
        approachId: WOLF.launch!.options[0]!.id,
        startOptions: {},
        startEmbeddedWorldQuest,
      }),
    ).toThrow(/lacks live session provenance/i);
    expect(startEmbeddedWorldQuest).not.toHaveBeenCalled();
    expect(commitQuestStart).not.toHaveBeenCalled();
  });

  it("rejects a mutated self-consistent claim at the on-time boundary", () => {
    const session = delayedDispatchSession();
    const plan = session.prepareQuestStart(WOLF.id, WOLF.launch!.options[0]!.id);
    (plan as { dispatchWindow: unknown }).dispatchWindow = dispatchWindow("delayed", 60);
    vi.spyOn(session, "prepareQuestStart").mockReturnValue(plan);
    const commitQuestStart = vi.spyOn(session, "commitQuestStart");
    const startEmbeddedWorldQuest = vi.fn(() => ({ session_id: "r-should-not-exist" }));
    expect(() =>
      startOverworldQuestThroughRpg({
        session,
        overworldSessionId: "ow-invalid-boundary",
        questId: WOLF.id,
        approachId: WOLF.launch!.options[0]!.id,
        startOptions: {},
        startEmbeddedWorldQuest,
      }),
    ).toThrow(/lacks live session provenance/i);
    expect(startEmbeddedWorldQuest).not.toHaveBeenCalled();
    expect(commitQuestStart).not.toHaveBeenCalled();
  });

  it("rejects a saved overlay when its required opening flag was tampered", () => {
    const session = delayedDispatchSession();
    let initialState: ReturnType<typeof initStateForRpgPack> | undefined;
    startOverworldQuestThroughRpg({
      session,
      overworldSessionId: "ow-tamper",
      questId: WOLF.id,
      approachId: WOLF.launch!.options[0]!.id,
      startOptions: {},
      startEmbeddedWorldQuest: (_args, context) => {
        initialState = initStateForRpgPack(wolfIndex, 1, undefined, context.launchOverlay);
        return { session_id: "r-tamper" };
      },
    });
    if (!initialState) throw new Error("Expected delayed state.");
    const tampered = structuredClone(initialState);
    tampered.flags[WOLF_WINTER_DISPATCH_DELAY_FLAG] = false;
    expect(() => assertRpgStateReferences(wolfIndex, tampered)).toThrow(SaveIntegrityError);
  });
});
