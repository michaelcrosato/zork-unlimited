import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { createServer } from "vite";

import { OverworldSession } from "../../src/world/session.js";
import {
  OPENING_RELIEF_OATH_CUSTOMIZE_DESCRIPTION,
  OPENING_RELIEF_OATH_FIELD_OUTCOME_COMPASS,
} from "../../src/world/opening_relief_oath_presentation.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const requireFromRoot = createRequire(import.meta.url);
const MATCHED_OATH_MESSAGE =
  "The Wolf-Winter: choose a ready-made promise/report pair or customize; every approach stays open.";
const CUSTOM_DUTY_MESSAGE =
  "The Wolf-Winter: choose one promise; your report comes next, and every approach stays open.";
const SOURCE_MESSAGE =
  "The Wolf-Winter: choose one report; Albany Station comes next, and every approach stays open.";

type DomWindow = {
  document: {
    createElement: (tagName: string) => unknown;
  };
  close: () => void;
  Event: unknown;
  HTMLElement: unknown;
  KeyboardEvent: new (type: string, init?: Record<string, unknown>) => unknown;
  MouseEvent: new (type: string, init?: Record<string, unknown>) => unknown;
  navigator: unknown;
};

const { JSDOM } = requireFromRoot("jsdom") as {
  JSDOM: new (markup: string, options?: Record<string, unknown>) => { window: DomWindow };
};

function registrationJourney(): ReturnType<OverworldSession["journey"]> {
  const session = new OverworldSession(WORLD);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  session.talkToCharacter(WORLD.opening_registration!.contact);
  if (session.journey().storyChoice?.kind !== "registration") {
    throw new Error("Expected the production Albany registration prompt.");
  }
  return session.journey();
}

function reliefOathJourney(
  profileId = WORLD.opening_registration!.profiles[0]!.id,
  reveal = false,
): ReturnType<OverworldSession["journey"]> {
  const session = new OverworldSession(WORLD);
  const registration = WORLD.opening_registration!;
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory(profileId);
  if (reveal) revealCurrentStoryOptions(session);
  return session.journey();
}

function ledgerReliefOathJourney(): ReturnType<OverworldSession["journey"]> {
  const session = new OverworldSession(WORLD);
  const registration = WORLD.opening_registration!;
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory("albany:ledger_advocate");
  return session.journey();
}

function revealCurrentStoryOptions(session: OverworldSession): void {
  const story = session.journey().storyChoice;
  const disclosure = story?.progressiveDisclosure;
  if (story && disclosure) session.revealJourneyStory(story.id, disclosure.reveal.id);
}

function leadSourceJourney(): ReturnType<OverworldSession["journey"]> {
  const session = new OverworldSession(WORLD);
  const registration = WORLD.opening_registration!;
  const oath = WORLD.opening_relief_oath!;
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory(registration.profiles[0]!.id);
  revealCurrentStoryOptions(session);
  session.chooseJourneyStory(oath.options[0]!.id);
  return session.journey();
}

function preparationJourney(): ReturnType<OverworldSession["journey"]> {
  const session = new OverworldSession(WORLD);
  const registration = WORLD.opening_registration;
  const oath = WORLD.opening_relief_oath;
  const source = WORLD.opening_lead_source;
  const preparation = WORLD.opening_preparation;
  if (!registration || !oath || !source || !preparation) {
    throw new Error("Albany must retain its opening dispatch.");
  }
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory(registration.profiles[0]!.id);
  revealCurrentStoryOptions(session);
  session.chooseJourneyStory(oath.options[0]!.id);
  session.chooseJourneyStory(source.options[0]!.id);
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === preparation.area);
  if (!route) throw new Error("Expected a route to Albany's Station preparation board.");
  session.moveArea(route.id);
  const storyChoice = session.inspectJourneyStory(preparation.id);
  return Object.freeze({ ...session.journey(), storyChoice });
}

