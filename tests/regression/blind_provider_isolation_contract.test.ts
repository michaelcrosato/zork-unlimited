import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module without type declarations
import { deriveProviderIsolation } from "../../blind-tester/resolve-provider.mjs";
import {
  PLAYTEST_PROVIDERS,
  PlaytestProviderSchema,
  derivePlaytestIsolation,
  parsePlaytestCatalog,
  resolvePlaytestSessionLogLocator,
  type PlaytestCapture,
  type PlaytestIsolationSubject,
  type PlaytestProvider,
} from "../../src/blind/providers.js";
import { useCleanTrackedGitCheckout } from "./support/clean_git_checkout.js";

/**
 * The registry's `isolation` label is the strongest claim in the QA pipeline: a
 * `runner_enforced` session counts toward experience metrics, an
 * `operator_attested` one does not. It used to be hand-written data, and the code
 * that consumed it never asked whether the runner could actually witness the
 * vendor, so nothing but this file stopped a new registry entry from asserting
 * proof that no code in the repo produces.
 *
 * The label is now DERIVED — headless CLI, plus a complete capture block, plus a
 * reader module that exists on disk — so these tests changed job. They no longer
 * guard a literal against a reviewer's attention; they prove the derivation is the
 * thing that decides, that its inputs are facts about this checkout rather than
 * assertions in JSON, and that the shipped registry still lands exactly where the
 * runner's own capability sits.
 */

function runnerSource(): string {
  return readFileSync(join(process.cwd(), "blind-tester", "run.sh"), "utf8");
}

/**
 * The capture readers `blind-tester/run.sh` has an actual live launch path for.
 *
 * This replaced `PURE_LAUNCHABLE_PROVIDER="codex"`. The old constant was a vendor NAME,
 * which meant the runner's answer to "may this provider produce pure evidence" could not
 * be checked against anything — it was true only while nobody taught the harness a second
 * client. The runner now derives that answer from the registry (`runner_enforced`), and
 * keeps only the fact a shell script alone can know: which capture readers it is written
 * to drive. That is a real, checkable property, so the tests below read it instead of
 * re-hard-coding a vendor here.
 */
function runnerImplementedCaptureReaders(): string[] {
  // Read the shared manifest, not run.sh's private syntax. This list began as a bash
  // array inside run.sh, which meant bin/doctor.ts could not see it — and doctor promptly
  // advertised a live claude_code lane that run.sh refused, while playtest-loop dispatched
  // players into it. It now lives in blind-tester/implemented-launch-paths.json, read by
  // run.sh, doctor and resolve-provider alike, so this test reads the same file rather
  // than pinning one consumer's formatting.
  const parsed: unknown = JSON.parse(
    readFileSync(join(process.cwd(), "blind-tester", "implemented-launch-paths.json"), "utf8"),
  );
  const readers =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { implementedCaptureReaders?: unknown }).implementedCaptureReaders
      : undefined;
  expect(
    Array.isArray(readers),
    "blind-tester/implemented-launch-paths.json must declare implementedCaptureReaders",
  ).toBe(true);
  const list = readers as string[];
  expect(list.length).toBeGreaterThan(0);
  // And run.sh must actually consult it. A hardcoded fallback would quietly reintroduce
  // the drift this file exists to remove.
  expect(runnerSource()).toContain("implemented-launch-paths.json");
  return list;
}

/**
 * Providers this checkout can WITNESS (derived) and this runner can DRIVE (implemented).
 *
 * Both halves are required and neither implies the other, which is the whole reason the
 * runner keeps two gates instead of one.
 */
function pureLaunchableProviders(): string[] {
  const implemented = new Set(runnerImplementedCaptureReaders());
  return PLAYTEST_PROVIDERS.filter(
    (provider) =>
      derivePlaytestIsolation(provider).isolation === "runner_enforced" &&
      provider.capture !== undefined &&
      implemented.has(provider.capture.readerModule),
  ).map((provider) => provider.id);
}

