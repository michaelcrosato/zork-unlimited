import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error -- runner helper is intentionally plain ESM.
import * as codexRollout from "../../blind-tester/codex-rollout.mjs";

const {
  canonicalCodexHome,
  captureThreadBoundCodexRollout,
  parseCodexCliVersionOutput,
  publicCodexThreadId,
  resolveCodexClientBinary,
  validateCodexClientPreflight,
  validateOutputPrefix,
  validateWindowsOutputPrefixShape,
  verifyCodexClientBinary,
} = codexRollout;

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_THREAD_ID = "22222222-2222-4222-8222-222222222222";
const THIRD_THREAD_ID = "33333333-3333-4333-8333-333333333333";
const temporaryRoots: string[] = [];

function currentNativeExecutableFixture(): Buffer {
  if (process.platform === "win32") return Buffer.from("4d5a900000000000", "hex");
  if (process.platform === "linux") return Buffer.from("7f454c4602010100", "hex");
  if (process.platform === "darwin") return Buffer.from("feedfacf00000000", "hex");
  throw new Error(`unsupported native executable fixture platform ${process.platform}`);
}

it("rejects Windows output aliases that can bypass lexical containment", () => {
  for (const unsafePrefix of [
    "C:/Users/player/.codex:audit",
    "//?/C:/Users/player/.codex/report",
    "C:/Users/player/.codex./report",
    "C:/safe/NUL.txt",
  ]) {
    expect(() => validateWindowsOutputPrefixShape(unsafePrefix, "win32"), unsafePrefix).toThrow(
      /Windows/i,
    );
  }
  expect(validateWindowsOutputPrefixShape("C:/safe/reports/attempt", "win32")).toBe(
    "C:/safe/reports/attempt",
  );
});

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function providerEvents(threadId = THREAD_ID): string {
  return `${JSON.stringify({ type: "thread.started", thread_id: threadId })}\n${JSON.stringify({ type: "turn.started" })}\n`;
}

function cwdRollout(cwd: string, threadId = THREAD_ID): string {
  return `${JSON.stringify({ type: "session_meta", payload: { id: threadId, cwd } })}\n${JSON.stringify({ type: "turn_context", payload: { cwd } })}\n`;
}

function compactedCwdRollout(cwd: string, threadId = THREAD_ID): string {
  const initial = {
    timestamp: "2026-07-19T09:26:51.354Z",
    type: "turn_context",
    payload: { cwd },
  };
  const replay = { ...structuredClone(initial), timestamp: "2026-07-19T09:37:36.748Z" };
  return `${JSON.stringify({ type: "session_meta", payload: { id: threadId, cwd } })}\n${JSON.stringify(initial)}\n${JSON.stringify({ type: "compacted", payload: {} })}\n${JSON.stringify({ type: "world_state", payload: {} })}\n${JSON.stringify(replay)}\n`;
}

function rolloutName(threadId: string, stamp = "2026-07-23T12-00-00"): string {
  return `rollout-${stamp}-${threadId}.jsonl`;
}

function writeRollout(
  home: string,
  threadId: string,
  body: string,
  date = "2026/07/23",
  stamp = "2026-07-23T12-00-00",
): string {
  const directory = join(home, "sessions", ...date.split("/"));
  mkdirSync(directory, { recursive: true });
  const path = join(directory, rolloutName(threadId, stamp));
  writeFileSync(path, body);
  return path;
}

function capturePaths(root: string): {
  events: string;
  destination: string;
  receipt: string;
} {
  return {
    events: join(root, "run.codex.jsonl"),
    destination: join(root, "run.codex-rollout.jsonl"),
    receipt: join(root, "run.codex-capture.json"),
  };
}

function capture(home: string, paths: ReturnType<typeof capturePaths>, player: string): void {
  captureThreadBoundCodexRollout(home, paths.events, paths.destination, paths.receipt, player);
}

function alterSecondTurnContext(text: string): string {
  const rows = text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { type: string; payload: { cwd?: string } });
  const secondContext = rows.filter((row) => row.type === "turn_context")[1]!;
  secondContext.payload.cwd = "C:\\other\\player";
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

