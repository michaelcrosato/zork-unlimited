#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const THREAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ALLOWED_EVENT_TYPES = new Set([
  "thread.started",
  "turn.started",
  "item.started",
  "item.updated",
  "item.completed",
  "turn.completed",
]);
const ALLOWED_ITEM_TYPES = new Set(["agent_message", "reasoning", "mcp_tool_call"]);
const ALLOWED_ROLLOUT_NON_TOOL_RESPONSE_ITEMS = new Set(["message", "reasoning"]);
const ALLOWED_ROLLOUT_NON_TOOL_EVENTS = new Set([
  "task_started",
  "user_message",
  "agent_message",
  "token_count",
  "task_complete",
  "context_compacted",
]);
const ALLOWED_ROLLOUT_METADATA_ROWS = new Set([
  "session_meta",
  "world_state",
  "turn_context",
  "compacted",
]);
const LUNA_V1_MODEL = "gpt-5.6-luna";
const SPARK_DISABLED_MODEL = "gpt-5.3-codex-spark";
const SPARK_CODE_MODE_UNSTABLE_WARNING_PREFIX =
  "Under-development features enabled: code_mode_only. Under-development features are incomplete and may behave unpredictably. To suppress this warning, set `suppress_unstable_features_warning = true` in ";
const SPARK_CODE_MODE_METADATA_WARNING =
  "Code Mode is enabled in configuration, but model `gpt-5.3-codex-spark` does not advertise Code Mode support. This may degrade model performance. Disable `features.code_mode` and `features.code_mode_only`, or select a model whose metadata enables Code Mode.";
const V2_MULTI_AGENT_MODELS = new Set(["gpt-5.6-sol", "gpt-5.6-terra"]);
const SUPPORTED_CODEX_MODELS = new Set([
  ...V2_MULTI_AGENT_MODELS,
  LUNA_V1_MODEL,
  SPARK_DISABLED_MODEL,
]);
const MAX_ITEM_ID_LENGTH = 128;
// Keep this transport audit synchronized with the server's authoritative
// PURE_PLAYER_TOOLS set. A regression imports both sets and compares them.
export const CODEX_PURE_PLAYER_TOOLS = new Set([
  "start_overworld",
  "get_overworld_session",
  "get_overworld_session_context",
  "plan_overworld_session_route",
  "travel_overworld_session",
  "follow_overworld_session_goal",
  "resolve_overworld_session_road_encounter",
  "resupply_overworld_session",
  "rest_overworld_session",
  "scout_overworld_session_poi",
  "talk_overworld_session_contact",
  "investigate_overworld_session_event",
  "resolve_overworld_session_event",
  "explore_overworld_session_site",
  "explore_overworld_session_area",
  "move_overworld_session_area",
  "work_overworld_session_job",
  "start_overworld_session_quest",
  "choose_overworld_session_journey",
  "inspect_overworld_session_story",
  "choose_overworld_session_story",
  "get_observation",
  "list_legal_actions",
  "step_action",
]);

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function reject(reason) {
  return { ok: false, reason };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameJsonValue(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => sameJsonValue(entry, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && sameJsonValue(left[key], right[key]))
  );
}

function hasOnlyKeys(record, expected) {
  const keys = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  return (
    keys.length === sortedExpected.length &&
    keys.every((key, index) => key === sortedExpected[index])
  );
}

function validItemId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ITEM_ID_LENGTH;
}

function validMcpResult(value) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["content", "structured_content"]) &&
    Array.isArray(value.content) &&
    (value.structured_content === null || isRecord(value.structured_content))
  );
}

function validMcpError(value) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["message"]) &&
    typeof value.message === "string" &&
    value.message.length > 0
  );
}

function rolloutReject(reason) {
  return { ok: false, reason: `Codex gameplay-result forwarding audit failed: ${reason}` };
}

function gameplayResult(payload) {
  const result = payload?.result?.Ok;
  if (
    !isRecord(result) ||
    !(
      hasOnlyKeys(result, ["content"]) ||
      (hasOnlyKeys(result, ["content", "isError"]) && result.isError === true)
    ) ||
    !Array.isArray(result.content)
  ) {
    return null;
  }
  if (
    result.content.some(
      (block) =>
        !isRecord(block) ||
        !hasOnlyKeys(block, ["type", "text"]) ||
        block.type !== "text" ||
        typeof block.text !== "string",
    )
  ) {
    return null;
  }
  return result;
}

function objectPropertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function jsonLiteralValue(node) {
  if (ts.isParenthesizedExpression(node)) return jsonLiteralValue(node.expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { ok: true, value: node.text };
  }
  if (ts.isNumericLiteral(node)) {
    const value = Number(node.text);
    return Number.isFinite(value) ? { ok: true, value } : { ok: false };
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return { ok: true, value: true };
  if (node.kind === ts.SyntaxKind.FalseKeyword) return { ok: true, value: false };
  if (node.kind === ts.SyntaxKind.NullKeyword) return { ok: true, value: null };
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    const value = -Number(node.operand.text);
    return Number.isFinite(value) ? { ok: true, value } : { ok: false };
  }
  if (ts.isArrayLiteralExpression(node)) {
    const value = [];
    for (const element of node.elements) {
      if (ts.isSpreadElement(element)) return { ok: false };
      const parsed = jsonLiteralValue(element);
      if (!parsed.ok) return parsed;
      value.push(parsed.value);
    }
    return { ok: true, value };
  }
  if (ts.isObjectLiteralExpression(node)) {
    const value = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) return { ok: false };
      const key = objectPropertyName(property.name);
      if (key === null || key === "__proto__" || Object.hasOwn(value, key)) return { ok: false };
      const parsed = jsonLiteralValue(property.initializer);
      if (!parsed.ok) return parsed;
      Object.defineProperty(value, key, {
        value: parsed.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return { ok: true, value };
  }
  return { ok: false };
}

function unwrapParentheses(node) {
  let current = node;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

function exactProperty(expression, owner, property, { optional = false } = {}) {
  const value = unwrapParentheses(expression);
  return (
    ts.isPropertyAccessExpression(value) &&
    ts.isIdentifier(value.expression) &&
    value.expression.text === owner &&
    value.name.text === property &&
    (optional ? value.questionDotToken !== undefined : value.questionDotToken === undefined)
  );
}

function exactCallStatement(statement, callee, argument) {
  if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) {
    return false;
  }
  const call = statement.expression;
  return (
    call.questionDotToken === undefined &&
    ts.isIdentifier(call.expression) &&
    call.expression.text === callee &&
    call.arguments.length === 1 &&
    (typeof argument === "string"
      ? ts.isIdentifier(call.arguments[0]) && call.arguments[0].text === argument
      : argument(call.arguments[0]))
  );
}

function exactContentLoop(statement, variableName) {
  if (
    !ts.isForOfStatement(statement) ||
    statement.awaitModifier !== undefined ||
    !ts.isVariableDeclarationList(statement.initializer) ||
    (statement.initializer.flags & ts.NodeFlags.Const) === 0 ||
    statement.initializer.declarations.length !== 1
  ) {
    return false;
  }
  const declaration = statement.initializer.declarations[0];
  if (
    !ts.isIdentifier(declaration.name) ||
    declaration.name.text !== "c" ||
    declaration.initializer
  ) {
    return false;
  }
  const iterable = unwrapParentheses(statement.expression);
  if (
    !ts.isBinaryExpression(iterable) ||
    iterable.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken ||
    !exactProperty(iterable.left, variableName, "content", { optional: true }) ||
    !ts.isArrayLiteralExpression(iterable.right) ||
    iterable.right.elements.length !== 0 ||
    !ts.isBlock(statement.statement) ||
    statement.statement.statements.length !== 1
  ) {
    return false;
  }
  const imageBranch = statement.statement.statements[0];
  if (
    !ts.isIfStatement(imageBranch) ||
    !ts.isBinaryExpression(imageBranch.expression) ||
    imageBranch.expression.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken ||
    !exactProperty(imageBranch.expression.left, "c", "type") ||
    !ts.isStringLiteral(imageBranch.expression.right) ||
    imageBranch.expression.right.text !== "image" ||
    !exactCallStatement(imageBranch.thenStatement, "image", "c") ||
    !imageBranch.elseStatement ||
    !ts.isIfStatement(imageBranch.elseStatement)
  ) {
    return false;
  }
  const textBranch = imageBranch.elseStatement;
  return (
    ts.isBinaryExpression(textBranch.expression) &&
    textBranch.expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
    exactProperty(textBranch.expression.left, "c", "type") &&
    ts.isStringLiteral(textBranch.expression.right) &&
    textBranch.expression.right.text === "text" &&
    exactCallStatement(textBranch.thenStatement, "text", (argument) =>
      exactProperty(argument, "c", "text"),
    ) &&
    textBranch.elseStatement === undefined
  );
}

function exactResultEmitter(statement, variableName) {
  if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)) {
    const call = statement.expression;
    if (
      call.questionDotToken === undefined &&
      ts.isIdentifier(call.expression) &&
      call.expression.text === "text" &&
      call.arguments.length === 1
    ) {
      const value = call.arguments[0];
      if (ts.isIdentifier(value) && value.text === variableName) return "json_result";
      if (
        ts.isCallExpression(value) &&
        value.questionDotToken === undefined &&
        ts.isPropertyAccessExpression(value.expression) &&
        value.expression.questionDotToken === undefined &&
        ts.isIdentifier(value.expression.expression) &&
        value.expression.expression.text === "JSON" &&
        value.expression.name.text === "stringify" &&
        value.arguments.length === 1 &&
        ts.isIdentifier(value.arguments[0]) &&
        value.arguments[0].text === variableName
      ) {
        return "json_result";
      }
    }
    return null;
  }

  // Preserve the exact historical code-mode renderer used by clean seed4351.
  // New prompts use the single text(JSON.stringify(result)) emitter above.
  return exactContentLoop(statement, variableName) ? "content_blocks" : null;
}

function inspectExactGameplayWrapper(
  input,
  invocation,
  { allowArgumentlessFreshStart = false } = {},
) {
  const source = ts.createSourceFile(
    "blind-wrapper.js",
    input,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.JS,
  );
  if (source.parseDiagnostics.length > 0 || source.statements.length !== 2) return null;
  const declarationStatement = source.statements[0];
  if (
    !ts.isVariableStatement(declarationStatement) ||
    declarationStatement.modifiers?.length > 0 ||
    (declarationStatement.declarationList.flags & ts.NodeFlags.Const) === 0 ||
    declarationStatement.declarationList.declarations.length !== 1
  ) {
    return null;
  }
  const declaration = declarationStatement.declarationList.declarations[0];
  if (
    !ts.isIdentifier(declaration.name) ||
    !declaration.initializer ||
    !ts.isAwaitExpression(declaration.initializer) ||
    !ts.isCallExpression(declaration.initializer.expression)
  ) {
    return null;
  }
  const call = declaration.initializer.expression;
  if (
    !ts.isPropertyAccessExpression(call.expression) ||
    call.questionDotToken !== undefined ||
    call.expression.questionDotToken !== undefined ||
    !ts.isIdentifier(call.expression.expression) ||
    call.expression.expression.text !== "tools" ||
    !call.expression.name.text.startsWith("mcp__adventureforge__")
  ) {
    return null;
  }
  const tool = call.expression.name.text.slice("mcp__adventureforge__".length);
  const args =
    call.arguments.length === 1
      ? jsonLiteralValue(call.arguments[0])
      : call.arguments.length === 0 && allowArgumentlessFreshStart && tool === "start_overworld"
        ? { ok: true, value: {} }
        : { ok: false };
  if (
    !CODEX_PURE_PLAYER_TOOLS.has(tool) ||
    !args.ok ||
    !isRecord(args.value) ||
    invocation.server !== "adventureforge" ||
    invocation.tool !== tool ||
    !sameJsonValue(invocation.arguments, args.value)
  ) {
    return null;
  }
  const emitter = exactResultEmitter(source.statements[1], declaration.name.text);
  return emitter === null ? null : { tool, arguments: args.value, emitter };
}

