import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import {
  cloneOverworldCompactView,
  compactOverworldView,
  OVERWORLD_COMPACT_LEGEND,
} from "../../src/world/compact_view.js";
import {
  compactStationDispatchBoard,
  compactStationDispatchBoardSupport,
  deriveStationDispatchBoard,
  STATION_DISPATCH_BOARD_GUIDANCE_CHAR_LIMIT,
  STATION_DISPATCH_SUPPORT_REVEAL_ID,
} from "../../src/world/station_dispatch_board.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  buildOverworldSessionCompactViewFromState,
  buildOverworldSessionViewModelState,
  type OverworldSessionViewModelSourceState,
} from "../../src/world/session_view_state.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import {
  sharedWolfHillRouteDispatchStatus,
  wolfHillRouteTradeoffParts,
} from "../../src/world/wolf_hill_route_presentation.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const RELIEF_OATH = WORLD.opening_relief_oath!;
const LEAD_SOURCE = WORLD.opening_lead_source!;
const PREPARATION = WORLD.opening_preparation!;
const RELIEF_ALLOCATION = WORLD.opening_relief_allocation!;
const ALLY = WORLD.opening_ally!;
const WOLF = WORLD.quests.find((quest) => quest.id === LEAD_SOURCE.target_quest)!;

function stationReadySession(): OverworldSession {
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
  revealCurrentJourneyStoryOptions(session, RELIEF_OATH.id);
  session.chooseJourneyStory(RELIEF_OATH.options[0]!.id);
  session.chooseJourneyStory(LEAD_SOURCE.options[0]!.id);
  return session;
}

function stationedSession(): OverworldSession {
  const session = stationReadySession();
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === PREPARATION.area);
  if (!route) throw new Error("Expected the authored Station route.");
  session.moveArea(route.id);
  return session;
}

