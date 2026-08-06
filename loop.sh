#!/usr/bin/env bash
# The AFK loop driver. Usage: ./loop.sh [--once]   (protocol: docs/afk_loop.md)
#
# CODEX-ONLY DEFAULT: the routine improvement loop runs OpenAI Codex / ChatGPT
# indefinitely. It resolves the installed Codex CLI without inspecting local
# credential files; provide AI_AGENT_CMD only when an operator deliberately wants
# a different headless command.
#
# Env knobs (defaults in brackets):
#   AI_LOOP_COMMIT=1                 provisional + final-ledger commits [0 = evidence-only]
#   AI_LOOP_PUSH=1                   push after commit [0]; see the push note below
#   AI_LOOP_MAX_CYCLES=N             stop after N cycles [unbounded]
#   AI_LOOP_DELAY_SECONDS=N          pause between cycles [10]
#   AI_AGENT_CMD="..."               explicit full agent command (overrides Codex)
#   AI_CODEX_SANDBOX=...             codex sandbox [workspace-write]
#   AI_AGENT_TIMEOUT_SECONDS=N       hang-kill budget per agent turn [2400]
#   AI_LOOP_MAX_CONSECUTIVE_FAILURES / AI_LOOP_MAX_TOTAL_FAILURES   breakers [5 / 15]
#   AI_LOOP_ALLOW_DIRTY=1            allow risky dirty commit-mode start; never waives clean evidence [0]
#   AI_LOOP_ALLOW_VERIFIER_EDITS=1   acknowledge a deliberate verifier change [0]
#   AI_LOOP_COMMIT_MESSAGE="..."     final ledger commit message override
#
# Companions: npm run loop:status / loop:stop (project-scoped, pid-file based).
# loop-status.sh's breaker/velocity telemetry reads ai-runs/wrapper.log, which
# this script does NOT write — launch with `./loop.sh 2>&1 | tee ai-runs/wrapper.log`
# when you want that telemetry.
set -euo pipefail

cycles="${AI_LOOP_MAX_CYCLES:-}"
once=0
if [[ "${1:-}" == "--once" ]]; then
  once=1
fi

