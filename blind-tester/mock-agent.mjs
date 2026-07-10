#!/usr/bin/env node
/**
 * blind-tester/mock-agent.mjs — a deterministic, zero-token stand-in for the
 * `claude` CLI blind player, wired into run.sh via BLIND_AGENT_CMD (see
 * fleet.mjs's `--mock` flag). This is what makes the fleet → compiler
 * pipeline testable in CI: no LLM, no API key, no network, byte-for-byte
 * reproducible from BLIND_SEED alone.
 *
 * Contract (mirrors what run.sh promises any BLIND_AGENT_CMD):
 *   - The locked prompt arrives on STDIN. This mock does not need to parse it
 *     (its "policy" is entirely seed-driven) but reads it to completion so it
 *     never blocks the writer end of the pipe.
 *   - Env vars: BLIND_MCP_CONFIG (path to the mcp.json run.sh wrote for THIS
 *     run — parsed here rather than hardcoded, so the mock launches the MCP
 *     server through the exact same isolation run.sh built), BLIND_SEED,
 *     BLIND_QUEST_ID (empty string ⇒ overworld mode).
 *   - STDOUT is the entire report (run.sh tees it straight to $OUT.md) and
 *     MUST pass src/blind/report_verifier.ts. Every diagnostic, therefore,
 *     goes to STDERR — a single stray console.log on stdout corrupts the
 *     report and fails verification.
 *
 * Play: connects to the REAL adventureforge MCP server over stdio, exactly
 * like blind-tester/smoke.mjs (same Client/StdioClientTransport pattern,
 * same parseResult/close-in-finally shape) — reusing its connection logic
 * rather than hardcoding a new one is the fidelity point: this mock exercises
 * the identical MCP surface a real blind tester would, under run.sh's real
 * process isolation.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const OVERWORLD_TURNS = 10;
const QUEST_TURNS = 10;

// --- seeded PRNG -----------------------------------------------------------
//
// Inlined mulberry32 — mirrors mulberry32()/Rng from src/core/rng.ts exactly
// (same constants, same shape: { next(), int(min,max) }). Duplicated rather
// than imported because this .mjs runs standalone under run.sh's
// BLIND_AGENT_CMD with no TS build step; keep in sync by hand if the
// engine's copy ever changes (spec §4.1, §8.5). This is the ONLY source of
// non-determinism-looking behavior in this file, and it is itself fully
// determined by BLIND_SEED — no Date.now, no Math.random anywhere below.
function mulberry32(seed) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      return lo + Math.floor(next() * (hi - lo + 1));
    },
  };
}

/** Always-non-negative modulo (BLIND_SEED can be negative per fleet's --seed-base). */
function mod(n, m) {
  return ((n % m) + m) % m;
}

// --- MCP plumbing (mirrors blind-tester/smoke.mjs) --------------------------

/** MCP text-content tool results carry a JSON string; parse it defensively,
 * and turn an isError result into a thrown Error — same as smoke.mjs. */
function parseResult(result) {
  if (result?.isError) throw new Error(result.content?.[0]?.text ?? "tool returned isError");
  const text = result?.content?.[0]?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function viewOf(payload) {
  return payload?.context ?? payload?.observation ?? payload;
}

function actionIdOf(action) {
  return typeof action === "string" ? action : action?.id;
}

function errMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

/** Not every rejection in this codebase throws (becomes MCP isError): overworld
 * action handlers throw plain Errors for bad ids (see src/world/session.ts),
 * but RPG step_action/state-hash guards instead return a NORMAL, non-error
 * `{ ok: false, rejection_reason }` payload (see src/mcp/rpg_step_action.ts,
 * rpg_state_guards.ts) so the caller can still read state_hash/context off it.
 * Break-attempt detection has to check BOTH shapes to call a rejection a
 * rejection. */
function isStructuredRejection(res) {
  return !!res && typeof res === "object" && res.ok === false;
}

/** Read BLIND_MCP_CONFIG (the mcp.json run.sh wrote) and hand back the exact
 * command/args to spawn — NOT hardcoded, so this mock launches the server
 * through run.sh's real per-run isolation (temp dir, --prefix, WSL/cygpath
 * handling, spectate wiring, all of it) instead of a shortcut. */
function readMcpServerCommand(configPath) {
  const raw = readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw);
  const servers = parsed?.mcpServers ?? {};
  const entry = servers.adventureforge ?? Object.values(servers)[0];
  if (!entry?.command) {
    throw new Error(`BLIND_MCP_CONFIG at "${configPath}" has no usable mcpServers entry.`);
  }
  return { command: entry.command, args: entry.args ?? [] };
}