const WRAPPER_BANNER_RE = /^Script completed\nWall time \d+(?:\.\d+)? seconds\nOutput:\n$/u;

function exactForwardedOutput(output, result, emitter) {
  if (!Array.isArray(output) || output.length < 2) return false;
  if (
    output.some(
      (block) =>
        !isRecord(block) ||
        !hasOnlyKeys(block, ["type", "text"]) ||
        block.type !== "input_text" ||
        typeof block.text !== "string",
    )
  ) {
    return false;
  }
  if (!WRAPPER_BANNER_RE.test(output[0].text)) return false;
  const visible = output.slice(1).map((block) => block.text);
  if (emitter === "content_blocks") {
    if (result.isError === true) return false;
    return sameJsonValue(
      visible,
      result.content.filter((block) => block.type === "text").map((block) => block.text),
    );
  }
  return visible.length === 1 && visible[0] === JSON.stringify(result);
}

function privateGameplayLifecycle(payload, result) {
  return {
    tool: payload.invocation.tool,
    arguments: payload.invocation.arguments,
    status: result.isError === true ? "failed" : "completed",
    result: { content: result.content },
    error: null,
  };
}

function exactRolloutReplay(initial, replay) {
  if (!isRecord(initial) || !isRecord(replay)) return false;
  const initialKeys = Object.keys(initial).sort();
  const replayKeys = Object.keys(replay).sort();
  return (
    sameJsonValue(initialKeys, replayKeys) &&
    initialKeys.every(
      (key) =>
        key === "timestamp" ||
        (Object.hasOwn(replay, key) && sameJsonValue(initial[key], replay[key])),
    )
  );
}

function validPrivateInputMessage(payload, role, turnId) {
  if (
    !isRecord(payload) ||
    !hasOnlyKeys(payload, [
      "type",
      "role",
      "content",
      "internal_chat_message_metadata_passthrough",
    ]) ||
    payload.type !== "message" ||
    payload.role !== role ||
    !Array.isArray(payload.content) ||
    payload.content.length === 0 ||
    !isRecord(payload.internal_chat_message_metadata_passthrough) ||
    !hasOnlyKeys(payload.internal_chat_message_metadata_passthrough, ["turn_id"]) ||
    payload.internal_chat_message_metadata_passthrough.turn_id !== turnId
  ) {
    return false;
  }
  return payload.content.every(
    (block) =>
      isRecord(block) &&
      hasOnlyKeys(block, ["type", "text"]) &&
      block.type === "input_text" &&
      typeof block.text === "string",
  );
}

function exactTaggedInputBlock(block, tag) {
  return (
    isRecord(block) &&
    hasOnlyKeys(block, ["type", "text"]) &&
    block.type === "input_text" &&
    typeof block.text === "string" &&
    block.text.startsWith(`<${tag}>`) &&
    block.text.endsWith(`</${tag}>`)
  );
}

function validPermissionsAndSkillsMessage(payload, turnId) {
  return (
    validPrivateInputMessage(payload, "developer", turnId) &&
    payload.content.length === 2 &&
    exactTaggedInputBlock(payload.content[0], "permissions instructions") &&
    exactTaggedInputBlock(payload.content[1], "skills_instructions")
  );
}

function validSingleInputMessage(payload, role, turnId, predicate) {
  return (
    validPrivateInputMessage(payload, role, turnId) &&
    payload.content.length === 1 &&
    predicate(payload.content[0].text)
  );
}

function validV2TeamMessage(payload, turnId) {
  return validSingleInputMessage(payload, "developer", turnId, (text) =>
    text.startsWith(
      "You are `/root`, the primary agent in a team of agents collaborating to fulfill the user's goals.",
    ),
  );
}

function validV2MultiAgentModeMessage(payload, turnId) {
  return validSingleInputMessage(
    payload,
    "developer",
    turnId,
    (text) => text.startsWith("<multi_agent_mode>") && text.endsWith("</multi_agent_mode>"),
  );
}

function validEnvironmentMessage(payload, turnId) {
  return validSingleInputMessage(
    payload,
    "user",
    turnId,
    (text) => text.startsWith("<environment_context>") && text.endsWith("</environment_context>"),
  );
}

function validNativeCollaborationMode(turnContext, expectedModel) {
  if (
    turnContext.effort !== "xhigh" ||
    !isRecord(turnContext.collaboration_mode) ||
    !hasOnlyKeys(turnContext.collaboration_mode, ["mode", "settings"]) ||
    turnContext.collaboration_mode.mode !== "default" ||
    !isRecord(turnContext.collaboration_mode.settings) ||
    !hasOnlyKeys(turnContext.collaboration_mode.settings, [
      "model",
      "reasoning_effort",
      "developer_instructions",
    ])
  ) {
    return false;
  }
  const settings = turnContext.collaboration_mode.settings;
  return (
    settings.model === turnContext.model &&
    (expectedModel === undefined || settings.model === expectedModel) &&
    settings.reasoning_effort === turnContext.effort &&
    settings.developer_instructions === null
  );
}

