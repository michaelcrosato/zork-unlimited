#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compactView, createState, loadWorld, step as engineStep } from "./engine.mjs";

const CURRENT_PROTOCOL = "2026-07-28";
const LEGACY_PROTOCOL = "2025-11-25";
const SERVER_INFO = { name: "lean-adventure-loop", version: "0.1.0" };

class ToolExecutionError extends Error {
  constructor(message, data = {}) {
    super(message);
    this.name = "ToolExecutionError";
    this.data = data;
  }
}

function compactJson(value) {
  return JSON.stringify(value);
}

function toolResult(payload, modern, isError = false) {
  return {
    ...(modern ? { resultType: "complete" } : {}),
    content: [{ type: "text", text: compactJson(payload) }],
    ...(isError ? { isError: true } : {}),
  };
}

function rpcError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

function toolDefinitions() {
  return [
    {
      name: "game_start",
      title: "Start game",
      description:
        "Use this to begin a fresh playthrough. The compact result contains sid, rev, at [room_id,title], text, turn [used,max], score, optional inv, and legal actions as [action_id,label]. Keep sid and rev for game_step; the sid exists until this server exits.",
      inputSchema: {
        type: "object",
        properties: {
          seed: {
            type: "integer",
            minimum: -9007199254740991,
            maximum: 9007199254740991,
            description: "Deterministic game seed. Default: 1.",
          },
        },
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    {
      name: "game_step",
      title: "Take game action",
      description:
        "Use this to take exactly one listed action. Pass sid and the exact rev from the previous result. The response is the complete next observation and legal menu, so no observe or list-actions call is needed.",
      inputSchema: {
        type: "object",
        properties: {
          sid: { type: "string", minLength: 1, description: "Opaque id from game_start." },
          rev: {
            type: "integer",
            minimum: 0,
            description: "Exact revision from the previous game result.",
          },
          action: {
            type: "string",
            minLength: 1,
            description: "An action_id from the previous result's actions list.",
          },
        },
        required: ["sid", "rev", "action"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
  ];
}

function isModernRequest(request, connectionMode) {
  const version = request?.params?._meta?.["io.modelcontextprotocol/protocolVersion"];
  return connectionMode === "modern" || version === CURRENT_PROTOCOL;
}

function validateStartArgs(args) {
  if (args === undefined) return { seed: 1 };
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new ToolExecutionError("game_start arguments must be an object.");
  }
  const keys = Object.keys(args);
  if (keys.some((key) => key !== "seed")) {
    throw new ToolExecutionError("game_start accepts only seed.");
  }
  const seed = args.seed ?? 1;
  if (!Number.isSafeInteger(seed)) throw new ToolExecutionError("seed must be a safe integer.");
  return { seed };
}

function validateStepArgs(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new ToolExecutionError("game_step arguments must be an object.");
  }
  const keys = Object.keys(args);
  if (keys.some((key) => !["sid", "rev", "action"].includes(key))) {
    throw new ToolExecutionError("game_step accepts only sid, rev, and action.");
  }
  if (typeof args.sid !== "string" || args.sid.length < 1) {
    throw new ToolExecutionError("sid must be a non-empty string.");
  }
  if (!Number.isSafeInteger(args.rev) || args.rev < 0) {
    throw new ToolExecutionError("rev must be a non-negative safe integer.");
  }
  if (typeof args.action !== "string" || args.action.length < 1) {
    throw new ToolExecutionError("action must be a non-empty string.");
  }
  return args;
}

export function createGameService(world) {
  const sessions = new Map();

  return {
    start(args) {
      const { seed } = validateStartArgs(args);
      const sid = randomUUID();
      const state = createState(world, seed);
      sessions.set(sid, state);
      return compactView(world, state, sid, `Objective: ${world.objective}`);
    },

    step(args) {
      const { sid, rev, action } = validateStepArgs(args);
      const state = sessions.get(sid);
      if (!state) throw new ToolExecutionError("Unknown or expired sid. Start a new game.");
      if (rev !== state.turn) {
        throw new ToolExecutionError(`Stale rev. Expected ${state.turn}.`, { sid, rev: state.turn });
      }
      const result = engineStep(world, state, action);
      if (!result.ok) {
        throw new ToolExecutionError(result.error, { sid, rev: state.turn });
      }
      sessions.set(sid, result.state);
      return compactView(world, result.state, sid, result.event);
    },

    sessionCount() {
      return sessions.size;
    },
  };
}

export async function createRequestHandler() {
  const world = await loadWorld();
  const service = createGameService(world);
  let connectionMode = "unknown";

  async function callTool(params, modern) {
    if (!params || typeof params !== "object" || typeof params.name !== "string") {
      throw Object.assign(new Error("tools/call requires a tool name."), { rpcCode: -32602 });
    }
    try {
      if (params.name === "game_start") return toolResult(service.start(params.arguments), modern);
      if (params.name === "game_step") return toolResult(service.step(params.arguments), modern);
      throw Object.assign(new Error(`Unknown tool: ${params.name}`), { rpcCode: -32602 });
    } catch (error) {
      if (error instanceof ToolExecutionError) {
        return toolResult(
          { ok: false, error: error.message, ...error.data },
          modern,
          true,
        );
      }
      throw error;
    }
  }

  return async function handle(request) {
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      return rpcError(null, -32600, "Invalid Request");
    }
    const hasId = Object.hasOwn(request, "id");
    const id = hasId ? request.id : null;
    if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
      return hasId ? rpcError(id, -32600, "Invalid Request") : null;
    }

    try {
      if (request.method === "initialize") {
        connectionMode = "legacy";
        const requested = request.params?.protocolVersion;
        return hasId
          ? {
              jsonrpc: "2.0",
              id,
              result: {
                protocolVersion: typeof requested === "string" ? requested : LEGACY_PROTOCOL,
                capabilities: { tools: {} },
                serverInfo: SERVER_INFO,
                instructions:
                  "Call game_start once, then call game_step with a listed action until end appears.",
              },
            }
          : null;
      }

      if (request.method === "notifications/initialized") return null;

      if (request.method === "server/discover") {
        connectionMode = "modern";
        return hasId
          ? {
              jsonrpc: "2.0",
              id,
              result: {
                resultType: "complete",
                supportedVersions: [CURRENT_PROTOCOL, LEGACY_PROTOCOL],
                capabilities: { tools: {} },
                serverInfo: SERVER_INFO,
                instructions:
                  "Call game_start once, then call game_step with a listed action until end appears.",
              },
            }
          : null;
      }

      if (request.method === "ping") {
        return hasId ? { jsonrpc: "2.0", id, result: {} } : null;
      }

      const modern = isModernRequest(request, connectionMode);
      if (request.method === "tools/list") {
        return hasId
          ? {
              jsonrpc: "2.0",
              id,
              result: {
                ...(modern ? { resultType: "complete" } : {}),
                tools: toolDefinitions(),
                ...(modern ? { ttlMs: 3600000, cacheScope: "public" } : {}),
              },
            }
          : null;
      }

      if (request.method === "tools/call") {
        return hasId
          ? { jsonrpc: "2.0", id, result: await callTool(request.params, modern) }
          : null;
      }

      return hasId ? rpcError(id, -32601, "Method not found") : null;
    } catch (error) {
      const code = Number.isInteger(error?.rpcCode) ? error.rpcCode : -32603;
      const message = code === -32603 ? "Internal error" : error.message;
      if (code === -32603) console.error(error);
      return hasId ? rpcError(id, code, message) : null;
    }
  };
}

export async function runStdioServer() {
  const handle = await createRequestHandler();
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });

  for await (const line of lines) {
    if (!line.trim()) continue;
    let input;
    try {
      input = JSON.parse(line);
    } catch {
      process.stdout.write(`${compactJson(rpcError(null, -32700, "Parse error"))}\n`);
      continue;
    }

    if (Array.isArray(input)) {
      if (input.length === 0) {
        process.stdout.write(`${compactJson(rpcError(null, -32600, "Invalid Request"))}\n`);
        continue;
      }
      const responses = (await Promise.all(input.map(handle))).filter(Boolean);
      if (responses.length) process.stdout.write(`${compactJson(responses)}\n`);
      continue;
    }

    const response = await handle(input);
    if (response) process.stdout.write(`${compactJson(response)}\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runStdioServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
