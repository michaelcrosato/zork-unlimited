import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyRestoredQuestEnding,
  goalRelevantAreaIds,
  JOURNEY_SAVE_KEY,
  LEGACY_OVERWORLD_SAVE_KEY,
  loadInitialWorldSession,
  persistActiveQuest,
  persistWorldSession,
  stationSupportPresentation,
  type ActiveQuestSaveState,
} from "../../ui/src/App.js";
import { GameSession } from "../../ui/src/engine.js";
import {
  focusedOptionalSupportActions,
  focusedWorldActions,
  type WorldActionSection,
} from "../../ui/src/OverworldPlayScreen.js";
import { playerActionLabel } from "../../ui/src/QuestPlayScreen.js";
import { OverworldSession } from "../../ui/src/overworld.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";

const world = loadOverworldManifest(process.cwd());
const wolf = (() => {
  const quest = world.quests.find((candidate) => candidate.id === "wolf_winter");
  if (!quest) throw new Error("Expected Wolf-Winter in the test manifest.");
  return quest;
})();
const wolfSource = readFileSync(wolf.source, "utf8");

type Trail = ActiveQuestSaveState["trail"];

function areaPath(from: string, to: string): string[] {
  const queue: { area: string; routeIds: string[] }[] = [{ area: from, routeIds: [] }];
  const seen = new Set([from]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (current.area === to) return current.routeIds;
    for (const edge of world.area_edges.filter(
      (candidate) => candidate.from_area === current.area || candidate.to_area === current.area,
    )) {
      const next = edge.from_area === current.area ? edge.to_area : edge.from_area;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ area: next, routeIds: [...current.routeIds, edge.id] });
    }
  }
  throw new Error(`No area path from ${from} to ${to}.`);
}

function moveToArea(session: OverworldSession, targetArea: string): void {
  const currentArea = session.view().currentArea?.id;
  if (!currentArea || currentArea === targetArea) return;
  for (const routeId of areaPath(currentArea, targetArea)) {
    let view = session.view();
    let route = view.areaExits.find((candidate) => candidate.id === routeId);
    if (!route || !view.discoveredAreaIds.includes(route.destination.id)) {
      session.exploreArea(view.currentArea!.id);
      view = session.view();
      route = view.areaExits.find((candidate) => candidate.id === routeId);
    }
    if (!route) throw new Error(`Expected visible route ${routeId}.`);
    session.moveArea(route.id);
  }
}

function stationBeforeOptionalSupport(): OverworldSession {
  const session = new OverworldSession(world);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  session.talkToCharacter(opening.characters[0]!.id);
  session.chooseJourneyStory("albany:ledger_advocate");
  revealCurrentJourneyStoryOptions(session, world.opening_relief_oath!.id);
  session.chooseJourneyStory("albany:oath_limited_aid_only");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  moveToArea(session, world.opening_preparation!.area);
  return session;
}

function preparedWolf(
  seed = 1,
  preparation = "albany:prep_works_fortification",
  ally?: "albany:ally_june_cattle_first",
): {
  parent: OverworldSession;
  child: GameSession;
  active: ActiveQuestSaveState;
} {
  const parent = new OverworldSession(world);
  const opening = parent.view();
  parent.scoutPoi(opening.pois[0]!.id);
  parent.talkToCharacter(opening.characters[0]!.id);
  parent.chooseJourneyStory("albany:ledger_advocate");
  revealCurrentJourneyStoryOptions(parent, world.opening_relief_oath!.id);
  parent.chooseJourneyStory("albany:oath_limited_aid_only");
  parent.chooseJourneyStory("albany:source_rowan_civic_docket");
  moveToArea(parent, world.opening_preparation!.area);
  parent.chooseJourneyStory(preparation);
  parent.chooseJourneyStory("albany:relief_resident_shelter");
  if (ally) {
    moveToArea(parent, world.opening_ally!.area);
    parent.talkToCharacter(world.opening_ally!.contact);
    parent.chooseJourneyStory(ally);
  }
  moveToArea(parent, wolf.area);

  const preQuestWorld = parent.snapshot();
  const plan = parent.prepareQuestStart(wolf.id, "albany:wolf_approach_sheltered_stockway");
  const child = GameSession.startEmbedded(
    wolfSource,
    plan.characterAfter,
    wolf.campaign_imports,
    seed,
  );
  parent.commitQuestStart(plan);
  return {
    parent,
    child,
    active: {
      questId: wolf.id,
      approachId: plan.approachId,
      preQuestWorld,
      trail: [],
    },
  };
}

