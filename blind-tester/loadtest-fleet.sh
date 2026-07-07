#!/usr/bin/env bash
#
# blind-tester/loadtest-fleet.sh — run a BATCH of blind load-test playthroughs with
# bounded concurrency, so the soak test can be paced under the subscription rate
# limit. Each playthrough is one blind-tester/loadtest.sh run (fresh MCP server +
# blind claude, full game, no report). Returns when the whole batch is done; every
# run appends to ai-runs/loadtest.jsonl.
#
# Usage:
#   blind-tester/loadtest-fleet.sh --count K [--concurrency C] [--start-seed S] [--model alias]
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

COUNT=5
CONCURRENCY=2
START_SEED=1000
MODEL="${BLIND_MODEL:-sonnet}"
LABEL="fleet"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --count)       COUNT="$2"; shift 2 ;;
    --concurrency) CONCURRENCY="$2"; shift 2 ;;
    --start-seed)  START_SEED="$2"; shift 2 ;;
    --model)       MODEL="$2"; shift 2 ;;
    --label)       LABEL="$2"; shift 2 ;;
    *) echo "fleet: unknown arg $1" >&2; exit 2 ;;
  esac
done

echo "[fleet] launching $COUNT playthroughs, concurrency=$CONCURRENCY, seeds ${START_SEED}..$((START_SEED+COUNT-1)), model=$MODEL"
launched=0
failures=0
pids=()

reap_one() {
  # Wait for any one background job; tally failures.
  if wait -n 2>/dev/null; then :; else failures=$((failures+1)); fi
}

for ((i=0; i<COUNT; i++)); do
  seed=$((START_SEED + i))
  # Throttle: keep at most CONCURRENCY jobs in flight.
  while [[ "$(jobs -rp | wc -l)" -ge "$CONCURRENCY" ]]; do
    reap_one
  done
  bash "$SCRIPT_DIR/loadtest.sh" --seed "$seed" --model "$MODEL" --label "$LABEL" &
  launched=$((launched+1))
done

# Drain the rest.
while [[ "$(jobs -rp | wc -l)" -gt 0 ]]; do
  reap_one
done

echo "[fleet] batch done: launched=$launched failures=$failures"
node "$SCRIPT_DIR/loadtest-summary.mjs" || true
[[ "$failures" -eq 0 ]]
