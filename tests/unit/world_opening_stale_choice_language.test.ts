import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const OATH = WORLD.opening_relief_oath!;
const SOURCE = WORLD.opening_lead_source!;
const PREPARATION = WORLD.opening_preparation!;
const ALLOCATION = WORLD.opening_relief_allocation!;
const ALLY = WORLD.opening_ally!;

type AvailabilityMethod =
  | "openingRegistrationAvailable"
  | "openingReliefOathAvailable"
  | "openingLeadSourceAvailable"
  | "openingAllyAvailable";

function atRegistration(world: OverworldManifest = WORLD): OverworldSession {
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(world.opening_registration!.contact);
  return session;
}

function atLeadSource(): OverworldSession {
  const session = atRegistration();
  session.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
  revealCurrentJourneyStoryOptions(session, OATH.id);
  session.chooseJourneyStory(OATH.options[0]!.id);
  return session;
}

function atStation(): OverworldSession {
  const session = atLeadSource();
  session.chooseJourneyStory(SOURCE.options[0]!.id);
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === PREPARATION.area);
  if (!route) throw new Error("Expected a route to the Station dispatch board.");
  session.moveArea(route.id);
  return session;
}

function expireAfterPresentation(session: OverworldSession, method: AvailabilityMethod): void {
  const target = session as unknown as Record<AvailabilityMethod, () => unknown>;
  const available = target[method].bind(session);
  let presented = false;
  target[method] = () => {
    if (presented) return null;
    presented = true;
    return available();
  };
}

function expectStaleChoice(args: {
  session: OverworldSession;
  choiceId: string;
  message: string;
  storyChoiceId?: string;
}): void {
  const before = args.session.snapshot();
  expect(() => args.session.chooseJourneyStory(args.choiceId, args.storyChoiceId)).toThrow(
    args.message,
  );
  expect(args.session.snapshot()).toEqual(before);
}

describe("opening stale-choice player language shared by UI, CLI, and MCP", () => {
  it("names each expired opening choice in the same player vocabulary", () => {
    const registration = atRegistration();
    expireAfterPresentation(registration, "openingRegistrationAvailable");
    expectStaleChoice({
      session: registration,
      choiceId: REGISTRATION.profiles[0]!.id,
      message: "The presented background choice is no longer available.",
    });

    const oath = atRegistration();
    oath.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
    revealCurrentJourneyStoryOptions(oath, OATH.id);
    expireAfterPresentation(oath, "openingReliefOathAvailable");
    expectStaleChoice({
      session: oath,
      choiceId: OATH.options[0]!.id,
      message: "The presented Wolf-Winter promise is no longer available.",
    });

    const source = atLeadSource();
    expireAfterPresentation(source, "openingLeadSourceAvailable");
    expectStaleChoice({
      session: source,
      choiceId: SOURCE.options[0]!.id,
      message: "The presented report choice is no longer available.",
    });

    const preparation = atStation();
    (
      preparation as unknown as { offerOpeningPreparationAtDeparture: () => void }
    ).offerOpeningPreparationAtDeparture = () => undefined;
    expectStaleChoice({
      session: preparation,
      storyChoiceId: PREPARATION.id,
      choiceId: PREPARATION.profiles[0]!.id,
      message: "The presented field-kit choice is no longer available.",
    });

    const allocation = atStation();
    (
      allocation as unknown as { offerOpeningReliefAllocationAtDeparture: () => void }
    ).offerOpeningReliefAllocationAtDeparture = () => undefined;
    expectStaleChoice({
      session: allocation,
      storyChoiceId: ALLOCATION.id,
      choiceId: ALLOCATION.options[0]!.id,
      message: "The presented relief-wagon choice is no longer available.",
    });

    const ally = atStation();
    ally.talkToCharacter(ALLY.contact);
    expireAfterPresentation(ally, "openingAllyAvailable");
    expectStaleChoice({
      session: ally,
      choiceId: ALLY.solo_option_id,
      message: "The presented riding choice is no longer available.",
    });
  });

  it("keeps all three adapters on the shared Session error boundary", () => {
    const ui = readFileSync("ui/src/App.tsx", "utf8");
    const cli = readFileSync("bin/overworld_play.ts", "utf8");
    const mcp = readFileSync("src/mcp/overworld_tool_handlers.ts", "utf8");

    expect(ui).toContain("setError((e as Error).message)");
    expect(cli).toContain(
      "Could not continue: ${error instanceof Error ? error.message : String(error)}",
    );
    expect(mcp).toContain(
      "(session) => session.chooseJourneyStory(args.choice, args.story_choice_id)",
    );
  });
});
