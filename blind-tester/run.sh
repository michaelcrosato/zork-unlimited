#!/usr/bin/env bash
#
# blind-tester/run.sh — drive a BLIND playtest through the AdventureForge MCP
# server, using a runner-owned Claude or Codex subscription CLI provider. The
# agent runs from an isolated temp dir and is restricted to the
# `mcp__adventureforge__*` tools, so it can only experience the game through the same
# structured surface a real player would — never the source, the YAML, or the repo's
# own CLAUDE.md.
#
# Usage:
#   blind-tester/run.sh [--provider claude|codex] [--seed <n>] [--model <id>] [--out <prefix>]   # CORE GAME
#   blind-tester/run.sh --quest <id> --mock [--seed <n>] ...              # structural targeted test, no LLM
#   blind-tester/run.sh --smoke [--quest <id>] [--seed <n>]               # structural MCP smoke, no LLM
#   ... [--persona <name>]  # play-style overlay; see blind-tester/personas/*.md (default: "default", a no-op)
#
# Pure evidence uses one of the built-in hardened launchers. BLIND_AGENT_CMD is
# an internal structural mock/QA seam only; arbitrary provider commands cannot
# be labeled pure because this runner cannot prove their isolation.
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
PROVIDER="${BLIND_PROVIDER:-codex}"
MODEL="${BLIND_MODEL:-}"
OUT=""
SMOKE=0
MOCK=0
TIMEOUT="${BLIND_TIMEOUT:-1200}"
REPORT_RECOVERY_TIMEOUT="${BLIND_REPORT_RECOVERY_TIMEOUT:-120}"
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
    --provider)         PROVIDER="$2"; shift 2 ;;
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

case "$PROVIDER" in
  claude|codex) ;;
  *) echo "--provider must be exactly claude or codex." >&2; exit 2 ;;
esac
if [[ -z "$MODEL" ]]; then
  if [[ "$PROVIDER" == "codex" ]]; then
    MODEL="gpt-5.3-codex-spark"
  else
    MODEL="sonnet"
  fi
fi
if [[ "$MOCK" == "0" && "$SMOKE" == "0" ]]; then
  if [[ "$PROVIDER" == "codex" ]]; then
    case "$MODEL" in
      gpt-5.6-sol|gpt-5.6-terra|gpt-5.6-luna|gpt-5.3-codex-spark) ;;
      *) echo "Codex pure runs require exact model gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, or gpt-5.3-codex-spark; aliases and fallbacks are forbidden." >&2; exit 2 ;;
    esac
  else
    case "$MODEL" in
      haiku|sonnet|opus) ;;
      *) echo "Claude pure runs require exact supported alias haiku, sonnet, or opus." >&2; exit 2 ;;
    esac
  fi
fi

# The seed becomes private MCP server argv in pure mode, so canonicalize it
# before any shell/JSON interpolation and reject values the deterministic engine
# cannot represent exactly.
if ! CANONICAL_SEED="$("$NODE_CMD" -e '
const raw = process.argv[1];
if (!/^-?[0-9]+$/.test(raw ?? "")) process.exit(2);
const seed = Number(raw);
if (!Number.isSafeInteger(seed)) process.exit(2);
process.stdout.write(String(seed));
' -- "$SEED")"; then
  echo "--seed requires a JavaScript safe integer." >&2
  exit 2
fi
SEED="$CANONICAL_SEED"

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

# There are exactly two harness contracts. The built-in live reasoning-agent run
# is the pure, human-equivalent fresh-overworld path. Structural behavior is
# available only behind explicit --smoke/--mock switches.
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

# An arbitrary command can obey the player-only MCP allowlist while still using
# shell/file tools to inspect the checkout. Receipt verification cannot detect
# that contamination, so untrusted provider overrides are categorically barred
# from pure evidence rather than relying on operator discipline.
if [[ "$PLAY_MODE" == "pure" && -n "${BLIND_AGENT_CMD:-}" ]]; then
  echo "BLIND_AGENT_CMD cannot produce pure retention evidence: its file/shell/web isolation is not enforceable by this runner." >&2
  echo "Use a built-in --provider, or an explicit --mock structural QA run." >&2
  exit 2
fi

case "$REPORT_RECOVERY_TIMEOUT" in
  ''|*[!0-9]*|0) echo "BLIND_REPORT_RECOVERY_TIMEOUT requires a positive whole number of seconds." >&2; exit 2 ;;
esac
case "$TIMEOUT" in
  ''|*[!0-9]*|0) echo "BLIND_TIMEOUT requires a positive whole number of seconds." >&2; exit 2 ;;
esac

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
# BLIND_MOCK_AGENT_CMD is a structural-only test seam (used to exercise timeout
# failures); it can never reach the pure branch above.
if [[ "$MOCK" == "1" ]]; then
  if [[ -n "${BLIND_MOCK_AGENT_CMD:-}" ]]; then
    BLIND_AGENT_CMD="$BLIND_MOCK_AGENT_CMD"
  else
    MOCK_AGENT_SCRIPT="$(node_path_arg "$SCRIPT_DIR/mock-agent.mjs")"
    printf -v BLIND_AGENT_CMD '%q %q' "$NODE_CMD" "$MOCK_AGENT_SCRIPT"
  fi
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