function readStdin() {
  return new Promise((resolvePromise) => {
    if (process.stdin.isTTY) {
      resolvePromise("");
      return;
    }
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolvePromise(data));
    process.stdin.on("error", () => resolvePromise(data));
  });
}

// --- overworld policy --------------------------------------------------------

// Rotation of "kind"s tried each overworld turn, cycling from a seeded offset
// so the 10-turn budget samples a variety of the discoverable local surface
// instead of always hammering the same tool. Each `list` reads the compact
// context field that carries [[id, ...], ...] candidates for that kind (see
// OVERWORLD_COMPACT_LEGEND in src/world/compact_view.ts); `tupleIndex` picks
// which tuple slot is the id argument.
const OVERWORLD_ACTION_KINDS = [
  { tool: "scout_overworld_session_poi", idArg: "poi_id", list: (ctx) => ctx.poi, tupleIndex: 0 },
  {
    tool: "talk_overworld_session_contact",
    idArg: "character_id",
    list: (ctx) => ctx.contacts,
    tupleIndex: 0,
  },
  {
    tool: "explore_overworld_session_area",
    idArg: "area_id",
    list: (ctx) => ctx.areas,
    tupleIndex: 0,
  },
  { tool: "work_overworld_session_job", idArg: "job_id", list: (ctx) => ctx.jobs, tupleIndex: 0 },
  {
    tool: "explore_overworld_session_site",
    idArg: "site_id",
    list: (ctx) => ctx.sites,
    tupleIndex: 0,
  },
  {
    tool: "investigate_overworld_session_event",
    idArg: "event_id",
    list: (ctx) => ctx.events,
    tupleIndex: 0,
  },
  {
    tool: "move_overworld_session_area",
    idArg: "area_route_id",
    list: (ctx) => ctx.area_routes,
    tupleIndex: 0,
  },
  {
    tool: "travel_overworld_session",
    idArg: "destination_town_id",
    list: (ctx) => ctx.roads,
    tupleIndex: 0,
  },
];

/** A pending road encounter blocks every other overworld action (the engine
 * asserts this — see OverworldSession.assertNoPendingRoadEncounter); resolving
 * it always takes priority. Falls back to "press_on" if the context somehow
 * omits options (defensive only — the server always lists at least one). */
function pendingRoadStep(ctx, rng) {
  const opts = ctx.pending_road?.options ?? [];
  if (opts.length === 0) {
    return {
      tool: "resolve_overworld_session_road_encounter",
      args: { strategy: "press_on" },
      gist: "resolve_overworld_session_road_encounter(strategy=press_on) [no options listed]",
    };
  }
  const strategy = opts[rng.int(0, opts.length - 1)][0];
  return {
    tool: "resolve_overworld_session_road_encounter",
    args: { strategy },
    gist: `resolve_overworld_session_road_encounter(strategy=${strategy})`,
  };
}

/** Try each kind starting at a seeded offset; the first with any candidates
 * wins, and a seeded index picks which candidate. Returns null when nothing
 * discoverable is on offer (a rare, mostly-explored-town edge case). */