function reliefAllocationJourney(): ReturnType<OverworldSession["journey"]> {
  const session = new OverworldSession(WORLD);
  const registration = WORLD.opening_registration;
  const oath = WORLD.opening_relief_oath;
  const source = WORLD.opening_lead_source;
  const preparation = WORLD.opening_preparation;
  const allocation = WORLD.opening_relief_allocation;
  if (!registration || !oath || !source || !preparation || !allocation) {
    throw new Error("Albany must retain its opening dispatch and Relief Allocation.");
  }
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory(registration.profiles[0]!.id);
  revealCurrentStoryOptions(session);
  session.chooseJourneyStory(oath.options[0]!.id);
  session.chooseJourneyStory(source.options[0]!.id);
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === preparation.area);
  if (!route) throw new Error("Expected a route to Albany's Station preparation board.");
  session.moveArea(route.id);
  session.chooseJourneyStory(preparation.profiles[0]!.id);
  const storyChoice = session.inspectJourneyStory(allocation.id);
  return Object.freeze({ ...session.journey(), storyChoice });
}

function allyJourney(): ReturnType<OverworldSession["journey"]> {
  const session = new OverworldSession(WORLD);
  const registration = WORLD.opening_registration!;
  const oath = WORLD.opening_relief_oath!;
  const source = WORLD.opening_lead_source!;
  const preparation = WORLD.opening_preparation!;
  const ally = WORLD.opening_ally!;
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory(registration.profiles[0]!.id);
  revealCurrentStoryOptions(session);
  session.chooseJourneyStory(oath.options[0]!.id);
  session.chooseJourneyStory(source.options[0]!.id);
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === preparation.area);
  if (!route) throw new Error("Expected a route to Albany's Station ally.");
  session.moveArea(route.id);
  session.chooseJourneyStory(preparation.profiles[0]!.id, preparation.id);
  session.talkToCharacter(ally.contact);
  return session.journey();
}

