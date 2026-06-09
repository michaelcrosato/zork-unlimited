#!/usr/bin/env bash
# loop-status.sh — one-command monitoring snapshot for THIS project's AFK loop.
#
# PROJECT-SCOPED (2026-06-09): several projects run identical-looking `./loop.sh` /
# `claude -p` processes, so pattern-matching across all of them mis-reads (and risks
# killing) other projects' work. This reads ONLY the pids THIS loop recorded
# (ai-runs/loop.pid = loop.sh; ai-runs/agent.pid = the worker, written by run_agent).
# Liveness is checked with `kill -0` on those exact pids — never a global ps grep.
#
# Usage:  bash scripts/loop-status.sh [BASELINE_REF]   (default origin/main)
# Reads only; never kills. Exit: 0 healthy/stopped, 3 anomaly (orphan/desync/fail).
set -uo pipefail
baseline="${1:-origin/main}"
rc=0
alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

loop_pid="$(cat ai-runs/loop.pid 2>/dev/null || true)"
agent_pid="$(cat ai-runs/agent.pid 2>/dev/null || true)"
loopsh=0; worker=0
alive "$loop_pid" && loopsh=1
alive "$agent_pid" && worker=1

echo "=== AFK LOOP STATUS  ($(date '+%Y-%m-%d %H:%M:%S')) ==="
echo "this project's loop: loop.sh pid=${loop_pid:-none} (alive=$loopsh)   worker pid=${agent_pid:-none} (alive=$worker)"

# Orphan detection (project-scoped): worker alive but loop.sh dead = runaway worker.
if [ "$worker" -eq 1 ] && [ "$loopsh" -eq 0 ]; then
  echo "  *** ORPHAN-WORKER ANOMALY: this loop's worker (pid $agent_pid) is alive but loop.sh (pid ${loop_pid:-?}) is dead."
  echo "      -> run: npm run loop:stop   (kills exactly this loop's recorded pids)"
  rc=3
fi

echo "--- git ---"
echo "HEAD:            $(git log --oneline -1 2>/dev/null)"
newc=$(git log --oneline "${baseline}..HEAD" 2>/dev/null | wc -l | tr -d ' ')
echo "commits since ${baseline}: ${newc}"
git log --oneline "${baseline}..HEAD" 2>/dev/null | sed 's/^/  /' | head -8
unpushed=$(git log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')
if [ "$unpushed" -gt 0 ]; then echo "push: ${unpushed} local commit(s) NOT on origin/main"; else echo "push: in sync with origin/main"; fi

if [ -f ai-runs/latest-cycle.json ]; then
  echo "--- current cycle (latest-cycle.json) ---"
  node -e 'try{const c=JSON.parse(require("fs").readFileSync("ai-runs/latest-cycle.json","utf8"));console.log("  runId="+c.runId+"  mode="+c.mode+"  budget="+(c.agentTimeoutSeconds||"default")+"s\n  target="+c.target+"\n  rec="+(c.recommendation||"").slice(0,90));}catch(e){console.log("  (unreadable)");}' 2>/dev/null
fi

if [ -f ai-runs/wrapper.log ]; then
  echo "--- wrapper.log fail/timeout/breaker markers (recent) ---"
  fails="$(grep -iE "no committed progress|push failed|health failed|Circuit breaker|Agent exceeded" ai-runs/wrapper.log | tail -4 || true)"
  if [ -n "$fails" ]; then printf '%s\n' "$fails" | sed 's/^/  /'; else echo "  (none)"; fi
  grep -qE "Circuit breaker" ai-runs/wrapper.log && { echo "  *** CIRCUIT BREAKER tripped"; rc=3; }
fi

newest_pt="$(ls -t ai-runs/*/playtest.md 2>/dev/null | head -1 || true)"
if [ -n "$newest_pt" ]; then
  echo "--- newest playtest ($newest_pt) ---"
  grep -ioE "clarity:? [0-9]/5|enjoyment:? [0-9]/5|verdict" "$newest_pt" | head -3 | sed 's/^/  /'
fi

# Velocity / technical-debt telemetry (evolutionary view, not just liveness).
if [ -f ai-runs/wrapper.log ]; then
  echo "--- telemetry (velocity / debt) ---"
  done_n=$(grep -cE "cycle .* complete" ai-runs/wrapper.log 2>/dev/null); done_n=${done_n:-0}
  to_n=$(grep -cE "Agent exceeded" ai-runs/wrapper.log 2>/dev/null); to_n=${to_n:-0}
  np_n=$(grep -cE "no committed progress" ai-runs/wrapper.log 2>/dev/null); np_n=${np_n:-0}
  np_consec=$(grep -oE "no committed progress \([0-9]+/[0-9]+" ai-runs/wrapper.log 2>/dev/null | tail -1 | grep -oE "[0-9]+/[0-9]+" || echo "0/5")
  echo "  cycles completed: ${done_n}   timeouts(Agent exceeded): ${to_n}   no-progress: ${np_n} (consec ${np_consec} vs breaker 5)"
  [ "${to_n:-0}" -ge 2 ] && { echo "  ⚠ repeated timeouts — authoring may need decomposition, not just budget"; rc=3; }
  case "$np_consec" in 3/*|4/*|5/*) echo "  ⚠ nearing circuit breaker"; rc=3;; esac
  echo "  recent fix-class (last 8 commits):"
  git log -8 --pretty='%s' 2>/dev/null | sed -E 's/:.*//' | sort | uniq -c | sort -rn | sed 's/^/    /'
fi

echo "--- summary ---"
if [ "$worker" -eq 1 ] && [ "$loopsh" -eq 0 ]; then echo "ORPHAN-WORKER — run npm run loop:stop";
elif [ "$loopsh" -eq 1 ]; then echo "RUNNING (this project's loop.sh pid $loop_pid alive)";
else echo "STOPPED (this project's loop not running) — paused/idle"; fi
exit $rc
