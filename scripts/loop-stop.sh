#!/usr/bin/env bash
# loop-stop.sh — RELIABLY stop THIS project's AFK loop, and ONLY this project's.
#
# PROJECT-SCOPED (2026-06-09 — critical safety fix): with several projects running
# identical `./loop.sh` / headless-agent processes, the old pattern-match
# approach could read OR KILL another project's loop. This version acts ONLY on the
# exact pids THIS loop recorded: ai-runs/loop.pid (loop.sh) and ai-runs/agent.pid (the
# worker — run_agent records the post-`exec` pid, i.e. the real Codex or explicitly
# selected agent process,
# so it's killable even if orphaned). It kills those pids + the descendants of loop.sh,
# never a cross-project pattern.
#
# NOTE: also TaskStop the harness background task that launched ./loop.sh (not from bash).
# Usage:  bash scripts/loop-stop.sh [--dry-run]
set -uo pipefail
dry=0; [ "${1:-}" = "--dry-run" ] && dry=1
alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

# Recursively list descendants of a pid (PPID walk) — catches loop.sh's timeout/agent children.
descendants() {
  local parent="$1" child
  for child in $(ps -ef 2>/dev/null | awk -v p="$parent" '$3==p {print $2}'); do
    echo "$child"; descendants "$child"
  done
}

loop_pid="$(cat ai-runs/loop.pid 2>/dev/null || true)"
agent_pid="$(cat ai-runs/agent.pid 2>/dev/null || true)"

echo "=== loop-stop $([ $dry -eq 1 ] && echo '(DRY RUN)') — THIS project only ==="
echo "recorded: loop.sh pid=${loop_pid:-none}  worker pid=${agent_pid:-none}"

# Build the exact kill set: worker pid, loop.sh pid, and loop.sh's descendants (timeout/bash-c/agent).
targets=""
[ -n "$loop_pid" ] && targets="$targets $loop_pid $(descendants "$loop_pid" | tr '\n' ' ')"
[ -n "$agent_pid" ] && targets="$targets $agent_pid $(descendants "$agent_pid" | tr '\n' ' ')"
# de-dupe + keep only currently-alive pids
kills=""
for pid in $targets; do alive "$pid" && case " $kills " in *" $pid "*) :;; *) kills="$kills $pid";; esac; done

if [ -z "${kills// /}" ]; then
  echo "No live processes for THIS project's loop — already stopped."
  rm -f ai-runs/loop.pid ai-runs/agent.pid 2>/dev/null || true
  exit 0
fi
echo "will kill (this loop's pids + descendants):$kills"
if [ "$dry" -eq 1 ]; then echo "(dry run) no kills performed"; exit 0; fi

for pid in $kills; do kill -9 "$pid" 2>/dev/null && echo "killed $pid" || echo "$pid gone"; done
sleep 3
# Re-scan the recorded pids only (project-scoped) to confirm.
left=""
for pid in $loop_pid $agent_pid; do alive "$pid" && left="$left $pid"; done
# also re-check descendants of loop.sh in case anything respawned under it
[ -n "$loop_pid" ] && for pid in $(descendants "$loop_pid"); do alive "$pid" && left="$left $pid"; done
if [ -n "${left// /}" ]; then
  echo "second pass — survivors:$left"; for pid in $left; do kill -9 "$pid" 2>/dev/null && echo "killed $pid"; done
  sleep 2
fi
rm -f ai-runs/loop.pid ai-runs/agent.pid 2>/dev/null || true
echo "CONFIRMED STOPPED — this project's recorded loop pids are gone (other projects untouched)."
exit 0
