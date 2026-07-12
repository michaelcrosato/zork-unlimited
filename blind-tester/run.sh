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
#   blind-tester/run.sh [--seed <n>] [--model <alias>] [--out <prefix>]   # CORE GAME (overworld, the default)
#   blind-tester/run.sh --quest <id> --mock [--seed <n>] ...              # structural targeted test, no LLM
#   blind-tester/run.sh --smoke [--quest <id>] [--seed <n>]               # structural MCP smoke, no LLM
#   ... [--persona <name>]  # play-style overlay; see blind-tester/personas/*.md (default: "default", a no-op)
#
# Provider-agnostic: set BLIND_AGENT_CMD to use a different MCP-capable agent CLI.
# Codex commands are auto-wrapped with the adventureforge MCP server config; other
# agents receive the prompt on stdin and these env vars: BLIND_MCP_CONFIG,
# BLIND_QUEST_ID, BLIND_SEED.
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
SEED=7
MODEL="${BLIND_MODEL:-sonnet}"   # sonnet = strong + best subscription value; override per run
OUT=""
SMOKE=0
MOCK=0
TIMEOUT="${BLIND_TIMEOUT:-900}"
SPECTATE="${BLIND_SPECTATE:-0}"                   # 1 = server writes a human-watchable feed
SPECTATE_DELAY_MS="${BLIND_SPECTATE_DELAY_MS:-}"  # optional pacing delay per tool response
OVERWORLD="${BLIND_OVERWORLD:-0}"                 # CORE-GAME open-world mode — the DEFAULT unless a quest is named
PERSONA="${BLIND_PERSONA:-default}"               # play-style overlay; see blind-tester/personas/*.md
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
    --mock)             MOCK=1; shift ;;
    --spectate)         SPECTATE=1; shift ;;
    --delay-ms)         SPECTATE_DELAY_MS="$2"; SPECTATE=1; shift 2 ;;
    --overworld)        OVERWORLD=1; shift ;;
    --persona)          PERSONA="$2"; shift 2 ;;
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

# Mode resolution — the CORE GAME (overworld, fresh start) is the DEFAULT blind
# test: it is how a real new player actually meets the game. A quest source
# (--quest <id>, a positional id, or BLIND_QUEST_ID) is retained only for the
# structural --smoke and explicit --mock harnesses. Asking for overworld and a
# quest at once is ambiguous.
if [[ "$OVERWORLD" == "1" && -n "$QUEST_ID" ]]; then
  echo "Ambiguous: --overworld and a quest id were both given; drop one (the overworld IS the default)." >&2
  exit 2
fi
if [[ -z "$QUEST_ID" ]]; then
  OVERWORLD=1
fi

# A real blind LLM must meet the game exactly as a new player does: through a
# fresh open-world start. Targeted quest drop-ins remain useful structural test
# seams, but only --smoke and the bundled --mock agent may use them. In
# particular, an arbitrary BLIND_AGENT_CMD is still a live-agent run and cannot
# opt out of this guard by naming itself a mock.
if [[ -n "$QUEST_ID" && "$SMOKE" != "1" && "$MOCK" != "1" ]]; then
  echo "Live blind LLM runs must start a fresh overworld game; quest targets are reserved for --smoke or explicit --mock structural tests." >&2
  echo "Remove the quest source and use --overworld (or no target)." >&2
  exit 2
fi

# There are exactly two harness contracts. Every reasoning-agent run is the
# pure, human-equivalent fresh-overworld path. Structural behavior is available
# only behind the explicit no-LLM --smoke/--mock switches; ambient environment
# variables and provider overrides cannot downgrade a live run.
if [[ "$SMOKE" == "1" || "$MOCK" == "1" ]]; then
  PLAY_MODE="structural"
else
  PLAY_MODE="pure"
fi
START_SURFACE=$([[ "$OVERWORLD" == "1" ]] && printf 'fresh_overworld' || printf 'direct_quest')

