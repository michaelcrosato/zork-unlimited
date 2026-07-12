import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import { INITIAL_JOURNEY_GOAL } from "../../src/world/journey_contract.js";

const api = () => createToolApi({ root: process.cwd() });
const FULL_OVERWORLD = { compact_context: false, compact_result: false } as const;

describe("MCP journey surface", () => {
  it("keeps the canonical journey at the response root across compact and full play", () => {
    const a = api();
    const compact = a.start_overworld();
    const full = a.start_overworld({ compact_context: false });

    expect(compact.journey).toMatchObject({
      contractVersion: 1,
      status: "active",
      goal: { ...INITIAL_JOURNEY_GOAL, status: "active", completedAtDecision: null },
      acceptedDecisions: 0,
      baselineDecisions: 40,
      nextCheckpoint: 40,
      pendingChoice: null,
    });
    expect(full.journey).toEqual(compact.journey);

    const reread = a.get_overworld_session_context({ session_id: compact.session_id });
    expect(reread.journey).toEqual(compact.journey);
    const unchanged = a.get_overworld_session_context({
      session_id: compact.session_id,
      if_snapshot_hash: compact.snapshot_hash,
    });
    expect(unchanged).toMatchObject({ unchanged: true, journey: compact.journey });

    const poi = full.observation.pois[0]!;
    const acted = a.scout_overworld_session_poi({
      ...FULL_OVERWORLD,
      session_id: full.session_id,
      poi_id: poi.id,
    });
    expect(acted.journey.acceptedDecisions).toBe(1);
    expect(acted.snapshot_hash).not.toBe(full.snapshot_hash);
    expect(acted.journey).toEqual(
      a.get_overworld_session({
        session_id: full.session_id,
        include_observation: true,
      }).journey,
    );
  });

  it("makes a pending parent choice the only legal move inside an embedded quest", () => {
    const a = api();
    const started = a.start_overworld({ compact_context: false });
    const sessionId = started.session_id;

    let view = started.observation;
    a.scout_overworld_session_poi({
      ...FULL_OVERWORLD,
      session_id: sessionId,
      poi_id: view.pois[0]!.id,
    });
    view = a.get_overworld_session({
      session_id: sessionId,
      include_observation: true,
    }).observation;

    const marketRoute = view.areaExits.find(
      (route) => route.destination.id === "albany_city__market",
    );
    if (!marketRoute) throw new Error("expected Albany market route");
    a.move_overworld_session_area({
      ...FULL_OVERWORLD,
      session_id: sessionId,
      area_route_id: marketRoute.id,
    });
    view = a.get_overworld_session({
      session_id: sessionId,
      include_observation: true,
    }).observation;

    const revealed = a.scout_overworld_session_poi({
      ...FULL_OVERWORLD,
      session_id: sessionId,
      poi_id: view.pois[0]!.id,
    });
    const quest = revealed.result.discoveredQuests?.[0];
    if (!quest) throw new Error("expected Albany quest lead");
    const questRoute = revealed.observation.areaExits.find(
      (route) => route.destination.id === quest.area,
    );
    if (!questRoute) throw new Error("expected route to quest area");
    a.move_overworld_session_area({
      ...FULL_OVERWORLD,
      session_id: sessionId,
      area_route_id: questRoute.id,
    });
    view = a.get_overworld_session({
      session_id: sessionId,
      include_observation: true,
    }).observation;

    const contact = view.characters[0];
    if (!contact) throw new Error("expected quest-area contact");
    let journey = a.get_overworld_session_context({ session_id: sessionId }).journey;
    while (journey.acceptedDecisions < 39) {
      journey = a.talk_overworld_session_contact({
        ...FULL_OVERWORLD,
        session_id: sessionId,
        character_id: contact.id,
      }).journey;
    }

    const launched = a.start_overworld_session_quest({
      ...FULL_OVERWORLD,
      compact_observation: false,
      session_id: sessionId,
      quest_id: quest.id,
    });
    expect(launched.journey).toMatchObject({
      status: "awaiting_choice",
      acceptedDecisions: 40,
      nextCheckpoint: 40,
    });
    expect(launched.journey.pendingChoice?.options.map((option) => option.id)).toEqual([
      "continue",
      "end",
    ]);
    expect(launched.rpg_session.observation.available_actions).toEqual([]);
    expect(launched.overworld_snapshot_hash).toBe(launched.snapshot_hash);

    const observed = a.get_observation({
      session_id: launched.rpg_session_id,
      compact_observation: false,
    });
    expect(observed.journey).toEqual(launched.journey);
    expect(observed.overworld_snapshot_hash).toBe(launched.snapshot_hash);
    expect(observed.observation.available_actions).toEqual([]);
    expect(
      a.list_legal_actions({ session_id: launched.rpg_session_id, compact_actions: true }).actions,
    ).toEqual([]);

    const blocked = a.step_action({
      session_id: launched.rpg_session_id,
      action_id: "not_a_legal_action",
      compact_observation: false,
      compact_events: false,
    });
    expect(blocked).toMatchObject({
      ok: false,
      journey: { status: "awaiting_choice", acceptedDecisions: 40 },
      overworld_snapshot_hash: launched.snapshot_hash,
    });
    expect(blocked.observation.available_actions).toEqual([]);

    const continued = a.choose_overworld_session_journey({
      ...FULL_OVERWORLD,
      session_id: sessionId,
      choice: "continue",
    });
    expect(continued.result.exitReceipt).toBeNull();
    expect(continued.journey).toMatchObject({
      status: "active",
      acceptedDecisions: 40,
      nextCheckpoint: 80,
      pendingChoice: null,
    });

    const actions = a.list_legal_actions({
      session_id: launched.rpg_session_id,
      compact_actions: true,
    });
    expect(actions.journey).toEqual(continued.journey);
    expect(actions.actions.length).toBeGreaterThan(0);
    const stepped = a.step_action({
      session_id: launched.rpg_session_id,
      action_id: actions.actions[0]!,
      compact_observation: true,
      compact_events: true,
    });
    expect(stepped.ok).toBe(true);
    expect(stepped.journey).toMatchObject({ status: "active", acceptedDecisions: 41 });
    expect(stepped.overworld_snapshot_hash).not.toBe(launched.snapshot_hash);
  });
});
