import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { startOverworldQuestThroughRpg } from "../../src/mcp/overworld_quest_bridge.js";
import { runRpgStartWorldQuest } from "../../src/mcp/rpg_session_lifecycle.js";
import { RpgMcpSessionRuntime } from "../../src/mcp/rpg_session_runtime.js";
import { SessionStore } from "../../src/mcp/sessions.js";
import { createToolApi } from "../../src/mcp/tools.js";
import type { CampaignCharacterImports } from "../../src/rpg/campaign_character_import.js";
import { indexRpgPack, initStateForRpgPack } from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  buildCampaignCharacterState,
  createInitialCampaignCharacterState,
} from "../../src/world/campaign_character_state.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { GameSession } from "../../ui/src/engine.js";

const ROOT = process.cwd();
const WORLD = loadOverworldManifest(ROOT);
const WOLF_SOURCE = readFileSync("content/rpg/quests/wolf_winter.yaml", "utf8");
const WOLF_QUEST = WORLD.quests.find((quest) => quest.id === "wolf_winter");
const WOLF_IMPORTS = WOLF_QUEST?.campaign_imports;
if (!WOLF_QUEST || !WOLF_IMPORTS) throw new Error("Wolf-Winter campaign imports are required.");
const loadedWolf = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loadedWolf.ok) throw new Error("Wolf-Winter must compile.");
const wolfIndex = indexRpgPack(loadedWolf.compiled.pack);

type ToolApi = ReturnType<typeof createToolApi>;

function revealAlbanyWolf(session: OverworldSession) {
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  const revealed = session.talkToCharacter(opening.characters[0]!.id);
  const quest = revealed.discoveredQuests?.find((candidate) => candidate.id === "wolf_winter");
  if (!quest) throw new Error("Expected the Albany Wolf-Winter lead.");
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === quest.area);
  if (!route) throw new Error("Expected a route to the Albany Wolf-Winter lead.");
  session.moveArea(route.id);
  return quest;
}

function launchAlbanyWolf(
  api: ToolApi,
  view: { compact_observation: boolean; compact_actions: boolean },
) {
  const full = { compact_context: false, compact_result: false } as const;
  const started = api.start_overworld({ compact_context: false });
  const overworldSessionId = started.session_id;
  let observation = started.observation;

  api.scout_overworld_session_poi({
    ...full,
    session_id: overworldSessionId,
    poi_id: observation.pois[0]!.id,
  });
  observation = api.get_overworld_session({
    session_id: overworldSessionId,
    include_observation: true,
  }).observation;
  const marketRoute = observation.areaExits.find(
    (route) => route.destination.id === "albany_city__market",
  );
  if (!marketRoute) throw new Error("Expected the Albany market route.");
  api.move_overworld_session_area({
    ...full,
    session_id: overworldSessionId,
    area_route_id: marketRoute.id,
  });
  observation = api.get_overworld_session({
    session_id: overworldSessionId,
    include_observation: true,
  }).observation;
  const revealed = api.scout_overworld_session_poi({
    ...full,
    session_id: overworldSessionId,
    poi_id: observation.pois[0]!.id,
  });
  const quest = revealed.result.discoveredQuests?.find(
    (candidate) => candidate.id === "wolf_winter",
  );
  if (!quest) throw new Error("Expected the Wolf-Winter lead.");
  const questRoute = revealed.observation.areaExits.find(
    (route) => route.destination.id === quest.area,
  );
  if (!questRoute) throw new Error("Expected a route to the Wolf-Winter quest area.");
  api.move_overworld_session_area({
    ...full,
    session_id: overworldSessionId,
    area_route_id: questRoute.id,
  });
  const launched = api.start_overworld_session_quest({
    ...full,
    ...view,
    include_actions: true,
    session_id: overworldSessionId,
    quest_id: quest.id,
    seed: 505,
  });
  return { launched, overworldSessionId };
}