function firstCatalogModel(provider: PlaytestProvider): string {
  const raw = JSON.parse(readFileSync(join(process.cwd(), provider.catalogPath), "utf8"));
  return parsePlaytestCatalog(provider, raw).models[0]!.id;
}

/**
 * A capture block whose reader is a real file in this checkout.
 *
 * It names the shipped Codex reader deliberately: the point of several tests below is
 * that the derivation asks "does this module exist", not "is this vendor codex", so the
 * synthetic providers have to be able to borrow a real reader while being some other
 * vendor entirely.
 */
const CAPTURE_WITH_REAL_READER: PlaytestCapture = {
  sessionId: { source: "runner_pinned", locator: "--session-id" },
  sessionLog: {
    rootEnv: "MADE_UP_CLIENT_HOME",
    rootDefault: "{HOME}/.made-up-client",
    pathTemplate: "sessions/{SESSION_ID}.jsonl",
  },
  readerModule: "blind-tester/codex-rollout.mjs",
};

/** The same block, pointed at a module nobody has written. */
const CAPTURE_WITH_MISSING_READER: PlaytestCapture = {
  ...CAPTURE_WITH_REAL_READER,
  readerModule: "blind-tester/made-up-client-rollout.mjs",
};

function syntheticProvider(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "made_up",
    displayName: "Made Up CLI",
    vendor: "made-up",
    family: "made-up",
    kind: "headless_cli",
    isolation: "operator_attested",
    launch: {
      executable: "made-up",
      argv: ["--model", "{MODEL}"],
      binaryOverrideEnv: "BLIND_MADE_UP_BIN",
    },
    catalogPath: "blind-tester/catalogs/made_up.json",
    transportContract: "game-direct-mcp-v1",
    ...over,
  };
}