function codexCaptureProfile(turnContext, expectedModel) {
  if (!isRecord(turnContext) || typeof turnContext.model !== "string") return null;
  if (expectedModel !== undefined && turnContext.model !== expectedModel) return null;
  if (!validNativeCollaborationMode(turnContext, expectedModel)) return null;
  if (
    turnContext.model === LUNA_V1_MODEL &&
    turnContext.multi_agent_version === "v1" &&
    !Object.hasOwn(turnContext, "multi_agent_mode")
  ) {
    return { kind: "luna_v1", preludeCount: 2 };
  }
  if (
    turnContext.model === SPARK_DISABLED_MODEL &&
    turnContext.multi_agent_version === "disabled" &&
    !Object.hasOwn(turnContext, "multi_agent_mode")
  ) {
    return { kind: "spark_disabled", preludeCount: 2 };
  }
  if (
    V2_MULTI_AGENT_MODELS.has(turnContext.model) &&
    turnContext.multi_agent_version === "v2" &&
    turnContext.multi_agent_mode === "explicitRequestOnly"
  ) {
    return { kind: "multi_agent_v2", preludeCount: 4 };
  }
  return null;
}

function validPrivateAssistantMessage(payload, turnId) {
  return (
    isRecord(payload) &&
    hasOnlyKeys(payload, [
      "type",
      "id",
      "role",
      "content",
      "phase",
      "internal_chat_message_metadata_passthrough",
    ]) &&
    payload.type === "message" &&
    typeof payload.id === "string" &&
    payload.id.length > 0 &&
    payload.role === "assistant" &&
    (payload.phase === "commentary" || payload.phase === "final_answer") &&
    isRecord(payload.internal_chat_message_metadata_passthrough) &&
    hasOnlyKeys(payload.internal_chat_message_metadata_passthrough, ["turn_id"]) &&
    payload.internal_chat_message_metadata_passthrough.turn_id === turnId &&
    Array.isArray(payload.content) &&
    payload.content.length > 0 &&
    payload.content.every(
      (block) =>
        isRecord(block) &&
        hasOnlyKeys(block, ["type", "text"]) &&
        block.type === "output_text" &&
        typeof block.text === "string",
    )
  );
}

function validPrivateReasoning(payload, turnId) {
  return (
    isRecord(payload) &&
    hasOnlyKeys(payload, [
      "type",
      "id",
      "summary",
      "encrypted_content",
      "internal_chat_message_metadata_passthrough",
    ]) &&
    payload.type === "reasoning" &&
    typeof payload.id === "string" &&
    payload.id.length > 0 &&
    Array.isArray(payload.summary) &&
    payload.summary.length === 0 &&
    typeof payload.encrypted_content === "string" &&
    isRecord(payload.internal_chat_message_metadata_passthrough) &&
    hasOnlyKeys(payload.internal_chat_message_metadata_passthrough, ["turn_id"]) &&
    payload.internal_chat_message_metadata_passthrough.turn_id === turnId
  );
}

function validTurnMetadata(metadata, turnId) {
  return isRecord(metadata) && hasOnlyKeys(metadata, ["turn_id"]) && metadata.turn_id === turnId;
}

function validPrivateWrapperPayload(payload, turnId) {
  return (
    isRecord(payload) &&
    hasOnlyKeys(payload, [
      "type",
      "id",
      "status",
      "call_id",
      "name",
      "input",
      "internal_chat_message_metadata_passthrough",
    ]) &&
    validTurnMetadata(payload.internal_chat_message_metadata_passthrough, turnId)
  );
}

function validPrivateWrapperOutputPayload(payload, turnId) {
  return (
    isRecord(payload) &&
    hasOnlyKeys(payload, [
      "type",
      "call_id",
      "output",
      "internal_chat_message_metadata_passthrough",
    ]) &&
    validTurnMetadata(payload.internal_chat_message_metadata_passthrough, turnId)
  );
}

