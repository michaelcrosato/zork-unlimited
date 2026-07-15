import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createServer } from "vite";
import { buildCampaignCharacterState } from "../../src/world/campaign_character_state.js";
import { buildCampaignCharacterView } from "../../src/world/campaign_character_view.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import {
  OVERWORLD_COMPACT_COMPLETED_ARC_LIMIT,
  OVERWORLD_COMPACT_LABEL_CHAR_LIMIT,
  OVERWORLD_COMPACT_LOCAL_REF_LIMIT,
  OVERWORLD_COMPACT_MOVEMENT_LIMIT,
  OVERWORLD_COMPACT_RENOWN_LIMIT,
  OVERWORLD_COMPACT_RISK_CHAR_LIMIT,
  OVERWORLD_COMPACT_ROAD_EVENT_SUMMARY_CHAR_LIMIT,
  OVERWORLD_COMPACT_ROUTE_STEP_LIMIT,
  OVERWORLD_COMPACT_SERVICE_SUMMARY_CHAR_LIMIT,
  OVERWORLD_COMPACT_TITLE_CHAR_LIMIT,
  OVERWORLD_COMPACT_VIEW_VERSION,
  cloneOverworldCompactView,
  compactRouteOption,
  compactOverworldView,
} from "../../src/world/compact_view.js";
import { buildOverworldSessionCompactView } from "../../src/world/session_compact_view.js";
import { questCompletionMinutes } from "../../src/world/session_quests.js";
import { cloneOverworldView } from "../../src/world/session_view_clone.js";
import type { OverworldQuestView } from "../../src/world/session_local_discovery.js";
import { OverworldSession } from "../../ui/src/overworld.js";

const world = loadOverworldManifest(process.cwd());

function populatedUiCharacter() {
  return buildCampaignCharacterView(
    buildCampaignCharacterState({
      background: "background:road_warden",
      skills: [{ skillId: "skill:fieldcraft", rank: 3 }],
      values: [{ valueId: "value:keep_promises", strength: 4 }],
      health: { current: 23, max: 30 },
      wounds: [{ woundId: "wound:wolf_bite", severity: 2, treatment: "stabilized" }],
      equipment: [
        {
          equipmentId: "equipment:warden_spear_1",
          itemId: "item:warden_spear",
          quantity: 1,
          condition: 76,
          equipped: true,
        },
      ],
      money: 18,
      abilities: ["ability:brace"],
      knowledge: ["knowledge:wolf_spoor"],
      promises: [
        {
          promiseId: "promise:return_wagon",
          recipientId: "npc:hayden_hale",
          status: "active",
        },
      ],
      companions: ["albany:june_pike"],
      crimes: [
        {
          crimeId: "crime:steading_trespass",
          jurisdictionId: "jurisdiction:albany_hinterland",
          severity: 1,
          status: "suspected",
        },
      ],
      relationships: [
        {
          npcId: "npc:old_cade",
          trust: 25,
          regard: -25,
          owesPlayer: 2,
          playerOwes: 1,
          memories: ["memory:kept_watch"],
        },
      ],
      factionStanding: [{ factionId: "faction:road_wardens", standing: 60 }],
    }),
  );
}

function roadPath(from: string, to: string): string[] {
  const queue: { town: string; roadIds: string[] }[] = [{ town: from, roadIds: [] }];
  const seen = new Set<string>([from]);
  for (let i = 0; i < queue.length; i += 1) {
    const cur = queue[i]!;
    if (cur.town === to) return cur.roadIds;
    for (const edge of world.edges.filter(
      (candidate) => candidate.from === cur.town || candidate.to === cur.town,
    )) {
      const next = edge.from === cur.town ? edge.to : edge.from;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ town: next, roadIds: [...cur.roadIds, edge.id] });
    }
  }
  throw new Error(`No road path from ${from} to ${to}.`);
}

function travelTo(session: OverworldSession, townId: string): void {
  for (const roadId of roadPath(session.view().current.id, townId)) {
    session.travel(roadId);
    if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  }
}

function settleOpeningRegistration(session: OverworldSession): void {
  if (session.journey().storyChoice?.kind === "registration") {
    session.chooseJourneyStory("albany:ledger_advocate");
  }
  if (session.journey().storyChoice?.kind === "lead_source") {
    session.chooseJourneyStory("albany:source_rowan_civic_docket");
  }
  if (session.journey().storyChoice?.kind === "preparation") {
    session.chooseJourneyStory("albany:prep_works_fortification");
  }
}

function startVisibleQuest(
  session: OverworldSession,
  quest: OverworldQuestView,
): ReturnType<OverworldSession["startQuest"]> {
  const approach = quest.launch?.options.find((option) => option.projection?.available === true);
  return approach ? session.startQuest(quest.id, approach.id) : session.startQuest(quest.id);
}

function resolveCurrentTownEvent(session: OverworldSession): void {
  const view = session.view();
  const event = view.events.find((candidate) => !view.resolvedEventIds.includes(candidate.id));
  if (!event) throw new Error(`No unresolved event in ${view.current.id}.`);
  session.scoutPoi(view.pois[0]!.id);
  session.talkToCharacter(view.characters[0]!.id);
  settleOpeningRegistration(session);
  session.investigateEvent(event.id);
  session.resolveEvent(event.id);
}

function reachAlbanyStoryChoice(session: OverworldSession): void {
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  session.talkToCharacter(opening.characters[0]!.id);
  settleOpeningRegistration(session);
  const quest = session.view().quests.find((candidate) => candidate.id === "wolf_winter");
  if (!quest) throw new Error("Expected the Albany Wolf-Winter lead.");
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === quest.area);
  if (!route) throw new Error("Expected a route to the Albany lead.");
  session.moveArea(route.id);
  startVisibleQuest(session, quest);
  session.completeQuest(quest.id, {
    endingId: "ending_held",
    endingTitle: "The Byre Held",
    death: false,
  });
  session.chooseJourney("continue");
}