# Refuse to start on a dirty tree: _revert_failed_cycle hard-resets tracked work
# to the cycle-start ref. It snapshots preexisting untracked paths and deletes
# only untracked paths created during the failed cycle, but it cannot restore a
# preexisting untracked file the agent stages/commits, edits, moves, or removes.
# Commit-mode scratch is committed (green) or reverted (red); evidence-only mode
# stops once it leaves pending work. AI_LOOP_ALLOW_DIRTY=1 opts back in deliberately
# for commit mode — the operator accepts those reset/mutation risks. It NEVER waives
# the exact-clean start required by an evidence-only pure playtest.
if [[ "${AI_LOOP_ALLOW_DIRTY:-0}" != "1" ]] && [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to start: the working tree is dirty, and a failed cycle's"
  echo "self-recovery would hard-reset tracked edits. Cycle-created untracked"
  echo "paths are cleaned from a start-of-cycle snapshot, but existing untracked"
  echo "files cannot be restored if the agent stages, mutates, or moves them."
  echo "Commit or stash first, or set AI_LOOP_ALLOW_DIRTY=1 to accept the risk."
  exit 1
fi

# ── Project-scoped PID files (so orchestrator tooling tracks THIS loop only) ──────
# With several projects running identical-looking `./loop.sh` / headless-agent processes,
# pattern-matching across all of them is unsafe (mis-reads + risks killing another
# project's loop). loop.sh records its OWN pid here; run_agent records the actual
# worker pid. scripts/loop-status.sh and scripts/loop-stop.sh act ONLY on these pids.
LOOP_PID_FILE="ai-runs/loop.pid"
AGENT_PID_FILE="ai-runs/agent.pid"
mkdir -p ai-runs
echo "$$" > "$LOOP_PID_FILE"
trap 'rm -f "$LOOP_PID_FILE" "$AGENT_PID_FILE" 2>/dev/null || true' EXIT

if [[ ! -d node_modules ]]; then
  npm install
fi
if [[ ! -d ui/node_modules ]]; then
  npm --prefix ui install
fi

require_clean_evidence_cycle_start() {
  # Pure evidence must name one exact revision. The startup guard runs only once,
  # so enforce this again at EVERY evidence-only cycle boundary; in particular,
  # do not let continuous mode call a prior cycle's dirty tree another success.
  [[ "${AI_LOOP_COMMIT:-0}" != "1" ]] || return 0
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Evidence-only cycle requires an exact-clean worktree at cycle start."
    echo "Commit, stash, or discard the pending work before collecting another baseline;"
    echo "AI_LOOP_ALLOW_DIRTY=1 does not waive pure-play evidence provenance."
    return 1
  fi
}

remove_new_untracked_since_cycle_start() {
  # Input is a NUL-delimited `git ls-files --others --exclude-standard` snapshot.
  # Compare exact path strings, then ask Git to clean only paths absent from that
  # snapshot. This covers src/docs/ui/scripts/bin/etc without broad directory wipes
  # and never selects a snapshot-listed path for cleanup under the dirty override.
  local snapshot="$1" current_snapshot path known existed
  local -a before=() current=() created=()
  if [[ ! -f "$snapshot" ]]; then
    echo "Missing cycle-start untracked snapshot; refusing broad cleanup."
    return 1
  fi
  mapfile -d '' -t before < "$snapshot" || return 1
  current_snapshot="$(mktemp)" || return 1
  git ls-files --others --exclude-standard -z > "$current_snapshot" || {
    rm -f -- "$current_snapshot"
    return 1
  }
  mapfile -d '' -t current < "$current_snapshot" || {
    rm -f -- "$current_snapshot"
    return 1
  }
  rm -f -- "$current_snapshot"
  for path in "${current[@]}"; do
    existed=0
    for known in "${before[@]}"; do
      if [[ "$known" == "$path" ]]; then
        existed=1
        break
      fi
    done
    [[ "$existed" == "1" ]] || created+=("$path")
  done
  if (( ${#created[@]} > 0 )); then
    git clean -fdq -- "${created[@]}"
  fi
}

latest_prompt() {
  # ai-loop.ts writes the cycle prompt as prompt.md (older runs used agent-prompt.md).
  find ai-runs \( -path '*/prompt.md' -o -path '*/agent-prompt.md' \) -type f -printf '%T@ %p\n' 2>/dev/null | sort -nr | awk 'NR==1 {print $2}'
}

# Resolve the headless agent command that does each cycle's WORK (incl. the
# mandatory blind LLM playtest). Precedence:
#   1. $AI_AGENT_CMD           — explicit full command, wins over everything
#   2. installed `codex`       — the automatic, Codex-only default
#   3. (not installed)         — evidence-only: the prompt is written, no work is done
# Codex runs non-interactively per OpenAI's documented autonomous pattern
# (`codex exec -a never --sandbox workspace-write`). An explicit AI_AGENT_CMD must
# likewise read the prompt from STDIN. Provider-specific blind-playtest adapters
# remain documented with the blind harness rather than selected implicitly here.
agent_cmd() {
  if [[ -n "${AI_AGENT_CMD:-}" ]]; then echo "$AI_AGENT_CMD"; return 0; fi

  local codex_cmd="codex -a never exec --sandbox ${AI_CODEX_SANDBOX:-workspace-write} --cd $PWD -"
  if command -v codex >/dev/null 2>&1; then
    echo "$codex_cmd"
  fi
}

run_agent() {
  local prompt cmd
  prompt="$(latest_prompt)"
  if [[ -z "$prompt" ]]; then echo "No AFK agent prompt found; skipping agent handoff."; return 0; fi
  if [[ "${AI_LOOP_RUN_AGENT:-1}" != "1" ]]; then echo "AI_LOOP_RUN_AGENT is not 1; prompt is ready at $prompt."; return 0; fi
  cmd="$(agent_cmd)"
  if [[ -z "$cmd" ]]; then echo "No Codex CLI available (install codex, or set AI_AGENT_CMD, e.g. 'codex -a never exec --sandbox workspace-write -'); evidence-only. Prompt at $prompt."; return 0; fi
  local budget="${AI_AGENT_TIMEOUT_SECONDS:-2400}"
  # Per-cycle override: ai-loop.ts writes agentTimeoutSeconds into latest-cycle.json
  # for ultraplan cycles, which run a bounded multi-agent Workflow and need a larger
  # budget than a routine cycle. Falls back to the default when absent.
  local override
  override="$(node -e 'try{const t=JSON.parse(require("node:fs").readFileSync("ai-runs/latest-cycle.json","utf8")).agentTimeoutSeconds;if(typeof t==="number"&&t>0)process.stdout.write(String(t))}catch{}' 2>/dev/null || true)"
  [[ -n "$override" ]] && budget="$override"
  echo "Agent: $cmd   (prompt: $prompt, timeout: ${budget}s)"
  # Bound the agent turn. The loop has NO other recovery for an agent that never
  # returns (a hung headless agent once wedged the loop for ~9h: the circuit breaker
  # only counts COMPLETED no-progress cycles, so it can't catch a stuck turn). On
  # timeout, SIGTERM then SIGKILL after a 30s grace; swallow the error so the cycle
  # proceeds to the verify gates, which decide whether anything is committable (a
  # timed-out turn that left nothing simply becomes a no-progress cycle).
  local rc=0
  # Record the ACTUAL worker pid: the bash -c writes its own $$ then `exec`s the agent,
  # so the recorded pid IS the Codex or explicitly selected agent process (exec preserves the pid). This lets
  # loop-stop.sh kill the exact worker by pid — project-scoped — even if it orphans.
  timeout --kill-after=30 "$budget" bash -c 'echo $$ > "'"$AGENT_PID_FILE"'"; exec '"$cmd" < "$prompt" || rc=$?
  rm -f "$AGENT_PID_FILE" 2>/dev/null || true
  if [[ "$rc" -eq 124 || "$rc" -eq 137 ]]; then
    echo "⏱ Agent exceeded ${budget}s and was terminated — continuing to verify."
  fi
  return 0
}

require_provisional_commit() {
  # In commit-enabled mode the operating agent must freeze the implementation in a
  # LOCAL provisional commit before pure play. Do not constrain the branch: a short-
  # lived feature branch is expected. We only require that the pre-cycle revision is
  # still an ancestor and HEAD advanced, so a failed outer gate can reset it exactly.
  [[ "${AI_LOOP_COMMIT:-0}" == "1" ]] || return 0
  local start_ref="$1" current_ref
  current_ref="$(git rev-parse HEAD)" || return 1
  if [[ "$current_ref" == "$start_ref" ]]; then
    echo "No provisional implementation commit was created before pure play; reverting."
    return 1
  fi
  if ! git merge-base --is-ancestor "$start_ref" "$current_ref"; then
    echo "The provisional revision does not descend from the cycle start; reverting."
    return 1
  fi
  echo "✓ local provisional revision present: $current_ref"
}

require_final_ledger_only() {
  # After the exact-clean blind run, findings belong to the NEXT cycle. The sole
  # tracked mutation allowed now is completion of this cycle's terse ledger entry.
  [[ "${AI_LOOP_COMMIT:-0}" == "1" ]] || return 0
  local changed
  changed="$({
    git diff --name-only
    git diff --cached --name-only
    git ls-files --others --exclude-standard
  } | LC_ALL=C sort -u)"
  if [[ "$changed" != "AI_LOOP_STATE.md" ]]; then
    echo "Expected AI_LOOP_STATE.md to be the only post-play tracked change; got:"
    [[ -n "$changed" ]] && echo "$changed" || echo "(none)"
    return 1
  fi
  echo "✓ post-play changes are ledger-only"
}

safe_commit_if_enabled() {
  # The implementation is already frozen in the provisional commit. Only after
  # post-crawl, health, integrity drift, and report checks pass do we land the
  # completed ledger as a second local commit. Optional push happens later.
  if [[ "${AI_LOOP_COMMIT:-0}" != "1" ]]; then
    return 0
  fi
  git add -- AI_LOOP_STATE.md
  git diff --cached --quiet && { echo "No final ledger change to commit."; return 1; }
  git commit -m "${AI_LOOP_COMMIT_MESSAGE:-Autonomous AFK cycle: record verified playtest}"
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
  require_clean_evidence_cycle_start || return 1
  local start_ref untracked_snapshot
  start_ref="$(git rev-parse HEAD)"
  untracked_snapshot="$(mktemp)" || { echo "Could not create cycle-start snapshot."; return 1; }
  git ls-files --others --exclude-standard -z > "$untracked_snapshot" || {
    rm -f -- "$untracked_snapshot"
    echo "Could not snapshot cycle-start untracked paths."
    return 1
  }
  # Self-recovery: revert a FAILED cycle's provisional commit and scratch back to the
  # pre-cycle state. Without this, a single bad authored artifact (observed: an over-complex RPG
  # pack that blows the global RPG tests' 200k-state cap) stays UNTRACKED in the tree
  # and fails `npm run health` on EVERY subsequent cycle — wedging the loop to the
  # circuit breaker with no progress. Reverting after a pre-commit gate fails lets the
  # captured cycle start (normally clean), ready to retry or rotate targets.
  # Only the pre-final-commit gates revert; a post-commit push failure must NOT (the
  # verified two-commit cycle is real). Ignored ai-runs evidence remains, while the
  # exact untracked-path delta is cleaned across every first-party directory.
  _revert_failed_cycle() {
    git reset --hard "$start_ref" >/dev/null 2>&1 || true
    remove_new_untracked_since_cycle_start "$untracked_snapshot" >/dev/null 2>&1 || \
      echo "Warning: failed to remove all cycle-created untracked paths."
    rm -f -- "$untracked_snapshot"
  }
  npm run ai:loop || { echo "ai:loop failed"; _revert_failed_cycle; return 1; }
  npm run crawl:smoke || { echo "crawl:smoke red before work — world is already broken; halting cycle"; _revert_failed_cycle; return 1; }
  # Commit-enabled prompt contract: one change → focused checks → LOCAL provisional
  # commit (never push) → exact-clean pure play → ledger-only edit. Evidence-only
  # prompts instead capture the clean baseline before making uncommitted changes.
  run_agent || echo "(agent step reported an error — continuing to verify)"
  require_provisional_commit "$start_ref" || { _revert_failed_cycle; return 1; }
  npm run crawl:smoke || { echo "crawl:smoke red after work — reverting"; _revert_failed_cycle; return 1; }
  # Trust, but verify: health is a BLOCKING gate (runs the static verifier-integrity
  # check too). A red check ⇒ no commit this cycle.
  npm run health || { echo "health failed — reverting cycle scratch, skipping commit"; _revert_failed_cycle; return 1; }
  # Don't route around the verifier. A content cycle that re-pins a hash ALONGSIDE a
  # real content change is the legitimate snapshot-update workflow → surfaced, allowed.
  # This blocks only actual weakening: deleted/disabled tests, a dropped test count,
  # a deleted protected asset, or a re-pin with NO content change (the launder pattern).
  # AI_LOOP_ALLOW_VERIFIER_EDITS=1 overrides only the unaccompanied-re-pin and
  # acknowledged guard-loosening cases; real test weakening is never downgradable.
  npm run verify:integrity -- --against "$start_ref" || { echo "verifier weakened/laundered — reverting, skipping commit"; _revert_failed_cycle; return 1; }
  # Quality feedback is mandatory: no blind-playtest record ⇒ no commit.
  require_playtest_record || { _revert_failed_cycle; return 1; }
  require_final_ledger_only || { _revert_failed_cycle; return 1; }
  safe_commit_if_enabled || { echo "final ledger commit failed — reverting"; _revert_failed_cycle; return 1; }
  rm -f -- "$untracked_snapshot"
  if [[ "${AI_LOOP_PUSH:-0}" == "1" ]]; then
    # A push failure must not fail the cycle: the verified commit is real progress
    # (the comment above _revert_failed_cycle already forbids reverting it), and
    # counting it as "no progress" would let rejected pushes trip the circuit
    # breakers. Note: main is protected by a required 'verify' status check, so a
    # bare push of a fresh local commit is ALWAYS rejected — land loop commits via
    # a scratch branch/PR instead, and leave AI_LOOP_PUSH=0 in normal operation.
    git push || echo "⚠ committed locally but push was rejected (protected main" \
      "needs a green 'verify' run on the commit first) — not counted as a failure."
  fi
  return 0
}

count=0
fails=0
fails_total=0
max_fails="${AI_LOOP_MAX_CONSECUTIVE_FAILURES:-5}"
# The consecutive-failure breaker never fires on an alternating pass/fail
# pattern, so an unattended loop could churn indefinitely at ~50% waste. A
# total-failure budget bounds that: generous enough for a long healthy run,
# small enough to stop a structurally sick one.
max_fails_total="${AI_LOOP_MAX_TOTAL_FAILURES:-15}"
delay="${AI_LOOP_DELAY_SECONDS:-10}"
while true; do
  if run_cycle; then
    fails=0
    echo "✓ cycle $((count + 1)) complete."
    if [[ "${AI_LOOP_COMMIT:-0}" != "1" ]] && [[ -n "$(git status --porcelain)" ]]; then
      echo "Evidence-only work remains uncommitted; stopping before another cycle so"
      echo "the next pure baseline cannot be mislabeled. Commit, stash, or discard it first."
      break
    fi
  else
    fails=$((fails + 1))
    fails_total=$((fails_total + 1))
    echo "✗ cycle $((count + 1)) made no committed progress ($fails/$max_fails consecutive, $fails_total/$max_fails_total total)."
    if [[ "$fails" -ge "$max_fails" ]]; then
      echo "Circuit breaker: $max_fails consecutive cycles without progress — stopping. Check ai-runs/ and AI_LOOP_STATE.md."
      break
    fi
    if [[ "$fails_total" -ge "$max_fails_total" ]]; then
      echo "Circuit breaker: $fails_total total failed cycles — stopping. Check ai-runs/ and AI_LOOP_STATE.md."
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
