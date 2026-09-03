/**
 * `npm run doctor` — does this machine's setup actually work, and if nothing is queued,
 * why not?
 *
 * The questions it answers are the ones that went unanswered during a live two-loop
 * exercise: a whole run produced findings and promoted none of them, and no command
 * would say whether that was correct behaviour or a broken pipeline. Both present as an
 * empty queue. These tests pin that it distinguishes them, because a diagnostic that
 * says the same thing in both states is worse than none — it teaches you to ignore it.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { onPath } from "../../bin/doctor.js";
import {
  derivePlaytestIsolation,
  PLAYTEST_PROVIDERS,
  type PlaytestIsolationReasonCode,
} from "../../src/blind/providers.js";
import { sealPlaytestSession, type PlaytestSessionBody } from "../../src/qa/session_record.js";
import { sha256Hex, writePlaytestSession } from "../../src/qa/session_store.js";

const ROOT = process.cwd();
const TSX = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const TRANSCRIPT = "line one\nline two\n";

const dirs: string[] = [];
function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

/** One session reporting the same defect, from whichever vendor the caller names. */
function session(over: {
  family: string;
  providerId: string;
  vendor: string;
  model: string;
  index: number;
}): PlaytestSessionBody {
  return {
    schema_version: 1,
    recorded_at: `2026-08-28T12:0${over.index}:00.000Z`,
    game_session_id: `o-${over.index}`,
    run_seed: 100 + over.index,
    build: {
      git_commit: "a".repeat(40),
      tracked_worktree_clean: true,
      world_id: "new_york_overworld",
      world_hash: "b".repeat(64),
    },
    provider: {
      id: over.providerId,
      vendor: over.vendor,
      family: over.family,
      isolation: "runner_enforced",
      transport_contract: "game-direct-mcp-v1",
    },
    model: { id: over.model, tier: "volume", settings: {} },
    persona: { id: "default", title: "default", source_sha256: "c".repeat(64) },
    outcome: "abandoned",
    log: {
      turns: 12,
      accepted_decisions: null,
      transcript_filename: "transcript.jsonl",
      transcript_sha256: sha256Hex(TRANSCRIPT),
      transcript_bytes: Buffer.byteLength(TRANSCRIPT, "utf8"),
    },
    exit_interview: {
      clarity: 3,
      enjoyment: 3,
      goal_understood: true,
      got_stuck: false,
      confusions: [],
      bugs: [
        {
          where: "quest wolf_winter, room steading_yard, blocked exit north",
          severity: "S3",
          note: "Blocked reason claims both approaches selected; exactly one was.",
        },
      ],
      best_moment: "the wolf fight",
      worst_moment: "the blocked exit",
      would_replay: true,
      verdict: "Playable, but the blocked-exit copy is wrong and misleads.",
    },
    journey_receipt: null,
    failure_note: "stopped early",
  };
}

function corpusOf(vendors: readonly { family: string; id: string; vendor: string }[]): string {
  const store = temp("af-doc-store-");
  vendors.forEach((v, index) => {
    writePlaytestSession(
      store,
      sealPlaytestSession(
        session({
          family: v.family,
          providerId: v.id,
          vendor: v.vendor,
          model: `${v.family}-model`,
          index,
        }),
      ),
      TRANSCRIPT,
    );
  });
  return store;
}

