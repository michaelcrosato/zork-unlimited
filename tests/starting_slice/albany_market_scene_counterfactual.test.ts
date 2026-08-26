/**
 * Depth Contract #11: Jamie Tanner's post-Wolf Market policy is a real
 * irreversible choice whose later crate settlement exposes the clock/standing
 * counterfactual without creating a recovery coupon.
 */
import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGION = "Capital / Mohawk";
const EVENT = "albany_city__market__event";
const EVENT_SCENE = "albany:winter-price-policy";
const JOB = "albany_city__market__job";
const JOB_SCENE = "albany:disputed-winter-crates";
const AREA = "albany_city__market";
const POI = "albany_city__market__poi";
const CONTACT = "albany_city__market__contact";
const HOLD = "hold_household_kitchen_prices";
const BID = "publish_open_bid_ceiling";
const HOLD_FAST = "release_price_hold_operational";
const HOLD_AUDIT = "audit_price_hold_household_chain";
const BID_FAST = "release_open_bid_operational";
const BID_AUDIT = "audit_open_bid_public_chain";
const CIVIC_COT = "albany:works_public_shift_civic_rest";
const FULL = { compact_context: false, compact_result: false } as const;

function moveToArea(session: OverworldSession, target: string, world = WORLD): void {
  const start = session.view().currentArea?.id;
  if (!start || start === target) return;
  const edges = world.area_edges.filter((edge) => edge.home === session.view().current.id);
  const previous = new Map<string, string>();
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    for (const edge of edges.filter(
      (candidate) => candidate.from_area === current || candidate.to_area === current,
    )) {
      const next = edge.from_area === current ? edge.to_area : edge.from_area;
      if (next === start || previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  const path: string[] = [];
  for (let cursor = target; cursor !== start; ) {
    const prior = previous.get(cursor);
    if (!prior) throw new Error(`No Albany route reaches ${target}.`);
    path.unshift(cursor);
    cursor = prior;
  }
  for (const area of path) {
    const exit = session.view().areaExits.find((candidate) => candidate.destination.id === area);
    if (!exit) throw new Error(`Missing visible Albany exit to ${area}.`);
    session.moveArea(exit.id);
  }
}

function readyForWolf(world = WORLD): {
  session: OverworldSession;
  wolf: { id: string; area: string };
} {
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(world.opening_registration!.contact);
  session.chooseJourneyStory("albany:ledger_advocate");
  revealCurrentJourneyStoryOptions(session, world.opening_relief_oath!.id);
  session.chooseJourneyStory("albany:oath_full_compact_duty");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  moveToArea(session, world.opening_preparation!.area, world);
  session.chooseJourneyStory("albany:prep_works_fortification");
  if (session.view().departureInteractions[0]?.kind === "relief_allocation") {
    session.chooseJourneyStory("albany:relief_cade_fodder");
  }
  const wolf = session.view().quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf) throw new Error("Wolf-Winter must be visible after the Albany opening.");
  return { session, wolf };
}

function returnedToMarket(world = WORLD): OverworldSession {
  const { session, wolf } = readyForWolf(world);
  moveToArea(session, wolf.area, world);
  session.startQuest(wolf.id, "albany:wolf_approach_sheltered_stockway");
  session.completeQuest(wolf.id, {
    endingId: "ending_held",
    endingTitle: "The Byre Held",
    death: false,
  });
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wardens_north");
  moveToArea(session, AREA, world);
  session.scoutPoi(POI);
  session.talkToCharacter(CONTACT);
  return session;
}

function resolvedMarket(policy: string, world = WORLD): OverworldSession {
  const session = returnedToMarket(world);
  session.investigateEvent(EVENT);
  session.resolveEvent(EVENT, policy);
  return session;
}

describe("Depth Contract #11 — Jamie Tanner's Market policy and disputed crates", () => {
  it("keeps the post-Wolf event and job optional, hidden before Wolf-Winter, and anchored to stable ids", () => {
    const { session } = readyForWolf();
    moveToArea(session, AREA);
    session.scoutPoi(POI);
    session.talkToCharacter(CONTACT);
    expect(session.view().events.map((event) => event.id)).not.toContain(EVENT);
    expect(session.view().jobs.map((job) => job.id)).not.toContain(JOB);
    expect(() => session.investigateEvent(EVENT)).toThrow(
      /Complete wolf_winter before choosing this event option/i,
    );
    expect(() => session.workLocalJob(JOB, HOLD_FAST)).toThrow(/Complete quest "wolf_winter"/i);

    const returned = returnedToMarket();
    expect(returned.snapshot().completedQuestIds).toContain("wolf_winter");
    expect(returned.view().events.map((event) => event.id)).toContain(EVENT);
    expect(returned.view().jobs.map((job) => job.id)).not.toContain(JOB);
    expect(returned.view().events.find((event) => event.id === EVENT)?.authored_scene?.id).toBe(
      EVENT_SCENE,
    );
  });

  it("projects exact policy-bound options on full, compact, UI, and MCP surfaces", () => {
    const session = returnedToMarket();
    session.investigateEvent(EVENT);
    expect(session.view().eventChoices).toEqual([
      [EVENT, HOLD],
      [EVENT, BID],
    ]);
    expect(session.compactView().event_choices).toEqual(session.view().eventChoices);
    const eventScene = session.compactView().event_scenes?.find(([eventId]) => eventId === EVENT);
    expect(eventScene?.slice(0, 6)).toEqual([
      EVENT,
      EVENT_SCENE,
      expect.any(String),
      POI,
      CONTACT,
      ["wolf_winter"],
    ]);
    const api = createToolApi({ root: process.cwd() });
    const restored = api.restore_overworld_session({
      compact_context: true,
      snapshot: session.snapshot(),
    });
    expect(restored.context.event_choices).toEqual(session.compactView().event_choices);
    const eventResult = api.resolve_overworld_session_event({
      ...FULL,
      session_id: restored.session_id,
      event_id: EVENT,
      option_id: HOLD,
    });
    expect(eventResult.result.minutes).toBe(35);
    expect(eventResult.observation.eventChoices).toEqual([]);
    expect(eventResult.observation.jobChoices).toEqual([
      [JOB, HOLD_FAST],
      [JOB, HOLD_AUDIT],
    ]);
    const mcpWorked = api.work_overworld_session_job({
      ...FULL,
      session_id: restored.session_id,
      job_id: JOB,
      option_id: HOLD_FAST,
    });
    expect(mcpWorked.result).toMatchObject({ minutes: 30, alreadyKnown: false });

    session.resolveEvent(EVENT, HOLD);
    expect(session.view().jobChoices).toEqual([
      [JOB, HOLD_FAST],
      [JOB, HOLD_AUDIT],
    ]);
    expect(session.compactView().job_choices).toEqual(session.view().jobChoices);
    const compactJobScene = session.compactView().job_scenes?.find(([jobId]) => jobId === JOB);
    expect(compactJobScene?.[6].map(([optionId]) => optionId)).toEqual([HOLD_FAST, HOLD_AUDIT]);
    expect(
      session
        .view()
        .jobs.find((job) => job.id === JOB)
        ?.authored_scene?.options.map((option) => [
          option.id,
          option.terms.minutes,
          option.terms.renown,
        ]),
    ).toEqual([
      [HOLD_FAST, 30, 3],
      [HOLD_AUDIT, 75, 5],
    ]);
    const holdOptions = JSON.stringify(
      session.view().jobs.find((job) => job.id === JOB)?.authored_scene?.options,
    );
    expect(holdOptions).not.toContain(BID_FAST);
    expect(holdOptions).not.toContain(BID_AUDIT);
    expect(holdOptions).not.toContain("Release the open-bid crates from the visible buyer board");
    expect(holdOptions).not.toContain("Audit the open-bid public chain");
    expect(holdOptions).not.toContain("Earn 1 Capital / Mohawk renown");
    expect(holdOptions).not.toContain("Earn 4 Capital / Mohawk renown");
    expect(UiOverworldSession.restore(WORLD, session.snapshot()).view().jobChoices).toEqual(
      session.view().jobChoices,
    );
  });

  it.each([
    [
      HOLD,
      HOLD_FAST,
      30,
      3,
      HOLD_AUDIT,
      75,
      5,
      BID_FAST,
      "Release the open-bid crates from the visible buyer board",
      1,
      BID_AUDIT,
      "Audit the open-bid public chain",
      4,
    ],
    [
      BID,
      BID_FAST,
      20,
      1,
      BID_AUDIT,
      60,
      4,
      HOLD_FAST,
      "Release the price-hold crates through Jamie's kitchen ledger",
      3,
      HOLD_AUDIT,
      "Audit the price-hold household chain in public",
      5,
    ],
  ] as const)(
    "makes %s a permanent policy with only its two legal settlements",
    (
      policy,
      fast,
      fastMinutes,
      fastRenown,
      audit,
      auditMinutes,
      auditRenown,
      forbiddenFast,
      forbiddenFastTitle,
      forbiddenFastRenown,
      forbiddenAudit,
      forbiddenAuditTitle,
      forbiddenAuditRenown,
    ) => {
      const fastSession = resolvedMarket(policy);
      const auditSession = resolvedMarket(policy);
      const scene = fastSession.view().jobs.find((job) => job.id === JOB)?.authored_scene;
      expect(scene?.id).toBe(JOB_SCENE);
      expect(scene?.options.map((option) => option.id)).toEqual([fast, audit]);
      const compactScene = fastSession.compactView().job_scenes?.find(([jobId]) => jobId === JOB);
      expect(compactScene?.[6].map(([optionId]) => optionId)).toEqual([fast, audit]);
      const serializedOptions = JSON.stringify(scene?.options);
      for (const forbidden of [
        forbiddenFast,
        forbiddenAudit,
        forbiddenFastTitle,
        forbiddenAuditTitle,
        `Earn ${forbiddenFastRenown} Capital / Mohawk renown`,
        `Earn ${forbiddenAuditRenown} Capital / Mohawk renown`,
      ]) {
        expect(serializedOptions).not.toContain(forbidden);
      }
      expect(fastSession.view().jobChoices).toEqual([
        [JOB, fast],
        [JOB, audit],
      ]);
      expect(() => fastSession.workLocalJob(JOB)).toThrow(
        /Choose one option for Jamie's Disputed Crates/i,
      );
      expect(() => fastSession.workLocalJob(JOB, policy === HOLD ? BID_FAST : HOLD_FAST)).toThrow(
        /unavailable in this journey/i,
      );
      const fastBefore = fastSession.snapshot();
      const fastRenownBefore = fastSession.view().regionRenown[REGION] ?? 0;
      const fastResult = fastSession.workLocalJob(JOB, fast);
      expect(fastResult).toMatchObject({ minutes: fastMinutes, alreadyKnown: false });
      expect(fastSession.snapshot().minutes - fastBefore.minutes).toBe(fastMinutes);
      expect(fastSession.view().regionRenown[REGION]).toBe(fastRenownBefore + fastRenown);
      expect(fastResult.entry.text).toMatch(
        policy === HOLD
          ? /household|kitchen|price/i
          : /posted buyer order[^]*buyer chain is not fully audited/i,
      );
      expect(fastSession.view().jobChoices).toEqual([]);
      expect(() => fastSession.workLocalJob(JOB, audit)).toThrow(/different authored option/i);

      const auditBefore = auditSession.snapshot();
      const auditRenownBefore = auditSession.view().regionRenown[REGION] ?? 0;
      const auditResult = auditSession.workLocalJob(JOB, audit);
      expect(auditResult).toMatchObject({ minutes: auditMinutes, alreadyKnown: false });
      expect(auditSession.snapshot().minutes - auditBefore.minutes).toBe(auditMinutes);
      expect(auditSession.view().regionRenown[REGION]).toBe(auditRenownBefore + auditRenown);
    },
  );

  it("makes household standing compete with open-bid speed on both settlement depths", () => {
    const householdFast = resolvedMarket(HOLD);
    const bidFast = resolvedMarket(BID);
    expect(householdFast.view().regionRenown[REGION]).toBe(10);
    expect(bidFast.view().regionRenown[REGION]).toBe(10);
    const householdFastStart = householdFast.snapshot().minutes;
    const bidFastStart = bidFast.snapshot().minutes;
    householdFast.workLocalJob(JOB, HOLD_FAST);
    bidFast.workLocalJob(JOB, BID_FAST);
    expect(householdFast.snapshot().minutes - householdFastStart).toBe(30);
    expect(bidFast.snapshot().minutes - bidFastStart).toBe(20);
    expect(householdFast.view().regionRenown[REGION]).toBe(13);
    expect(bidFast.view().regionRenown[REGION]).toBe(11);
    moveToArea(householdFast, "albany_city__civic_core");
    moveToArea(bidFast, "albany_city__civic_core");
    expect(householdFast.view().serviceOffers.map((offer) => offer.id)).toContain(CIVIC_COT);
    expect(bidFast.view().serviceOffers.map((offer) => offer.id)).not.toContain(CIVIC_COT);

    const householdAudit = resolvedMarket(HOLD);
    const bidAudit = resolvedMarket(BID);
    const householdAuditStart = householdAudit.snapshot().minutes;
    const bidAuditStart = bidAudit.snapshot().minutes;
    householdAudit.workLocalJob(JOB, HOLD_AUDIT);
    bidAudit.workLocalJob(JOB, BID_AUDIT);
    expect(householdAudit.snapshot().minutes - householdAuditStart).toBe(75);
    expect(bidAudit.snapshot().minutes - bidAuditStart).toBe(60);
    expect(householdAudit.view().regionRenown[REGION]).toBe(15);
    expect(bidAudit.view().regionRenown[REGION]).toBe(14);
  });

  it("round-trips native proofs and rejects altered, missing, and backdated policy evidence", () => {
    const session = resolvedMarket(BID);
    session.workLocalJob(JOB, BID_AUDIT);
    const snapshot = session.snapshot();
    expect(OverworldSession.restore(WORLD, snapshot).snapshot()).toEqual(snapshot);

    const altered = structuredClone(snapshot);
    const job = altered.journalEntries.find((entry) => entry.id === `job:${JOB}`);
    if (!job?.localSceneProof) throw new Error("Expected Market job proof.");
    job.localSceneProof.optionId = HOLD_AUDIT;
    expect(() => OverworldSession.restore(WORLD, altered)).toThrow(
      /accepted decision proof|requirements/i,
    );

    const missing = structuredClone(snapshot);
    missing.journalEntries = missing.journalEntries.filter(
      (entry) => entry.id !== `resolve:${EVENT}`,
    );
    expect(() => OverworldSession.restore(WORLD, missing)).toThrow(
      /inconsistent resolution evidence|missing.*proof|violates its earlier event/i,
    );

    const backdated = structuredClone(snapshot);
    const eventIndex = backdated.journalEntries.findIndex(
      (entry) => entry.id === `resolve:${EVENT}`,
    );
    const questIndex = backdated.journalEntries.findIndex(
      (entry) => entry.id === "quest_done:wolf_winter",
    );
    if (eventIndex < 0 || questIndex < 0)
      throw new Error("Expected Market and Wolf proof entries.");
    const [entry] = backdated.journalEntries.splice(eventIndex, 1);
    backdated.journalEntries.splice(questIndex, 0, entry!);
    expect(() => OverworldSession.restore(WORLD, backdated)).toThrow(/chronology|newest-first/i);
  });
});