describe("playtest isolation is derived from what this checkout can witness", () => {
  it("earns runner_enforced only from kind + a complete capture block + a reader on disk", () => {
    // The whole rule, stated once as three independent facts. Each of the next three
    // tests removes exactly one of them.
    const derived = derivePlaytestIsolation({
      id: "made_up",
      kind: "headless_cli",
      capture: CAPTURE_WITH_REAL_READER,
    });
    expect(derived.isolation).toBe("runner_enforced");
    expect(derived.code).toBe("runner_captures_this_vendor");
    expect(derived.readerModule).toBe("blind-tester/codex-rollout.mjs");
    // Nothing about this vendor is registered anywhere, which is the point: the
    // derivation reads the capture block and the filesystem, not a vendor allowlist.
    expect(PLAYTEST_PROVIDERS.some((provider) => provider.id === "made_up")).toBe(false);
  });

  it("downgrades a capture block that names a module nobody wrote", () => {
    // The forgery this whole change exists to stop, in its cheapest form: describing a
    // reader is free, writing one is not. A capture block is a claim about code, so the
    // filesystem gets the last word.
    const derived = derivePlaytestIsolation({
      id: "made_up",
      kind: "headless_cli",
      capture: CAPTURE_WITH_MISSING_READER,
    });
    expect(derived.isolation).toBe("operator_attested");
    expect(derived.code).toBe("capture_reader_module_missing");
    expect(derived.reason).toContain("blind-tester/made-up-client-rollout.mjs");
    expect(existsSync(join(process.cwd(), CAPTURE_WITH_MISSING_READER.readerModule))).toBe(false);
  });

  it("downgrades a launchable CLI that declares no capture at all", () => {
    const derived = derivePlaytestIsolation({ id: "made_up", kind: "headless_cli" });
    expect(derived.isolation).toBe("operator_attested");
    expect(derived.code).toBe("no_capture_block");
    expect(derived.readerModule).toBeNull();
  });

  it("never lets a desktop_client reach runner_enforced, capture block or not", () => {
    // A desktop client is driven by a human on a machine this repo has no relationship
    // with. Handing it a capture block that would be sufficient for a headless CLI —
    // real reader and all — must still derive operator_attested, because the missing
    // ingredient is the runner owning the process, and no data can supply that.
    const derived = derivePlaytestIsolation({
      id: "made_up_desktop",
      kind: "desktop_client",
      capture: CAPTURE_WITH_REAL_READER,
    });
    expect(derived.isolation).toBe("operator_attested");
    expect(derived.code).toBe("kind_is_not_headless_cli");

    // And the schema refuses that shape outright, so the derivation's guard is a second
    // line rather than the only one.
    expect(() =>
      PlaytestProviderSchema.parse(
        syntheticProvider({
          kind: "desktop_client",
          launch: undefined,
          capture: CAPTURE_WITH_REAL_READER,
        }),
      ),
    ).toThrow(/cannot declare a capture block/);
    expect(() =>
      PlaytestProviderSchema.parse(
        syntheticProvider({
          kind: "desktop_client",
          launch: undefined,
          isolation: "runner_enforced",
        }),
      ),
    ).toThrow(/isolation can only be operator_attested/);
  });

  it("makes a stored label that disagrees with the derivation a hard parse failure", () => {
    // Over-claiming: the entry says the runner witnessed it, the checkout says no reader
    // exists. This is the failure that used to be caught by a comment.
    // (ZodError renders its issues as JSON, so quotes inside a message arrive escaped —
    // hence `\\?"` rather than `"` in these patterns.)
    expect(() =>
      PlaytestProviderSchema.parse(
        syntheticProvider({ isolation: "runner_enforced", capture: CAPTURE_WITH_MISSING_READER }),
      ),
    ).toThrow(
      /declares isolation \\?"runner_enforced\\?" but this checkout derives \\?"operator_attested\\?"/,
    );

    // Over-claiming with nothing to back it at all.
    expect(() =>
      PlaytestProviderSchema.parse(syntheticProvider({ isolation: "runner_enforced" })),
    ).toThrow(/declares no capture block/);

    // Under-claiming is equally loud: a landed reader whose entry still says the runner
    // could not see anything throws away real proof, and silently correcting it would be
    // the same unaudited relabelling in the safer-looking direction.
    expect(() =>
      PlaytestProviderSchema.parse(
        syntheticProvider({ isolation: "operator_attested", capture: CAPTURE_WITH_REAL_READER }),
      ),
    ).toThrow(
      /declares isolation \\?"operator_attested\\?" but this checkout derives \\?"runner_enforced\\?"/,
    );
  });

  it("refuses a capture locator that is not bound to one session", () => {
    // A path template with no {SESSION_ID} resolves to "some log this client wrote",
    // which is how a reader ends up auditing a session a human played minutes earlier
    // and reporting it as runner-witnessed.
    // `isolation` is set to what the derivation will produce (the reader is real), so the
    // only issue this parse can raise is the locator rule under test.
    expect(() =>
      PlaytestProviderSchema.parse(
        syntheticProvider({
          isolation: "runner_enforced",
          capture: {
            ...CAPTURE_WITH_REAL_READER,
            sessionLog: {
              ...CAPTURE_WITH_REAL_READER.sessionLog,
              pathTemplate: "sessions/latest.jsonl",
            },
          },
        }),
      ),
    ).toThrow(/must bind the log to \{SESSION_ID\}/);
  });

  it("refuses a capture locator that walks out of the client's state root", () => {
    expect(() =>
      PlaytestProviderSchema.parse(
        syntheticProvider({
          isolation: "runner_enforced",
          capture: {
            ...CAPTURE_WITH_REAL_READER,
            sessionLog: {
              ...CAPTURE_WITH_REAL_READER.sessionLog,
              pathTemplate: "../../{SESSION_ID}.jsonl",
            },
          },
        }),
      ),
    ).toThrow(/must not contain a \\?"\.\.\\?" segment/);
  });

  it("shipped registry: every stored label equals its derivation", () => {
    // PLAYTEST_PROVIDERS parsed at import, so the schema already enforced this. Assert it
    // anyway and independently: this is the line that would fail if the refinement were
    // ever loosened to a warning.
    for (const provider of PLAYTEST_PROVIDERS) {
      expect(provider.isolation, provider.id).toBe(derivePlaytestIsolation(provider).isolation);
    }
  });

  it("shipped registry: runner_enforced is exactly the set with a readable capture reader", () => {
    // Recomputed from the filesystem here rather than from the derivation, so a bug in
    // the derivation cannot make this test agree with it.
    const enforced = PLAYTEST_PROVIDERS.filter((p) => p.isolation === "runner_enforced").map(
      (p) => p.id,
    );
    const capturable = PLAYTEST_PROVIDERS.filter(
      (p) =>
        p.kind === "headless_cli" &&
        p.capture !== undefined &&
        existsSync(join(process.cwd(), p.capture.readerModule)),
    ).map((p) => p.id);
    expect(enforced).toEqual(capturable);
  });
});