function inspectCodexRolloutStructure(rows, expectedModel) {
  if (!Array.isArray(rows) || rows.length === 0) return rolloutReject("rollout is empty");
  const indices = {
    sessions: [],
    taskStarts: [],
    taskCompletes: [],
    userEvents: [],
    contextCompactedEvents: [],
    worldStates: [],
    turnContexts: [],
    compactions: [],
    gameplay: [],
    wrapperOutputs: [],
    promptMessages: [],
    assistantMessages: [],
    reasoningItems: [],
  };
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const payload = row?.payload;
    if (row?.type === "session_meta") indices.sessions.push(index);
    if (row?.type === "world_state") indices.worldStates.push(index);
    if (row?.type === "turn_context") indices.turnContexts.push(index);
    if (row?.type === "compacted") indices.compactions.push(index);
    if (row?.type === "event_msg") {
      if (payload?.type === "task_started") indices.taskStarts.push(index);
      if (payload?.type === "task_complete") indices.taskCompletes.push(index);
      if (payload?.type === "user_message") indices.userEvents.push(index);
      if (payload?.type === "context_compacted") indices.contextCompactedEvents.push(index);
    }
    if (row?.type === "response_item" && payload?.type === "custom_tool_call") {
      indices.gameplay.push(index);
    }
    if (row?.type === "response_item" && payload?.type === "custom_tool_call_output") {
      indices.wrapperOutputs.push(index);
    }
    if (row?.type === "response_item" && payload?.type === "message") {
      if (!new Set(["developer", "user", "assistant"]).has(payload.role)) {
        return rolloutReject(`private message has a forbidden role at rollout row ${index + 1}`);
      }
      if (payload.role === "developer" || payload.role === "user") {
        indices.promptMessages.push(index);
      } else {
        indices.assistantMessages.push(index);
      }
    }
    if (row?.type === "response_item" && payload?.type === "reasoning") {
      indices.reasoningItems.push(index);
    }
  }
  if (indices.sessions.length !== 1 || indices.sessions[0] !== 0) {
    return rolloutReject("rollout requires exactly one leading session_meta");
  }
  if (indices.taskStarts.length !== 1 || indices.taskCompletes.length !== 1) {
    return rolloutReject("rollout requires exactly one task_started and task_complete");
  }
  if (indices.taskCompletes[0] !== rows.length - 1) {
    return rolloutReject("rollout task_complete must be the final row");
  }
  if (indices.userEvents.length !== 1 || indices.gameplay.length === 0) {
    return rolloutReject("rollout requires exactly one user_message before gameplay");
  }
  if (indices.worldStates.length === 0 || indices.turnContexts.length === 0) {
    return rolloutReject("rollout requires one initial world_state and turn_context");
  }
  const initialWorldState = indices.worldStates[0];
  const initialTurnContext = indices.turnContexts[0];
  const userEvent = indices.userEvents[0];
  const firstGameplay = indices.gameplay[0];
  const promptMessageIndex = userEvent - 1;
  const promptMessage = rows[promptMessageIndex]?.payload;
  const promptEvent = rows[userEvent]?.payload;
  const promptContent = promptMessage?.content;
  const promptBlock = Array.isArray(promptContent) ? promptContent[0] : null;
  const turnId = rows[initialTurnContext]?.payload?.turn_id;
  const profile = codexCaptureProfile(rows[initialTurnContext]?.payload, expectedModel);
  if (profile === null) {
    return rolloutReject("rollout model and multi-agent capture profile is unsupported");
  }
  const preludeIndices = Array.from(
    { length: profile.preludeCount },
    (_, index) => indices.taskStarts[0] + index + 1,
  );
  const expectedPromptIndices = [...preludeIndices, promptMessageIndex];
  const validPrelude =
    validPermissionsAndSkillsMessage(rows[preludeIndices[0]]?.payload, turnId) &&
    (profile.kind !== "multi_agent_v2"
      ? validEnvironmentMessage(rows[preludeIndices[1]]?.payload, turnId)
      : validV2TeamMessage(rows[preludeIndices[1]]?.payload, turnId) &&
        validV2MultiAgentModeMessage(rows[preludeIndices[2]]?.payload, turnId) &&
        validEnvironmentMessage(rows[preludeIndices[3]]?.payload, turnId));
  if (
    !(
      indices.taskStarts[0] === 1 &&
      indices.taskStarts[0] < initialWorldState &&
      initialWorldState === indices.taskStarts[0] + profile.preludeCount + 1 &&
      initialWorldState + 1 === initialTurnContext &&
      initialTurnContext + 1 === promptMessageIndex &&
      promptMessageIndex + 1 === userEvent &&
      userEvent < firstGameplay &&
      firstGameplay < indices.taskCompletes[0]
    ) ||
    typeof turnId !== "string" ||
    rows[indices.taskStarts[0]]?.payload?.turn_id !== turnId ||
    rows[indices.taskCompletes[0]]?.payload?.turn_id !== turnId ||
    !sameJsonValue(indices.promptMessages, expectedPromptIndices) ||
    !validPrelude ||
    !validPrivateInputMessage(promptMessage, "user", turnId) ||
    indices.gameplay.some((index) => !validPrivateWrapperPayload(rows[index]?.payload, turnId)) ||
    indices.wrapperOutputs.some(
      (index) => !validPrivateWrapperOutputPayload(rows[index]?.payload, turnId),
    ) ||
    indices.assistantMessages.some(
      (index) => !validPrivateAssistantMessage(rows[index]?.payload, turnId),
    ) ||
    indices.reasoningItems.some((index) => !validPrivateReasoning(rows[index]?.payload, turnId)) ||
    !Array.isArray(promptContent) ||
    promptContent.length !== 1 ||
    !isRecord(promptBlock) ||
    !hasOnlyKeys(promptBlock, ["type", "text"]) ||
    promptBlock.type !== "input_text" ||
    typeof promptBlock.text !== "string" ||
    promptBlock.text !== promptEvent?.message ||
    !isRecord(promptEvent) ||
    !hasOnlyKeys(promptEvent, ["type", "message", "images", "local_images", "text_elements"]) ||
    !Array.isArray(promptEvent.images) ||
    promptEvent.images.length !== 0 ||
    !Array.isArray(promptEvent.local_images) ||
    promptEvent.local_images.length !== 0 ||
    !Array.isArray(promptEvent.text_elements) ||
    promptEvent.text_elements.length !== 0
  ) {
    return rolloutReject("rollout input and initial context lifecycle is out of order");
  }

  const replayWorldStates = new Set();
  const replayCompactions = new Set();
  const initialContextRow = rows[initialTurnContext];
  for (const contextIndex of indices.turnContexts.slice(1)) {
    const compactionIndex = contextIndex - 2;
    const worldStateIndex = contextIndex - 1;
    if (
      rows[compactionIndex]?.type !== "compacted" ||
      rows[worldStateIndex]?.type !== "world_state" ||
      contextIndex >= indices.taskCompletes[0] ||
      !exactRolloutReplay(initialContextRow, rows[contextIndex])
    ) {
      return rolloutReject("rollout contains an invalid compacted context replay");
    }
    replayCompactions.add(compactionIndex);
    replayWorldStates.add(worldStateIndex);
  }
  if (
    indices.worldStates.some(
      (index) => index !== initialWorldState && !replayWorldStates.has(index),
    ) ||
    indices.compactions.some((index) => !replayCompactions.has(index)) ||
    indices.contextCompactedEvents.length !== replayCompactions.size
  ) {
    return rolloutReject("rollout contains orphan context or world-state rows");
  }
  const compactionOrder = [...replayCompactions].sort((left, right) => left - right);
  for (let index = 0; index < compactionOrder.length; index += 1) {
    const afterReplay = compactionOrder[index] + 2;
    const beforeNext = compactionOrder[index + 1] ?? indices.taskCompletes[0];
    const matchingEvents = indices.contextCompactedEvents.filter(
      (eventIndex) => eventIndex > afterReplay && eventIndex < beforeNext,
    );
    if (matchingEvents.length !== 1) {
      return rolloutReject("rollout context_compacted lifecycle is out of order");
    }
  }
  return { ok: true };
}

