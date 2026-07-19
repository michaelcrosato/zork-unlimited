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
