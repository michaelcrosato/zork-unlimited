#!/usr/bin/env bash
#
# blind-tester/run.sh — drive a BLIND playtest of an AdventureForge pack through the
# MCP server, using the Claude Code CLI on your SUBSCRIPTION (no API key, no metered
# billing). The agent runs from an isolated temp dir and is restricted to the
# `mcp__adventureforge__*` tools, so it can only experience the game through the same
# structured surface a real player would — never the source, the YAML, or the repo's
# own CLAUDE.md.
#
# Usage:
#   blind-tester/run.sh [--pack <path>] [--seed <n>] [--model <alias>] [--out <prefix>]
#   blind-tester/run.sh --smoke [--pack <path>] [--seed <n>]   # no LLM, no tokens
#
# Provider-agnostic: set BLIND_AGENT_CMD to use a different MCP-capable agent CLI
# (e.g. a future local-LLM runner). It receives the prompt on stdin and these env
# vars: BLIND_MCP_CONFIG, BLIND_PACK, BLIND_SEED.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GAME_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PACK="content/cyoa/pack/watchtower_road.yaml"
SEED=7
MODEL="${BLIND_MODEL:-sonnet}"   # sonnet = strong + best subscription value; override per run
OUT=""
SMOKE=0
TIMEOUT="${BLIND_TIMEOUT:-900}"

# `npm run blind` invokes this script with a non-login Bash, so per-user CLI install
# dirs such as ~/.local/bin may be missing even when an interactive shell can see them.
for dir in "$HOME/.local/bin" "$HOME/bin"; do
  if [[ -d "$dir" ]]; then
    PATH="$dir:$PATH"
  fi
done

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pack)  PACK="$2"; shift 2 ;;
    --seed)  SEED="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --out)   OUT="$2"; shift 2 ;;
    --smoke) SMOKE=1; shift ;;
    -h|--help)
      sed -n '3,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

# Smoke mode: prove the MCP path with no LLM and no token spend.
if [[ "$SMOKE" == "1" ]]; then
  exec node "$SCRIPT_DIR/smoke.mjs" --pack "$PACK" --seed "$SEED"
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
PROMPT="$(sed -e "s#__PACK__#${PACK}#g" -e "s#__SEED__#${SEED}#g" "$SCRIPT_DIR/prompt.md")"

# Report destination.
if [[ -z "$OUT" ]]; then
  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  OUT="$SCRIPT_DIR/reports/${STAMP}_$(basename "$PACK" .yaml)_seed${SEED}"
fi
mkdir -p "$(dirname "$OUT")"

echo "Blind playtest → pack=$PACK seed=$SEED model=$MODEL"
echo "Report prefix: $OUT"

# Provider override path: hand the prompt to any MCP-capable agent CLI.
if [[ -n "${BLIND_AGENT_CMD:-}" ]]; then
  echo "Using BLIND_AGENT_CMD override."
  BLIND_MCP_CONFIG="$MCP_CONFIG" BLIND_PACK="$PACK" BLIND_SEED="$SEED" \
    timeout "$TIMEOUT" bash -c "$BLIND_AGENT_CMD" <<<"$PROMPT" | tee "$OUT.md"
  exit "${PIPESTATUS[0]}"
fi

# Default: Claude Code on your subscription.
if ! command -v claude >/dev/null 2>&1; then
  echo "claude CLI not found on PATH. Install Claude Code (or set BLIND_AGENT_CMD)." >&2
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
