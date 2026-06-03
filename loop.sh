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
  # ai-loop.ts writes the cycle prompt as prompt.md (older runs used agent-prompt.md).
  find ai-runs \( -path '*/prompt.md' -o -path '*/agent-prompt.md' \) -type f -printf '%T@ %p\n' 2>/dev/null | sort -nr | awk 'NR==1 {print $2}'
}

# Resolve the headless agent command that does each cycle's WORK (incl. the
# mandatory blind LLM playtest). Precedence:
#   1. $AI_AGENT_CMD  — explicit, e.g. "claude -p --dangerously-skip-permissions"
#   2. Claude Code    — `claude -p` (preferred: it has the Task tool, so it can
#                        spawn the blind-playtest subagent the prompt requires)
#   3. Codex          — `codex exec` if installed + authed
#   4. (none)         — evidence-only: the prompt is written but no work is done
# The chosen command must read the prompt from STDIN (claude -p and codex `-` both do).
agent_cmd() {
  if [[ -n "${AI_AGENT_CMD:-}" ]]; then echo "$AI_AGENT_CMD"; return 0; fi
  if command -v claude >/dev/null 2>&1; then echo "claude -p --dangerously-skip-permissions"; return 0; fi
  if command -v codex >/dev/null 2>&1 && [[ -f "${CODEX_HOME:-$HOME/.codex}/auth.json" ]]; then
    echo "codex -a never exec --sandbox ${AI_CODEX_SANDBOX:-workspace-write} --cd $PWD -"; return 0
  fi
  echo ""
}

run_agent() {
  local prompt cmd
  prompt="$(latest_prompt)"
  if [[ -z "$prompt" ]]; then echo "No AFK agent prompt found; skipping agent handoff."; return 0; fi
  if [[ "${AI_LOOP_RUN_AGENT:-1}" != "1" ]]; then echo "AI_LOOP_RUN_AGENT is not 1; prompt is ready at $prompt."; return 0; fi
  cmd="$(agent_cmd)"
  if [[ -z "$cmd" ]]; then echo "No agent available (set AI_AGENT_CMD, e.g. 'claude -p --dangerously-skip-permissions'); evidence-only. Prompt at $prompt."; return 0; fi
  local budget="${AI_AGENT_TIMEOUT_SECONDS:-2400}"
  # Per-cycle override: ai-loop.ts writes agentTimeoutSeconds into latest-cycle.json
  # for ultraplan cycles, which run a bounded multi-agent Workflow and need a larger
  # budget than a routine cycle. Falls back to the default when absent.
  local override
  override="$(node -e 'try{const t=JSON.parse(require("node:fs").readFileSync("ai-runs/latest-cycle.json","utf8")).agentTimeoutSeconds;if(typeof t==="number"&&t>0)process.stdout.write(String(t))}catch{}' 2>/dev/null || true)"
  [[ -n "$override" ]] && budget="$override"
  echo "Agent: $cmd   (prompt: $prompt, timeout: ${budget}s)"
  # Bound the agent turn. The loop has NO other recovery for an agent that never
  # returns (a hung `claude -p` once wedged the loop for ~9h: the circuit breaker
  # only counts COMPLETED no-progress cycles, so it can't catch a stuck turn). On
  # timeout, SIGTERM then SIGKILL after a 30s grace; swallow the error so the cycle
  # proceeds to the verify gates, which decide whether anything is committable (a
  # timed-out turn that left nothing simply becomes a no-progress cycle).
  local rc=0
  timeout --kill-after=30 "$budget" bash -c "$cmd" < "$prompt" || rc=$?
  if [[ "$rc" -eq 124 || "$rc" -eq 137 ]]; then
    echo "⏱ Agent exceeded ${budget}s and was terminated — continuing to verify."
  fi
  return 0
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

require_playtest_record() {
  # MANDATORY LLM PLAYTEST (every cycle): the agent must produce a blind-playtest
  # report at the path ai-loop.ts recorded in ai-runs/latest-cycle.json. Refuse to
  # commit a cycle that skipped it — quality feedback is non-negotiable. Only
  # enforced when actually committing (evidence-only runs don't commit).
  [[ "${AI_LOOP_COMMIT:-0}" == "1" ]] || return 0
  local meta="ai-runs/latest-cycle.json" rec
  if [[ ! -f "$meta" ]]; then
    echo "No cycle metadata ($meta); cannot verify the mandatory playtest. Refusing to commit."
    return 1
  fi
  rec="$(node -e 'console.log(JSON.parse(require("node:fs").readFileSync("ai-runs/latest-cycle.json","utf8")).playtestRecord||"")')"
  if [[ -z "$rec" || ! -s "$rec" ]]; then
    echo "Mandatory LLM playtest record missing or empty ($rec). Every cycle must run a blind LLM playtest. Refusing to commit."
    return 1
  fi
  echo "✓ mandatory playtest record present: $rec"
}

run_cycle() {
  # Each gate fails the cycle EXPLICITLY (|| return 1) rather than relying on
  # `set -e`, so a bad cycle skips its commit and the outer loop continues to the
  # next one (resilient unattended operation) instead of the whole script dying.
  local baseline start_ref
  baseline="$(git status --porcelain -- "${status_filter[@]}")"
  start_ref="$(git rev-parse HEAD)"
  npm run ai:loop || { echo "ai:loop failed"; return 1; }
  # The agent (claude -p by default) does the actual work + the mandatory blind LLM
  # playtest. If it is unavailable the cycle simply makes no changes and the gates
  # below skip the commit.
  run_agent || echo "(agent step reported an error — continuing to verify)"
  # Trust, but verify: health is a BLOCKING gate (runs the static verifier-integrity
  # check too). A red check ⇒ no commit this cycle.
  npm run health || { echo "health failed — skipping commit this cycle"; return 1; }
  # Don't route around the verifier. A content cycle that re-pins a hash ALONGSIDE a
  # real content change is the legitimate snapshot-update workflow → surfaced, allowed.
  # This blocks only actual weakening: deleted/disabled tests, a dropped test count,
  # a deleted protected asset, or a re-pin with NO content change (the launder pattern).
  # AI_LOOP_ALLOW_VERIFIER_EDITS=1 overrides only the unaccompanied-re-pin case.
  npm run verify:integrity -- --against "$start_ref" || { echo "verifier weakened/laundered — skipping commit this cycle"; return 1; }
  # Quality feedback is mandatory: no blind-playtest record ⇒ no commit.
  require_playtest_record || return 1
  safe_commit_if_enabled "$baseline" || { echo "commit failed"; return 1; }
  if [[ "${AI_LOOP_PUSH:-0}" == "1" ]]; then
    git push || { echo "push failed"; return 1; }
  fi
  return 0
}

count=0
fails=0
max_fails="${AI_LOOP_MAX_CONSECUTIVE_FAILURES:-5}"
delay="${AI_LOOP_DELAY_SECONDS:-10}"
while true; do
  if run_cycle; then
    fails=0
    echo "✓ cycle $((count + 1)) complete."
  else
    fails=$((fails + 1))
    echo "✗ cycle $((count + 1)) made no committed progress ($fails/$max_fails consecutive)."
    if [[ "$fails" -ge "$max_fails" ]]; then
      echo "Circuit breaker: $max_fails consecutive cycles without progress — stopping. Check ai-runs/ and AI_LOOP_STATE.md."
      break
    fi
  fi
  count=$((count + 1))
  if [[ "$once" == "1" ]]; then
    break
  fi
  if [[ -n "$cycles" && "$count" -ge "$cycles" ]]; then
    break
  fi
  sleep "$delay"
done