/**
 * Verify the private Codex rollout proves that every AdventureForge result was
 * made visible to the player before another action could be chosen. The runner
 * records the corresponding wrapper output immediately after each MCP result;
 * the two call-id namespaces differ, so adjacency is the binding. This audit
 * deliberately never include game-response bytes in a rejection reason.
 */
export function inspectCodexGameplayResultForwarding(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return rolloutReject("rollout is empty");
  }

  const gameplayCalls = [];
  const gameplayCallIds = new Set();
  const wrapperCallIds = new Set();
  const wrapperItemIds = new Set();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowPayload = row?.payload;
    if (row?.type === "response_item" && rowPayload?.type !== "custom_tool_call") {
      if (rowPayload?.type === "custom_tool_call_output") {
        return rolloutReject(`orphan or unexpected tool lifecycle at rollout row ${index + 1}`);
      }
      if (!ALLOWED_ROLLOUT_NON_TOOL_RESPONSE_ITEMS.has(rowPayload?.type)) {
        return rolloutReject(
          `forbidden private response item ${String(rowPayload?.type)} at rollout row ${index + 1}`,
        );
      }
      continue;
    }
    if (row?.type === "event_msg") {
      if (typeof rowPayload?.type === "string" && rowPayload.type.startsWith("mcp_tool_call_")) {
        return rolloutReject(`orphan or unexpected tool lifecycle at rollout row ${index + 1}`);
      }
      if (!ALLOWED_ROLLOUT_NON_TOOL_EVENTS.has(rowPayload?.type)) {
        return rolloutReject(`forbidden private event at rollout row ${index + 1}`);
      }
      continue;
    }
    if (row?.type !== "response_item") {
      if (!ALLOWED_ROLLOUT_METADATA_ROWS.has(row?.type)) {
        return rolloutReject(`forbidden private rollout row at position ${index + 1}`);
      }
      continue;
    }
    const ordinal = gameplayCalls.length + 1;
    if (
      rowPayload.name !== "exec" ||
      rowPayload.status !== "completed" ||
      typeof rowPayload.input !== "string" ||
      typeof rowPayload.call_id !== "string" ||
      rowPayload.call_id.length === 0 ||
      typeof rowPayload.id !== "string" ||
      rowPayload.id.length === 0 ||
      wrapperCallIds.has(rowPayload.call_id) ||
      wrapperItemIds.has(rowPayload.id)
    ) {
      return rolloutReject(`gameplay call ${ordinal} has an invalid or duplicate wrapper start`);
    }
    wrapperCallIds.add(rowPayload.call_id);
    wrapperItemIds.add(rowPayload.id);

    const completion = rows[index + 1];
    const payload = completion?.payload;
    if (completion?.type !== "event_msg" || payload?.type !== "mcp_tool_call_end") {
      return rolloutReject(`gameplay call ${ordinal} has no immediate MCP completion`);
    }
    if (
      typeof payload.call_id !== "string" ||
      payload.call_id.length === 0 ||
      gameplayCallIds.has(payload.call_id) ||
      payload.call_id === rowPayload.call_id ||
      !isRecord(payload.invocation) ||
      !isRecord(payload.invocation.arguments)
    ) {
      return rolloutReject(`gameplay call ${ordinal} has an invalid or duplicate MCP call id`);
    }
    gameplayCallIds.add(payload.call_id);
    const wrapper = inspectExactGameplayWrapper(rowPayload.input, payload.invocation, {
      allowArgumentlessFreshStart: gameplayCalls.length === 0,
    });
    if (!wrapper) {
      return rolloutReject(`gameplay call ${ordinal} used a forbidden wrapper program`);
    }
    const result = gameplayResult(payload);
    if (!result) {
      return rolloutReject(`gameplay call ${ordinal} has no auditable successful result`);
    }
    const forwarded = rows[index + 2];
    if (
      forwarded?.type !== "response_item" ||
      forwarded?.payload?.type !== "custom_tool_call_output"
    ) {
      return rolloutReject(`gameplay call ${ordinal} has no paired visible result output`);
    }
    if (
      forwarded.payload.call_id !== rowPayload.call_id ||
      !exactForwardedOutput(forwarded.payload.output, result, wrapper.emitter)
    ) {
      return rolloutReject(
        `gameplay call ${ordinal} has a missing, mismatched, or truncated output`,
      );
    }
    gameplayCalls.push(privateGameplayLifecycle(payload, result));
    index += 2;
  }

  if (gameplayCalls.length === 0)
    return rolloutReject("rollout contains no AdventureForge gameplay result");
  return { ok: true, completedGameplayCalls: gameplayCalls.length, gameplayCalls };
}

function validGameplayCallStart(item) {
  return (
    isRecord(item) &&
    hasOnlyKeys(item, ["id", "type", "server", "tool", "arguments", "result", "error", "status"]) &&
    validItemId(item.id) &&
    item.type === "mcp_tool_call" &&
    item.server === "adventureforge" &&
    typeof item.tool === "string" &&
    CODEX_PURE_PLAYER_TOOLS.has(item.tool) &&
    isRecord(item.arguments) &&
    item.status === "in_progress" &&
    item.result === null &&
    item.error === null
  );
}

function validGameplayCallCompletion(item, started) {
  if (
    !isRecord(item) ||
    !hasOnlyKeys(item, [
      "id",
      "type",
      "server",
      "tool",
      "arguments",
      "result",
      "error",
      "status",
    ]) ||
    !validItemId(item.id) ||
    item.type !== "mcp_tool_call" ||
    item.id !== started.id ||
    item.server !== started.server ||
    item.tool !== started.tool ||
    !sameJsonValue(item.arguments, started.arguments)
  ) {
    return false;
  }
  if (item.status === "completed") {
    return validMcpResult(item.result) && item.error === null;
  }
  if (item.status === "failed") {
    return (
      (validMcpResult(item.result) && item.error === null) ||
      (item.result === null && validMcpError(item.error))
    );
  }
  return false;
}

