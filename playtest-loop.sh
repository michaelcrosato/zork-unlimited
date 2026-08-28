#!/usr/bin/env bash
# The PLAYTEST (QA) loop driver. Usage: ./playtest-loop.sh [--once]
#
# Runs completely independently of ./loop.sh. It plays the most recently published
# build over and over, across as many vendors, models and personas as you point it at,
# and turns what the players say into QA tickets the dev loop reads. It never blocks
# the dev loop and the dev loop never blocks it — that separation is the entire reason
# this file exists.
#
# WHY MASS PARALLEL, AND WHY MOSTLY CHEAP MODELS. Experiential findings only become
# trustworthy through repetition across INDEPENDENT instruments. One expensive player
# is one opinion; forty cheap players across four vendors is a measurement. The game
# does not need frontier reasoning to be played, so the fleet is deliberately lopsided:
# a large `volume` cohort for throughput, and a small `reference` cohort as the
# calibration instrument that tells you whether the cheap cohort's silence means
# anything (see PlaytestTier in src/blind/providers.ts).
#
# Env knobs (defaults in brackets):
#   PLAYTEST_COHORT="gemini_cli:8,codex:2"   provider:count pairs ["codex:1"]
#   PLAYTEST_MODELS="codex=gpt-5.6-terra"    pin a model per provider [catalog default]
#   PLAYTEST_PERSONAS="default,cynical_veteran,breaker"   rotated across players [default]
#   PLAYTEST_CONCURRENCY=N                   players in flight at once [4]
#   PLAYTEST_SEED_BASE=N                     first seed; each player gets base+i [epoch seconds]
#   PLAYTEST_TRIAGE=1                        re-triage after each wave [1]
#   PLAYTEST_PUBLISH=0                       push the corpus after each wave [0]
#   PLAYTEST_DELAY_SECONDS=N                 pause between waves [30]
#   PLAYTEST_MAX_WAVES=N                     stop after N waves [unbounded]
#   PLAYTEST_STORE=<dir>                     session corpus [ai-runs/playtest/sessions]
#                                            Point several QA worktrees at ONE absolute
#                                            path and they pool into a single corpus —
#                                            content addressing means no lock is needed.
#   PLAYTEST_ALLOW_SHARED_CHECKOUT=1         permit running beside a live dev loop [0]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

once=0
[[ "${1:-}" == "--once" ]] && once=1

# A playtest loop and a dev loop in ONE checkout will fight: the dev loop hard-resets
# the tree on a failed cycle, and a player mid-run would then be playing a build that
# no longer exists on disk. Run the QA loop from its own clone or worktree. This is a
# refusal rather than a warning because the failure it prevents is silent — you would
# get sessions stamped with a commit whose content had already changed.
if [[ "${PLAYTEST_ALLOW_SHARED_CHECKOUT:-0}" != "1" && -f "ai-runs/loop.pid" ]]; then
  echo "A dev loop appears to be running in this checkout (ai-runs/loop.pid)."
  echo "Run the playtest loop from a separate clone or git worktree so a failed dev"
  echo "cycle's hard reset cannot change the build out from under a player mid-run."
  echo "Set PLAYTEST_ALLOW_SHARED_CHECKOUT=1 to override."
  exit 1
fi

COHORT="${PLAYTEST_COHORT:-codex:1}"
PERSONAS="${PLAYTEST_PERSONAS:-default}"
CONCURRENCY="${PLAYTEST_CONCURRENCY:-4}"
DELAY="${PLAYTEST_DELAY_SECONDS:-30}"
SEED_BASE="${PLAYTEST_SEED_BASE:-$(date +%s)}"
STORE="${PLAYTEST_STORE:-ai-runs/playtest/sessions}"
export PLAYTEST_STORE="$STORE"

# PLAYTEST_MOCK=1 is a zero-token WIRING CHECK, not a playtest.
#
# Every other way to find out whether this loop is plumbed correctly — the cohort
# string, the model pins, the store path, the recorder invocation — costs a real vendor
# a real cohort of tokens, which is a bad way to discover a typo. A mock wave drives
# run.sh with its bundled scripted agent instead.
#
# It deliberately records NOTHING: bin/record-playtest-session.ts refuses a structural
# run, because a scripted agent has no opinion and filing its canned exit interview as a
# vendor's would let three mock runs read as three vendors agreeing. So a green mock wave
# proves the wiring and leaves the corpus untouched — which is exactly what a dry run
# should do.
MOCK="${PLAYTEST_MOCK:-0}"
MOCK_QUEST="${PLAYTEST_MOCK_QUEST:-breaking_weir}"
if [[ "$MOCK" == "1" ]]; then
  echo "PLAYTEST_MOCK=1 — wiring check on quest '$MOCK_QUEST'. No model runs and"
  echo "nothing is recorded; the recorder is expected to skip every structural run."
