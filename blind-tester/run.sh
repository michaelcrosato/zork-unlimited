#!/usr/bin/env bash
#
# blind-tester/run.sh — drive a BLIND playtest through the AdventureForge MCP
# server, using the Claude Code CLI on your SUBSCRIPTION (no API key, no metered
# billing). The agent runs from an isolated temp dir and is restricted to the
# `mcp__adventureforge__*` tools, so it can only experience the game through the same
# structured surface a real player would — never the source, the YAML, or the repo's
# own CLAUDE.md.
#
# Usage:
#   blind-tester/run.sh [--quest <id>] [--seed <n>] [--model <alias>] [--out <prefix>]
#   blind-tester/run.sh --smoke [--quest <id>] [--seed <n>]   # no LLM, no tokens
#
# Provider-agnostic: set BLIND_AGENT_CMD to use a different MCP-capable agent CLI
# (e.g. a future local-LLM runner). It receives the prompt on stdin and these env
# vars: BLIND_MCP_CONFIG, BLIND_QUEST_ID, BLIND_SEED.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GAME_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

QUEST_ID="${BLIND_QUEST_ID:-}"
PACK="${BLIND_PACK:-}"
if [[ -n "$PACK" ]]; then
  echo "BLIND_PACK is no longer supported; blind runs start shipped quests by --quest id." >&2
  exit 2
fi
if [[ -z "$QUEST_ID" ]]; then
  QUEST_ID="breaking_weir"
fi
SEED=7
MODEL="${BLIND_MODEL:-sonnet}"   # sonnet = strong + best subscription value; override per run
OUT=""
SMOKE=0
TIMEOUT="${BLIND_TIMEOUT:-900}"
SPECTATE="${BLIND_SPECTATE:-0}"                   # 1 = server writes a human-watchable feed
SPECTATE_DELAY_MS="${BLIND_SPECTATE_DELAY_MS:-}"  # optional pacing delay per tool response
QUEST_EXPLICIT=0
POSITIONAL=()

# `npm run blind` invokes this script with a non-login Bash, so per-user CLI install
# dirs such as ~/.local/bin may be missing even when an interactive shell can see them.
for dir in "$HOME/.local/bin" "$HOME/bin"; do
  if [[ -d "$dir" ]]; then
    PATH="$dir:$PATH"
  fi
done

NODE_CMD="${BLIND_NODE_CMD:-}"
if [[ -z "$NODE_CMD" ]]; then
  if command -v node >/dev/null 2>&1; then
    NODE_CMD="$(command -v node)"
  elif command -v node.exe >/dev/null 2>&1; then
    NODE_CMD="$(command -v node.exe)"
  elif [[ -x "/mnt/c/Program Files/nodejs/node.exe" ]]; then
    NODE_CMD="/mnt/c/Program Files/nodejs/node.exe"
  else
    NODE_CMD="node"
  fi
fi

node_path_arg() {
  local path="$1"
  case "$NODE_CMD" in
    *.exe|*/node.exe)
      if command -v wslpath >/dev/null 2>&1 && [[ "$path" == /mnt/* ]]; then
        wslpath -w "$path"
      else
        printf '%s\n' "$path"
      fi
      ;;
    *)
      printf '%s\n' "$path"
      ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --quest|--quest-id) QUEST_ID="$2"; QUEST_EXPLICIT=1; shift 2 ;;
    --pack)
      echo "Blind runs start shipped quests by quest id only; use --quest <id>, not --pack." >&2
      exit 2 ;;
    --seed)             SEED="$2"; shift 2 ;;
    --model)            MODEL="$2"; shift 2 ;;
    --out)              OUT="$2"; shift 2 ;;
    --smoke)            SMOKE=1; shift ;;
    --spectate)         SPECTATE=1; shift ;;
    --delay-ms)         SPECTATE_DELAY_MS="$2"; SPECTATE=1; shift 2 ;;
    -h|--help)
      sed -n '3,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done

if [[ "$QUEST_EXPLICIT" == "0" && ${#POSITIONAL[@]} -gt 0 ]]; then
  SOURCE="${POSITIONAL[0]}"
  if [[ "$SOURCE" == *.yaml || "$SOURCE" == */* || "$SOURCE" == *\\* ]]; then
    echo "Blind runs start shipped quests by quest id only; use --quest <id>, not a pack path." >&2
    exit 2
  else
    QUEST_ID="$SOURCE"
    QUEST_EXPLICIT=1
  fi
