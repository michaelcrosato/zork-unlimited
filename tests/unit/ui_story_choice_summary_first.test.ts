import { createRequire } from "node:module";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { createServer } from "vite";

import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const requireFromRoot = createRequire(import.meta.url);

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

function reliefOathJourney(): ReturnType<OverworldSession["journey"]> {
  const session = new OverworldSession(WORLD);
  const registration = WORLD.opening_registration!;
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory(registration.profiles[0]!.id);
  return session.journey();
}

function leadSourceJourney(): ReturnType<OverworldSession["journey"]> {
  const session = new OverworldSession(WORLD);
  const registration = WORLD.opening_registration!;
  const oath = WORLD.opening_relief_oath!;
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory(registration.profiles[0]!.id);
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
      };
      const card = rootElement.querySelector(".journey-choice-card") as {
        querySelector: (selector: string) => unknown;
      } | null;
      if (!card) throw new Error("Expected a rendered summary-first choice card.");
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
      expect(choiceButtonText).toContain("Trigger category:");
      expect(choiceButtonText).toContain("Immediate cost:");
      expect(choiceButtonText).toContain("Tradeoff:");
      expect(choiceButtonText).toContain(registrationSource.profiles[0]!.trigger_category);
      expect(choiceButtonText).not.toContain(registrationSource.profiles[0]!.preview);
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
        querySelector: (selector: string) => { textContent: string | null } | null;
      } | null;
      const stationButton = stationCard?.querySelector("button");
      const stationDetails = stationCard?.querySelector("details p");
      if (!stationButton || !stationDetails) {
        throw new Error("Expected the Station preparation comparison and full-terms disclosure.");
      }
      expect(stationButton.textContent).toContain("Purpose:");
      expect(stationButton.textContent).toContain("Trigger category:");
      expect(stationButton.textContent).toContain("Immediate cost:");
      expect(stationButton.textContent).toContain("Tradeoff:");
      expect(stationButton.textContent).toContain(stationPreparation.profiles[0]!.tradeoff);
      expect(stationButton.textContent).toContain(stationPreparation.profiles[0]!.summary);
      expect(stationButton.textContent).toContain(stationPreparation.profiles[0]!.trigger_category);
      const forecastLine = stationJourney.storyChoice?.options[0]?.dispatchForecast?.line;
      if (!forecastLine) throw new Error("Expected the authenticated Station timing forecast.");
      expect(stationButton.textContent).toContain(forecastLine);
      expect(stationButton.textContent).not.toContain(stationPreparation.profiles[0]!.preview);
      expect(stationDetails.textContent).toContain(stationPreparation.profiles[0]!.preview);
      expect(stationDetails.textContent).toContain(stationPreparation.profiles[0]!.consequence);
      const stationDisclosures = Array.from(
        rootElement.querySelectorAll(".journey-choice-details > summary"),
      ) as Array<{
        textContent: string | null;
        dispatchEvent: (event: unknown) => boolean;
      }>;
      const disclosureNames = stationDisclosures.map((summary) => summary.textContent);
      expect(disclosureNames).toEqual(
        stationPreparation.profiles.map(
          (profile) => `Full terms and consequence for ${profile.title}`,
        ),
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
      const allocationDetails = allocationCard?.querySelector("details p");
      if (!allocationButton || !allocationDetails) {
        throw new Error("Expected the Relief Allocation comparison and full-terms disclosure.");
      }
      expect(allocationButton.textContent).toContain("Purpose:");
      expect(allocationButton.textContent).toContain("Trigger category:");
      expect(allocationButton.textContent).toContain("Immediate cost:");
      expect(allocationButton.textContent).toContain("Tradeoff:");
      expect(allocationButton.textContent).toContain(
        `Leaves exposed: ${allocation.options[0]!.leaves_exposed}`,
      );
      const allocationImpact = allocationJourney.storyChoice?.options[0]?.dispatchImpact?.line;
      if (!allocationImpact) throw new Error("Expected the authenticated relief timing impact.");
      expect(allocationButton.textContent).toContain(allocationImpact);
      expect(allocationButton.textContent!.indexOf(allocationImpact)).toBeLessThan(
        allocationButton.textContent!.indexOf("Purpose:"),
      );
      expect(allocationButton.textContent).toContain(allocation.options[0]!.trigger_category);
      expect(allocationButton.textContent).not.toContain(allocation.options[0]!.preview);
      expect(allocationDetails.textContent).toContain(allocation.options[0]!.preview);
      expect(allocationDetails.textContent).toContain(allocation.options[0]!.consequence);

      for (const [comparedJourney, sourceOption] of [
        [reliefOathJourney(), WORLD.opening_relief_oath!.options[0]!],
        [leadSourceJourney(), WORLD.opening_lead_source!.options[0]!],
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
        expect(comparedButton.textContent).toContain("Trigger category:");
        expect(comparedButton.textContent).toContain(sourceOption.trigger_category);
        expect(comparedButton.textContent).not.toContain(sourceOption.preview);
        expect(comparedDetails.textContent).toContain(sourceOption.preview);
        expect(comparedDetails.textContent).toContain(sourceOption.consequence);
        expect(comparedButton.textContent).toContain("Immediate cost:");
        expect(comparedButton.textContent).toContain("Tradeoff:");
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
      expect(allyButton.textContent).toContain("Immediate cost:");
      expect(allyButton.textContent).toContain("Tradeoff:");
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
