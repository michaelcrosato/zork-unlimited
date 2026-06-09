#!/usr/bin/env bash
# loop-stop.sh — RELIABLY stop the entire AFK loop process tree.
#
# WHY THIS EXISTS (the failure it prevents): killing `loop.sh` + the `timeout … bash -c
# claude` wrapper does NOT kill the real worker, which is a SEPARATE native process
# `…\.local\bin\claude.exe -p --model sonnet`. On 2026-06-09 that worker orphaned
# (parent=1), kept authoring a pack, and re-spawned `npm run health` on its own — it
# would have self-committed/pushed past a pause boundary. A pattern of `claude -p
# --model sonnet` only matches the bash wrapper, NOT claude.exe. This script kills ALL
# of: loop.sh, the timeout-claude wrapper, AND the claude.exe -p worker, then RE-SCANS
# to confirm nothing respawns — the corrected procedure from memory [[afk-loop-orchestration]].
#
# SAFETY: matches ONLY narrow AFK markers and EXPLICITLY excludes the user's separate
# work (bin/ai-autonomous-dev, bin/playtest-loop), the Claude Code app, other repos.
# NOTE: this kills OS processes only. The orchestrator should ALSO TaskStop the harness
# background task that launched ./loop.sh (TaskStop is not callable from bash).
#
# Usage:  bash scripts/loop-stop.sh [--dry-run]
set -uo pipefail
dry=0; [ "${1:-}" = "--dry-run" ] && dry=1

# Narrow AFK process markers. EXCLUDES (hard): user loops, this script, the IDE app.
list_afk() {
  ps -ef 2>/dev/null \
    | grep -iE "bash \./loop\.sh|eval '?AI_LOOP|claude\.exe -p --model sonnet|timeout .*bash -c claude" \
    | grep -viE "grep|ai-autonomous-dev|playtest-loop|loop-stop\.sh|loop-status\.sh"
}

echo "=== loop-stop $([ $dry -eq 1 ] && echo '(DRY RUN)') ==="
targets="$(list_afk || true)"
if [ -z "$targets" ]; then
  echo "No AFK loop processes found — already stopped."
  exit 0
fi
echo "AFK processes targeted:"; printf '%s\n' "$targets" | sed 's/^/  /'
pids="$(printf '%s\n' "$targets" | awk '{print $2}')"

if [ "$dry" -eq 1 ]; then
  echo "(dry run) would: kill -9 $(printf '%s ' $pids)"
  exit 0
fi

# Pass 1: kill the roots (loop.sh + worker + timeout wrapper).
for pid in $pids; do kill -9 "$pid" 2>/dev/null && echo "killed $pid" || echo "$pid gone"; done

# Pass 2: re-scan after a delay — the worker re-invokes `npm run health` via its Bash
# tool, so a single snapshot can look clean mid-tool-call. Only 0 across a delayed
# re-scan = truly stopped (this is the step that was missing before).
sleep 4
left="$(list_afk || true)"
if [ -n "$left" ]; then
  echo "second pass — survivors still present, killing:"; printf '%s\n' "$left" | sed 's/^/  /'
  for pid in $(printf '%s\n' "$left" | awk '{print $2}'); do kill -9 "$pid" 2>/dev/null && echo "killed $pid"; done
  sleep 3
fi

# Also sweep orphaned (parent=1) loop-spawned health/validate children if any linger.
orphans="$(ps -ef 2>/dev/null | grep -iE "run health|tsx .*(ai-loop|validate)\.ts" | grep -viE "grep|ai-autonomous-dev|playtest-loop" | awk '$3==1{print $2}' || true)"
for pid in $orphans; do kill -9 "$pid" 2>/dev/null && echo "killed orphaned child $pid"; done

sleep 2
final="$(list_afk || true)"
if [ -z "$final" ]; then
  echo "CONFIRMED STOPPED — no AFK loop processes remain."
  exit 0
else
  echo "*** WARNING: AFK processes STILL present after two passes:"; printf '%s\n' "$final" | sed 's/^/  /'
  echo "Investigate manually (ps -ef | grep claude)."
  exit 1
fi
