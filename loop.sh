#!/usr/bin/env bash
set -euo pipefail

cycles="${AI_LOOP_MAX_CYCLES:-}"
once=0
if [[ "${1:-}" == "--once" ]]; then
  once=1
fi

status_filter=(. ':(exclude)ai-runs' ':(exclude)node_modules' ':(exclude)dist' ':(exclude)coverage' ':(exclude)traces/*.json')

if [[ ! -d node_modules ]]; then
  npm install
fi

latest_prompt() {
  find ai-runs -path '*/agent-prompt.md' -type f -printf '%T@ %p\n' 2>/dev/null | sort -nr | awk 'NR==1 {print $2}'
}

codex_available() {
  command -v codex >/dev/null 2>&1 && [[ -f "${CODEX_HOME:-$HOME/.codex}/auth.json" ]]
}

run_codex_if_available() {
  local prompt
  prompt="$(latest_prompt)"
  if [[ -z "$prompt" ]]; then
    echo "No AFK agent prompt found; skipping Codex handoff."
    return 0
  fi
  if [[ "${AI_LOOP_RUN_CODEX:-1}" != "1" ]]; then
    echo "AI_LOOP_RUN_CODEX is not 1; prompt is ready at $prompt."
    return 0
  fi
  if ! codex_available; then
    echo "Codex CLI auth is not available for CODEX_HOME=${CODEX_HOME:-$HOME/.codex}; prompt is ready at $prompt."
    return 0
  fi
  codex -a never exec --sandbox "${AI_CODEX_SANDBOX:-workspace-write}" --cd "$PWD" - < "$prompt"
}

safe_commit_if_enabled() {
  local baseline="$1"
  if [[ "${AI_LOOP_COMMIT:-0}" != "1" ]]; then
    return 0
  fi
  local current
  current="$(git status --porcelain -- "${status_filter[@]}")"
  if [[ -n "$baseline" && "${AI_LOOP_ALLOW_DIRTY_BASELINE:-0}" != "1" ]]; then
    echo "Refusing AFK commit because the baseline was already dirty. Set AI_LOOP_ALLOW_DIRTY_BASELINE=1 to override."
    return 1
  fi
  if [[ -z "$current" ]]; then
    echo "No tracked AFK changes to commit."
    return 0
  fi
  git add AGENTS.md AI_AGENT_PROMPT.md AI_LOOP_STATE.md AFKGOAL.md .codex/config.toml .gitignore .mcp.json package.json package-lock.json src bin scripts loop.sh tests
  git diff --cached --quiet || git commit -m "${AI_LOOP_COMMIT_MESSAGE:-Prepare AFK MCP improvement loop}"
}

run_cycle() {
  local baseline
  baseline="$(git status --porcelain -- "${status_filter[@]}")"
  npm run ai:loop
  run_codex_if_available
  npm run health
  safe_commit_if_enabled "$baseline"

  if [[ "${AI_LOOP_PUSH:-0}" == "1" ]]; then
    git push
  fi
}

count=0
while true; do
  run_cycle
  count=$((count + 1))
  if [[ "$once" == "1" ]]; then
    break
  fi
  if [[ -n "$cycles" && "$count" -ge "$cycles" ]]; then
    break
  fi
done