describe("JourneyStoryChoiceScreen summary-first cards", () => {
  it("keeps native disclosures separate from choice buttons and routes only choices to onChoose", async () => {
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
    let root: { render: (element: unknown) => void; unmount: () => void } | undefined;
    let act: ((callback: () => void | Promise<void>) => Promise<void>) | undefined;

    try {
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
      const module = (await server.ssrLoadModule("/src/JourneyStoryChoiceScreen.tsx")) as {
        JourneyStoryChoiceScreen: unknown;
      };
      const requireFromUi = createRequire(resolve(uiRoot, "package.json"));
      const react = requireFromUi("react") as {
        act: (callback: () => void | Promise<void>) => Promise<void>;
        createElement: (type: unknown, props: Record<string, unknown>) => unknown;
      };
      const reactDomClient = requireFromUi("react-dom/client") as {
        createRoot: (container: unknown) => {
          render: (element: unknown) => void;
          unmount: () => void;
        };
      };
      act = react.act;
      const container = (
        dom.window as DomWindow & {
          document: {
            getElementById: (id: string) => unknown;
          };
        }
      ).document.getElementById("root");
      if (!container) throw new Error("Expected a JSDOM root container.");

      const journey = registrationJourney();
      const registration = journey.storyChoice;
      if (!registration) throw new Error("Expected an Albany registration story choice.");
      const selected: string[] = [];
      root = reactDomClient.createRoot(container);
      await act(async () => {
        root!.render(
          react.createElement(module.JourneyStoryChoiceScreen, {
            journey,
            onChoose: (choiceId: string) => selected.push(choiceId),
          }),
        );
      });

      const rootElement = container as {
        querySelector: (selector: string) => unknown;
        querySelectorAll: (selector: string) => ArrayLike<unknown>;
        textContent: string | null;
      };
      const objectiveGuidance = (): string | null =>
        (
          rootElement.querySelector(".journey-choice-goal small") as {
            textContent: string | null;
          } | null
        )?.textContent ?? null;
      const card = rootElement.querySelector(".journey-choice-card") as {
        querySelector: (selector: string) => unknown;
      } | null;
      if (!card) throw new Error("Expected a rendered summary-first choice card.");
      expect(rootElement.textContent).toContain("choose one permanent background");
      expect(rootElement.textContent).toContain("ready-made promise/report pair or customize it");
      expect(rootElement.textContent).not.toContain(
        "A ready-made background also sets your Wolf-Winter promise and report",
      );
      expect(objectiveGuidance()).toBe(
        "Your background persists into the journey; choose the experience and return promise you will carry.",
      );
      expect(reliefOathJourney().storyChoice?.kind).toBe("relief_oath");
      expect(
        readFileSync(resolve(process.cwd(), "ui/src/JourneyStoryChoiceScreen.tsx"), "utf8"),
      ).toContain(
        "Choose a background. Next, choose a ready-made promise/report pair or customize it.",
      );
      const choiceButton = card.querySelector("button") as {
        contains: (node: unknown) => boolean;
        click: () => void;
      } | null;
      const details = card.querySelector("details") as {
        open: boolean;
        parentElement: unknown;
        querySelector: (selector: string) => unknown;
      } | null;
      const disclosure = details?.querySelector("summary") as {
        tagName: string;
        focus: () => void;
        click: () => void;
        dispatchEvent: (event: unknown) => boolean;
      } | null;
      if (!choiceButton || !details || !disclosure) {
        throw new Error("Expected a choice button beside a native details disclosure.");
      }
      const choiceButtonText = (choiceButton as { textContent?: string | null }).textContent;
      const registrationSource = WORLD.opening_registration!;
      const registrationDetailsText = (details as { textContent?: string | null }).textContent;
      const registrationOption = registration.options[0]!;
      expect(choiceButtonText).toContain("Background:");
      expect(choiceButtonText).toContain("Permanent background —");
      expect(choiceButtonText).toContain("Starts with:");
      expect(choiceButtonText).toContain("Cost:");
      expect(choiceButtonText).toContain("Return obligation:");
      expect(choiceButtonText).not.toContain("Starter package / field edge:");
      expect(choiceButtonText).not.toContain("Wolf-Winter fit:");
      expect(choiceButtonText).not.toMatch(/\b(?:DEF|import|fieldTrigger)\b/i);
      expect(choiceButtonText).toContain(registrationOption.summary!.commitment);
      expect(choiceButtonText).toContain(registrationOption.summary!.immediateCost);
      expect(choiceButtonText).toContain(registrationOption.summary!.tradeoff);
      expect(choiceButtonText).not.toContain("Trigger category:");
      expect(choiceButtonText).not.toContain(registrationSource.profiles[0]!.trigger_category);
      expect(choiceButtonText).not.toContain(registrationSource.profiles[0]!.preview);
      expect(registrationDetailsText).toContain(registrationOption.consequence);
      expect(registrationDetailsText).toContain(registrationSource.profiles[0]!.preview);
      expect(registrationDetailsText).toContain(registrationSource.profiles[0]!.consequence);

      expect(details.parentElement).toBe(card);
      expect(choiceButton.contains(details)).toBe(false);
      expect(disclosure.tagName).toBe("SUMMARY");
      expect(details.open).toBe(false);

      await act(async () => {
        disclosure.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      });
      expect(details.open).toBe(true);
      expect(selected).toEqual([]);

      await act(async () => {
        disclosure.focus();
        disclosure.dispatchEvent(
          new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
        disclosure.dispatchEvent(
          new dom.window.KeyboardEvent("keyup", { key: "Enter", bubbles: true }),
        );
        // JSDOM does not synthesize a click for native summary keyboard activation;
        // invoke that browser-supplied click after the real Enter event sequence.
        disclosure.click();
      });
      expect(details.open).toBe(false);
      expect(selected).toEqual([]);

      await act(async () => {
        choiceButton.click();
      });
      expect(selected).toEqual([registration.options[0]!.id]);

      const stationJourney = preparationJourney();
      const stationPreparation = WORLD.opening_preparation!;
      await act(async () => {
        root!.render(
          react.createElement(module.JourneyStoryChoiceScreen, {
            journey: stationJourney,
            onChoose: (choiceId: string) => selected.push(choiceId),
          }),
        );
      });
      const stationCard = rootElement.querySelector(".journey-choice-card") as {
        textContent: string | null;
        querySelector: (selector: string) => { textContent: string | null } | null;
      } | null;
      const stationButton = stationCard?.querySelector("button");
      const stationDetails = stationCard?.querySelector("details");
      if (!stationCard || !stationButton || !stationDetails) {
        throw new Error("Expected the Station preparation comparison and exact receipt.");
      }
      const stationOption = stationJourney.storyChoice!.options[0]!;
      expect(stationButton.textContent).toContain("Field kit:");
      expect(stationButton.textContent).not.toContain("Promise / priority:");
      expect(stationButton.textContent).not.toContain("Check fit:");
      expect(stationButton.textContent).toContain("Governing skill:");
      expect(stationButton.textContent).toContain(stationOption.summary!.checkFit!);
      expect(stationButton.textContent).toContain("Cost:");
      expect(stationButton.textContent).toContain("Give up:");
      expect(stationButton.textContent).not.toContain("Purpose:");
      expect(stationButton.textContent).not.toContain("Trigger category:");
      expect(stationButton.textContent).toContain(stationPreparation.profiles[0]!.tradeoff);
      expect(stationButton.textContent).toContain(stationPreparation.profiles[0]!.summary);
      const forecastLine = stationJourney.storyChoice?.options[0]?.dispatchForecast?.line;
      if (!forecastLine) throw new Error("Expected the authenticated Station timing forecast.");
      expect(stationButton.textContent).not.toContain(forecastLine);
      expect(stationButton.textContent).not.toContain(stationPreparation.profiles[0]!.preview);
      expect(stationDetails.textContent).toContain(stationOption.consequence);
      expect(stationDetails.textContent).not.toContain(stationOption.summary!.checkFit!);
      expect(stationDetails.textContent).toContain(forecastLine);
      expect(stationDetails.textContent).not.toContain(stationPreparation.profiles[0]!.preview);
      expect(stationDetails.textContent).not.toContain(stationPreparation.profiles[0]!.consequence);
      expect(stationCard.textContent?.split(stationOption.summary!.checkFit!)).toHaveLength(2);
      expect(objectiveGuidance()).toBe(
        "Your field kit changes later actions and the service Albany can release on your return; it does not replace this objective.",
      );
      const stationDisclosures = Array.from(
        rootElement.querySelectorAll(".journey-choice-details > summary"),
      ) as Array<{
        textContent: string | null;
        dispatchEvent: (event: unknown) => boolean;
      }>;
      const disclosureNames = stationDisclosures.map((summary) => summary.textContent);
      expect(disclosureNames).toEqual(
        stationPreparation.profiles.map((profile) => `Inspect exact receipt for ${profile.title}`),
      );
      expect(new Set(disclosureNames).size).toBe(stationPreparation.profiles.length);
      const selectedBeforeDisclosure = [...selected];
      await act(async () => {
        stationDisclosures[0]!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      });
      expect(selected).toEqual(selectedBeforeDisclosure);

      const allocationJourney = reliefAllocationJourney();
      const allocation = WORLD.opening_relief_allocation!;
      await act(async () => {
        root!.render(
          react.createElement(module.JourneyStoryChoiceScreen, {
            journey: allocationJourney,
            onChoose: (choiceId: string) => selected.push(choiceId),
          }),
        );
      });
      const allocationCard = rootElement.querySelector(".journey-choice-card") as {
        querySelector: (selector: string) => { textContent: string | null } | null;
      } | null;
      const allocationButton = allocationCard?.querySelector("button");
      const allocationDetails = allocationCard?.querySelector("details");
      if (!allocationButton || !allocationDetails) {
        throw new Error("Expected the Relief Allocation comparison and exact receipt.");
      }
      const allocationOption = allocationJourney.storyChoice!.options[0]!;
      expect(allocationButton.textContent).toContain("Relief wagon:");
      expect(allocationButton.textContent).not.toContain("Promise / priority:");
      expect(allocationButton.textContent).toContain("Cost / give up:");
      expect(allocationButton.textContent).not.toContain("Purpose:");
      expect(allocationButton.textContent).not.toContain("Trigger category:");
      expect(allocationButton.textContent).toContain(
        `Leaves exposed: ${allocation.options[0]!.leaves_exposed}`,
      );
      const allocationImpact = allocationJourney.storyChoice?.options[0]?.dispatchImpact?.line;
      if (!allocationImpact) throw new Error("Expected the authenticated relief timing impact.");
      expect(allocationButton.textContent).not.toContain(allocationImpact);
      expect(allocationButton.textContent).not.toContain(allocation.options[0]!.preview);
      expect(allocationDetails.textContent).toContain(allocationOption.consequence);
      expect(allocationDetails.textContent).toContain(allocationImpact);
      expect(allocationDetails.textContent).not.toContain(allocation.options[0]!.preview);
      expect(allocationDetails.textContent).not.toContain(allocation.options[0]!.consequence);
      expect(objectiveGuidance()).toBe(
        "Albany's relief wagon can cover one need. Each choice names what it protects, what remains exposed, and which field or return resource changes.",
      );

      const standardPacketJourney = reliefOathJourney();
      const standardPacketChoice = standardPacketJourney.storyChoice;
      if (!standardPacketChoice?.progressiveDisclosure) {
        throw new Error(
          "Expected the Road-Warden relief oath to offer a progressive standard packet.",
        );
      }
      const revealRequests: Array<[string, string]> = [];
      const renderStandardPacket = async (
        renderedJourney = standardPacketJourney,
        visibleOptionIds?: readonly string[],
      ): Promise<void> => {
        await act!(async () => {
          root!.render(
            react.createElement(module.JourneyStoryChoiceScreen, {
              journey: renderedJourney,
              onChoose: (choiceId: string) => selected.push(choiceId),
              onReveal: (storyChoiceId: string, revealId: string) => {
                revealRequests.push([storyChoiceId, revealId]);
              },
              ...(visibleOptionIds ? { visibleOptionIds } : {}),
            }),
          );
        });
      };
      await renderStandardPacket();
      const matchedMessage = rootElement.querySelector("#journey-story-choice-message") as {
        textContent: string | null;
      } | null;
      expect(matchedMessage?.textContent).toBe(MATCHED_OATH_MESSAGE);
      const standardPacketButtons = Array.from(
        rootElement.querySelectorAll(".journey-choice-card > button"),
      ) as Array<{ click: () => void; textContent: string | null }>;
      expect(standardPacketButtons).toHaveLength(
        standardPacketChoice.progressiveDisclosure.initialOptionIds.length,
      );
      expect(standardPacketButtons).toHaveLength(1);
      const roleShortcut = standardPacketChoice.options.find((option) =>
        option.label.startsWith("Ready-made dispatch —"),
      );
      if (!roleShortcut) throw new Error("Expected the Road-Warden quick setup before reveal.");
      expect(standardPacketButtons[0]?.textContent).toContain(roleShortcut.label);
      expect(standardPacketButtons[0]?.textContent).toContain("Ready-made dispatch:");
      expect(standardPacketButtons[0]?.textContent).toContain("Cost:");
      expect(standardPacketButtons[0]?.textContent).toContain("Give up:");
      expect(standardPacketButtons[0]?.textContent).not.toMatch(
        /\b(?:DEF|DC|import|fieldTrigger)\b/i,
      );
      expect(standardPacketButtons[0]?.textContent).not.toContain("Wolf-Winter promise:");
      const dutySurfaceOrder = Array.from(
        rootElement.querySelectorAll(
          ".journey-choice-progressive-disclosure, .journey-choice-actions",
        ),
      ) as Array<{ getAttribute: (name: string) => string | null }>;
      expect(dutySurfaceOrder[0]?.getAttribute("class")).toContain(
        "journey-choice-progressive-disclosure",
      );
      const quickSetupHeading = rootElement.querySelector("h1") as {
        textContent: string | null;
      } | null;
      expect(quickSetupHeading?.textContent).toBe(
        "Choose a ready-made dispatch or compare promises",
      );
      expect(rootElement.textContent).toContain(
        "The ready-made dispatch pairs one Wolf-Winter promise with one report; the promise comparison is read-only.",
      );
      expect(rootElement.textContent?.toLowerCase()).not.toContain("standard packet");
      const customize = rootElement.querySelector(
        ".journey-choice-progressive-disclosure > button",
      ) as {
        click: () => void;
        getAttribute: (name: string) => string | null;
        textContent: string | null;
      } | null;
      if (!customize) throw new Error("Expected a real progressive-disclosure button.");
      expect(customize.textContent).toBe(standardPacketChoice.progressiveDisclosure.reveal.label);
      expect(customize.getAttribute("aria-expanded")).toBe("false");
      const customSectionId = customize.getAttribute("aria-controls");
      expect(customSectionId).toBeTruthy();
      const descriptionId = customize.getAttribute("aria-describedby");
      expect(descriptionId).toBeTruthy();
      const describedBy = rootElement.querySelector(`[id="${descriptionId}"]`) as {
        textContent: string | null;
      } | null;
      expect(describedBy?.textContent).toBe(OPENING_RELIEF_OATH_CUSTOMIZE_DESCRIPTION);
      expect(rootElement.textContent).not.toContain(OPENING_RELIEF_OATH_FIELD_OUTCOME_COMPASS);
      await act(async () => {
        standardPacketButtons[0]!.click();
      });
      expect(selected.at(-1)).toBe(roleShortcut.id);
      const selectedBeforeCustomize = [...selected];
      await act(async () => {
        customize.click();
      });
      expect(selected).toEqual(selectedBeforeCustomize);
      expect(revealRequests).toEqual([
        [standardPacketChoice.id, standardPacketChoice.progressiveDisclosure.reveal.id],
      ]);
      const revealedStandardPacketJourney = reliefOathJourney("albany:road_warden", true);
      await renderStandardPacket(revealedStandardPacketJourney, [
        ...standardPacketChoice.progressiveDisclosure.initialOptionIds,
        ...standardPacketChoice.progressiveDisclosure.reveal.optionIds,
      ]);
      expect(rootElement.textContent).toContain(OPENING_RELIEF_OATH_FIELD_OUTCOME_COMPASS);
      expect(rootElement.querySelector(".journey-choice-progressive-disclosure")).toBeNull();
      expect(selected).toEqual(selectedBeforeCustomize);
      expect(revealRequests).toHaveLength(1);
      const revealedCards = Array.from(
        rootElement.querySelectorAll(".journey-choice-actions > .journey-choice-card > button"),
      ) as Array<{ textContent: string | null; click: () => void }>;
      expect(revealedCards).toHaveLength(standardPacketChoice.options.length);
      expect(revealedCards).toHaveLength(4);
      expect(revealedCards.map((card) => card.textContent)).toEqual(
        standardPacketChoice.options.map((option) => expect.stringContaining(option.label)),
      );
      await act(async () => {
        revealedCards[1]!.click();
      });
      expect(selected.at(-1)).toBe(standardPacketChoice.progressiveDisclosure.reveal.optionIds[0]);

      const ironhandsJourney = reliefOathJourney("albany:ironhands_repairer");
      await act(async () => {
        root!.render(
          react.createElement(module.JourneyStoryChoiceScreen, {
            journey: ironhandsJourney,
            onChoose: (choiceId: string) => selected.push(choiceId),
          }),
        );
      });
      const ironhandsCards = rootElement.querySelectorAll(".journey-choice-card > button");
      expect(ironhandsCards).toHaveLength(1);
      const ironhandsDisclosure = rootElement.querySelector(
        ".journey-choice-progressive-disclosure > button",
      ) as { getAttribute: (name: string) => string | null } | null;
      expect(ironhandsDisclosure?.getAttribute("aria-expanded")).toBe("false");

      const ledgerJourney = ledgerReliefOathJourney();
      await act(async () => {
        root!.render(
          react.createElement(module.JourneyStoryChoiceScreen, {
            journey: ledgerJourney,
            onChoose: (choiceId: string) => selected.push(choiceId),
          }),
        );
      });
      expect(rootElement.querySelector(".journey-choice-progressive-disclosure")).toBeNull();
      expect(rootElement.querySelectorAll(".journey-choice-card > button")).toHaveLength(
        ledgerJourney.storyChoice!.options.length,
      );

      for (const [
        comparedJourney,
        sourceOption,
        expectedMessage,
        expectedSummaryLabel,
        expectedGuidance,
      ] of [
        [
          ledgerReliefOathJourney(),
          WORLD.opening_relief_oath!.options[0]!,
          CUSTOM_DUTY_MESSAGE,
          "Wolf-Winter promise:",
          "Compare each promise's access, actual cost, field consequence, and return terms. This binds the dispatch without replacing your current objective.",
        ],
        [
          leadSourceJourney(),
          WORLD.opening_lead_source!.options[0]!,
          SOURCE_MESSAGE,
          "Report:",
          "Your report changes the approaches you can carry forward; it does not replace this objective.",
        ],
      ] as const) {
        await act(async () => {
          root!.render(
            react.createElement(module.JourneyStoryChoiceScreen, {
              journey: comparedJourney,
              onChoose: (choiceId: string) => selected.push(choiceId),
            }),
          );
        });
        const comparedButton = rootElement.querySelector(".journey-choice-card button") as {
          textContent: string | null;
        } | null;
        const comparedDetails = rootElement.querySelector(".journey-choice-card details p") as {
          textContent: string | null;
        } | null;
        if (!comparedButton || !comparedDetails) {
          throw new Error("Expected every Albany setup kind to use the comparison-first card.");
        }
        const comparedMessage = rootElement.querySelector("#journey-story-choice-message") as {
          textContent: string | null;
        } | null;
        expect(comparedMessage?.textContent).toBe(expectedMessage);
        const comparedOption = comparedJourney.storyChoice!.options[0]!;
        expect(comparedButton.textContent).toContain(expectedSummaryLabel);
        expect(comparedButton.textContent).not.toContain("Promise / priority:");
        expect(comparedButton.textContent).toContain("Cost / give up:");
        expect(comparedButton.textContent).not.toContain("Trigger category:");
        expect(comparedButton.textContent).not.toContain(sourceOption.preview);
        expect(comparedDetails.textContent).toContain(comparedOption.consequence);
        expect(comparedDetails.textContent).not.toContain(sourceOption.preview);
        expect(comparedDetails.textContent).not.toContain(sourceOption.consequence);
        expect(objectiveGuidance()).toBe(expectedGuidance);
      }

      await act(async () => {
        root!.render(
          react.createElement(module.JourneyStoryChoiceScreen, {
            journey: allyJourney(),
            onChoose: (choiceId: string) => selected.push(choiceId),
          }),
        );
      });
      const allyButton = rootElement.querySelector(".journey-choice-card button") as {
        textContent: string | null;
      } | null;
      if (!allyButton) throw new Error("Expected the ally comparison-first card.");
      expect(allyButton.textContent).toContain("Riding choice:");
      expect(allyButton.textContent).not.toContain("Promise / priority:");
      expect(allyButton.textContent).toContain("Cost / give up:");
      const soloButton = Array.from(
        rootElement.querySelectorAll(".journey-choice-card button"),
      ).find((candidate) =>
        (candidate as { textContent: string | null }).textContent?.includes("Ride alone"),
      ) as { textContent: string | null } | undefined;
      expect(soloButton?.textContent).toContain("Riding choice:");
      expect(soloButton?.textContent).not.toContain("Second rider:");
      expect(objectiveGuidance()).toBe(
        "Compare what the second rider can do, their binding condition, and actual cost; this does not replace your objective.",
      );
    } finally {
      if (root && act) {
        await act(async () => root!.unmount());
      }
      dom.window.close();
      for (const [name, descriptor] of previousGlobals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
      await server.close();
    }
  });
});
