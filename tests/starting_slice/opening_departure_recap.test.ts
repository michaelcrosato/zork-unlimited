import { describe, expect, it } from "vitest";

import { render } from "../../bin/overworld_play.js";
import { OVERWORLD_COMPACT_VIEW_VERSION } from "../../src/world/compact_view.js";
import { deriveOpeningDepartureRecap } from "../../src/world/opening_departure_recap.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const RELIEF_OATH = WORLD.opening_relief_oath!;
const LEAD_SOURCE = WORLD.opening_lead_source!;
const PREPARATION = WORLD.opening_preparation!;
const RELIEF_ALLOCATION = WORLD.opening_relief_allocation!;
const ALLY = WORLD.opening_ally!;
const WOLF = WORLD.quests.find((quest) => quest.id === LEAD_SOURCE.target_quest)!;

function stationSession(roleIndex = 0): OverworldSession {
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory(REGISTRATION.profiles[roleIndex]!.id);
  session.chooseJourneyStory(RELIEF_OATH.options[0]!.id);
  session.chooseJourneyStory(LEAD_SOURCE.options[0]!.id);
  const stationRoute = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === PREPARATION.area);
  if (!stationRoute) throw new Error("Expected the authored route to Hayden's Station.");
  session.moveArea(stationRoute.id);
  return session;
}

function selectedTitle(session: OverworldSession, slot: string): string | null | undefined {
  return session.view().departureRecap?.entries.find((entry) => entry.slot === slot)?.title;
}

describe("Albany opening departure recap", () => {
  it("summarizes the accumulated current plan without exposing alternatives or changing play", () => {
    const session = stationSession();
    const beforeSnapshot = session.snapshot();
    const beforeHash = session.snapshotHash();
    const beforeDecisions = session.journey().acceptedDecisions;
    const full = session.view();
    const compact = session.compactView();

    expect(full.departureRecap).toEqual({
      version: 1,
      questId: WOLF.id,
      questTitle: WOLF.title,
      entries: [
        {
          slot: "role",
          label: "Role",
          status: "selected",
          title: REGISTRATION.profiles[0]!.title,
        },
        {
          slot: "duty",
          label: "Duty",
          status: "selected",
          title: RELIEF_OATH.options[0]!.title,
        },
        {
          slot: "evidence",
          label: "Evidence",
          status: "selected",
          title: LEAD_SOURCE.options[0]!.title,
        },
        {
          slot: "preparation",
          label: "Preparation",
          status: "open_optional",
          title: null,
        },
        {
          slot: "relief_allocation",
          label: "Relief allocation",
          status: "available_after_preparation",
          title: null,
        },
        {
          slot: "field_team",
          label: "Field team",
          status: "available_after_preparation",
          title: null,
        },
      ],
    });
    expect(compact.v).toBe(OVERWORLD_COMPACT_VIEW_VERSION);
    expect(compact.departure_recap).toEqual([
      1,
      WOLF.id,
      WOLF.title,
      full.departureRecap!.entries.map((entry) => [
        entry.slot,
        entry.label,
        entry.status,
        entry.title,
      ]),
    ]);

    const visible = JSON.stringify(full.departureRecap);
    for (const alternative of [
      ...REGISTRATION.profiles.slice(1),
      ...RELIEF_OATH.options.slice(1),
      ...LEAD_SOURCE.options.slice(1),
      ...PREPARATION.profiles,
      ...RELIEF_ALLOCATION.options,
      ...ALLY.options,
    ]) {
      expect(visible).not.toContain(alternative.title);
      if ("preview" in alternative) expect(visible).not.toContain(alternative.preview);
      if ("consequence" in alternative) expect(visible).not.toContain(alternative.consequence);
    }

    expect(session.snapshot()).toEqual(beforeSnapshot);
    expect(session.snapshotHash()).toBe(beforeHash);
    expect(session.journey().acceptedDecisions).toBe(beforeDecisions);
    expect(OverworldSession.restore(WORLD, beforeSnapshot).view().departureRecap).toEqual(
      full.departureRecap,
    );
    expect(
      deriveOpeningDepartureRecap({
        world: { ...WORLD, opening_ally: undefined },
        journalEntries: beforeSnapshot.journalEntries,
      }),
    ).toBeNull();

    (
      full.departureRecap as unknown as {
        entries: Array<{ title: string | null }>;
      }
    ).entries[0]!.title = "forged full title";
    (
      compact.departure_recap as unknown as [
        number,
        string,
        string,
        Array<[string, string, string, string | null]>,
      ]
    )[3][0]![3] = "forged compact title";
    expect(selectedTitle(session, "role")).toBe(REGISTRATION.profiles[0]!.title);
    expect(session.compactView().departure_recap?.[3][0]?.[3]).toBe(
      REGISTRATION.profiles[0]!.title,
    );

    const terminal = render(session.view());
    expect(terminal).toContain(`${WOLF.title} dispatch recap:`);
    expect(terminal).toContain(`Role: ${REGISTRATION.profiles[0]!.title}`);
    expect(terminal).toContain("Preparation: Open (optional)");
  });

  it("updates resolved optional rows, stays paired by choice, and respects the mission boundary", () => {
    const first = stationSession(0);
    const second = stationSession(1);
    const firstEntries = first.view().departureRecap!.entries;
    const secondEntries = second.view().departureRecap!.entries;
    expect(
      firstEntries
        .map((entry, index) => (entry.title === secondEntries[index]!.title ? null : entry.slot))
        .filter(Boolean),
    ).toEqual(["role"]);
    expect(secondEntries[0]!.title).toBe(REGISTRATION.profiles[1]!.title);

    expect(first.view().departureRecap).not.toBeNull();
    first.inspectJourneyStory(PREPARATION.id);
    expect(first.view().departureRecap).not.toBeNull();
    first.chooseJourneyStory(PREPARATION.profiles[0]!.id);
    expect(first.view().departureRecap?.entries[3]).toMatchObject({
      status: "selected",
      title: PREPARATION.profiles[0]!.title,
    });
    expect(first.view().departureRecap?.entries[4]).toMatchObject({
      status: "open_optional",
      title: null,
    });
    expect(first.view().departureRecap?.entries[5]).toMatchObject({
      status: "open_optional",
      title: null,
    });

    first.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
    expect(first.view().departureRecap?.entries[4]).toMatchObject({
      status: "selected",
      title: RELIEF_ALLOCATION.options[0]!.title,
    });
    first.talkToCharacter(ALLY.contact);
    expect(first.view().departureRecap).toBeNull();
    first.chooseJourneyStory(ALLY.options[0]!.id);
    expect(first.view().departureRecap?.entries[5]).toMatchObject({
      status: "selected",
      title: ALLY.options[0]!.title,
    });

    const questStart = first.view().questStarts.find(([questId]) => questId === WOLF.id);
    if (!questStart) throw new Error("Expected a legal Wolf-Winter launch.");
    first.startQuest(questStart[0], questStart[1] ?? undefined);
    expect(first.view().departureRecap).toBeNull();

    const moved = stationSession();
    const away = moved
      .view()
      .areaExits.find((candidate) => candidate.destination.id !== PREPARATION.area);
    if (!away) throw new Error("Expected a local route away from Hayden's Station.");
    moved.moveArea(away.id);
    expect(moved.view().departureRecap).toBeNull();
  });
});