describe("OverworldSession", () => {
  it("starts in Albany with roads, local discoveries, and no global quest list", () => {
    const session = new OverworldSession(world);
    const view = session.view();
    expect(session.journey()).toMatchObject({
      status: "active",
      goal: {
        text: "Find one local lead in Albany and see it through.",
        status: "active",
      },
      acceptedDecisions: 0,
      baselineDecisions: 40,
      nextCheckpoint: 40,
      goalGuidance: null,
      pendingChoice: null,
    });

    expect(view.current.id).toBe("albany_city");
    expect(view.exits.length).toBeGreaterThan(3);
    expect(view.exits.length).toBeLessThan(12);
    expect(view.quests).toEqual([]);
    expect(view.hiddenQuestCount).toBeGreaterThan(0);
    expect(view.hiddenQuestCount).toBeLessThan(world.quests.length);
    expect(view.characters.length).toBeGreaterThan(0);
    expect(view.events.length).toBeGreaterThan(0);
    expect(view.areas).toHaveLength(1);
    expect(view.areas[0]?.home).toBe(view.current.id);
    expect(view.currentArea?.id).toBe(view.areas[0]?.id);
    expect(view.areaExits).toEqual([]);
    expect(view.hiddenAreaCount).toBeGreaterThan(0);
    expect(view.discoveredAreaIds).toEqual(view.areas.map((area) => area.id));
    expect(view.visitedAreaIds).toEqual([]);
    expect(view.pois.every((poi) => poi.area === view.currentArea?.id)).toBe(true);
    expect(view.characters.every((character) => character.area === view.currentArea?.id)).toBe(
      true,
    );
    expect(view.events.every((event) => event.area === view.currentArea?.id)).toBe(true);
    expect(view.sites).toEqual([]);
    expect(view.hiddenSiteCount).toBeGreaterThan(0);
    expect(view.jobs).toEqual([]);
    expect(view.rememberedJobs).toEqual([]);
    expect(view.hiddenJobCount).toBeGreaterThan(0);
    expect(view.discoveredJobIds).toEqual([]);
    expect(view.completedJobIds).toEqual([]);
    expect(view.routeOptions.map((route) => route.destination.id)).toContain("colonie_town");
    expect(view.discovered.length).toBeLessThan(world.nodes.length);
    expect(view.supplies).toBe(6);
    expect(view.maxSupplies).toBe(8);
    expect(view.fatigue).toBe(0);
    expect(view.travelCondition).toBe("ready");
    expect(view.pendingRoadEncounter).toBeNull();
    expect(view.character).toMatchObject({
      background: null,
      health: { current: 30, max: 30 },
      money: 0,
      skills: [],
      equipment: [],
      companions: [],
      relationships: [],
      factionStanding: [],
    });
    expect(session.compactView().character).toEqual([
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
      [],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]);
    const colonieOption = view.routeOptions.find(
      (route) => route.destination.id === "colonie_town",
    );
    expect(colonieOption).toBeDefined();
    expect(colonieOption?.estimate.baseMinutes).toBe(colonieOption?.totalMinutes);
    expect(colonieOption?.estimate.delayMinutes).toBe(0);
    expect(colonieOption?.estimate.elapsedMinutes).toBe(colonieOption?.totalMinutes);
    expect(colonieOption?.estimate.suppliesNeeded).toBeGreaterThan(0);
    expect(colonieOption?.estimate.fatigueGained).toBeGreaterThan(0);

    const openingText = [
      view.current.description,
      view.currentArea?.summary,
      view.currentArea?.discovery,
      view.pois[0]?.summary,
      view.characters[0]?.summary,
      view.characters[0]?.agenda,
      view.events[0]?.summary,
    ].join(" ");
    expect(openingText).toContain("Three leads sit close enough to start with");
    expect(openingText).toContain("marked Notice Hall board");
    expect(openingText).toContain("Rowan Quill's records desk");
    expect(openingText).toContain("charter-backlog stair");
    expect(openingText).toContain("Scouting the board turns those marks into local work");
    expect(openingText).toContain("Ask Rowan what matters before the office closes");
    expect(openingText).toContain("inspect the stair and underrooms");
    expect(openingText).not.toMatch(
      /concrete local lead point|local problems|hidden count|tutorial|command/i,
    );
  });

  it("presents the authored aftermath as the UI's only legal choice without hidden solution data", () => {
    const session = new OverworldSession(world);
    reachAlbanyStoryChoice(session);
    const journey = session.journey();
    const snapshotHash = session.snapshotHash();

    expect(journey).toMatchObject({
      status: "active",
      goal: {
        version: 1,
        id: "albany_local_lead",
        status: "completed",
      },
      pendingChoice: null,
      storyChoice: {
        id: "albany_dawn_dispatch",
        options: [{ id: "send_wagon_to_cade" }, { id: "send_wardens_north" }],
      },
    });
    expect(Object.keys(journey.goal).sort()).toEqual([
      "completedAtDecision",
      "id",
      "status",
      "text",
      "version",
    ]);
    expect(Object.keys(journey.storyChoice!).sort()).toEqual(["id", "message", "options"]);
    for (const option of journey.storyChoice!.options) {
      expect(Object.keys(option).sort()).toEqual(["consequence", "id", "label"]);
    }
    expect(JSON.stringify({ goal: journey.goal, storyChoice: journey.storyChoice })).not.toMatch(
      /targetQuestId|endingId|ending_held|wolf_winter|content\/rpg|win_conditions|maneuver_/i,
    );

    expect(() => session.restAtTown()).toThrow(/presented story consequence/i);
    expect(session.snapshotHash()).toBe(snapshotHash);

    const beforeDecision = journey.acceptedDecisions;
    const selected = session.chooseJourneyStory("send_wardens_north");
    expect(selected).toMatchObject({
      storyChoiceId: "albany_dawn_dispatch",
      choiceId: "send_wardens_north",
      journeyDecision: { countsTowardJourney: true, reason: "situation_changed" },
      goal: {
        version: 2,
        id: "travel_north_with_albany_wardens",
        text: expect.stringContaining("Queensbury Market Streets"),
        status: "active",
      },
    });
    expect(session.journey()).toMatchObject({
      status: "active",
      acceptedDecisions: beforeDecision + 1,
      storyChoice: null,
      goal: { version: 2, id: "travel_north_with_albany_wardens" },
      goalGuidance:
        "Objective route: take the road toward Saratoga Springs city. Queensbury town is 2 roads and about 60 road minutes away.",
    });
    expect(JSON.stringify(session.journey().goalGuidance)).not.toMatch(
      /targetQuestId|endingId|wolf_winter|content\/rpg|win_conditions|maneuver_/i,
    );
  });

  it("routes visible story-choice ids through generic app plumbing", () => {
    const app = readFileSync("ui/src/App.tsx", "utf8");
    const screen = readFileSync("ui/src/JourneyStoryChoiceScreen.tsx", "utf8");
    const styles = readFileSync("ui/src/styles.css", "utf8");
    const handlerStart = app.indexOf("function chooseJourneyStory(choiceId: string)");
    const handlerEnd = app.indexOf("if (tutorialOpen)", handlerStart);
    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    const handler = app.slice(handlerStart, handlerEnd);

    expect(handler).toContain("worldSession.chooseJourneyStory(choiceId)");
    expect(handler).toContain('journey.storyChoice?.kind === "registration"');
    expect(handler).toContain('journey.storyChoice?.kind === "lead_source"');
    expect(handler).toContain('journey.storyChoice?.kind === "preparation"');
    expect(handler).toContain('journey.storyChoice?.kind === "ally"');
    expect(handler).toContain("Character registered: ${result.consequence}");
    expect(handler).toContain("Current goal: ${result.goal.text}");
    expect(handler).toContain("Lead source certified: ${result.consequence}");
    expect(handler).toContain("Preparation committed: ${result.consequence}");
    expect(handler).toContain("Field team committed: ${result.consequence}");
    expect(handler).toContain("Story consequence: ${result.consequence}");
    expect(handler).toContain("New goal: ${result.goal.text}");
    expect(handler).not.toMatch(/AlbanyDawnDispatchChoiceId|Albany dawn dispatch/i);
    expect(handler).not.toMatch(
      /targetQuestId|targetTownId|targetAreaId|questOutcomeIds|endingId|content\/rpg/i,
    );
    expect(screen).toContain("Journey consequence");
    expect(screen).toContain("Choose what follows");
    expect(screen).toContain("Character registration");
    expect(screen).toContain("Choose your lived background");
    expect(screen).toContain("Albany evidence source");
    expect(screen).toContain("Choose your Albany lead source");
    expect(screen).toContain("Albany preparation budget");
    expect(screen).toContain("Choose what Albany prepares");
    expect(screen).toContain("Field-team commitment");
    expect(screen).toContain("Choose who leaves Albany");
    expect(screen).toContain('" journey-choice-actions-registration"');
    expect(styles).toContain(
      ".journey-choice-actions:not(.journey-choice-actions-registration) button:first-child",
    );
    expect(screen).not.toMatch(/Albany Station Quarter|dawn dispatch|relief wagon/i);
  });

  it("keeps standard service actions and accessibly associates their one-time terms", async () => {
    const app = readFileSync("ui/src/App.tsx", "utf8");
    const actionsStart = app.indexOf('<div className="service-actions">');
    const actionsEnd = app.indexOf('<aside className="atlas-panel">', actionsStart);
    expect(actionsStart).toBeGreaterThanOrEqual(0);
    expect(actionsEnd).toBeGreaterThan(actionsStart);
    const actions = app.slice(actionsStart, actionsEnd);

    expect(actions).toContain("worldSession.resupplyAtTown()");
    expect(actions).toContain("worldSession.restAtTown()");
    expect(actions).toContain('action="resupply"');
    expect(actions).toContain('action="rest"');
    expect(app).toContain("aria-describedby={termsId}");
    expect(app).toContain("{offer.title}");
    expect(app).toContain("{offer.summary}");
    expect(app).toContain("{offer.minutes} min, one time");

    const uiRoot = resolve(process.cwd(), "ui");
    const server = await createServer({
      root: uiRoot,
      configFile: resolve(uiRoot, "vite.config.ts"),
      appType: "custom",
      logLevel: "silent",
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true },
    });
    try {
      const module = (await server.ssrLoadModule("/src/App.tsx")) as {
        ServiceAction: unknown;
      };
      const requireFromUi = createRequire(resolve(uiRoot, "package.json"));
      const react = requireFromUi("react") as {
        createElement: (type: unknown, props: Record<string, unknown>) => unknown;
      };
      const reactDomServer = requireFromUi("react-dom/server") as {
        renderToStaticMarkup: (element: unknown) => string;
      };
      const offer = {
        id: "albany:test_accessible_service",
        action: "resupply",
        title: "Draw the one-time relief issue",
        summary: "Fill the field pack from Albany's reserved relief stock.",
        minutes: 15,
        providerId: "albany_city__market__contact",
        providerName: "Jamie Tanner",
      } as const;
      const markup = reactDomServer.renderToStaticMarkup(
        react.createElement(module.ServiceAction, {
          action: "resupply",
          offer,
          onActivate: () => undefined,
        }),
      );

      expect(markup).toContain('aria-describedby="service-offer-resupply-terms"');
      expect(markup).toContain('id="service-offer-resupply-terms"');
      expect(markup).toContain("Draw the one-time relief issue");
      expect(markup).toContain("Available from Jamie Tanner.");
      expect(markup).toContain("15 min, one time");
    } finally {
      await server.close();
    }
  });

  it("renders launch approaches inline with truthful projections and no extra start button", async () => {
    const uiRoot = resolve(process.cwd(), "ui");
    const server = await createServer({
      root: uiRoot,
      configFile: resolve(uiRoot, "vite.config.ts"),
      appType: "custom",
      logLevel: "silent",
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true },
    });
    try {
      const module = (await server.ssrLoadModule("/src/App.tsx")) as {
        QuestNotice: unknown;
      };
      const requireFromUi = createRequire(resolve(uiRoot, "package.json"));
      const react = requireFromUi("react") as {
        createElement: (type: unknown, props: Record<string, unknown>) => unknown;
      };
      const reactDomServer = requireFromUi("react-dom/server") as {
        renderToStaticMarkup: (element: unknown) => string;
      };
      const quest: OverworldQuestView = {
        id: "test_launch_quest",
        title: "The Hill Dispatch",
        home: "albany_city",
        area: "albany_city__transport_hub",
        discovery: "Two winter routes leave the station quarter.",
        visibility: "local_notice_board",
        launch: {
          id: "test:hill_launch",
          prompt: "Which road do you commit to?",
          options: [
            {
              id: "test:ridge",
              title: "Take the Exposed Ridge",
              summary: "Spend less supply but arrive winded.",
              preview: "The ridge is fast and visible from the valley.",
              consequence: "You accept the wind and reach the steading first.",
              terms: { minutes: 30, supplies: 1, fatigue: 25 },
              projection: {
                available: true,
                minutesAfter: 510,
                suppliesAfter: 5,
                fatigueAfter: 25,
                travelConditionAfter: "tired",
              },
            },
            {
              id: "test:stockway",
              title: "Take the Sheltered Stockway",
              summary: "Spend more supply to stay fresh.",
              preview: "The stockway follows the quiet lee of the hill.",
              consequence: "You trade provisions and daylight for a quiet arrival.",
              terms: { minutes: 75, supplies: 2, fatigue: 10 },
              projection: {
                available: false,
                minutesAfter: 555,
                suppliesAfter: null,
                fatigueAfter: null,
                travelConditionAfter: null,
                blockedReason: "Requires 2 supplies; you have 1.",
              },
            },
          ],
        },
      };
      const markup = reactDomServer.renderToStaticMarkup(
        react.createElement(module.QuestNotice, {
          quest,
          areaName: "Station Quarter",
          isCurrentArea: true,
          onStart: () => undefined,
        }),
      );

      expect(markup.match(/<button/g)).toHaveLength(2);
      expect(markup.match(/ disabled=""/g)).toHaveLength(1);
      expect(markup).toContain("Which road do you commit to?");
      expect(markup).toContain("Take the Exposed Ridge");
      expect(markup).toContain("Spend less supply but arrive winded.");
      expect(markup).toContain("The ridge is fast and visible from the valley.");
      expect(markup).toContain("You accept the wind and reach the steading first.");
      expect(markup).toContain("Actual cost: 30 min, 1 supply, fatigue +25.");
      expect(markup).toContain(
        "Projected arrival: Day 1, 08:30; 5 supplies remaining; fatigue 25; condition tired.",
      );
      expect(markup).toContain("Projected time: Day 1, 09:15.");
      expect(markup).toContain("Requires 2 supplies; you have 1.");
      expect(markup).not.toMatch(/knowledge_|memory_|import:/i);

      const optionlessMarkup = reactDomServer.renderToStaticMarkup(
        react.createElement(module.QuestNotice, {
          quest: { ...quest, launch: undefined },
          areaName: "Station Quarter",
          isCurrentArea: true,
          onStart: () => undefined,
        }),
      );
      expect(optionlessMarkup.match(/<button/g)).toHaveLength(1);
      expect(optionlessMarkup).not.toContain("Which road do you commit to?");
    } finally {
      await server.close();
    }

    const app = readFileSync("ui/src/App.tsx", "utf8");
    expect(app).toContain("worldSession.prepareQuestStart(quest.id, approachId)");
    expect(app).toContain("plan.characterAfter");
    expect(app).toContain("worldSession.commitQuestStart(plan)");
    expect(app).toContain("onStart={(approachId) => startQuest(quest, approachId)}");
  });

  it("renders registration choices without claiming a goal was completed or replaced", async () => {
    const uiRoot = resolve(process.cwd(), "ui");
    const server = await createServer({
      root: uiRoot,
      configFile: resolve(uiRoot, "vite.config.ts"),
      appType: "custom",
      logLevel: "silent",
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true },
    });
    try {
      const module = (await server.ssrLoadModule("/src/JourneyStoryChoiceScreen.tsx")) as {
        JourneyStoryChoiceScreen: unknown;
      };
      const requireFromUi = createRequire(resolve(uiRoot, "package.json"));
      const react = requireFromUi("react") as {
        createElement: (type: unknown, props: Record<string, unknown>) => unknown;
      };
      const reactDomServer = requireFromUi("react-dom/server") as {
        renderToStaticMarkup: (element: unknown) => string;
      };
      const journey = new OverworldSession(world).journey();
      const registrationJourney = {
        ...journey,
        storyChoice: {
          id: "albany_registration",
          kind: "registration",
          message: "Which lived history goes on Rowan's relief docket?",
          options: ["stockhand", "ledger_runner", "road_volunteer", "clinic_aide"].map((id) => ({
            id,
            label: id,
            consequence: `Carry ${id} into the journey.`,
          })),
        },
      };
      const markup = reactDomServer.renderToStaticMarkup(
        react.createElement(module.JourneyStoryChoiceScreen, {
          journey: registrationJourney,
          onChoose: () => undefined,
        }),
      );

      expect(markup).toContain("Character registration");
      expect(markup).toContain("Choose your lived background");
      expect(markup).toContain("Current objective");
      expect(markup).toContain("registered history persists");
      expect(markup.match(/<button/g)).toHaveLength(4);
      expect(markup).not.toContain("Goal just completed");
      expect(markup).not.toContain("sets your next objective");
    } finally {
      await server.close();
    }
  });

  it("renders Albany lead-source choices without claiming a completed or replaced goal", async () => {
    const uiRoot = resolve(process.cwd(), "ui");
    const server = await createServer({
      root: uiRoot,
      configFile: resolve(uiRoot, "vite.config.ts"),
      appType: "custom",
      logLevel: "silent",
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true },
    });
    try {
      const module = (await server.ssrLoadModule("/src/JourneyStoryChoiceScreen.tsx")) as {
        JourneyStoryChoiceScreen: unknown;
      };
      const requireFromUi = createRequire(resolve(uiRoot, "package.json"));
      const react = requireFromUi("react") as {
        createElement: (type: unknown, props: Record<string, unknown>) => unknown;
      };
      const reactDomServer = requireFromUi("react-dom/server") as {
        renderToStaticMarkup: (element: unknown) => string;
      };
      const journey = new OverworldSession(world).journey();
      const leadSourceJourney = {
        ...journey,
        storyChoice: {
          id: "albany_wolf_winter_source",
          kind: "lead_source",
          message: "Which Albany source certifies the relief packet?",
          options: ["reese_manifest", "emery_survey", "decline_source"].map((id) => ({
            id,
            label: id,
            consequence: `Carry ${id} evidence into the journey.`,
          })),
        },
      };
      const markup = reactDomServer.renderToStaticMarkup(
        react.createElement(module.JourneyStoryChoiceScreen, {
          journey: leadSourceJourney,
          onChoose: () => undefined,
        }),
      );

      expect(markup).toContain("Albany evidence source");
      expect(markup).toContain("Choose your Albany lead source");
      expect(markup).toContain("Current objective");
      expect(markup).toContain("does not replace this objective");
      expect(markup.match(/<button/g)).toHaveLength(3);
      expect(markup).not.toContain("Goal just completed");
      expect(markup).not.toContain("sets your next objective");
    } finally {
      await server.close();
    }
  });

  it("renders ally commitments with an honest current-objective and field-terms frame", async () => {
    const uiRoot = resolve(process.cwd(), "ui");
    const server = await createServer({
      root: uiRoot,
      configFile: resolve(uiRoot, "vite.config.ts"),
      appType: "custom",
      logLevel: "silent",
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true },
    });
    try {
      const module = (await server.ssrLoadModule("/src/JourneyStoryChoiceScreen.tsx")) as {
        JourneyStoryChoiceScreen: unknown;
      };
      const requireFromUi = createRequire(resolve(uiRoot, "package.json"));
      const react = requireFromUi("react") as {
        createElement: (type: unknown, props: Record<string, unknown>) => unknown;
      };
      const reactDomServer = requireFromUi("react-dom/server") as {
        renderToStaticMarkup: (element: unknown) => string;
      };
      const journey = new OverworldSession(world).journey();
      const allyJourney = {
        ...journey,
        storyChoice: {
          id: "albany_wolf_ally",
          kind: "ally",
          message: "Capability: June can hold the cattle line. Condition: cattle come first.",
          options: ["join", "relay", "solo"].map((id, index) => ({
            id,
            label: id,
            consequence: `Preview ${id}. Actual cost: ${String(index * 5)} minutes.`,
          })),
        },
      };
      const markup = reactDomServer.renderToStaticMarkup(
        react.createElement(module.JourneyStoryChoiceScreen, {
          journey: allyJourney,
          onChoose: () => undefined,
        }),
      );

      expect(markup).toContain("Field-team commitment");
      expect(markup).toContain("Choose who leaves Albany");
      expect(markup).toContain("Current objective");
      expect(markup).toContain("Capability: June can hold the cattle line");
      expect(markup).toContain("Condition: cattle come first");
      expect(markup).toContain("actual cost");
      expect(markup).toContain("Actual cost: 10 minutes");
      expect(markup.match(/<button/g)).toHaveLength(3);
      expect(markup).not.toContain("Goal just completed");
      expect(markup).not.toContain("sets your next objective");
    } finally {
      await server.close();
    }
  });

  it("renders the fully populated canonical character as a semantic read-only record", async () => {
    const app = readFileSync("ui/src/App.tsx", "utf8");
    expect(app).toContain("<CampaignCharacterPanel character={worldView.character} />");

    const uiRoot = resolve(process.cwd(), "ui");
    const server = await createServer({
      root: uiRoot,
      configFile: resolve(uiRoot, "vite.config.ts"),
      appType: "custom",
      logLevel: "silent",
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true },
    });
    try {
      const module = (await server.ssrLoadModule("/src/CampaignCharacterPanel.tsx")) as {
        CampaignCharacterPanel: unknown;
      };
      const requireFromUi = createRequire(resolve(uiRoot, "package.json"));
      const react = requireFromUi("react") as {
        createElement: (type: unknown, props: Record<string, unknown>) => unknown;
      };
      const reactDomServer = requireFromUi("react-dom/server") as {
        renderToStaticMarkup: (element: unknown) => string;
      };
      const markup = reactDomServer.renderToStaticMarkup(
        react.createElement(module.CampaignCharacterPanel, {
          character: populatedUiCharacter(),
        }),
      );

      expect(markup).toMatch(
        /^<details class="character-panel"><summary class="character-heading"><h2 class="character-heading-layout">[\s\S]*<\/h2><\/summary>/,
      );
      expect(markup.match(/<h3>/g)).toHaveLength(11);
      for (const visibleText of [
        "Your Record",
        "Road Warden",
        "Fieldcraft",
        "Keep Promises",
        "Warden Spear",
        "Wolf Bite",
        "Brace",
        "Wolf Spoor",
        "Hayden Hale",
        "June Pike",
        "Albany Hinterland",
        "Old Cade",
        "Kept Watch",
        "Road Wardens",
        "Read only",
      ]) {
        expect(markup).toContain(visibleText);
      }
      expect(markup).not.toMatch(/<(?:button|input|select|textarea)\b/);
    } finally {
      await server.close();
    }
  });

  it("keeps Albany's first scout, talk, and explore choices on the same reveal loop", () => {
    const scoutSession = new OverworldSession(world);
    const scoutStart = scoutSession.view();
    const scouted = scoutSession.scoutPoi(scoutStart.pois[0]!.id);
    expect(scouted.discoveredAreas?.map((area) => area.id)).toEqual(["albany_city__market"]);
    expect(scouted.discoveredJobs?.map((job) => job.id)).toEqual(["albany_city__civic_core__job"]);
    expect(scouted.discoveredSites?.map((site) => site.id)).toEqual([
      "albany_city__civic_core__site",
    ]);
    expect(scouted.discoveredQuests).toEqual([]);

    const talkSession = new OverworldSession(world);
    const talkStart = talkSession.view();
    const talked = talkSession.talkToCharacter(talkStart.characters[0]!.id);
    expect(talked.discoveredAreas?.map((area) => area.id)).toEqual(["albany_city__market"]);
    expect(talked.discoveredJobs?.map((job) => job.id)).toEqual(["albany_city__civic_core__job"]);
    expect(talked.discoveredSites?.map((site) => site.id)).toEqual([
      "albany_city__civic_core__site",
    ]);
    expect(talked.discoveredQuests).toEqual([]);

    const exploreSession = new OverworldSession(world);
    const exploreStart = exploreSession.view();
    const explored = exploreSession.exploreArea(exploreStart.currentArea!.id);
    expect(explored.discoveredAreas?.map((area) => area.id)).toEqual(["albany_city__market"]);
    expect(explored.discoveredJobs?.map((job) => job.id)).toEqual(["albany_city__civic_core__job"]);
    expect(explored.discoveredSites?.map((site) => site.id)).toEqual([
      "albany_city__civic_core__site",
    ]);
    expect(explored.discoveredQuests).toEqual([]);
  });

  it("maps local areas progressively before exhausting a town", () => {
    const session = new OverworldSession(world);
    const start = session.view();
    const localAreas = world.areas
      .filter((area) => area.home === start.current.id)
      .sort((a, b) => a.travel_minutes - b.travel_minutes || a.name.localeCompare(b.name));
    const firstArea = start.areas[0]!;

    expect(localAreas.length).toBeGreaterThan(1);
    expect(start.areas.map((area) => area.id)).toEqual([localAreas[0]!.id]);

    const explored = session.exploreArea(firstArea.id);
    expect(explored.minutes).toBe(firstArea.travel_minutes);
    expect(explored.entry.kind).toBe("area");
    expect(explored.discoveredAreas?.map((area) => area.id)).toEqual([localAreas[1]!.id]);
    expect(explored.discoveredJobs).toHaveLength(1);
    expect(explored.discoveredSites).toHaveLength(1);
    expect(explored.discoveredQuests).toEqual([]);

    const after = session.view();
    expect(after.visitedAreaIds).toContain(firstArea.id);
    expect(after.areas.map((area) => area.id)).toEqual(
      localAreas.slice(0, 2).map((area) => area.id),
    );
    expect(after.currentArea?.id).toBe(firstArea.id);
    expect(after.areaExits.map((exit) => exit.destination.id)).toEqual([localAreas[1]!.id]);
    expect(after.hiddenAreaCount).toBe(localAreas.length - 2);
    expect(after.journal[0]?.title).toContain(firstArea.name);

    const repeated = session.exploreArea(firstArea.id);
    expect(repeated.alreadyKnown).toBe(true);
    expect(repeated.minutes).toBe(0);
    expect(repeated.discoveredAreas).toEqual([]);
    expect(repeated.discoveredJobs).toEqual([]);
    expect(repeated.discoveredSites).toEqual([]);
    expect(repeated.discoveredQuests).toEqual([]);
  });

  it("moves through discovered local area routes inside a town", () => {
    const session = new OverworldSession(world);
    const start = session.view();
    const firstArea = start.areas[0]!;
    session.exploreArea(firstArea.id);
    const mapped = session.view();
    const route = mapped.areaExits[0]!;
    const destination = route.destination;

    expect(() => session.exploreArea(destination.id)).toThrow(/Move to that local area/i);
    const moved = session.moveArea(route.id);
    expect(moved).toMatchObject({
      from: firstArea,
      to: destination,
      route: route.route,
      minutes: route.travel_minutes,
    });

    const after = session.view();
    expect(after.currentArea?.id).toBe(destination.id);
    expect(after.areaExits.map((exit) => exit.destination.id)).toContain(firstArea.id);
    expect(after.timeLabel).not.toBe(mapped.timeLabel);

    const explored = session.exploreArea(destination.id);
    expect(explored.entry.kind).toBe("area");
    expect(explored.entry.title).toContain(destination.name);
  });

  it("reveals and completes local jobs tied to mapped areas", () => {
    const session = new OverworldSession(world);
    const start = session.view();
    const hiddenJob = world.local_jobs.find((job) => job.home === start.current.id);
    expect(hiddenJob).toBeDefined();
    expect(() => session.workLocalJob(hiddenJob!.id)).toThrow(/Explore local areas/i);

    const explored = session.exploreArea(start.areas[0]!.id);
    expect(explored.discoveredJobs).toHaveLength(1);
    const job = session.view().jobs[0]!;
    expect(job.area).toBe(start.areas[0]!.id);
    expect(session.view().discoveredJobIds).toContain(job.id);

    const worked = session.workLocalJob(job.id);
    expect(worked.minutes).toBe(job.minutes);
    expect(worked.entry).toMatchObject({
      kind: "job",
      title: `Completed ${job.title}`,
    });

    const after = session.view();
    expect(after.completedJobIds).toContain(job.id);
    expect(after.jobs.map((candidate) => candidate.id)).not.toContain(job.id);
    expect(after.rememberedJobs.map((candidate) => candidate.id)).not.toContain(job.id);
    expect(after.regionRenown[start.current.region]).toBe(job.difficulty);
    expect(after.journal[0]?.kind).toBe("job");

    const compactAfter = session.compactView();
    expect(compactAfter.jobs?.map(([id]) => id) ?? []).not.toContain(job.id);
    expect(compactAfter.remembered_jobs?.map(([id]) => id) ?? []).not.toContain(job.id);
    expect(compactAfter.ids.completed_jobs ?? []).toContain(job.id);
    expect(compactAfter.journal?.[0]?.[0]).toBe("job");

    const repeated = session.workLocalJob(job.id);
    expect(repeated.alreadyKnown).toBe(true);
    expect(repeated.minutes).toBe(0);
    expect(repeated.discoveredJobs).toEqual([]);
  });

  it("remembers unfinished jobs discovered outside the current local area", () => {
    const session = new OverworldSession(world);
    const start = session.view();
    const currentAreaId = start.currentArea!.id;

    session.talkToCharacter(start.characters[0]!.id);
    settleOpeningRegistration(session);
    const scouted = session.scoutPoi(start.pois[0]!.id);
    const rememberedJob = (scouted.discoveredJobs ?? []).find((job) => job.area !== currentAreaId);
    expect(rememberedJob).toBeDefined();

    const afterDiscovery = session.view();
    expect(afterDiscovery.currentArea?.id).toBe(currentAreaId);
    expect(afterDiscovery.jobs.map((job) => job.id)).not.toContain(rememberedJob!.id);
    expect(afterDiscovery.rememberedJobs.map((job) => job.id)).toContain(rememberedJob!.id);
    expect(afterDiscovery.rememberedJobs[0]).toMatchObject({
      id: rememberedJob!.id,
      area: rememberedJob!.area,
    });
    expect(() => session.workLocalJob(rememberedJob!.id)).toThrow(/Move to that local area/i);

    const compactAfterDiscovery = session.compactView();
    expect(compactAfterDiscovery.jobs?.map(([id]) => id) ?? []).not.toContain(rememberedJob!.id);
    expect(compactAfterDiscovery.remembered_jobs).toContainEqual([
      rememberedJob!.id,
      rememberedJob!.title,
      rememberedJob!.area,
    ]);

    const routeToRememberedJob = afterDiscovery.areaExits.find(
      (exit) => exit.destination.id === rememberedJob!.area,
    );
    expect(routeToRememberedJob).toBeDefined();
    session.moveArea(routeToRememberedJob!.id);

    const inJobArea = session.view();
    expect(inJobArea.currentArea?.id).toBe(rememberedJob!.area);
    expect(inJobArea.jobs.map((job) => job.id)).toContain(rememberedJob!.id);
    expect(inJobArea.rememberedJobs.map((job) => job.id)).not.toContain(rememberedJob!.id);

    session.workLocalJob(rememberedJob!.id);
    const afterCompletion = session.view();
    expect(afterCompletion.completedJobIds).toContain(rememberedJob!.id);
    expect(afterCompletion.jobs.map((job) => job.id)).not.toContain(rememberedJob!.id);
    expect(afterCompletion.rememberedJobs.map((job) => job.id)).not.toContain(rememberedJob!.id);
  });

  it("advances location, clock, supplies, and fatigue by the selected road travel time", () => {
    const session = new OverworldSession(world);
    const before = session.view();
    const road = before.exits.find((exit) => exit.destination.id === "colonie_town");
    expect(road).toBeDefined();

    const entry = session.travel(road!.id);
    const after = session.view();
    expect(after.current.id).toBe(`road:${road!.id}`);
    expect(after.current.name).toBe(`On ${road!.route}: Albany city to Colonie town`);
    expect(after.current.description).toContain(
      "You are still between Albany city and Colonie town",
    );
    expect(after.currentArea).toBeNull();
    expect(after.exits).toEqual([]);
    expect(after.areaExits).toEqual([]);
    expect(after.areas).toEqual([]);
    expect(after.jobs).toEqual([]);
    expect(after.routeOptions).toEqual([]);
    expect(entry.baseMinutes).toBe(road!.travel_minutes);
    expect(entry.delayMinutes).toBe(0);
    expect(entry.minutes).toBe(road!.travel_minutes);
    expect(entry.roadEvent?.edge).toBe(road!.id);
    expect(entry.suppliesUsed).toBeGreaterThan(0);
    expect(entry.suppliesAfter).toBeLessThan(before.supplies);
    expect(entry.fatigueGained).toBeGreaterThan(0);
    expect(entry.fatigueAfter).toBeGreaterThan(before.fatigue);
    expect(after.log[0]).toMatchObject({
      edgeId: road!.id,
      fromId: "albany_city",
      toId: "colonie_town",
      from: "Albany city",
      to: "Colonie town",
      baseMinutes: road!.travel_minutes,
      delayMinutes: 0,
      minutes: entry.minutes,
      suppliesUsed: entry.suppliesUsed,
      suppliesAfter: entry.suppliesAfter,
      fatigueGained: entry.fatigueGained,
      fatigueAfter: entry.fatigueAfter,
    });
    expect(after.supplies).toBe(entry.suppliesAfter);
    expect(after.fatigue).toBe(entry.fatigueAfter);
    expect(after.pendingRoadEncounter).toMatchObject({
      edgeId: road!.id,
      from: "Albany city",
      to: "Colonie town",
    });
    expect(after.pendingRoadEncounter?.timing).toBe(
      `On the road from Albany city to Colonie town at ${after.pendingRoadEncounter?.arrivedAt}; resolve this route trouble before doing town business in Colonie town.`,
    );
    expect(after.pendingRoadEncounter?.options.map((option) => option.strategy)).toEqual([
      "cautious_scout",
      "assist_travelers",
      "press_on",
    ]);
    expect(session.compactView()).toEqual(compactOverworldView(after));
    expect(() => session.planRoute("albany_city")).toThrow(/pending road encounter/i);
    session.resolveRoadEncounter("press_on");
    expect(session.view().current.id).toBe("colonie_town");
    const backRoute = session.planRoute("albany_city");
    expect(backRoute.totalMinutes).toBe(road!.travel_minutes);
    expect(backRoute.steps.map((step) => step.to.id)).toEqual(["albany_city"]);
    expect(backRoute.estimate.baseMinutes).toBe(backRoute.totalMinutes);
    expect(backRoute.estimate.suppliesUsed).toBe(backRoute.estimate.suppliesNeeded);
    expect(backRoute.estimate.supplyDeficit).toBe(0);
    expect(after.timeLabel).not.toBe(before.timeLabel);
  });

  it("requires and resolves road encounter choices before the next road leg", () => {
    const session = new OverworldSession(world);
    const road = session.view().exits.find((exit) => exit.destination.id === "colonie_town");
    expect(road).toBeDefined();
    session.travel(road!.id);
    const arrived = session.view();
    const encounter = arrived.pendingRoadEncounter;
    expect(encounter?.event.edge).toBe(road!.id);
    expect(arrived.current.id).toBe(`road:${road!.id}`);
    expect(arrived.exits).toEqual([]);
    expect(() => session.travel(road!.id)).toThrow(/pending road encounter/i);

    const option = encounter!.options.find(
      (candidate) => candidate.strategy === "assist_travelers",
    );
    expect(option).toBeDefined();
    const resolved = session.resolveRoadEncounter("assist_travelers");
    expect(resolved).toMatchObject({
      strategy: "assist_travelers",
      minutes: option!.minutes,
      suppliesUsed: option!.suppliesCost,
      fatigueGained: option!.fatigueGained,
      renownGained: option!.renownGained,
    });
    const after = session.view();
    expect(after.pendingRoadEncounter).toBeNull();
    expect(after.journal[0]).toMatchObject({
      kind: "road",
      title: `${option!.label}: ${encounter!.event.title}`,
    });
    expect(after.journal[0]?.text).toContain("On the road from Albany city to Colonie town");
    expect(after.journal[0]?.text).toContain("Afterward you arrive in Colonie town.");
    expect(after.current.id).toBe("colonie_town");
    expect(after.currentArea?.home).toBe("colonie_town");
    expect(session.compactView()).toEqual(compactOverworldView(after));
    expect(after.regionRenown[arrived.current.region]).toBe(option!.renownGained);
    const returnRoad = after.exits.find((candidate) => candidate.destination.id === "albany_city");
    expect(returnRoad).toBeDefined();
    const returned = session.travel(returnRoad!.id);
    const returnedView = session.view();
    expect(returned.edgeId).toBe(road!.id);
    expect(returned.roadEvent).toBeNull();
    expect(returnedView.pendingRoadEncounter).toBeNull();
    expect(returnedView.log[0]?.roadEvent).toBeNull();
    expect(session.snapshot().travelLog[0]?.roadEventId).toBeNull();
  });

  it("round-trips stateful sessions through content-bound snapshots", () => {
    const session = new OverworldSession(world);
    const start = session.view();
    const road = start.exits.find((exit) => exit.destination.id === "colonie_town");
    expect(road).toBeDefined();

    session.scoutPoi(start.pois[0]!.id);
    session.exploreArea(start.areas[0]!.id);
    session.travel(road!.id);
    const before = session.view();
    expect(before.pendingRoadEncounter).toBeDefined();

    const snapshot = JSON.parse(JSON.stringify(session.snapshot())) as ReturnType<
      typeof session.snapshot
    >;
    expect(snapshot.pendingRoadEncounter).toEqual({ edgeId: road!.id });
    expect(snapshot.pendingRoadEncounter).not.toHaveProperty("event");
    expect(snapshot.pendingRoadEncounter).not.toHaveProperty("options");
    expect(JSON.stringify(snapshot.pendingRoadEncounter).length).toBeLessThan(
      JSON.stringify(before.pendingRoadEncounter).length / 4,
    );
    expect(snapshot.travelLog[0]).toMatchObject({
      edgeId: road!.id,
      fromId: start.current.id,
      toId: road!.destination.id,
      roadEventId: before.log[0]!.roadEvent?.id,
      minutes: before.log[0]!.minutes,
      arrivedAt: before.log[0]!.arrivedAt,
    });
    expect(snapshot.travelLog[0]).not.toHaveProperty("roadEvent");
    expect(snapshot.travelLog[0]).not.toHaveProperty("from");
    expect(snapshot.travelLog[0]).not.toHaveProperty("to");
    expect(snapshot.travelLog[0]).not.toHaveProperty("route");
    expect(snapshot.travelLog[0]).not.toHaveProperty("distanceMi");
    expect(snapshot.travelLog[0]).not.toHaveProperty("baseMinutes");
    expect(JSON.stringify(snapshot.travelLog[0]).length).toBeLessThan(
      JSON.stringify(before.log[0]).length / 2,
    );
    const restored = OverworldSession.restore(world, snapshot);
    expect(restored.view()).toEqual(before);
    expect(() => restored.travel(road!.id)).toThrow(/pending road encounter/i);

    restored.resolveRoadEncounter("press_on");
    expect(restored.view().pendingRoadEncounter).toBeNull();
    expect(restored.view().journal[0]?.kind).toBe("road");

    const staleWorldSnapshot = {
      ...session.snapshot(),
      worldHash: "0".repeat(64),
    };
    expect(() => OverworldSession.restore(world, staleWorldSnapshot)).toThrow(
      /different world manifest/i,
    );

    const corruptSnapshot = {
      ...session.snapshot(),
      currentId: "missing_town",
    };
    expect(() => OverworldSession.restore(world, corruptSnapshot)).toThrow(/unknown current town/i);

    const validSnapshot = session.snapshot();
    const duplicateAreaMapSnapshot = {
      ...validSnapshot,
      currentAreaByTown: [validSnapshot.currentAreaByTown[0]!, validSnapshot.currentAreaByTown[0]!],
    };
    expect(() => OverworldSession.restore(world, duplicateAreaMapSnapshot)).toThrow(
      /duplicate area-map town/i,
    );

    const duplicateRenownSnapshot = {
      ...validSnapshot,
      regionRenown: [
        [start.current.region, 1],
        [start.current.region, 2],
      ],
    };
    expect(() => OverworldSession.restore(world, duplicateRenownSnapshot)).toThrow(
      /duplicate renown region/i,
    );

    const undiscoveredCurrentAreaSnapshot = {
      ...validSnapshot,
      discoveredAreaIds: validSnapshot.discoveredAreaIds.filter(
        (id) => id !== validSnapshot.currentAreaId,
      ),
    };
    expect(() => OverworldSession.restore(world, undiscoveredCurrentAreaSnapshot)).toThrow(
      /current area is not discovered/i,
    );

    const tamperedPendingRoadSnapshot = JSON.parse(JSON.stringify(validSnapshot)) as ReturnType<
      typeof session.snapshot
    >;
    expect(tamperedPendingRoadSnapshot.pendingRoadEncounter).toBeDefined();
    tamperedPendingRoadSnapshot.pendingRoadEncounter!.edgeId = "missing_road";
    expect(() => OverworldSession.restore(world, tamperedPendingRoadSnapshot)).toThrow(
      /unknown pending road/i,
    );

    const tamperedTravelLogSnapshot = JSON.parse(JSON.stringify(validSnapshot)) as ReturnType<
      typeof session.snapshot
    >;
    tamperedTravelLogSnapshot.travelLog[0]!.edgeId = "missing_road";
    delete tamperedTravelLogSnapshot.travelLog[0]!.roadEventId;
    expect(() => OverworldSession.restore(world, tamperedTravelLogSnapshot)).toThrow(
      /unknown travel road/i,
    );
  });

  it("caps compact context id lists while keeping counts and truncation flags", () => {
    const session = new OverworldSession(world);
    for (let i = 0; i < 120 && session.view().discovered.length <= 24; i += 1) {
      let view = session.view();
      if (view.pendingRoadEncounter) session.resolveRoadEncounter("press_on");
      view = session.view();
      const next =
        view.exits.find(
          (exit) => !view.discovered.some((town) => town.id === exit.destination.id),
        ) ?? view.exits[i % view.exits.length];
      if (!next) break;
      session.travel(next.id);
    }
    if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");

    const view = session.view();
    expect(view.discovered.length).toBeGreaterThan(24);
    const compact = compactOverworldView(view);
    expect(session.compactView()).toEqual(compact);
    expect(compact.v).toBe(OVERWORLD_COMPACT_VIEW_VERSION);
    expect(compact.hidden).toEqual([
      view.hiddenAreaCount,
      view.hiddenJobCount,
      view.hiddenSiteCount,
      view.hiddenQuestCount,
    ]);
    expect(compact.progress).toEqual([view.visitedCount, view.totalTowns]);
    expect(compact.ids.discovered_towns).toHaveLength(16);
    expect(compact.id_counts).toHaveLength(11);
    expect(compact.id_counts[0]).toBe(view.discovered.length);
    expect(compact.ids_truncated).toContain("discovered_towns");
    expect(compact.id_counts[8]).toBe(view.startedQuestIds.length);
    expect(compact.id_counts[9]).toBe(view.completedQuestIds.length);
    expect(compact.id_counts[10]).toBe(view.resolvedEventIds.length);
    expect(compact.ids_truncated).not.toContain("resolved_events");
    if (view.resolvedEventIds.length === 0) {
      expect("resolved_events" in compact.ids).toBe(false);
    }
  });

  it("projects and detaches one-time service terms in compact context", () => {
    const view = new OverworldSession(world).view();
    const longSummary = "dispatch terms ".repeat(40);
    const sourceOffers = [
      {
        id: "albany:service:rest",
        action: "rest" as const,
        title: "Rest under Rowan's relief seal",
        summary: `Emery Sloane opens the shelter. ${longSummary}`,
        minutes: 180,
        providerId: "albany_city__greenway__contact",
        providerName: "Emery Sloane",
      },
      {
        id: "albany:service:resupply",
        action: "resupply" as const,
        title: "Draw the one-time relief issue",
        summary: "Fill the field pack from Albany's reserved relief stock.",
        minutes: 15,
      },
    ];
    const fullClone = cloneOverworldView({ ...view, serviceOffers: sourceOffers });
    const compact = compactOverworldView({ ...view, serviceOffers: sourceOffers });

    expect(compact.service_offers).toEqual([
      [
        sourceOffers[0]!.id,
        "rest",
        sourceOffers[0]!.title,
        expect.stringMatching(/\.\.\.\(\+\d+ chars\)$/),
        180,
      ],
      [sourceOffers[1]!.id, "resupply", sourceOffers[1]!.title, sourceOffers[1]!.summary, 15],
    ]);
    expect(compact.service_offers?.[0]?.[3]).toHaveLength(
      OVERWORLD_COMPACT_SERVICE_SUMMARY_CHAR_LIMIT,
    );

    sourceOffers[0]!.title = "mutated source";
    expect(Object.keys(fullClone.serviceOffers[0]!).sort()).toEqual([
      "action",
      "id",
      "minutes",
      "providerId",
      "providerName",
      "summary",
      "title",
    ]);
    expect(fullClone.serviceOffers[0]?.title).toBe("Rest under Rowan's relief seal");
    expect(fullClone.serviceOffers[0]?.providerName).toBe("Emery Sloane");
    expect(compact.service_offers?.[0]?.[2]).toBe("Rest under Rowan's relief seal");
    expect(compact.service_offers?.[0]?.[3]).toContain("Emery Sloane");

    fullClone.serviceOffers[0]!.summary = "mutated full clone";
    expect(sourceOffers[0]!.summary).toBe(`Emery Sloane opens the shelter. ${longSummary}`);

    const cloned = cloneOverworldCompactView(compact);
    if (!cloned.service_offers) throw new Error("expected cloned service offers");
    (cloned.service_offers[0] as unknown as string[])[2] = "mutated clone";
    expect(compact.service_offers?.[0]?.[2]).toBe("Rest under Rowan's relief seal");
  });

  it("caps compact context progress lists while marking truncated renown and completed arcs", () => {
    const session = new OverworldSession(world);
    const view = session.view();
    const denseCount =
      Math.max(OVERWORLD_COMPACT_RENOWN_LIMIT, OVERWORLD_COMPACT_COMPLETED_ARC_LIMIT) + 3;
    const denseRenown: Record<string, number> = Object.fromEntries(
      Array.from({ length: denseCount }, (_, index) => [
        `Dense Region ${String(index).padStart(2, "0")}`,
        index,
      ]),
    );
    const denseCompletedArcs = Array.from(
      { length: denseCount },
      (_, index) => `dense_arc_${String(index).padStart(2, "0")}`,
    );

    const compact = compactOverworldView({
      ...view,
      regionRenown: denseRenown,
      completedRegionalArcIds: denseCompletedArcs,
    });
    if (!compact.renown || !compact.completed_arcs) {
      throw new Error("expected compact progress lists");
    }
    expect(compact.renown).toHaveLength(OVERWORLD_COMPACT_RENOWN_LIMIT);
    expect(compact.completed_arcs).toHaveLength(OVERWORLD_COMPACT_COMPLETED_ARC_LIMIT);
    expect(compact.renown_truncated).toBe(true);
    expect(compact.completed_arcs_truncated).toBe(true);
    expect(compact.renown[0]).toEqual(["Dense Region 00", 0]);
    expect(compact.completed_arcs).toEqual(
      denseCompletedArcs.slice(0, OVERWORLD_COMPACT_COMPLETED_ARC_LIMIT),
    );

    const built = buildOverworldSessionCompactView({
      character: view.character,
      worldName: view.world,
      worldTownCount: view.totalTowns,
      current: view.current,
      currentArea: view.currentArea,
      minutes: 0,
      supplies: view.supplies,
      fatigue: view.fatigue,
      serviceOffers: view.serviceOffers,
      roads: view.exits,
      areaExits: view.areaExits,
      routeOptions: view.routeOptions,
      areas: view.areas,
      poi: view.pois,
      contacts: view.characters,
      events: view.events,
      jobs: view.jobs,
      rememberedJobs: view.rememberedJobs,
      sites: view.sites,
      quests: view.quests,
      hiddenAreaCount: view.hiddenAreaCount,
      hiddenJobCount: view.hiddenJobCount,
      hiddenSiteCount: view.hiddenSiteCount,
      hiddenQuestCount: view.hiddenQuestCount,
      journalEntries: view.journal,
      travelLog: view.log,
      visitedCount: view.visitedCount,
      regionRenown: new Map(Object.entries(denseRenown)),
      completedRegionalArcIds: new Set(denseCompletedArcs),
      pendingRoadEncounter: view.pendingRoadEncounter,
      ids: {
        discoveredIds: new Set(view.discovered.map((town) => town.id)),
        nodes: new Map(world.nodes.map((town) => [town.id, town])),
        discoveredAreaIds: new Set(view.discoveredAreaIds),
        visitedAreaIds: new Set(view.visitedAreaIds),
        discoveredJobIds: new Set(view.discoveredJobIds),
        completedJobIds: new Set(view.completedJobIds),
        discoveredSiteIds: new Set(view.discoveredSiteIds),
        exploredSiteIds: new Set(view.exploredSiteIds),
        discoveredQuestIds: new Set(view.discoveredQuestIds),
        startedQuestIds: new Set(view.startedQuestIds),
        completedQuestIds: new Set(view.completedQuestIds),
        resolvedEventIds: new Set(view.resolvedEventIds),
      },
    });
    expect(built.renown).toEqual(compact.renown);
    expect(built.completed_arcs).toEqual(compact.completed_arcs);
    expect(built.renown_truncated).toBe(true);
    expect(built.completed_arcs_truncated).toBe(true);

    const cloned = cloneOverworldCompactView(compact);
    if (!cloned.renown || !cloned.completed_arcs) {
      throw new Error("expected cloned compact progress lists");
    }
    expect(cloned.renown_truncated).toBe(true);
    expect(cloned.completed_arcs_truncated).toBe(true);
    cloned.renown.push(["mutated_by_test", 1]);
    cloned.completed_arcs.push("mutated_by_test");
    expect(compact.renown).toHaveLength(OVERWORLD_COMPACT_RENOWN_LIMIT);
    expect(compact.completed_arcs).toHaveLength(OVERWORLD_COMPACT_COMPLETED_ARC_LIMIT);
  });

  it("caps compact context movement lists while marking truncated roads and area routes", () => {
    const session = new OverworldSession(world);
    const view = session.view();
    expect(view.exits[0]).toBeDefined();
    expect(view.areas[0]).toBeDefined();

    const denseCount = OVERWORLD_COMPACT_MOVEMENT_LIMIT + 4;
    const denseRoads = Array.from({ length: denseCount }, (_, index) => ({
      ...view.exits[0]!,
      id: `dense_road_${index}`,
      destination: {
        ...view.exits[0]!.destination,
        id: `dense_town_${index}`,
      },
    }));
    const denseAreaRoutes = Array.from({ length: denseCount }, (_, index) => ({
      id: `dense_area_route_${index}`,
      home: view.current.id,
      from_area: view.currentArea?.id ?? view.areas[0]!.id,
      to_area: `dense_area_${index}`,
      route: `Dense lane ${index}`,
      travel_minutes: index + 1,
      destination: {
        ...view.areas[0]!,
        id: `dense_area_${index}`,
      },
    }));

    const compact = compactOverworldView({
      ...view,
      exits: denseRoads,
      areaExits: denseAreaRoutes,
    });
    expect(compact.roads).toHaveLength(OVERWORLD_COMPACT_MOVEMENT_LIMIT);
    expect(compact.area_routes).toHaveLength(OVERWORLD_COMPACT_MOVEMENT_LIMIT);
    expect(compact.roads_truncated).toBe(true);
    expect(compact.area_routes_truncated).toBe(true);

    const built = buildOverworldSessionCompactView({
      character: view.character,
      worldName: view.world,
      worldTownCount: view.totalTowns,
      current: view.current,
      currentArea: view.currentArea,
      minutes: 0,
      supplies: view.supplies,
      fatigue: view.fatigue,
      serviceOffers: view.serviceOffers,
      roads: denseRoads,
      areaExits: denseAreaRoutes,
      routeOptions: view.routeOptions,
      areas: view.areas,
      poi: view.pois,
      contacts: view.characters,
      events: view.events,
      jobs: view.jobs,
      rememberedJobs: view.rememberedJobs,
      sites: view.sites,
      quests: view.quests,
      hiddenAreaCount: view.hiddenAreaCount,
      hiddenJobCount: view.hiddenJobCount,
      hiddenSiteCount: view.hiddenSiteCount,
      hiddenQuestCount: view.hiddenQuestCount,
      journalEntries: view.journal,
      travelLog: view.log,
      visitedCount: view.visitedCount,
      regionRenown: new Map(Object.entries(view.regionRenown)),
      completedRegionalArcIds: new Set(view.completedRegionalArcIds),
      pendingRoadEncounter: view.pendingRoadEncounter,
      ids: {
        discoveredIds: new Set(view.discovered.map((town) => town.id)),
        nodes: new Map(world.nodes.map((town) => [town.id, town])),
        discoveredAreaIds: new Set(view.discoveredAreaIds),
        visitedAreaIds: new Set(view.visitedAreaIds),
        discoveredJobIds: new Set(view.discoveredJobIds),
        completedJobIds: new Set(view.completedJobIds),
        discoveredSiteIds: new Set(view.discoveredSiteIds),
        exploredSiteIds: new Set(view.exploredSiteIds),
        discoveredQuestIds: new Set(view.discoveredQuestIds),
        startedQuestIds: new Set(view.startedQuestIds),
        completedQuestIds: new Set(view.completedQuestIds),
        resolvedEventIds: new Set(view.resolvedEventIds),
      },
    });
    expect(built.roads).toHaveLength(OVERWORLD_COMPACT_MOVEMENT_LIMIT);
    expect(built.area_routes).toHaveLength(OVERWORLD_COMPACT_MOVEMENT_LIMIT);
    expect(built.roads_truncated).toBe(true);
    expect(built.area_routes_truncated).toBe(true);

    const cloned = cloneOverworldCompactView(compact);
    expect(cloned.roads_truncated).toBe(true);
    expect(cloned.area_routes_truncated).toBe(true);
    cloned.roads.push(["mutated_by_test", 1, 0, 0]);
    cloned.area_routes?.push(["mutated_by_test", "mutated", 1]);
    expect(compact.roads).toHaveLength(OVERWORLD_COMPACT_MOVEMENT_LIMIT);
    expect(compact.area_routes).toHaveLength(OVERWORLD_COMPACT_MOVEMENT_LIMIT);
  });

  it("caps compact context route path summaries while preserving explicit compact plans", () => {
    const session = new OverworldSession(world);
    const view = session.view();
    const plan = session.planRoute("colonie_town");
    expect(plan.steps[0]).toBeDefined();

    const denseStepCount = OVERWORLD_COMPACT_ROUTE_STEP_LIMIT + 4;
    const densePlan: typeof plan = {
      ...plan,
      steps: Array.from({ length: denseStepCount }, (_, index) => ({
        ...plan.steps[0]!,
        edge: {
          ...plan.steps[0]!.edge,
          id: `dense_road_${index}`,
        },
      })),
    };

    const explicit = compactRouteOption(densePlan);
    expect(explicit[4]).toHaveLength(denseStepCount);

    const compact = compactOverworldView({
      ...view,
      routeOptions: [densePlan],
    });
    expect(compact.route_options[0]?.[4]).toHaveLength(OVERWORLD_COMPACT_ROUTE_STEP_LIMIT);
    expect(compact.route_paths_truncated).toBe(true);

    const built = buildOverworldSessionCompactView({
      character: view.character,
      worldName: view.world,
      worldTownCount: view.totalTowns,
      current: view.current,
      currentArea: view.currentArea,
      minutes: 0,
      supplies: view.supplies,
      fatigue: view.fatigue,
      serviceOffers: view.serviceOffers,
      roads: view.exits,
      areaExits: view.areaExits,
      routeOptions: [densePlan],
      areas: view.areas,
      poi: view.pois,
      contacts: view.characters,
      events: view.events,
      jobs: view.jobs,
      rememberedJobs: view.rememberedJobs,
      sites: view.sites,
      quests: view.quests,
      hiddenAreaCount: view.hiddenAreaCount,
      hiddenJobCount: view.hiddenJobCount,
      hiddenSiteCount: view.hiddenSiteCount,
      hiddenQuestCount: view.hiddenQuestCount,
      journalEntries: view.journal,
      travelLog: view.log,
      visitedCount: view.visitedCount,
      regionRenown: new Map(Object.entries(view.regionRenown)),
      completedRegionalArcIds: new Set(view.completedRegionalArcIds),
      pendingRoadEncounter: view.pendingRoadEncounter,
      ids: {
        discoveredIds: new Set(view.discovered.map((town) => town.id)),
        nodes: new Map(world.nodes.map((town) => [town.id, town])),
        discoveredAreaIds: new Set(view.discoveredAreaIds),
        visitedAreaIds: new Set(view.visitedAreaIds),
        discoveredJobIds: new Set(view.discoveredJobIds),
        completedJobIds: new Set(view.completedJobIds),
        discoveredSiteIds: new Set(view.discoveredSiteIds),
        exploredSiteIds: new Set(view.exploredSiteIds),
        discoveredQuestIds: new Set(view.discoveredQuestIds),
        startedQuestIds: new Set(view.startedQuestIds),
        completedQuestIds: new Set(view.completedQuestIds),
        resolvedEventIds: new Set(view.resolvedEventIds),
      },
    });
    expect(built.route_options[0]?.[4]).toHaveLength(OVERWORLD_COMPACT_ROUTE_STEP_LIMIT);
    expect(built.route_paths_truncated).toBe(true);

    const cloned = cloneOverworldCompactView(compact);
    expect(cloned.route_paths_truncated).toBe(true);
    (cloned.route_options[0]?.[4] as string[] | undefined)?.push("mutated_by_test");
    expect(compact.route_options[0]?.[4]).toHaveLength(OVERWORLD_COMPACT_ROUTE_STEP_LIMIT);
  });

  it("caps compact context local refs while marking truncated buckets", () => {
    const session = new OverworldSession(world);
    const view = session.view();
    expect(view.areas[0]).toBeDefined();
    expect(view.pois[0]).toBeDefined();
    expect(view.characters[0]).toBeDefined();
    expect(view.events[0]).toBeDefined();

    const denseCount = OVERWORLD_COMPACT_LOCAL_REF_LIMIT + 3;
    const denseNames = Array.from({ length: denseCount }, (_, index) => ({
      id: `dense_name_${index}`,
      name: `Dense Name ${index}`,
    }));
    const denseTitles = Array.from({ length: denseCount }, (_, index) => ({
      id: `dense_title_${index}`,
      title: `Dense Title ${index}`,
    }));
    const denseRememberedJobs = denseTitles.map((value, index) => ({
      ...world.local_jobs[0]!,
      ...value,
      area: `dense_area_${index}`,
    }));
    const compact = compactOverworldView({
      ...view,
      areas: denseNames.map((value) => ({ ...view.areas[0]!, ...value })),
      pois: denseTitles.map((value) => ({ ...view.pois[0]!, ...value })),
      characters: denseNames.map((value) => ({ ...view.characters[0]!, ...value })),
      events: denseTitles.map((value) => ({ ...view.events[0]!, ...value })),
      jobs: denseTitles as typeof view.jobs,
      rememberedJobs: denseRememberedJobs,
      sites: denseTitles as typeof view.sites,
      quests: denseTitles as typeof view.quests,
    });

    expect(compact.areas).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.poi).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.contacts).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.events).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.jobs).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.remembered_jobs).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.sites).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.quests).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.local_refs_truncated).toEqual([
      "areas",
      "poi",
      "contacts",
      "events",
      "jobs",
      "remembered_jobs",
      "sites",
      "quests",
    ]);

    const built = buildOverworldSessionCompactView({
      character: view.character,
      worldName: view.world,
      worldTownCount: view.totalTowns,
      current: view.current,
      currentArea: view.currentArea,
      minutes: 0,
      supplies: view.supplies,
      fatigue: view.fatigue,
      serviceOffers: view.serviceOffers,
      roads: view.exits,
      areaExits: view.areaExits,
      routeOptions: view.routeOptions,
      areas: denseNames.map((value) => ({ ...view.areas[0]!, ...value })),
      poi: denseTitles.map((value) => ({ ...view.pois[0]!, ...value })),
      contacts: denseNames.map((value) => ({ ...view.characters[0]!, ...value })),
      events: denseTitles.map((value) => ({ ...view.events[0]!, ...value })),
      jobs: denseTitles as typeof view.jobs,
      rememberedJobs: denseRememberedJobs,
      sites: denseTitles as typeof view.sites,
      quests: denseTitles as typeof view.quests,
      hiddenAreaCount: view.hiddenAreaCount,
      hiddenJobCount: view.hiddenJobCount,
      hiddenSiteCount: view.hiddenSiteCount,
      hiddenQuestCount: view.hiddenQuestCount,
      journalEntries: view.journal,
      travelLog: view.log,
      visitedCount: view.visitedCount,
      regionRenown: new Map(Object.entries(view.regionRenown)),
      completedRegionalArcIds: new Set(view.completedRegionalArcIds),
      pendingRoadEncounter: view.pendingRoadEncounter,
      ids: {
        discoveredIds: new Set(view.discovered.map((town) => town.id)),
        nodes: new Map(world.nodes.map((town) => [town.id, town])),
        discoveredAreaIds: new Set(view.discoveredAreaIds),
        visitedAreaIds: new Set(view.visitedAreaIds),
        discoveredJobIds: new Set(view.discoveredJobIds),
        completedJobIds: new Set(view.completedJobIds),
        discoveredSiteIds: new Set(view.discoveredSiteIds),
        exploredSiteIds: new Set(view.exploredSiteIds),
        discoveredQuestIds: new Set(view.discoveredQuestIds),
        startedQuestIds: new Set(view.startedQuestIds),
        completedQuestIds: new Set(view.completedQuestIds),
        resolvedEventIds: new Set(view.resolvedEventIds),
      },
    });
    expect(built.local_refs_truncated).toEqual(compact.local_refs_truncated);
    expect(built.areas).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(built.jobs).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(built.remembered_jobs).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);

    const cloned = cloneOverworldCompactView(compact);
    expect(cloned.local_refs_truncated).toEqual(compact.local_refs_truncated);
    expect(cloned.remembered_jobs).toEqual(compact.remembered_jobs);
    cloned.remembered_jobs?.push(["mutated_job", "Mutated job", "mutated_area"]);
    expect(compact.remembered_jobs).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    cloned.local_refs_truncated?.push("areas");
    expect(compact.local_refs_truncated).toEqual([
      "areas",
      "poi",
      "contacts",
      "events",
      "jobs",
      "remembered_jobs",
      "sites",
      "quests",
    ]);
  });

  it("caps compact context labels, titles, road scenes, and risk text", () => {
    const session = new OverworldSession(world);
    const localView = session.view();
    const road = localView.exits.find((exit) => exit.destination.id === "colonie_town");
    expect(road).toBeDefined();
    session.travel(road!.id);

    const view = session.view();
    expect(view.pendingRoadEncounter).toBeDefined();
    expect(localView.currentArea).toBeDefined();
    expect(localView.areas[0]).toBeDefined();
    expect(localView.pois[0]).toBeDefined();
    expect(localView.characters[0]).toBeDefined();
    expect(localView.events[0]).toBeDefined();
    const longLabel = "label ".repeat(40);
    const longTitle = "title ".repeat(60);
    const longRisk = "risk ".repeat(70);
    const longSummary = "summary ".repeat(80);

    const pendingRoadEncounter = view.pendingRoadEncounter!;
    const compact = compactOverworldView({
      ...localView,
      world: longLabel,
      current: { ...localView.current, name: longLabel, region: longLabel },
      currentArea: localView.currentArea ? { ...localView.currentArea, name: longLabel } : null,
      areas: localView.areas.map((area, index) =>
        index === 0 ? { ...area, name: longLabel } : area,
      ),
      pois: localView.pois.map((poi, index) => (index === 0 ? { ...poi, title: longTitle } : poi)),
      characters: localView.characters.map((character, index) =>
        index === 0 ? { ...character, name: longLabel } : character,
      ),
      events: localView.events.map((event, index) =>
        index === 0 ? { ...event, title: longTitle } : event,
      ),
      journal: [
        {
          id: "synthetic_long_title",
          kind: "event",
          town: localView.current.id,
          title: longTitle,
          text: "Synthetic compact-title boundary row.",
          recordedAt: localView.timeLabel,
        },
        ...localView.journal,
      ],
      pendingRoadEncounter: {
        ...pendingRoadEncounter,
        from: longLabel,
        to: longLabel,
        route: longLabel,
        event: {
          ...pendingRoadEncounter.event,
          title: longTitle,
          summary: longSummary,
          risk: longRisk as typeof pendingRoadEncounter.event.risk,
        },
        options: pendingRoadEncounter.options.map((option) => ({
          ...option,
          label: longTitle,
        })),
      },
      regionRenown: { [longLabel]: 7 },
    });

    expect(compact.world).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.here[1]).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.here[2]).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.here[4]).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.areas[0]?.[1]).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.contacts[0]?.[1]).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.poi[0]?.[1]).toHaveLength(OVERWORLD_COMPACT_TITLE_CHAR_LIMIT);
    expect(compact.events[0]?.[1]).toHaveLength(OVERWORLD_COMPACT_TITLE_CHAR_LIMIT);
    expect(compact.journal?.[0]?.[1]).toHaveLength(OVERWORLD_COMPACT_TITLE_CHAR_LIMIT);
    expect(compact.pending_road?.route).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.pending_road?.event[1]).toHaveLength(OVERWORLD_COMPACT_RISK_CHAR_LIMIT);
    expect(compact.pending_road?.event[2]).toHaveLength(OVERWORLD_COMPACT_TITLE_CHAR_LIMIT);
    expect(compact.pending_road?.event[3]).toHaveLength(
      OVERWORLD_COMPACT_ROAD_EVENT_SUMMARY_CHAR_LIMIT,
    );
    expect(compact.pending_road?.options[0]?.[1]).toHaveLength(OVERWORLD_COMPACT_TITLE_CHAR_LIMIT);
    expect(compact.pending_road?.where[0]).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.pending_road?.where[1]).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.renown?.[0]?.[0]).toHaveLength(OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
    expect(compact.world).toMatch(/\.\.\.\(\+\d+ chars\)$/);
  });

  it("adds deterministic travel delay when fatigue or supply shortage catches up", () => {
    const session = new OverworldSession(world);
    travelTo(session, "buffalo_city");
    const worn = session.view();
    expect(worn.fatigue).toBeGreaterThanOrEqual(25);

    const nextRoad = worn.exits[0]!;
    const planned = session.planRoute(nextRoad.destination.id);
    expect(planned.estimate.delayMinutes).toBeGreaterThan(0);
    expect(planned.estimate.elapsedMinutes).toBe(
      planned.estimate.baseMinutes + planned.estimate.delayMinutes,
    );
    expect(planned.estimate.travelConditionAfter).not.toBe("ready");

    const entry = session.travel(nextRoad.id);
    expect(entry.baseMinutes).toBe(nextRoad.travel_minutes);
    expect(entry.delayMinutes).toBeGreaterThan(0);
    expect(entry.minutes).toBe(entry.baseMinutes + entry.delayMinutes);
    expect(entry.arrivedAt).toBeGreaterThan(worn.log[0]!.arrivedAt);
  });

  it("uses town services to resupply and rest after travel", () => {
    const session = new OverworldSession(world);
    const road = session.view().exits.find((exit) => exit.destination.id === "colonie_town");
    expect(road).toBeDefined();
    session.travel(road!.id);
    expect(() => session.resupplyAtTown()).toThrow(/pending road encounter/i);
    session.resolveRoadEncounter("press_on");

    const worn = session.view();
    expect(worn.supplies).toBeLessThan(worn.maxSupplies);
    expect(worn.fatigue).toBeGreaterThan(0);

    const resupplied = session.resupplyAtTown();
    expect(resupplied).toMatchObject({
      action: "resupply",
      changed: true,
      minutes: 45,
      suppliesBefore: worn.supplies,
      suppliesAfter: worn.maxSupplies,
      fatigueBefore: worn.fatigue,
      fatigueAfter: worn.fatigue,
    });
    expect(resupplied.entry?.kind).toBe("service");
    expect(session.view().supplies).toBe(worn.maxSupplies);
    expect(session.view().journal[0]?.title).toContain("Resupplied");

    const rested = session.restAtTown();
    expect(rested.action).toBe("rest");
    expect(rested.changed).toBe(true);
    expect(rested.minutes).toBeGreaterThan(0);
    expect(rested.fatigueBefore).toBe(worn.fatigue);
    expect(rested.fatigueAfter).toBe(0);
    expect(rested.entry?.kind).toBe("service");

    const ready = session.view();
    expect(ready.fatigue).toBe(0);
    expect(ready.supplies).toBe(ready.maxSupplies);
    expect(ready.travelCondition).toBe("ready");
    expect(ready.journal[0]?.title).toContain("Rested");

    expect(session.restAtTown()).toMatchObject({
      changed: false,
      message: "You are already rested.",
    });
    expect(session.resupplyAtTown()).toMatchObject({
      changed: false,
      message: "Your supplies are already full.",
    });
  });

  it("plans routes only through the discovered road graph", () => {
    const session = new OverworldSession(world);
    const start = session.view();
    const colonieRoute = session.planRoute("colonie_town");
    const colonieRoad = start.exits.find((exit) => exit.destination.id === "colonie_town");

    expect(colonieRoad).toBeDefined();
    expect(colonieRoute.destination.id).toBe("colonie_town");
    expect(colonieRoute.steps[0]?.edge.id).toBe(colonieRoad!.id);
    expect(colonieRoute.totalMinutes).toBe(colonieRoad!.travel_minutes);
    expect(colonieRoute.estimate).toMatchObject({
      baseMinutes: colonieRoute.totalMinutes,
      delayMinutes: 0,
      elapsedMinutes: colonieRoute.totalMinutes,
      supplyDeficit: 0,
      travelConditionAfter: "ready",
    });
    expect(colonieRoute.estimate.suppliesAfter).toBe(
      start.supplies - colonieRoute.estimate.suppliesUsed,
    );
    expect(colonieRoute.estimate.fatigueAfter).toBe(colonieRoute.estimate.fatigueGained);
    expect(() => session.planRoute("buffalo_city")).toThrow(/not discovered/i);
  });

  it("turns local contacts, POIs, and events into timed journal leads", () => {
    const session = new OverworldSession(world);
    const before = session.view();
    const poi = before.pois[0]!;
    const contact = before.characters[0]!;
    const event = before.events[0]!;
    const localQuests = world.quests
      .filter((quest) => quest.home === before.current.id)
      .sort((a, b) => a.title.localeCompare(b.title));
    expect(localQuests.length).toBeGreaterThan(0);

    const scouted = session.scoutPoi(poi.id);
    expect(scouted.minutes).toBe(20);
    expect(scouted.entry.kind).toBe("poi");
    expect(scouted.discoveredSites).toHaveLength(1);
    expect(scouted.discoveredQuests).toEqual([]);
    expect(session.view().journal[0]?.title).toContain(poi.title);
    expect(session.view().sites.map((site) => site.id)).toEqual(
      scouted.discoveredSites?.map((site) => site.id),
    );
    expect(session.view().quests).toEqual([]);
    expect(session.view().discoveredQuestIds).toEqual([]);
    expect(session.view().hiddenQuestCount).toBe(localQuests.length);

    const repeated = session.scoutPoi(poi.id);
    expect(repeated.alreadyKnown).toBe(true);
    expect(repeated.minutes).toBe(0);
    expect(repeated.discoveredSites).toEqual([]);
    expect(repeated.discoveredQuests).toEqual([]);

    const talked = session.talkToCharacter(contact.id);
    settleOpeningRegistration(session);
    expect(talked.minutes).toBe(15);
    expect(talked.entry.text).toContain(contact.agenda);
    expect(talked.discoveredQuests).toEqual([]);
    expect(talked.discoveredQuests?.every((quest) => !("pack" in quest))).toBe(true);
    expect(session.view().quests.map((quest) => quest.id)).toEqual(
      localQuests.slice(0, 1).map((quest) => quest.id),
    );
    expect(session.view().quests.every((quest) => !("pack" in quest))).toBe(true);

    const investigated = session.investigateEvent(event.id);
    expect(investigated.minutes).toBe(20 + event.intensity * 5);
    expect(investigated.entry.text).toContain(event.pressure);
    expect(investigated.discoveredQuests).toEqual([]);

    const after = session.view();
    expect(after.timeLabel).not.toBe(before.timeLabel);
    expect(after.journal).toHaveLength(9);
  });

  it("requires reaching a quest's local area before starting it", () => {
    const session = new OverworldSession(world);
    const initial = session.view();
    const firstLocalQuest = world.quests
      .filter((quest) => quest.home === initial.current.id)
      .sort((a, b) => a.title.localeCompare(b.title))[0]!;

    expect(firstLocalQuest.area).not.toBe(initial.currentArea?.id);
    expect(initial.discoveredQuestIds).not.toContain(firstLocalQuest.id);

    const scouted = session.scoutPoi(initial.pois[0]!.id);
    expect(scouted.discoveredQuests).toEqual([]);
    session.talkToCharacter(initial.characters[0]!.id);
    settleOpeningRegistration(session);
    const discoveredQuests = session.view().quests;
    expect(discoveredQuests).toHaveLength(1);
    const discoveredQuest = discoveredQuests[0]!;
    expect(discoveredQuest.id).toBe(firstLocalQuest.id);
    expect("pack" in discoveredQuest).toBe(false);
    expect(session.view().currentArea?.id).not.toBe(discoveredQuest.area);
    expect(() => session.startQuest(discoveredQuest.id)).toThrow(/Move to/i);
    expect(() =>
      session.completeQuest(discoveredQuest.id, {
        endingId: "ending_victory",
        endingTitle: "Victory",
        death: false,
      }),
    ).toThrow(/Start that local quest/i);

    const routeToQuestArea = session
      .view()
      .areaExits.find((exit) => exit.destination.id === discoveredQuest.area);
    expect(routeToQuestArea).toBeDefined();

    const moved = session.moveArea(routeToQuestArea!.id);
    expect(moved.to.id).toBe(discoveredQuest.area);
    const startedQuest = startVisibleQuest(session, discoveredQuest);
    expect(startedQuest).toMatchObject({
      id: discoveredQuest.id,
      area: discoveredQuest.area,
    });
    expect("pack" in startedQuest).toBe(false);
    expect(session.view().startedQuestIds).toEqual([discoveredQuest.id]);
    expect(session.view().journal[0]).toMatchObject({
      id: `quest:${discoveredQuest.id}`,
      kind: "quest",
    });
    expect(() => session.startQuest(discoveredQuest.id)).toThrow(/already been started/i);
    expect(() =>
      session.completeQuest(discoveredQuest.id, {
        endingId: "ending_fallen",
        endingTitle: "Fallen",
        death: true,
      }),
    ).toThrow(/death ending/i);

    const beforeCompletionMinutes = session.snapshot().minutes;
    const completedQuest = session.completeQuest(discoveredQuest.id, {
      endingId: "ending_held",
      endingTitle: "The Byre Held",
      death: false,
    });
    const questSource = world.quests.find((quest) => quest.id === discoveredQuest.id);
    if (!questSource) throw new Error("expected quest source");
    const expectedMinutes = questCompletionMinutes(
      questSource,
      new Map(world.areas.map((area) => [area.id, area])),
    );
    expect(completedQuest).toMatchObject({
      alreadyKnown: false,
      minutes: expectedMinutes,
      endingId: "ending_held",
      quest: { id: discoveredQuest.id },
    });
    expect(completedQuest.entry.recordedAt).toBe(session.view().timeLabel);
    expect(completedQuest.entry.text).toContain(`${expectedMinutes} minutes`);
    expect(completedQuest.entry).toMatchObject({
      id: `quest_done:${discoveredQuest.id}`,
      kind: "quest_done",
    });
    expect(session.snapshot().minutes).toBe(beforeCompletionMinutes + expectedMinutes);
    expect(session.view().completedQuestIds).toEqual([discoveredQuest.id]);
    expect(session.view().quests.map((quest) => quest.id)).not.toContain(discoveredQuest.id);
    expect(session.view().journal[0]).toMatchObject({
      id: `quest_done:${discoveredQuest.id}`,
      kind: "quest_done",
    });
    const compactAfter = session.compactView();
    expect(compactAfter.quests?.map(([id]) => id) ?? []).not.toContain(discoveredQuest.id);
    expect(compactAfter.ids.completed_quests ?? []).toContain(discoveredQuest.id);
    expect(compactAfter.journal?.[0]?.[0]).toBe("quest_done");

    const repeatedCompletion = session.completeQuest(discoveredQuest.id, {
      endingId: "ending_held",
      endingTitle: "The Byre Held",
      death: false,
    });
    expect(repeatedCompletion.alreadyKnown).toBe(true);
    expect(repeatedCompletion.minutes).toBe(0);
    expect(session.view().completedQuestIds).toEqual([discoveredQuest.id]);
  });

  it("treats one approach button as the one quest-start decision and rejects blocked starts", () => {
    const readyWolf = (manifest: OverworldManifest) => {
      const session = new OverworldSession(manifest);
      const opening = session.view();
      session.scoutPoi(opening.pois[0]!.id);
      session.talkToCharacter(opening.characters[0]!.id);
      settleOpeningRegistration(session);
      const quest = session.view().quests.find((candidate) => candidate.id === "wolf_winter");
      if (!quest) throw new Error("expected Wolf-Winter launch fixture");
      const route = session
        .view()
        .areaExits.find((candidate) => candidate.destination.id === quest.area);
      if (!route) throw new Error("expected route to Wolf-Winter launch area");
      session.moveArea(route.id);
      return {
        session,
        quest: session.view().quests.find((candidate) => candidate.id === quest.id)!,
      };
    };

    const missing = readyWolf(world);
    const beforeMissing = missing.session.snapshot();
    expect(() => missing.session.prepareQuestStart(missing.quest.id)).toThrow(
      /Choose an approach before starting/i,
    );
    expect(missing.session.snapshot()).toEqual(beforeMissing);

    const playable = readyWolf(world);
    const approach = playable.quest.launch?.options.find(
      (option) => option.projection?.available === true,
    );
    if (!approach) throw new Error("expected an available Wolf-Winter approach");
    const decisionsBefore = playable.session.journey().acceptedDecisions;
    const started = playable.session.startQuest(playable.quest.id, approach.id);
    expect(playable.session.journey().acceptedDecisions).toBe(decisionsBefore + 1);
    expect(playable.session.journey().decisionProof.last).toMatchObject({
      number: decisionsBefore + 1,
      actionId: `quest_start:${playable.quest.id}:${approach.id}`,
    });
    expect(started.launch?.selected?.optionId).toBe(approach.id);

    const blockedManifest = structuredClone(world);
    const blockedSource = blockedManifest.quests.find((quest) => quest.id === "wolf_winter");
    if (!blockedSource?.launch) throw new Error("expected authored Wolf-Winter launch");
    blockedSource.launch.options[0]!.terms.supplies = 8;
    const blocked = readyWolf(blockedManifest);
    const blockedApproach = blocked.quest.launch?.options[0];
    expect(blockedApproach?.projection).toMatchObject({
      available: false,
      blockedReason: "Requires 8 supplies; you have 6.",
    });
    const beforeBlocked = blocked.session.snapshot();
    expect(() => blocked.session.startQuest(blocked.quest.id, blockedApproach!.id)).toThrow(
      "Requires 8 supplies; you have 6.",
    );
    expect(blocked.session.snapshot()).toEqual(beforeBlocked);
  });

  it("reveals exploration leads from the current local area", () => {
    const session = new OverworldSession(world);
    travelTo(session, "new_york_city");
    const start = session.view();
    const sites = world.exploration_sites.filter(
      (candidate) => candidate.area === start.currentArea?.id,
    );
    expect(sites).toHaveLength(1);
    expect(start.sites).toEqual([]);
    expect(start.hiddenSiteCount).toBe(sites.length);

    const scouted = session.scoutPoi(start.pois[0]!.id);
    expect(scouted.discoveredSites).toHaveLength(1);
    expect(scouted.discoveredSites?.[0]?.area).toBe(start.currentArea?.id);
    expect(session.view().sites).toHaveLength(1);
    expect(session.view().hiddenSiteCount).toBe(sites.length - 1);

    const talked = session.talkToCharacter(start.characters[0]!.id);
    expect(talked.discoveredSites).toEqual([]);
    expect(session.view().sites).toHaveLength(1);
    expect(session.view().hiddenSiteCount).toBe(0);

    const investigated = session.investigateEvent(start.events[0]!.id);
    expect(investigated.discoveredSites).toEqual([]);
    expect(session.view().sites).toHaveLength(1);
    expect(session.view().hiddenSiteCount).toBe(0);

    const nextAreaRoute = session.view().areaExits[0];
    expect(nextAreaRoute).toBeDefined();
    session.moveArea(nextAreaRoute!.id);
    expect(session.view().sites).toEqual([]);
    expect(session.view().hiddenSiteCount).toBe(1);
    const movedScout = session.scoutPoi(session.view().pois[0]!.id);
    expect(movedScout.discoveredSites?.[0]?.area).toBe(nextAreaRoute!.destination.id);
  });

  it("reveals and explores regional sites through local scouting", () => {
    const session = new OverworldSession(world);
    const start = session.view();
    const poi = start.pois[0]!;
    const site = world.exploration_sites.find(
      (candidate) => candidate.area === start.currentArea?.id,
    );
    expect(site).toBeDefined();

    expect(() => session.exploreSite(site!.id)).toThrow(/Scout a local point of interest/i);
    const scouted = session.scoutPoi(poi.id);
    expect(scouted.discoveredSites?.map((candidate) => candidate.id)).toContain(site!.id);
    expect(session.view().discoveredSiteIds).toContain(site!.id);

    const explored = session.exploreSite(site!.id);
    expect(explored.minutes).toBe(45 + site!.danger * 15);
    expect(explored.entry).toMatchObject({
      kind: "site",
      title: `Explored ${site!.title}`,
    });

    const after = session.view();
    expect(after.exploredSiteIds).toContain(site!.id);
    expect(after.regionRenown[start.current.region]).toBe(site!.danger);
    expect(after.journal[0]?.kind).toBe("site");

    const repeated = session.exploreSite(site!.id);
    expect(repeated.alreadyKnown).toBe(true);
    expect(repeated.minutes).toBe(0);
    expect(repeated.discoveredAreas).toEqual([]);
    expect(repeated.discoveredJobs).toEqual([]);
    expect(repeated.discoveredSites).toEqual([]);
    expect(repeated.discoveredQuests).toEqual([]);
    expect(session.view().regionRenown[start.current.region]).toBe(site!.danger);
  });

  it("requires local prep before resolving an event and awards regional renown", () => {
    const session = new OverworldSession(world);
    const start = session.view();
    const poi = start.pois[0]!;
    const contact = start.characters[0]!;
    const event = start.events[0]!;

    expect(() => session.resolveEvent(event.id)).toThrow(/Before resolving/i);
    session.scoutPoi(poi.id);
    session.talkToCharacter(contact.id);
    settleOpeningRegistration(session);
    session.investigateEvent(event.id);

    const resolved = session.resolveEvent(event.id);
    expect(resolved.minutes).toBe(30 + event.intensity * 10);
    expect(resolved.entry.kind).toBe("resolution");
    expect(resolved.entry.text).toContain(start.current.region);

    const after = session.view();
    expect(after.resolvedEventIds).toContain(event.id);
    expect(after.events.map((candidate) => candidate.id)).not.toContain(event.id);
    expect(after.regionRenown[start.current.region]).toBe(event.intensity);
    expect(after.journal).toHaveLength(10);

    const compactAfter = session.compactView();
    expect(compactAfter.events.map(([id]) => id)).not.toContain(event.id);
    expect(compactAfter.ids.resolved_events ?? []).toContain(event.id);
    expect(compactAfter.journal?.[0]?.[0]).toBe("resolution");

    const repeated = session.resolveEvent(event.id);
    expect(repeated.alreadyKnown).toBe(true);
    expect(repeated.minutes).toBe(0);
    expect(repeated.discoveredAreas).toEqual([]);
    expect(repeated.discoveredJobs).toEqual([]);
    expect(repeated.discoveredSites).toEqual([]);
    expect(repeated.discoveredQuests).toEqual([]);
    expect(session.view().regionRenown[start.current.region]).toBe(event.intensity);
  });

  it("completes a regional arc after enough anchor-town event resolutions", () => {
    const session = new OverworldSession(world);
    const arc = world.regional_arcs.find((candidate) => candidate.region === "Capital / Mohawk");
    expect(arc).toBeDefined();
    expect(session.view().regionalArcs.find((candidate) => candidate.id === arc!.id)).toMatchObject(
      {
        completed: false,
        resolvedInRegion: 0,
      },
    );

    const nonAnchor = world.nodes.find(
      (candidate) =>
        candidate.region === arc!.region &&
        !arc!.anchor_towns.includes(candidate.id) &&
        world.local_events.some((event) => event.home === candidate.id),
    );
    expect(nonAnchor).toBeDefined();
    travelTo(session, nonAnchor!.id);
    resolveCurrentTownEvent(session);
    expect(session.view().regionalArcs.find((candidate) => candidate.id === arc!.id)).toMatchObject(
      {
        completed: false,
        resolvedInRegion: 0,
      },
    );

    for (const townId of arc!.anchor_towns.slice(0, arc!.required_resolutions)) {
      travelTo(session, townId);
      resolveCurrentTownEvent(session);
    }

    const after = session.view();
    const progress = after.regionalArcs.find((candidate) => candidate.id === arc!.id);
    expect(progress).toMatchObject({
      completed: true,
      resolvedInRegion: arc!.required_resolutions,
    });
    expect(after.completedRegionalArcIds).toContain(arc!.id);
    expect(after.journal[0]).toMatchObject({
      kind: "regional_arc",
      title: `Completed ${arc!.title}`,
    });
  });

  it("rejects town actions for non-local content", () => {
    const session = new OverworldSession(world);
    const start = session.view();
    const nonCurrentPoi = world.points_of_interest.find(
      (poi) => poi.home === world.start && poi.area !== start.currentArea?.id,
    );
    const nonCurrentContact = world.characters.find(
      (character) => character.home === world.start && character.area !== start.currentArea?.id,
    );
    const nonCurrentEvent = world.local_events.find(
      (event) => event.home === world.start && event.area !== start.currentArea?.id,
    );
    const nonLocalPoi = world.points_of_interest.find((poi) => poi.home !== world.start);
    const nonLocalContact = world.characters.find((character) => character.home !== world.start);
    const nonLocalEvent = world.local_events.find((event) => event.home !== world.start);
    expect(nonCurrentPoi).toBeDefined();
    expect(nonCurrentContact).toBeDefined();
    expect(nonCurrentEvent).toBeDefined();
    expect(nonLocalPoi).toBeDefined();
    expect(nonLocalContact).toBeDefined();
    expect(nonLocalEvent).toBeDefined();

    expect(() => session.scoutPoi(nonCurrentPoi!.id)).toThrow(/Move to that local area/i);
    expect(() => session.talkToCharacter(nonCurrentContact!.id)).toThrow(
      /Move to that local area/i,
    );
    expect(() => session.investigateEvent(nonCurrentEvent!.id)).toThrow(/Move to that local area/i);
    expect(() => session.scoutPoi(nonLocalPoi!.id)).toThrow(/not in this town/i);
    expect(() => session.talkToCharacter(nonLocalContact!.id)).toThrow(/not in this town/i);
    expect(() => session.investigateEvent(nonLocalEvent!.id)).toThrow(/not active/i);
  });

  it("rejects travel along roads that are not adjacent to the current town", () => {
    const session = new OverworldSession(world);
    const farRoad = world.edges.find(
      (edge) => edge.from === "buffalo_city" || edge.to === "buffalo_city",
    );
    expect(farRoad).toBeDefined();
    expect(() => session.travel(farRoad!.id)).toThrow(/not reachable/i);
  });
});