function publicGameplayLifecycle(item) {
  return {
    tool: item.tool,
    arguments: item.arguments,
    status: item.status,
    result: item.result === null ? null : { content: item.result.content },
    error: item.error,
  };
}

function validCodeModeWarningRow(row, ordinal) {
  if (
    !isRecord(row) ||
    !hasOnlyKeys(row, ["type", "item"]) ||
    row.type !== "item.completed" ||
    !isRecord(row.item) ||
    !hasOnlyKeys(row.item, ["id", "type", "message"]) ||
    !validItemId(row.item.id) ||
    row.item.type !== "error" ||
    typeof row.item.message !== "string"
  ) {
    return false;
  }
  if (ordinal === 0) {
    if (!row.item.message.startsWith(SPARK_CODE_MODE_UNSTABLE_WARNING_PREFIX)) return false;
    const configPath = row.item.message.slice(SPARK_CODE_MODE_UNSTABLE_WARNING_PREFIX.length);
    return (
      configPath.length > 0 &&
      configPath.length <= 4096 &&
      !/[\r\n]/u.test(configPath) &&
      /^(?:[A-Za-z]:[\\/]|[\\/])(?:(?!\.{1,2}[\\/])[^\\/\r\n]+[\\/])*\.tmp[\\/]blind-codex-home[\\/]tmp\.[A-Za-z0-9]{10}[\\/]config\.toml\.$/u.test(
        configPath,
      )
    );
  }
  return ordinal === 1 && row.item.message === SPARK_CODE_MODE_METADATA_WARNING;
}

function codeModePrelude(rows, expectedModel) {
  if (!SUPPORTED_CODEX_MODELS.has(expectedModel) || !validCodeModeWarningRow(rows[1], 0)) {
    return [];
  }
  if (expectedModel !== SPARK_DISABLED_MODEL) return [rows[1]];
  if (!validCodeModeWarningRow(rows[2], 1) || rows[1].item.id === rows[2].item.id) {
    return [];
  }
  return [rows[1], rows[2]];
}

/**
 * Authenticate the useful subset of `codex exec --json` and fail closed on any
 * tool surface outside the runner-owned AdventureForge MCP server.
 */
export function inspectCodexPureEvents(rows, expectedModel = undefined) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return reject("Codex event stream is empty");
  }

  const allowedCodeModePrelude = codeModePrelude(rows, expectedModel);
  const turnStartedIndex = 1 + allowedCodeModePrelude.length;
  if (rows[0]?.type !== "thread.started" || rows[turnStartedIndex]?.type !== "turn.started") {
    return reject("Codex pure run must begin with thread.started then turn.started");
  }
  const threadRows = [];
  const turnStartedRows = [];
  const turnCompletedRows = [];
  let completedMcpCalls = 0;
  let gameplayCallsStarted = 0;
  let freshStartCompleted = false;
  const gameplayCalls = new Map();
  const completedGameplayCalls = [];
  const mcpCallIds = new Set();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      return reject("Codex event stream contains a non-object row");
    }
    if (!ALLOWED_EVENT_TYPES.has(row.type)) {
      return reject(`Codex event stream contains forbidden event type ${String(row.type)}`);
    }

    if (index > 0 && index <= allowedCodeModePrelude.length) continue;

    if (row.type === "thread.started") threadRows.push(row);
    if (row.type === "turn.started") turnStartedRows.push(row);
    if (row.type === "turn.completed") turnCompletedRows.push(row);

    if (
      row.type === "item.started" ||
      row.type === "item.updated" ||
      row.type === "item.completed"
    ) {
      const item = row.item;
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        return reject("Codex item event is missing its item object");
      }
      if (!ALLOWED_ITEM_TYPES.has(item.type)) {
        return reject(`Codex pure run used forbidden item type ${String(item.type)}`);
      }
      if (row.type === "item.updated") {
        return reject(`Codex pure run used an unexpected item.updated lifecycle for ${item.type}`);
      }
      if (item.type === "mcp_tool_call") {
        if (row.type === "item.started") {
          if (item.server !== "adventureforge") {
            return reject(`Codex pure run called forbidden MCP server ${String(item.server)}`);
          }
          if (typeof item.tool !== "string" || item.tool.length === 0) {
            return reject("Codex AdventureForge call is missing its tool name");
          }
          if (!CODEX_PURE_PLAYER_TOOLS.has(item.tool)) {
            return reject(`Codex pure run called forbidden AdventureForge tool ${item.tool}`);
          }
          if (!validGameplayCallStart(item) || mcpCallIds.has(item.id)) {
            return reject(`Codex pure run used an invalid or duplicate gameplay call ${item.tool}`);
          }
          if (gameplayCallsStarted === 0) {
            if (item.tool !== "start_overworld" || !sameJsonValue(item.arguments, {})) {
              return reject(
                "Codex pure run must begin gameplay with start_overworld and no arguments",
              );
            }
          } else if (!freshStartCompleted) {
            return reject("Codex pure run used gameplay before a successful fresh start completed");
          }
          gameplayCallsStarted += 1;
          mcpCallIds.add(item.id);
          gameplayCalls.set(item.id, item);
        } else {
          const started = gameplayCalls.get(item.id);
          if (
            !started ||
            started.completed === true ||
            !validGameplayCallCompletion(item, started)
          ) {
            return reject(
              `Codex pure run used an unpaired or invalid gameplay completion ${String(item.tool)}`,
            );
          }
          if (gameplayCallsStarted === 1 && started.tool === "start_overworld") {
            if (item.status !== "completed") {
              return reject("Codex pure run did not complete its first fresh start successfully");
            }
            freshStartCompleted = true;
          } else if (!freshStartCompleted) {
            return reject("Codex pure run completed gameplay before a successful fresh start");
          }
          gameplayCalls.set(item.id, { ...started, completed: true });
          completedGameplayCalls.push(publicGameplayLifecycle(item));
          completedMcpCalls += 1;
        }
      }
    }
  }

  if (threadRows.length !== 1 || !THREAD_ID_RE.test(threadRows[0]?.thread_id ?? "")) {
    return reject("Codex pure run requires exactly one valid thread identity");
  }
  if (turnStartedRows.length !== 1 || turnCompletedRows.length !== 1) {
    return reject("Codex pure run requires exactly one started and completed turn");
  }
  if (rows.at(-1)?.type !== "turn.completed") {
    return reject("Codex pure run did not close with turn.completed");
  }
  if (!freshStartCompleted) {
    return reject("Codex pure run did not complete one successful fresh start");
  }
  for (const [id, call] of gameplayCalls) {
    if (call.completed !== true) {
      return reject(`Codex pure run used an unpaired gameplay call ${id}`);
    }
  }
  const usage = turnCompletedRows[0]?.usage;
  if (
    usage === null ||
    typeof usage !== "object" ||
    Array.isArray(usage) ||
    !nonNegativeInteger(usage.input_tokens) ||
    !nonNegativeInteger(usage.cached_input_tokens) ||
    !nonNegativeInteger(usage.output_tokens)
  ) {
    return reject("Codex completed turn is missing valid token usage");
  }

  return {
    ok: true,
    threadId: threadRows[0].thread_id,
    completedMcpCalls,
    gameplayCalls: completedGameplayCalls,
    usage: {
      input_tokens: usage.input_tokens,
      cached_input_tokens: usage.cached_input_tokens,
      output_tokens: usage.output_tokens,
      reasoning_output_tokens: nonNegativeInteger(usage.reasoning_output_tokens)
        ? usage.reasoning_output_tokens
        : 0,
    },
  };
}