describe("playtest provider isolation matches what the runner can prove", () => {
  it("only launches a pure run for a vendor this checkout can actually witness", () => {
    // The derivation says what this checkout can READ; run.sh says what it can DRIVE.
    // Neither implies the other, so the runner keeps both gates and this is the seam
    // that checks the important direction: everything the runner will launch for pure
    // must be runner_enforced. The reverse is allowed to lag — a reader can land before
    // its launch path is written — and that lag is safe precisely because it fails
    // closed: no session is produced, so no session gets a label nobody witnessed.
    const launchable = pureLaunchableProviders();
    for (const id of launchable) {
      const provider = PLAYTEST_PROVIDERS.find((candidate) => candidate.id === id)!;
      expect(derivePlaytestIsolation(provider).isolation, id).toBe("runner_enforced");
    }
    // A harness that can launch nothing for pure produces no runner-enforced evidence at
    // all. That is a silent catastrophe rather than a loud one, so assert against it.
    expect(launchable.length).toBeGreaterThan(0);
    // Every named launch path must be a module that exists, for the same reason a
    // capture block naming a missing reader cannot mint a label.
    for (const reader of runnerImplementedCaptureReaders()) {
      expect(existsSync(join(process.cwd(), reader)), reader).toBe(true);
    }
  });

  it("never delivers the player prompt as a launch argument", () => {
    // PlaytestLaunchSchema documents one prompt contract: STDIN, always. A flag
    // that takes the prompt as its VALUE silently consumes the next token, so
    // `--prompt-interactive -` made the literal string "-" the whole prompt and
    // left the real one unread on a pipe nobody drains. It also puts the player
    // prompt in the process table, which is the other half of why the contract
    // exists.
    const PROMPT_VALUE_FLAGS = new Set(["--prompt", "--prompt-interactive", "-i", "--interactive"]);
    for (const provider of PLAYTEST_PROVIDERS) {
      for (const arg of provider.launch?.argv ?? []) {
        expect(PROMPT_VALUE_FLAGS.has(arg), `${provider.id} argv contains ${arg}`).toBe(false);
      }
    }
  });

  it("resolves a capture locator without knowing one vendor's naming rules", () => {
    // The locator has to be usable, or it is the same dead data `launch.argv` was before
    // anything read it. Substitution is exact-token and nothing more; `exact` is what
    // tells a caller whether it holds one path or a search.
    const codex = PLAYTEST_PROVIDERS.find((p) => p.capture !== undefined)!;
    const capture = codex.capture!;

    const preLaunch = resolvePlaytestSessionLogLocator(capture, { home: "/home/p" });
    expect(preLaunch.root).toBe("/home/p/.codex");
    // Announced-id vendors cannot be resolved before the run: the id is still a token.
    expect(preLaunch.exact).toBe(false);
    expect(capture.sessionId.source).toBe("discovered");

    const withEnv = resolvePlaytestSessionLogLocator(capture, {
      home: "/home/p",
      env: { CODEX_HOME: "/elsewhere/codex" },
      sessionId: "0199-uuid",
    });
    expect(withEnv.root).toBe("/elsewhere/codex");
    expect(withEnv.path).toContain("0199-uuid");
    // A wildcard survives, so the reader still has to walk — which is exactly what
    // blind-tester/codex-rollout.mjs does.
    expect(withEnv.exact).toBe(false);

    // A runner-pinned vendor with no wildcard resolves to one path BEFORE launch.
    const pinned = resolvePlaytestSessionLogLocator(CAPTURE_WITH_REAL_READER, {
      home: "/home/p",
      sessionId: "0199-uuid",
    });
    expect(pinned.path).toBe("/home/p/.made-up-client/sessions/0199-uuid.jsonl");
    expect(pinned.exact).toBe(true);
  });

  it("refuses a pure run for every headless vendor the runner cannot launch", () => {
    // Before this check the only provider gate in the pure path asked whether the
    // vendor was a headless CLI at all, which claude_code and gemini_cli both
    // are. The run then fell through into the hard-coded Codex preflight and, on
    // a machine that has Codex installed, launched `codex exec --model <that
    // vendor's model>`: a burned launch reported under the wrong vendor.
    const launchable = new Set(pureLaunchableProviders());
    const candidates = PLAYTEST_PROVIDERS.filter(
      (provider) => provider.kind === "headless_cli" && !launchable.has(provider.id),
    );
    expect(candidates.length).toBeGreaterThan(0);

    for (const provider of candidates) {
      const result = spawnSync(
        process.execPath,
        [
          "blind-tester/blind-launch.mjs",
          "--provider",
          provider.id,
          "--model",
          firstCatalogModel(provider),
        ],
        { cwd: process.cwd(), encoding: "utf8", env: { ...process.env }, timeout: 30_000 },
      );
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
      expect(result.status, output).toBe(2);
      expect(output).toContain(`Provider "${provider.id}" cannot produce pure evidence`);
      expect(output).toContain("playtest:ingest");
      // The refusal must land before anything is launched or written, so the
      // operator never has to tell a launch refusal apart from a mid-play crash.
      expect(output).not.toContain("Blind playtest →");
    }
  }, 60_000);
});

