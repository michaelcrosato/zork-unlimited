#!/usr/bin/env bash
# loop-status.sh — one-command monitoring snapshot for the AFK loop orchestrator.
#
# WHY: the staged monitoring cadence (60s→5m→15m→hourly) ran many ad-hoc ps/git/grep
# calls per tick. This collapses a tick into ONE command and, critically, DETECTS THE
# ORPHANED-WORKER state that bit us (a `claude.exe -p` worker still alive with no
# parent loop.sh — see ai-runs/orchestration-state.md, memory [[afk-loop-orchestration]]).
#
# Usage:  bash scripts/loop-status.sh [BASELINE_REF]
#   BASELINE_REF defaults to origin/main (commits since launch = new cycles).
#
# Reads only; never kills. Exit code: 0 healthy/stopped, 3 anomaly (orphan/desync/fail).
set -uo pipefail
baseline="${1:-origin/main}"
rc=0

# ── Process picture (narrow AFK markers; never the user's bin/*-loop or other repos) ──
afk_ps() { ps -ef 2>/dev/null | grep -iE "loop\.sh|claude\.exe -p|timeout .*bash -c claude|ai-loop\.ts" | grep -viE "grep|ai-autonomous-dev|playtest-loop|loop-status\.sh|loop-stop\.sh"; }
procs="$(afk_ps || true)"
loopsh=$(printf '%s\n' "$procs" | grep -cE "bash \./loop\.sh" || true)
worker=$(printf '%s\n' "$procs" | grep -cE "claude\.exe -p" || true)
[ -z "$procs" ] && { loopsh=0; worker=0; }

echo "=== AFK LOOP STATUS  ($(date '+%Y-%m-%d %H:%M:%S')) ==="
echo "processes: loop.sh=$loopsh  worker(claude.exe -p)=$worker"
printf '%s\n' "$procs" | sed 's/^/  /' | head -8

# ── Orphan detection: worker alive but NO loop.sh wrapper = runaway, must be stopped ──
if [ "$worker" -gt 0 ] && [ "$loopsh" -eq 0 ]; then
  echo "  *** ORPHAN-WORKER ANOMALY: claude.exe -p running with NO loop.sh parent."
  echo "      -> run: bash scripts/loop-stop.sh   (then diagnose/relaunch)"
  rc=3
fi

# ── Git / progress / push health ──
echo "--- git ---"
echo "HEAD:            $(git log --oneline -1 2>/dev/null)"
newc=$(git log --oneline "${baseline}..HEAD" 2>/dev/null | wc -l | tr -d ' ')
echo "commits since ${baseline}: ${newc}"
git log --oneline "${baseline}..HEAD" 2>/dev/null | sed 's/^/  /' | head -8
unpushed=$(git log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')
if [ "$unpushed" -gt 0 ]; then echo "push: ${unpushed} local commit(s) NOT on origin/main"; else echo "push: in sync with origin/main"; fi

# ── Current cycle ──
if [ -f ai-runs/latest-cycle.json ]; then
  echo "--- current cycle (latest-cycle.json) ---"
  node -e 'try{const c=JSON.parse(require("fs").readFileSync("ai-runs/latest-cycle.json","utf8"));console.log("  runId="+c.runId+"  mode="+c.mode+"  budget="+(c.agentTimeoutSeconds||"default")+"s\n  target="+c.target+"\n  rec="+(c.recommendation||"").slice(0,90));}catch(e){console.log("  (unreadable)");}' 2>/dev/null
fi

# ── Failure markers in the wrapper log (recent) ──
if [ -f ai-runs/wrapper.log ]; then
  echo "--- wrapper.log fail/timeout/breaker markers (recent) ---"
  fails="$(grep -iE "no committed progress|push failed|health failed|Circuit breaker|Agent exceeded" ai-runs/wrapper.log | tail -4 || true)"
  if [ -n "$fails" ]; then printf '%s\n' "$fails" | sed 's/^/  /'; else echo "  (none)"; fi
  grep -qE "Circuit breaker" ai-runs/wrapper.log && { echo "  *** CIRCUIT BREAKER tripped"; rc=3; }
fi

# ── Newest blind-playtest verdict (quality trend) ──
newest_pt="$(ls -t ai-runs/*/playtest.md 2>/dev/null | head -1 || true)"
if [ -n "$newest_pt" ]; then
  echo "--- newest playtest ($newest_pt) ---"
  grep -ioE "clarity:? [0-9]/5|enjoyment:? [0-9]/5|verdict" "$newest_pt" | head -3 | sed 's/^/  /'
fi

# ── Velocity / technical-debt telemetry (evolutionary-engine view, not just liveness) ──
# Surfaces execution velocity, timeout pressure, spin/breaker proximity, and the
# fix-class trend so each tick can spot a 1% improvement (logic drift, slowing cadence,
# treadmill re-emergence), per the decaying-cadence rationale.
if [ -f ai-runs/wrapper.log ]; then
  echo "--- telemetry (velocity / debt) ---"
  done_n=$(grep -cE "cycle .* complete" ai-runs/wrapper.log 2>/dev/null); done_n=${done_n:-0}
  to_n=$(grep -cE "Agent exceeded" ai-runs/wrapper.log 2>/dev/null); to_n=${to_n:-0}
  np_n=$(grep -cE "no committed progress" ai-runs/wrapper.log 2>/dev/null); np_n=${np_n:-0}
  np_consec=$(grep -oE "no committed progress \([0-9]+/[0-9]+" ai-runs/wrapper.log 2>/dev/null | tail -1 | grep -oE "[0-9]+/[0-9]+" || echo "0/5")
  echo "  cycles completed: ${done_n}   timeouts(Agent exceeded): ${to_n}   no-progress: ${np_n} (consec ${np_consec} vs breaker 5)"
  [ "${to_n:-0}" -ge 2 ] && { echo "  ⚠ repeated timeouts — authoring may need decomposition, not just budget"; rc=3; }
  case "$np_consec" in 3/*|4/*|5/*) echo "  ⚠ nearing circuit breaker"; rc=3;; esac
  # Fix-class trend over recent commits (treadmill / drift detector).
  echo "  recent fix-class (last 8 commits):"
  git log -8 --pretty='%s' 2>/dev/null | sed -E 's/:.*//' | sort | uniq -c | sort -rn | sed 's/^/    /'
fi

echo "--- summary ---"
if [ "$worker" -gt 0 ] && [ "$loopsh" -eq 0 ]; then echo "ORPHAN-WORKER — stop required";
elif [ "$loopsh" -gt 0 ]; then echo "RUNNING (loop.sh alive)";
else echo "STOPPED (no loop.sh, no worker) — paused/idle"; fi
exit $rc
