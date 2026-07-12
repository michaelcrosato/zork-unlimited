#!/usr/bin/env bash
#
# blind-tester/loadtest.sh — ONE explicit STRUCTURAL server-load exercise for
# TOKEN-ECONOMY measurement. It intentionally prescribes a QA workload, records
# token/timing/tool-call stats, and produces no pure report, retention evidence,
# ledger entry, or report-verifier result.
#
# Usage:
#   blind-tester/loadtest.sh [--seed N] [--model alias] [--timeout secs] [--label L]
#
# Appends one JSON record to ai-runs/loadtest.jsonl and prints a one-line summary.
# Exit 0 on a completed playthrough, non-zero on failure (so callers can pace).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GAME_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SEED=7
MODEL="${BLIND_MODEL:-sonnet}"
TIMEOUT="${BLIND_TIMEOUT:-900}"
LABEL="loadtest"
OUT_JSONL="$GAME_DIR/ai-runs/loadtest.jsonl"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed)    SEED="$2"; shift 2 ;;
    --model)   MODEL="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --label)   LABEL="$2"; shift 2 ;;
    --out)     OUT_JSONL="$2"; shift 2 ;;
    *) echo "loadtest: unknown arg $1" >&2; exit 2 ;;
  esac
done

for dir in "$HOME/.local/bin" "$HOME/bin"; do
  [[ -d "$dir" ]] && PATH="$dir:$PATH"
done
if ! command -v claude >/dev/null 2>&1; then
  echo "loadtest: claude CLI not found" >&2; exit 3
fi

mkdir -p "$GAME_DIR/ai-runs"
FEEDS_DIR="$GAME_DIR/ai-runs/loadtest-feeds"
mkdir -p "$FEEDS_DIR"
WORK="$(mktemp -d)"
FEED="$WORK/spectate.log"
ENVELOPE="$WORK/envelope.json"
trap 'rm -rf "$WORK"' EXIT

# MCP config — cwd-independent server launch via npm --prefix (Git Bash/msys uses
# a native path via cygpath). Spectate (no delay) makes the server log every tool
# call + any error to $FEED so we can measure server-side behavior for free.
GAME_DIR_MCP="$GAME_DIR"
FEED_MCP="$FEED"
if [[ "$OSTYPE" == msys* || "$OSTYPE" == cygwin* ]] && command -v cygpath >/dev/null 2>&1; then
  GAME_DIR_MCP="$(cygpath -m "$GAME_DIR")"
  FEED_MCP="$(cygpath -m "$FEED")"
fi
MCP_CONFIG="$WORK/mcp.json"
cat > "$MCP_CONFIG" <<JSON
{
  "mcpServers": {
    "adventureforge": {
      "command": "npm",
      "args": ["--silent", "--prefix", "$GAME_DIR_MCP", "run", "mcp", "--", "--play-mode", "structural", "--spectate", "$FEED_MCP"]
    }
  }
}
JSON

PROMPT="$(cat "$SCRIPT_DIR/prompt-loadtest.md")"
START_EPOCH="$(date +%s)"
START_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

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
) > "$ENVELOPE" 2> "$WORK/claude.log"
STATUS=$?
set -e
WALL_S=$(( "$(date +%s)" - START_EPOCH ))

# Server-side stats from the spectate feed: one "── " header per tool call,
# "ERROR" per failed call. Preserve the feed per run (gitignored) for analysis.
TOOL_CALLS=0
TOOL_ERRORS=0
SAVED_FEED=""
if [[ -f "$FEED" ]]; then
  # grep -c prints "0" AND exits non-zero on no match — capture the count, then
  # normalize a non-zero exit to a clean 0 (avoids "0\n0" -> NaN in the record).
  TOOL_CALLS="$(grep -c '^── ' "$FEED" 2>/dev/null)" || TOOL_CALLS=0
  TOOL_ERRORS="$(grep -c 'ERROR' "$FEED" 2>/dev/null)" || TOOL_ERRORS=0
  SAVED_FEED="$FEEDS_DIR/$(printf '%s' "$START_ISO" | tr ':' '-')_seed${SEED}.log"
  cp "$FEED" "$SAVED_FEED" 2>/dev/null || SAVED_FEED=""
fi

# Parse the claude envelope (usage/cost/turns), append one JSONL record, print summary.
LT_TS="$START_ISO" LT_LABEL="$LABEL" LT_SEED="$SEED" LT_MODEL="$MODEL" \
LT_STATUS="$STATUS" LT_WALL="$WALL_S" LT_TOOL_CALLS="$TOOL_CALLS" LT_TOOL_ERRORS="$TOOL_ERRORS" \
LT_FEED="$SAVED_FEED" LT_OUT="$OUT_JSONL" node -e '
  const fs = require("node:fs");
  let env = {};
  try { env = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch {}
  const u = env.usage || {};
  const inp = u.input_tokens || 0, out = u.output_tokens || 0;
  const cc = u.cache_creation_input_tokens || 0, cr = u.cache_read_input_tokens || 0;
  const result = typeof env.result === "string" ? env.result : "";
  const rec = {
    ts: process.env.LT_TS, label: process.env.LT_LABEL, seed: Number(process.env.LT_SEED),
    play_mode: "structural", start_surface: "fresh_overworld", retention_eligible: false,
    model: process.env.LT_MODEL, status: Number(process.env.LT_STATUS),
    is_error: env.is_error === true, completed: /PLAYTHROUGH COMPLETE/.test(result),
    num_turns: env.num_turns ?? null, duration_ms: env.duration_ms ?? null,
    wall_s: Number(process.env.LT_WALL),
    input_tokens: inp, output_tokens: out,
    cache_creation_input_tokens: cc, cache_read_input_tokens: cr,
    billable_tokens: inp + out + cc, gross_tokens: inp + out + cc + cr,
    cost_usd: env.total_cost_usd ?? null,
    tool_calls: Number(process.env.LT_TOOL_CALLS), tool_errors: Number(process.env.LT_TOOL_ERRORS),
    feed: process.env.LT_FEED || null,
  };
  fs.appendFileSync(process.env.LT_OUT, JSON.stringify(rec) + "\n");
  const k = (n) => (n == null ? "?" : String(n));
  console.log(`[loadtest] seed=${rec.seed} ok=${!rec.is_error && rec.completed} turns=${k(rec.num_turns)} wall=${rec.wall_s}s tools=${rec.tool_calls} toolErr=${rec.tool_errors} in=${rec.input_tokens} out=${rec.output_tokens} cacheR=${rec.cache_read_input_tokens} billable=${rec.billable_tokens} gross=${rec.gross_tokens} cost=$${k(rec.cost_usd)}`);
' "$ENVELOPE"

if [[ "$STATUS" -ne 0 ]]; then
  echo "[loadtest] claude exit $STATUS — see claude.log (rate limit? timeout?)" >&2
  tail -3 "$WORK/claude.log" >&2 || true
  exit "$STATUS"
fi
exit 0