fi

if [[ ! -d node_modules ]]; then npm install; fi

# Refuse a cohort this runner cannot actually launch, BEFORE dispatching anyone.
#
# `runner_enforced` blindness is proved by reading Codex's own rollout logs
# (blind-tester/codex-rollout.mjs and friends); no equivalent reader exists for any
# other vendor, so run.sh refuses a non-Codex pure run with "Could not resolve the
# existing Codex home". Without this check every player in the wave dies that way and
# the recorder — which cannot tell a launch refusal from a genuine mid-play crash —
# files each one as a `failed` session, seeding the corpus with fake data points that
# carry a real vendor family and say nothing whatsoever about the game.
#
# Non-Codex vendors are still first-class evidence; they just arrive through
# `npm run playtest:ingest` as `operator_attested`. See docs/two_loop_workflow.md.
if [[ "$MOCK" != "1" ]]; then
  unsupported=()
  IFS=',' read -ra preflight_groups <<< "$COHORT"
  for group in "${preflight_groups[@]}"; do
    provider="${group%%:*}"
    [[ "$provider" != "codex" ]] && unsupported+=("$provider")
  done
  if (( ${#unsupported[@]} > 0 )); then
    echo "This runner can only launch 'codex' for a live playtest; refusing the cohort."
    echo "  unsupported in COHORT: ${unsupported[*]}"
    echo
    echo "Only Codex can produce a runner_enforced session: that class means the runner"
    echo "PROVED the agent saw nothing but the AdventureForge MCP tools, and the proof is"
    echo "read out of Codex's rollout logs. No other vendor has an equivalent reader yet."
    echo
    echo "Play those vendors in their own client and ingest the result instead:"
    echo "  npx tsx bin/ingest-playtest-session.ts --provider <id> --attested-by <you> ..."
    echo "They land operator_attested — still counted for bug corroboration, excluded from"
    echo "experience metrics. Set PLAYTEST_MOCK=1 to dry-run the wiring for any provider."
    exit 1
  fi
fi

# Model pin lookup: PLAYTEST_MODELS="codex=gpt-5.6-terra,gemini_cli=gemini-2.5-pro".
model_for() {
  local provider="$1" pair
  IFS=',' read -ra pairs <<< "${PLAYTEST_MODELS:-}"
  for pair in "${pairs[@]}"; do
    [[ "${pair%%=*}" == "$provider" ]] && { echo "${pair#*=}"; return 0; }
  done
}

persona_at() {
  local index="$1"
  IFS=',' read -ra list <<< "$PERSONAS"
  echo "${list[$((index % ${#list[@]}))]}"
}

run_player() {
  local provider="$1" seed="$2" persona="$3" model="$4"
  # Own the output prefix rather than letting run.sh choose one: the recorder needs to
  # find these artifacts afterwards, and parsing the prefix back out of stdout would
  # break the moment a log line changed.
  local out="ai-runs/playtest/runs/${provider}_seed${seed}_${persona}"
  mkdir -p "$(dirname "$out")"
  # The runner log MUST live outside the "$out.*" namespace. run.sh refuses to start when
  # any file named "<prefix>.*" already exists — a deliberate guard against mixing a new
  # run's artifacts with a stale one's — and the shell creates a redirect target BEFORE
  # the command runs. Writing the log to "$out.runner.log" therefore made run.sh find its
  # own log and refuse, so every player failed instantly with "Refusing to reuse report
  # prefix". Keep these two namespaces apart.
  local log_dir="ai-runs/playtest/logs"
  mkdir -p "$log_dir"
  local runner_log="${log_dir}/${provider}_seed${seed}_${persona}.runner.log"
  local args=(--provider "$provider" --seed "$seed" --persona "$persona" --out "$out")
  [[ -n "$model" ]] && args+=(--model "$model")
  # --mock owns run.sh's bundled agent and requires a quest target; the overworld start
  # is reserved for real players.
  [[ "$MOCK" == "1" ]] && args+=(--quest "$MOCK_QUEST" --mock)
  echo "  ▸ $provider seed=$seed persona=$persona ${model:+model=$model}"

  # One player failing is expected and uninteresting — a timeout, a rate limit, a client
  # hiccup. The wave carries on.
  blind-tester/run.sh "${args[@]}" >"$runner_log" 2>&1 ||     echo "    (player exited nonzero — still recorded; log at $runner_log)"

  # A wiring check records nothing. Leaning on the recorder's structural guard is not
  # enough: a run that dies BEFORE writing its sidecar is indistinguishable from a real
  # failed playtest, so a broken mock wave would file junk "failed" sessions carrying
  # real vendor families. The loop knows it is a dry run; it should not ask.
  if [[ "$MOCK" == "1" ]]; then
    echo "    (wiring check — not recorded; log at $runner_log)"
    return 0
  fi

  # Record UNCONDITIONALLY. A run that timed out or crashed is evidence about the game
  # just as much as a finished one, and the recorder is what decides the outcome label
  # from the artifacts that actually landed. Dropping failures here is precisely how a
  # QA corpus quietly becomes a highlight reel.
  local record_args=(--out "$out" --provider "$provider" --persona "$persona" --store "$STORE")
  [[ -n "$model" ]] && record_args+=(--model "$model")
  if [[ -z "$model" ]]; then
    # No pin: ask the registry which model this provider defaulted to, so the record
    # names the model that actually played rather than a guess.
    local resolved
    resolved="$(node blind-tester/resolve-provider.mjs "$provider" 2>/dev/null | cut -f3)" || resolved=""
    [[ -n "$resolved" ]] && record_args+=(--model "$resolved")
  fi
  npx tsx bin/record-playtest-session.ts "${record_args[@]}" 2>&1 | sed "s/^/    /" ||     echo "    (could not record this session — artifacts remain at $out.*)"
}

run_wave() {
  local wave="$1" index=0 pids=()
  local build
  build="$(git rev-parse --short HEAD)"
  echo "── wave $wave on build $build ──────────────────────────────────"

  IFS=',' read -ra groups <<< "$COHORT"
  for group in "${groups[@]}"; do
    local provider="${group%%:*}" count="${group#*:}"
    [[ "$count" == "$provider" ]] && count=1
    local model
    model="$(model_for "$provider" || true)"

    local i
    for ((i = 0; i < count; i++)); do
      run_player "$provider" "$((SEED_BASE + index))" "$(persona_at "$index")" "$model" &
      pids+=($!)
      index=$((index + 1))
      # Bounded fan-out: the cap is about the vendor's rate limits and this machine's
      # memory, not about correctness — every player is independent.
      while (( $(jobs -rp | wc -l) >= CONCURRENCY )); do wait -n || true; done
    done
  done
  wait || true
  echo "  wave $wave: $index player(s) dispatched"

  echo "  corpus: $(npx tsx bin/qa.ts --store-summary --store "$STORE" 2>/dev/null || echo "unavailable")"
  if [[ "${PLAYTEST_TRIAGE:-1}" == "1" ]]; then
    npm run --silent qa:triage -- --store "$STORE" || \
      echo "  triage failed; corpus is intact, retrying next wave"
  fi
  if [[ "${PLAYTEST_PUBLISH:-0}" == "1" ]]; then
    npm run --silent qa:publish -- --store "$STORE" || \
      echo "  publish failed; sessions remain staged locally"
  fi
}

wave=0
while true; do
  wave=$((wave + 1))
  run_wave "$wave"
  SEED_BASE=$((SEED_BASE + 1000))

  [[ "$once" == "1" ]] && break
  if [[ -n "${PLAYTEST_MAX_WAVES:-}" ]] && (( wave >= PLAYTEST_MAX_WAVES )); then break; fi

  # Pick up whatever the dev loop has landed since the last wave. Fetch-and-reset
  # rather than pull: this checkout is a read-only mirror of the build under test, so
  # a merge here would be meaningless and a conflict would wedge the loop.
  if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    git fetch --quiet origin && git reset --quiet --hard '@{u}' || \
      echo "  could not refresh the build; continuing on the current checkout"
  fi
  sleep "$DELAY"
done
