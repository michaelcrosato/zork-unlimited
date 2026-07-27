import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createServer } from "vite";

import {
  INITIAL_JOURNEY_GOAL_GUIDANCE,
  JOURNEY_OPPORTUNITY_GUIDANCE,
} from "../../src/world/journey_contract.js";
import { deferJourneyOpportunityDetails } from "../../src/world/journey_opportunity_leads.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession } from "../../ui/src/overworld.js";

const WORLD = loadOverworldManifest(process.cwd());

describe("journey opportunity UI", () => {
  it("renders the same button-free root summary on completion, story-choice, and active screens", async () => {
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
      const [choiceModule, storyModule, statusModule] = await Promise.all([
        server.ssrLoadModule("/src/JourneyChoiceScreen.tsx"),
        server.ssrLoadModule("/src/JourneyStoryChoiceScreen.tsx"),
        server.ssrLoadModule("/src/JourneyStatus.tsx"),
      ]);
      const requireFromUi = createRequire(resolve(uiRoot, "package.json"));
      const react = requireFromUi("react") as {
        createElement: (type: unknown, props: Record<string, unknown>) => unknown;
      };
      const reactDomServer = requireFromUi("react-dom/server") as {
        renderToStaticMarkup: (element: unknown) => string;
      };
      const base = new OverworldSession(WORLD).journey();
      const opportunities = {
        guidance: JOURNEY_OPPORTUNITY_GUIDANCE,
        leads: [
          {
            id: "albany_city__transport_hub__job",
            kind: "job" as const,
            title: "Hayden's Cade Return Packet",
            area: "Albany Station Quarter",
            access: "here" as const,
          },
          {
            id: "albany_city__market__event",
            kind: "event" as const,
            title: "Jamie Tanner's Winter Price Policy",
            area: "Albany Market Streets",
            access: "mapped" as const,
          },
          {
            id: "albany_city__greenway__event",
            kind: "event" as const,
            title: "Albany Greenway: trail sign damage",
            area: "Albany Greenway",
            access: "route_unmapped" as const,
          },
        ],
      };
      const deferredOpportunities = deferJourneyOpportunityDetails(opportunities)!;
      const choiceJourney = {
        ...base,
        opportunities: deferredOpportunities,
        storyChoice: null,
        pendingChoice: {
          id: "journey:test",
          atDecision: 10,
          reasons: ["goal_completed"],
          checkpoint: null,
          goalVersion: 1,
          goalId: "albany_local_lead",
          message: "You completed this objective. Continue or end?",
          options: [
            { id: "continue", label: "Continue", consequence: "Keep playing." },
            { id: "end", label: "End", consequence: "End this journey." },
          ],
        },
      };
      const storyJourney = {
        ...base,
        opportunities: deferredOpportunities,
        storyChoice: {
          id: "albany_dawn_dispatch",
          message: "Choose where Albany's relief wagon goes at dawn.",
          options: [
            {
              id: "send_wagon_to_cade",
              label: "Return the wagon to Cade",
              consequence: "Send repairs south.",
            },
            {
              id: "send_wardens_north",
              label: "Send the wardens north",
              consequence: "Send relief north.",
            },
          ],
        },
      };
      const statusJourney = { ...base, opportunities, storyChoice: null };

      const choiceMarkup = reactDomServer.renderToStaticMarkup(
        react.createElement(choiceModule.JourneyChoiceScreen, {
          journey: choiceJourney,
          onChoose: () => undefined,
        }),
      );
      const storyMarkup = reactDomServer.renderToStaticMarkup(
        react.createElement(storyModule.JourneyStoryChoiceScreen, {
          journey: storyJourney,
          onChoose: () => undefined,
        }),
      );
      const statusMarkup = reactDomServer.renderToStaticMarkup(
        react.createElement(statusModule.JourneyStatus, {
          journey: statusJourney,
          onFollowGoalPassage: () => undefined,
        }),
      );

      for (const markup of [choiceMarkup, storyMarkup]) {
        expect(markup).toContain("Optional aftermath");
        expect(markup).toContain("Return opportunities");
        expect(markup).toContain(deferredOpportunities.guidance);
        expect(markup).toContain("3 optional aftermath leads remain");
        expect(markup).not.toContain("Albany Greenway: trail sign damage");
        expect(markup).not.toContain("Albany Station Quarter");
        expect(markup).not.toContain("journey-opportunity-list");
        expect(markup).not.toMatch(/albany_city__|dispatch_|option_id|reward|renown/i);
      }
      expect(statusMarkup).toContain("Optional aftermath");
      expect(statusMarkup).toContain(INITIAL_JOURNEY_GOAL_GUIDANCE.replaceAll("'", "&#x27;"));
      expect(statusMarkup).toContain("Return opportunities");
      expect(statusMarkup).toContain(JOURNEY_OPPORTUNITY_GUIDANCE);
      expect(statusMarkup).toContain("When town actions are available");
      expect(statusMarkup).toContain("Albany Greenway: trail sign damage");
      expect(statusMarkup).toContain("Albany Station Quarter");
      expect(statusMarkup).toContain("Here now");
      expect(statusMarkup).toContain("Mapped district");
      expect(statusMarkup).toContain("Route not yet mapped");
      expect(statusMarkup).not.toMatch(/albany_city__|dispatch_|option_id|reward|renown/i);
      expect(choiceMarkup.match(/<button/g)).toHaveLength(2);
      expect(storyMarkup.match(/<button/g)).toHaveLength(storyJourney.storyChoice.options.length);
      expect(statusMarkup).not.toContain("<button");
    } finally {
      await server.close();
    }
  });
});
