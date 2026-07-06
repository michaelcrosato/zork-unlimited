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

# Smoke mode: prove the MCP path with no LLM and no token spend.
if [[ "$SMOKE" == "1" ]]; then
  SMOKE_SCRIPT="$(node_path_arg "$SCRIPT_DIR/smoke.mjs")"
  exec "$NODE_CMD" "$SMOKE_SCRIPT" --quest "$QUEST_ID" --seed "$SEED"
fi

case "$GAME_DIR" in
  *\'*|*\"*) echo "Refusing: game path contains a quote, which breaks the MCP launch command." >&2; exit 4 ;;
esac

# The MCP server is launched with cwd = game dir (NOT the agent's temp cwd), so packs
# resolve relative to the project root. stdout stays a clean JSON-RPC channel (no -l).
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
MCP_CONFIG="$WORK/mcp.json"
GAME_DIR_WIN=""
if command -v wslpath >/dev/null 2>&1 && [[ "$GAME_DIR" == /mnt/* ]]; then
  GAME_DIR_WIN="$(wslpath -w "$GAME_DIR")"
fi

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
      "args": ["/c", "cd /d $GAME_DIR_WIN_JSON && npm --silent run mcp"]
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
      "args": ["--silent", "run", "mcp"],
      "cwd": "$GAME_DIR"
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
  exit "${PIPESTATUS[0]}"
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

# Extract the agent's final report text from the JSON envelope.
if command -v jq >/dev/null 2>&1; then
  jq -r '.result // .text // empty' "$OUT.json" > "$OUT.md" 2>/dev/null || cp "$OUT.json" "$OUT.md"
else
  cp "$OUT.json" "$OUT.md"
fi

REPORT_MD="$OUT.md"
if command -v wslpath >/dev/null 2>&1 && [[ "$REPORT_MD" == /mnt/* ]]; then
  REPORT_MD="$(wslpath -w "$REPORT_MD")"
fi
( cd "$GAME_DIR" && npm --silent exec tsx -- scripts/verify-blind-report.ts "$REPORT_MD" )

echo "✓ Blind report saved: $OUT.md"
grep -iE 'clarity .*[0-9]|enjoyment .*[0-9]' "$OUT.md" | head -2 || true