function run(script: string, args: readonly string[]): string {
  const result = spawnSync(process.execPath, [TSX, script, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 180_000,
  });
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function diagnose(store: string): string {
  const tickets = temp("af-doc-t-");
  const queue = temp("af-doc-q-");
  run("bin/triage.ts", ["--store", store, "--tickets", tickets, "--queue", queue]);
  return run("bin/doctor.ts", ["--store", store, "--tickets", tickets, "--queue", queue]);
}

const CLAUDE = { family: "claude", id: "claude_code", vendor: "anthropic" };
const GEMINI = { family: "gemini", id: "gemini_cli", vendor: "google" };
const GPT = { family: "gpt", id: "codex", vendor: "openai" };

describe("doctor", () => {
  it("names the one vendor that can run live, so a cohort is planned on fact", () => {
    // The docs once claimed no vendor was privileged, alongside an example cohort in
    // which most players could not launch. This is where an operator finds out first.
    const output = run("bin/doctor.ts", ["--store", temp("af-doc-empty-")]);
    expect(output).toContain("runner_enforced");
    expect(output).toMatch(/codex/);
    expect(output).toContain("playtest:ingest");
  });

  /**
   * The table used to be driven by `const LIVE_LAUNCHABLE_PROVIDER = "codex"` — a
   * hand-written second copy of a rule src/blind/providers.ts already derives. Two
   * failures came out of that, and these three tests pin both shut.
   *
   * The first is drift: the constant could not notice a capture reader landing, so the
   * day a second vendor became provable this command would have gone on telling the
   * operator to hand-play it. The second is flattening: every non-Codex provider got the
   * SAME sentence, which turned four different situations into one unhelpful one.
   */
  it("prints each provider's derived reason verbatim, and no two providers share one", () => {
    const output = run("bin/doctor.ts", ["--store", temp("af-doc-empty-")]);
    const reasons = PLAYTEST_PROVIDERS.map((provider) => derivePlaytestIsolation(provider).reason);
    for (const reason of reasons) expect(output).toContain(reason);
    // Distinctness is the half that matters. Asserting only "each reason appears" would
    // stay green if the derivation started answering every provider with one shared
    // house sentence, which is precisely the state this replaced.
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it("gives each provider the sentence for ITS OWN reason class", () => {
    // Written out as literals rather than recomputed from derivePlaytestIsolation. A test
    // that builds its expectation with the same function the CLI calls cannot distinguish
    // "every provider printed its own answer" from "every provider printed one shared
    // answer", and that distinction is the entire point: two vendors can miss
    // `runner_enforced` for facts that imply completely different work. No capture block
    // means someone can go and write the reader; `desktop_client` means the runner never
    // sees the process at all, so no reader would help while it is registered that way.
    // The old `LIVE_LAUNCHABLE_PROVIDER` said "not codex" to both, which is neither.
    //
    // Keyed by reason CODE rather than by vendor id on purpose. Which vendor sits in
    // which class is a fact about this checkout that changes the day a reader lands —
    // that is the whole design — so pinning vendor names here would make doing the work
    // break the test that guards it.
    const phrases: Record<PlaytestIsolationReasonCode, string> = {
      runner_captures_this_vendor: "is a headless CLI whose session log is read by",
      kind_is_not_headless_cli: "which the runner never spawns",
      no_capture_block: "declares no capture block",
      capture_reader_module_missing: "does not exist in this checkout",
    };
    const output = run("bin/doctor.ts", ["--store", temp("af-doc-empty-")]);
    const codes = new Set<PlaytestIsolationReasonCode>();
    for (const provider of PLAYTEST_PROVIDERS) {
      const derived = derivePlaytestIsolation(provider);
      codes.add(derived.code);
      expect(derived.reason, `${provider.id} is in class ${derived.code}`).toContain(
        phrases[derived.code],
      );
      expect(output, `${provider.id} (${derived.code})`).toContain(derived.reason);
    }
    // And the table really is saying more than one thing today, so the assertions above
    // are not all checking the same sentence four times over.
    expect(codes.size, "the registry no longer exercises two isolation classes").toBeGreaterThan(1);
  });

  it("names each trusted vendor's OWN witness, never one shared claim", () => {
    // "Why is this one enforced?" is the same question as "why is that one not", and the
    // honest answer is a file path. A `runner_enforced` label with no witness named is
    // the exact failure src/blind/providers.ts exists to prevent, so the diagnostic
    // prints the module doing the witnessing — a different one per vendor, because they
    // are trusted on separate evidence rather than on one house policy.
    const output = run("bin/doctor.ts", ["--store", temp("af-doc-empty-")]);
    const enforced = PLAYTEST_PROVIDERS.map((provider) => derivePlaytestIsolation(provider)).filter(
      (derived) => derived.isolation === "runner_enforced",
    );
    expect(enforced.length).toBeGreaterThan(0);
    for (const derived of enforced) {
      expect(derived.readerModule).not.toBeNull();
      expect(output).toContain(derived.readerModule);
    }
    expect(new Set(enforced.map((derived) => derived.readerModule)).size).toBe(enforced.length);
  });

  it("says a single-family stall is correct, and what would actually change it", () => {
    const output = diagnose(corpusOf([CLAUDE, CLAUDE, CLAUDE]));
    // The distinction that matters: this is the rule working, not a fault.
    expect(output).toContain("That is a real state, not");
    expect(output).toContain("Add a SECOND model family");
    expect(output).toMatch(/families so far: claude/);
  });

  it("reports work waiting once a second family corroborates", () => {
    const output = diagnose(corpusOf([CLAUDE, GEMINI, GPT]));
    expect(output).toContain("The dev loop has work");
    expect(output).not.toContain("Add a SECOND model family");
  });

  it("does not cry clustering-bug on a single session", () => {
    // With one session every ticket has exactly one report by construction, so the
    // non-merging heuristic must stay silent or it teaches you to ignore it.
    const output = diagnose(corpusOf([CLAUDE]));
    expect(output).not.toContain("nothing merged at all");
  });

  // The failure this pair exists for, from the 2026-09-02 audit. A 100-player wave
  // produced 633 committed tickets; 351 reached `corroborated` and were then aged out to
  // `stale`. `isActionable` is a CONJUNCTION, so the dev loop could work none of them and
  // `qa:triage` promoted zero — while doctor filtered on promotion alone and printed
  // "351 actionable", then hit an open AUDIT item and stopped at "✓ The dev loop has
  // work". The one command whose stated job is "if nothing is queued, why not" reported
  // a healthy flywheel over a dead one, for hundreds of tickets.
  function stalledBucket(): { tickets: string; queue: string } {
    const tickets = temp("af-doc-stale-t-");
    const real = readdirSync(join(ROOT, "qa", "tickets")).filter((f) => f.endsWith(".json"));
    const source = JSON.parse(
      readFileSync(join(ROOT, "qa", "tickets", real[0]!), "utf8"),
    ) as Record<string, unknown>;
    // Guard the fixture's premise rather than assuming it: this must be a ticket that
    // cleared corroboration and is nonetheless not actionable.
    expect(source["promotion"]).toBe("corroborated");
    expect(source["status"]).toBe("stale");
    writeFileSync(join(tickets, real[0]!), JSON.stringify(source), "utf8");
    return { tickets, queue: temp("af-doc-stale-q-") };
  }

  it("counts a corroborated-but-stale ticket as NOT actionable", () => {
    const { tickets, queue } = stalledBucket();
    const output = run("bin/doctor.ts", [
      "--store",
      temp("af-doc-empty-"),
      "--tickets",
      tickets,
      "--queue",
      queue,
    ]);

    expect(output).toMatch(/tickets 1 \(0 actionable\)/);
    expect(output).toContain("aged out");
    // The corroboration advice is for a DIFFERENT stall and would be wrong here: this
    // ticket already corroborated.
    expect(output).not.toContain("Add a SECOND model family");
  });

  it("does not let an open audit item hide a playtest bucket that promotes nothing", () => {
    const { tickets, queue } = stalledBucket();
    run("bin/submit.ts", [
      "--source",
      "audit",
      "--kind",
      "bug",
      "--title",
      "an unrelated audit chore",
      "--body",
      "not from a playtest",
      "--queue",
      queue,
    ]);

    const output = run("bin/doctor.ts", [
      "--store",
      temp("af-doc-empty-"),
      "--tickets",
      tickets,
      "--queue",
      queue,
    ]);

    // The queue genuinely has work, so the checkmark is honest and stays...
    expect(output).toContain("The dev loop has work");
    // ...but it must no longer END the report and swallow the reason.
    expect(output).toContain("Not from the playtest side");
    expect(output).toContain("aged out");
  });

  it("distinguishes an empty corpus from a stalled one", () => {
    const output = run("bin/doctor.ts", [
      "--store",
      temp("af-doc-empty-"),
      "--tickets",
      temp("af-doc-t-"),
      "--queue",
      temp("af-doc-q-"),
    ]);
    expect(output).toContain("No sessions yet");
    expect(output).not.toContain("Add a SECOND model family");
  });
});

describe("onPath", () => {
  /**
   * This resolved NOTHING on Windows. onPath shelled `command -v <bin>` with
   * `shell: true`, which spawns cmd.exe, where `command` is not a builtin — so the call
   * threw for every binary and the function returned false unconditionally. The one
   * command whose job is to say what an operator can launch reported that they could
   * launch nothing, on the platform where that answer is hardest to check by hand.
   *
   * `node` is the honest probe: this suite is running under it, so it is on PATH by
   * construction on every platform, and the old implementation still said it was not.
   */
  it("finds an executable that is definitely on PATH", () => {
    expect(onPath("node")).toBe(true);
  });

  it("does not invent one that is not", () => {
    expect(onPath("adventureforge-definitely-not-a-real-binary")).toBe(false);
  });

  it("survives a PATH containing empty and quoted entries", () => {
    const original = process.env.PATH;
    try {
      process.env.PATH = `${original ?? ""}${delimiter}${delimiter}"${tmpdir()}"`;
      expect(onPath("node")).toBe(true);
      expect(onPath("adventureforge-definitely-not-a-real-binary")).toBe(false);
    } finally {
      process.env.PATH = original;
    }
  });
});

/**
 * The cohort preflight in playtest-loop.sh was the THIRD hand-written copy of the
 * launchability policy — `[[ "$provider" != "codex" ]]` — and it is pinned in THIS file
 * because it is now the same derived fact `npm run doctor` reports. One rule with two
 * consumers, pinned in one place, is what stops it quietly becoming two rules again.
 *
 * The shell is exercised the way tests/regression/loop_driver_gates.test.ts exercises
 * loop.sh: the real text is cut out of the shipped file and run under `bash -s`, with a
 * stub substituted for the one function that shells out. Running playtest-loop.sh itself
 * is not an option — one step past this gate it dispatches a live, paid cohort.
 */
const LOOP_SH = readFileSync(join(ROOT, "playtest-loop.sh"), "utf8");
const GATE_ANCHOR = 'if [[ "$MOCK" != "1" ]]; then';

/** The exact shipped text between two anchors, so the test can never drift from the file. */
function loopSection(start: string, end: string): string {
  const from = LOOP_SH.indexOf(start);
  expect(from, `playtest-loop.sh no longer contains: ${start}`).toBeGreaterThanOrEqual(0);
  const to = LOOP_SH.indexOf(end, from);
  expect(to, `playtest-loop.sh no longer contains: ${end}`).toBeGreaterThan(from);
  return LOOP_SH.slice(from, to);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * One provider's `--records` answer, in the keys the shell actually reads.
 *
 * FOUR keys, not two, because launchability is two independent facts. `isolation` says
 * this vendor's blindness is PROVABLE here (a capture reader exists); `drivable` says
 * blind-tester/run.sh actually has a launch path for that reader. Gating on the first
 * alone dispatched a full wave of claude_code players the moment its reader landed, every
 * one of which run.sh then refused — a burned wave reported as a cohort of failures
 * rather than as the single configuration fact it was.
 */
function records(
  isolation: string,
  reason: string,
  drivable: "0" | "1" = "1",
  drivableReason: string = reason,
): string {
  return (
    `id\tstub\nisolation\t${isolation}\nisolation_reason\t${reason}\n` +
    `drivable\t${drivable}\ndrivable_reason\t${drivableReason}\n`
  );
}

/**
 * A bash stand-in for `provider_isolation`, the single point where the shell shells out.
 *
 * `null` means the resolver REFUSED this id — an unregistered provider, a broken catalog,
 * or the registry's stored isolation disagreeing with what this checkout derives. That
 * last one is the failure the whole derivation exists to catch, so the gate has to
 * survive it rather than read an unanswered question as a yes.
 */
function stubResolver(table: Record<string, string | null>): string {
  const arms = Object.entries(table).map(([id, answer]) =>
    answer === null
      ? `    ${id}) echo 'resolver refused ${id}' >&2; return 2 ;;`
      : `    ${id}) printf '%s' ${shellQuote(answer)} ;;`,
  );
  return [
    "provider_isolation() {",
    '  case "$1" in',
    ...arms,
    '    *) echo "the stub was asked about an unexpected id: $1" >&2; return 2 ;;',
    "  esac",
    "}",
  ].join("\n");
}

function runPreflight(
  cohort: string,
  stub: string,
  mock = "0",
): { status: number | null; output: string } {
  const script = [
    "set -uo pipefail",
    `COHORT=${shellQuote(cohort)}`,
    `MOCK=${shellQuote(mock)}`,
    // The real functions, then the stub overriding the one seam, then the real gate that
    // calls them. Order matters: the stub has to land after the definition it replaces
    // and before the caller.
    loopSection("provider_isolation() {", GATE_ANCHOR),
    stub,
    loopSection(GATE_ANCHOR, "# Model pin lookup:"),
  ].join("\n");
  const result = spawnSync("bash", ["-s"], {
    cwd: ROOT,
    input: script,
    encoding: "utf8",
    timeout: 120_000,
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`,
  };
}

const WITNESSED = records("runner_enforced", "the stub vendor's log is read by a stub reader");
/** A reason no file in this repo contains, so quoting it can only mean pass-through. */
const SENTINEL_REASON =
  'provider "stub_cli" names capture reader "blind-tester/nobody-wrote-this.mjs", which ' +
  "does not exist in this checkout, so no session of it can be witnessed";

describe("playtest-loop.sh cohort preflight", () => {
  it("is syntactically valid bash", () => {
    const result = spawnSync("bash", ["-n", "playtest-loop.sh"], { cwd: ROOT, encoding: "utf8" });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it("no longer decides launchability by comparing against a vendor name", () => {
    // The exact shape of the old gate. It could not notice a capture reader landing, so
    // it would have gone on refusing a vendor that had just become provable — making the
    // work of becoming provable pointless, which is the opposite of the intended incentive.
    expect(LOOP_SH).not.toContain('!= "codex"');
  });

  it("dispatches when every requested provider is one the runner can witness", () => {
    const result = runPreflight("stub_cli:4", stubResolver({ stub_cli: WITNESSED }));
    expect(result.status, result.output).toBe(0);
    expect(result.output).not.toContain("Refusing the cohort");
  });

  it("refuses a provable vendor the runner still has no launch path for", () => {
    // The second gate. This is the state claude_code was actually in the moment its
    // capture reader landed: blindness genuinely provable, no way to spawn it. Dispatching
    // here would launch players run.sh refuses one by one, and — worse — any session
    // assembled by another route would be sealed with the stronger evidence label.
    const NOT_DRIVABLE =
      'provider "stub_cli" has a capture reader (blind-tester/stub-reader.mjs) but ' +
      "blind-tester/run.sh has no launch path written against it yet";
    const result = runPreflight(
      "stub_cli:3",
      stubResolver({
        stub_cli: records("runner_enforced", "provable by the stub reader", "0", NOT_DRIVABLE),
      }),
    );
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain(NOT_DRIVABLE);
  });

  it("refuses on the derivation's answer, and quotes its reason verbatim", () => {
    const result = runPreflight(
      "stub_cli:2",
      stubResolver({ stub_cli: records("operator_attested", SENTINEL_REASON) }),
    );
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain(SENTINEL_REASON);
    // And it stays as actionable as the sentence it replaced: where this evidence goes
    // instead, the free way to test the wiring with no vendor at all, and where to read
    // the current per-provider table rather than a copy of it pasted in here.
    expect(result.output).toContain("bin/ingest-playtest-session.ts");
    expect(result.output).toContain("PLAYTEST_MOCK=1");
    expect(result.output).toContain("npm run doctor");
  });

  it("refuses a provider it cannot resolve, surfacing the resolver's own words", () => {
    // An unanswered launchability question is not a yes. Continuing here would dispatch a
    // wave whose every player dies at launch, and the recorder cannot tell that from a
    // mid-play crash — so it would file each one as a `failed` session carrying a real
    // vendor family, seeding the corpus with evidence about nothing at all.
    const result = runPreflight("mystery:1", stubResolver({ mystery: null }));
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("resolver refused mystery");
    expect(result.output).toContain("could not be resolved");
  });

  it("names every blocked provider, once each, however many players were asked for", () => {
    const result = runPreflight(
      "stub_cli:3,stub_cli:2,other_cli:1,witness_cli:1",
      stubResolver({
        stub_cli: records("operator_attested", SENTINEL_REASON),
        other_cli: records("operator_attested", "other_cli has no capture block either"),
        witness_cli: WITNESSED,
      }),
    );
    expect(result.status, result.output).toBe(1);
    // Repeating one provider's reason per requested player would bury the second blocked
    // vendor under the first one's copies.
    expect(result.output.split(SENTINEL_REASON).length - 1).toBe(1);
    expect(result.output).toContain("other_cli has no capture block either");
  });

  it("still lets PLAYTEST_MOCK=1 past the gate — a wiring check launches no vendor", () => {
    // The mock wave drives run.sh's bundled scripted agent, so there is no client whose
    // blindness could be proved or doubted. Gating it would take the one free way to test
    // this loop's plumbing away from exactly the vendors that most need hand-play.
    const result = runPreflight(
      "stub_cli:8",
      stubResolver({ stub_cli: records("operator_attested", SENTINEL_REASON) }),
      "1",
    );
    expect(result.status, result.output).toBe(0);
    expect(result.output).not.toContain("Refusing the cohort");
  });

  it("reads keys the shipped resolver actually emits", () => {
    // The shell above is only honest if `--records` really carries these two keys, and
    // carries the same answer the typed authority gives. That seam runs between files
    // owned by different changes, so it gets its own pin instead of being assumed by the
    // stubs — a stub agreeing with itself proves nothing.
    const provider = PLAYTEST_PROVIDERS.find(
      (candidate) => derivePlaytestIsolation(candidate).isolation === "operator_attested",
    );
    expect(provider, "no operator_attested provider left to check the seam with").toBeDefined();
    const result = spawnSync(
      process.execPath,
      ["blind-tester/resolve-provider.mjs", "--records", provider!.id],
      { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const rows = new Map(
      (result.stdout ?? "")
        .split(/\r?\n/u)
        .filter((line) => line.includes("\t"))
        .map((line) => line.split("\t") as [string, string]),
    );
    const derived = derivePlaytestIsolation(provider!);
    expect(rows.get("isolation")).toBe(derived.isolation);
    expect(rows.get("isolation_reason")).toBe(derived.reason);
  });
});