describe("trusted campaign-character quest launch bridge", () => {
  it("keeps an RPG startup failure atomic at the overworld boundary", () => {
    const session = new OverworldSession(WORLD);
    const quest = revealAlbanyWolf(session);
    const sessions = new SessionStore();
    const runtime = new RpgMcpSessionRuntime(sessions);
    const before = session.snapshot();
    const beforeHash = session.snapshotHash();
    const invalidImports = {
      version: 1,
      rules: [
        {
          id: "import:wolf_winter_invalid_target",
          type: "skill_rank_to_var",
          skill_id: "skill:fieldcraft",
          target_var: "not_authored",
        },
      ],
    } as CampaignCharacterImports;

    expect(() =>
      startOverworldQuestThroughRpg({
        session,
        overworldSessionId: "ow-test",
        questId: quest.id,
        startOptions: { seed: 505 },
        startEmbeddedWorldQuest: (_args, context) => {
          expect(context.overworldSessionId).toBe("ow-test");
          expect(context.character).toEqual(createInitialCampaignCharacterState());
          const initialState = initStateForRpgPack(wolfIndex, 505, {
            character: context.character,
            imports: invalidImports,
          });
          return runtime.startRpgSession(
            loadedWolf.compiled,
            {},
            { worldQuestId: "wolf_winter", overworldSessionId: context.overworldSessionId },
            initialState,
          );
        },
      }),
    ).toThrow(/not_authored/);

    expect(session.snapshotHash()).toBe(beforeHash);
    expect(session.snapshot()).toEqual(before);
    expect(session.snapshot().startedQuestIds).toEqual([]);
    // Initialization failed before SessionStore.create; the first later RPG is
    // still r1, so no orphan embedded session was minted.
    expect(
      runtime.startSession(loadedWolf.compiled, undefined, {
        worldQuestId: "wolf_winter",
        seed: 505,
      }).id,
    ).toBe("r1");
  });

  it("rejects forged parent and character authority on public direct starts", () => {
    const api = createToolApi({ root: ROOT });
    const forbidden = [
      ["overworldSessionId", "ow-forged"],
      ["overworld_session_id", "ow-forged"],
      ["campaignCharacter", createInitialCampaignCharacterState()],
      ["campaign_character", createInitialCampaignCharacterState()],
      ["campaignImports", WOLF_IMPORTS],
      ["campaign_imports", WOLF_IMPORTS],
    ] as const;

    for (const [field, value] of forbidden) {
      expect(() =>
        (api.start_world_quest as (args: Record<string, unknown>) => unknown)({
          world_quest_id: "wolf_winter",
          [field]: value,
        }),
      ).toThrow(new RegExp(`does not accept embedded field.*${field}`));
    }

    // Rejections happen before a session is minted.
    expect(api.start_world_quest({ world_quest_id: "wolf_winter", seed: 505 }).session_id).toBe(
      "r1",
    );
  });

  it("preserves the exact legacy initial state when the default character applies no delta", () => {
    const expected = initStateForRpgPack(wolfIndex, 505);
    const api = createToolApi({ root: ROOT });
    const full = api.start_world_quest({
      world_quest_id: "wolf_winter",
      seed: 505,
      compact_observation: false,
    });
    const compact = api.start_world_quest({
      world_quest_id: "wolf_winter",
      seed: 505,
      compact_observation: true,
      compact_actions: true,
    });
    const fullState = api.get_state({ session_id: full.session_id, include_state: true }).state;
    const compactState = api.get_state({
      session_id: compact.session_id,
      include_state: true,
    }).state;

    expect(fullState).toEqual(expected);
    expect(compactState).toEqual(expected);
    expect(fullState.campaignImportReceipt).toBeUndefined();
    expect(full.state_hash).toBe(compact.state_hash);
    expect(api.sessions.get(full.session_id).overworldSessionId).toBeUndefined();
  });

  it("keeps direct starts on pack defaults while the private bridge imports its parent", () => {
    const syntheticCompiled = structuredClone(loadedWolf.compiled);
    syntheticCompiled.pack.meta.vars_init.hp = 10;
    const healthImports: CampaignCharacterImports = {
      version: 1,
      rules: [
        {
          id: "import:test_parent_health",
          type: "health_current_to_var",
          target_var: "hp",
        },
      ],
    };
    const sessions = new SessionStore();
    const runtime = new RpgMcpSessionRuntime(sessions);
    const syntheticSource = {
      questId: "wolf_winter",
      title: "Synthetic import boundary",
      compiled: syntheticCompiled,
      campaignImports: healthImports,
      campaignImportsHash: hashState(healthImports),
    };
    const rpgSources = {
      requireWorldQuestPlayable: (questId: string) => {
        expect(questId).toBe("wolf_winter");
        return syntheticSource;
      },
    } as unknown as Parameters<typeof runRpgStartWorldQuest>[0]["rpgSources"];

    const direct = runRpgStartWorldQuest(
      { rpgRuntime: runtime, rpgSources },
      { world_quest_id: "wolf_winter", seed: 505 },
    );
    const directSession = sessions.get(direct.session_id);
    expect(directSession.state.vars.hp).toBe(10);
    expect(directSession.state.campaignImportReceipt).toBeUndefined();
    expect(directSession.overworldSessionId).toBeUndefined();

    const overworld = new OverworldSession(WORLD);
    const quest = revealAlbanyWolf(overworld);
    const embedded = startOverworldQuestThroughRpg({
      session: overworld,
      overworldSessionId: "ow-trusted",
      questId: quest.id,
      startOptions: { seed: 505 },
      startEmbeddedWorldQuest: (startArgs, context) => {
        const index = runtime.runtimeFor(syntheticCompiled.pack).index;
        const initialState = initStateForRpgPack(index, startArgs.seed ?? 1, {
          character: context.character,
          imports: healthImports,
        });
        return runtime.startRpgSession(
          syntheticCompiled,
          startArgs,
          {
            worldQuestId: quest.id,
            overworldSessionId: context.overworldSessionId,
          },
          initialState,
        );
      },
    });
    const embeddedSession = sessions.get(embedded.rpgSession.session_id);
    expect(embeddedSession.state.vars.hp).toBe(30);
    expect(embeddedSession.state.campaignImportReceipt?.applied_rules).toEqual([
      "import:test_parent_health",
    ]);
    expect(embeddedSession.overworldSessionId).toBe("ow-trusted");
  });

  it("binds only real embedded sessions and keeps full/compact initialization identical", () => {
    const fullApi = createToolApi({ root: ROOT });
    const compactApi = createToolApi({ root: ROOT });
    const full = launchAlbanyWolf(fullApi, {
      compact_observation: false,
      compact_actions: false,
    });
    const compact = launchAlbanyWolf(compactApi, {
      compact_observation: true,
      compact_actions: true,
    });
    const fullSession = fullApi.sessions.get(full.launched.rpg_session_id);
    const compactSession = compactApi.sessions.get(compact.launched.rpg_session_id);

    expect(fullSession.overworldSessionId).toBe(full.overworldSessionId);
    expect(compactSession.overworldSessionId).toBe(compact.overworldSessionId);
    expect(fullSession.state).toEqual(compactSession.state);
    expect(fullSession.stateHash).toBe(compactSession.stateHash);
    expect(fullSession.state.campaignImportReceipt).toBeUndefined();

    const direct = fullApi.start_world_quest({ world_quest_id: "wolf_winter", seed: 505 });
    expect(fullApi.sessions.get(direct.session_id).overworldSessionId).toBeUndefined();
    expect(fullSession.state).toEqual(fullApi.sessions.get(direct.session_id).state);
  });

  it("projects rich persistent state identically in the browser engine and shared initializer", () => {
    const character = buildCampaignCharacterState({
      health: { current: 23, max: 30 },
      skills: [{ skillId: "skill:fieldcraft", rank: 5 }],
      equipment: [
        {
          equipmentId: "equipment:albany_brace_kit_1",
          itemId: "item:albany_brace_kit",
          quantity: 1,
          condition: 80,
          equipped: false,
        },
      ],
    });
    const expected = initStateForRpgPack(wolfIndex, 505, {
      character,
      imports: WOLF_IMPORTS,
    });
    const ui = GameSession.startEmbedded(WOLF_SOURCE, character, WOLF_IMPORTS, 505);
    const view = ui.view();

    expect(view.stateHash).toBe(hashState(expected));
    expect(view.facts[0]).toBe("HP 30  ATK 5  DEF 5");
    expect(view.inventory).not.toContain("saved_brace_stake");
    expect(expected.campaignImportReceipt?.applied_rules).toEqual([
      "import:wolf_winter_fieldcraft",
    ]);
  });

  it("detaches browser reset state from caller-owned character and catalog objects", () => {
    const character = buildCampaignCharacterState({
      skills: [{ skillId: "skill:fieldcraft", rank: 5 }],
    });
    const imports = structuredClone(WOLF_IMPORTS);
    const ui = GameSession.startEmbedded(WOLF_SOURCE, character, imports, 505);
    const initial = ui.view();

    character.skills[0]!.rank = 1;
    imports.rules[0]!.id = "import:caller_mutated";
    ui.reset();

    expect(ui.view().stateHash).toBe(initial.stateHash);
    expect(ui.view().facts).toEqual(initial.facts);
  });

  it("keeps browser and MCP embedded opening hashes equal for the real default character", () => {
    const api = createToolApi({ root: ROOT });
    const embedded = launchAlbanyWolf(api, {
      compact_observation: false,
      compact_actions: false,
    });
    const mcpState = api.sessions.get(embedded.launched.rpg_session_id).state;
    const ui = GameSession.startEmbedded(
      WOLF_SOURCE,
      createInitialCampaignCharacterState(),
      WOLF_IMPORTS,
      505,
    );

    expect(ui.view().stateHash).toBe(hashState(mcpState));
    expect(ui.view().stateHash).toBe(api.sessions.get(embedded.launched.rpg_session_id).stateHash);
  });
});