fi
if [[ ${#POSITIONAL[@]} -gt 1 ]]; then
  SEED="${POSITIONAL[1]}"
fi
if [[ ${#POSITIONAL[@]} -gt 2 ]]; then
  MODEL="${POSITIONAL[2]}"
fi
if [[ ${#POSITIONAL[@]} -gt 3 ]]; then
  echo "Too many positional args: ${POSITIONAL[*]}" >&2
  exit 2
fi

if [[ -z "$QUEST_ID" ]]; then
  echo "A blind run needs --quest <id>." >&2
  exit 2
fi

SOURCE_LABEL="quest=$QUEST_ID"
SOURCE_SLUG="$QUEST_ID"
START_INSTRUCTION="Start: \`mcp__adventureforge__start_world_quest\` with world_quest_id = \"$QUEST_ID\", seed = $SEED, hide_graph = true, compact_observation = true."

# A Windows-installed node_modules cannot run under WSL's Linux node: only the
# @esbuild/win32-x64 native binary is present, so tsx (and with it the MCP
# server) dies with a cryptic "MCP error -32000: Connection closed". Fail with
# an actionable message instead.
if [[ "$OSTYPE" == linux* && "$GAME_DIR" == /mnt/* \
      && -d "$GAME_DIR/node_modules/@esbuild/win32-x64" \
      && ! -d "$GAME_DIR/node_modules/@esbuild/linux-x64" ]]; then
  echo "This checkout's node_modules was installed on Windows; WSL's Linux node cannot run it." >&2
  echo "Run from Git Bash/PowerShell instead, or 'npm ci' inside WSL first." >&2
  exit 4
fi

# Smoke mode: prove the MCP path with no LLM and no token spend.
if [[ "$SMOKE" == "1" ]]; then
  SMOKE_SCRIPT="$(node_path_arg "$SCRIPT_DIR/smoke.mjs")"
  exec "$NODE_CMD" "$SMOKE_SCRIPT" --quest "$QUEST_ID" --seed "$SEED"
fi

case "$GAME_DIR" in
  *\'*|*\"*) echo "Refusing: game path contains a quote, which breaks the MCP launch command." >&2; exit 4 ;;
esac

# The MCP server must be launched so packs resolve from the project root — but
# it must NOT depend on the client honoring a `cwd` field: the Claude CLI on
# Windows silently ignores stdio-server `cwd`, so the server would inherit the
# agent's isolated temp cwd and `npm run mcp` would die with "Missing script"
# (tools never load; the report verifier then rejects the run). `npm --prefix`
# makes npm itself change to the game dir, which is cwd-independent on every
# platform. stdout stays a clean JSON-RPC channel (no -l).
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
MCP_CONFIG="$WORK/mcp.json"

# Spectate pass-through: forwarded as SERVER argv (clients can ignore env/cwd
# fields, but args always survive). The server writes the human-watchable feed;
# watch it from another terminal with `npm run spectate`.
SPECTATE_ARGS_JSON=""
SPECTATE_CMD_SUFFIX=""
if [[ "$SPECTATE" == "1" ]]; then
  if [[ -n "$SPECTATE_DELAY_MS" ]]; then
    case "$SPECTATE_DELAY_MS" in
      *[!0-9]*) echo "--delay-ms takes a whole number of milliseconds." >&2; exit 2 ;;
    esac
    SPECTATE_ARGS_JSON=", \"--\", \"--spectate\", \"--spectate-delay-ms\", \"$SPECTATE_DELAY_MS\""
    SPECTATE_CMD_SUFFIX=" -- --spectate --spectate-delay-ms $SPECTATE_DELAY_MS"
  else
    SPECTATE_ARGS_JSON=", \"--\", \"--spectate\""
    SPECTATE_CMD_SUFFIX=" -- --spectate"
  fi
fi

GAME_DIR_WIN=""
if command -v wslpath >/dev/null 2>&1 && [[ "$GAME_DIR" == /mnt/* ]]; then
  GAME_DIR_WIN="$(wslpath -w "$GAME_DIR")"
fi

# The npm --prefix path in native form: Git Bash's /c/... is meaningless to the
# native claude.exe-spawned npm, so convert with cygpath on msys/cygwin.
GAME_DIR_MCP="$GAME_DIR"
if [[ "$OSTYPE" == msys* || "$OSTYPE" == cygwin* ]] && command -v cygpath >/dev/null 2>&1; then
  GAME_DIR_MCP="$(cygpath -m "$GAME_DIR")"
fi
case "$GAME_DIR_MCP" in
  *\"*|*\\*) echo "Refusing: game path breaks MCP config JSON quoting." >&2; exit 4 ;;
esac

if [[ -n "$GAME_DIR_WIN" ]]; then
  case "$GAME_DIR_WIN" in
    *" "*) echo "Refusing: WSL blind runner path contains a space, which breaks cmd.exe MCP launch quoting." >&2; exit 4 ;;
  esac
  GAME_DIR_WIN_JSON="${GAME_DIR_WIN//\\/\\\\}"
  cat > "$MCP_CONFIG" <<JSON
{
  "mcpServers": {
    "adventureforge": {
      "command": "cmd.exe",
      "args": ["/c", "cd /d $GAME_DIR_WIN_JSON && npm --silent run mcp$SPECTATE_CMD_SUFFIX"]
    }
  }
}
JSON
else
  cat > "$MCP_CONFIG" <<JSON
{
  "mcpServers": {
    "adventureforge": {
      "command": "npm",
      "args": ["--silent", "--prefix", "$GAME_DIR_MCP", "run", "mcp"$SPECTATE_ARGS_JSON]
    }
  }
}
JSON
fi

# Fill the locked blind prompt.
START_INSTRUCTION_ESCAPED="$(printf '%s' "$START_INSTRUCTION" | sed -e 's/[&#]/\\&/g')"
PROMPT="$(sed -e "s#{{START_INSTRUCTION}}#${START_INSTRUCTION_ESCAPED}#g" -e "s#__SEED__#${SEED}#g" "$SCRIPT_DIR/prompt.md")"

# Report destination.
if [[ -z "$OUT" ]]; then
  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  OUT="$SCRIPT_DIR/reports/${STAMP}_${SOURCE_SLUG}_seed${SEED}"
fi
mkdir -p "$(dirname "$OUT")"

echo "Blind playtest → $SOURCE_LABEL seed=$SEED model=$MODEL"
echo "Report prefix: $OUT"

# Provider override path: hand the prompt to any MCP-capable agent CLI.
if [[ -n "${BLIND_AGENT_CMD:-}" ]]; then
  echo "Using BLIND_AGENT_CMD override."
  BLIND_MCP_CONFIG="$MCP_CONFIG" BLIND_QUEST_ID="$QUEST_ID" BLIND_SEED="$SEED" \
    timeout "$TIMEOUT" bash -c "$BLIND_AGENT_CMD" <<<"$PROMPT" | tee "$OUT.md"
  AGENT_STATUS="${PIPESTATUS[0]}"
  if [[ "$AGENT_STATUS" -ne 0 ]]; then
    exit "$AGENT_STATUS"
  fi
  # The override agent's report is NOT exempt from the gate: run the same
  # verifier as the default path (MCP-failure text, sections, exit interview).
  REPORT_MD="$OUT.md"
  if command -v wslpath >/dev/null 2>&1 && [[ "$REPORT_MD" == /mnt/* ]]; then
    REPORT_MD="$(wslpath -w "$REPORT_MD")"
  fi
  ( cd "$GAME_DIR" && npm --silent exec tsx -- scripts/verify-blind-report.ts "$REPORT_MD" )
  echo "✓ Blind report saved: $OUT.md"
  exit 0
fi

# Default blind player: Claude Code on your subscription. NOTE the blind player is
# INDEPENDENT of the loop's driver — a Codex-primary loop can (and, for a diverse
# playtester, may prefer to) run any MCP-capable agent here via BLIND_AGENT_CMD.
# For Codex, register the engine MCP server at user level first
# (`codex mcp add adventureforge -- npm --silent run mcp`), then e.g.:
#   BLIND_AGENT_CMD='codex exec -a never --sandbox read-only -'
# (On the BLIND_AGENT_CMD override path, enforcing blindness — no repo reads — is
# the operator's responsibility; the built-in Claude path isolates cwd + denies
# file/shell/web tools for you.)
if ! command -v claude >/dev/null 2>&1; then
  echo "claude CLI not found. Set BLIND_AGENT_CMD to an MCP-capable agent (e.g. a 'codex exec' invocation) or install Claude Code." >&2
  exit 3
fi

# Blindness is enforced two ways: (1) the agent runs from an isolated temp cwd with
# no game source, and (2) every file/shell/web tool is hard-DISALLOWED (a deny that
# overrides bypassPermissions). bypassPermissions makes the MCP tool calls run
# unattended in headless mode; --strict-mcp-config drops any global MCP servers so
# only adventureforge is reachable. ToolSearch is left available because the
# adventureforge tools are deferred and must be loaded with it first. The prompt is
# delivered on stdin so the variadic --disallowedTools cannot swallow it.
set +e
printf '%s' "$PROMPT" | ( cd "$WORK" && timeout "$TIMEOUT" claude \
  --print \
  --output-format json \
  --model "$MODEL" \
  --mcp-config "$MCP_CONFIG" \
  --strict-mcp-config \
  --permission-mode bypassPermissions \
  --disallowedTools \
    Read Edit Write Bash Glob Grep WebFetch WebSearch Task NotebookEdit \
) > "$OUT.json" 2> "$OUT.log"
STATUS=$?
set -e

if [[ $STATUS -ne 0 ]]; then
  echo "✗ blind run failed (exit $STATUS). See $OUT.log" >&2
  tail -5 "$OUT.log" >&2 || true
  exit $STATUS
fi

# Extract the agent's final report text from the JSON envelope. jq when
# available, else node (always present) — copying the raw envelope would leave
# the exit-interview block JSON-escaped and the verifier would reject a good run.
if command -v jq >/dev/null 2>&1; then
  jq -r '.result // .text // empty' "$OUT.json" > "$OUT.md" 2>/dev/null || cp "$OUT.json" "$OUT.md"
else
  OUT_JSON_ARG="$(node_path_arg "$OUT.json")"
  "$NODE_CMD" -e 'const fs=require("node:fs");let t="";try{const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));t=j.result??j.text??"";}catch{}process.stdout.write(String(t));' "$OUT_JSON_ARG" > "$OUT.md" || cp "$OUT.json" "$OUT.md"
fi

REPORT_MD="$OUT.md"
if command -v wslpath >/dev/null 2>&1 && [[ "$REPORT_MD" == /mnt/* ]]; then
  REPORT_MD="$(wslpath -w "$REPORT_MD")"
fi
( cd "$GAME_DIR" && npm --silent exec tsx -- scripts/verify-blind-report.ts "$REPORT_MD" )

echo "✓ Blind report saved: $OUT.md"
grep -iE 'clarity .*[0-9]|enjoyment .*[0-9]' "$OUT.md" | head -2 || true