/** Cross-bind the public Codex event stream to the private raw wrapper trace. */
export function inspectCodexPureEvidence(publicRows, rolloutRows, expectedModel = undefined) {
  const publicEvidence = inspectCodexPureEvents(publicRows, expectedModel);
  if (!publicEvidence.ok) return publicEvidence;
  const rolloutStructure = inspectCodexRolloutStructure(rolloutRows, expectedModel);
  if (!rolloutStructure.ok) return rolloutStructure;
  const privateEvidence = inspectCodexGameplayResultForwarding(rolloutRows);
  if (!privateEvidence.ok) return privateEvidence;
  if (publicEvidence.gameplayCalls.length !== privateEvidence.gameplayCalls.length) {
    return reject("Codex public/private gameplay lifecycle count differs");
  }
  for (let index = 0; index < publicEvidence.gameplayCalls.length; index += 1) {
    if (!sameJsonValue(publicEvidence.gameplayCalls[index], privateEvidence.gameplayCalls[index])) {
      return reject(`Codex public/private gameplay lifecycle differs at call ${index + 1}`);
    }
  }
  return publicEvidence;
}

export function buildCodexPureEnvelope({ rows, rolloutRows, report, model, durationMs }) {
  if (typeof report !== "string" || report.trim().length === 0) {
    return reject("Codex pure run produced no final report");
  }
  if (typeof model !== "string" || !SUPPORTED_CODEX_MODELS.has(model)) {
    return reject("Codex pure run is missing its requested model");
  }
  if (!nonNegativeInteger(durationMs)) {
    return reject("Codex pure run is missing a valid duration");
  }
  const inspected = inspectCodexPureEvidence(rows, rolloutRows, model);
  if (!inspected.ok) return inspected;

  const usage = {
    input_tokens: inspected.usage.input_tokens,
    cache_read_input_tokens: inspected.usage.cached_input_tokens,
    output_tokens: inspected.usage.output_tokens,
    reasoning_output_tokens: inspected.usage.reasoning_output_tokens,
  };
  return {
    ok: true,
    envelope: {
      type: "result",
      subtype: "success",
      provider: "codex",
      is_error: false,
      duration_ms: durationMs,
      num_turns: inspected.completedMcpCalls,
      result: report,
      session_id: inspected.threadId,
      requested_model: model,
      terminal_reason: "completed",
      usage,
      modelUsage: {
        [model]: {
          inputTokens: inspected.usage.input_tokens,
          cacheReadInputTokens: inspected.usage.cached_input_tokens,
          outputTokens: inspected.usage.output_tokens,
          reasoningOutputTokens: inspected.usage.reasoning_output_tokens,
        },
      },
    },
  };
}

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function parseEventRows(path, label) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/u);
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim().length === 0) continue;
    try {
      rows.push(JSON.parse(lines[index]));
    } catch {
      throw new Error(`${label} ${path} contains invalid JSON at line ${index + 1}`);
    }
  }
  if (rows.length === 0) throw new Error(`${label} ${path} is empty`);
  return rows;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--print-tools-toml")) {
    process.stdout.write(`${JSON.stringify([...CODEX_PURE_PLAYER_TOOLS])}\n`);
    return;
  }
  const eventsPath = option(argv, "--events");
  const rolloutPath = option(argv, "--rollout");
  const reportPath = option(argv, "--report");
  const model = option(argv, "--model");
  const startedAtMs = Number(option(argv, "--started-at-ms"));
  if (!eventsPath || !rolloutPath || !reportPath || !model || !nonNegativeInteger(startedAtMs)) {
    console.error(
      "Usage: codex-pure-envelope.mjs --events <jsonl> --rollout <jsonl> --report <md> --model <id> --started-at-ms <n>",
    );
    process.exit(2);
  }

  try {
    const result = buildCodexPureEnvelope({
      rows: parseEventRows(eventsPath, "Codex provider events"),
      rolloutRows: parseEventRows(rolloutPath, "Codex private rollout"),
      report: readFileSync(reportPath, "utf8"),
      model,
      durationMs: Math.max(0, Date.now() - startedAtMs),
    });
    if (!result.ok) {
      console.error(result.reason);
      process.exit(1);
    }
    process.stdout.write(`${JSON.stringify(result.envelope)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
