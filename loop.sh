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
  # Full-trust model (see AGENTS.md): the autonomous loop may commit ANY change it
  # makes, including engine and schema code, with no review and no gate. ai-runs/
  # and other ignored scratch are excluded only because .gitignore handles them.
  local baseline="$1"  # unused; the loop no longer refuses on a dirty baseline
  if [[ "${AI_LOOP_COMMIT:-0}" != "1" ]]; then
    return 0
  fi
  git add -A
  git diff --cached --quiet || git commit -m "${AI_LOOP_COMMIT_MESSAGE:-Autonomous AFK improvement cycle}"
}

run_cycle() {
  local baseline
  baseline="$(git status --porcelain -- "${status_filter[@]}")"
  npm run ai:loop
  run_codex_if_available
  # Advisory only (full-trust model): health is a feedback signal, not a gate.
  # It never blocks the cycle or the commit.
  npm run health || echo "(health reported issues — advisory only, not blocking)"
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