# Bind private evidence to the exact launch commit and to staged/unstaged
# tracked state. Untracked local notes are deliberately outside this signal.
# The same probe is repeated after Claude exits and before artifacts publish so
# a long run cannot silently outlive the code/build identity it claims.
CURRENT_BUILD_COMMIT=""
CURRENT_TRACKED_WORKTREE_CLEAN=""
read_current_tracked_provenance() {
  local unstaged_status staged_status
  if ! CURRENT_BUILD_COMMIT="$(git -C "$GAME_DIR" rev-parse --verify 'HEAD^{commit}')"; then
    return 1
  fi
  if [[ ! "$CURRENT_BUILD_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
    return 1
  fi
  if git -C "$GAME_DIR" diff --quiet --ignore-submodules=untracked --; then
    unstaged_status=0
  else
    unstaged_status=$?
  fi
  if git -C "$GAME_DIR" diff --cached --quiet --ignore-submodules=untracked --; then
    staged_status=0
  else
    staged_status=$?
  fi
  if [[ "$unstaged_status" -gt 1 || "$staged_status" -gt 1 ]]; then
    return 1
  fi
  CURRENT_TRACKED_WORKTREE_CLEAN=true
  if [[ "$unstaged_status" -eq 1 || "$staged_status" -eq 1 ]]; then
    CURRENT_TRACKED_WORKTREE_CLEAN=false
  fi
}

if ! read_current_tracked_provenance; then
  echo "Git failed while reading tracked blind-run provenance." >&2
  exit 4
fi
BUILD_COMMIT="$CURRENT_BUILD_COMMIT"
TRACKED_WORKTREE_CLEAN="$CURRENT_TRACKED_WORKTREE_CLEAN"

assert_launch_provenance_unchanged() {
  if ! read_current_tracked_provenance; then
    echo "Git failed while rechecking blind-run provenance." >&2
    return 1
  fi
  if [[ "$CURRENT_BUILD_COMMIT" != "$BUILD_COMMIT" || \
        "$CURRENT_TRACKED_WORKTREE_CLEAN" != "$TRACKED_WORKTREE_CLEAN" ]]; then
    echo "Blind-run provenance changed after launch; refusing to publish retention evidence." >&2
    echo "  launch:  commit=$BUILD_COMMIT tracked_clean=$TRACKED_WORKTREE_CLEAN" >&2
    echo "  current: commit=$CURRENT_BUILD_COMMIT tracked_clean=$CURRENT_TRACKED_WORKTREE_CLEAN" >&2
    return 1
  fi
}

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
PURE_PUBLICATION_COMPLETE=0
PURE_OUTPUT_PREFIX_OWNED=0
cleanup_runner() {
  local status=$?
  # A pure report is discoverable as soon as its canonical .md path exists, so
  # remove every acceptance artifact unless the final exclusive sidecar commit
  # completed. Raw envelopes/logs remain available for failure diagnosis.
  if [[ "${PLAY_MODE:-}" == "pure" && "${PURE_OUTPUT_PREFIX_OWNED:-0}" == "1" && \
        "${PURE_PUBLICATION_COMPLETE:-0}" != "1" ]]; then
    if [[ -n "${OUT:-}" ]]; then
      rm -f -- "$OUT.md"
    fi
    if [[ -n "${RUN_SIDECAR:-}" ]]; then
      rm -f -- "$RUN_SIDECAR"
    fi
    if [[ -n "${DURABLE_RUN_EVIDENCE:-}" ]]; then
      rm -f -- "$DURABLE_RUN_EVIDENCE"
    fi
  fi
  rm -rf -- "$WORK"
  return "$status"
}
trap cleanup_runner EXIT
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

RUN_PROVENANCE_ARGS_JSON=", \"--run-seed\", \"$SEED\", \"--build-commit\", \"$BUILD_COMMIT\", \"--tracked-worktree-clean\", \"$TRACKED_WORKTREE_CLEAN\""
RUN_PROVENANCE_CMD_SUFFIX=" --run-seed $SEED --build-commit $BUILD_COMMIT --tracked-worktree-clean $TRACKED_WORKTREE_CLEAN"

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
  RUN_EVIDENCE_WIN="$(wslpath -w "$RUN_EVIDENCE")"
  case "$GAME_DIR_WIN|$RUN_EVIDENCE_WIN" in
    *" "*|*"&"*|*"|"*|*"^"*|*"<"*|*">"*|*"%"*|*"!"*|*"("*|*")"*)
      echo "Refusing: WSL game or evidence path contains a cmd.exe metacharacter." >&2
      exit 4
      ;;
  esac
  GAME_DIR_WIN_JSON="${GAME_DIR_WIN//\\/\\\\}"
  RUN_EVIDENCE_WIN_JSON="${RUN_EVIDENCE_WIN//\\/\\\\}"
  CODEX_MCP_CMD="cmd.exe"
  CODEX_MCP_ARGS_TOML="[\"/c\", \"cd /d $GAME_DIR_WIN_JSON && npm --silent run mcp -- --play-mode $PLAY_MODE --run-evidence $RUN_EVIDENCE_WIN_JSON$RUN_PROVENANCE_CMD_SUFFIX$SPECTATE_CMD_SUFFIX\"]"
  cat > "$MCP_CONFIG" <<JSON
{
  "mcpServers": {
    "adventureforge": {
      "command": "cmd.exe",
      "args": ["/c", "cd /d $GAME_DIR_WIN_JSON && npm --silent run mcp -- --play-mode $PLAY_MODE --run-evidence $RUN_EVIDENCE_WIN_JSON$RUN_PROVENANCE_CMD_SUFFIX$SPECTATE_CMD_SUFFIX"]
    }
  }
}
JSON
else
  CODEX_MCP_CMD="npm"
  CODEX_MCP_ARGS_TOML="[\"--silent\", \"--prefix\", \"$GAME_DIR_MCP\", \"run\", \"mcp\", \"--\", \"--play-mode\", \"$PLAY_MODE\", \"--run-evidence\", \"$RUN_EVIDENCE_MCP\"$RUN_PROVENANCE_ARGS_JSON$SPECTATE_ARGS_JSON]"
  cat > "$MCP_CONFIG" <<JSON
{
  "mcpServers": {
    "adventureforge": {
      "command": "npm",
      "args": ["--silent", "--prefix", "$GAME_DIR_MCP", "run", "mcp", "--", "--play-mode", "$PLAY_MODE", "--run-evidence", "$RUN_EVIDENCE_MCP"$RUN_PROVENANCE_ARGS_JSON$SPECTATE_ARGS_JSON]
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
DURABLE_RUN_EVIDENCE="$OUT.evidence.jsonl"
# Pure verification writes only inside WORK. The adjacent sidecar is the final
# acceptance marker and is published exclusively after every other gate passes.
PRIVATE_RUN_SIDECAR="$WORK/verified-run-sidecar.json"
# One prefix names one launcher attempt. Fleet retries archive and remove every
# failed `$OUT.*` artifact before invoking us again; standalone callers must
# likewise choose a fresh prefix instead of mixing stale receipts or repairs.
OUT_PREFIX_ARG="$(node_path_arg "$OUT")"
if ! PREEXISTING_OUT_ARTIFACTS="$("$NODE_CMD" -e '
const fs = require("node:fs");
const path = require("node:path");
const prefix = process.argv[1];
const directory = path.dirname(prefix);
const ownedPrefix = `${path.basename(prefix)}.`;
const matches = fs.readdirSync(directory)
  .filter((name) => name.startsWith(ownedPrefix))
  .sort()
  .map((name) => path.join(directory, name));
process.stdout.write(matches.join("\n"));
' "$OUT_PREFIX_ARG")"; then
  echo "Cannot inspect the report prefix for pre-existing artifacts." >&2
  exit 4
fi
if [[ -n "$PREEXISTING_OUT_ARTIFACTS" ]]; then
  echo "Refusing to reuse report prefix; pre-existing owned artifact(s):" >&2
  printf '%s\n' "$PREEXISTING_OUT_ARTIFACTS" | sed 's/^/  /' >&2
  exit 4
fi
PURE_OUTPUT_PREFIX_OWNED=1

echo "Blind playtest → $SOURCE_LABEL seed=$SEED provider=$PROVIDER model=$MODEL"
echo "Play contract: $PLAY_MODE / $START_SURFACE"
echo "Report prefix: $OUT"

# Structural QA commands that invoke Codex need the generated MCP config injected.
# This shim is unreachable from pure mode because arbitrary overrides were rejected
# before the work directory and MCP launch configuration were created.
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

# Structural mock/QA override path. Pure mode has already rejected arbitrary
# commands, so output from this branch is always retention-ineligible.
if [[ -n "${BLIND_AGENT_CMD:-}" ]]; then
  if [[ "$PLAY_MODE" != "structural" ]]; then
    echo "Internal error: an untrusted agent command reached pure mode." >&2
    exit 4
  fi
  echo "Using structural BLIND_AGENT_CMD override."
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
  STRUCTURAL_RUN_SIDECAR_ARG="$(node_path_arg "$RUN_SIDECAR")"
  ( cd "$GAME_DIR" && npm --silent exec tsx -- scripts/verify-blind-report.ts "$REPORT_MD" \
    --require-mode structural --write-run-sidecar "$STRUCTURAL_RUN_SIDECAR_ARG" )
  echo "✓ Blind report saved: $OUT.md"
  exit 0
fi

# Built-in pure providers never fall back to one another. Each imports only its
# subscription authentication into a per-run sterile home. Codex deliberately
# persists exactly one rollout inside that disposable home so fleet attestation
# can authenticate the actual provider/model/effort independently of stdout.
if [[ "$PROVIDER" == "claude" ]]; then
if ! command -v claude >/dev/null 2>&1; then
  echo "claude CLI not found. Install Claude Code or choose --provider codex." >&2
  exit 3
fi

# Claude always consults its config home for authentication/session state. Give
# this run a sterile home so global CLAUDE.md, settings, hooks, plugins, skills,
# MCP OAuth, and auto-memory cannot affect the blind player. The only imported
# state is the subscription OAuth object needed to authenticate; the exclusive
# 0600 write also prevents a pre-planted destination from being overwritten.
SOURCE_CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SOURCE_CLAUDE_CREDENTIALS="$SOURCE_CLAUDE_CONFIG_DIR/.credentials.json"
STERILE_CLAUDE_CONFIG_DIR="$WORK/claude-config"
mkdir -p "$STERILE_CLAUDE_CONFIG_DIR"
SOURCE_CLAUDE_CREDENTIALS_ARG="$(node_path_arg "$SOURCE_CLAUDE_CREDENTIALS")"
STERILE_CLAUDE_CREDENTIALS_ARG="$(node_path_arg "$STERILE_CLAUDE_CONFIG_DIR/.credentials.json")"
set +e
"$NODE_CMD" -e '
const fs = require("node:fs");
const source = process.argv[1];
const destination = process.argv[2];
try {
  const parsed = JSON.parse(fs.readFileSync(source, "utf8"));
  const oauth = parsed?.claudeAiOauth;
  if (oauth === null || typeof oauth !== "object" || Array.isArray(oauth) || Object.keys(oauth).length === 0) {
    throw new Error("source credentials lack a valid claudeAiOauth object");
  }
  fs.writeFileSync(destination, `${JSON.stringify({ claudeAiOauth: oauth })}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  fs.chmodSync(destination, 0o600);
} catch (error) {
  try { fs.rmSync(destination, { force: true }); } catch {}
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
' "$SOURCE_CLAUDE_CREDENTIALS_ARG" "$STERILE_CLAUDE_CREDENTIALS_ARG" \
  >"$OUT.credentials.log" 2>&1
CREDENTIAL_COPY_STATUS=$?
set -e
if [[ "$CREDENTIAL_COPY_STATUS" -ne 0 ]]; then
  echo "Could not create the sterile Claude credential store; pure run refused." >&2
  cat "$OUT.credentials.log" >&2 || true
  exit 4
fi
else
  if ! command -v codex >/dev/null 2>&1; then
    echo "codex CLI not found. Install Codex or choose --provider claude." >&2
    exit 3
  fi
  SOURCE_CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
  SOURCE_CODEX_AUTH="$SOURCE_CODEX_HOME/auth.json"
  STERILE_CODEX_HOME="$WORK/codex-home"
  CODEX_PLAYER_CWD="$WORK/player"
  mkdir -p "$CODEX_PLAYER_CWD"
  CODEX_ROLLOUT_SCRIPT="$(node_path_arg "$SCRIPT_DIR/codex-rollout.mjs")"
  SOURCE_CODEX_AUTH_ARG="$(node_path_arg "$SOURCE_CODEX_AUTH")"
  STERILE_CODEX_HOME_ARG="$(node_path_arg "$STERILE_CODEX_HOME")"
  CODEX_PLAYER_CWD_ARG="$(node_path_arg "$CODEX_PLAYER_CWD")"
  set +e
  "$NODE_CMD" "$CODEX_ROLLOUT_SCRIPT" prepare-home \
    --source-auth "$SOURCE_CODEX_AUTH_ARG" --home "$STERILE_CODEX_HOME_ARG" \
    >"$OUT.codex-home.log" 2>&1
  CODEX_HOME_STATUS=$?
  set -e
  if [[ "$CODEX_HOME_STATUS" -ne 0 ]]; then
    echo "Could not create the sterile Codex auth store; pure run refused." >&2
    cat "$OUT.codex-home.log" >&2 || true
    exit 4
  fi
fi

# Keep one telemetry row for the gameplay turn and, when the narrowly gated
# repair path is used, one separately phased row for its token/cost overhead.
# Recovery rows are excluded from playthrough run counts by telemetry.mjs.
PLAYTHROUGH_TELEMETRY_RECORDED=0
RECOVERY_TELEMETRY_RECORDED=0
RECOVERY_ATTEMPTED=0
record_blind_telemetry() {
  local envelope="$1"
  local phase="$2"
  local outcome="${3:-}"
  if [[ -n "$outcome" ]]; then
    "$NODE_CMD" "$(node_path_arg "$SCRIPT_DIR/telemetry.mjs")" record "$(node_path_arg "$envelope")" \
      --source "$SOURCE_SLUG" --seed "$SEED" --model "$MODEL" --phase "$phase" --outcome "$outcome" \
      || echo "(telemetry append failed — non-fatal)" >&2
  else
    "$NODE_CMD" "$(node_path_arg "$SCRIPT_DIR/telemetry.mjs")" record "$(node_path_arg "$envelope")" \
      --source "$SOURCE_SLUG" --seed "$SEED" --model "$MODEL" --phase "$phase" \
      || echo "(telemetry append failed — non-fatal)" >&2
  fi
}

record_playthrough_terminal() {
  local outcome="$1"
  if [[ "$PLAYTHROUGH_TELEMETRY_RECORDED" == "1" ]]; then
    return
  fi
  record_blind_telemetry "$OUT.json" playthrough "$outcome"
  PLAYTHROUGH_TELEMETRY_RECORDED=1
}

record_recovery_terminal() {
  local outcome="$1"
  if [[ "$RECOVERY_ATTEMPTED" != "1" || "$RECOVERY_TELEMETRY_RECORDED" == "1" ]]; then
    return
  fi
  record_blind_telemetry "$OUT.repair.json" report_recovery "$outcome"
  RECOVERY_TELEMETRY_RECORDED=1
}

# Blindness is provider-specific but converges on one contract: an isolated temp
# cwd and only the pure AdventureForge MCP surface. Claude has a positive CLI
# tool allowlist. Codex starts without user/project config, rules, shell, web,
# apps, plugins, hooks, browser, computer, image, or subagent capabilities; its
# JSONL is then audited against the exact pure MCP tool set before verification.
set +e
if [[ "$PROVIDER" == "codex" ]]; then
  CODEX_EVENTS="$OUT.codex.jsonl"
  CODEX_EVENTS_ARG="$(node_path_arg "$CODEX_EVENTS")"
  CODEX_REPORT_ARG="$(node_path_arg "$OUT.md")"
  CODEX_ROLLOUT="$OUT.codex-rollout.jsonl"
  CODEX_ROLLOUT_ARG="$(node_path_arg "$CODEX_ROLLOUT")"
  CODEX_CAPTURE="$OUT.codex-capture.json"
  CODEX_CAPTURE_ARG="$(node_path_arg "$CODEX_CAPTURE")"
  CODEX_ENVELOPE_SCRIPT="$(node_path_arg "$SCRIPT_DIR/codex-pure-envelope.mjs")"
  CODEX_STARTED_AT_MS="$("$NODE_CMD" -e 'process.stdout.write(String(Date.now()))')"
  CODEX_PURE_TOOLS_TOML="$("$NODE_CMD" "$CODEX_ENVELOPE_SCRIPT" --print-tools-toml)"
  printf "%s" "$PROMPT" | ( cd "$CODEX_PLAYER_CWD" && CODEX_HOME="$STERILE_CODEX_HOME_ARG" \
    timeout "$TIMEOUT" codex exec \
    --model "$MODEL" \
    --sandbox read-only \
    --skip-git-repo-check \
    --ignore-user-config \
    --ignore-rules \
    --strict-config \
    --disable apps \
    --disable auth_elicitation \
    --disable browser_use \
    --disable browser_use_external \
    --disable browser_use_full_cdp_access \
    --disable computer_use \
    --disable goals \
    --disable hooks \
    --disable image_generation \
    --disable in_app_browser \
    --disable multi_agent \
    --disable plugins \
    --disable remote_plugin \
    --disable tool_suggest \
    --disable workspace_dependencies \
    --json \
    --output-last-message "$CODEX_REPORT_ARG" \
    --config 'model_reasoning_effort="xhigh"' \
    --config 'features.shell_tool=false' \
    --config 'web_search="disabled"' \
    --config 'approval_policy="never"' \
    --config "mcp_servers.adventureforge.command=\"$CODEX_MCP_CMD\"" \
    --config "mcp_servers.adventureforge.args=$CODEX_MCP_ARGS_TOML" \
    --config "mcp_servers.adventureforge.enabled_tools=$CODEX_PURE_TOOLS_TOML" \
    --config 'mcp_servers.adventureforge.startup_timeout_sec=20' \
    --config 'mcp_servers.adventureforge.tool_timeout_sec=60' \
    --config 'mcp_servers.adventureforge.required=true' \
    - \
  ) > "$CODEX_EVENTS" 2> "$OUT.log"
  STATUS=$?
  if [[ "$STATUS" -eq 0 ]]; then
    "$NODE_CMD" "$CODEX_ROLLOUT_SCRIPT" capture \
      --home "$STERILE_CODEX_HOME_ARG" --out "$CODEX_ROLLOUT_ARG" \
      --receipt "$CODEX_CAPTURE_ARG" \
      --expected-cwd "$CODEX_PLAYER_CWD_ARG" \
      >"$OUT.codex-rollout.log" 2>&1
    CODEX_ROLLOUT_STATUS=$?
    if [[ "$CODEX_ROLLOUT_STATUS" -ne 0 ]]; then
      STATUS=4
      cat "$OUT.codex-rollout.log" >&2 || true
    fi
  fi
  if [[ "$STATUS" -eq 0 ]]; then
    "$NODE_CMD" "$CODEX_ENVELOPE_SCRIPT" \
      --events "$CODEX_EVENTS_ARG" --report "$CODEX_REPORT_ARG" \
      --model "$MODEL" --started-at-ms "$CODEX_STARTED_AT_MS" \
      > "$OUT.json" 2> "$OUT.codex-audit.log"
    CODEX_AUDIT_STATUS=$?
    if [[ "$CODEX_AUDIT_STATUS" -ne 0 ]]; then
      STATUS=4
      cat "$OUT.codex-audit.log" >&2 || true
    fi
  fi
else
printf '%s' "$PROMPT" | ( cd "$WORK" && \
  CLAUDE_CONFIG_DIR="$STERILE_CLAUDE_CONFIG_DIR" CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 \
  timeout "$TIMEOUT" claude \
  --print \
  --output-format json \
  --prompt-suggestions false \
  --name "adventureforge-blind-seed-$SEED" \
  --model "$MODEL" \
  --no-chrome \
  --disable-slash-commands \
  --setting-sources '' \
  --mcp-config "$MCP_CONFIG" \
  --strict-mcp-config \
  --permission-mode dontAsk \
  --tools ToolSearch \
  --allowedTools ToolSearch "mcp__adventureforge__*" \
) > "$OUT.json" 2> "$OUT.log"
STATUS=$?
fi
set -e

if [[ $STATUS -ne 0 ]]; then
  if [[ $STATUS -eq 124 || $STATUS -eq 137 ]]; then
    record_playthrough_terminal technical_timeout
    echo "✗ blind run hit the ${TIMEOUT}s technical timeout; no exit interview or retention result is accepted." >&2
  else
    record_playthrough_terminal cli_failed
  fi
  echo "✗ blind run failed (exit $STATUS). See $OUT.log" >&2
  tail -5 "$OUT.log" >&2 || true
  exit $STATUS
fi

if ! assert_launch_provenance_unchanged; then
  record_playthrough_terminal provenance_failed
  exit 4
fi

# Extract exact result bytes. `jq -r` adds a newline, which would break the
# recovery gate's byte-for-byte binding between envelope and original prose.
OUT_JSON_ARG="$(node_path_arg "$OUT.json")"
"$NODE_CMD" -e 'const fs=require("node:fs");let t="";try{const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));t=typeof j.result==="string"?j.result:"";}catch{}process.stdout.write(t);' "$OUT_JSON_ARG" > "$OUT.md"

REPORT_MD="$OUT.md"
if command -v wslpath >/dev/null 2>&1 && [[ "$REPORT_MD" == /mnt/* ]]; then
  REPORT_MD="$(wslpath -w "$REPORT_MD")"
fi
RUN_SIDECAR_ARG="$(node_path_arg "$RUN_SIDECAR")"
PRIVATE_RUN_SIDECAR_ARG="$(node_path_arg "$PRIVATE_RUN_SIDECAR")"
RUN_EVIDENCE_ARG="$(node_path_arg "$RUN_EVIDENCE")"
# Verification must not create the canonical publication marker. A failed
# verifier may have partially touched only this WORK-private destination.
rm -f "$PRIVATE_RUN_SIDECAR"
INITIAL_VERIFY_LOG="$OUT.verify.initial.log"
set +e
( cd "$GAME_DIR" && npm --silent exec tsx -- scripts/verify-blind-report.ts "$REPORT_MD" \
  --require-mode pure --run-evidence "$RUN_EVIDENCE_ARG" \
  --write-run-sidecar "$PRIVATE_RUN_SIDECAR_ARG" ) \
  >"$INITIAL_VERIFY_LOG" 2>&1
VERIFY_STATUS=$?
set -e
REPORT_RECOVERED=0

if [[ "$VERIFY_STATUS" -ne 0 ]]; then
  cat "$INITIAL_VERIFY_LOG" >&2

  # Codex runs are ephemeral and intentionally have no provider-specific
  # report-recovery path yet. Preserve diagnostics but publish no report,
  # evidence, or sidecar; a new seed must produce a complete report itself.
  if [[ "$PROVIDER" == "codex" ]]; then
    record_playthrough_terminal verification_failed
    echo "✗ Codex blind report failed verification; report recovery is unavailable, so this run is rejected." >&2
    exit "$VERIFY_STATUS"
  fi

  # The sole repairable case is an otherwise complete report that omitted its
  # exit-interview block after a real journey exit. The resumed original session
  # returns strict subjective JSON only; the runner preserves all prose bytes and
  # injects the authenticated receipt. Every other failure remains final.
  RECOVERY_PROMPT="$WORK/report-recovery.prompt"
  RECOVERY_PROMPT_ARG="$(node_path_arg "$RECOVERY_PROMPT")"
  RECOVERY_METADATA="$OUT.repair.meta.json"
  RECOVERY_METADATA_ARG="$(node_path_arg "$RECOVERY_METADATA")"
  REPORT_RECOVERY_SOURCE_ARG="$(node_path_arg "$OUT.md")"
  set +e
  CLAUDE_SESSION_ID="$(
    cd "$GAME_DIR" && npm --silent exec tsx -- scripts/blind-report-recovery.ts prepare \
      --play-mode "$PLAY_MODE" --agent-status "$STATUS" --verifier-status "$VERIFY_STATUS" \
      --attempt 0 --model "$MODEL" --seed "$SEED" --git-commit "$BUILD_COMMIT" \
      --tracked-worktree-clean "$TRACKED_WORKTREE_CLEAN" \
      --envelope "$OUT_JSON_ARG" --run-evidence "$RUN_EVIDENCE_ARG" \
      --report "$REPORT_RECOVERY_SOURCE_ARG" --prompt-out "$RECOVERY_PROMPT_ARG" \
      --metadata-out "$RECOVERY_METADATA_ARG"
  )" 2>"$OUT.repair-gate.log"
  RECOVERY_GATE_STATUS=$?
  set -e
  if [[ "$RECOVERY_GATE_STATUS" -ne 0 ]]; then
    cat "$OUT.repair-gate.log" >&2 || true
    record_playthrough_terminal verification_failed
    exit "$VERIFY_STATUS"
  fi

  # Preserve the rejected response outside the reports/*.md discovery surface.
  INITIAL_REPORT_MARKER="$OUT.initial-report.txt"
  INITIAL_REPORT_MARKER_ARG="$(node_path_arg "$INITIAL_REPORT_MARKER")"
  cp -- "$OUT.md" "$INITIAL_REPORT_MARKER"

  EMPTY_MCP_CONFIG="$WORK/report-recovery-empty-mcp.json"
  printf '{"mcpServers":{}}\n' > "$EMPTY_MCP_CONFIG"
  RECOVERY_JSON_SCHEMA='{"type":"object","additionalProperties":false,"required":["clarity","enjoyment","goal_understood","got_stuck","confusions","bugs","best_moment","worst_moment","would_replay","verdict"],"properties":{"clarity":{"type":"integer","minimum":1,"maximum":5},"enjoyment":{"type":"integer","minimum":1,"maximum":5},"goal_understood":{"type":"boolean"},"got_stuck":{"type":"boolean"},"confusions":{"type":"array","items":{"type":"string","minLength":1}},"bugs":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["where","severity","note"],"properties":{"where":{"type":"string","minLength":1},"severity":{"type":"string","enum":["S0","S1","S2","S3","S4"]},"note":{"type":"string","minLength":1}}}},"best_moment":{"type":"string","minLength":1},"worst_moment":{"type":"string","minLength":1},"would_replay":{"type":"boolean"},"verdict":{"type":"string","minLength":20}}}'
  RECOVERY_ATTEMPTED=1
  set +e
  ( cd "$WORK" && MAX_STRUCTURED_OUTPUT_RETRIES=0 \
    CLAUDE_CONFIG_DIR="$STERILE_CLAUDE_CONFIG_DIR" CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 \
    timeout "$REPORT_RECOVERY_TIMEOUT" claude \
    --print \
    --output-format json \
    --prompt-suggestions false \
    --json-schema "$RECOVERY_JSON_SCHEMA" \
    --max-turns 1 \
    --resume "$CLAUDE_SESSION_ID" \
    --model "$MODEL" \
    --safe-mode \
    --no-chrome \
    --setting-sources '' \
    --mcp-config "$EMPTY_MCP_CONFIG" \
    --strict-mcp-config \
    --permission-mode dontAsk \
    --disable-slash-commands \
    --tools "" \
    --disallowedTools \
      Read Edit Write Bash PowerShell Agent Glob Grep WebFetch WebSearch Task NotebookEdit ToolSearch "mcp__adventureforge__*" \
    < "$RECOVERY_PROMPT" \
  ) > "$OUT.repair.json" 2> "$OUT.repair.log"
  RECOVERY_STATUS=$?
  set -e

  if [[ "$RECOVERY_STATUS" -ne 0 ]]; then
    record_recovery_terminal failed
    record_playthrough_terminal recovery_failed
    if [[ "$RECOVERY_STATUS" -eq 124 || "$RECOVERY_STATUS" -eq 137 ]]; then
      echo "✗ report-only recovery hit the ${REPORT_RECOVERY_TIMEOUT}s technical timeout." >&2
    fi
    echo "✗ report-only recovery failed (exit $RECOVERY_STATUS). See $OUT.repair.log" >&2
    tail -5 "$OUT.repair.log" >&2 || true
    exit "$RECOVERY_STATUS"
  fi

  # Hash assertion after the model turn proves the raw private evidence used to
  # authorize repair was not changed while the original session was resumed.
  set +e
  ( cd "$GAME_DIR" && npm --silent exec tsx -- scripts/blind-report-recovery.ts assert-evidence \
    --run-evidence "$RUN_EVIDENCE_ARG" --metadata "$RECOVERY_METADATA_ARG" \
    --initial-report "$INITIAL_REPORT_MARKER_ARG" ) \
    >"$OUT.repair-evidence.log" 2>&1
  RECOVERY_EVIDENCE_STATUS=$?
  set -e
  if [[ "$RECOVERY_EVIDENCE_STATUS" -ne 0 ]]; then
    record_recovery_terminal failed
    record_playthrough_terminal recovery_failed
    cat "$OUT.repair-evidence.log" >&2 || true
    exit "$RECOVERY_EVIDENCE_STATUS"
  fi

  REPAIR_JSON_ARG="$(node_path_arg "$OUT.repair.json")"
  REPAIR_REPORT="$OUT.repair-report.txt"
  REPAIR_REPORT_ARG="$(node_path_arg "$REPAIR_REPORT")"
  set +e
  ( cd "$GAME_DIR" && npm --silent exec tsx -- scripts/blind-report-recovery.ts extract \
    --envelope "$REPAIR_JSON_ARG" --primary-envelope "$OUT_JSON_ARG" \
    --run-evidence "$RUN_EVIDENCE_ARG" --report "$REPORT_RECOVERY_SOURCE_ARG" \
    --metadata "$RECOVERY_METADATA_ARG" --report-out "$REPAIR_REPORT_ARG" ) \
    >"$OUT.repair-extract.log" 2>&1
  RECOVERY_EXTRACT_STATUS=$?
  set -e
  if [[ "$RECOVERY_EXTRACT_STATUS" -ne 0 ]]; then
    record_recovery_terminal failed
    record_playthrough_terminal recovery_failed
    cat "$OUT.repair-extract.log" >&2 || true
    exit "$RECOVERY_EXTRACT_STATUS"
  fi

  # Verify the candidate while it is still outside reports/*.md. Only a green
  # candidate is promoted to the canonical discovered report path.
  RECOVERY_CANDIDATE_SIDECAR="$WORK/recovery-candidate.run.json"
  RECOVERY_CANDIDATE_SIDECAR_ARG="$(node_path_arg "$RECOVERY_CANDIDATE_SIDECAR")"
  set +e
  ( cd "$GAME_DIR" && npm --silent exec tsx -- scripts/verify-blind-report.ts "$REPAIR_REPORT_ARG" \
    --require-mode pure --run-evidence "$RUN_EVIDENCE_ARG" \
    --write-run-sidecar "$RECOVERY_CANDIDATE_SIDECAR_ARG" ) \
    >"$OUT.verify.repair-candidate.log" 2>&1
  RECOVERY_CANDIDATE_VERIFY_STATUS=$?
  set -e
  if [[ "$RECOVERY_CANDIDATE_VERIFY_STATUS" -ne 0 ]]; then
    record_recovery_terminal failed
    record_playthrough_terminal recovery_failed
    cat "$OUT.verify.repair-candidate.log" >&2 || true
    exit "$RECOVERY_CANDIDATE_VERIFY_STATUS"
  fi

  # Promote the repaired report, then reproduce its sidecar privately. The
  # canonical adjacent sidecar remains absent until the transaction commits.
  cp -- "$REPAIR_REPORT" "$OUT.md"
  rm -f "$PRIVATE_RUN_SIDECAR"
  set +e
  ( cd "$GAME_DIR" && npm --silent exec tsx -- scripts/verify-blind-report.ts "$REPORT_MD" \
    --require-mode pure --run-evidence "$RUN_EVIDENCE_ARG" \
    --write-run-sidecar "$PRIVATE_RUN_SIDECAR_ARG" ) \
    >"$OUT.verify.repair-canonical.log" 2>&1
  RECOVERY_VERIFY_STATUS=$?
  set -e
  if [[ "$RECOVERY_VERIFY_STATUS" -ne 0 ]]; then
    rm -f "$OUT.md" "$RUN_SIDECAR"
    record_recovery_terminal failed
    record_playthrough_terminal recovery_failed
    cat "$OUT.verify.repair-canonical.log" >&2 || true
    exit "$RECOVERY_VERIFY_STATUS"
  fi

  # Recheck the evidence hash after the unchanged verifier and delete its
  # sidecar if any concurrent mutation occurred during verification.
  set +e
  ( cd "$GAME_DIR" && npm --silent exec tsx -- scripts/blind-report-recovery.ts assert-evidence \
    --run-evidence "$RUN_EVIDENCE_ARG" --metadata "$RECOVERY_METADATA_ARG" \
    --initial-report "$INITIAL_REPORT_MARKER_ARG" ) \
    >>"$OUT.repair-evidence.log" 2>&1
  RECOVERY_FINAL_EVIDENCE_STATUS=$?
  set -e
  if [[ "$RECOVERY_FINAL_EVIDENCE_STATUS" -ne 0 ]]; then
    rm -f "$OUT.md" "$RUN_SIDECAR"
    record_recovery_terminal failed
    record_playthrough_terminal recovery_failed
    cat "$OUT.repair-evidence.log" >&2 || true
    exit "$RECOVERY_FINAL_EVIDENCE_STATUS"
  fi

  # Re-open the final canonical report bytes against the WORK-private sidecar.
  # Consumers still reject the report because its adjacent commit marker has
  # not been published.
  set +e
  ( cd "$GAME_DIR" && npm --silent exec tsx -- scripts/verify-blind-report.ts "$REPORT_MD" \
    --require-mode pure --run-sidecar "$PRIVATE_RUN_SIDECAR_ARG" ) \
    >"$OUT.verify.repair-final.log" 2>&1
  RECOVERY_FINAL_VERIFY_STATUS=$?
  set -e
  if [[ "$RECOVERY_FINAL_VERIFY_STATUS" -ne 0 ]]; then
    rm -f "$OUT.md" "$RUN_SIDECAR"
    record_recovery_terminal failed
    record_playthrough_terminal recovery_failed
    cat "$OUT.verify.repair-final.log" >&2 || true
    exit "$RECOVERY_FINAL_VERIFY_STATUS"
  fi

  REPORT_RECOVERED=1
fi

if ! assert_launch_provenance_unchanged; then
  rm -f "$OUT.md" "$RUN_SIDECAR" "$DURABLE_RUN_EVIDENCE"
  record_recovery_terminal failed
  record_playthrough_terminal provenance_failed
  exit 4
fi

# Persist the exact server-authored JSONL only after the report and private
# sidecar have passed their final verification. COPYFILE_EXCL preserves the
# one-prefix/one-attempt contract, and the byte comparison guards publication.
DURABLE_RUN_EVIDENCE_ARG="$(node_path_arg "$DURABLE_RUN_EVIDENCE")"
set +e
"$NODE_CMD" -e '
const fs = require("node:fs");
const source = process.argv[1];
const destination = process.argv[2];
try {
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  if (!fs.readFileSync(source).equals(fs.readFileSync(destination))) {
    throw new Error("published evidence bytes differ from private evidence");
  }
} catch (error) {
  try { fs.rmSync(destination, { force: true }); } catch {}
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
' "$RUN_EVIDENCE_ARG" "$DURABLE_RUN_EVIDENCE_ARG" >"$OUT.evidence-publish.log" 2>&1
EVIDENCE_PUBLISH_STATUS=$?
set -e
if [[ "$EVIDENCE_PUBLISH_STATUS" -ne 0 ]]; then
  rm -f "$OUT.md" "$RUN_SIDECAR" "$DURABLE_RUN_EVIDENCE"
  record_recovery_terminal failed
  record_playthrough_terminal publication_failed
  cat "$OUT.evidence-publish.log" >&2 || true
  exit 4
fi

if [[ "$REPORT_RECOVERED" == "1" ]]; then
  set +e
  ( cd "$GAME_DIR" && npm --silent exec tsx -- scripts/blind-report-recovery.ts assert-evidence \
    --run-evidence "$DURABLE_RUN_EVIDENCE_ARG" --metadata "$RECOVERY_METADATA_ARG" \
    --initial-report "$INITIAL_REPORT_MARKER_ARG" ) \
    >"$OUT.repair-published-evidence.log" 2>&1
  PUBLISHED_RECOVERY_EVIDENCE_STATUS=$?
  set -e
  if [[ "$PUBLISHED_RECOVERY_EVIDENCE_STATUS" -ne 0 ]]; then
    rm -f "$OUT.md" "$RUN_SIDECAR" "$DURABLE_RUN_EVIDENCE"
    record_recovery_terminal failed
    record_playthrough_terminal publication_failed
    cat "$OUT.repair-published-evidence.log" >&2 || true
    exit "$PUBLISHED_RECOVERY_EVIDENCE_STATUS"
  fi
fi

# Close the small check/copy race. Any late tracked drift removes every artifact
# that could otherwise be mistaken for accepted retention evidence.
if ! assert_launch_provenance_unchanged; then
  rm -f "$OUT.md" "$RUN_SIDECAR" "$DURABLE_RUN_EVIDENCE"
  record_recovery_terminal failed
  record_playthrough_terminal provenance_failed
  exit 4
fi

# Commit the pure publication transaction by creating the canonical adjacent
# sidecar LAST. Until this exclusive, byte-checked copy succeeds, feedback,
# resume, and fleet consumers reject the report as unpublished. No verifier
# ever receives this canonical destination as an output path.
set +e
"$NODE_CMD" -e '
const fs = require("node:fs");
const source = process.argv[1];
const destination = process.argv[2];
try {
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  if (!fs.readFileSync(source).equals(fs.readFileSync(destination))) {
    throw new Error("published sidecar bytes differ from private sidecar");
  }
} catch (error) {
  try { fs.rmSync(destination, { force: true }); } catch {}
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
' "$PRIVATE_RUN_SIDECAR_ARG" "$RUN_SIDECAR_ARG" >"$OUT.sidecar-publish.log" 2>&1
SIDECAR_PUBLISH_STATUS=$?
set -e
if [[ "$SIDECAR_PUBLISH_STATUS" -ne 0 ]]; then
  rm -f "$OUT.md" "$RUN_SIDECAR" "$DURABLE_RUN_EVIDENCE"
  record_recovery_terminal failed
  record_playthrough_terminal publication_failed
  cat "$OUT.sidecar-publish.log" >&2 || true
  exit 4
fi
PURE_PUBLICATION_COMPLETE=1

if [[ "$REPORT_RECOVERED" == "1" ]]; then
  record_recovery_terminal passed
  record_playthrough_terminal verified_recovered
  echo "✓ Recovered a verifier-valid report from the ended journey (report-only; no tools)."
else
  record_playthrough_terminal verified
fi

echo "✓ Blind report saved: $OUT.md"
grep -iE 'clarity .*[0-9]|enjoyment .*[0-9]' "$OUT.md" | head -2 || true
