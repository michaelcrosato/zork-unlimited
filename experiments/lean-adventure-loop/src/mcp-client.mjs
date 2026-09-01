import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const CURRENT_PROTOCOL = "2026-07-28";
const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SERVER_PATH = fileURLToPath(new URL("./mcp-server.mjs", import.meta.url));

function requestMeta() {
  return {
    "io.modelcontextprotocol/protocolVersion": CURRENT_PROTOCOL,
    "io.modelcontextprotocol/clientInfo": { name: "lean-playtest-client", version: "0.1.0" },
    "io.modelcontextprotocol/clientCapabilities": {},
  };
}

export class McpClient {
  constructor({ legacy = false, worldPath, timeoutMs = 5000 } = {}) {
    this.legacy = legacy;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.stderr = "";
    this.child = spawn(process.execPath, [SERVER_PATH], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, ...(worldPath ? { LEAN_WORLD: worldPath } : {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
    const lines = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => this.#receive(line));
    this.child.on("exit", (code, signal) => {
      const error = new Error(`MCP server exited (code=${code}, signal=${signal}). ${this.stderr}`);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
  }

  #receive(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      const failure = new Error(`Server emitted invalid JSON: ${line}`);
      failure.cause = error;
      for (const pending of this.pending.values()) pending.reject(failure);
      this.pending.clear();
      return;
    }
    const responses = Array.isArray(message) ? message : [message];
    for (const response of responses) {
      const pending = this.pending.get(response.id);
      if (!pending) continue;
      clearTimeout(pending.timer);
      this.pending.delete(response.id);
      if (response.error) {
        const error = new Error(response.error.message);
        error.code = response.error.code;
        error.data = response.error.data;
        pending.reject(error);
      } else {
        pending.resolve(response.result);
      }
    }
  }

  #params(params = {}) {
    return this.legacy ? params : { ...params, _meta: requestMeta() };
  }

  request(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  notify(method, params = {}) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  async connect() {
    if (this.legacy) {
      const result = await this.request("initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "lean-playtest-client", version: "0.1.0" },
      });
      this.notify("notifications/initialized");
      return result;
    }
    return this.request("server/discover", this.#params());
  }

  listTools() {
    return this.request("tools/list", this.#params());
  }

  async callTool(name, args = {}) {
    const result = await this.request(
      "tools/call",
      this.#params({ name, arguments: args }),
    );
    const text = result?.content?.find((item) => item.type === "text")?.text;
    if (typeof text !== "string") throw new Error(`Tool ${name} returned no text content.`);
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error(`Tool ${name} returned invalid JSON text: ${text}`, { cause: error });
    }
    return { payload, isError: result.isError === true, raw: result };
  }

  async close() {
    if (this.child.exitCode !== null) return;
    this.child.stdin.end();
    await Promise.race([
      new Promise((resolve) => this.child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 250)),
    ]);
    if (this.child.exitCode === null) this.child.kill("SIGTERM");
  }
}