# Persona-directed coverage/breaking changes the thing retention is measuring.
# Pure live play therefore has one canonical, neutral first-time-player prompt.
# The richer persona library remains available to explicit structural mocks.
if [[ "$PLAY_MODE" == "pure" && "$PERSONA" != "default" ]]; then
  echo "Pure live blind runs require --persona default; non-default personas are structural-only." >&2
  exit 2
fi

# The live mode is always the default CORE-GAME test (start the open world from
# a fresh start and experience it as a new player). Structural smoke/mock tests
# may use the targeted single-QUEST seam. The two surfaces use different prompts
# and start instructions; the report format + verifier are identical.
if [[ "$OVERWORLD" == "1" ]]; then
  SOURCE_LABEL="overworld"
  SOURCE_SLUG="overworld"
  START_INSTRUCTION="Start: \`mcp__adventureforge__start_overworld\` with compact_context = true. Read the one-time \`tutorial\`, then capture the \`legend\` — it decodes the compact positional fields and is also sent only ONCE, at the start."
  PROMPT_FILE="$SCRIPT_DIR/prompt-overworld.md"
else
  SOURCE_LABEL="quest=$QUEST_ID"
  SOURCE_SLUG="$QUEST_ID"
  START_INSTRUCTION="Start: \`mcp__adventureforge__start_world_quest\` with world_quest_id = \"$QUEST_ID\", seed = $SEED, hide_graph = true, compact_observation = true."
  PROMPT_FILE="$SCRIPT_DIR/prompt.md"
fi

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

# Smoke mode: prove the MCP path with no LLM and no token spend. The smoke
# always exercises BOTH start surfaces (the default overworld core game AND a
# quest drop-in), so the quest id here only picks which quest the quest leg uses.
if [[ "$SMOKE" == "1" ]]; then
  SMOKE_SCRIPT="$(node_path_arg "$SCRIPT_DIR/smoke.mjs")"
  exec "$NODE_CMD" "$SMOKE_SCRIPT" --quest "${QUEST_ID:-breaking_weir}" --seed "$SEED"
fi

# --mock is an explicit, zero-token structural mode. It owns the bundled mock
# command rather than trusting/inheriting BLIND_AGENT_CMD, so that environment
# variable can never become a general-purpose escape hatch for targeted runs.
if [[ "$MOCK" == "1" ]]; then
  MOCK_AGENT_SCRIPT="$(node_path_arg "$SCRIPT_DIR/mock-agent.mjs")"
  printf -v BLIND_AGENT_CMD '%q %q' "$NODE_CMD" "$MOCK_AGENT_SCRIPT"
fi

# Fail fast on a bad quest id BEFORE spending agent tokens (quest mode only — the
# overworld starts the whole world, no quest id to validate). The classic mangled
# invocation (PowerShell strips `--`, npm eats the flags, an orphaned value
# becomes the "quest") used to launch a doomed run; the launcher recovers those
# flags now, and this guard catches anything else with the fix spelled out.
if [[ "$OVERWORLD" != "1" ]] && ! ( cd "$GAME_DIR" && npm --silent run validate -- "$QUEST_ID" >/dev/null 2>&1 ); then
  echo "Unknown or unplayable quest id \"$QUEST_ID\" (npm run validate -- \"$QUEST_ID\" failed)." >&2
  echo "Passing flags from PowerShell: use the equals form without '--', e.g." >&2
  echo "  npm run blind --quest=breaking_weir --spectate --delay-ms=1500" >&2
  echo "(or set BLIND_QUEST_ID / BLIND_SPECTATE / BLIND_SPECTATE_DELAY_MS env vars)." >&2
  exit 2
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
RUN_EVIDENCE="$WORK/run-evidence.jsonl"

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
    SPECTATE_ARGS_JSON=", \"--spectate\", \"--spectate-delay-ms\", \"$SPECTATE_DELAY_MS\""
    SPECTATE_CMD_SUFFIX=" --spectate --spectate-delay-ms $SPECTATE_DELAY_MS"
  else
    SPECTATE_ARGS_JSON=", \"--spectate\""
    SPECTATE_CMD_SUFFIX=" --spectate"
  fi
fi

