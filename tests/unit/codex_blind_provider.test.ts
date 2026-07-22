import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error — plain .mjs module without type declarations
import * as codexProvider from "../../blind-tester/codex-pure-envelope.mjs";
import { PURE_PLAYER_TOOLS } from "../../src/mcp/server.js";

const {
  buildCodexPureEnvelope,
  CODEX_PURE_PLAYER_TOOLS,
  inspectCodexGameplayResultForwarding,
  inspectCodexPureEvidence,
  inspectCodexPureEvents,
} = codexProvider;

const THREAD_ID = "019f7250-1ed0-7102-be6c-4f1d5513d91e";
const PERMISSIONS_BLOCK = "<permissions instructions>read-only player</permissions instructions>";
const SKILLS_BLOCK = "<skills_instructions>player skills</skills_instructions>";
const V2_TEAM_BLOCK =
  "You are `/root`, the primary agent in a team of agents collaborating to fulfill the user's goals.";
const V2_MODE_BLOCK =
  "<multi_agent_mode>Only explicit requests permit delegation.</multi_agent_mode>";
const ENVIRONMENT_BLOCK = "<environment_context>isolated player</environment_context>";

type TestItem = {
  id: string;
  type: string;
  text?: string;
  server?: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
  status?: string;
};

type TestRow = {
  type: string;
  thread_id?: string;
  item?: TestItem;
  usage?: {
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    reasoning_output_tokens: number;
  };
};

function gameplayCallRows(
  id = "item_1",
  tool = "start_overworld",
  arguments_: Record<string, unknown> = {},
): TestRow[] {
  const common = {
    id,
    type: "mcp_tool_call",
    server: "adventureforge",
    tool,
    arguments: arguments_,
  };
  return [
    {
      type: "item.started",
      item: { ...common, result: null, error: null, status: "in_progress" },
    },
    {
      type: "item.completed",
      item: {
        ...common,
        result: { content: [], structured_content: null },
        error: null,
        status: "completed",
      },
    },
  ];
}

function validRows(): TestRow[] {
  return [
    { type: "thread.started", thread_id: THREAD_ID },
    { type: "turn.started" },
    {
      type: "item.completed",
      item: { id: "item_0", type: "agent_message", text: "I will begin." },
    },
    ...gameplayCallRows(),
    {
      type: "turn.completed",
      usage: {
        input_tokens: 120,
        cached_input_tokens: 80,
        output_tokens: 40,
        reasoning_output_tokens: 10,
      },
    },
  ];
}

function forwardingRollout(
  output: unknown = undefined,
  result: Record<string, unknown> = {
    content: [{ type: "text", text: '{"state_hash":"next"}' }],
  },
): unknown[] {
  return [
    {
      type: "response_item",
      payload: {
        type: "custom_tool_call",
        id: "wrapper-item-1",
        status: "completed",
        call_id: "call-wrapper-1",
        name: "exec",
        input:
          "const result = await tools.mcp__adventureforge__start_overworld({});\n" +
          "text(JSON.stringify(result));\n",
        internal_chat_message_metadata_passthrough: { turn_id: "turn-1" },
      },
    },
    {
      type: "event_msg",
      payload: {
        type: "mcp_tool_call_end",
        call_id: "exec-gameplay-1",
        invocation: { server: "adventureforge", tool: "start_overworld", arguments: {} },
        result: { Ok: result },
      },
    },
    {
      type: "response_item",
      payload: {
        type: "custom_tool_call_output",
        call_id: "call-wrapper-1",
        internal_chat_message_metadata_passthrough: { turn_id: "turn-1" },
        output: output ?? [
          { type: "input_text", text: "Script completed\nWall time 0.0 seconds\nOutput:\n" },
          { type: "input_text", text: JSON.stringify(result) },
        ],
      },
    },
  ];
}

function rolloutPayload(rows: unknown[], index: number): Record<string, unknown> {
  return (rows[index] as { payload: Record<string, unknown> }).payload;
}

function twoPublicGameplayCalls(): TestRow[] {
  const rows = validRows();
  rows.splice(-1, 0, ...gameplayCallRows("item_2", "get_overworld_session_context", {}));
  return rows;
}

function twoPrivateGameplayCalls(
  result: Record<string, unknown> = {
    content: [{ type: "text", text: '{"state_hash":"next"}' }],
  },
): unknown[] {
  const second = forwardingRollout(undefined, result);
  const start = rolloutPayload(second, 0);
  start.id = "wrapper-item-2";
  start.call_id = "call-wrapper-2";
  start.input =
    "const result = await tools.mcp__adventureforge__get_overworld_session_context({});\n" +
    "text(JSON.stringify(result));\n";
  const completion = rolloutPayload(second, 1);
  completion.call_id = "exec-gameplay-2";
  const invocation = completion.invocation as Record<string, unknown>;
  invocation.tool = "get_overworld_session_context";
  rolloutPayload(second, 2).call_id = "call-wrapper-2";
  return [...forwardingRollout(undefined, result), ...second];
}

function completeRollout(
  gameplayRows: unknown[],
  profile: "sol_v2" | "terra_v2" | "luna_v1" | "spark_disabled" = "sol_v2",
): unknown[] {
  const inputMessage = (role: "developer" | "user", ...texts: string[]) => ({
    type: "response_item",
    payload: {
      type: "message",
      role,
      content: texts.map((text) => ({ type: "input_text", text })),
      internal_chat_message_metadata_passthrough: { turn_id: "turn-1" },
    },
  });
  const model =
    profile === "luna_v1"
      ? "gpt-5.6-luna"
      : profile === "spark_disabled"
        ? "gpt-5.3-codex-spark"
        : profile === "terra_v2"
          ? "gpt-5.6-terra"
          : "gpt-5.6-sol";
  const singleDeveloperPrelude = profile === "luna_v1" || profile === "spark_disabled";
  const prelude = singleDeveloperPrelude
    ? [
        inputMessage("developer", PERMISSIONS_BLOCK, SKILLS_BLOCK),
        inputMessage("user", ENVIRONMENT_BLOCK),
      ]
    : [
        inputMessage("developer", PERMISSIONS_BLOCK, SKILLS_BLOCK),
        inputMessage("developer", V2_TEAM_BLOCK),
        inputMessage("developer", V2_MODE_BLOCK),
        inputMessage("user", ENVIRONMENT_BLOCK),
      ];
  return [
    { type: "session_meta", payload: { id: THREAD_ID } },
    { type: "event_msg", payload: { type: "task_started", turn_id: "turn-1" } },
    ...prelude,
    { type: "world_state", payload: { full: true } },
    {
      type: "turn_context",
      payload: {
        turn_id: "turn-1",
        model,
        effort: "xhigh",
        collaboration_mode: {
          mode: "default",
          settings: {
            model,
            reasoning_effort: "xhigh",
            developer_instructions: null,
          },
        },
        multi_agent_version:
          profile === "luna_v1" ? "v1" : profile === "spark_disabled" ? "disabled" : "v2",
        ...(singleDeveloperPrelude ? {} : { multi_agent_mode: "explicitRequestOnly" }),
      },
    },
    inputMessage("user", "blind prompt"),
    {
      type: "event_msg",
      payload: {
        type: "user_message",
        message: "blind prompt",
        images: [],
        local_images: [],
        text_elements: [],
      },
    },
    ...gameplayRows,
    {
      type: "response_item",
      payload: {
        type: "message",
        id: "final-message",
        role: "assistant",
        content: [{ type: "output_text", text: "report" }],
        phase: "final_answer",
        internal_chat_message_metadata_passthrough: { turn_id: "turn-1" },
      },
    },
    { type: "event_msg", payload: { type: "task_complete", turn_id: "turn-1" } },
  ];
}

