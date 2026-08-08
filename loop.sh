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
#   AI_LOOP_FAILURE_LEDGER_MAX_ENTRIES=N   retained durable failure records [100]
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
AFK_PROC_ROOT="/proc"

# A pid alone is not an identity: after a crash leaves a stale file, the kernel may
# reuse that number for an unrelated process. Linux exposes a process's immutable
# start tick in /proc/<pid>/stat field 22. Record both values and require both before
# status/stop trusts the record. Systems without a compatible /proc fail closed: the
# unattended loop refuses to start rather than creating a record that cannot be
# authenticated later.
process_start_time() {
  local pid="$1" stat tail start
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] || return 1
  [[ -r "$AFK_PROC_ROOT/$pid/stat" ]] || return 1
  stat="$(<"$AFK_PROC_ROOT/$pid/stat")" || return 1
  [[ "$stat" == *") "* ]] || return 1
  # The comm field is parenthesized and may contain spaces. Strip through its LAST
  # closing ") "; the remaining token 20 is original field 22 (starttime).
  tail="${stat##*) }"
  set -- $tail
  [[ "$#" -ge 20 ]] || return 1
  start="${20:-}"
  [[ "$start" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "$start"
}

write_process_record() {
  local path="$1" pid="$2" start
  start="$(process_start_time "$pid")" || return 1
  printf '%s %s\n' "$pid" "$start" > "$path"
}

cleanup_pid_records() {
  rm -f "$LOOP_PID_FILE" "$AGENT_PID_FILE" 2>/dev/null || true
}

on_loop_signal() {
  local status="$1"
  cleanup_pid_records
  trap - EXIT INT TERM
  exit "$status"
}

mkdir -p ai-runs
if ! write_process_record "$LOOP_PID_FILE" "$$"; then
  rm -f "$LOOP_PID_FILE" 2>/dev/null || true
  echo "Refusing to start: cannot authenticate this process through /proc/<pid>/stat."
  echo "The AFK loop requires PID + process start-time identity so a stale pid file"
  echo "can never target an unrelated reused process."
  exit 1
fi
trap cleanup_pid_records EXIT
trap 'on_loop_signal 130' INT
trap 'on_loop_signal 143' TERM

# The worker-recording shell below inherits these helpers before it execs the real
# agent. exec preserves its pid and start time, so the record stays valid for the
# lifetime of the worker it names.
export AFK_PROC_ROOT
export -f process_start_time write_process_record

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
  # timeout, SIGTERM then SIGKILL after a 30s grace. A nonzero agent result fails
  # the cycle: partial output is not evidence that the requested work completed.
  local rc=0
  # Record the ACTUAL worker identity: the bash -c writes its pid + immutable start
  # tick, then `exec`s the agent (exec preserves both). loop-stop therefore cannot
  # mistake a later process that reused the pid for this worker.
  AFK_AGENT_PID_FILE="$AGENT_PID_FILE" timeout --kill-after=30 "$budget" bash -c \
    'write_process_record "$AFK_AGENT_PID_FILE" "$$" || { echo "Cannot authenticate worker process identity." >&2; exit 125; }; exec '"$cmd" < "$prompt" || rc=$?
  rm -f "$AGENT_PID_FILE" 2>/dev/null || true
  if [[ "$rc" -eq 124 || "$rc" -eq 137 ]]; then
    echo "⏱ Agent exceeded ${budget}s and was terminated — failing this cycle."
  elif [[ "$rc" -eq 125 ]]; then
    echo "Worker launch refused: PID + start-time identity was unavailable."
  elif [[ "$rc" -ne 0 ]]; then
    echo "Agent exited nonzero (status $rc) — failing this cycle."
  fi
  return "$rc"
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
  # MANDATORY LLM PLAYTEST (every commit-enabled cycle): require the canonical
  # sidecar-last publication, schema-valid V2 pure report, exact journey receipt,
  # clean-build attestation, and exact provisional HEAD. A merely nonempty markdown
  # file or a valid report from an older revision cannot satisfy this gate.
  [[ "${AI_LOOP_COMMIT:-0}" == "1" ]] || return 0
  local meta="ai-runs/latest-cycle.json" current_ref
  if [[ ! -f "$meta" ]]; then
    echo "No cycle metadata ($meta); cannot verify the mandatory playtest. Refusing to commit."
    return 1
  fi
  current_ref="$(git rev-parse HEAD)" || return 1
  npm run --silent loop:verify-playtest -- --meta "$meta" --expected-commit "$current_ref"
}

cycle_failure_stage="unclassified"
cycle_failure_reason="cycle returned without a classified gate failure"
cycle_failure_start_ref=""
cycle_failure_run_id=""

mark_cycle_failure() {
  cycle_failure_stage="$1"
  cycle_failure_reason="$2"
  return 1
}

