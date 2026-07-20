/**
 * SS-F08 end-to-end paired proof. Matched Road-Warden/Works/June campaigns use
 * separate deterministic seeds to cover one clean and one failure-forward trace,
 * then carry each stance through a fully noncombat RPG, save/replay,
 * full/compact/browser projections, chronological quest foldback, campaign
 * exports, and one-use Albany services. Same-state causal isolation lives in the
 * quest-local counterfactual suite.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { GameSession } from "../../ui/src/engine.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";

const ROOT = process.cwd();
const WORLD = loadOverworldManifest(ROOT);
const WOLF_SOURCE = readFileSync("content/rpg/quests/wolf_winter.yaml", "utf8");
const WOLF =
  WORLD.quests.find((quest) => quest.id === "wolf_winter") ??
  (() => {
    throw new Error("Albany requires Wolf-Winter");
  })();
const IMPORTS =
  WOLF.campaign_imports ??
  (() => {
    throw new Error("Wolf imports are required");
  })();
const REGISTRATION =
  WORLD.opening_registration ??
  (() => {
    throw new Error("Albany requires registration");
  })();
const ALLY =
  WORLD.opening_ally ??
  (() => {
    throw new Error("Albany requires an ally scene");
  })();
const ROAD_WARDEN =
  REGISTRATION.profiles.find((profile) => profile.id === "albany:road_warden") ??
  (() => {
    throw new Error("Albany requires the Road Warden profile");
  })();

const FULL = { compact_context: false, compact_result: false } as const;
const STATION = "albany_city__transport_hub";
const HAYDEN = "albany_city__transport_hub__contact";
const RESIDENT_SHELTER = "albany:relief_resident_shelter";
const JUNE = "albany:june_pike";
const PROMISE = "albany:promise_june_cattle_first";

type ToolApi = ReturnType<typeof createToolApi>;
type Stance = "cade" | "authority";

const CASES = {
  cade: {
    seed: 3,
    choice: "ask_accept_terms",
    take: "take_cade_household_shutters",
    outer: "use_cade_household_shutters_on_fortify_outer_seal",
    recovery: "use_cade_failed_seal_help",
    threshold: "use_cade_household_shutters_on_fortify_threshold_seal",
    ending: "ending_fortified_cade_terms",
    title: "Dawn Behind Cade's Shutters",
    serviceId: "albany:wolf_fortified_cade_terms_station_resupply",
    serviceAction: "resupply",
    serviceTitle: "Claim the Preserved-Seal Road Stores",
    memory: "memory:wolf_winter_fortified_cade_terms",
    oppositeMemory: "memory:wolf_winter_fortified_albany_authority",
    haydenMemory: "albany:memory_hayden_wolf_fortified_cade_terms",
    oppositeHaydenMemory: "albany:memory_hayden_wolf_fortified_albany_authority",
    juneMemory: "albany:memory_june_fortified_cade_terms",
    oppositeJuneMemory: "albany:memory_june_fortified_albany_authority",
    facts: [
      "fact:wolf_winter_byre_held",
      "fact:wolf_winter_cade_terms_honored",
      "fact:wolf_winter_cattle_whole",
      "fact:wolf_winter_outer_property_exposed",
      "fact:wolf_winter_pack_outlasted_alive",
      "fact:wolf_winter_people_safe",
      "fact:wolf_winter_public_relief_seals_preserved",
    ],
    absentFacts: [
      "fact:wolf_winter_albany_authority_invoked",
      "fact:wolf_winter_outer_property_preserved",
      "fact:wolf_winter_public_relief_seals_spent",
    ],
    dispatchTokens: [
      /household/i,
      /whole herd/i,
      /shutters/i,
      /outer property/i,
      /exposed/i,
      /relief seals/i,
      /unused|reserve/i,
    ],
  },
  authority: {
    seed: 6,
    choice: "ask_invoke_authority",
    take: "take_albany_relief_seals",
    outer: "use_albany_relief_seals_on_fortify_outer_seal",
    recovery: null,
    threshold: "use_albany_relief_seals_on_fortify_threshold_seal",
    ending: "ending_fortified_albany_authority",
    title: "Dawn Under Albany Seal",
    serviceId: "albany:wolf_fortified_albany_authority_station_rest",
    serviceAction: "rest",
    serviceTitle: "Take the Authority-Watch Recovery Cot",
    memory: "memory:wolf_winter_fortified_albany_authority",
    oppositeMemory: "memory:wolf_winter_fortified_cade_terms",
    haydenMemory: "albany:memory_hayden_wolf_fortified_albany_authority",
    oppositeHaydenMemory: "albany:memory_hayden_wolf_fortified_cade_terms",
    juneMemory: "albany:memory_june_fortified_albany_authority",
    oppositeJuneMemory: "albany:memory_june_fortified_cade_terms",
    facts: [
      "fact:wolf_winter_albany_authority_invoked",
      "fact:wolf_winter_byre_held",
      "fact:wolf_winter_cade_help_refused",
      "fact:wolf_winter_cattle_whole",
      "fact:wolf_winter_outer_property_preserved",
      "fact:wolf_winter_pack_outlasted_alive",
      "fact:wolf_winter_people_safe",
      "fact:wolf_winter_public_relief_seals_spent",
    ],
    absentFacts: [
      "fact:wolf_winter_cade_terms_honored",
      "fact:wolf_winter_outer_property_exposed",
      "fact:wolf_winter_public_relief_seals_preserved",
    ],
    dispatchTokens: [
      /household/i,
      /whole herd/i,
      /outer property/i,
      /seal/i,
      /relief seals/i,
      /spent/i,
      /refus/i,
    ],
  },
} as const;

function fullView(api: ToolApi, sessionId: string) {
  return api.get_overworld_session({
    session_id: sessionId,
    include_observation: true,
  }).observation;
}

function moveToArea(api: ToolApi, sessionId: string, areaId: string): void {
  const before = fullView(api, sessionId);
  if (before.currentArea?.id === areaId) return;
  const route = before.areaExits.find((candidate) => candidate.destination.id === areaId);
  if (!route) {
    throw new Error(
      `No visible Albany route from ${before.currentArea?.id ?? "none"} to ${areaId}; visible: ${before.areaExits
        .map((candidate) => candidate.destination.id)
        .join(", ")}`,
    );
  }
  api.move_overworld_session_area({
    ...FULL,
    session_id: sessionId,
    area_route_id: route.id,
  });
}

function launchAlbanyWolf(api: ToolApi, seed: number) {
  const started = api.start_overworld({ compact_context: false });
  const overworldSessionId = started.session_id;
  const civicPoi = started.observation.pois[0];
  if (!civicPoi) throw new Error("Expected Albany's civic opening");
  api.scout_overworld_session_poi({
    ...FULL,
    session_id: overworldSessionId,
    poi_id: civicPoi.id,
  });
  api.talk_overworld_session_contact({
    ...FULL,
    session_id: overworldSessionId,
    character_id: REGISTRATION.contact,
  });
  api.choose_overworld_session_story({
    ...FULL,
    session_id: overworldSessionId,
    choice: ROAD_WARDEN.id,
  });
  api.choose_overworld_session_story({
    ...FULL,
    session_id: overworldSessionId,
    choice: "albany:oath_limited_aid_only",
  });
  const sourced = api.choose_overworld_session_story({
    ...FULL,
    session_id: overworldSessionId,
    choice: "albany:source_rowan_civic_docket",
  });
  const preparationArea = WORLD.opening_preparation?.area;
  if (!preparationArea) throw new Error("Albany requires opening preparation");
  const preparationRoute = sourced.observation.areaExits.find(
    (candidate) => candidate.destination.id === preparationArea,
  );
  if (!preparationRoute) throw new Error("Expected a route to the opening preparation board");
  api.move_overworld_session_area({
    ...FULL,
    session_id: overworldSessionId,
    area_route_id: preparationRoute.id,
  });
  api.choose_overworld_session_story({
    ...FULL,
    session_id: overworldSessionId,
    choice: "albany:prep_works_fortification",
  });
  api.choose_overworld_session_story({
    ...FULL,
    session_id: overworldSessionId,
    choice: RESIDENT_SHELTER,
  });

  moveToArea(api, overworldSessionId, ALLY.area);
  api.talk_overworld_session_contact({
    ...FULL,
    session_id: overworldSessionId,
    character_id: ALLY.contact,
  });
  api.choose_overworld_session_story({
    ...FULL,
    session_id: overworldSessionId,
    choice: "albany:ally_june_cattle_first",
  });

  const launched = api.start_overworld_session_quest({
    ...FULL,
    compact_actions: false,
    compact_observation: false,
    include_actions: true,
    session_id: overworldSessionId,
    quest_id: WOLF.id,
    approach_id: "albany:wolf_approach_sheltered_stockway",
    seed,
  });
  return { launched, overworldSessionId };
}

function routeFor(stance: Stance): readonly string[] {
  const contract = CASES[stance];
  return [
    "use_sheltered_stockway_last_mile",
    "talk_houndsman",
    "ask_fortify",
    contract.choice,
    "ask_leave",
    contract.take,
    "go_north",
    contract.outer,
    ...(contract.recovery ? [contract.recovery] : []),
    "go_north",
    contract.threshold,
    "go_north",
    "talk_june_pike_fortify",
    "ask_acknowledge",
    "use_fortify_dawn_watch",
  ];
}

function addRoadStrain(api: ToolApi, sessionId: string): void {
  let view = fullView(api, sessionId);
  const outbound = view.exits.find((road) => road.destination.id === "colonie_town");
  if (!outbound) throw new Error("Expected Albany's Colonie road");
  api.travel_overworld_session({ ...FULL, session_id: sessionId, road_id: outbound.id });
  view = fullView(api, sessionId);
  if (view.pendingRoadEncounter) {
    api.resolve_overworld_session_road_encounter({
      ...FULL,
      session_id: sessionId,
      strategy: "press_on",
    });
  }
  view = fullView(api, sessionId);
  const inbound = view.exits.find((road) => road.destination.id === "albany_city");
  if (!inbound) throw new Error("Expected Colonie's Albany road");
  api.travel_overworld_session({ ...FULL, session_id: sessionId, road_id: inbound.id });
  view = fullView(api, sessionId);
  if (view.pendingRoadEncounter) {
    api.resolve_overworld_session_road_encounter({
      ...FULL,
      session_id: sessionId,
      strategy: "press_on",
    });
  }
  moveToArea(api, sessionId, STATION);
}

function playFortify(stance: Stance) {
  const contract = CASES[stance];
  const api = createToolApi({ root: ROOT });
  const { launched, overworldSessionId } = launchAlbanyWolf(api, contract.seed);
  const rpgSessionId = launched.rpg_session_id;
  const route = routeFor(stance);
  const character = api.export_overworld_session({ session_id: overworldSessionId }).snapshot
    .character;
  const ui = GameSession.startEmbedded(WOLF_SOURCE, character, IMPORTS, contract.seed);
  expect(ui.view().stateHash).toBe(api.sessions.get(rpgSessionId).stateHash);

  let detachedSessionId: string | null = null;
  let committed = false;
  let finalStep: ReturnType<ToolApi["step_action"]> | null = null;
  for (const actionId of route) {
    const primary = api.step_action({
      session_id: rpgSessionId,
      action_id: actionId,
      compact_observation: false,
      compact_events: false,
    });
    expect(primary.ok, primary.rejection_reason).toBe(true);
    const uiStep = ui.choose(actionId);
    expect(uiStep.ok, uiStep.rejection ?? undefined).toBe(true);
    expect(ui.view().stateHash).toBe(api.sessions.get(rpgSessionId).stateHash);
    finalStep = primary;

    if (actionId === contract.choice) {
      committed = true;
      const saved = api.save_game({
        session_id: rpgSessionId,
        include_source: true,
        include_content_hash: true,
      });
      const loaded = api.load_game({ save: saved.save, compact_observation: false });
      detachedSessionId = loaded.session_id;
      expect(loaded.state_hash).toBe(primary.state_hash);
      expect(
        api.get_state({ session_id: detachedSessionId, include_state: true }).state
          .campaignImportReceipt,
      ).toEqual(
        api.get_state({ session_id: rpgSessionId, include_state: true }).state
          .campaignImportReceipt,
      );
    } else if (detachedSessionId) {
      const compact = actionId === contract.threshold;
      const mirror = api.step_action({
        session_id: detachedSessionId,
        action_id: actionId,
        compact_observation: compact,
        compact_events: compact,
      });
      expect(mirror.ok, mirror.rejection_reason).toBe(true);
      expect(mirror.state_hash).toBe(primary.state_hash);
      if (compact) {
        const expectedValue = stance === "cade" ? 3 : 2;
        expect(mirror.context.pressure).toContainEqual([
          "winter_siege",
          "Winter siege",
          expectedValue,
          expectedValue,
          stance === "cade" ? "Strained" : "Hammering",
          stance === "cade" ? 6 : 3,
          stance === "cade" ? "Outlasted" : "Strained",
        ]);
        expect(mirror.context.enemies).toBeUndefined();
        expect(
          primary.observation.pressure_tracks?.find((track) => track.id === "winter_siege"),
        ).toMatchObject({
          value: expectedValue,
          band: { label: stance === "cade" ? "Strained" : "Hammering" },
        });
        expect(ui.view().facts.join("\n")).toMatch(
          stance === "cade"
            ? /Winter siege — Strained \(3; next Outlasted at 6\)/i
            : /Winter siege — Hammering \(2; next Strained at 3\)/i,
        );
      }
    }

    if (committed && !primary.questCompletion) {
      expect(primary.observation.enemies_present).toEqual([]);
      expect(
        primary.observation.available_actions
          .map((action) => action.id)
          .filter((id) => id.startsWith("attack_") || id.startsWith("maneuver_")),
      ).toEqual([]);
      expect(
        ui
          .view()
          .choices.map((choice) => choice.id)
          .filter((id) => id.startsWith("attack_") || id.startsWith("maneuver_")),
      ).toEqual([]);
    }
  }

  if (!finalStep) throw new Error("Fortify route must contain actions");
  expect(finalStep.questCompletion?.endingId).toBe(contract.ending);
  expect(finalStep.questCompletion?.endingTitle).toBe(contract.title);
  expect(finalStep.journey.acceptedDecisions).toBeLessThanOrEqual(45);
  expect(finalStep.journey.pendingChoice?.message).toMatch(/dawn/i);
  expect(finalStep.journey.pendingChoice?.message).toMatch(/(?:wolves|pack)[^]*alive/i);
  expect(ui.ending()).toMatchObject({ id: contract.ending, title: contract.title });
  const finalState = api.get_state({ session_id: rpgSessionId, include_state: true }).state;
  expect(finalState).toMatchObject({
    ended: true,
    endingId: contract.ending,
    vars: { score: 35, fortification_pressure: 6 },
    flags: { fortify_dawn_held: true, fortify_pack_outlasted: true },
  });
  expect(finalState.flags.yearling_down).not.toBe(true);
  expect(finalState.flags.flank_wolf_down).not.toBe(true);
  expect(finalState.flags.leader_down).not.toBe(true);
  if (stance === "cade") {
    expect(finalState.flags).toMatchObject({
      fortify_outer_seal_failed: true,
      fortify_cade_recovery_helped: true,
    });
  } else {
    expect(finalState.flags.fortify_outer_seal_failed).not.toBe(true);
  }
  if (detachedSessionId) {
    expect(api.get_state({ session_id: detachedSessionId }).state_hash).toBe(finalStep.state_hash);
  }
  const transcript = api.get_transcript({
    session_id: rpgSessionId,
    summary_only: false,
    compact_events: false,
    compact_summary: false,
  });
  expect(transcript.turns.slice(1).map((turn) => turn.action_id)).toEqual(route);
  expect(transcript.summary.ending_id).toBe(contract.ending);

  const continued = api.choose_overworld_session_journey({
    ...FULL,
    session_id: overworldSessionId,
    choice: "continue",
  });
  expect(continued.journey.storyChoice?.id).toBe("albany_dawn_dispatch");
  for (const option of continued.journey.storyChoice?.options ?? []) {
    for (const token of contract.dispatchTokens) expect(option.consequence).toMatch(token);
  }
  const returned = api.choose_overworld_session_story({
    ...FULL,
    session_id: overworldSessionId,
    choice: "send_wagon_to_cade",
  });
  expect(returned.journey.acceptedDecisions).toBeLessThanOrEqual(45);
  expect(returned.observation.currentArea?.id).toBe(STATION);

  const view = fullView(api, overworldSessionId);
  const stanceService = view.serviceOffers.find((offer) => offer.id === contract.serviceId);
  expect(stanceService).toEqual({
    id: contract.serviceId,
    action: contract.serviceAction,
    title: contract.serviceTitle,
    summary: expect.stringMatching(
      stance === "cade" ? /household[^]*exposed[^]*unused/i : /authority[^]*spent[^]*refused help/i,
    ),
    minutes: 15,
    providerId: HAYDEN,
    providerName: "Hayden Hale",
  });
  expect(view.serviceOffers.map((offer) => offer.id)).not.toContain(
    stance === "cade" ? CASES.authority.serviceId : CASES.cade.serviceId,
  );
  const compact = api.get_overworld_session_context({
    session_id: overworldSessionId,
    compact_context: true,
  }).context;
  expect(compact.service_offers).toContainEqual([
    contract.serviceId,
    contract.serviceAction,
    contract.serviceTitle,
    stanceService!.summary,
    15,
  ]);

  const snapshot = api.export_overworld_session({ session_id: overworldSessionId }).snapshot;
  expect(snapshot.questOutcomes).toContainEqual([WOLF.id, contract.ending]);
  const restoredCore = OverworldSession.restore(WORLD, snapshot);
  expect(restoredCore.campaignWorldFactIds()).toEqual(contract.facts);
  for (const fact of contract.absentFacts) {
    expect(restoredCore.campaignWorldFactIds()).not.toContain(fact);
  }
  const cade = snapshot.character.relationships.find(
    (relationship) => relationship.npcId === "npc:old_cade",
  );
  const hayden = snapshot.character.relationships.find(
    (relationship) => relationship.npcId === "albany:hayden_hale",
  );
  const june = snapshot.character.relationships.find((relationship) => relationship.npcId === JUNE);
  expect(cade?.memories).toContain(contract.memory);
  expect(cade?.memories).not.toContain(contract.oppositeMemory);
  expect(hayden?.memories).toContain(contract.haydenMemory);
  expect(hayden?.memories).not.toContain(contract.oppositeHaydenMemory);
  expect(june?.memories).toContain(contract.juneMemory);
  expect(june?.memories).not.toContain(contract.oppositeJuneMemory);
  expect(snapshot.character.companions).toContain(JUNE);
  expect(snapshot.character.promises).toContainEqual({
    promiseId: PROMISE,
    recipientId: JUNE,
    status: "kept",
  });

  const completion = snapshot.journalEntries.find((entry) => entry.id === "quest_done:wolf_winter");
  const questStart = snapshot.openingLeadSourceDecisionTrail?.decisions.find(
    (decision) =>
      decision.actionId === "quest_start:wolf_winter:albany:wolf_approach_sheltered_stockway",
  );
  if (
    !completion?.questCompletionBoundary ||
    !questStart ||
    !snapshot.openingLeadSourceDecisionTrail
  ) {
    throw new Error("Expected chronological Wolf-Winter completion proof");
  }
  expect(completion.questCompletionBoundary.acceptedDecisions).toBeGreaterThan(questStart.number);

  expect(restoredCore.view().serviceOffers).toEqual(view.serviceOffers);
  expect(UiOverworldSession.restore(WORLD, snapshot).view().serviceOffers).toEqual(
    view.serviceOffers,
  );
  const restored = api.restore_overworld_session({ ...FULL, snapshot });
  expect(restored.observation.serviceOffers).toEqual(view.serviceOffers);
  expect(
    api.get_overworld_session_context({
      session_id: restored.session_id,
      compact_context: true,
    }).context.service_offers,
  ).toEqual(compact.service_offers);

  return { api, contract, restoredSessionId: restored.session_id, snapshot, stance };
}

describe("SS-F08 — fortify conduct survives the full Albany return", () => {
  it("keeps consent and authority distinct across replay, exports, and bounded services", () => {
    const cade = playFortify("cade");
    const authority = playFortify("authority");

    expect(routeFor("cade").slice(0, 3)).toEqual(routeFor("authority").slice(0, 3));
    expect(cade.snapshot.character).not.toEqual(authority.snapshot.character);
    expect(OverworldSession.restore(WORLD, cade.snapshot).campaignWorldFactIds()).not.toEqual(
      OverworldSession.restore(WORLD, authority.snapshot).campaignWorldFactIds(),
    );

    for (const completed of [cade, authority]) {
      addRoadStrain(completed.api, completed.restoredSessionId);
      const before = fullView(completed.api, completed.restoredSessionId);
      const claimed =
        completed.contract.serviceAction === "resupply"
          ? completed.api.resupply_overworld_session({
              ...FULL,
              session_id: completed.restoredSessionId,
            })
          : completed.api.rest_overworld_session({
              ...FULL,
              session_id: completed.restoredSessionId,
            });
      expect(claimed.result).toMatchObject({
        action: completed.contract.serviceAction,
        changed: true,
        minutes: 15,
      });
      expect(before.serviceOffers.map((offer) => offer.id)).toContain(completed.contract.serviceId);
      expect(claimed.observation.serviceOffers.map((offer) => offer.id)).not.toContain(
        completed.contract.serviceId,
      );

      const consumed = completed.api.export_overworld_session({
        session_id: completed.restoredSessionId,
      }).snapshot;
      expect(consumed.journalEntries).toContainEqual(
        expect.objectContaining({
          kind: "service",
          serviceRuleId: completed.contract.serviceId,
          serviceAreaId: STATION,
          serviceBoundary: expect.objectContaining({ areaId: STATION }),
        }),
      );
      const remainingOffers = claimed.observation.serviceOffers;
      expect(OverworldSession.restore(WORLD, consumed).view().serviceOffers).toEqual(
        remainingOffers,
      );
      expect(UiOverworldSession.restore(WORLD, consumed).view().serviceOffers).toEqual(
        remainingOffers,
      );
    }
  });

  it("rejects a completion journal folded back to the earlier quest-start decision", () => {
    const completed = playFortify("authority");
    const forged = structuredClone(completed.snapshot);
    const trail = forged.openingLeadSourceDecisionTrail;
    const questStart = trail?.decisions.find(
      (decision) =>
        decision.actionId === "quest_start:wolf_winter:albany:wolf_approach_sheltered_stockway",
    );
    const completion = forged.journalEntries.find((entry) => entry.id === "quest_done:wolf_winter");
    if (!trail || !questStart || !completion?.questCompletionBoundary) {
      throw new Error("Expected Wolf-Winter journey and completion proofs");
    }
    let questStartProofHash = trail.baseDecisionProofHash;
    for (const decision of trail.decisions) {
      questStartProofHash = hashState({ previous: questStartProofHash, ...decision });
      if (decision.number === questStart.number) break;
    }
    completion.questCompletionBoundary.acceptedDecisions = questStart.number;
    completion.questCompletionBoundary.decisionProofHash = questStartProofHash;
    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /quest completion journal "quest_done:wolf_winter" does not match its completed journey goal decision/i,
    );
  });
});