/**
 * The shell's own view of the same rule.
 *
 * `blind-tester/run.sh` cannot import TypeScript (see the header of
 * resolve-provider.mjs), so the derivation reaches it through a dependency-free mirror.
 * A mirror is only safe while something proves it is one, and that is this block's job:
 * it compares the two implementations directly, and then proves the RUNNER acts on the
 * derived answer rather than on the label stored in JSON.
 */
describe("the shell resolver derives the same isolation the typed authority does", () => {
  const MIRROR_SUBJECTS: Array<{ label: string; subject: PlaytestIsolationSubject }> = [
    {
      label: "headless CLI with a reader on disk",
      subject: { id: "made_up", kind: "headless_cli", capture: CAPTURE_WITH_REAL_READER },
    },
    {
      label: "headless CLI naming a reader nobody wrote",
      subject: { id: "made_up", kind: "headless_cli", capture: CAPTURE_WITH_MISSING_READER },
    },
    {
      label: "headless CLI with no capture block",
      subject: { id: "made_up", kind: "headless_cli" },
    },
    {
      label: "desktop client carrying a real reader",
      subject: {
        id: "made_up_desktop",
        kind: "desktop_client",
        capture: CAPTURE_WITH_REAL_READER,
      },
    },
  ];

  it("agrees with derivePlaytestIsolation on every reason class, sentence included", () => {
    // Byte-equal reasons are deliberate: the mirror reproduces the authority's prose so
    // that drift shows up here as a failing assertion instead of as two subtly different
    // explanations printed by two different commands.
    for (const { label, subject } of MIRROR_SUBJECTS) {
      expect(deriveProviderIsolation(subject), label).toEqual(derivePlaytestIsolation(subject));
    }
  });

  it("agrees with derivePlaytestIsolation on every shipped provider", () => {
    for (const provider of PLAYTEST_PROVIDERS) {
      expect(deriveProviderIsolation(provider), provider.id).toEqual(
        derivePlaytestIsolation(provider),
      );
    }
  });

  it("emits the derived isolation, the launch block, and shell-safe records", () => {
    for (const provider of PLAYTEST_PROVIDERS) {
      const run = (args: string[]) =>
        spawnSync(process.execPath, ["blind-tester/resolve-provider.mjs", ...args], {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 30_000,
        });

      // The ORIGINAL four columns still mean what they meant: run.sh's history and
      // playtest-loop.sh both cut these exact fields.
      const legacy = run([provider.id]);
      expect(legacy.status, legacy.stderr).toBe(0);
      const columns = legacy.stdout.trimEnd().split("\t");
      expect(columns).toHaveLength(4);
      expect(columns[0]).toBe(provider.kind);
      expect(columns[1]).toBe(derivePlaytestIsolation(provider).isolation);

      const json = run(["--json", provider.id]);
      expect(json.status, json.stderr).toBe(0);
      const parsed = JSON.parse(json.stdout);
      expect(parsed.isolation).toBe(derivePlaytestIsolation(provider).isolation);
      expect(parsed.isolationReason).toBe(derivePlaytestIsolation(provider).reason);
      // The launch block is what run.sh used to spell out for itself. It has to arrive
      // whole, or the runner is back to re-deriving a vendor's executable from a literal.
      expect(parsed.launch, provider.id).toEqual(provider.launch ?? null);
      expect(parsed.model).toBe(columns[2]);
      expect(parsed.modelTier).toBe(columns[3]);

      const records = run(["--records", provider.id]);
      expect(records.status, records.stderr).toBe(0);
      const rows = records.stdout.split("\n").filter((line) => line.length > 0);
      const values = new Map<string, string[]>();
      for (const row of rows) {
        // Exactly one TAB per record, or the shell's `IFS=$'\t' read -r k v` silently
        // splits a value into a key nobody reads.
        expect(row.split("\t"), row).toHaveLength(2);
        const [key, value] = row.split("\t") as [string, string];
        expect(value).not.toMatch(/[\r\n]/u);
        values.set(key, [...(values.get(key) ?? []), value]);
      }
      expect(values.get("isolation")).toEqual([derivePlaytestIsolation(provider).isolation]);
      expect(values.get("isolation_reason")).toEqual([derivePlaytestIsolation(provider).reason]);
      expect(values.get("kind")).toEqual([provider.kind]);
      expect(values.get("model")).toEqual([columns[2]]);
      expect(values.get("launch_argv") ?? []).toEqual(provider.launch?.argv ?? []);
      expect(values.get("launch_executable")?.[0]).toBe(provider.launch?.executable);
      expect(values.get("launch_binary_override_env")?.[0]).toBe(
        provider.launch?.binaryOverrideEnv,
      );
      // Absent fields are omitted, never emitted empty: a shell reader must be able to
      // keep its own initialized default rather than be handed a blank.
      if (provider.capture === undefined) {
        expect(values.has("capture_reader_module")).toBe(false);
        expect(values.has("session_log_root_default")).toBe(false);
      } else {
        expect(values.get("capture_reader_module")).toEqual([provider.capture.readerModule]);
        expect(values.get("session_log_root_default")).toEqual([
          provider.capture.sessionLog.rootDefault,
        ]);
      }
    }
  }, 60_000);
});

