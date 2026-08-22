import { createRequire } from "node:module";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";

import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";

const WORLD = loadOverworldManifest(process.cwd());
const requireFromRoot = createRequire(import.meta.url);

type DomElement = {
  click: () => void;
  open?: boolean;
  querySelector: (selector: string) => DomElement | null;
  querySelectorAll: (selector: string) => ArrayLike<DomElement>;
  scrollIntoView?: (options?: unknown) => void;
  scrollTop: number;
  textContent: string | null;
};

type DomDocument = {
  activeElement: unknown;
  createElement: (tagName: string) => unknown;
  getElementById: (id: string) => DomElement | null;
};

type DomWindow = {
  close: () => void;
  document: DomDocument;
  Event: unknown;
  HTMLElement: unknown;
  KeyboardEvent: unknown;
  MouseEvent: unknown;
  navigator: unknown;
};

const { JSDOM } = requireFromRoot("jsdom") as {
  JSDOM: new (markup: string, options?: Record<string, unknown>) => { window: DomWindow };
};

type StateSetter<T> = (value: T | ((previous: T) => T)) => void;

type ReactApi = {
  StrictMode: unknown;
  act: (callback: () => void | Promise<void>) => Promise<void>;
  createElement: (
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ) => unknown;
  useRef: <T>(initial: T) => { current: T };
  useState: <T>(initial: T) => [T, StateSetter<T>];
};

type RenderRoot = {
  render: (element: unknown) => void;
  unmount: () => void;
};