describe("Station dispatch board", () => {
  it("is a read-only, authenticated projection of the independent support rows and legal roads", () => {
    const session = stationedSession();
    const before = session.snapshot();
    const beforeHash = session.snapshotHash();
    const beforeDecisions = session.journey().acceptedDecisions;
    const view = session.view();
    const board = view.stationDispatchBoard;
    if (!board || !view.departureRecap) throw new Error("Expected the Station dispatch board.");

    expect(board).toMatchObject({
      version: 6,
      questId: WOLF.id,
      questTitle: WOLF.title,
      guidance:
        "Ready to depart now with background, Wolf-Winter promise, and report set; field kit, one relief wagon, or second rider remain optional and change cost or aftermath, not your Wolf-Winter approach.",
    });
    expect(board.guidance.length).toBeLessThanOrEqual(STATION_DISPATCH_BOARD_GUIDANCE_CHAR_LIMIT);
    expect(board.support.map((entry) => [entry.slot, entry.status, entry.selectedTitle])).toEqual(
      view.departureRecap.entries
        .filter((entry) => ["preparation", "relief_allocation", "field_team"].includes(entry.slot))
        .map((entry) => [entry.slot, entry.status, entry.title]),
    );
    expect(board.dispatch).toEqual(view.departureRecap.dispatch);
    expect(board.plan).toEqual(
      view.departureRecap.entries.map((entry) => ({
        slot: entry.slot,
        label: entry.label,
        status: entry.status,
        selectedTitle: entry.title,
      })),
    );
    expect(board.plan).not.toHaveProperty("activeFieldTerm");
    expect(board.support.map((entry) => entry.label)).toEqual([
      "One field kit",
      "Albany's last relief wagon",
      "June Pike, second rider",
    ]);
    expect(board.support.map((entry) => entry.purpose)).toEqual([
      "Field kit: optionally choose one specialist kit for a named danger at Cade's steading.",
      "Relief wagon: optionally send Albany's last wagon to one crisis; the other two go without it.",
      "Second rider: optionally ask about cattle-first authority, or ride alone.",
    ]);
    expect(board.support.map((entry) => entry.detailHint)).toEqual([
      "Compare kits only if you want their exact cost and field use.",
      "Compare destinations only if you want to decide who is protected.",
      "Talk only to compare exact terms; this adds no combat power.",
    ]);
    expect(board.support.map((entry) => entry.action)).toEqual([
      {
        kind: "inspect",
        tool: "inspect_overworld_session_story",
        storyChoiceId: PREPARATION.id,
        title: "Field kit",
      },
      {
        kind: "inspect",
        tool: "inspect_overworld_session_story",
        storyChoiceId: RELIEF_ALLOCATION.id,
        title: "Relief wagon",
      },
      {
        kind: "talk",
        tool: "talk_overworld_session_contact",
        characterId: ALLY.contact,
        contactName: "June Pike",
      },
    ]);
    const quest = view.quests.find((candidate) => candidate.id === WOLF.id);
    if (!quest?.launch) throw new Error("Expected the projected Wolf launch card.");
    expect(board.launch.id).toBe(quest.launch.id);
    expect(board.launch.prompt).toBe(quest.launch.prompt);
    expect(board.launch.approaches).toEqual(
      quest.launch.options.map((option) => ({
        id: option.id,
        title: option.title,
        availableNow: view.questStarts.some(
          ([questId, approachId]) => questId === quest.id && approachId === option.id,
        ),
      })),
    );

    const fullRouteSummaries = quest.launch.options.flatMap((option) =>
      option.tradeoffSummary ? [option.tradeoffSummary] : [],
    );
    const sharedDispatchStatus = sharedWolfHillRouteDispatchStatus(fullRouteSummaries);
    expect(sharedDispatchStatus).toBe(
      "Set: background, promise, report. Dispatch 10m; final 10–60m; all on time. Compare; named choice commits. Start Wolf-Winter to decline the rest.",
    );

    const compact = session.compactView();
    expect(compact.station_dispatch_board).toEqual(
      compactStationDispatchBoard(board, false, sharedDispatchStatus ?? undefined),
    );
    expect(compactOverworldView(view).station_dispatch_board).toEqual(
      compact.station_dispatch_board,
    );
    expect(cloneOverworldCompactView(compact).station_dispatch_board).toEqual(
      compact.station_dispatch_board,
    );
    // V6 presents the legal roads and selected core first, with one relevance-first
    // overview standing in for all three unopened optional-support rows.
    expect(Buffer.byteLength(JSON.stringify(compact.station_dispatch_board), "utf8")).toBe(578);
    expect(Buffer.byteLength(OVERWORLD_COMPACT_LEGEND.station_dispatch_board, "utf8")).toBe(741);
    expect(OVERWORLD_COMPACT_LEGEND.station_dispatch_board).toContain(
      "Pre-review hides open_optional",
    );
    expect(compact.station_dispatch_board?.slice(0, 4)).toEqual([
      6,
      WOLF.id,
      sharedDispatchStatus,
      ["committed", board.dispatch?.minutes, null, 3],
    ]);
    expect(compact.station_dispatch_board?.[4]).toEqual([
      ["role", "selected", REGISTRATION.profiles[0]!.title, null, null],
      [
        "duty",
        "selected",
        RELIEF_OATH.options[0]!.title.replace(/\bDuty\b/gu, "Promise"),
        null,
        null,
      ],
      ["evidence", "selected", LEAD_SOURCE.options[0]!.title, null, null],
    ]);
    expect(compact.station_dispatch_board?.[5]).toEqual([
      STATION_DISPATCH_SUPPORT_REVEAL_ID,
      "Optional support: kits use Repair, Streetwise, or Mediation; plus Albany's last relief wagon or a cattle-first second rider. Review only if one interests you.",
    ]);
    expect(JSON.stringify(compact.station_dispatch_board)).not.toContain(PREPARATION.id);
    expect(JSON.stringify(compact.station_dispatch_board)).not.toContain(RELIEF_ALLOCATION.id);
    expect(JSON.stringify(compact.station_dispatch_board)).not.toContain(ALLY.contact);
    expect(compact.contacts).toContainEqual([ALLY.contact, "June Pike"]);
    expect(compactOverworldView(view).contacts).toEqual(compact.contacts);
    expect(compact.station_dispatch_support).toBeUndefined();
    expect(compactStationDispatchBoardSupport(board)).toEqual([
      [
        "preparation",
        "Field kit: optionally choose one specialist kit for a named danger at Cade's steading.",
        ["inspect", PREPARATION.id],
      ],
      [
        "relief_allocation",
        "Relief wagon: optionally send Albany's last wagon to one crisis; the other two go without it.",
        ["inspect", RELIEF_ALLOCATION.id],
      ],
      [
        "field_team",
        "Second rider: optionally ask about cattle-first authority, or ride alone.",
        ["talk", ALLY.contact, "June Pike"],
      ],
    ]);
    expect(compact).not.toHaveProperty("departure_recap");
    expect(compact).not.toHaveProperty("departure_interactions");
    expect(compact).not.toHaveProperty("departure_contact_leads");
    const compactQuest = compact.quests?.find(([questId]) => questId === WOLF.id);
    const compactRouteSummaries = compactQuest?.[3]?.[2].map((option) => option[13]);
    const routeOnlySummaries = fullRouteSummaries.map(
      (summary) => wolfHillRouteTradeoffParts(summary).routeSummary,
    );
    expect(compactRouteSummaries).toEqual(routeOnlySummaries);
    expect(routeOnlySummaries).toEqual([
      "Open crest: 30m, 1 supply, fatigue +25; cattle alarm starts at 1; clear sight of the byre and weather. No plan is chosen. Cade discloses the ground for tonight before commitment.",
      "Sheltered lee: 75m, 2 supplies, fatigue +10; cattle alarm starts at 0; hedges conceal the byre and weather. No plan is chosen. Cade discloses the ground for tonight before commitment.",
    ]);
    for (let index = 0; index < fullRouteSummaries.length; index += 1) {
      expect(fullRouteSummaries[index]).toBe(
        `${sharedDispatchStatus} ${routeOnlySummaries[index]}`,
      );
    }
    const composedCompactStation = JSON.stringify({
      quests: compact.quests,
      quest_starts: compact.quest_starts,
      station_dispatch_board: compact.station_dispatch_board,
    });
    expect(composedCompactStation.split(sharedDispatchStatus!).length - 1).toBe(1);

    // Frozen first-contact accounting, all in UTF-8 bytes. The V1 pure reveal
    // contract tightens its catalogue and prompt without changing board V6.
    const promptBytes = readFileSync("blind-tester/prompt-overworld.md").byteLength;
    const pureCatalogBytes = 16_773;
    const freshContextBytes = Buffer.byteLength(
      JSON.stringify(new OverworldSession(WORLD).compactView()),
      "utf8",
    );
    const stationContextBytes = Buffer.byteLength(JSON.stringify(compact), "utf8");
    expect(promptBytes).toBe(15_720);
    expect(promptBytes + pureCatalogBytes + freshContextBytes).toBe(34_535);
    expect(34_535).toBeLessThanOrEqual(34_868);
    const firstStationAggregate =
      promptBytes +
      pureCatalogBytes +
      stationContextBytes +
      Buffer.byteLength(OVERWORLD_COMPACT_LEGEND.station_dispatch_board, "utf8");
    expect(firstStationAggregate).toBe(38_155);
    expect(firstStationAggregate).toBeLessThanOrEqual(38_495);

    const fallback = compactOverworldView({ ...view, stationDispatchBoard: null });
    expect(fallback.departure_interactions).toEqual([
      [PREPARATION.id, "preparation", "Field kit"],
      [RELIEF_ALLOCATION.id, "relief_allocation", "Relief wagon"],
    ]);
    expect(fallback.departure_contact_leads?.[0]?.[2]).toBe("Second rider");
    const fallbackQuest = fallback.quests?.find(([questId]) => questId === WOLF.id);
    expect(fallbackQuest?.[3]?.[2].map((option) => option[13])).toEqual(fullRouteSummaries);

    const clonedReveal = cloneOverworldCompactView(compact).station_dispatch_board?.[5];
    if (!clonedReveal) throw new Error("Expected a cloned support reveal.");
    (clonedReveal as [string, string])[1] = "Forged label";
    expect(compact.station_dispatch_board?.[5]?.[1]).toBe(
      "Optional support: kits use Repair, Streetwise, or Mediation; plus Albany's last relief wagon or a cattle-first second rider. Review only if one interests you.",
    );

    expect(session.snapshot()).toEqual(before);
    expect(session.snapshotHash()).toBe(beforeHash);
    expect(session.journey().acceptedDecisions).toBe(beforeDecisions);
  });

  it("names all eight remaining-support subsets before review", () => {
    type SupportSlot = "preparation" | "relief_allocation" | "field_team";
    const cases: readonly {
      selected: readonly SupportSlot[];
      openMask: number;
      overview: string | null;
    }[] = [
      {
        selected: [],
        openMask: 7,
        overview:
          "Optional support: kits use Repair, Streetwise, or Mediation; plus Albany's last relief wagon or a cattle-first second rider. Review only if one interests you.",
      },
      {
        selected: ["preparation"],
        openMask: 6,
        overview:
          "Optional support: Albany's last relief wagon or a cattle-first second rider. Review only if one interests you.",
      },
      {
        selected: ["relief_allocation"],
        openMask: 5,
        overview:
          "Optional support: kits use Repair, Streetwise, or Mediation; plus a cattle-first second rider. Review only if one interests you.",
      },
      {
        selected: ["field_team"],
        openMask: 3,
        overview:
          "Optional support: kits use Repair, Streetwise, or Mediation; plus Albany's last relief wagon. Review only if one interests you.",
      },
      {
        selected: ["preparation", "relief_allocation"],
        openMask: 4,
        overview:
          "Optional support: a cattle-first second rider. Review only if one interests you.",
      },
      {
        selected: ["preparation", "field_team"],
        openMask: 2,
        overview: "Optional support: Albany's last relief wagon. Review only if one interests you.",
      },
      {
        selected: ["relief_allocation", "field_team"],
        openMask: 1,
        overview:
          "Optional support: kits use Repair, Streetwise, or Mediation. Review only if one interests you.",
      },
      {
        selected: ["preparation", "relief_allocation", "field_team"],
        openMask: 0,
        overview: null,
      },
    ];
    const frozenV5RowBytes: Readonly<Record<number, number>> = Object.freeze({
      0: 395,
      1: 470,
      2: 485,
      3: 560,
      4: 495,
      5: 570,
      6: 585,
      7: 660,
    });
    expect(PREPARATION.profiles.map((profile) => profile.check_disclosure?.skill_label)).toEqual([
      "Repair",
      "Streetwise",
      "Mediation",
    ]);

    for (const testCase of cases) {
      const session = stationedSession();
      if (testCase.selected.includes("preparation")) {
        session.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
      }
      if (testCase.selected.includes("relief_allocation")) {
        session.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
      }
      if (testCase.selected.includes("field_team")) {
        session.talkToCharacter(ALLY.contact);
        session.chooseJourneyStory(ALLY.options[0]!.id);
      }
      const board = session.compactView().station_dispatch_board;
      expect(board?.[0]).toBe(6);
      expect(board?.[3]?.[3]).toBe(3 - testCase.selected.length);
      expect(board?.[5]).toEqual(
        testCase.overview ? [STATION_DISPATCH_SUPPORT_REVEAL_ID, testCase.overview] : null,
      );
      if (board?.[5]) expect(board[5][1].length).toBeLessThanOrEqual(160);
      expect(board?.[4].map(([slot]) => slot)).toEqual([
        "role",
        "duty",
        "evidence",
        ...(["preparation", "relief_allocation", "field_team"] as const).filter((slot) =>
          testCase.selected.includes(slot),
        ),
      ]);
      expect(board?.[4].every((row) => row[3] === null && row[4] === null)).toBe(true);
      const hiddenBoard = JSON.stringify(board);
      expect(hiddenBoard).not.toContain(PREPARATION.id);
      expect(hiddenBoard).not.toContain(RELIEF_ALLOCATION.id);
      expect(hiddenBoard).not.toContain(ALLY.contact);

      if (testCase.openMask === 0) {
        expect(Buffer.byteLength(JSON.stringify(board?.[4]), "utf8")).toBe(frozenV5RowBytes[0]);
        const sealedSnapshot = session.snapshot();
        const sealedHash = session.snapshotHash();
        const sealedDecisions = session.journey().acceptedDecisions;
        expect(() =>
          session.revealStationDispatchSupport(STATION_DISPATCH_SUPPORT_REVEAL_ID),
        ).toThrow(/already sealed/u);
        expect(session.snapshot()).toEqual(sealedSnapshot);
        expect(session.snapshotHash()).toBe(sealedHash);
        expect(session.journey().acceptedDecisions).toBe(sealedDecisions);
        continue;
      }
      session.revealStationDispatchSupport(STATION_DISPATCH_SUPPORT_REVEAL_ID);
      const revealedRows = session.compactView().station_dispatch_board?.[4];
      const supportRows = [
        testCase.selected.includes("preparation")
          ? ["preparation", "selected", PREPARATION.profiles[0]!.title, null, null]
          : [
              "preparation",
              "open_optional",
              null,
              "Optional kit: compare without choosing; covers one named danger.",
              ["inspect", PREPARATION.id],
            ],
        testCase.selected.includes("relief_allocation")
          ? ["relief_allocation", "selected", RELIEF_ALLOCATION.options[0]!.title, null, null]
          : [
              "relief_allocation",
              "open_optional",
              null,
              "Optional wagon: compare without choosing; send Albany's last to one crisis.",
              ["inspect", RELIEF_ALLOCATION.id],
            ],
        testCase.selected.includes("field_team")
          ? ["field_team", "selected", ALLY.options[0]!.title, null, null]
          : [
              "field_team",
              "open_optional",
              null,
              "Optional rider: ask June before choosing; one cattle line, never combat.",
              ["talk", ALLY.contact, "June Pike"],
            ],
      ];
      expect(revealedRows).toEqual([
        ["role", "selected", REGISTRATION.profiles[0]!.title, null, null],
        [
          "duty",
          "selected",
          RELIEF_OATH.options[0]!.title.replace(/\bDuty\b/gu, "Promise"),
          null,
          null,
        ],
        ["evidence", "selected", LEAD_SOURCE.options[0]!.title, null, null],
        ...supportRows,
      ]);
      expect(Buffer.byteLength(JSON.stringify(revealedRows), "utf8")).toBe(
        frozenV5RowBytes[testCase.openMask],
      );
      expect(session.compactView().station_dispatch_board?.[5]).toBeNull();
    }
  });

  it("reveals exact V5 support-row bytes, removes handles as rows close, and re-derives V6 on restore", () => {
    const session = stationedSession();
    const row = (
      slot: "role" | "duty" | "evidence" | "preparation" | "relief_allocation" | "field_team",
    ) =>
      session.compactView().station_dispatch_board?.[4].find(([candidate]) => candidate === slot);

    for (const slot of ["role", "duty", "evidence"] as const) {
      expect(row(slot)?.slice(3)).toEqual([null, null]);
    }
    expect(row("preparation")).toBeUndefined();
    expect(row("relief_allocation")).toBeUndefined();
    expect(row("field_team")).toBeUndefined();

    session.revealStationDispatchSupport(STATION_DISPATCH_SUPPORT_REVEAL_ID);
    expect(session.compactView().station_dispatch_board?.[5]).toBeNull();
    expect(row("preparation")?.[4]).toEqual(["inspect", PREPARATION.id]);
    expect(row("relief_allocation")?.[4]).toEqual(["inspect", RELIEF_ALLOCATION.id]);
    expect(row("field_team")?.[4]).toEqual(["talk", ALLY.contact, "June Pike"]);

    session.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
    const preparedGuidance =
      "Ready to depart now with background, Wolf-Winter promise, report, and field kit set; one relief wagon or second rider remain optional and change cost or aftermath, not your Wolf-Winter approach.";
    expect(session.view().stationDispatchBoard?.guidance).toBe(preparedGuidance);
    expect(session.compactView().station_dispatch_board?.[2]).toMatch(
      new RegExp(
        `^Set: background, promise, report\\. Dispatch ${String(session.view().stationDispatchBoard?.dispatch?.minutes)}m;`,
        "u",
      ),
    );
    expect(session.compactView().station_dispatch_board?.[3]?.[3]).toBe(2);
    expect(JSON.stringify(session.compactView().station_dispatch_board).length).toBeLessThanOrEqual(
      1_000,
    );
    expect(row("preparation")).toEqual([
      "preparation",
      "selected",
      PREPARATION.profiles[0]!.title,
      null,
      null,
    ]);
    expect(row("relief_allocation")?.[4]).toEqual(["inspect", RELIEF_ALLOCATION.id]);
    expect(row("field_team")?.[4]).toEqual(["talk", ALLY.contact, "June Pike"]);

    session.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
    expect(row("relief_allocation")).toEqual([
      "relief_allocation",
      "selected",
      RELIEF_ALLOCATION.options[0]!.title,
      null,
      null,
    ]);
    expect(row("field_team")?.[4]).toEqual(["talk", ALLY.contact, "June Pike"]);
    const riderOnlyGuidance =
      "Ready to depart now with background, Wolf-Winter promise, report, field kit, and relief wagon set; second rider remains optional and changes cost or aftermath, not your Wolf-Winter approach.";
    expect(session.view().stationDispatchBoard?.guidance).toBe(riderOnlyGuidance);
    expect(session.compactView().station_dispatch_board?.[3]?.[3]).toBe(1);

    session.talkToCharacter(ALLY.contact);
    session.chooseJourneyStory(ALLY.options[0]!.id);
    expect(row("field_team")).toEqual([
      "field_team",
      "selected",
      ALLY.options[0]!.title,
      null,
      null,
    ]);
    expect(
      session.compactView().station_dispatch_board?.[4].filter((entry) => entry[4] !== null),
    ).toEqual([]);
    const fullySetGuidance =
      "Ready to depart now with background, Wolf-Winter promise, report, field kit, relief wagon, and riding choice set; no optional support remains.";
    expect(session.view().stationDispatchBoard?.guidance).toBe(fullySetGuidance);
    expect(session.compactView().station_dispatch_board?.[2]).toMatch(/^Dispatch \d+m—on time;/u);
    expect(session.compactView().station_dispatch_board?.[3]?.[3]).toBe(0);
    expect(session.compactView().station_dispatch_board?.[5]).toBeNull();
    expect(session.snapshot().stationDispatchSupportReveals).toBeUndefined();
    expect(JSON.stringify(session.compactView().station_dispatch_board).length).toBeLessThanOrEqual(
      1_000,
    );
    expect(
      session.view().stationDispatchBoard?.plan.filter((entry) => entry.status === "open_optional"),
    ).toEqual([]);

    const snapshot = session.snapshot();
    const restored = OverworldSession.restore(WORLD, snapshot);
    expect(restored.compactView().station_dispatch_board).toEqual(
      session.compactView().station_dispatch_board,
    );
    expect(restored.compactView().station_dispatch_board?.[0]).toBe(6);
    expect(restored.snapshot()).toEqual(snapshot);
  });

  it("keeps solo and refused-relay selections truthful in full and compact guidance", () => {
    for (const optionId of ["albany:ally_june_relay_only", ALLY.solo_option_id]) {
      const session = stationedSession();
      session.talkToCharacter(ALLY.contact);
      session.chooseJourneyStory(optionId);
      const guidance =
        "Ready to depart now with background, Wolf-Winter promise, report, and riding choice set; field kit or one relief wagon remain optional and change cost or aftermath, not your Wolf-Winter approach.";

      expect(session.view().stationDispatchBoard?.guidance).toBe(guidance);
      expect(session.compactView().station_dispatch_board?.[2]).toMatch(
        new RegExp(
          `^Set: background, promise, report\\. Dispatch ${String(session.view().stationDispatchBoard?.dispatch?.minutes)}m;`,
          "u",
        ),
      );
      expect(
        session.compactView().station_dispatch_board?.[4].find(([slot]) => slot === "field_team"),
      ).toEqual(["field_team", "selected", expect.any(String), null, null]);
      expect(session.compactView().station_dispatch_board?.[3]?.[3]).toBe(2);
      expect(session.view().stationDispatchBoard?.guidance).not.toContain(
        "background, Wolf-Winter promise, report, and second rider set",
      );
    }
  });

  it("persists one exact read-only disclosure receipt across refresh and restore", () => {
    const session = stationedSession();
    const beforeSnapshot = session.snapshot();
    const beforeHash = session.snapshotHash();
    const beforeDecisions = session.journey().acceptedDecisions;
    const board = session.view().stationDispatchBoard;
    const quest = session.view().quests.find((candidate) => candidate.id === WOLF.id);
    if (!board || !quest?.launch) throw new Error("Expected the Station launch projection.");
    const sharedDispatchStatus = sharedWolfHillRouteDispatchStatus(
      quest.launch.options.flatMap((option) =>
        option.tradeoffSummary ? [option.tradeoffSummary] : [],
      ),
    );

    expect(() => session.revealStationDispatchSupport("forged:reveal")).toThrow(
      /Unknown Station optional-support reveal/u,
    );
    expect(session.snapshot()).toEqual(beforeSnapshot);
    expect(session.snapshotHash()).toBe(beforeHash);

    session.revealStationDispatchSupport(STATION_DISPATCH_SUPPORT_REVEAL_ID);
    const revealedSnapshot = session.snapshot();
    const revealedHash = session.snapshotHash();
    expect(revealedSnapshot.stationDispatchSupportReveals).toEqual([
      [WOLF.id, STATION_DISPATCH_SUPPORT_REVEAL_ID],
    ]);
    expect(revealedHash).not.toBe(beforeHash);
    expect(session.journey().acceptedDecisions).toBe(beforeDecisions);
    const { stationDispatchSupportReveals: _receipt, ...revealedGameplay } = revealedSnapshot;
    expect(revealedGameplay).toEqual(beforeSnapshot);

    const postReveal = session.compactView().station_dispatch_board;
    expect(postReveal?.[4]).toEqual(
      compactStationDispatchBoard(board, true, sharedDispatchStatus ?? undefined)[4],
    );
    expect(postReveal?.[4].slice(3)).toEqual([
      [
        "preparation",
        "open_optional",
        null,
        "Optional kit: compare without choosing; covers one named danger.",
        ["inspect", PREPARATION.id],
      ],
      [
        "relief_allocation",
        "open_optional",
        null,
        "Optional wagon: compare without choosing; send Albany's last to one crisis.",
        ["inspect", RELIEF_ALLOCATION.id],
      ],
      [
        "field_team",
        "open_optional",
        null,
        "Optional rider: ask June before choosing; one cattle line, never combat.",
        ["talk", ALLY.contact, "June Pike"],
      ],
    ]);
    expect(postReveal?.[5]).toBeNull();

    session.revealStationDispatchSupport(STATION_DISPATCH_SUPPORT_REVEAL_ID);
    expect(session.snapshot()).toEqual(revealedSnapshot);
    expect(session.snapshotHash()).toBe(revealedHash);
    expect(session.compactView().station_dispatch_board).toEqual(postReveal);
    expect(() => session.revealStationDispatchSupport("forged:after-review")).toThrow(
      /Unknown Station optional-support reveal/u,
    );
    expect(session.snapshotHash()).toBe(revealedHash);

    const restored = OverworldSession.restore(WORLD, revealedSnapshot);
    expect(restored.snapshotHash()).toBe(revealedHash);
    expect(restored.compactView().station_dispatch_board).toEqual(postReveal);

    const civicExit = session
      .view()
      .areaExits.find((candidate) => candidate.destination.id === "albany_city__civic_core");
    if (!civicExit) throw new Error("Expected the route away from Station.");
    session.moveArea(civicExit.id);
    const awaySnapshot = session.snapshot();
    const restoredAway = OverworldSession.restore(WORLD, awaySnapshot);
    expect(restoredAway.snapshot()).toEqual(awaySnapshot);
    expect(restoredAway.compactView().station_dispatch_board).toBeUndefined();
    const stationReturn = restoredAway
      .view()
      .areaExits.find((candidate) => candidate.destination.id === PREPARATION.area);
    if (!stationReturn) throw new Error("Expected the return route to Station.");
    restoredAway.moveArea(stationReturn.id);
    expect(restoredAway.compactView().station_dispatch_board).toEqual(postReveal);

    const forgedSnapshot = structuredClone(revealedSnapshot);
    forgedSnapshot.stationDispatchSupportReveals = [[WOLF.id, "forged:receipt"]];
    expect(() => OverworldSession.restore(WORLD, forgedSnapshot)).toThrow(
      /must match its exact open dispatch/u,
    );
  });

  it("keeps full route briefings when either compact builder lacks exact Station consensus", () => {
    const session = stationedSession();
    const view = session.view();
    const quest = view.quests.find((candidate) => candidate.id === WOLF.id);
    if (!quest?.launch || !view.stationDispatchBoard) {
      throw new Error("Expected the complete Station launch projection.");
    }
    const fullSummaries = quest.launch.options.map((option) => option.tradeoffSummary!);
    const parts = fullSummaries.map(wolfHillRouteTradeoffParts);
    const mismatchedQuests = view.quests.map((candidate) =>
      candidate.id === WOLF.id && candidate.launch
        ? {
            ...candidate,
            launch: {
              ...candidate.launch,
              options: candidate.launch.options.map((option, index) =>
                index === 1
                  ? {
                      ...option,
                      tradeoffSummary: `Dispatch mismatch. ${parts[index]!.routeSummary}`,
                    }
                  : option,
              ),
            },
          }
        : candidate,
    );
    const missingQuests = view.quests.map((candidate) =>
      candidate.id === WOLF.id && candidate.launch
        ? {
            ...candidate,
            launch: {
              ...candidate.launch,
              options: candidate.launch.options.map((option, index) => {
                if (index !== 1) return option;
                const { tradeoffSummary: _tradeoffSummary, ...withoutTradeoffSummary } = option;
                return withoutTradeoffSummary;
              }),
            },
          }
        : candidate,
    );
    const summaries = (compact: ReturnType<OverworldSession["compactView"]>) =>
      compact.quests
        ?.find(([questId]) => questId === WOLF.id)?.[3]?.[2]
        .map((option) => option[13]);

    const genericNoBoard = compactOverworldView({ ...view, stationDispatchBoard: null });
    expect(summaries(genericNoBoard)).toEqual(fullSummaries);
    for (const alteredQuests of [mismatchedQuests, missingQuests]) {
      const generic = compactOverworldView({ ...view, quests: alteredQuests });
      expect(generic.station_dispatch_board?.[2]).toBe(
        "Dispatch 10m committed; ready to depart now.",
      );
      expect(summaries(generic)).toEqual(
        alteredQuests
          .find((candidate) => candidate.id === WOLF.id)!
          .launch!.options.map((option) =>
            "tradeoffSummary" in option ? (option.tradeoffSummary ?? null) : null,
          ),
      );
    }

    type ViewStateProbe = {
      viewModelSourceState(): OverworldSessionViewModelSourceState;
    };
    const source = (session as unknown as ViewStateProbe).viewModelSourceState();
    const state = buildOverworldSessionViewModelState(source);
    const sessionNoBoard = buildOverworldSessionCompactViewFromState({
      ...state,
      stationDispatchBoard: null,
    });
    expect(summaries(sessionNoBoard)).toEqual(fullSummaries);
    for (const alteredQuests of [mismatchedQuests, missingQuests]) {
      const sessionCompact = buildOverworldSessionCompactViewFromState({
        ...state,
        localView: { ...state.localView, quests: alteredQuests },
      });
      expect(sessionCompact.station_dispatch_board?.[2]).toBe(
        "Dispatch 10m committed; ready to depart now.",
      );
      expect(summaries(sessionCompact)).toEqual(
        alteredQuests
          .find((candidate) => candidate.id === WOLF.id)!
          .launch!.options.map((option) =>
            "tradeoffSummary" in option ? (option.tradeoffSummary ?? null) : null,
          ),
      );
    }
  });

  it("clears the disclosure receipt on launch and preserves every deep launch receipt", () => {
    const unrevealed = stationedSession();
    const revealed = stationedSession();
    revealed.revealStationDispatchSupport(STATION_DISPATCH_SUPPORT_REVEAL_ID);
    const questStart = unrevealed.view().questStarts.find(([questId]) => questId === WOLF.id);
    if (!questStart?.[1]) throw new Error("Expected a legal Wolf-Winter road.");

    const controlLaunch = unrevealed.startQuest(questStart[0], questStart[1]);
    const revealedLaunch = revealed.startQuest(questStart[0], questStart[1]);
    expect(revealedLaunch).toEqual(controlLaunch);
    expect(revealed.snapshot()).toEqual(unrevealed.snapshot());
    expect(revealed.snapshot().stationDispatchSupportReveals).toBeUndefined();
    expect(OverworldSession.restore(WORLD, revealed.snapshot()).snapshot()).toEqual(
      revealed.snapshot(),
    );
    const forgedStarted = structuredClone(revealed.snapshot());
    forgedStarted.stationDispatchSupportReveals = [[WOLF.id, STATION_DISPATCH_SUPPORT_REVEAL_ID]];
    expect(() => OverworldSession.restore(WORLD, forgedStarted)).toThrow(
      /must match its exact open dispatch/u,
    );
  });

  it("restores an awaiting-choice receipt and clears it before an ended save", () => {
    const session = stationedSession();
    session.revealStationDispatchSupport(STATION_DISPATCH_SUPPORT_REVEAL_ID);
    while (session.journey().pendingChoice === null) {
      const view = session.view();
      if (view.pendingRoadEncounter) session.resolveRoadEncounter("press_on");
      else session.travel(view.exits[0]!.id);
    }
    expect(session.journey().status).toBe("awaiting_choice");
    const awaitingSnapshot = session.snapshot();
    expect(awaitingSnapshot.stationDispatchSupportReveals).toEqual([
      [WOLF.id, STATION_DISPATCH_SUPPORT_REVEAL_ID],
    ]);
    const restoredAwaiting = OverworldSession.restore(WORLD, awaitingSnapshot);
    expect(restoredAwaiting.snapshot()).toEqual(awaitingSnapshot);

    restoredAwaiting.chooseJourney("end");
    const endedSnapshot = restoredAwaiting.snapshot();
    expect(endedSnapshot.stationDispatchSupportReveals).toBeUndefined();
    expect(OverworldSession.restore(WORLD, endedSnapshot).snapshot()).toEqual(endedSnapshot);
    const forgedEnded = structuredClone(endedSnapshot);
    forgedEnded.stationDispatchSupportReveals = [[WOLF.id, STATION_DISPATCH_SUPPORT_REVEAL_ID]];
    expect(() => OverworldSession.restore(WORLD, forgedEnded)).toThrow(
      /must match its exact open dispatch/u,
    );
  });

  it("withholds malformed pairings and does not leak unselected support alternatives", () => {
    const session = stationedSession();
    const view = session.view();
    const recap = view.departureRecap;
    if (!recap) throw new Error("Expected Station recap.");
    const fieldLead = view.departureContactLeads[0];
    if (!fieldLead) throw new Error("Expected the Station field-team lead.");
    const board = view.stationDispatchBoard;
    if (!board?.dispatch) throw new Error("Expected the Station dispatch state.");
    for (const remainingOptional of [
      ["field_team", "relief_allocation", "preparation"],
      ["preparation", "relief_allocation", "preparation"],
    ] as const) {
      expect(() =>
        compactStationDispatchBoard({
          ...board,
          dispatch: { ...board.dispatch!, remainingOptional },
        }),
      ).toThrow(/optional support set is inconsistent/u);
    }
    expect(
      deriveStationDispatchBoard({
        recap,
        quests: [],
        questStarts: view.questStarts,
        departureInteractions: view.departureInteractions,
        departureContactLeads: view.departureContactLeads,
      }),
    ).toBeNull();
    expect(
      deriveStationDispatchBoard({
        recap,
        quests: view.quests,
        questStarts: [[WOLF.id, "forged:road"]],
        departureInteractions: view.departureInteractions,
        departureContactLeads: view.departureContactLeads,
      }),
    ).toBeNull();
    expect(
      deriveStationDispatchBoard({
        recap,
        quests: view.quests.map((quest) =>
          quest.id === WOLF.id ? { ...quest, title: "Forged quest title" } : quest,
        ),
        questStarts: view.questStarts,
        departureInteractions: view.departureInteractions,
        departureContactLeads: view.departureContactLeads,
      }),
    ).toBeNull();
    expect(
      deriveStationDispatchBoard({
        recap,
        quests: view.quests,
        questStarts: view.questStarts,
        departureInteractions: view.departureInteractions,
        departureContactLeads: [
          ...view.departureContactLeads,
          { ...fieldLead, id: `${fieldLead.id}:duplicate` },
        ],
      }),
    ).toBeNull();
    expect(
      deriveStationDispatchBoard({
        recap: {
          ...recap,
          entries: recap.entries.filter((entry) => entry.slot !== "duty"),
        },
        quests: view.quests,
        questStarts: view.questStarts,
        departureInteractions: view.departureInteractions,
        departureContactLeads: view.departureContactLeads,
      }),
    ).toBeNull();
    expect(
      deriveStationDispatchBoard({
        recap: {
          ...recap,
          entries: [...recap.entries, recap.entries[0]!],
        },
        quests: view.quests,
        questStarts: view.questStarts,
        departureInteractions: view.departureInteractions,
        departureContactLeads: view.departureContactLeads,
      }),
    ).toBeNull();
    expect(
      deriveStationDispatchBoard({
        recap: {
          ...recap,
          entries: recap.entries.map((entry) =>
            ["role", "duty", "evidence"].includes(entry.slot)
              ? { ...entry, status: "open_optional" as const, title: null }
              : entry,
          ),
        },
        quests: view.quests,
        questStarts: view.questStarts,
        departureInteractions: view.departureInteractions,
        departureContactLeads: view.departureContactLeads,
      }),
    ).toBeNull();
    expect(
      deriveStationDispatchBoard({
        recap: {
          ...recap,
          entries: recap.entries.map((entry) =>
            entry.slot === "preparation"
              ? { ...entry, status: "open_optional", title: "forged selected kit" }
              : entry,
          ),
        },
        quests: view.quests,
        questStarts: view.questStarts,
        departureInteractions: view.departureInteractions,
        departureContactLeads: view.departureContactLeads,
      }),
    ).toBeNull();

    const waiting = deriveStationDispatchBoard({
      recap,
      quests: view.quests,
      questStarts: [],
      departureInteractions: view.departureInteractions,
      departureContactLeads: view.departureContactLeads,
    });
    expect(waiting?.launch.approaches.every((approach) => !approach.availableNow)).toBe(true);
    expect(waiting?.guidance).toBe(
      "No road is open with background, Wolf-Winter promise, and report set; field kit, one relief wagon, or second rider remain optional and change cost or aftermath, not your approach.",
    );
    expect(waiting?.guidance.length).toBeLessThanOrEqual(
      STATION_DISPATCH_BOARD_GUIDANCE_CHAR_LIMIT,
    );
    expect(waiting?.guidance).not.toContain("You can leave now");
    expect(fieldLead).toMatchObject({ status: "ready" });
    expect(fieldLead.guidance).not.toContain("choose a field kit first");

    expect(
      deriveStationDispatchBoard({
        recap,
        quests: view.quests,
        questStarts: view.questStarts,
        departureInteractions: view.departureInteractions.slice(1),
        departureContactLeads: view.departureContactLeads,
      }),
    ).toBeNull();
    expect(
      deriveStationDispatchBoard({
        recap,
        quests: view.quests,
        questStarts: view.questStarts,
        departureInteractions: [
          ...view.departureInteractions,
          { ...view.departureInteractions[0]!, id: "forged:duplicate" },
        ],
        departureContactLeads: view.departureContactLeads,
      }),
    ).toBeNull();

    const visible = JSON.stringify(view.stationDispatchBoard);
    for (const alternative of [
      ...PREPARATION.profiles,
      ...RELIEF_ALLOCATION.options,
      ...ALLY.options,
    ]) {
      expect(visible).not.toContain(alternative.title);
      if ("preview" in alternative) expect(visible).not.toContain(alternative.preview);
      if ("consequence" in alternative) expect(visible).not.toContain(alternative.consequence);
      if ("tradeoff" in alternative) expect(visible).not.toContain(alternative.tradeoff);
    }
  });
});