GAME_DIR_WIN=""
if command -v wslpath >/dev/null 2>&1 && [[ "$GAME_DIR" == /mnt/* ]]; then
  GAME_DIR_WIN="$(wslpath -w "$GAME_DIR")"
fi

# The npm --prefix path in native form: Git Bash's /c/... is meaningless to the
# native claude.exe-spawned npm, so convert with cygpath on msys/cygwin.
GAME_DIR_MCP="$GAME_DIR"
RUN_EVIDENCE_MCP="$RUN_EVIDENCE"
if [[ "$OSTYPE" == msys* || "$OSTYPE" == cygwin* ]] && command -v cygpath >/dev/null 2>&1; then
  GAME_DIR_MCP="$(cygpath -m "$GAME_DIR")"
  RUN_EVIDENCE_MCP="$(cygpath -m "$RUN_EVIDENCE")"
fi
case "$GAME_DIR_MCP|$RUN_EVIDENCE_MCP" in
  *\"*|*\\*) echo "Refusing: game or evidence path breaks MCP config JSON quoting." >&2; exit 4 ;;
esac

if [[ -n "$GAME_DIR_WIN" ]]; then
  case "$GAME_DIR_WIN" in
    *" "*) echo "Refusing: WSL blind runner path contains a space, which breaks cmd.exe MCP launch quoting." >&2; exit 4 ;;
  esac
  GAME_DIR_WIN_JSON="${GAME_DIR_WIN//\\/\\\\}"
  RUN_EVIDENCE_WIN="$(wslpath -w "$RUN_EVIDENCE")"
  RUN_EVIDENCE_WIN_JSON="${RUN_EVIDENCE_WIN//\\/\\\\}"
  CODEX_MCP_CMD="cmd.exe"
  CODEX_MCP_ARGS_TOML='["/c", "cd /d '"$GAME_DIR_WIN_JSON"' && npm --silent run mcp -- --play-mode '"$PLAY_MODE"' --run-evidence '"$RUN_EVIDENCE_WIN_JSON$SPECTATE_CMD_SUFFIX"'"]'
  cat > "$MCP_CONFIG" <<JSON
{
  "mcpServers": {
    "adventureforge": {
      "command": "cmd.exe",
      "args": ["/c", "cd /d $GAME_DIR_WIN_JSON && npm --silent run mcp -- --play-mode $PLAY_MODE --run-evidence $RUN_EVIDENCE_WIN_JSON$SPECTATE_CMD_SUFFIX"]
    }
  }
}
JSON
else
  CODEX_MCP_CMD="npm"
  CODEX_MCP_ARGS_TOML='["--silent", "--prefix", "'"$GAME_DIR_MCP"'", "run", "mcp", "--", "--play-mode", "'"$PLAY_MODE"'", "--run-evidence", "'"$RUN_EVIDENCE_MCP"'"'"$SPECTATE_ARGS_JSON"']'
  cat > "$MCP_CONFIG" <<JSON
{
  "mcpServers": {
    "adventureforge": {
      "command": "npm",
      "args": ["--silent", "--prefix", "$GAME_DIR_MCP", "run", "mcp", "--", "--play-mode", "$PLAY_MODE", "--run-evidence", "$RUN_EVIDENCE_MCP"$SPECTATE_ARGS_JSON]
    }
  }
}
JSON
fi

# Persona overlay: a play-style disposition only (NO design/solution info —
# see blind-tester/personas/*.md). "default" is comment-only, and fill-prompt.mjs
# collapses a comment-only/empty persona to a no-op, so the DEFAULT path fills
# byte-identically to before personas existed.
PERSONA_FILE="$SCRIPT_DIR/personas/$PERSONA.md"
if [[ ! -f "$PERSONA_FILE" ]]; then
  echo "Unknown persona \"$PERSONA\" (no such file: $PERSONA_FILE)." >&2
  echo "Available personas: $(cd "$SCRIPT_DIR/personas" && ls -- *.md | sed 's/\.md$//' | tr '\n' ' ')" >&2
  exit 2
fi

# Fill the locked blind prompt. fill-prompt.mjs owns {{START_INSTRUCTION}},
# __SEED__, and the {{PERSONA}} overlay line (see that file for the exact
# substitution rules, including the empty-persona zero-residue guarantee).
FILL_SCRIPT="$(node_path_arg "$SCRIPT_DIR/fill-prompt.mjs")"
PROMPT_FILE_ARG="$(node_path_arg "$PROMPT_FILE")"
PERSONA_FILE_ARG="$(node_path_arg "$PERSONA_FILE")"
PROMPT="$("$NODE_CMD" "$FILL_SCRIPT" "$PROMPT_FILE_ARG" --seed "$SEED" --start-instruction "$START_INSTRUCTION" --persona-file "$PERSONA_FILE_ARG")"

# Report destination.
if [[ -z "$OUT" ]]; then
  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  OUT="$SCRIPT_DIR/reports/${STAMP}_${SOURCE_SLUG}_seed${SEED}"
fi
mkdir -p "$(dirname "$OUT")"
RUN_SIDECAR="$OUT.run.json"
# An explicit --out prefix may be reused after a failed attempt. Never leave a
# previously verified receipt beside a newly truncated/timed-out report.
rm -f "$RUN_SIDECAR"

echo "Blind playtest → $SOURCE_LABEL seed=$SEED model=$MODEL"
echo "Play contract: $PLAY_MODE / $START_SURFACE"
echo "Report prefix: $OUT"

# Codex only exposes repo MCP servers when its own config enables them. The blind
# override commonly runs with --ignore-user-config from an untrusted temp cwd, so
# inject both the server and the current deferred-MCP feature flag through `-c`.
CODEX_SHIM_BIN=""
if [[ "${BLIND_AGENT_CMD:-}" == *codex* && "${BLIND_CODEX_NO_INJECT:-0}" != "1" ]]; then
  REAL_CODEX="$(command -v codex || true)"
  if [[ -n "$REAL_CODEX" ]]; then
    CODEX_SHIM_BIN="$WORK/bin"
    mkdir -p "$CODEX_SHIM_BIN"
    cat > "$CODEX_SHIM_BIN/codex" <<SHIM
#!/usr/bin/env bash
# Auto-generated by blind-tester/run.sh — injects the adventureforge MCP server.
if [[ "\${1:-}" == exec || "\${1:-}" == e || "\${1:-}" == review ]]; then
  sub="\$1"; shift
  args=("\$@")
  tail=()
  last_index=\$(( \${#args[@]} - 1 ))
  if [[ "\${#args[@]}" -gt 0 && "\${args[\$last_index]}" == "-" ]]; then
    tail=("-")
    unset "args[\$last_index]"
  fi
  exec "$REAL_CODEX" "\$sub" "\${args[@]}" \\
    -c 'mcp_servers.adventureforge.command="$CODEX_MCP_CMD"' \\
    -c 'mcp_servers.adventureforge.args=$CODEX_MCP_ARGS_TOML' \\
    -c 'mcp_servers.adventureforge.startup_timeout_sec=20' \\
    -c 'mcp_servers.adventureforge.tool_timeout_sec=60' \\
    -c 'mcp_servers.adventureforge.enabled=true' \\
    "\${tail[@]}"
fi
exec "$REAL_CODEX" "\$@"
SHIM
    chmod +x "$CODEX_SHIM_BIN/codex"
  fi
fi

# Provider override path: hand the prompt to any MCP-capable agent CLI.
if [[ -n "${BLIND_AGENT_CMD:-}" ]]; then
  echo "Using BLIND_AGENT_CMD override."
  set +e
  (
    cd "$WORK"
    PATH="${CODEX_SHIM_BIN:+$CODEX_SHIM_BIN:}$PATH" \
    BLIND_MCP_CONFIG="$MCP_CONFIG" BLIND_QUEST_ID="$QUEST_ID" BLIND_SEED="$SEED" \
      BLIND_PLAY_MODE="$PLAY_MODE" BLIND_START_SURFACE="$START_SURFACE" \
      timeout "$TIMEOUT" bash -c "$BLIND_AGENT_CMD" <<<"$PROMPT"
  ) | tee "$OUT.md"
  AGENT_STATUS="${PIPESTATUS[0]}"
  set -e
  if [[ "$AGENT_STATUS" -ne 0 ]]; then
    if [[ "$AGENT_STATUS" -eq 124 || "$AGENT_STATUS" -eq 137 ]]; then
      echo "✗ blind run hit the ${TIMEOUT}s technical timeout; no exit interview or retention result is accepted." >&2
    fi
    exit "$AGENT_STATUS"
  fi
  # The override agent's report is NOT exempt from the gate: run the same
  # verifier as the default path (MCP-failure text, sections, exit interview).
  REPORT_MD="$OUT.md"
  if command -v wslpath >/dev/null 2>&1 && [[ "$REPORT_MD" == /mnt/* ]]; then
    REPORT_MD="$(wslpath -w "$REPORT_MD")"
  fi
  RUN_SIDECAR_ARG="$(node_path_arg "$RUN_SIDECAR")"
  if [[ "$PLAY_MODE" == "pure" ]]; then
    RUN_EVIDENCE_ARG="$(node_path_arg "$RUN_EVIDENCE")"
    ( cd "$GAME_DIR" && npm --silent exec tsx -- scripts/verify-blind-report.ts "$REPORT_MD" \
      --require-mode pure --run-evidence "$RUN_EVIDENCE_ARG" --write-run-sidecar "$RUN_SIDECAR_ARG" )
  else
    ( cd "$GAME_DIR" && npm --silent exec tsx -- scripts/verify-blind-report.ts "$REPORT_MD" \
      --require-mode structural --write-run-sidecar "$RUN_SIDECAR_ARG" )
  fi
  echo "✓ Blind report saved: $OUT.md"
  exit 0
fi

# Default blind player: Claude Code on your subscription. NOTE the blind player is
# INDEPENDENT of the loop's driver — a Codex-primary loop can (and, for a diverse
# playtester, may prefer to) run any MCP-capable agent here via BLIND_AGENT_CMD.
# A Codex override is auto-wrapped with the engine MCP server, even with
# --ignore-user-config / --ephemeral / --skip-git-repo-check, e.g.:
#   BLIND_AGENT_CMD='codex exec --ignore-user-config --ephemeral --skip-git-repo-check --sandbox read-only -'
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
# only adventureforge is reachable. ToolSearch is left available for clients that
# defer MCP tools, but the prompts also allow direct adventureforge tool calls.
# The prompt is delivered on stdin so the variadic --disallowedTools cannot swallow it.
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
  if [[ $STATUS -eq 124 || $STATUS -eq 137 ]]; then
    echo "✗ blind run hit the ${TIMEOUT}s technical timeout; no exit interview or retention result is accepted." >&2
  fi
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
RUN_SIDECAR_ARG="$(node_path_arg "$RUN_SIDECAR")"
RUN_EVIDENCE_ARG="$(node_path_arg "$RUN_EVIDENCE")"
( cd "$GAME_DIR" && npm --silent exec tsx -- scripts/verify-blind-report.ts "$REPORT_MD" \
  --require-mode pure --run-evidence "$RUN_EVIDENCE_ARG" --write-run-sidecar "$RUN_SIDECAR_ARG" )

# Token/cost telemetry (measure loop efficiency instead of guessing): fold the
# claude envelope's usage into the gitignored ai-runs/blind-telemetry.jsonl.
# Best-effort — measurement must never fail the run it measures.
"$NODE_CMD" "$(node_path_arg "$SCRIPT_DIR/telemetry.mjs")" record "$(node_path_arg "$OUT.json")" \
  --source "$SOURCE_SLUG" --seed "$SEED" --model "$MODEL" \
  || echo "(telemetry append failed — non-fatal)" >&2

echo "✓ Blind report saved: $OUT.md"
grep -iE 'clarity .*[0-9]|enjoyment .*[0-9]' "$OUT.md" | head -2 || true