run_cycle() {
  # Each gate fails the cycle EXPLICITLY (|| return 1) rather than relying on
  # `set -e`, so a bad cycle skips its commit and the outer loop continues to the
  # next one (resilient unattended operation) instead of the whole script dying.
  cycle_failure_stage="unclassified"
  cycle_failure_reason="cycle returned without a classified gate failure"
  cycle_failure_start_ref=""
  cycle_failure_run_id=""
  require_clean_evidence_cycle_start || {
    mark_cycle_failure "clean-start" "evidence-only cycle started with a dirty worktree"
    return 1
  }
  local start_ref untracked_snapshot
  start_ref="$(git rev-parse HEAD)" || {
    mark_cycle_failure "snapshot" "could not resolve the cycle-start revision"
    return 1
  }
  cycle_failure_start_ref="$start_ref"
  untracked_snapshot="$(mktemp)" || {
    echo "Could not create cycle-start snapshot."
    mark_cycle_failure "snapshot" "could not create the untracked-path snapshot"
    return 1
  }
  git ls-files --others --exclude-standard -z > "$untracked_snapshot" || {
    rm -f -- "$untracked_snapshot"
    echo "Could not snapshot cycle-start untracked paths."
    mark_cycle_failure "snapshot" "could not capture cycle-start untracked paths"
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
  _reject_cycle() {
    local stage="$1" reason="$2"
    _revert_failed_cycle
    mark_cycle_failure "$stage" "$reason"
  }
  npm run ai:loop || {
    echo "ai:loop failed"
    _reject_cycle "assess" "ai:loop could not assess or initialize the cycle"
    return 1
  }
  cycle_failure_run_id="$(node -e 'try{const c=JSON.parse(require("node:fs").readFileSync("ai-runs/latest-cycle.json","utf8"));if(typeof c.runId==="string")process.stdout.write(c.runId)}catch{}' 2>/dev/null || true)"
  npm run crawl:smoke || {
    echo "crawl:smoke red before work — world is already broken; halting cycle"
    _reject_cycle "crawl-pre" "pre-change crawl:smoke failed"
    return 1
  }
  # Commit-enabled prompt contract: one change → focused checks → LOCAL provisional
  # commit (never push) → exact-clean pure play → ledger-only edit. Evidence-only
  # prompts instead capture the clean baseline before making uncommitted changes.
  local agent_rc=0
  run_agent || agent_rc=$?
  if [[ "$agent_rc" -ne 0 ]]; then
    _reject_cycle "agent" "headless agent exited with status $agent_rc"
    return 1
  fi
  require_provisional_commit "$start_ref" || {
    _reject_cycle "provisional-commit" "required provisional implementation commit is absent or invalid"
    return 1
  }
  npm run crawl:smoke || {
    echo "crawl:smoke red after work — reverting"
    _reject_cycle "crawl-post" "post-change crawl:smoke failed"
    return 1
  }
  # Trust, but verify: health is a BLOCKING gate (runs the static verifier-integrity
  # check too). A red check ⇒ no commit this cycle.
  npm run health || {
    echo "health failed — reverting cycle scratch, skipping commit"
    _reject_cycle "health" "npm run health failed"
    return 1
  }
  # Don't route around the verifier. A content cycle that re-pins a hash ALONGSIDE a
  # real content change is the legitimate snapshot-update workflow → surfaced, allowed.
  # This blocks only actual weakening: deleted/disabled tests, a dropped test count,
  # a deleted protected asset, or a re-pin with NO content change (the launder pattern).
  # AI_LOOP_ALLOW_VERIFIER_EDITS=1 overrides only the unaccompanied-re-pin and
  # acknowledged guard-loosening cases; real test weakening is never downgradable.
  npm run verify:integrity -- --against "$start_ref" || {
    echo "verifier weakened/laundered — reverting, skipping commit"
    _reject_cycle "integrity" "verifier-integrity drift check failed"
    return 1
  }
  # Quality feedback is mandatory: only a build-bound verified publication counts.
  require_playtest_record || {
    _reject_cycle "playtest" "mandatory current-revision pure playtest verification failed"
    return 1
  }
  require_final_ledger_only || {
    _reject_cycle "ledger-only" "post-play changes were not limited to AI_LOOP_STATE.md"
    return 1
  }
  safe_commit_if_enabled || {
    echo "final ledger commit failed — reverting"
    _reject_cycle "final-commit" "final ledger-only commit failed"
    return 1
  }
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

record_cycle_failure() {
  local cycle_number="$1" consecutive="$2" total="$3"
  local run_id="${cycle_failure_run_id:-none}"
  local start_ref="${cycle_failure_start_ref:-none}"
  local max_entries="${AI_LOOP_FAILURE_LEDGER_MAX_ENTRIES:-100}"
  npm run --silent loop:failures -- append \
    --cycle "$cycle_number" \
    --stage "$cycle_failure_stage" \
    --reason "$cycle_failure_reason" \
    --consecutive "$consecutive" \
    --total "$total" \
    --run-id "$run_id" \
    --start-ref "$start_ref" \
    --max "$max_entries" || \
    echo "Warning: could not persist this failure to ai-runs/failure-ledger.json."
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
    record_cycle_failure "$((count + 1))" "$fails" "$fails_total"
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