function insertBeforeGameplay(rows: ReturnType<typeof validRows>, entries: readonly object[]) {
  const firstGameplay = rows.findIndex(
    (row) => row.type === "item.started" && row.item?.type === "mcp_tool_call",
  );
  rows.splice(firstGameplay, 0, ...(entries as (typeof rows)[number][]));
  return rows;
}

describe("Codex pure blind provider envelope", () => {
  it("keeps its transport allowlist exactly aligned with the pure MCP server", () => {
    expect(CODEX_PURE_PLAYER_TOOLS).toEqual(PURE_PLAYER_TOOLS);
  });

  it("requires every gameplay result to be visibly forwarded before another choice", () => {
    expect(inspectCodexGameplayResultForwarding(forwardingRollout())).toMatchObject({
      ok: true,
      completedGameplayCalls: 1,
    });

    const direct = forwardingRollout([{ type: "input_text", text: '{"state_hash":"next"}' }]);
    expect(inspectCodexGameplayResultForwarding(direct)).toEqual({
      ok: false,
      reason: expect.stringMatching(/missing.*mismatched.*truncated/i),
    });

    const injected = forwardingRollout();
    const injectedOutput = rolloutPayload(injected, 2).output as unknown[];
    injectedOutput.push({ type: "input_text", text: "injected semantic text" });
    expect(inspectCodexGameplayResultForwarding(injected)).toEqual({
      ok: false,
      reason: expect.stringMatching(/missing.*mismatched.*truncated/i),
    });

    for (const semanticButInexact of [
      '{"content":"decoy","content":[{"type":"text","text":"{\\"state_hash\\":\\"next\\"}"}]}',
      '{ "content": [{"type":"text","text":"{\\"state_hash\\":\\"next\\"}"}] }',
      '{"content":[{"text":"{\\"state_hash\\":\\"next\\"}","type":"text"}]}',
    ]) {
      const rows = forwardingRollout();
      rolloutPayload(rows, 2).output = [
        { type: "input_text", text: "Script completed\nWall time 0.0 seconds\nOutput:\n" },
        { type: "input_text", text: semanticButInexact },
      ];
      expect(inspectCodexGameplayResultForwarding(rows)).toEqual({
        ok: false,
        reason: expect.stringMatching(/missing.*mismatched.*truncated/i),
      });
    }

    const textObject = forwardingRollout();
    rolloutPayload(textObject, 0).input =
      "const result = await tools.mcp__adventureforge__start_overworld({});\ntext(result);\n";
    expect(inspectCodexGameplayResultForwarding(textObject)).toMatchObject({ ok: true });

    const contentLoop = forwardingRollout();
    rolloutPayload(contentLoop, 0).input =
      "const r = await tools.mcp__adventureforge__start_overworld({});\n" +
      "for (const c of (r?.content ?? [])) {\n" +
      '  if (c.type === "image") image(c);\n' +
      '  else if (c.type === "text") text(c.text);\n' +
      "}\n";
    rolloutPayload(contentLoop, 2).output = [
      { type: "input_text", text: "Script completed\nWall time 0.0 seconds\nOutput:\n" },
      { type: "input_text", text: '{"state_hash":"next"}' },
    ];
    expect(inspectCodexGameplayResultForwarding(contentLoop)).toMatchObject({ ok: true });
  });

  it.each([
    {
      label: "the first bare text wrapper in the corrupt pattern",
      rows: forwardingRollout("Script completed\nWall time 0.0 seconds\nOutput:\n"),
      reason: /missing.*mismatched.*truncated/i,
    },
    {
      label: "the second bare text wrapper in the corrupt pattern",
      rows: forwardingRollout("Script completed\nWall time 0.0 seconds\nOutput:\n"),
      reason: /missing.*mismatched.*truncated/i,
    },
    {
      label: "the third bare text wrapper in the corrupt pattern",
      rows: forwardingRollout("Script completed\nWall time 0.0 seconds\nOutput:\n"),
      reason: /missing.*mismatched.*truncated/i,
    },
    {
      label: "a truncated wrapper payload",
      rows: forwardingRollout([{ type: "input_text", text: '{"content":[' }]),
      reason: /missing.*mismatched.*truncated/i,
    },
    {
      label: "a mismatched wrapper payload",
      rows: forwardingRollout([
        {
          type: "input_text",
          text: JSON.stringify({ content: [{ type: "text", text: "wrong" }] }),
        },
      ]),
      reason: /missing.*mismatched.*truncated/i,
    },
    {
      label: "an MCP result with unbound private fields",
      rows: forwardingRollout(undefined, {
        content: [{ type: "text", text: '{"state_hash":"next"}' }],
        private_only: "not present in the public result",
      }),
      reason: /no auditable successful result/i,
    },
    {
      label: "an unpaired gameplay result",
      rows: forwardingRollout().slice(0, 2),
      reason: /no paired visible result output/i,
    },
    {
      label: "a duplicate wrapper output",
      rows: [...forwardingRollout(), structuredClone(forwardingRollout()[2])],
      reason: /orphan.*tool lifecycle/i,
    },
  ])("rejects $label without echoing hidden game content", ({ rows, reason }) => {
    const inspected = inspectCodexGameplayResultForwarding(rows);
    expect(inspected).toEqual({ ok: false, reason: expect.stringMatching(reason) });
    expect(inspected.reason).not.toContain("state_hash");
  });

  it("rejects every non-game raw tool lifecycle", () => {
    const rows = [
      {
        type: "event_msg",
        payload: {
          type: "mcp_tool_call_end",
          call_id: "exec-nongame",
          invocation: { server: "other", tool: "not-game", arguments: {} },
          result: { Ok: { content: [{ type: "text", text: "not player state" }] } },
        },
      },
    ];
    expect(inspectCodexGameplayResultForwarding(rows)).toEqual({
      ok: false,
      reason: expect.stringMatching(/orphan.*tool lifecycle/i),
    });

    const hiddenNativeCall = [
      {
        type: "response_item",
        payload: {
          type: "function_call",
          name: "local_shell",
          arguments: '{"command":"whoami"}',
        },
      },
      ...forwardingRollout(),
    ];
    expect(inspectCodexGameplayResultForwarding(hiddenNativeCall)).toEqual({
      ok: false,
      reason: expect.stringMatching(/forbidden private response item function_call/i),
    });

    const hiddenNativeEvent = [
      {
        type: "event_msg",
        payload: { type: "web_search_end", query: "hidden external lookup" },
      },
      ...forwardingRollout(),
    ];
    expect(inspectCodexGameplayResultForwarding(hiddenNativeEvent)).toEqual({
      ok: false,
      reason: expect.stringMatching(/forbidden private event/i),
    });

    const hiddenTopLevelActivity = [
      { type: "native_tool_activity", payload: { type: "completed" } },
      ...forwardingRollout(),
    ];
    expect(inspectCodexGameplayResultForwarding(hiddenTopLevelActivity)).toEqual({
      ok: false,
      reason: expect.stringMatching(/forbidden private rollout row/i),
    });
  });

  it.each([
    {
      label: "ALL_TOOLS inspection",
      input:
        "const hits = ALL_TOOLS.filter((tool) => tool.name.includes('adventureforge'));\ntext(hits);\n",
      server: "adventureforge",
      tool: "start_overworld",
    },
    {
      label: "resource access",
      input:
        "const result = await tools.mcp__adventureforge__list_mcp_resources({});\n" +
        "text(JSON.stringify(result));\n",
      server: "adventureforge",
      tool: "list_mcp_resources",
    },
    {
      label: "forbidden gameplay alias",
      input:
        "const result = await tools.mcp__adventureforge__step_rpg_session({});\n" +
        "text(JSON.stringify(result));\n",
      server: "adventureforge",
      tool: "step_rpg_session",
    },
    {
      label: "todo tool",
      input: "const result = await tools.update_plan({});\ntext(JSON.stringify(result));\n",
      server: "codex",
      tool: "update_plan",
    },
    {
      label: "extra wrapper activity",
      input:
        "const result = await tools.mcp__adventureforge__start_overworld({});\n" +
        "text(JSON.stringify(result));\ntext('extra');\n",
      server: "adventureforge",
      tool: "start_overworld",
    },
  ])("rejects $label in the raw wrapper", ({ input, server, tool }) => {
    const rows = forwardingRollout();
    rolloutPayload(rows, 0).input = input;
    const invocation = rolloutPayload(rows, 1).invocation as Record<string, unknown>;
    invocation.server = server;
    invocation.tool = tool;
    expect(inspectCodexGameplayResultForwarding(rows)).toEqual({
      ok: false,
      reason: expect.stringMatching(/forbidden wrapper program/i),
    });
  });

  it("cross-binds every ordered public/private gameplay lifecycle", () => {
    const publicRows = validRows();
    const privateRows = completeRollout(forwardingRollout(undefined, { content: [] }));
    expect(inspectCodexPureEvidence(publicRows, privateRows)).toMatchObject({
      ok: true,
      completedMcpCalls: 1,
    });

    const missing = inspectCodexPureEvidence(
      twoPublicGameplayCalls(),
      completeRollout(forwardingRollout(undefined, { content: [] })),
    );
    expect(missing).toEqual({ ok: false, reason: expect.stringMatching(/count differs/i) });

    const extra = inspectCodexPureEvidence(publicRows, completeRollout(twoPrivateGameplayCalls()));
    expect(extra).toEqual({ ok: false, reason: expect.stringMatching(/count differs/i) });

    const reordered = twoPrivateGameplayCalls();
    const first = reordered.splice(0, 3);
    reordered.push(...first);
    expect(inspectCodexPureEvidence(twoPublicGameplayCalls(), completeRollout(reordered))).toEqual({
      ok: false,
      reason: expect.stringMatching(/differs at call 1/i),
    });

    const mismatched = forwardingRollout(undefined, { content: [] });
    rolloutPayload(mismatched, 0).input =
      "const result = await tools.mcp__adventureforge__get_overworld_session_context({});\n" +
      "text(JSON.stringify(result));\n";
    const mismatchedInvocation = rolloutPayload(mismatched, 1).invocation as Record<
      string,
      unknown
    >;
    mismatchedInvocation.tool = "get_overworld_session_context";
    expect(inspectCodexPureEvidence(publicRows, completeRollout(mismatched))).toEqual({
      ok: false,
      reason: expect.stringMatching(/differs at call 1/i),
    });

    expect(inspectCodexPureEvidence(publicRows, completeRollout(forwardingRollout()))).toEqual({
      ok: false,
      reason: expect.stringMatching(/differs at call 1/i),
    });

    const failedPublicCall = twoPublicGameplayCalls();
    const failedCompletion = failedPublicCall.find(
      (row) => row.type === "item.completed" && row.item?.id === "item_2",
    );
    if (!failedCompletion?.item) throw new Error("missing test gameplay completion");
    failedCompletion.item.status = "failed";
    expect(
      inspectCodexPureEvidence(
        failedPublicCall,
        completeRollout(twoPrivateGameplayCalls({ content: [] })),
      ),
    ).toEqual({
      ok: false,
      reason: expect.stringMatching(/differs at call 2/i),
    });
  });

  it("accepts each exact native Codex capture profile", () => {
    const lunaGameplay = forwardingRollout(undefined, { content: [] });
    rolloutPayload(lunaGameplay, 0).input =
      "const result = await tools.mcp__adventureforge__start_overworld();\n" +
      "text(JSON.stringify(result));\n";
    const luna = completeRollout(lunaGameplay, "luna_v1");
    expect(inspectCodexPureEvidence(validRows(), luna, "gpt-5.6-luna")).toMatchObject({
      ok: true,
    });
    expect(
      buildCodexPureEnvelope({
        rows: validRows(),
        rolloutRows: luna,
        report: "report",
        model: "gpt-5.6-luna",
        durationMs: 1,
      }),
    ).toMatchObject({ ok: true, envelope: { requested_model: "gpt-5.6-luna" } });

    expect(
      inspectCodexPureEvidence(
        validRows(),
        completeRollout(forwardingRollout(undefined, { content: [] }), "sol_v2"),
        "gpt-5.6-sol",
      ),
    ).toMatchObject({ ok: true });
    expect(
      inspectCodexPureEvidence(
        validRows(),
        completeRollout(forwardingRollout(undefined, { content: [] }), "terra_v2"),
        "gpt-5.6-terra",
      ),
    ).toMatchObject({ ok: true });
    expect(
      inspectCodexPureEvidence(
        validRows(),
        completeRollout(forwardingRollout(undefined, { content: [] }), "spark_disabled"),
        "gpt-5.3-codex-spark",
      ),
    ).toMatchObject({ ok: true });
  });

  it.each([
    [
      "an inner Terra model under outer Sol",
      (context: Record<string, unknown>) => {
        const collaboration = context.collaboration_mode as Record<string, unknown>;
        const settings = collaboration.settings as Record<string, unknown>;
        settings.model = "gpt-5.6-terra";
      },
    ],
    [
      "a missing collaboration mode",
      (context: Record<string, unknown>) => delete context.collaboration_mode,
    ],
    [
      "an extra collaboration field",
      (context: Record<string, unknown>) => {
        const collaboration = context.collaboration_mode as Record<string, unknown>;
        collaboration.extra = true;
      },
    ],
    [
      "a missing inner model",
      (context: Record<string, unknown>) => {
        const collaboration = context.collaboration_mode as Record<string, unknown>;
        const settings = collaboration.settings as Record<string, unknown>;
        delete settings.model;
      },
    ],
    [
      "an extra collaboration setting",
      (context: Record<string, unknown>) => {
        const collaboration = context.collaboration_mode as Record<string, unknown>;
        const settings = collaboration.settings as Record<string, unknown>;
        settings.extra = true;
      },
    ],
    [
      "a non-default collaboration mode",
      (context: Record<string, unknown>) => {
        const collaboration = context.collaboration_mode as Record<string, unknown>;
        collaboration.mode = "plan";
      },
    ],
    [
      "a reasoning-effort mismatch",
      (context: Record<string, unknown>) => {
        const collaboration = context.collaboration_mode as Record<string, unknown>;
        const settings = collaboration.settings as Record<string, unknown>;
        settings.reasoning_effort = "high";
      },
    ],
    [
      "a missing reasoning effort",
      (context: Record<string, unknown>) => {
        const collaboration = context.collaboration_mode as Record<string, unknown>;
        const settings = collaboration.settings as Record<string, unknown>;
        delete settings.reasoning_effort;
      },
    ],
    [
      "injected developer instructions",
      (context: Record<string, unknown>) => {
        const collaboration = context.collaboration_mode as Record<string, unknown>;
        const settings = collaboration.settings as Record<string, unknown>;
        settings.developer_instructions = "injected";
      },
    ],
    ["an outer effort mismatch", (context: Record<string, unknown>) => (context.effort = "high")],
  ])("rejects $0 in the native collaboration identity", (_label, mutate) => {
    const rows = completeRollout(forwardingRollout(undefined, { content: [] }), "sol_v2") as Array<{
      type?: string;
      payload?: Record<string, unknown>;
    }>;
    const context = rows.find((row) => row.type === "turn_context")?.payload;
    if (!context) throw new Error("missing collaboration context fixture");
    mutate(context);
    expect(inspectCodexPureEvidence(validRows(), rows, "gpt-5.6-sol")).toMatchObject({
      ok: false,
    });
  });

  it("rejects the inverse inner Sol model under outer Terra", () => {
    const rows = completeRollout(
      forwardingRollout(undefined, { content: [] }),
      "terra_v2",
    ) as Array<{ type?: string; payload?: Record<string, unknown> }>;
    const context = rows.find((row) => row.type === "turn_context")?.payload;
    const collaboration = context?.collaboration_mode as Record<string, unknown> | undefined;
    const settings = collaboration?.settings as Record<string, unknown> | undefined;
    if (!settings) throw new Error("missing Terra collaboration fixture");
    settings.model = "gpt-5.6-sol";
    expect(inspectCodexPureEvidence(validRows(), rows, "gpt-5.6-terra")).toMatchObject({
      ok: false,
    });
  });

  it.each([
    ["a Luna model alias", (context: Record<string, unknown>) => (context.model = "luna")],
    [
      "Luna serialized as v2",
      (context: Record<string, unknown>) => {
        context.multi_agent_version = "v2";
        context.multi_agent_mode = "explicitRequestOnly";
      },
    ],
    [
      "Luna with a multi-agent mode",
      (context: Record<string, unknown>) => {
        context.multi_agent_mode = "explicitRequestOnly";
      },
    ],
    [
      "Luna with the wrong version",
      (context: Record<string, unknown>) => {
        context.multi_agent_version = "v0";
      },
    ],
  ])("rejects $0", (_label, mutate) => {
    const rows = completeRollout(
      forwardingRollout(undefined, { content: [] }),
      "luna_v1",
    ) as Array<{
      type?: string;
      payload?: Record<string, unknown>;
    }>;
    const context = rows.find((row) => row.type === "turn_context")?.payload;
    if (!context) throw new Error("missing Luna context fixture");
    mutate(context);
    expect(inspectCodexPureEvidence(validRows(), rows)).toEqual({
      ok: false,
      reason: expect.stringMatching(/capture profile is unsupported/i),
    });
  });

  it.each(["gpt-5.6-sol", "gpt-5.6-terra"])("rejects %s serialized as v1", (model) => {
    const profile = model.endsWith("terra") ? "terra_v2" : "sol_v2";
    const rows = completeRollout(forwardingRollout(undefined, { content: [] }), profile) as Array<{
      type?: string;
      payload?: Record<string, unknown>;
    }>;
    const context = rows.find((row) => row.type === "turn_context")?.payload;
    if (!context) throw new Error("missing v2 context fixture");
    context.multi_agent_version = "v1";
    delete context.multi_agent_mode;
    expect(inspectCodexPureEvidence(validRows(), rows)).toMatchObject({ ok: false });
  });

  it("retains Spark's exact disabled multi-agent capture profile", () => {
    const rows = completeRollout(
      forwardingRollout(undefined, { content: [] }),
      "spark_disabled",
    ) as Array<{ type?: string; payload?: Record<string, unknown> }>;
    const context = rows.find((row) => row.type === "turn_context")?.payload;
    if (!context) throw new Error("missing Spark context fixture");
    context.multi_agent_version = "v1";
    expect(inspectCodexPureEvidence(validRows(), rows)).toMatchObject({ ok: false });
  });

  it("retains the exact v2 developer ordering and explicitRequestOnly mode", () => {
    const baseline = completeRollout(
      forwardingRollout(undefined, { content: [] }),
      "sol_v2",
    ) as Array<{ type?: string; payload?: Record<string, unknown> }>;
    const mutations: Array<[string, (rows: typeof baseline) => void]> = [
      ["swapped team and mode messages", (rows) => ([rows[3], rows[4]] = [rows[4]!, rows[3]!])],
      ["missing mode message", (rows) => rows.splice(4, 1)],
      [
        "wrong turn mode",
        (rows) => {
          const context = rows.find((row) => row.type === "turn_context")?.payload;
          if (context) context.multi_agent_mode = "auto";
        },
      ],
    ];
    for (const [label, mutate] of mutations) {
      const rows = structuredClone(baseline);
      mutate(rows);
      expect(inspectCodexPureEvidence(validRows(), rows), label).toMatchObject({ ok: false });
    }
  });

  it("rejects every Luna v1 prelude topology mutation", () => {
    const baseline = completeRollout(
      forwardingRollout(undefined, { content: [] }),
      "luna_v1",
    ) as Array<{
      type?: string;
      payload?: {
        role?: string;
        content?: Array<{ type?: string; text?: string }>;
        internal_chat_message_metadata_passthrough?: { turn_id?: string };
      };
    }>;
    const mutations: Array<[string, (rows: typeof baseline) => void]> = [
      ["permission/skills block count", (rows) => rows[2]?.payload?.content?.pop()],
      [
        "permission/skills block order",
        (rows) => {
          const content = rows[2]?.payload?.content;
          if (content) content.reverse();
        },
      ],
      [
        "environment role",
        (rows) => {
          const environment = rows[3]?.payload;
          if (environment) environment.role = "developer";
        },
      ],
      [
        "environment turn",
        (rows) => {
          const metadata = rows[3]?.payload?.internal_chat_message_metadata_passthrough;
          if (metadata) metadata.turn_id = "other-turn";
        },
      ],
      ["world/context order", (rows) => ([rows[4], rows[5]] = [rows[5]!, rows[4]!])],
      ["extra prelude row", (rows) => rows.splice(4, 0, structuredClone(rows[2]!))],
    ];
    for (const [label, mutate] of mutations) {
      const rows = structuredClone(baseline);
      mutate(rows);
      expect(inspectCodexPureEvidence(validRows(), rows), label).toMatchObject({ ok: false });
    }
  });

  it("binds the requested model to the private capture profile", () => {
    const luna = completeRollout(forwardingRollout(undefined, { content: [] }), "luna_v1");
    expect(
      buildCodexPureEnvelope({
        rows: validRows(),
        rolloutRows: luna,
        report: "report",
        model: "gpt-5.6-sol",
        durationMs: 1,
      }),
    ).toEqual({ ok: false, reason: expect.stringMatching(/capture profile is unsupported/i) });
    expect(
      buildCodexPureEnvelope({
        rows: validRows(),
        rolloutRows: luna,
        report: "report",
        model: "gpt-5.6-luna-latest",
        durationMs: 1,
      }),
    ).toEqual({ ok: false, reason: "Codex pure run is missing its requested model" });
  });

  it("permits argumentless syntax only for the first start_overworld wrapper", () => {
    const argumentless = forwardingRollout();
    rolloutPayload(argumentless, 0).input =
      "const result = await tools.mcp__adventureforge__start_overworld();\n" +
      "text(JSON.stringify(result));\n";
    expect(inspectCodexGameplayResultForwarding(argumentless)).toMatchObject({ ok: true });

    const nonemptyRecordedArguments = structuredClone(argumentless);
    const recordedInvocation = rolloutPayload(nonemptyRecordedArguments, 1).invocation as Record<
      string,
      unknown
    >;
    recordedInvocation.arguments = { seed: 7 };
    expect(inspectCodexGameplayResultForwarding(nonemptyRecordedArguments)).toMatchObject({
      ok: false,
    });

    const otherTool = forwardingRollout();
    rolloutPayload(otherTool, 0).input =
      "const result = await tools.mcp__adventureforge__get_overworld_session_context();\n" +
      "text(JSON.stringify(result));\n";
    const otherInvocation = rolloutPayload(otherTool, 1).invocation as Record<string, unknown>;
    otherInvocation.tool = "get_overworld_session_context";
    expect(inspectCodexGameplayResultForwarding(otherTool)).toMatchObject({ ok: false });

    const laterStart = twoPrivateGameplayCalls();
    rolloutPayload(laterStart, 3).input =
      "const result = await tools.mcp__adventureforge__start_overworld();\n" +
      "text(JSON.stringify(result));\n";
    const laterInvocation = rolloutPayload(laterStart, 4).invocation as Record<string, unknown>;
    laterInvocation.tool = "start_overworld";
    expect(inspectCodexGameplayResultForwarding(laterStart)).toMatchObject({ ok: false });

    const nonemptyFreshStart = forwardingRollout();
    rolloutPayload(nonemptyFreshStart, 0).input =
      "const result = await tools.mcp__adventureforge__start_overworld({seed:7});\n" +
      "text(JSON.stringify(result));\n";
    const nonemptyInvocation = rolloutPayload(nonemptyFreshStart, 1).invocation as Record<
      string,
      unknown
    >;
    nonemptyInvocation.arguments = { seed: 7 };
    const publicRows = validRows();
    for (const row of publicRows) {
      if (row.item?.type === "mcp_tool_call") row.item.arguments = { seed: 7 };
    }
    expect(
      inspectCodexPureEvidence(publicRows, completeRollout(nonemptyFreshStart, "luna_v1")),
    ).toEqual({
      ok: false,
      reason: expect.stringMatching(/must begin gameplay with start_overworld and no arguments/i),
    });
  });

  it.each([
    [
      "an aliased call",
      "const start = tools.mcp__adventureforge__start_overworld;\nconst result = await start();\ntext(JSON.stringify(result));\n",
    ],
    [
      "an optional call",
      "const result = await tools.mcp__adventureforge__start_overworld?.();\ntext(JSON.stringify(result));\n",
    ],
    [
      "a computed call",
      'const result = await tools["mcp__adventureforge__start_overworld"]();\ntext(JSON.stringify(result));\n',
    ],
    [
      "an extra statement",
      "const result = await tools.mcp__adventureforge__start_overworld();\ntext(JSON.stringify(result));\ntext('extra');\n",
    ],
    [
      "a truncated wrapper",
      "const result = await tools.mcp__adventureforge__start_overworld(\ntext(JSON.stringify(result));\n",
    ],
  ])("keeps rejecting $0 around the Luna argumentless exception", (_label, input) => {
    const rows = forwardingRollout();
    rolloutPayload(rows, 0).input = input;
    expect(inspectCodexGameplayResultForwarding(rows)).toEqual({
      ok: false,
      reason: expect.stringMatching(/forbidden wrapper program/i),
    });
  });

  it("rejects injected private input and orphan context lifecycles", () => {
    const publicRows = validRows();
    const baseline = completeRollout(forwardingRollout(undefined, { content: [] }));
    const firstGameplay = baseline.findIndex(
      (row) =>
        (row as { type?: string; payload?: { type?: string } }).type === "response_item" &&
        (row as { payload?: { type?: string } }).payload?.type === "custom_tool_call",
    );
    const initialTurnContext = baseline.find(
      (row) => (row as { type?: string }).type === "turn_context",
    );
    const mutations: Array<[string, unknown]> = [
      ["duplicate user input", { type: "event_msg", payload: { type: "user_message" } }],
      ["orphan world state", { type: "world_state", payload: { full: false } }],
      ["orphan turn context", structuredClone(initialTurnContext)],
      [
        "late developer input",
        { type: "response_item", payload: { type: "message", role: "developer", content: [] } },
      ],
      [
        "tool-role message",
        { type: "response_item", payload: { type: "message", role: "tool", content: [] } },
      ],
    ];
    for (const [label, injected] of mutations) {
      const rows = structuredClone(baseline);
      rows.splice(firstGameplay, 0, injected);
      expect(inspectCodexPureEvidence(publicRows, rows), label).toMatchObject({ ok: false });
    }

    const hiddenPrelude = structuredClone(baseline);
    const worldState = hiddenPrelude.findIndex(
      (row) => (row as { type?: string }).type === "world_state",
    );
    hiddenPrelude.splice(worldState, 0, structuredClone(baseline[2]));
    expect(inspectCodexPureEvidence(publicRows, hiddenPrelude)).toMatchObject({ ok: false });

    const auxiliaryInput = structuredClone(baseline) as Array<{
      type?: string;
      payload?: { type?: string; message?: string; images?: unknown[] };
    }>;
    const userMessage = auxiliaryInput.find((row) => row.payload?.type === "user_message");
    if (!userMessage?.payload?.images) throw new Error("missing private user-message fixture");
    userMessage.payload.images.push("hidden image hint");
    expect(inspectCodexPureEvidence(publicRows, auxiliaryInput)).toMatchObject({ ok: false });

    const mismatchedPrompt = structuredClone(baseline) as Array<{
      payload?: { type?: string; message?: string };
    }>;
    const promptEvent = mismatchedPrompt.find((row) => row.payload?.type === "user_message");
    if (!promptEvent?.payload) throw new Error("missing private prompt event fixture");
    promptEvent.payload.message = "different prompt";
    expect(inspectCodexPureEvidence(publicRows, mismatchedPrompt)).toMatchObject({ ok: false });

    for (const [label, payloadType, mutateMetadata] of [
      [
        "wrong wrapper turn",
        "custom_tool_call",
        (metadata: Record<string, unknown>) => {
          metadata.turn_id = "other-turn";
        },
      ],
      [
        "wrong output turn",
        "custom_tool_call_output",
        (metadata: Record<string, unknown>) => {
          metadata.turn_id = "other-turn";
        },
      ],
      ["missing wrapper metadata", "custom_tool_call", null],
      [
        "extra output metadata",
        "custom_tool_call_output",
        (metadata: Record<string, unknown>) => {
          metadata.hidden = true;
        },
      ],
    ] as const) {
      const rows = structuredClone(baseline) as Array<{
        payload?: {
          type?: string;
          internal_chat_message_metadata_passthrough?: Record<string, unknown>;
        };
      }>;
      const target = rows.find((row) => row.payload?.type === payloadType);
      if (!target?.payload) throw new Error(`missing ${label} fixture`);
      if (mutateMetadata === null) {
        delete target.payload.internal_chat_message_metadata_passthrough;
      } else {
        const metadata = target.payload.internal_chat_message_metadata_passthrough;
        if (!metadata) throw new Error(`missing ${label} metadata fixture`);
        mutateMetadata(metadata);
      }
      expect(inspectCodexPureEvidence(publicRows, rows), label).toMatchObject({ ok: false });
    }

    const invalidAssistantContent = structuredClone(baseline) as Array<{
      payload?: { type?: string; role?: string; content?: Array<{ type?: string }> };
    }>;
    const assistant = invalidAssistantContent.find(
      (row) => row.payload?.type === "message" && row.payload.role === "assistant",
    );
    if (!assistant?.payload?.content?.[0]) throw new Error("missing assistant fixture");
    assistant.payload.content[0].type = "input_image";
    expect(inspectCodexPureEvidence(publicRows, invalidAssistantContent)).toMatchObject({
      ok: false,
    });

    const reasoningRows = structuredClone(baseline) as Array<{
      payload?: Record<string, unknown>;
    }>;
    reasoningRows.splice(firstGameplay, 0, {
      type: "response_item",
      payload: {
        type: "reasoning",
        id: "reasoning-1",
        summary: [],
        encrypted_content: "opaque",
        internal_chat_message_metadata_passthrough: { turn_id: "turn-1" },
      },
    } as (typeof reasoningRows)[number]);
    expect(inspectCodexPureEvidence(publicRows, reasoningRows)).toMatchObject({ ok: true });
    const reasoning = reasoningRows.find((row) => row.payload?.type === "reasoning");
    if (!reasoning?.payload) throw new Error("missing reasoning fixture");
    reasoning.payload.tool_input = "hidden";
    expect(inspectCodexPureEvidence(publicRows, reasoningRows)).toMatchObject({ ok: false });

    const compacted = structuredClone(baseline);
    compacted.splice(-2, 0, { type: "compacted", payload: { window_number: 2 } });
    compacted.splice(-2, 0, { type: "world_state", payload: { full: true } });
    compacted.splice(-2, 0, structuredClone(initialTurnContext));
    compacted.splice(-2, 0, { type: "event_msg", payload: { type: "context_compacted" } });
    expect(inspectCodexPureEvidence(publicRows, compacted)).toMatchObject({ ok: true });
  });

  it("binds wrapper output ids and rejects duplicates and orphans anywhere", () => {
    const wrongOutputId = forwardingRollout();
    rolloutPayload(wrongOutputId, 2).call_id = "unrelated-output";
    expect(inspectCodexGameplayResultForwarding(wrongOutputId)).toEqual({
      ok: false,
      reason: expect.stringMatching(/missing.*mismatched.*truncated/i),
    });

    const duplicate = twoPrivateGameplayCalls();
    rolloutPayload(duplicate, 3).call_id = "call-wrapper-1";
    rolloutPayload(duplicate, 5).call_id = "call-wrapper-1";
    expect(inspectCodexGameplayResultForwarding(duplicate)).toEqual({
      ok: false,
      reason: expect.stringMatching(/duplicate wrapper start/i),
    });

    const orphanStart = forwardingRollout();
    orphanStart.push(structuredClone(orphanStart[0]));
    expect(inspectCodexGameplayResultForwarding(orphanStart)).toEqual({
      ok: false,
      reason: expect.stringMatching(/duplicate wrapper start/i),
    });
  });

  it("accepts one completed AdventureForge-only thread and normalizes telemetry", () => {
    expect(inspectCodexPureEvents(validRows())).toEqual({
      ok: true,
      threadId: THREAD_ID,
      completedMcpCalls: 1,
      gameplayCalls: [
        {
          tool: "start_overworld",
          arguments: {},
          status: "completed",
          result: { content: [] },
          error: null,
        },
      ],
      usage: {
        input_tokens: 120,
        cached_input_tokens: 80,
        output_tokens: 40,
        reasoning_output_tokens: 10,
      },
    });

    const built = buildCodexPureEnvelope({
      rows: validRows(),
      rolloutRows: completeRollout(forwardingRollout(undefined, { content: [] })),
      report: "# Playthrough log\n\n# Verdict\n\n```json exit-interview\n{}\n```\n",
      model: "gpt-5.6-sol",
      durationMs: 1234,
    });
    expect(built).toMatchObject({
      ok: true,
      envelope: {
        provider: "codex",
        is_error: false,
        duration_ms: 1234,
        num_turns: 1,
        session_id: THREAD_ID,
        requested_model: "gpt-5.6-sol",
        terminal_reason: "completed",
        usage: {
          input_tokens: 120,
          cache_read_input_tokens: 80,
          output_tokens: 40,
          reasoning_output_tokens: 10,
        },
      },
    });
  });

  it.each([
    {
      label: "AdventureForge resource listing",
      server: "adventureforge",
      tool: "list_mcp_resources",
    },
    {
      label: "AdventureForge resource template listing",
      server: "adventureforge",
      tool: "list_mcp_resource_templates",
    },
    { label: "AdventureForge resource read", server: "adventureforge", tool: "read_mcp_resource" },
    { label: "Codex resource listing", server: "codex", tool: "resources/list" },
  ])("rejects $label before gameplay", ({ server, tool }) => {
    const rows = insertBeforeGameplay(validRows(), [
      {
        type: "item.started",
        item: {
          id: `forbidden-${tool}`,
          type: "mcp_tool_call",
          server,
          tool,
          arguments: {},
          result: null,
          error: null,
          status: "in_progress",
        },
      },
    ]);

    expect(inspectCodexPureEvents(rows)).toEqual({
      ok: false,
      reason: expect.stringMatching(
        server === "adventureforge"
          ? new RegExp(`forbidden AdventureForge tool ${tool}`, "i")
          : new RegExp(`forbidden MCP server ${server}`, "i"),
      ),
    });
  });

  it("rejects a todo lifecycle instead of treating planning as gameplay", () => {
    const rows = insertBeforeGameplay(validRows(), [
      {
        type: "item.started",
        item: { id: "todo-1", type: "todo_list", items: [] },
      },
    ]);

    expect(inspectCodexPureEvents(rows)).toEqual({
      ok: false,
      reason: expect.stringMatching(/forbidden item type todo_list/i),
    });
  });

  it.each([
    {
      label: "a non-AdventureForge first MCP call",
      server: "filesystem",
      tool: "read_file",
      arguments_: {},
      reason: /forbidden MCP server filesystem/i,
    },
    {
      label: "a non-start AdventureForge first MCP call",
      server: "adventureforge",
      tool: "get_overworld_session",
      arguments_: {},
      reason: /must begin gameplay with start_overworld and no arguments/i,
    },
    {
      label: "an argument-bearing fresh start",
      server: "adventureforge",
      tool: "start_overworld",
      arguments_: { seed: 7 },
      reason: /must begin gameplay with start_overworld and no arguments/i,
    },
  ])("rejects $label", ({ server, tool, arguments_, reason }) => {
    const rows = validRows();
    const start = rows.find(
      (row) => row.type === "item.started" && row.item?.type === "mcp_tool_call",
    );
    const completed = rows.find(
      (row) => row.type === "item.completed" && row.item?.type === "mcp_tool_call",
    );
    if (!start?.item || !completed?.item) throw new Error("missing valid test gameplay pair");
    start.item.server = server;
    start.item.tool = tool;
    start.item.arguments = arguments_;
    completed.item.server = server;
    completed.item.tool = tool;
    completed.item.arguments = arguments_;

    expect(inspectCodexPureEvents(rows)).toEqual({
      ok: false,
      reason: expect.stringMatching(reason),
    });
  });

  it.each([
    {
      label: "unknown top-level event",
      mutate: (rows: ReturnType<typeof validRows>) =>
        rows.splice(-1, 0, { type: "error" } as (typeof rows)[number]),
      reason: /forbidden event type error/i,
    },
    {
      label: "shell command",
      mutate: (rows: ReturnType<typeof validRows>) =>
        rows.splice(-1, 0, {
          type: "item.completed",
          item: { id: "shell", type: "command_execution" },
        } as (typeof rows)[number]),
      reason: /forbidden item type command_execution/i,
    },
    {
      label: "file change",
      mutate: (rows: ReturnType<typeof validRows>) =>
        rows.splice(-1, 0, {
          type: "item.completed",
          item: { id: "file", type: "file_change" },
        } as (typeof rows)[number]),
      reason: /forbidden item type file_change/i,
    },
    {
      label: "web search",
      mutate: (rows: ReturnType<typeof validRows>) =>
        rows.splice(-1, 0, {
          type: "item.completed",
          item: { id: "web", type: "web_search" },
        } as (typeof rows)[number]),
      reason: /forbidden item type web_search/i,
    },
    {
      label: "wrong MCP server",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const call = rows.find((row) => row.item?.type === "mcp_tool_call");
        if (call?.item) call.item.server = "filesystem";
      },
      reason: /forbidden MCP server filesystem/i,
    },
    {
      label: "structural AdventureForge tool",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const call = rows.find((row) => row.item?.type === "mcp_tool_call");
        if (call?.item) call.item.tool = "start_world_quest";
      },
      reason: /forbidden AdventureForge tool start_world_quest/i,
    },
    {
      label: "gameplay before fresh start",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const call = rows.find((row) => row.item?.type === "mcp_tool_call");
        if (call?.item) call.item.tool = "get_overworld_session_context";
      },
      reason: /must begin gameplay with start_overworld/i,
    },
    {
      label: "a completed-only fresh start",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const started = rows.findIndex(
          (row) => row.type === "item.started" && row.item?.id === "item_1",
        );
        rows.splice(started, 1);
      },
      reason: /unpaired or invalid gameplay completion start_overworld/i,
    },
    {
      label: "a mismatched gameplay completion",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const completed = rows.find(
          (row) => row.type === "item.completed" && row.item?.id === "item_1",
        );
        if (completed?.item) completed.item.tool = "get_overworld_session_context";
      },
      reason: /unpaired or invalid gameplay completion get_overworld_session_context/i,
    },
    {
      label: "gameplay before thread and turn startup",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const gameplay = rows.splice(3, 2);
        rows.unshift(...gameplay);
      },
      reason: /must begin with thread\.started then turn\.started/i,
    },
    {
      label: "fresh start arguments",
      mutate: (rows: ReturnType<typeof validRows>) => {
        for (const row of rows) {
          if (row.item?.id === "item_1") row.item.arguments = { invented: true };
        }
      },
      reason: /must begin gameplay with start_overworld and no arguments/i,
    },
    {
      label: "a failed first fresh start",
      mutate: (rows: ReturnType<typeof validRows>) => {
        const completed = rows.find(
          (row) => row.type === "item.completed" && row.item?.id === "item_1",
        );
        if (completed?.item) completed.item.status = "failed";
      },
      reason: /did not complete its first fresh start successfully/i,
    },
    {
      label: "a duplicate gameplay call id",
      mutate: (rows: ReturnType<typeof validRows>) => {
        rows.splice(-1, 0, ...gameplayCallRows("item_1", "get_overworld_session_context", {}));
      },
      reason: /invalid or duplicate gameplay call get_overworld_session_context/i,
    },
    {
      label: "an unpaired gameplay start",
      mutate: (rows: ReturnType<typeof validRows>) => {
        rows.splice(-1, 0, gameplayCallRows("item_2", "get_overworld_session_context", {})[0]!);
      },
      reason: /unpaired gameplay call item_2/i,
    },
    {
      label: "duplicate thread",
      mutate: (rows: ReturnType<typeof validRows>) =>
        rows.splice(1, 0, { type: "thread.started", thread_id: THREAD_ID }),
      reason:
        /must begin with thread\.started then turn\.started|exactly one valid thread identity/i,
    },
    {
      label: "incomplete turn",
      mutate: (rows: ReturnType<typeof validRows>) => rows.pop(),
      reason: /exactly one started and completed turn/i,
    },
  ])("rejects $label", ({ mutate, reason }) => {
    const rows = validRows();
    mutate(rows);
    expect(inspectCodexPureEvents(rows)).toEqual({
      ok: false,
      reason: expect.stringMatching(reason),
    });
  });

  it("rejects missing reports and malformed usage", () => {
    expect(
      buildCodexPureEnvelope({
        rows: validRows(),
        rolloutRows: completeRollout(forwardingRollout(undefined, { content: [] })),
        report: "",
        model: "gpt-5.6-sol",
        durationMs: 1,
      }),
    ).toEqual({ ok: false, reason: "Codex pure run produced no final report" });

    expect(
      buildCodexPureEnvelope({
        rows: validRows(),
        report: "report",
        model: "gpt-5.6-sol",
        durationMs: 1,
      }),
    ).toEqual({
      ok: false,
      reason: expect.stringMatching(/forwarding audit failed: rollout is empty/i),
    });

    const rows = validRows();
    const completed = rows.at(-1);
    if (completed?.usage) completed.usage.output_tokens = -1;
    expect(inspectCodexPureEvents(rows)).toEqual({
      ok: false,
      reason: "Codex completed turn is missing valid token usage",
    });
  });

  it("reports malformed private JSON by path and line without echoing hidden bytes", () => {
    const root = mkdtempSync(join(tmpdir(), "af-codex-json-sanitize-"));
    try {
      const events = join(root, "events.jsonl");
      const rollout = join(root, "rollout.jsonl");
      const report = join(root, "report.md");
      writeFileSync(events, '{"hidden_player_response":"SECRET_PLAYER_PAYLOAD"\n');
      writeFileSync(rollout, "{}\n");
      writeFileSync(report, "report\n");
      const result = spawnSync(
        process.execPath,
        [
          join(process.cwd(), "blind-tester", "codex-pure-envelope.mjs"),
          "--events",
          events,
          "--rollout",
          rollout,
          "--report",
          report,
          "--model",
          "gpt-5.6-sol",
          "--started-at-ms",
          "0",
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      const output = `${result.stdout}\n${result.stderr}`;
      expect(result.status).toBe(1);
      expect(output).toContain(`${events} contains invalid JSON at line 1`);
      expect(output).not.toContain("SECRET_PLAYER_PAYLOAD");
      expect(output).not.toContain("hidden_player_response");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