describe("the runner acts on the derivation, not on the label stored in JSON", () => {
  const cleanGit = useCleanTrackedGitCheckout();

  /** Swap one tracked file in the temp checkout, run the body, put it back. */
  function withPatchedCheckoutFile(relativePath: string, contents: string, body: () => void): void {
    const target = join(cleanGit.path, relativePath);
    const original = readFileSync(target);
    try {
      writeFileSync(target, contents);
      body();
    } finally {
      writeFileSync(target, original);
    }
  }

  // These fixtures deliberately build INVALID registries — a reader module nobody wrote,
  // an over-claiming isolation label — so the shape is intentionally loose. It is narrow
  // enough to name `providers` (every mutation starts there) and open past that point,
  // which is exactly how much structure these tests actually rely on.
  type MutableProvider = {
    id: string;
    isolation?: string;
    capture?: { readerModule?: string; sessionId?: unknown; sessionLog?: unknown };
  };
  type MutableRegistry = { providers: MutableProvider[] };
  function registryWith(mutate: (registry: MutableRegistry) => void): string {
    const registry = JSON.parse(
      readFileSync(join(cleanGit.path, "blind-tester", "providers.json"), "utf8"),
    ) as MutableRegistry;
    mutate(registry);
    return `${JSON.stringify(registry, null, 2)}\n`;
  }

  function launch(args: string[]) {
    const result = spawnSync(process.execPath, ["blind-tester/blind-launch.mjs", ...args], {
      cwd: cleanGit.path,
      encoding: "utf8",
      env: { ...process.env },
      timeout: 30_000,
    });
    return `${result.status}\n${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
  }

  it("refuses a runner_enforced label whose reader is missing from THIS checkout", () => {
    // The worst failure available here, staged: the registry says the runner witnesses
    // codex, and the module that does the witnessing is gone. Nothing may proceed on the
    // stored word — the typed registry refuses to parse in that state, and the runner has
    // to refuse for the same reason rather than being the one component that shrugs.
    withPatchedCheckoutFile(
      join("blind-tester", "codex-rollout.mjs"),
      "// deliberately not a reader\n",
      () => {
        // A regular file that is not the reader is not enough on its own — the derivation
        // only asks whether the path is a file — so remove the entry's claim instead by
        // pointing it at a module nobody wrote, and leave the stored label over-claiming.
        withPatchedCheckoutFile(
          join("blind-tester", "providers.json"),
          registryWith((registry) => {
            const codex = registry.providers.find((p) => p.id === "codex");
            if (!codex?.capture) throw new Error("codex must declare a capture block");
            codex.capture.readerModule = "blind-tester/codex-rollout-that-nobody-wrote.mjs";
          }),
          () => {
            const output = launch(["--provider", "codex"]);
            expect(output.startsWith("2\n"), output).toBe(true);
            expect(output).toContain('declares isolation "runner_enforced"');
            expect(output).toContain('this checkout derives "operator_attested"');
            expect(output).toContain("codex-rollout-that-nobody-wrote.mjs");
            expect(output).not.toContain("Blind playtest →");
          },
        );
      },
    );
  }, 60_000);

  it("refuses a witnessable vendor this runner has no launch path for", () => {
    // The second gate, end to end. gemini_cli is given a capture block whose reader is a
    // real file, so the derivation legitimately returns runner_enforced — and the runner
    // must STILL refuse, because its live launch path drives the Codex reader and nothing
    // else. Without this the derived gate would open straight onto `codex exec --model
    // <a Gemini model>`.
    withPatchedCheckoutFile(
      join("blind-tester", "providers.json"),
      registryWith((registry) => {
        const gemini = registry.providers.find((p) => p.id === "gemini_cli");
        if (!gemini) throw new Error("gemini_cli must be registered");
        gemini.isolation = "runner_enforced";
        gemini.capture = {
          sessionId: { source: "runner_pinned", locator: "--session-id" },
          sessionLog: {
            rootDefault: "{HOME}/.gemini",
            pathTemplate: "sessions/{SESSION_ID}.jsonl",
          },
          readerModule: "blind-tester/telemetry.mjs",
        };
      }),
      () => {
        const output = launch(["--provider", "gemini_cli"]);
        expect(output.startsWith("2\n"), output).toBe(true);
        expect(output).toContain("no launch path written against that reader");
        expect(output).toContain("blind-tester/telemetry.mjs");
        expect(output).toContain("playtest:ingest");
        expect(output).not.toContain("Blind playtest →");
      },
    );
  }, 60_000);
});