function pickOverworldAction(ctx, rng) {
  const offset = rng.int(0, OVERWORLD_ACTION_KINDS.length - 1);
  for (let k = 0; k < OVERWORLD_ACTION_KINDS.length; k++) {
    const kind = OVERWORLD_ACTION_KINDS[(offset + k) % OVERWORLD_ACTION_KINDS.length];
    const list = kind.list(ctx) ?? [];
    if (list.length === 0) continue;
    const entry = list[rng.int(0, list.length - 1)];
    const id = Array.isArray(entry) ? entry[kind.tupleIndex] : entry;
    return {
      tool: kind.tool,
      args: { [kind.idArg]: id },
      gist: `${kind.tool}(${kind.idArg}=${id})`,
    };
  }
  return null;
}

/** Nothing discoverable left this turn — rest or resupply are always legal
 * town services (no id argument), so they make a safe, honest fallback. */
function fallbackStep(rng) {
  const tool = rng.int(0, 1) === 0 ? "rest_overworld_session" : "resupply_overworld_session";
  return { tool, args: {}, gist: `${tool}()` };
}

function describeHere(ctx) {
  const here = ctx?.here;
  if (!Array.isArray(here)) return "";
  const town = here[1] ?? here[0] ?? "?";
  const area = here[4];
  const where = area ? `${town} / ${area}` : String(town);
  return ctx.time ? ` — ${where} (${ctx.time})` : ` — ${where}`;
}

/** Deliberate, seed-derived malformed calls — the "tried and failed to break
 * it" evidence a sycophancy-check report (seed % 7 === 0, zero organic bugs)
 * must show per the calibration rule: a report claiming nothing is wrong
 * needs to demonstrate it actually tried, not that it didn't look. */
async function runOverworldBreakAttempts(client, sessionId, seed, log) {
  const attempts = [
    { tool: "scout_overworld_session_poi", args: { poi_id: `bogus-poi-${seed}` } },
    {
      tool: "resolve_overworld_session_road_encounter",
      args: { strategy: `not-a-real-strategy-${seed}` },
    },
    { tool: "move_overworld_session_area", args: { area_route_id: `bogus-route-${seed}` } },
  ];
  let rejected = 0;
  for (const [i, attempt] of attempts.entries()) {
    const argsDesc = Object.entries(attempt.args)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    const label = `break-attempt ${i + 1}: ${attempt.tool}(${argsDesc})`;
    try {
      const raw = await client.callTool({
        name: attempt.tool,
        arguments: { session_id: sessionId, ...attempt.args },
      });
      const res = parseResult(raw);
      if (isStructuredRejection(res)) {
        rejected += 1;
        log.push(`${label} → correctly rejected: ${res.rejection_reason ?? "ok:false"}`);
      } else {
        log.push(`${label} → unexpectedly accepted (no defect found this run)`);
      }
    } catch (err) {
      rejected += 1;
      log.push(`${label} → correctly rejected: ${errMessage(err)}`);
    }
  }
  return { attempted: attempts.length, rejected };
}

async function playOverworld(client, seed, sycophancySeed) {
  const rng = mulberry32(seed);
  const log = [];
  let actionErrorCount = 0;

  const start = parseResult(
    await client.callTool({ name: "start_overworld", arguments: { compact_context: true } }),
  );
  if (!start.session_id) throw new Error("start_overworld returned no session_id");
  const sessionId = start.session_id;
  let ctx = start.context ?? {};
  log.push(`start_overworld → session ${sessionId}${describeHere(ctx)}`);

  for (let i = 0; i < OVERWORLD_TURNS; i++) {
    const turnNo = i + 1;
    const step = ctx.pending_road
      ? pendingRoadStep(ctx, rng)
      : (pickOverworldAction(ctx, rng) ?? fallbackStep(rng));
    try {
      const raw = await client.callTool({
        name: step.tool,
        arguments: { session_id: sessionId, ...step.args },
      });
      const res = parseResult(raw);
      ctx = res.context ?? ctx;
      log.push(`${turnNo}. ${step.gist} → ok${describeHere(ctx)}`);
    } catch (err) {
      actionErrorCount += 1;
      // Honest-and-continue: an action erroring is itself a legitimate
      // playtest observation, not a run failure — note it and keep going.
      log.push(`${turnNo}. ${step.gist} → ${errMessage(err)}`);
    }
  }

  let breakAttempts = null;
  if (sycophancySeed) {
    breakAttempts = await runOverworldBreakAttempts(client, sessionId, seed, log);
  }

  return { log, actionErrorCount, breakAttempts };
}