function alterSecondTurnContextEnvelope(text: string): string {
  const rows = text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const secondContext = rows.filter((row) => row.type === "turn_context")[1]!;
  secondContext.untrusted_marker = true;
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Codex executable preflight", () => {
  it("pins a linked executable to one canonical target and detects later replacement", () => {
    const root = temporaryRoot("af-codex-binary-authority-");
    const executable = join(root, "codex-real");
    const linkedExecutable = join(root, "codex-link");
    writeFileSync(executable, "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(executable, 0o755);
    symlinkSync(executable, linkedExecutable, "file");

    const authority = resolveCodexClientBinary(linkedExecutable, { allowTestScript: true });
    expect(authority.canonical_path).toBe(realpathSync.native(executable));
    expect(
      verifyCodexClientBinary(authority.canonical_path, authority.identity_token, {
        allowTestScript: true,
      }),
    ).toBe(authority.canonical_path);

    writeFileSync(executable, "#!/usr/bin/env bash\nprintf changed\n");
    expect(() =>
      verifyCodexClientBinary(authority.canonical_path, authority.identity_token, {
        allowTestScript: true,
      }),
    ).toThrow(/identity changed/i);
  });

  it("accepts exactly one semantic codex-cli version line", () => {
    expect(parseCodexCliVersionOutput("/opt/codex", "codex-cli 0.144.1\n")).toBe("0.144.1");
    expect(parseCodexCliVersionOutput("/opt/codex", "codex-cli 1.2.3-beta.1+build.7")).toBe(
      "1.2.3-beta.1+build.7",
    );
    for (const output of [
      "codex 0.144.1\n",
      "codex-cli v0.144.1\n",
      "codex-cli 01.2.3\n",
      "warning\ncodex-cli 0.144.1\n",
      "codex-cli 0.144.1\nwarning\n",
      "codex-cli 0.144.1\n\n",
    ]) {
      expect(
        () => parseCodexCliVersionOutput("/opt/codex", output),
        JSON.stringify(output),
      ).toThrow(/exactly one.*codex-cli <semver>/i);
    }
  });

  it("pins and bypasses the official npm shim's mutable JavaScript delegation chain", () => {
    const targets = {
      "linux:x64": ["codex-linux-x64", "x86_64-unknown-linux-musl", "codex"],
      "linux:arm64": ["codex-linux-arm64", "aarch64-unknown-linux-musl", "codex"],
      "darwin:x64": ["codex-darwin-x64", "x86_64-apple-darwin", "codex"],
      "darwin:arm64": ["codex-darwin-arm64", "aarch64-apple-darwin", "codex"],
      "win32:x64": ["codex-win32-x64", "x86_64-pc-windows-msvc", "codex.exe"],
      "win32:arm64": ["codex-win32-arm64", "aarch64-pc-windows-msvc", "codex.exe"],
    } as const;
    const target = targets[`${process.platform}:${process.arch}` as keyof typeof targets];
    if (!target) return;
    const [platformPackage, targetTriple, executableName] = target;
    const root = temporaryRoot("af-codex-npm-authority-");
    const shim = join(root, "codex");
    const packageRoot = join(root, "node_modules", "@openai", "codex");
    const manifest = join(packageRoot, "package.json");
    const entrypoint = join(packageRoot, "bin", "codex.js");
    const executable = join(
      packageRoot,
      "node_modules",
      "@openai",
      platformPackage,
      "vendor",
      targetTriple,
      "bin",
      executableName,
    );
    mkdirSync(join(packageRoot, "bin"), { recursive: true });
    mkdirSync(
      join(packageRoot, "node_modules", "@openai", platformPackage, "vendor", targetTriple, "bin"),
      { recursive: true },
    );
    writeFileSync(
      shim,
      `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")

case \`uname\` in
    *CYGWIN*|*MINGW*|*MSYS*)
        if command -v cygpath > /dev/null 2>&1; then
            basedir=\`cygpath -w "$basedir"\`
        fi
    ;;
esac

if [ -x "$basedir/node" ]; then
  exec "$basedir/node"  "$basedir/node_modules/@openai/codex/bin/codex.js" "$@"
${"else "}
  exec node  "$basedir/node_modules/@openai/codex/bin/codex.js" "$@"
fi
`,
    );
    chmodSync(shim, 0o755);
    writeFileSync(
      manifest,
      `${JSON.stringify({
        name: "@openai/codex",
        version: "0.144.1",
        bin: { codex: "bin/codex.js" },
        optionalDependencies: { [`@openai/${platformPackage}`]: "0.144.1" },
      })}\n`,
    );
    writeFileSync(entrypoint, "// must never be the launched fleet payload\n");
    writeFileSync(executable, currentNativeExecutableFixture());
    chmodSync(executable, 0o755);

    const authority = resolveCodexClientBinary(shim);
    expect(authority.launcher_kind).toBe("official_npm_shim");
    expect(authority.selected_binary).toBe(realpathSync.native(shim));
    expect(authority.executable_binary).toBe(realpathSync.native(executable));
    expect(authority.executable_binary).not.toBe(authority.selected_binary);
    expect(verifyCodexClientBinary(authority.selected_binary, authority.identity_token)).toBe(
      authority.executable_binary,
    );

    const fabricated = JSON.parse(
      Buffer.from(authority.identity_token, "base64url").toString("utf8"),
    ) as {
      package_manifest: { canonical_path: string };
    };
    fabricated.package_manifest.canonical_path = join(
      root,
      "foreign",
      "node_modules",
      "@openai",
      "codex",
      "package.json",
    );
    const fabricatedToken = Buffer.from(JSON.stringify(fabricated), "utf8").toString("base64url");
    expect(() => verifyCodexClientBinary(authority.selected_binary, fabricatedToken)).toThrow(
      /authority token is malformed/i,
    );

    writeFileSync(entrypoint, "// replaced JavaScript delegation\n");
    expect(() =>
      verifyCodexClientBinary(authority.selected_binary, authority.identity_token),
    ).toThrow(/entrypoint.*identity changed|client closure|launcher.*identity changed/i);
  });

  it("pins the original Unix npm symlink and its canonical package/native closure", () => {
    const targets = {
      "linux:x64": ["codex-linux-x64", "x86_64-unknown-linux-musl", "codex"],
      "linux:arm64": ["codex-linux-arm64", "aarch64-unknown-linux-musl", "codex"],
      "darwin:x64": ["codex-darwin-x64", "x86_64-apple-darwin", "codex"],
      "darwin:arm64": ["codex-darwin-arm64", "aarch64-apple-darwin", "codex"],
      "win32:x64": ["codex-win32-x64", "x86_64-pc-windows-msvc", "codex.exe"],
      "win32:arm64": ["codex-win32-arm64", "aarch64-pc-windows-msvc", "codex.exe"],
    } as const;
    const target = targets[`${process.platform}:${process.arch}` as keyof typeof targets];
    if (!target) return;
    const [platformPackage, targetTriple, executableName] = target;
    const root = temporaryRoot("af-codex-unix-npm-authority-");
    const prefix = join(root, "prefix");
    const launcherDirectory = join(prefix, "bin");
    const launcher = join(launcherDirectory, "codex");
    const packageRoot = join(prefix, "lib", "node_modules", "@openai", "codex");
    const entrypoint = join(packageRoot, "bin", "codex.js");
    const executable = join(
      packageRoot,
      "node_modules",
      "@openai",
      platformPackage,
      "vendor",
      targetTriple,
      "bin",
      executableName,
    );
    mkdirSync(launcherDirectory, { recursive: true });
    mkdirSync(join(packageRoot, "bin"), { recursive: true });
    mkdirSync(
      join(packageRoot, "node_modules", "@openai", platformPackage, "vendor", targetTriple, "bin"),
      { recursive: true },
    );
    writeFileSync(
      join(packageRoot, "package.json"),
      `${JSON.stringify({
        name: "@openai/codex",
        version: "0.144.1",
        bin: { codex: "bin/codex.js" },
        optionalDependencies: { [`@openai/${platformPackage}`]: "0.144.1" },
      })}\n`,
    );
    writeFileSync(entrypoint, "#!/usr/bin/env node\n// immutable delegation entrypoint\n");
    chmodSync(entrypoint, 0o755);
    writeFileSync(executable, currentNativeExecutableFixture());
    chmodSync(executable, 0o755);
    const linkTarget = relative(launcherDirectory, entrypoint);
    symlinkSync(linkTarget, launcher, "file");

    const authority = resolveCodexClientBinary(launcher);
    const decoded = JSON.parse(
      Buffer.from(authority.identity_token, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    expect(authority.launcher_kind).toBe("official_npm_shim");
    expect(authority.selected_binary).toBe(launcher);
    expect(authority.executable_binary).toBe(realpathSync.native(executable));
    expect(decoded).toMatchObject({
      schema_version: 2,
      selected_symlink: {
        path: launcher,
        link_target: linkTarget,
      },
    });
    expect(verifyCodexClientBinary(launcher, authority.identity_token)).toBe(
      authority.executable_binary,
    );

    rmSync(launcher);
    symlinkSync(linkTarget, launcher, "file");
    expect(() => verifyCodexClientBinary(launcher, authority.identity_token)).toThrow(
      /launcher.*identity changed|client closure|symlink/i,
    );
  });

  it("rejects foreign or malformed codex.js launchers and unsupported script downgrades", () => {
    const root = temporaryRoot("af-codex-script-downgrade-");
    const foreignEntrypoint = join(root, "node_modules", "@foreign", "codex", "bin", "codex.js");
    mkdirSync(join(root, "node_modules", "@foreign", "codex", "bin"), { recursive: true });
    writeFileSync(foreignEntrypoint, "#!/usr/bin/env node\n");
    chmodSync(foreignEntrypoint, 0o755);
    expect(() => resolveCodexClientBinary(foreignEntrypoint)).toThrow(
      /canonical @openai\/codex\/bin\/codex\.js package layout/i,
    );

    const malformedRoot = join(root, "node_modules", "@openai", "codex");
    const malformedEntrypoint = join(malformedRoot, "bin", "codex.js");
    mkdirSync(join(malformedRoot, "bin"), { recursive: true });
    writeFileSync(
      join(malformedRoot, "package.json"),
      '{"name":"not-codex","version":"0.144.1","bin":{"codex":"bin/codex.js"}}\n',
    );
    writeFileSync(malformedEntrypoint, "#!/usr/bin/env node\n");
    chmodSync(malformedEntrypoint, 0o755);
    expect(() => resolveCodexClientBinary(malformedEntrypoint)).toThrow(
      /manifest does not identify one exact Codex CLI package/i,
    );

    const unsupportedWrapper = join(root, "custom-client");
    writeFileSync(unsupportedWrapper, "#!/bin/sh\nexec node /tmp/foreign-codex.js\n");
    chmodSync(unsupportedWrapper, 0o755);
    expect(() => resolveCodexClientBinary(unsupportedWrapper)).toThrow(
      /not the supported exact npm shell launcher/i,
    );

    const foreignNative = join(root, "foreign-native-format");
    writeFileSync(
      foreignNative,
      process.platform === "win32"
        ? Buffer.from("7f454c4602010100", "hex")
        : Buffer.from("4d5a900000000000", "hex"),
    );
    chmodSync(foreignNative, 0o755);
    expect(() => resolveCodexClientBinary(foreignNative)).toThrow(
      /not the supported exact npm shell launcher/i,
    );

    const oversizedWrapper = join(root, "codex");
    writeFileSync(oversizedWrapper, `#!/bin/sh\n${"x".repeat(9 * 1024)}\n`);
    chmodSync(oversizedWrapper, 0o755);
    expect(() => resolveCodexClientBinary(oversizedWrapper)).toThrow(
      /exceeds the 8192-byte read ceiling/i,
    );
  });

  it("validates only the selected executable version", () => {
    expect(validateCodexClientPreflight("/opt/codex", "codex-cli 0.144.1\n")).toEqual({
      selected_binary: "/opt/codex",
      cli_version: "0.144.1",
    });
    expect(() =>
      validateCodexClientPreflight("/opt/codex", "codex-cli 0.144.1\n", "0.145.0"),
    ).toThrow(/native payload reports 0\.144\.1.*declares 0\.145\.0/i);
  });
});

describe("thread-bound Codex rollout capture", () => {
  it("canonicalizes relative and linked Codex homes before capture", () => {
    const root = temporaryRoot("af-codex-linked-home-");
    const home = join(root, "real-home");
    const linkedHome = join(root, "linked-home");
    const player = join(root, "player");
    const paths = capturePaths(root);
    mkdirSync(home);
    mkdirSync(player);
    writeFileSync(paths.events, providerEvents());
    writeRollout(home, THREAD_ID, cwdRollout(player));
    symlinkSync(home, linkedHome, "junction");

    expect(canonicalCodexHome(relative(process.cwd(), linkedHome))).toBe(realpathSync.native(home));
    capture(linkedHome, paths, player);
    expect(readFileSync(paths.destination, "utf8")).toBe(cwdRollout(player));
  });

  it("selects only the public thread from a shared home with concurrent rollouts", () => {
    const root = temporaryRoot("af-codex-thread-capture-");
    const home = join(root, "existing-home");
    const player = join(root, "player");
    const paths = capturePaths(root);
    mkdirSync(home);
    mkdirSync(player);
    writeFileSync(paths.events, providerEvents());

    writeRollout(home, OTHER_THREAD_ID, "unrelated private bytes\n", "2026/07/22");
    writeRollout(home, THIRD_THREAD_ID, "{not-json\n", "2026/07/23", "2026-07-23T11-00-00");
    const expected = cwdRollout(player);
    writeRollout(home, THREAD_ID, expected);

    capture(home, paths, player);

    expect(readFileSync(paths.destination, "utf8")).toBe(expected);
    const receipt = JSON.parse(readFileSync(paths.receipt, "utf8")) as Record<string, unknown>;
    expect(receipt).toEqual({
      schema_version: 3,
      binding: "runner_work_player",
      code_mode_contract: "strict-code-mode-v2",
      recorded_session_cwd: player,
      recorded_turn_cwd: player,
      canonical_expected_cwd: expect.any(String),
      canonical_session_cwd: expect.any(String),
      canonical_turn_cwd: expect.any(String),
      expected_directory_identity: expect.objectContaining({
        device_id: expect.stringMatching(/^\d+$/),
        file_id: expect.stringMatching(/^\d+$/),
      }),
      session_directory_identity: expect.objectContaining({
        device_id: expect.stringMatching(/^\d+$/),
        file_id: expect.stringMatching(/^\d+$/),
      }),
      turn_directory_identity: expect.objectContaining({
        device_id: expect.stringMatching(/^\d+$/),
        file_id: expect.stringMatching(/^\d+$/),
      }),
      copied_rollout_sha256: createHash("sha256").update(expected).digest("hex"),
    });
    expect(receipt.canonical_expected_cwd).toBe(receipt.canonical_session_cwd);
    expect(receipt.canonical_expected_cwd).toBe(receipt.canonical_turn_cwd);
    expect(receipt.expected_directory_identity).toEqual(receipt.session_directory_identity);
    expect(receipt.expected_directory_identity).toEqual(receipt.turn_directory_identity);
    expect(() => capture(home, paths, player)).toThrow(/EEXIST/i);
  });

  it("requires exactly one valid leading public thread identity", () => {
    const root = temporaryRoot("af-codex-public-thread-");
    const events = join(root, "events.jsonl");
    const invalid = [
      providerEvents("not-a-thread"),
      `${JSON.stringify({ type: "turn.started" })}\n`,
      `${providerEvents()}${JSON.stringify({ type: "thread.started", thread_id: THREAD_ID })}\n`,
      `${JSON.stringify({ type: "turn.started" })}\n${JSON.stringify({ type: "thread.started", thread_id: THREAD_ID })}\n`,
      "{not-json\n",
    ];
    for (const body of invalid) {
      writeFileSync(events, body);
      expect(() => publicCodexThreadId(events)).toThrow(/thread|JSONL/i);
    }

    writeFileSync(events, providerEvents());
    expect(publicCodexThreadId(events)).toBe(THREAD_ID);
  });

  it("rejects missing, duplicate, or session-mismatched matching rollouts without publication", () => {
    for (const scenario of ["missing", "duplicate", "mismatched"] as const) {
      const root = temporaryRoot(`af-codex-${scenario}-`);
      const home = join(root, "home");
      const player = join(root, "player");
      const paths = capturePaths(root);
      mkdirSync(home);
      mkdirSync(player);
      writeFileSync(paths.events, providerEvents());

      if (scenario === "duplicate") {
        writeRollout(home, THREAD_ID, cwdRollout(player), "2026/07/22");
        writeRollout(home, THREAD_ID, cwdRollout(player), "2026/07/23", "2026-07-23T13-00-00");
      } else if (scenario === "mismatched") {
        writeRollout(home, THREAD_ID, cwdRollout(player, OTHER_THREAD_ID));
      } else {
        writeRollout(home, OTHER_THREAD_ID, cwdRollout(player, OTHER_THREAD_ID));
      }

      expect(() => capture(home, paths, player)).toThrow(
        scenario === "mismatched" ? /session id differs/i : /exactly one rollout/i,
      );
      expect(existsSync(paths.destination)).toBe(false);
      expect(existsSync(paths.receipt)).toBe(false);
    }
  });

  it("accepts only an exact compacted replay of the initial turn context", () => {
    const validRoot = temporaryRoot("af-codex-valid-compaction-");
    const validHome = join(validRoot, "home");
    const validPlayer = join(validRoot, "player");
    const validPaths = capturePaths(validRoot);
    mkdirSync(validHome);
    mkdirSync(validPlayer);
    writeFileSync(validPaths.events, providerEvents());
    writeRollout(validHome, THREAD_ID, compactedCwdRollout(validPlayer));
    capture(validHome, validPaths, validPlayer);

    for (const [label, mutate] of [
      [
        "missing compaction",
        (text: string) => text.replace('{"type":"compacted","payload":{}}\n', ""),
      ],
      ["altered context", alterSecondTurnContext],
      ["altered context envelope", alterSecondTurnContextEnvelope],
      [
        "post-completion replay",
        (text: string) =>
          text.replace(
            '{"type":"compacted"',
            '{"type":"event_msg","payload":{"type":"task_complete"}}\n{"type":"compacted"',
          ),
      ],
    ] as const) {
      const root = temporaryRoot(`af-codex-${label.replaceAll(" ", "-")}-`);
      const home = join(root, "home");
      const player = join(root, "player");
      const paths = capturePaths(root);
      mkdirSync(home);
      mkdirSync(player);
      writeFileSync(paths.events, providerEvents());
      writeRollout(home, THREAD_ID, mutate(compactedCwdRollout(player)));

      expect(() => capture(home, paths, player)).toThrow(/exact compacted duplicate/i);
      expect(existsSync(paths.destination)).toBe(false);
      expect(existsSync(paths.receipt)).toBe(false);
    }
  });

  it("rejects a matching linked rollout while ignoring unrelated session links", () => {
    const root = temporaryRoot("af-codex-linked-rollout-");
    const home = join(root, "home");
    const player = join(root, "player");
    const paths = capturePaths(root);
    mkdirSync(home);
    mkdirSync(player);
    writeFileSync(paths.events, providerEvents());
    const matching = writeRollout(home, THREAD_ID, cwdRollout(player));
    const unrelatedExternal = join(root, "unrelated-external");
    mkdirSync(unrelatedExternal);
    symlinkSync(unrelatedExternal, join(home, "sessions", "unrelated-link"), "junction");
    linkSync(matching, join(root, "reused-rollout.jsonl"));

    expect(() => capture(home, paths, player)).toThrow(/hard-linked/i);
    expect(existsSync(paths.destination)).toBe(false);
    expect(existsSync(paths.receipt)).toBe(false);
  });

  it("rejects a rollout recorded outside the isolated player cwd", () => {
    const root = temporaryRoot("af-codex-cwd-");
    const home = join(root, "home");
    const player = join(root, "player");
    const paths = capturePaths(root);
    mkdirSync(home);
    mkdirSync(player);
    writeFileSync(paths.events, providerEvents());
    writeRollout(home, THREAD_ID, cwdRollout(process.cwd()));

    expect(() => capture(home, paths, player)).toThrow(/does not equal the isolated player cwd/i);
    expect(existsSync(paths.destination)).toBe(false);
    expect(existsSync(paths.receipt)).toBe(false);
  });

  it("rejects output prefixes inside the shared Codex home or a linked alias", () => {
    const root = temporaryRoot("af-codex-publication-boundary-");
    const home = join(root, "home");
    const player = join(root, "player");
    const paths = capturePaths(root);
    const linkedHome = join(root, "linked-home");
    mkdirSync(home);
    mkdirSync(player);
    writeFileSync(paths.events, providerEvents());
    writeRollout(home, THREAD_ID, cwdRollout(player));
    symlinkSync(home, linkedHome, "junction");

    expect(() => validateOutputPrefix(home, join(home, "new", "attempt"), root)).toThrow(
      /outside the Codex home/i,
    );
    expect(() => validateOutputPrefix(home, join(linkedHome, "new", "attempt"), root)).toThrow(
      /outside the Codex home/i,
    );
    const portableHome = home.replaceAll("\\", "/");
    for (const unsafePrefix of [
      home,
      `${portableHome}/`,
      `${portableHome}/.`,
      `${portableHome}/scratch/../..`,
    ]) {
      expect(() => validateOutputPrefix(home, unsafePrefix, root), unsafePrefix).toThrow(
        /outside the Codex home|must name a file prefix/i,
      );
    }
    expect(() =>
      capture(home, { ...paths, destination: join(home, "captured.jsonl") }, player),
    ).toThrow(/outside the Codex home/i);
    expect(() =>
      capture(home, { ...paths, destination: join(linkedHome, "captured.jsonl") }, player),
    ).toThrow(/outside the Codex home/i);
    expect(existsSync(join(home, "captured.jsonl"))).toBe(false);
    expect(existsSync(paths.receipt)).toBe(false);
  });

  it("allows a safely linked output directory and publishes to its canonical target", () => {
    const root = temporaryRoot("af-codex-linked-output-");
    const home = join(root, "home");
    const player = join(root, "player");
    const externalOutput = join(root, "external-output");
    const linkedOutput = join(root, "linked-output");
    const paths = capturePaths(root);
    mkdirSync(home);
    mkdirSync(player);
    mkdirSync(externalOutput);
    writeFileSync(paths.events, providerEvents());
    writeRollout(home, THREAD_ID, cwdRollout(player));
    symlinkSync(externalOutput, linkedOutput, "junction");

    expect(validateOutputPrefix(home, join(linkedOutput, "new", "attempt"), root)).toBe(
      join(realpathSync.native(externalOutput), "new", "attempt"),
    );
    capture(
      home,
      {
        ...paths,
        destination: join(linkedOutput, "captured.jsonl"),
        receipt: join(linkedOutput, "capture.json"),
      },
      player,
    );
    expect(readFileSync(join(externalOutput, "captured.jsonl"), "utf8")).toBe(cwdRollout(player));
    expect(existsSync(join(externalOutput, "capture.json"))).toBe(true);
  });

  it("rejects a linked sessions root before inspecting provider output", () => {
    const root = temporaryRoot("af-codex-linked-sessions-");
    const home = join(root, "home");
    const player = join(root, "player");
    const externalSessions = join(root, "external-sessions");
    const paths = capturePaths(root);
    mkdirSync(home);
    mkdirSync(player);
    mkdirSync(externalSessions);
    writeFileSync(paths.events, providerEvents());
    writeFileSync(join(externalSessions, rolloutName(THREAD_ID)), cwdRollout(player));
    symlinkSync(externalSessions, join(home, "sessions"), "junction");

    expect(() => capture(home, paths, player)).toThrow(/sessions root must be one real directory/i);
    expect(existsSync(paths.destination)).toBe(false);
    expect(existsSync(paths.receipt)).toBe(false);
  });
});
