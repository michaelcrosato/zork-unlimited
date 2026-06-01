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
  # Trust, but verify (see AGENTS.md): the loop may commit ANY change it makes,
  # including engine/schema code, with no human review — but only AFTER `npm run
  # health` passed in run_cycle (it aborts the cycle before reaching here on a red
  # check). So commits are unconstrained in scope yet always verified. ai-runs/ and
  # other ignored scratch are excluded only because .gitignore handles them.
  local baseline="$1"  # unused; the loop does not refuse on a dirty baseline
  if [[ "${AI_LOOP_COMMIT:-0}" != "1" ]]; then
    return 0
  fi
  git add -A
  git diff --cached --quiet || git commit -m "${AI_LOOP_COMMIT_MESSAGE:-Autonomous AFK improvement cycle}"
}

run_cycle() {
  local baseline start_ref
  baseline="$(git status --porcelain -- "${status_filter[@]}")"
  start_ref="$(git rev-parse HEAD)"
  npm run ai:loop
  run_codex_if_available
  # Trust, but verify: health is a BLOCKING gate (and it runs the static
  # verifier-integrity check). With `set -e` a failing check aborts the cycle
  # BEFORE any commit — the loop never commits red work.
  npm run health
  # Don't route around the verifier: refuse-and-surface (halt the loop, leave the
  # work uncommitted for review) if THIS cycle deleted/disabled tests, modified a
  # protected verification asset, or silently re-pinned a committed hash. A
  # deliberate verifier edit is acknowledged with AI_LOOP_ALLOW_VERIFIER_EDITS=1.
  npm run verify:integrity -- --against "$start_ref"
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