async function withRenderedUi(
  run: (context: {
    act: ReactApi["act"];
    container: DomElement;
    document: DomDocument;
    react: ReactApi;
    root: RenderRoot;
    server: ViteDevServer;
  }) => Promise<void>,
): Promise<void> {
  const uiRoot = resolve(process.cwd(), "ui");
  const server = await createServer({
    root: uiRoot,
    configFile: resolve(uiRoot, "vite.config.ts"),
    appType: "custom",
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true },
  });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: "http://localhost",
  });
  const globalNames = [
    "window",
    "document",
    "HTMLElement",
    "Event",
    "KeyboardEvent",
    "MouseEvent",
    "navigator",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const previousGlobals = new Map(
    globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  const replacementGlobals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    KeyboardEvent: dom.window.KeyboardEvent,
    MouseEvent: dom.window.MouseEvent,
    navigator: dom.window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [name, value] of Object.entries(replacementGlobals)) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }

  const requireFromUi = createRequire(resolve(uiRoot, "package.json"));
  const react = requireFromUi("react") as ReactApi;
  const reactDomClient = requireFromUi("react-dom/client") as {
    createRoot: (container: unknown) => RenderRoot;
  };
  const container = dom.window.document.getElementById("root");
  if (!container) throw new Error("Expected a JSDOM root container.");
  const root = reactDomClient.createRoot(container);

  try {
    await run({
      act: react.act,
      container,
      document: dom.window.document,
      react,
      root,
      server,
    });
  } finally {
    await react.act(async () => root.unmount());
    await server.close();
    dom.window.close();
    for (const [name, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}

function stationSession(): OverworldSession {
  const session = new OverworldSession(WORLD);
  let view = session.view();
  session.scoutPoi(view.pois[0]!.id);
  view = session.view();
  session.talkToCharacter(view.characters[0]!.id);
  session.chooseJourneyStory("albany:ledger_advocate");
  revealCurrentJourneyStoryOptions(session, WORLD.opening_relief_oath!.id);
  session.chooseJourneyStory("albany:oath_limited_aid_only");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  const stationRoute = session
    .view()
    .areaExits.find((route) => route.destination.id === WORLD.opening_preparation!.area);
  if (!stationRoute) throw new Error("Expected the direct Albany Station route.");
  session.moveArea(stationRoute.id);
  return session;
}

describe("Night Watch stage navigation", () => {
  it("keeps action-update position while navigating decisions, dock panels, and overworld travel", async () => {
    await withRenderedUi(async ({ act, container, document, react, root, server }) => {
      const module = (await server.ssrLoadModule("/src/OverworldPlayScreen.tsx")) as {
        OverworldPlayScreen: unknown;
      };
      const session = stationSession();
      const world = session.view();
      const board = world.stationDispatchBoard;
      if (!board) throw new Error("Expected the Station dispatch board.");
      const noOp = () => undefined;
      const sections = [
        {
          id: "dispatch",
          title: "The Wolf-Winter field briefing",
          actions: [
            ...world.questStarts.map(([, approachId]) => ({
              id: `quest:${approachId}`,
              group: "Dispatch",
              title: approachId,
              summary: "Projected departure",
              buttonLabel: "Depart",
              tone: "ember",
              onChoose: noOp,
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
                      tone: "ice",
                      optionalSupport: true,
                      onChoose: noOp,
                    },
                  ]
                : [],
            ),
          ],
        },
      ];
      const baseProps = {
        world,
        journey: session.journey(),
        log: [] as string[],
        sections,
        prioritySectionIds: ["dispatch"],
        saveStatus: "saved",
        error: null,
        onPanelChange: noOp,
        onNewJourney: noOp,
        onOpenTutorial: noOp,
      };
      const renderScreen = async (
        panel: string,
        latestConsequence: string,
        overrides: { sections?: typeof sections; world?: typeof world } = {},
      ): Promise<void> => {
        await act(async () => {
          root.render(
            react.createElement(
              react.StrictMode,
              null,
              react.createElement(module.OverworldPlayScreen, {
                ...baseProps,
                ...overrides,
                panel,
                latestConsequence,
              }),
            ),
          );
        });
      };

      await renderScreen("scene", "Arrived at the Station.");
      const stage = container.querySelector(".nw-stage");
      const primaryDeck = container.querySelector(".nw-decision-deck");
      const optionalSupport = container.querySelector(".nw-optional-support");
      if (!stage || !primaryDeck || !optionalSupport) {
        throw new Error("Expected the rendered Station action surfaces.");
      }
      expect(primaryDeck.querySelectorAll(".nw-action-card")).toHaveLength(2);
      expect(optionalSupport.open).toBe(false);
      expect(optionalSupport.querySelectorAll(".nw-action-card")).toHaveLength(3);
      for (const support of board.support) {
        expect(optionalSupport.textContent).toContain(support.purpose);
        expect(optionalSupport.textContent).toContain(support.detailHint);
      }

      const primaryScroll = vi.fn();
      const optionalScroll = vi.fn();
      primaryDeck.scrollIntoView = primaryScroll;
      optionalSupport.scrollIntoView = optionalScroll;
      const primaryShortcut = container.querySelector(".nw-decision-shortcut");
      if (!primaryShortcut) throw new Error("Expected the primary decision shortcut.");
      await act(async () => primaryShortcut.click());
      expect(primaryScroll).toHaveBeenCalledOnce();
      expect(primaryScroll).toHaveBeenCalledWith({ behavior: "smooth" });
      expect(optionalScroll).not.toHaveBeenCalled();

      const optionalOnlySections = sections.map((section) => ({
        ...section,
        actions: section.actions.filter(
          (action) => "optionalSupport" in action && action.optionalSupport === true,
        ),
      }));
      await renderScreen("scene", "Arrived at the Station.", {
        sections: optionalOnlySections,
      });
      const optionalOnlyDisclosure = container.querySelector(".nw-optional-support");
      const optionalShortcut = container.querySelector(".nw-decision-shortcut");
      if (!optionalOnlyDisclosure || !optionalShortcut) {
        throw new Error("Expected the optional-support shortcut fallback.");
      }
      expect(container.querySelector(".nw-decision-deck")).toBeNull();
      const optionalFallbackScroll = vi.fn();
      optionalOnlyDisclosure.scrollIntoView = optionalFallbackScroll;
      await act(async () => optionalShortcut.click());
      expect(optionalFallbackScroll).toHaveBeenCalledOnce();
      expect(optionalFallbackScroll).toHaveBeenCalledWith({ behavior: "smooth" });

      stage.scrollTop = 460;
      await renderScreen("scene", "A new consequence arrived.");
      expect(stage.scrollTop).toBe(460);

      await renderScreen("journal", "A new consequence arrived.");
      const journalHeading = container.querySelector(".nw-utility h2");
      expect(stage.scrollTop).toBe(0);
      expect(journalHeading?.textContent).toBe("journal");
      expect(document.activeElement).toBe(journalHeading);

      stage.scrollTop = 275;
      await renderScreen("scene", "A new consequence arrived.");
      const sceneHeading = container.querySelector(".nw-scene-copy h1");
      expect(stage.scrollTop).toBe(0);
      expect(document.activeElement).toBe(sceneHeading);

      const route = session.view().areaExits[0];
      if (!route) throw new Error("Expected an authored route away from the Station area.");
      const previousAreaId = session.view().currentArea?.id;
      session.moveArea(route.id);
      const traveledWorld = session.view();
      expect(traveledWorld.currentArea?.id).not.toBe(previousAreaId);
      stage.scrollTop = 390;
      await renderScreen("scene", "Moved to a new Albany area.", { world: traveledWorld });
      const traveledHeading = container.querySelector(".nw-scene-copy h1");
      expect(stage.scrollTop).toBe(0);
      expect(document.activeElement).toBe(traveledHeading);
    });
  });

  it("renders authored Wolf-Winter stages verbatim instead of prefixing them as generic questions", async () => {
    await withRenderedUi(async ({ act, container, react, root, server }) => {
      const questModule = (await server.ssrLoadModule("/src/QuestPlayScreen.tsx")) as {
        QuestPlayScreen: unknown;
      };
      const worldSession = new OverworldSession(WORLD);
      const noOp = () => undefined;
      const quest = {
        id: "wolf_winter",
        title: "The Wolf-Winter",
        discovery: "Reach Cade's steading and answer the winter pressure.",
      };
      const baseView = {
        mode: "rpg",
        location: "byre_yard",
        title: "The Byre-Yard",
        text: "Cade's four peer plan cards wait beside the day-book.",
        dialogue: { npc: "old Cade the houndsman", text: "Compare before you commit." },
        unavailableChoices: [],
        inventory: [],
        stats: { hp: 30, attack: 5, defense: 3 },
        score: 0,
        maxScore: 100,
        pressureTracks: [],
        visibleObjects: [],
        npcs: [],
        exits: [],
        blockedExits: [],
        enemies: [],
        publicState: { flags: [], vars: {}, journal: [] },
        stateHash: "wolf-stage-labels",
        ended: false,
        endingId: null,
        ending: null,
      };
      const props = {
        quest,
        world: worldSession.view(),
        journey: worldSession.journey(),
        latestConsequence: "Cade opens the plan ledger.",
        error: null,
        log: [] as string[],
        panel: "scene",
        saveStatus: "saved",
        onPanelChange: noOp,
        onChoose: noOp,
        canLeave: false,
        onLeave: noOp,
        initialStageScrollTop: 0,
        restoreDecisionFocus: false,
        onStageRestore: noOp,
        onStageScrollTopChange: noOp,
      };
      const renderChoice = async (id: string, title: string): Promise<void> => {
        await act(async () =>
          root.render(
            react.createElement(questModule.QuestPlayScreen, {
              ...props,
              view: {
                ...baseView,
                stateHash: `${baseView.stateHash}:${id}`,
                choices: [{ id, kind: "ASK", title, label: title }],
              },
            }),
          ),
        );
      };

      await renderChoice(
        "ask_hunt",
        "ask: COMPARE — HUNT (read-only): FINAL COMMITMENT is cross north or RELEASE JUNE if offered.",
      );
      expect(container.querySelector(".nw-action-card h2")?.textContent).toBe(
        "COMPARE — HUNT (read-only): FINAL COMMITMENT is cross north or RELEASE JUNE if offered.",
      );
      expect(container.textContent).not.toContain("Ask COMPARE");

      await renderChoice(
        "ask_byre",
        "ask: PREPARE SUPPORT — HUNT guarded/patient tactic; no plan commitment.",
      );
      expect(container.querySelector(".nw-action-card h2")?.textContent).toBe(
        "PREPARE SUPPORT — HUNT guarded/patient tactic; no plan commitment.",
      );
      expect(container.textContent).not.toContain("Ask PREPARE SUPPORT");

      await renderChoice(
        "ask_commit_lure",
        "ask: FINAL COMMITMENT — LURE: spend finite feed; irreversible.",
      );
      expect(container.querySelector(".nw-action-card h2")?.textContent).toBe(
        "FINAL COMMITMENT — LURE: spend finite feed; irreversible.",
      );
      expect(container.textContent).not.toContain("Ask FINAL COMMITMENT");
    });
  });

  it("restores quest scroll and decision focus after checkpoint Continue remounts the screen", async () => {
    await withRenderedUi(async ({ act, container, document, react, root, server }) => {
      const questModule = (await server.ssrLoadModule("/src/QuestPlayScreen.tsx")) as {
        QuestPlayScreen: unknown;
      };
      const choiceModule = (await server.ssrLoadModule("/src/JourneyChoiceScreen.tsx")) as {
        JourneyChoiceScreen: unknown;
      };
      const worldSession = new OverworldSession(WORLD);
      const baseJourney = worldSession.journey();
      const checkpointJourney = {
        ...baseJourney,
        pendingChoice: {
          atDecision: 40,
          reasons: ["checkpoint"],
          message: "The quest is paused at a safe checkpoint.",
          continuationPreview: null,
          options: [
            { id: "continue", label: "Continue", consequence: "Return to the active quest." },
            { id: "end", label: "End", consequence: "Close the journey here." },
          ],
        },
      };
      const baseQuestView = {
        mode: "rpg",
        location: "yard",
        title: "Cade's Yard",
        text: "Snow moves across the yard while the next route remains open.",
        dialogue: null,
        choices: [{ id: "go_north", kind: "MOVE", title: "go north" }],
        unavailableChoices: [],
        inventory: [],
        stats: { hp: 30, attack: 4, defense: 4 },
        pressureTracks: [],
        stateHash: "quest-state-0",
        ended: false,
      };
      const quest = {
        id: "wolf_winter",
        title: "The Wolf-Winter",
        discovery: "Reach Cade's steading and answer the winter pressure.",
      };
      let pauseQuest: (() => void) | undefined;
      let refreshQuest: (() => void) | undefined;
      let moveQuest: (() => void) | undefined;
      let restoreCount = 0;

      function CheckpointHarness(): unknown {
        const [paused, setPaused] = react.useState(false);
        const [revision, setRevision] = react.useState(0);
        const [moved, setMoved] = react.useState(false);
        const memory = react.useRef({ restoreDecisionFocus: false, scrollTop: 0 });
        pauseQuest = () => setPaused(true);
        refreshQuest = () => setRevision((current) => current + 1);
        moveQuest = () => setMoved(true);

        if (paused) {
          return react.createElement(choiceModule.JourneyChoiceScreen, {
            journey: checkpointJourney,
            onChoose: (choice: string) => {
              if (choice === "continue") memory.current.restoreDecisionFocus = true;
              setPaused(false);
            },
          });
        }

        return react.createElement(questModule.QuestPlayScreen, {
          view: {
            ...baseQuestView,
            ...(moved ? { location: "north_road", title: "North Road" } : {}),
            stateHash: `quest-state-${revision}`,
          },
          quest,
          world: worldSession.view(),
          journey: baseJourney,
          latestConsequence: `Quest consequence ${revision}`,
          error: null,
          log: [],
          panel: "scene",
          saveStatus: "saved",
          onPanelChange: () => undefined,
          onChoose: () => undefined,
          canLeave: false,
          onLeave: () => undefined,
          initialStageScrollTop: memory.current.scrollTop,
          restoreDecisionFocus: memory.current.restoreDecisionFocus,
          onStageRestore: () => {
            memory.current.restoreDecisionFocus = false;
            restoreCount += 1;
          },
          onStageScrollTopChange: (scrollTop: number) => {
            memory.current.scrollTop = scrollTop;
          },
        });
      }

      await act(async () =>
        root.render(
          react.createElement(react.StrictMode, null, react.createElement(CheckpointHarness)),
        ),
      );
      const firstStage = container.querySelector(".nw-stage");
      if (!firstStage || !pauseQuest) throw new Error("Expected the mounted quest stage.");
      firstStage.scrollTop = 720;

      await act(async () => pauseQuest!());
      const pauseHeading = container.querySelector("#journey-choice-title");
      expect(document.activeElement).toBe(pauseHeading);

      const continueButton = container.querySelector(".journey-choice-actions button");
      if (!continueButton) throw new Error("Expected the checkpoint Continue button.");
      await act(async () => continueButton.click());

      const resumedStage = container.querySelector(".nw-stage");
      const resumedDecisionDeck = container.querySelector(".nw-decision-deck");
      if (!resumedStage || !resumedDecisionDeck || !refreshQuest) {
        throw new Error("Expected the remounted quest decision surface.");
      }
      expect(resumedStage).not.toBe(firstStage);
      expect(resumedStage.scrollTop).toBe(720);
      expect(document.activeElement).toBe(resumedDecisionDeck);
      expect(restoreCount).toBe(1);

      resumedStage.scrollTop = 515;
      await act(async () => refreshQuest!());
      expect(container.querySelector(".nw-stage")).toBe(resumedStage);
      expect(resumedStage.scrollTop).toBe(515);

      resumedStage.scrollTop = 430;
      await act(async () => moveQuest!());
      const movedHeading = container.querySelector(".nw-scene-copy h1");
      expect(container.querySelector(".nw-stage")).toBe(resumedStage);
      expect(movedHeading?.textContent).toBe("North Road");
      expect(resumedStage.scrollTop).toBe(0);
      expect(document.activeElement).toBe(movedHeading);
    });
  });
});