// --- quest policy ------------------------------------------------------------

function sceneGist(view) {
  const text = String(view?.scene?.text ?? view?.text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  const snippet = text.slice(0, 80);
  return ` — "${snippet}${text.length > 80 ? "…" : ""}"`;
}

async function runQuestBreakAttempts(client, sessionId, seed, stateHash, log) {
  const attempts = [
    // Unknown action id against the real, current state hash — the engine
    // returns a structured { ok: false } rejection rather than throwing.
    {
      tool: "step_action",
      args: {
        session_id: sessionId,
        action_id: `bogus-action-${seed}`,
        expected_state_hash: stateHash,
        hide_graph: true,
        compact_observation: true,
      },
    },
    // A deliberately stale expected_state_hash — also a structured
    // { ok: false } state-hash-mismatch rejection, not a thrown error.
    {
      tool: "step_action",
      args: {
        session_id: sessionId,
        action_id: `another-bogus-action-${seed}`,
        expected_state_hash: `stale-hash-${seed}`,
        hide_graph: true,
        compact_observation: true,
      },
    },
    // An outright unknown session id — this one DOES throw ("Unknown session
    // ...", see src/mcp/sessions.ts), becoming an MCP isError.
    {
      tool: "get_state",
      args: { session_id: `bogus-session-${seed}`, compact_state: true },
    },
  ];
  let rejected = 0;
  for (const [i, attempt] of attempts.entries()) {
    const label = `break-attempt ${i + 1}: ${attempt.tool}(...)`;
    try {
      const raw = await client.callTool({ name: attempt.tool, arguments: attempt.args });
      const res = parseResult(raw);
      if (isStructuredRejection(res)) {
        rejected += 1;
        log.push(`${label} → correctly rejected: ${res.rejection_reason ?? "ok:false"}`);
      } else {
        log.push(`${label} → unexpectedly accepted (no defect found this run)`);
      }
    } catch (err) {
      rejected += 1;
      log.push(`${label} → correctly rejected: ${errMessage(err)}`);
    }
  }
  return { attempted: attempts.length, rejected };
}

async function playQuest(client, questId, seed, sycophancySeed) {
  const log = [];
  let actionErrorCount = 0;

  const start = parseResult(
    await client.callTool({
      name: "start_world_quest",
      arguments: {
        world_quest_id: questId,
        seed,
        hide_graph: true,
        compact_observation: true,
      },
    }),
  );
  if (!start.session_id) {
    throw new Error(`start_world_quest returned no session_id for quest "${questId}"`);
  }
  const sessionId = start.session_id;
  let view = viewOf(start);
  let stateHash = start.state_hash;
  log.push(
    `start_world_quest(world_quest_id=${questId}, seed=${seed}) → session ${sessionId}${sceneGist(view)}`,
  );

  for (let i = 0; i < QUEST_TURNS; i++) {
    const turnNo = i + 1;
    if (view?.ended) {
      log.push(`${turnNo}. quest already ended — stopping`);
      break;
    }
    let actions;
    try {
      const actionMenu = parseResult(
        await client.callTool({
          name: "list_legal_actions",
          arguments: { session_id: sessionId, compact_actions: true },
        }),
      );
      actions = actionMenu.actions ?? [];
      stateHash = actionMenu.state_hash ?? stateHash;
    } catch (err) {
      actionErrorCount += 1;
      log.push(`${turnNo}. list_legal_actions → ${errMessage(err)}`);
      break;
    }
    if (actions.length === 0) {
      log.push(`${turnNo}. no legal actions available — stopping`);
      break;
    }
    const actionId = actionIdOf(actions[0]);
    try {
      const res = parseResult(
        await client.callTool({
          name: "step_action",
          arguments: {
            session_id: sessionId,
            action_id: actionId,
            expected_state_hash: stateHash,
            hide_graph: true,
            compact_observation: true,
          },
        }),
      );
      view = viewOf(res);
      stateHash = res.state_hash ?? stateHash;
      if (isStructuredRejection(res)) {
        // Should not happen for a freshly-fetched first legal action, but
        // step_action rejects via { ok: false, rejection_reason } rather than
        // throwing (see src/mcp/rpg_step_action.ts) — honor that shape too.
        actionErrorCount += 1;
        log.push(
          `${turnNo}. step_action(${actionId}) → rejected: ${res.rejection_reason ?? "ok:false"}`,
        );
      } else {
        log.push(
          `${turnNo}. step_action(${actionId}) → ${view?.ended ? "ended" : "ok"}${sceneGist(view)}`,
        );
      }
    } catch (err) {
      actionErrorCount += 1;
      log.push(`${turnNo}. step_action(${actionId}) → ${errMessage(err)}`);
    }
  }

  let breakAttempts = null;
  if (sycophancySeed) {
    breakAttempts = await runQuestBreakAttempts(client, sessionId, seed, stateHash, log);
  }

  return { log, actionErrorCount, breakAttempts };
}

// --- synthetic findings (the "plan") -----------------------------------------

function isSycophancySeed(seed) {
  return mod(seed, 7) === 0;
}

/**
 * The default seed-derived "plan" — every field the exit interview needs,
 * computed purely from BLIND_SEED per the task brief's seed-parity rules:
 *   - seed % 2 === 0 → the planted Albany Station Quarter S3 overlap
 *   - seed % 3 === 0 → the road-to-Colonie S2 bug
 *   - always → one unique S1 noise bug, EXCEPT seed % 7 === 0, which instead
 *     yields ZERO bugs and ZERO confusions (a sycophancy-telemetry check —
 *     see runOverworldBreakAttempts/runQuestBreakAttempts, which then perform
 *     three real, deliberately-broken MCP calls so the report can honestly
 *     show it tried to find something and failed).
 *   - clarity = 2 + (seed % 3), enjoyment = 2 + ((seed >> 1) % 3)
 *   - got_stuck = seed % 5 === 0, would_replay = seed % 2 === 1
 *
 * MOCK_PLAN (see loadPlan below) replaces this ENTIRE object wholesale with
 * one loaded from a JSON file — the object shape below IS the documented
 * "same shape" the brief refers to.
 */
function computePlan(seed) {
  const albanyOverlap = mod(seed, 2) === 0;
  const colonieOverlap = mod(seed, 3) === 0;
  const sycophancy = isSycophancySeed(seed);
  const gotStuck = mod(seed, 5) === 0;
  const wouldReplay = mod(seed, 2) === 1;
  const clarity = 2 + mod(seed, 3);
  const enjoyment = 2 + mod(seed >> 1, 3);

  const bugs = [];
  const confusions = [];
  if (!sycophancy) {
    if (albanyOverlap) {
      bugs.push({
        where: "Albany Station Quarter",
        severity: "S3",
        note: "notice board wording is confusing about where the quest actually starts",
      });
      confusions.push(
        "the notice board near Albany Station Quarter doesn't say where the quest actually starts",
      );
    }
    if (colonieOverlap) {
      bugs.push({
        where: "road to Colonie",
        severity: "S2",
        note: "road encounter text repeats itself on back-to-back trips",
      });
    }
    bugs.push({
      where: `seed-${seed} corner`,
      severity: "S1",
      note: `minor wording nit unique to seed ${seed}`,
    });
  }

  const goalUnderstood = !gotStuck;
  const bestMoment = albanyOverlap
    ? "Finding the road out of the opening town and reaching the next stop."
    : "Finding a piece of local work worth doing in the opening town.";
  const worstMoment =
    bugs.length > 0
      ? `Running into the ${bugs[0].where} issue.`
      : sycophancy
        ? "Nothing stood out as bad — tried hard to break it and it held up."
        : "A quiet stretch with nothing much happening.";
  const verdict = wouldReplay
    ? `The opening held together well enough (seed ${seed}) that a new player would likely keep going.`
    : `The opening had enough friction (seed ${seed}) that a new player might bounce off before committing.`;

  return {
    clarity,
    enjoyment,
    goal_understood: goalUnderstood,
    got_stuck: gotStuck,
    confusions,
    bugs,
    best_moment: bestMoment,
    worst_moment: worstMoment,
    would_replay: wouldReplay,
    verdict,
  };
}

/**
 * MOCK_PLAN env — optional path to a JSON file with the SAME SHAPE as
 * computePlan()'s return value:
 *   {
 *     "clarity": 1-5 (int), "enjoyment": 1-5 (int),
 *     "goal_understood": bool, "got_stuck": bool,
 *     "confusions": string[],
 *     "bugs": [{ "where": string, "severity": "S0"|"S1"|"S2"|"S3"|"S4", "note": string }],
 *     "best_moment": string, "worst_moment": string,
 *     "would_replay": bool, "verdict": string (>= 20 chars)
 *   }
 * When set, this file's contents are used VERBATIM as the plan — the
 * seed-derived defaults above are skipped entirely. This lets tests pin exact
 * synthetic findings (e.g. to test the compiler pipeline against a specific
 * bug set) instead of relying on seed arithmetic. Note: whether the three
 * break-attempt calls run is still governed by BLIND_SEED (isSycophancySeed),
 * not by the overridden plan, since that's about which real MCP calls this
 * mock makes, independent of what the plan then reports.
 */
function loadPlan(seed) {
  const planPath = process.env.MOCK_PLAN;
  const raw = planPath ? JSON.parse(readFileSync(resolve(planPath), "utf8")) : computePlan(seed);
  return {
    ...raw,
    confusions: raw.confusions ?? [],
    bugs: raw.bugs ?? [],
  };
}

// --- report assembly ----------------------------------------------------------

function buildMechanicalSection(mode, actionErrorCount, breakAttempts) {
  const parts = [];
  if (actionErrorCount === 0) {
    parts.push(
      `${mode === "quest" ? "Quest" : "Overworld"} actions all resolved without a rejected call or an obvious soft-lock this run.`,
    );
  } else {
    parts.push(
      `${actionErrorCount} of the attempted actions this run were rejected by the server (see the Playthrough log for exactly which); nothing looked like a soft-lock, just refused calls.`,
    );
  }
  if (breakAttempts) {
    const extra =
      breakAttempts.rejected < breakAttempts.attempted
        ? `, and ${breakAttempts.attempted - breakAttempts.rejected} were unexpectedly accepted`
        : "";
    parts.push(
      `As a calibration check, ${breakAttempts.attempted} deliberate break attempts were made afterward (bogus ids/hashes — see the tail of the Playthrough log): ${breakAttempts.rejected} of ${breakAttempts.attempted} were correctly rejected without a crash${extra}.`,
    );
  }
  return parts.join(" ");
}

function understandingBlurb(plan, mode) {
  const target = mode === "quest" ? "the quest's goal" : "what to do first in the open world";
  return plan.got_stuck
    ? `Could mostly tell ${target}, but got stuck at least once before finding the way forward.`
    : `Could tell ${target} without getting stuck.`;
}

function buildReport({ mode, seed, questId, log, plan, actionErrorCount, breakAttempts }) {
  const lines = [];
  lines.push(
    `# Blind Playtest Report (mock agent — seed ${seed}, ${mode === "quest" ? `quest ${questId}` : "overworld"})`,
  );
  lines.push("");
  lines.push("## 1. Playthrough log");
  lines.push("");
  for (const entry of log) lines.push(`- ${entry}`);
  lines.push("");
  lines.push("## 2. Did it work mechanically?");
  lines.push("");
  lines.push(buildMechanicalSection(mode, actionErrorCount, breakAttempts));
  lines.push("");
  lines.push("## 3. Understandable & fun?");
  lines.push("");
  lines.push(
    `Clarity: ${plan.clarity}/5. Enjoyment: ${plan.enjoyment}/5. ${understandingBlurb(plan, mode)}`,
  );
  lines.push("");
  lines.push("## 4. Confusion / friction points");
  lines.push("");
  if (plan.confusions.length === 0) {
    lines.push("None noted this run.");
  } else {
    for (const c of plan.confusions) lines.push(`- ${c}`);
  }
  lines.push("");
  lines.push("## 5. Bugs or design flaws");
  lines.push("");
  if (plan.bugs.length === 0) {
    lines.push("None found this run.");
  } else {
    for (const b of plan.bugs) lines.push(`- **${b.where}** (${b.severity}): ${b.note}`);
  }
  lines.push("");
  lines.push("## 6. Verdict");
  lines.push("");
  lines.push(plan.verdict);
  lines.push("");
  lines.push("## 7. Exit interview");
  lines.push("");
  lines.push("```json exit-interview");
  lines.push(
    JSON.stringify(
      {
        clarity: plan.clarity,
        enjoyment: plan.enjoyment,
        goal_understood: plan.goal_understood,
        got_stuck: plan.got_stuck,
        confusions: plan.confusions,
        bugs: plan.bugs,
        best_moment: plan.best_moment,
        worst_moment: plan.worst_moment,
        would_replay: plan.would_replay,
        verdict: plan.verdict,
      },
      null,
      2,
    ),
  );
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

// --- entry point ---------------------------------------------------------

function parseSeed(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : 7;
}

async function main() {
  const seed = parseSeed(process.env.BLIND_SEED);
  const questId = (process.env.BLIND_QUEST_ID ?? "").trim();
  const mcpConfigPath = process.env.BLIND_MCP_CONFIG;
  if (!mcpConfigPath) {
    throw new Error("mock-agent: BLIND_MCP_CONFIG env var is required.");
  }

  // Consume the locked prompt so the writer end of run.sh's here-string pipe
  // never blocks; this mock's policy is entirely seed-driven, so the content
  // itself is discarded.
  await readStdin();

  const { command, args } = readMcpServerCommand(mcpConfigPath);
  const transport = new StdioClientTransport({ command, args, stderr: "inherit" });
  const client = new Client({ name: "blind-tester-mock", version: "1.0.0" }, { capabilities: {} });

  await client.connect(transport);
  const sycophancySeed = isSycophancySeed(seed);
  let mode;
  let log;
  let actionErrorCount;
  let breakAttempts;
  try {
    if (questId) {
      mode = "quest";
      ({ log, actionErrorCount, breakAttempts } = await playQuest(
        client,
        questId,
        seed,
        sycophancySeed,
      ));
    } else {
      mode = "overworld";
      ({ log, actionErrorCount, breakAttempts } = await playOverworld(
        client,
        seed,
        sycophancySeed,
      ));
    }
  } finally {
    await client.close();
  }

  const plan = loadPlan(seed);
  const report = buildReport({ mode, seed, questId, log, plan, actionErrorCount, breakAttempts });
  console.log(report);
}

main().catch((err) => {
  console.error(
    `mock-agent failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
  );
  process.exit(1);
});
