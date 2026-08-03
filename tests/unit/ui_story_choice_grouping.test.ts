import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createServer } from "vite";

import type { JourneyPresentation } from "../../src/world/journey_contract.js";

describe("JourneyStoryChoiceScreen registration grouping", () => {
  it("renders doctrine and custom-role sections with aligned card counts", async () => {
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
      const journey = {
        goal: { text: "Find a local lead." },
        decisionProof: { hash: "test:grouped-registration", last: null },
        opportunities: null,
        storyChoice: {
          id: "test:grouped-registration",
          kind: "registration",
          message: "Choose a starting role.",
          options: [
            { id: "custom", label: "Custom role", consequence: "Custom." },
            { id: "doctrine", label: "Doctrine", group: "doctrine", consequence: "Doctrine." },
          ],
        },
      } as unknown as JourneyPresentation;
      const markup = reactDomServer.renderToStaticMarkup(
        react.createElement(module.JourneyStoryChoiceScreen, {
          journey,
          onChoose: () => undefined,
        }),
      );

      expect(markup).toContain("Start with a doctrine");
      expect(markup).toContain("Build a custom role");
      expect(markup).toContain("Choose how to begin");
      expect(markup).toContain(
        "A doctrine commits your role, oath, and source; a custom role continues step-by-step.",
      );
      expect(markup.indexOf("Start with a doctrine")).toBeLessThan(
        markup.indexOf("Build a custom role"),
      );
      expect(markup.indexOf("Doctrine")).toBeLessThan(markup.indexOf("Custom role"));
      expect(markup).toContain("journey-choice-option-groups");
      expect(markup.match(/<button/g)).toHaveLength(2);
    } finally {
      await server.close();
    }
  });

  it("keeps the legacy registration heading without grouping metadata", async () => {
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
      const journey = {
        goal: { text: "Find a local lead." },
        decisionProof: { hash: "test:legacy-registration", last: null },
        opportunities: null,
        storyChoice: {
          id: "test:legacy-registration",
          kind: "registration",
          message: "Choose a background.",
          options: [
            { id: "first", label: "First", consequence: "First." },
            { id: "second", label: "Second", consequence: "Second." },
          ],
        },
      } as unknown as JourneyPresentation;
      const markup = reactDomServer.renderToStaticMarkup(
        react.createElement(module.JourneyStoryChoiceScreen, {
          journey,
          onChoose: () => undefined,
        }),
      );

      expect(markup).toContain("Choose your lived background");
      expect(markup).not.toContain("Choose how to begin");
      expect(markup).not.toContain("journey-choice-option-groups");
      expect(markup.match(/<button/g)).toHaveLength(2);
    } finally {
      await server.close();
    }
  });
});