function chooseQuest(
  parent: OverworldSession,
  child: GameSession,
  trail: Trail,
  actionId: string,
): void {
  const result = child.choose(actionId);
  expect(result.ok, `${actionId}: ${result.rejection ?? "rejected"}`).toBe(true);
  expect(result.journeyActionId).toBe(actionId);
  parent.recordQuestDecision(actionId, result.journeyDecision, child.isCheckpointSafeBoundary());
  trail.push({ kind: "quest", actionId });
}

function questEnvelope(prepared: ReturnType<typeof preparedWolf>): Record<string, unknown> {
  return {
    browserSaveVersion: 2,
    phase: "quest",
    questId: prepared.active.questId,
    approachId: prepared.active.approachId,
    preQuestWorld: prepared.active.preQuestWorld,
    trail: prepared.active.trail,
    questSave: prepared.child.saveEmbedded(prepared.active.questId),
    worldSnapshotHash: prepared.parent.snapshotHash(),
  };
}

function withStorage<T>(
  initial: Readonly<Record<string, string>>,
  run: (stored: Map<string, string>) => T,
  failWrites = false,
  failReads = false,
): T {
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const stored = new Map(Object.entries(initial));
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => {
          if (failReads) throw new Error("storage access denied");
          return stored.get(key) ?? null;
        },
        setItem: (key: string, value: string) => {
          if (failWrites) throw new Error("storage unavailable");
          stored.set(key, value);
        },
        removeItem: (key: string) => stored.delete(key),
      },
    },
  });
  try {
    return run(stored);
  } finally {
    if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

describe("browser active-quest persistence", () => {
  it("resumes the exact quest and parent decision state through canonical replay", () => {
    const prepared = preparedWolf();
    chooseQuest(
      prepared.parent,
      prepared.child,
      prepared.active.trail,
      "use_sheltered_stockway_last_mile",
    );
    chooseQuest(prepared.parent, prepared.child, prepared.active.trail, "go_north");
    const expectedQuestHash = prepared.child.view().stateHash;
    const expectedWorldHash = prepared.parent.snapshotHash();
    const raw = JSON.stringify(questEnvelope(prepared));

    const restored = withStorage({ [JOURNEY_SAVE_KEY]: raw }, () => loadInitialWorldSession());
    expect(restored.origin).toBe("resume");
    expect(restored.recoveryError).toBeNull();
    expect(restored.activeQuest?.id).toBe(wolf.id);
    expect(restored.questSession?.view().stateHash).toBe(expectedQuestHash);
    expect(restored.session.snapshotHash()).toBe(expectedWorldHash);
    expect(restored.activeQuestSave?.preQuestWorld).toEqual(
      OverworldSession.restore(world, prepared.active.preQuestWorld).snapshot(),
    );
  });

  it.each(["continue", "end"] as const)(
    "replays an in-quest checkpoint %s choice in sequence",
    (choice) => {
      const prepared = preparedWolf();
      chooseQuest(
        prepared.parent,
        prepared.child,
        prepared.active.trail,
        "use_sheltered_stockway_last_mile",
      );
      for (
        let attempts = 0;
        !prepared.parent.journey().pendingChoice && attempts < 80;
        attempts += 1
      ) {
        const movement = prepared.child
          .view()
          .choices.find((candidate) => candidate.kind === "MOVE");
        if (!movement) throw new Error("Expected reversible Wolf-Winter movement.");
        chooseQuest(prepared.parent, prepared.child, prepared.active.trail, movement.id);
      }
      expect(prepared.parent.journey().pendingChoice?.reasons).toContain("checkpoint");
      prepared.parent.chooseJourney(choice);
      prepared.active.trail.push({ kind: "journey", choice });
      const raw = JSON.stringify(questEnvelope(prepared));

      const restored = withStorage({ [JOURNEY_SAVE_KEY]: raw }, () => loadInitialWorldSession());
      expect(restored.recoveryError).toBeNull();
      expect(restored.session.snapshotHash()).toBe(prepared.parent.snapshotHash());
      expect(restored.session.journey().status).toBe(choice === "end" ? "ended" : "active");
      expect(restored.session.journey().retentionHistory.at(-1)?.choice).toBe(choice);
    },
  );

  it("fails closed instead of falling back when quest evidence is tampered", () => {
    const prepared = preparedWolf();
    chooseQuest(
      prepared.parent,
      prepared.child,
      prepared.active.trail,
      "use_sheltered_stockway_last_mile",
    );
    const valid = questEnvelope(prepared);
    const legacy = JSON.stringify(prepared.active.preQuestWorld);
    const questSave = JSON.parse(String(valid.questSave)) as Record<string, unknown>;
    const unexpectedSeed = questEnvelope(preparedWolf(2));
    const cases: Record<string, unknown>[] = [
      { ...valid, trail: [{ kind: "quest", actionId: "not_a_legal_action" }] },
      { ...valid, worldSnapshotHash: "0".repeat(64) },
      { ...valid, questSave: JSON.stringify({ ...questSave, stateHash: "0".repeat(64) }) },
      { ...valid, questSave: JSON.stringify({ ...questSave, contentHash: "changed-content" }) },
      unexpectedSeed,
      { ...valid, unexpected: true },
    ];

    for (const candidate of cases) {
      const restored = withStorage(
        {
          [JOURNEY_SAVE_KEY]: JSON.stringify(candidate),
          [LEGACY_OVERWORLD_SAVE_KEY]: legacy,
        },
        () => loadInitialWorldSession(),
      );
      expect(restored.origin).toBe("blocked");
      expect(restored.recoveryError).toMatch(/could not be verified/i);
      expect(restored.questSession).toBeNull();
      expect(restored.session.view().startedQuestIds).toEqual([]);
    }
  });

  it("recovers a completed ending across a refresh before road-save replacement", () => {
    const prepared = preparedWolf();
    const route = [
      "use_sheltered_stockway_last_mile",
      "talk_houndsman",
      "ask_lure",
      "ask_commit_lure",
      "ask_leave",
      "go_west",
      "take_winter_feed_sack",
      "go_east",
      "go_north",
      "use_winter_feed_sack_on_downwind_feed_line",
      "go_south",
      "go_west",
      "go_up",
      "use_winter_feed_sack_on_loft_hatch",
      "go_east",
      "go_north",
      "use_winter_feed_sack_on_outer_scent_gate",
      "go_north",
    ];
    for (const actionId of route) {
      chooseQuest(prepared.parent, prepared.child, prepared.active.trail, actionId);
    }
    expect(prepared.child.ending()).toMatchObject({ id: "ending_pack_diverted", death: false });
    const raw = JSON.stringify(questEnvelope(prepared));

    const restored = withStorage({ [JOURNEY_SAVE_KEY]: raw }, () => loadInitialWorldSession());
    expect(restored.recoveryError).toBeNull();
    expect(restored.questSession).toBeNull();
    expect(restored.activeQuest).toBeNull();
    expect(restored.session.view().completedQuestIds).toContain(wolf.id);
    expect(restored.session.snapshot().questOutcomes).toContainEqual([
      wolf.id,
      "ending_pack_diverted",
    ]);
  });

  it("folds a restored death into the mandatory journey boundary without completing the quest", () => {
    const prepared = preparedWolf();
    applyRestoredQuestEnding(prepared.parent, wolf.id, {
      id: "ending_pulled_down",
      title: "Pulled Down",
      death: true,
    });

    expect(prepared.parent.view().completedQuestIds).not.toContain(wolf.id);
    expect(prepared.parent.journey().pendingChoice?.reasons).toEqual(["character_died"]);
  });

  it("blocks a tampered v2 road envelope without silently loading legacy progress", () => {
    const session = new OverworldSession(world);
    const tampered = {
      browserSaveVersion: 2,
      phase: "road",
      world: session.snapshot(),
      unexpected: true,
    };
    const restored = withStorage(
      {
        [JOURNEY_SAVE_KEY]: JSON.stringify(tampered),
        [LEGACY_OVERWORLD_SAVE_KEY]: JSON.stringify(session.snapshot()),
      },
      () => loadInitialWorldSession(),
    );

    expect(restored.origin).toBe("blocked");
    expect(restored.recoveryError).toMatch(/could not be verified/i);
    expect(restored.session.view().startedQuestIds).toEqual([]);
  });

  it("treats an existing empty v2 value as corrupt instead of loading a legacy save", () => {
    const legacy = new OverworldSession(world).snapshot();
    const restored = withStorage(
      {
        [JOURNEY_SAVE_KEY]: "",
        [LEGACY_OVERWORLD_SAVE_KEY]: JSON.stringify(legacy),
      },
      () => loadInitialWorldSession(),
    );

    expect(restored.origin).toBe("blocked");
    expect(restored.recoveryError).toMatch(/could not be verified/i);
  });

  it("migrates a valid v1 road save and reports a failed browser write", () => {
    const session = new OverworldSession(world);
    withStorage({ [LEGACY_OVERWORLD_SAVE_KEY]: JSON.stringify(session.snapshot()) }, (stored) => {
      expect(loadInitialWorldSession().origin).toBe("resume");
      expect(persistWorldSession(session)).toBe(true);
      expect(stored.has(JOURNEY_SAVE_KEY)).toBe(true);
      expect(stored.has(LEGACY_OVERWORLD_SAVE_KEY)).toBe(false);
    });
    withStorage({}, () => expect(persistWorldSession(session)).toBe(false), true);
  });

  it("reports active-quest storage failure instead of promising a save", () => {
    const prepared = preparedWolf();
    withStorage(
      {},
      () =>
        expect(persistActiveQuest(prepared.parent, prepared.child, prepared.active)).toBe(false),
      true,
    );
  });

  it("starts safely with truthful unavailable status when browser reads are denied", () => {
    const restored = withStorage({}, () => loadInitialWorldSession(), false, true);

    expect(restored.origin).toBe("new");
    expect(restored.storageAvailable).toBe(false);
    expect(restored.notice).toMatch(/saving is unavailable/i);
    expect(restored.recoveryError).toBeNull();
  });
});

describe("player-facing action presentation", () => {
  it("removes parser-verb duplication without changing engine choice ids", () => {
    expect(playerActionLabel({ kind: "MOVE", title: "go north" })).toBe("Move north");
    expect(playerActionLabel({ kind: "ASK", title: "ask: LURE" })).toBe("Ask LURE");
    expect(playerActionLabel({ kind: "ASK", title: "ask ask: LURE" })).toBe("Ask LURE");
    expect(playerActionLabel({ kind: "TAKE", title: "take take padded byre-jerkin" })).toBe(
      "Take padded byre-jerkin",
    );
    expect(playerActionLabel({ kind: "INVENTORY", title: "inventory" })).toBe("Review");
    expect(playerActionLabel({ kind: "MOVE", title: "go" })).toBe("Move");
    expect(playerActionLabel({ kind: "ASK", title: "  " })).toBe("Ask");
  });

  it("renders Wolf-Winter's authored decision stages without inventing a browser-only label", () => {
    const prepared = preparedWolf();
    for (const actionId of ["use_sheltered_stockway_last_mile", "talk_houndsman"] as const) {
      const result = prepared.child.choose(actionId);
      expect(result.ok, `${actionId}: ${result.rejection ?? "rejected"}`).toBe(true);
    }

    const root = prepared.child.view();
    const planCards = root.choices.filter((choice) =>
      ["ask_hunt", "ask_lure", "ask_drive", "ask_fortify"].includes(choice.id),
    );
    expect(planCards.map((choice) => choice.id)).toEqual([
      "ask_hunt",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
    ]);
    for (const choice of planCards) {
      const authored = choice.title.replace(/^ask:\s*/i, "");
      expect(authored).toMatch(/^COMPARE — \w+ \(read-only\):/);
      expect(playerActionLabel(choice)).toBe(authored);
    }
    expect(root.publicState.flags).not.toEqual(
      expect.arrayContaining([
        "strategy_lure_committed",
        "strategy_drive_committed",
        "strategy_fortify_committed",
      ]),
    );

    const inspected = prepared.child.choose("ask_lure");
    expect(inspected.ok, inspected.rejection ?? "LURE comparison rejected").toBe(true);
    const comparison = prepared.child.view();
    expect(comparison.publicState.flags).not.toContain("strategy_lure_committed");
    const finalCommitment = comparison.choices.find((choice) => choice.id === "ask_commit_lure");
    expect(finalCommitment).toBeDefined();
    if (!finalCommitment) throw new Error("Expected LURE final commitment.");
    const authoredCommitment = finalCommitment.title.replace(/^ask:\s*/i, "");
    expect(authoredCommitment).toMatch(
      /^FINAL COMMITMENT — LURE:[^]*finite feed[^]*broken[^]*Irreversible\.$/i,
    );
    expect(playerActionLabel(finalCommitment)).toBe(authoredCommitment);

    const committed = prepared.child.choose(finalCommitment.id);
    expect(committed.ok, committed.rejection ?? "LURE commitment rejected").toBe(true);
    expect(prepared.child.view().publicState.flags).toContain("strategy_lure_committed");
  });

  it("keeps June's two HUNT boundaries and guarded support state truthful in the browser view", () => {
    const prepared = preparedWolf(
      2,
      "albany:prep_works_fortification",
      "albany:ally_june_cattle_first",
    );
    for (const actionId of ["use_sheltered_stockway_last_mile", "talk_houndsman"] as const) {
      const result = prepared.child.choose(actionId);
      expect(result.ok, `${actionId}: ${result.rejection ?? "rejected"}`).toBe(true);
    }

    const comparison = prepared.child.view();
    expect(comparison.dialogue?.text).toMatch(
      /HUNT commits on a north crossing or RELEASE JUNE if offered/i,
    );
    const hunt = comparison.choices.find((choice) => choice.id === "ask_hunt");
    expect(hunt?.title).toMatch(/FINAL COMMITMENT[^]*cross north or RELEASE JUNE if offered/i);

    const guarded = prepared.child.choose("ask_byre");
    expect(guarded.ok, guarded.rejection ?? "guarded support rejected").toBe(true);
    const supported = prepared.child.view();
    expect(supported.dialogue?.text).toMatch(
      /PREPARE SUPPORT[^]*gain the guarded\/patient HUNT tactic[^]*without committing a plan/i,
    );
    expect(supported.publicState.flags).toContain("heard_plan");
    expect(supported.publicState.flags).not.toEqual(
      expect.arrayContaining([
        "strategy_lure_committed",
        "strategy_drive_committed",
        "strategy_fortify_committed",
      ]),
    );

    expect(prepared.child.choose("ask_leave").ok).toBe(true);
    expect(prepared.child.choose("talk_june_pike").ok).toBe(true);
    const june = prepared.child.view();
    expect(june.choices.find((choice) => choice.id === "ask_release_june_for_hunt")?.title).toMatch(
      /FINAL COMMITMENT[^]*HUNT \/ RELEASE JUNE/i,
    );
    const released = prepared.child.choose("ask_release_june_for_hunt");
    expect(released.ok, released.rejection ?? "June release rejected").toBe(true);
    const committed = prepared.child.view();
    expect(committed.publicState.flags).toContain("june_hunt_released");
    expect(committed.publicState.flags).not.toContain("june_pike_present");
    expect(committed.choices.map((choice) => choice.id)).not.toEqual(
      expect.arrayContaining(["ask_lure", "ask_drive", "ask_fortify"]),
    );
  });

  it("surfaces the goal-relevant Station route ahead of incidental local movement", () => {
    const initial = new OverworldSession(world);
    const opening = initial.view();
    initial.scoutPoi(opening.pois[0]!.id);
    initial.talkToCharacter(opening.characters[0]!.id);
    initial.chooseJourneyStory("albany:ledger_advocate");
    const journey = initial.journey();
    const goalAreas = goalRelevantAreaIds(journey.goal.text, journey.goalGuidance, world.quests);
    expect(journey.goalGuidance).toContain("Wolf-Winter");
    expect(journey.goalGuidance).not.toContain("Albany Station Quarter");
    expect(goalAreas).toContain(wolf.area);

    const choose = () => undefined;
    const sections: WorldActionSection[] = [
      {
        id: "areas",
        title: "Local movement",
        actions: initial.view().areaExits.map((exit) => ({
          id: `area:${exit.destination.id}`,
          group: goalAreas.has(exit.destination.id) ? "Next for current goal" : "Local route",
          title: exit.destination.name,
          summary: exit.destination.summary,
          buttonLabel: goalAreas.has(exit.destination.id) ? "Continue toward goal" : "Move locally",
          tone: "ice",
          goalRelevant: goalAreas.has(exit.destination.id),
          onChoose: choose,
        })),
      },
    ];
    expect(focusedWorldActions(sections, ["areas"]).map((action) => action.id)).toEqual([
      `area:${wolf.area}`,
    ]);
  });

  it("keeps Station departure primary while presenting authoritative optional-support purpose", () => {
    const station = stationBeforeOptionalSupport().view();
    const board = station.stationDispatchBoard;
    if (!board) throw new Error("Expected the authored Station dispatch board.");
    const preparation = board.support.find((support) => support.slot === "preparation");
    const secondRider = board.support.find((support) => support.slot === "field_team");
    if (preparation?.action?.kind !== "inspect" || secondRider?.action?.kind !== "talk") {
      throw new Error("Expected actionable Station preparation and second-rider support.");
    }

    expect(
      stationSupportPresentation(board, {
        kind: "inspect",
        storyChoiceId: preparation.action.storyChoiceId,
      }),
    ).toEqual({ summary: preparation.purpose, terms: preparation.detailHint });
    expect(
      stationSupportPresentation(board, {
        kind: "talk",
        characterId: secondRider.action.characterId,
      }),
    ).toEqual({ summary: secondRider.purpose, terms: secondRider.detailHint });

    const choose = () => undefined;
    const sections: WorldActionSection[] = [
      {
        id: "dispatch",
        title: "The Wolf-Winter field briefing",
        actions: [
          ...station.questStarts.map(([, approachId]) => ({
            id: `quest:${approachId}`,
            group: "Dispatch",
            title: approachId ?? "Default departure",
            summary: "Projected departure",
            buttonLabel: "Depart",
            tone: "ember" as const,
            onChoose: choose,
          })),
          ...board.support.flatMap((support) =>
            support.action
              ? [
                  {
                    id: `support:${support.slot}`,
                    group: "Optional support",
                    title: support.label,
                    summary: support.purpose,
                    terms: support.detailHint,
                    buttonLabel: "Review support",
                    tone: "ice" as const,
                    optionalSupport: true,
                    onChoose: choose,
                  },
                ]
              : [],
          ),
        ],
      },
    ];

    expect(focusedWorldActions(sections, ["dispatch"]).map((action) => action.id)).toEqual(
      station.questStarts.map(([, approachId]) => `quest:${approachId}`),
    );
    expect(
      focusedOptionalSupportActions(sections, ["dispatch"]).map((action) => action.summary),
    ).toEqual(board.support.map((support) => support.purpose));
  });
});
