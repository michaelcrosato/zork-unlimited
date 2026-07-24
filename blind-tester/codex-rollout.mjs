#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readlinkSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseJsonRejectingDuplicateKeys } from "./strict-json.mjs";

const THREAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SEMVER_RE =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const CODEX_CLIENT_AUTHORITY_SCHEMA_VERSION = 2;
const NPM_SHIM_MAX_BYTES = 8 * 1024;
const NPM_PACKAGE_MANIFEST_MAX_BYTES = 128 * 1024;
const NPM_CODEX_ENTRYPOINT_MAX_BYTES = 128 * 1024;
const NPM_PLATFORM_TARGETS = Object.freeze({
  "linux:x64": {
    package: "codex-linux-x64",
    target: "x86_64-unknown-linux-musl",
    executable: "codex",
  },
  "linux:arm64": {
    package: "codex-linux-arm64",
    target: "aarch64-unknown-linux-musl",
    executable: "codex",
  },
  "darwin:x64": {
    package: "codex-darwin-x64",
    target: "x86_64-apple-darwin",
    executable: "codex",
  },
  "darwin:arm64": {
    package: "codex-darwin-arm64",
    target: "aarch64-apple-darwin",
    executable: "codex",
  },
  "win32:x64": {
    package: "codex-win32-x64",
    target: "x86_64-pc-windows-msvc",
    executable: "codex.exe",
  },
  "win32:arm64": {
    package: "codex-win32-arm64",
    target: "aarch64-pc-windows-msvc",
    executable: "codex.exe",
  },
});
const OFFICIAL_NPM_SHELL_SHIM = [
  "#!/bin/sh",
  'basedir=$(dirname "$(echo "$0" | sed -e \'s,\\\\,/,g\')")',
  "",
  "case `uname` in",
  "    *CYGWIN*|*MINGW*|*MSYS*)",
  "        if command -v cygpath > /dev/null 2>&1; then",
  '            basedir=`cygpath -w "$basedir"`',
  "        fi",
  "    ;;",
  "esac",
  "",
  'if [ -x "$basedir/node" ]; then',
  '  exec "$basedir/node"  "$basedir/node_modules/@openai/codex/bin/codex.js" "$@"',
  "else ",
  '  exec node  "$basedir/node_modules/@openai/codex/bin/codex.js" "$@"',
  "fi",
  "",
].join("\n");

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(message);
}

function requirePrivateRegularFile(path, label) {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) {
    fail(`${label} must be one private regular non-linked file`);
  }
}

function readStablePrivateFile(path, label, { maxBytes } = {}) {
  const linked = lstatSync(path, { bigint: true });
  if (linked.isSymbolicLink() || !linked.isFile() || linked.nlink !== 1n) {
    fail(`${label} must be one private regular non-linked file`);
  }
  const maximum = maxBytes === undefined ? null : BigInt(maxBytes);
  if (maximum !== null && linked.size > maximum) {
    fail(`${label} exceeds the ${maxBytes}-byte read ceiling`);
  }
  const descriptor = openSync(path, "r");
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      linked.dev !== before.dev ||
      linked.ino !== before.ino ||
      linked.size !== before.size ||
      linked.mtimeNs !== before.mtimeNs ||
      linked.ctimeNs !== before.ctimeNs
    ) {
      fail(`${label} must remain one private regular non-linked file`);
    }
    if (maximum !== null && before.size > maximum) {
      fail(`${label} exceeds the ${maxBytes}-byte read ceiling`);
    }
    let bytes;
    if (maximum === null) {
      bytes = readFileSync(descriptor);
    } else {
      bytes = Buffer.alloc(Number(before.size));
      let offset = 0;
      while (offset < bytes.byteLength) {
        const count = readSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
        if (count === 0) fail(`${label} changed while it was being captured`);
        offset += count;
      }
      const overflowProbe = Buffer.allocUnsafe(1);
      if (readSync(descriptor, overflowProbe, 0, 1, offset) !== 0) {
        fail(`${label} changed or exceeded its read ceiling while it was being captured`);
      }
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (
      after.nlink !== 1n ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      BigInt(bytes.byteLength) !== after.size ||
      (maximum !== null && after.size > maximum)
    ) {
      fail(`${label} changed while it was being captured`);
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function selectedBinaryLabel(selectedBinary) {
  return JSON.stringify(selectedBinary);
}

function preflightFailure(selectedBinary, detail) {
  fail(
    `Codex client preflight failed for selected binary ${selectedBinaryLabel(selectedBinary)}: ${detail} ` +
      "Set BLIND_CODEX_BIN to the one intended Codex executable path; the runner will not retry, fall back, or substitute another provider.",
  );
}

function validateWindowsClientBinaryPathShape(path, platform = process.platform) {
  if (platform !== "win32") return;
  const portable = path.replaceAll("\\", "/");
  if (/^\/\/[?.]\//u.test(portable)) {
    fail("Codex client executable must not use a Windows device namespace");
  }
  const withoutDrive = /^[A-Za-z]:/u.test(portable) ? portable.slice(2) : portable;
  if (withoutDrive.includes(":")) {
    fail("Codex client executable must not name a Windows alternate data stream");
  }
  for (const segment of withoutDrive.split("/")) {
    if (!segment) continue;
    if (/[. ]$/u.test(segment)) {
      fail("Codex client executable must not contain Windows-trimmed path segments");
    }
    const deviceBase = segment.split(".", 1)[0]?.toUpperCase() ?? "";
    if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/u.test(deviceBase)) {
      fail("Codex client executable must not contain a reserved Windows device name");
    }
  }
}

function authorityIdentity(metadata) {
  return {
    device_id: metadata.dev.toString(10),
    file_id: metadata.ino.toString(10),
    size: metadata.size.toString(10),
    mtime_ns: metadata.mtimeNs.toString(10),
    ctime_ns: metadata.ctimeNs.toString(10),
  };
}

function stableRegularFileAuthority(path, label, { executable = false } = {}) {
  validateWindowsClientBinaryPathShape(path);
  const requested = resolve(path);
  const requestedMetadata = lstatSync(requested);
  if (!requestedMetadata.isFile() && !requestedMetadata.isSymbolicLink()) {
    fail(`${label} must resolve from one file`);
  }
  const canonicalPath = realpathSync.native(requested);
  if (/[\r\n]/u.test(canonicalPath)) {
    fail(`${label} canonical path must occupy one line`);
  }
  validateWindowsClientBinaryPathShape(canonicalPath);
  const linked = lstatSync(canonicalPath, { bigint: true });
  if (linked.isSymbolicLink() || !linked.isFile() || linked.nlink !== 1n) {
    fail(`${label} target must be one regular non-linked file`);
  }
  if (executable) {
    accessSync(canonicalPath, constants.X_OK);
  }
  const descriptor = openSync(canonicalPath, "r");
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      !opened.isFile() ||
      opened.nlink !== 1n ||
      linked.dev !== opened.dev ||
      linked.ino !== opened.ino ||
      linked.size !== opened.size ||
      linked.mtimeNs !== opened.mtimeNs ||
      linked.ctimeNs !== opened.ctimeNs
    ) {
      fail(`${label} changed while its identity was captured`);
    }
    return {
      canonical_path: canonicalPath,
      identity: authorityIdentity(opened),
    };
  } finally {
    closeSync(descriptor);
  }
}

function stableExecutableAuthority(path, label = "selected Codex client executable") {
  return stableRegularFileAuthority(path, label, { executable: true });
}

function readStableFilePrefix(authority, label, maximumBytes) {
  const descriptor = openSync(authority.canonical_path, "r");
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      !isDeepStrictEqual(authorityIdentity(before), authority.identity)
    ) {
      fail(`${label} changed before its format was classified`);
    }
    const length = Number(before.size < BigInt(maximumBytes) ? before.size : maximumBytes);
    const bytes = Buffer.alloc(length);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = readSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
      if (count === 0) fail(`${label} changed while its format was classified`);
      offset += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (!isDeepStrictEqual(authorityIdentity(after), authority.identity)) {
      fail(`${label} changed while its format was classified`);
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function stableSymbolicLinkAuthority(path, label = "selected Codex client symlink") {
  validateWindowsClientBinaryPathShape(path);
  const selectedPath = resolve(path);
  if (/[\r\n]/u.test(selectedPath)) {
    fail(`${label} path must occupy one line`);
  }
  const before = lstatSync(selectedPath, { bigint: true });
  if (!before.isSymbolicLink() || before.nlink !== 1n) {
    fail(`${label} must remain one symbolic link`);
  }
  const linkTarget = readlinkSync(selectedPath);
  if (linkTarget.length === 0 || /[\r\n]/u.test(linkTarget)) {
    fail(`${label} target must occupy one non-empty line`);
  }
  realpathSync.native(selectedPath);
  const after = lstatSync(selectedPath, { bigint: true });
  if (
    !after.isSymbolicLink() ||
    after.nlink !== 1n ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeNs !== after.mtimeNs ||
    before.ctimeNs !== after.ctimeNs ||
    readlinkSync(selectedPath) !== linkTarget
  ) {
    fail(`${label} changed while its identity was captured`);
  }
  return {
    path: selectedPath,
    link_target: linkTarget,
    identity: authorityIdentity(after),
  };
}

function selectedSymbolicLinkAuthority(path) {
  const selectedPath = resolve(path);
  return lstatSync(selectedPath).isSymbolicLink()
    ? stableSymbolicLinkAuthority(selectedPath)
    : null;
}

function exactIdentity(value) {
  const keys =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value).sort()
      : [];
  return (
    isDeepStrictEqual(keys, ["ctime_ns", "device_id", "file_id", "mtime_ns", "size"]) &&
    keys.every((key) => typeof value[key] === "string" && /^[0-9]+$/u.test(value[key]))
  );
}

function exactAuthoritySymlink(value) {
  const keys =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value).sort()
      : [];
  return (
    isDeepStrictEqual(keys, ["identity", "link_target", "path"]) &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    !/[\r\n]/u.test(value.path) &&
    typeof value.link_target === "string" &&
    value.link_target.length > 0 &&
    !/[\r\n]/u.test(value.link_target) &&
    exactIdentity(value.identity)
  );
}

function exactAuthorityFile(value) {
  const keys =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value).sort()
      : [];
  return (
    isDeepStrictEqual(keys, ["canonical_path", "identity"]) &&
    typeof value.canonical_path === "string" &&
    value.canonical_path.length > 0 &&
    !/[\r\n]/u.test(value.canonical_path) &&
    exactIdentity(value.identity)
  );
}

function portableClientPath(path) {
  return path.replaceAll("\\", "/").replace(/\/+$/u, "");
}

function exactOfficialNpmAuthorityLayout(authority) {
  const selected = portableClientPath(authority.selected.canonical_path);
  const manifest = portableClientPath(authority.package_manifest.canonical_path);
  const entrypoint = portableClientPath(authority.javascript_entrypoint.canonical_path);
  const manifestSuffix = "/package.json";
  if (!manifest.endsWith(manifestSuffix)) return false;
  const packageRoot = manifest.slice(0, -manifestSuffix.length);
  if (
    !packageRoot.endsWith("/node_modules/@openai/codex") ||
    entrypoint !== `${packageRoot}/bin/codex.js`
  ) {
    return false;
  }
  if (authority.selected_symlink === null) {
    const shellSuffix = "/codex";
    return (
      selected === entrypoint ||
      (selected.endsWith(shellSuffix) &&
        packageRoot === `${selected.slice(0, -shellSuffix.length)}/node_modules/@openai/codex`)
    );
  }
  const linkPath = portableClientPath(authority.selected_symlink.path);
  const linkTarget = portableClientPath(authority.selected_symlink.link_target);
  const globalSuffix = "/bin/codex";
  const localSuffix = "/.bin/codex";
  const globalLayout =
    linkPath.endsWith(globalSuffix) &&
    packageRoot === `${linkPath.slice(0, -globalSuffix.length)}/lib/node_modules/@openai/codex`;
  const localLayout =
    linkPath.endsWith(localSuffix) &&
    packageRoot === `${linkPath.slice(0, -localSuffix.length)}/@openai/codex`;
  return (
    selected === entrypoint &&
    (globalLayout || localLayout) &&
    linkTarget.endsWith("/@openai/codex/bin/codex.js")
  );
}

function encodeClientAuthority(authority) {
  return Buffer.from(JSON.stringify(authority), "utf8").toString("base64url");
}

function decodeClientAuthority(token) {
  if (typeof token !== "string" || token.length > 65_536 || !/^[0-9A-Za-z_-]+$/u.test(token)) {
    fail("Codex client authority token is malformed");
  }
  let parsed;
  try {
    const bytes = Buffer.from(token, "base64url");
    if (bytes.toString("base64url") !== token) throw new Error("non-canonical base64url");
    const decoded = parseJsonRejectingDuplicateKeys(
      bytes.toString("utf8"),
      "Codex client authority token",
    );
    if (!decoded.ok) throw new Error(decoded.reason);
    parsed = decoded.value;
  } catch {
    fail("Codex client authority token is malformed");
  }
  const keys =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.keys(parsed).sort()
      : [];
  if (
    !isDeepStrictEqual(keys, [
      "declared_cli_version",
      "executable",
      "javascript_entrypoint",
      "launcher_kind",
      "package_manifest",
      "schema_version",
      "selected",
      "selected_symlink",
      "test_script",
    ]) ||
    parsed.schema_version !== CODEX_CLIENT_AUTHORITY_SCHEMA_VERSION ||
    !["direct", "official_npm_shim"].includes(parsed.launcher_kind) ||
    !exactAuthorityFile(parsed.selected) ||
    (parsed.selected_symlink !== null && !exactAuthoritySymlink(parsed.selected_symlink)) ||
    typeof parsed.test_script !== "boolean" ||
    !exactAuthorityFile(parsed.executable) ||
    (parsed.package_manifest !== null && !exactAuthorityFile(parsed.package_manifest)) ||
    (parsed.javascript_entrypoint !== null && !exactAuthorityFile(parsed.javascript_entrypoint)) ||
    (parsed.declared_cli_version !== null &&
      (typeof parsed.declared_cli_version !== "string" ||
        !SEMVER_RE.test(parsed.declared_cli_version))) ||
    (parsed.launcher_kind === "direct" &&
      (parsed.package_manifest !== null ||
        parsed.javascript_entrypoint !== null ||
        parsed.declared_cli_version !== null ||
        !isDeepStrictEqual(parsed.selected, parsed.executable))) ||
    (parsed.launcher_kind === "official_npm_shim" &&
      (parsed.package_manifest === null ||
        parsed.javascript_entrypoint === null ||
        parsed.declared_cli_version === null ||
        parsed.test_script ||
        !exactOfficialNpmAuthorityLayout(parsed)))
  ) {
    fail("Codex client authority token is malformed");
  }
  return parsed;
}

function isNativeExecutable(selected) {
  const prefix = readStableFilePrefix(selected, "selected Codex client executable", 8);
  const hexadecimal = prefix.toString("hex");
  if (process.platform === "win32") return hexadecimal.startsWith("4d5a");
  if (process.platform === "linux") return hexadecimal.startsWith("7f454c46");
  if (process.platform === "darwin") {
    return [
      "feedface",
      "feedfacf",
      "cefaedfe",
      "cffaedfe",
      "cafebabe",
      "bebafeca",
      "cafebabf",
      "bfbafeca",
    ].some((magic) => hexadecimal.startsWith(magic));
  }
  return false;
}

function officialNpmEntrypointPackageRoot(selected) {
  if (basename(selected.canonical_path) !== "codex.js") return null;
  const binDirectory = dirname(selected.canonical_path);
  const packageRoot = dirname(binDirectory);
  const scopeRoot = dirname(packageRoot);
  const nodeModulesRoot = dirname(scopeRoot);
  if (
    basename(binDirectory) !== "bin" ||
    basename(packageRoot) !== "codex" ||
    basename(scopeRoot) !== "@openai" ||
    basename(nodeModulesRoot) !== "node_modules" ||
    realpathSync.native(join(packageRoot, "bin", "codex.js")) !== selected.canonical_path
  ) {
    fail(
      "selected Codex JavaScript entrypoint is not the canonical @openai/codex/bin/codex.js package layout",
    );
  }
  return packageRoot;
}

function validateOfficialNpmSymlinkLayout(selectedSymlink, packageRoot) {
  if (selectedSymlink === null) return;
  if (basename(selectedSymlink.path) !== "codex") {
    fail("selected Codex npm symlink must be the exact `codex` launcher name");
  }
  const launcherDirectory = dirname(selectedSymlink.path);
  const supportedPackageRoots = [];
  if (basename(launcherDirectory) === "bin") {
    supportedPackageRoots.push(
      join(dirname(launcherDirectory), "lib", "node_modules", "@openai", "codex"),
    );
  }
  if (
    basename(launcherDirectory) === ".bin" &&
    basename(dirname(launcherDirectory)) === "node_modules"
  ) {
    supportedPackageRoots.push(join(dirname(launcherDirectory), "@openai", "codex"));
  }
  const canonicalPackageRoot = realpathSync.native(packageRoot);
  if (
    !supportedPackageRoots.some(
      (candidate) =>
        existsSync(candidate) && realpathSync.native(candidate) === canonicalPackageRoot,
    )
  ) {
    fail(
      "selected Codex npm symlink must use the supported prefix/bin or node_modules/.bin package layout",
    );
  }
}

function officialNpmShimPackageRoot(selected) {
  if (basename(selected.canonical_path) !== "codex") {
    fail("selected Codex script is not the supported exact npm shell launcher");
  }
  const normalized = readStablePrivateFile(selected.canonical_path, "selected Codex npm launcher", {
    maxBytes: NPM_SHIM_MAX_BYTES,
  })
    .toString("utf8")
    .replaceAll("\r\n", "\n");
  if (normalized !== OFFICIAL_NPM_SHELL_SHIM) {
    fail("selected Codex npm launcher does not match the supported immutable closure shape");
  }
  return join(dirname(selected.canonical_path), "node_modules", "@openai", "codex");
}

function isExplicitTestScript(selected, allowTestScript) {
  if (!allowTestScript) return false;
  if (process.env.NODE_ENV !== "test") {
    fail("the Codex script-client seam is available only under NODE_ENV=test");
  }
  const temporaryRoot = realpathSync.native(tmpdir());
  if (!isContainedPath(selected.canonical_path, temporaryRoot)) {
    fail("the Codex script-client seam is restricted to the operating-system temp directory");
  }
  return readStableFilePrefix(selected, "selected Codex test script", 2).toString("utf8") === "#!";
}

function captureOfficialNpmAuthority(selected, selectedSymlink, packageRoot) {
  const manifest = stableRegularFileAuthority(
    join(packageRoot, "package.json"),
    "selected Codex npm package manifest",
  );
  const manifestBytes = readStablePrivateFile(
    manifest.canonical_path,
    "selected Codex npm package manifest",
    { maxBytes: NPM_PACKAGE_MANIFEST_MAX_BYTES },
  );
  let packageJson;
  const parsedManifest = parseJsonRejectingDuplicateKeys(
    manifestBytes.toString("utf8"),
    "selected Codex npm package manifest",
  );
  if (!parsedManifest.ok) {
    fail("selected Codex npm package manifest must contain valid JSON");
  }
  packageJson = parsedManifest.value;
  if (
    packageJson === null ||
    typeof packageJson !== "object" ||
    Array.isArray(packageJson) ||
    packageJson.name !== "@openai/codex" ||
    typeof packageJson.version !== "string" ||
    !SEMVER_RE.test(packageJson.version) ||
    packageJson.bin?.codex !== "bin/codex.js"
  ) {
    fail("selected Codex npm package manifest does not identify one exact Codex CLI package");
  }
  const entrypoint = stableRegularFileAuthority(
    join(packageRoot, "bin", "codex.js"),
    "selected Codex npm JavaScript entrypoint",
  );
  readStablePrivateFile(entrypoint.canonical_path, "selected Codex npm JavaScript entrypoint", {
    maxBytes: NPM_CODEX_ENTRYPOINT_MAX_BYTES,
  });
  const platformTarget = NPM_PLATFORM_TARGETS[`${process.platform}:${process.arch}`];
  if (!platformTarget) {
    fail(`selected Codex npm package does not support ${process.platform}/${process.arch}`);
  }
  const optionalPackageName = `@openai/${platformTarget.package}`;
  if (packageJson.optionalDependencies?.[optionalPackageName] === undefined) {
    fail(`selected Codex npm package does not declare ${optionalPackageName}`);
  }
  const candidates = [
    join(
      packageRoot,
      "node_modules",
      "@openai",
      platformTarget.package,
      "vendor",
      platformTarget.target,
      "bin",
      platformTarget.executable,
    ),
    join(
      dirname(packageRoot),
      platformTarget.package,
      "vendor",
      platformTarget.target,
      "bin",
      platformTarget.executable,
    ),
    join(packageRoot, "vendor", platformTarget.target, "bin", platformTarget.executable),
  ];
  const executables = new Map();
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const authority = stableExecutableAuthority(candidate, "selected Codex native payload");
    executables.set(authority.canonical_path, authority);
  }
  if (executables.size !== 1) {
    fail("selected Codex npm package must resolve exactly one native payload");
  }
  const [executable] = executables.values();
  if (!isNativeExecutable(executable)) {
    fail("selected Codex npm package payload must be one native executable");
  }
  return {
    schema_version: CODEX_CLIENT_AUTHORITY_SCHEMA_VERSION,
    launcher_kind: "official_npm_shim",
    selected,
    selected_symlink: selectedSymlink,
    package_manifest: manifest,
    javascript_entrypoint: entrypoint,
    executable,
    declared_cli_version: packageJson.version,
    test_script: false,
  };
}

function captureCodexClientAuthority(selectedBinary, { allowTestScript = false } = {}) {
  const selectedSymlink = selectedSymbolicLinkAuthority(selectedBinary);
  const selected = stableExecutableAuthority(selectedBinary);
  const npmEntrypointPackageRoot = officialNpmEntrypointPackageRoot(selected);
  let authority;
  if (npmEntrypointPackageRoot !== null) {
    validateOfficialNpmSymlinkLayout(selectedSymlink, npmEntrypointPackageRoot);
    authority = captureOfficialNpmAuthority(selected, selectedSymlink, npmEntrypointPackageRoot);
    if (!isDeepStrictEqual(authority.selected, authority.javascript_entrypoint)) {
      fail("selected Codex npm entrypoint identity differs from its package closure");
    }
  } else {
    const nativeExecutable = isNativeExecutable(selected);
    const testScript = !nativeExecutable && isExplicitTestScript(selected, allowTestScript);
    if (nativeExecutable || testScript) {
      authority = {
        schema_version: CODEX_CLIENT_AUTHORITY_SCHEMA_VERSION,
        launcher_kind: "direct",
        selected,
        selected_symlink: selectedSymlink,
        package_manifest: null,
        javascript_entrypoint: null,
        executable: selected,
        declared_cli_version: null,
        test_script: testScript,
      };
    } else {
      if (selectedSymlink !== null) {
        fail(
          "selected Codex script symlink must target the canonical @openai/codex/bin/codex.js entrypoint",
        );
      }
      const npmPackageRoot = officialNpmShimPackageRoot(selected);
      authority = captureOfficialNpmAuthority(selected, selectedSymlink, npmPackageRoot);
    }
  }
  const finalSelectedSymlink = selectedSymbolicLinkAuthority(selectedBinary);
  const finalSelected = stableExecutableAuthority(selectedBinary);
  if (
    !isDeepStrictEqual(finalSelectedSymlink, selectedSymlink) ||
    !isDeepStrictEqual(finalSelected, selected)
  ) {
    fail("selected Codex client path changed while its closure was captured");
  }
  return authority;
}

export function resolveCodexClientBinary(selectedBinary, options = {}) {
  if (typeof selectedBinary !== "string" || selectedBinary.length === 0) {
    fail("Codex client preflight requires one selected executable path");
  }
  try {
    const authority = captureCodexClientAuthority(selectedBinary, options);
    return {
      selected_binary: authority.selected_symlink?.path ?? authority.selected.canonical_path,
      executable_binary: authority.executable.canonical_path,
      canonical_path: authority.executable.canonical_path,
      launcher_kind: authority.launcher_kind,
      declared_cli_version: authority.declared_cli_version,
      identity_token: encodeClientAuthority(authority),
    };
  } catch (error) {
    preflightFailure(
      selectedBinary,
      `the selected executable cannot be pinned to one stable canonical regular file (${error instanceof Error ? error.message : String(error)}).`,
    );
  }
}

export function verifyCodexClientBinary(canonicalBinary, identityToken, options = {}) {
  const expected = decodeClientAuthority(identityToken);
  let actual;
  try {
    actual = captureCodexClientAuthority(
      expected.selected_symlink?.path ?? expected.selected.canonical_path,
      options,
    );
  } catch (error) {
    preflightFailure(
      expected.selected.canonical_path,
      `the pinned client closure is no longer stable (${error instanceof Error ? error.message : String(error)}).`,
    );
  }
  if (
    (canonicalBinary !== undefined &&
      canonicalBinary !== expected.selected.canonical_path &&
      canonicalBinary !== expected.selected_symlink?.path &&
      canonicalBinary !== expected.executable.canonical_path) ||
    !isDeepStrictEqual(actual, expected)
  ) {
    preflightFailure(
      expected.selected.canonical_path,
      "the pinned launcher, package entrypoint, or native payload identity changed.",
    );
  }
  return expected.executable.canonical_path;
}

export function parseCodexCliVersionOutput(selectedBinary, output) {
  if (typeof selectedBinary !== "string" || selectedBinary.length === 0) {
    fail("Codex client preflight requires one selected binary");
  }
  if (typeof output !== "string") {
    preflightFailure(
      selectedBinary,
      "the `--version` probe did not return text; expected exactly `codex-cli <semver>`.",
    );
  }
  const match = /^codex-cli ([^\r\n]+)(?:\r?\n)?$/u.exec(output);
  if (!match || !SEMVER_RE.test(match[1])) {
    preflightFailure(
      selectedBinary,
      "the `--version` probe must emit exactly one `codex-cli <semver>` line.",
    );
  }
  return match[1];
}

export function validateCodexClientPreflight(
  selectedBinary,
  versionOutput,
  declaredCliVersion = null,
) {
  const cliVersion = parseCodexCliVersionOutput(selectedBinary, versionOutput);
  if (declaredCliVersion !== null && cliVersion !== declaredCliVersion) {
    preflightFailure(
      selectedBinary,
      `the native payload reports ${cliVersion}, but its pinned npm package declares ${declaredCliVersion}.`,
    );
  }
  return {
    selected_binary: selectedBinary,
    cli_version: cliVersion,
  };
}

export function codexClientAuthorityRecord(identityToken, cliVersion) {
  const authority = decodeClientAuthority(identityToken);
  if (typeof cliVersion !== "string" || !SEMVER_RE.test(cliVersion)) {
    fail("Codex client authority requires one exact semantic CLI version");
  }
  if (authority.declared_cli_version !== null && authority.declared_cli_version !== cliVersion) {
    fail("Codex client authority version differs from its pinned npm package");
  }
  return {
    schema_version: CODEX_CLIENT_AUTHORITY_SCHEMA_VERSION,
    launcher_kind: authority.launcher_kind,
    selected_binary: authority.selected_symlink?.path ?? authority.selected.canonical_path,
    executable_binary: authority.executable.canonical_path,
    authority_token: identityToken,
    authority_sha256: createHash("sha256").update(identityToken, "utf8").digest("hex"),
    cli_version: cliVersion,
    test_script: authority.test_script,
  };
}

function isContainedPath(path, rootReal) {
  const fromRoot = relative(rootReal, path);
  return (
    fromRoot !== "" &&
    fromRoot !== ".." &&
    !fromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromRoot)
  );
}

function walkMatchingRollouts(directory, sessionsRootReal, threadId, output) {
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const metadata = lstatSync(path);
    const normalizedName = entry.name.toLowerCase();
    const matchingName =
      normalizedName.startsWith("rollout-") &&
      normalizedName.endsWith(`-${threadId.toLowerCase()}.jsonl`);
    if (metadata.isSymbolicLink()) {
      if (matchingName) fail("Matching Codex rollout must not be a symbolic link");
      continue;
    }
    if (metadata.isDirectory()) {
      const pathReal = realpathSync.native(path);
      if (!isContainedPath(pathReal, sessionsRootReal)) {
        fail("Codex session directory escapes the sessions root");
      }
      walkMatchingRollouts(pathReal, sessionsRootReal, threadId, output);
    } else if (metadata.isFile() && matchingName) {
      if (metadata.nlink !== 1) fail("Codex rollout must not be hard-linked");
      const pathReal = realpathSync.native(path);
      if (!isContainedPath(pathReal, sessionsRootReal)) {
        fail("Codex rollout escapes the sessions root");
      }
      output.push(pathReal);
    }
  }
}

function canonicalExistingDirectory(path, label, { allowLinkedPath = false } = {}) {
  const resolved = resolve(path);
  const linkedMetadata = lstatSync(resolved);
  const targetMetadata = statSync(resolved);
  if ((!allowLinkedPath && linkedMetadata.isSymbolicLink()) || !targetMetadata.isDirectory()) {
    fail(`${label} must be one real directory`);
  }
  const canonicalPath = realpathSync.native(resolved);
  const identity = statSync(canonicalPath, { bigint: true });
  return {
    canonicalPath,
    identity: {
      device_id: identity.dev.toString(10),
      file_id: identity.ino.toString(10),
    },
  };
}

export function canonicalCodexHome(path) {
  return canonicalExistingDirectory(path, "Codex home", {
    allowLinkedPath: true,
  }).canonicalPath;
}

export function canonicalCodexHomeIfPresent(path) {
  return existsSync(resolve(path)) ? canonicalCodexHome(path) : "";
}

function isWithinOrEqual(path, root) {
  const fromRoot = relative(root, path);
  return (
    fromRoot === "" ||
    (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot))
  );
}

export function validateWindowsOutputPrefixShape(outputPrefix, platform = process.platform) {
  if (platform !== "win32") return outputPrefix;
  const portablePrefix = outputPrefix.replaceAll("\\", "/");
  if (/^\/\/[?.]\//u.test(portablePrefix)) {
    fail("Report output prefix must not use a Windows device namespace");
  }
  const withoutDrive = /^[A-Za-z]:/u.test(portablePrefix)
    ? portablePrefix.slice(2)
    : portablePrefix;
  if (withoutDrive.includes(":")) {
    fail("Report output prefix must not name a Windows alternate data stream");
  }
  for (const segment of withoutDrive.split("/")) {
    if (!segment) continue;
    if (/[. ]$/u.test(segment)) {
      fail("Report output prefix must not contain Windows-trimmed path segments");
    }
    const deviceBase = segment.split(".", 1)[0]?.toUpperCase() ?? "";
    if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/u.test(deviceBase)) {
      fail("Report output prefix must not contain a reserved Windows device name");
    }
  }
  return outputPrefix;
}

export function validateOutputPrefix(codexHome, outputPrefix, baseDirectory = process.cwd()) {
  const portablePrefix = outputPrefix.replaceAll("\\", "/");
  const finalSegment = portablePrefix.slice(portablePrefix.lastIndexOf("/") + 1);
  if (
    portablePrefix.endsWith("/") ||
    finalSegment === "." ||
    finalSegment === ".." ||
    finalSegment === ""
  ) {
    fail("Report output prefix must name a file prefix, not a directory or dot segment");
  }
  validateWindowsOutputPrefixShape(outputPrefix);
  const homeAuthority = canonicalExistingDirectory(codexHome, "Codex home", {
    allowLinkedPath: true,
  });
  const requestedDestination = resolve(baseDirectory, outputPrefix);
  let existingParent = requestedDestination;
  const missingSegments = [];
  while (!existsSync(existingParent)) {
    const parent = dirname(existingParent);
    if (parent === existingParent) {
      fail("Report output prefix has no existing parent directory");
    }
    missingSegments.unshift(basename(existingParent));
    existingParent = parent;
  }
  const existingAuthority = canonicalExistingDirectory(
    existingParent,
    "Report output prefix parent",
    { allowLinkedPath: true },
  );
  const canonicalDestination = resolve(existingAuthority.canonicalPath, ...missingSegments);
  if (isWithinOrEqual(canonicalDestination, homeAuthority.canonicalPath)) {
    fail("Report output prefix must remain outside the Codex home");
  }
  return canonicalDestination;
}

function sameDirectoryAuthority(left, right) {
  return (
    left.canonicalPath === right.canonicalPath &&
    left.identity.device_id === right.identity.device_id &&
    left.identity.file_id === right.identity.file_id
  );
}

function requireContainedDirectory(path, rootReal, label) {
  const authority = canonicalExistingDirectory(path, label);
  const fromRoot = relative(rootReal, authority.canonicalPath);
  if (
    fromRoot === "" ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    fail(`${label} must be contained by the Codex home`);
  }
  return authority;
}

function isExactTurnContextReplay(initial, replay) {
  const initialKeys = Object.keys(initial).sort();
  const replayKeys = Object.keys(replay).sort();
  if (!isDeepStrictEqual(replayKeys, initialKeys)) return false;
  if (
    Object.hasOwn(initial, "timestamp") &&
    (typeof initial.timestamp !== "string" || typeof replay.timestamp !== "string")
  ) {
    return false;
  }
  return initialKeys.every(
    (key) => key === "timestamp" || isDeepStrictEqual(replay[key], initial[key]),
  );
}

function parseJsonlBytes(bytes, label) {
  return bytes
    .toString("utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        fail(`${label} is not valid JSONL`);
      }
    });
}

export function publicCodexThreadId(eventsPath) {
  const rows = parseJsonlBytes(
    readStablePrivateFile(resolve(eventsPath), "Codex provider events"),
    "Codex provider events",
  );
  const threads = rows.filter((row) => row?.type === "thread.started");
  const threadId = threads[0]?.thread_id;
  if (
    threads.length !== 1 ||
    rows[0] !== threads[0] ||
    typeof threadId !== "string" ||
    !THREAD_ID_RE.test(threadId)
  ) {
    fail("Codex provider events require exactly one valid leading thread.started identity");
  }
  return threadId;
}

function rolloutRecordedIdentity(rolloutBytes) {
  const rows = parseJsonlBytes(rolloutBytes, "Codex rollout");
  const sessions = rows.filter((row) => row?.type === "session_meta");
  const turns = rows.flatMap((row, index) =>
    row?.type === "turn_context" ? [{ index, row }] : [],
  );
  if (sessions.length !== 1 || turns.length === 0) {
    fail("Codex rollout cwd capture requires exactly one session_meta and a turn_context");
  }
  const initialTurn = turns[0];
  for (const duplicateTurn of turns.slice(1)) {
    const precededByCompaction =
      duplicateTurn.index >= 2 &&
      rows[duplicateTurn.index - 2]?.type === "compacted" &&
      rows[duplicateTurn.index - 1]?.type === "world_state";
    const afterCompletion = rows
      .slice(0, duplicateTurn.index)
      .some((row) => row?.type === "event_msg" && row?.payload?.type === "task_complete");
    if (
      !precededByCompaction ||
      afterCompletion ||
      !isExactTurnContextReplay(initialTurn.row, duplicateTurn.row)
    ) {
      fail("Codex rollout cwd capture permits only an exact compacted duplicate turn_context");
    }
  }
  const threadId = sessions[0]?.payload?.id;
  const sessionCwd = sessions[0]?.payload?.cwd;
  const turnCwd = initialTurn.row?.payload?.cwd;
  if (
    typeof threadId !== "string" ||
    !THREAD_ID_RE.test(threadId) ||
    typeof sessionCwd !== "string" ||
    typeof turnCwd !== "string"
  ) {
    fail("Codex rollout identity or cwd fields are missing");
  }
  return { threadId, sessionCwd, turnCwd };
}

function publicationDestination(path, homeAuthority, label) {
  const requestedDestination = resolve(path);
  const parentAuthority = canonicalExistingDirectory(
    dirname(requestedDestination),
    `${label} parent`,
    { allowLinkedPath: true },
  );
  const destinationFromHome = relative(homeAuthority.canonicalPath, parentAuthority.canonicalPath);
  if (
    destinationFromHome === "" ||
    (!destinationFromHome.startsWith(`..${sep}`) &&
      destinationFromHome !== ".." &&
      !isAbsolute(destinationFromHome))
  ) {
    fail(`${label} must remain outside the Codex home`);
  }
  return join(parentAuthority.canonicalPath, basename(requestedDestination));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const STRICT_CODE_MODE_CONTRACT = "strict-code-mode-v2";

export function captureThreadBoundCodexRollout(
  codexHome,
  eventsPath,
  destinationPath,
  receiptPath,
  expectedCwd,
) {
  const home = resolve(codexHome);
  const homeAuthority = canonicalExistingDirectory(home, "Codex home", {
    allowLinkedPath: true,
  });
  const sessions = join(home, "sessions");
  const sessionsAuthority = requireContainedDirectory(
    sessions,
    homeAuthority.canonicalPath,
    "Codex sessions root",
  );
  const threadId = publicCodexThreadId(eventsPath);
  const rollouts = [];
  walkMatchingRollouts(
    sessionsAuthority.canonicalPath,
    sessionsAuthority.canonicalPath,
    threadId,
    rollouts,
  );
  if (rollouts.length !== 1) {
    fail(
      `Codex pure run requires exactly one rollout JSONL matching its public thread (found ${rollouts.length})`,
    );
  }
  const destination = publicationDestination(
    destinationPath,
    homeAuthority,
    "Codex rollout destination",
  );
  const receipt = publicationDestination(
    receiptPath,
    homeAuthority,
    "Codex capture receipt destination",
  );
  if (destination === receipt) fail("Codex rollout and capture receipt destinations must differ");

  // Read only the filename-matched session through one stable descriptor, then
  // validate the private bytes before publishing an exclusive copy. Concurrent
  // Codex sessions create different UUID-named rollouts and cannot enter this path.
  const rolloutBytes = readStablePrivateFile(rollouts[0], "matching Codex rollout");
  const recorded = rolloutRecordedIdentity(rolloutBytes);
  if (recorded.threadId !== threadId) {
    fail("Codex rollout session id differs from public thread.started");
  }
  const expectedAuthority = canonicalExistingDirectory(expectedCwd, "Codex expected player cwd");
  const sessionAuthority = canonicalExistingDirectory(
    recorded.sessionCwd,
    "Codex recorded session player cwd",
  );
  const turnAuthority = canonicalExistingDirectory(
    recorded.turnCwd,
    "Codex recorded turn player cwd",
  );
  if (
    !sameDirectoryAuthority(sessionAuthority, expectedAuthority) ||
    !sameDirectoryAuthority(turnAuthority, expectedAuthority)
  ) {
    fail("Codex rollout cwd does not equal the isolated player cwd");
  }

  const receiptBody = {
    schema_version: 3,
    binding: "runner_work_player",
    code_mode_contract: STRICT_CODE_MODE_CONTRACT,
    recorded_session_cwd: recorded.sessionCwd,
    recorded_turn_cwd: recorded.turnCwd,
    canonical_expected_cwd: expectedAuthority.canonicalPath,
    canonical_session_cwd: sessionAuthority.canonicalPath,
    canonical_turn_cwd: turnAuthority.canonicalPath,
    expected_directory_identity: expectedAuthority.identity,
    session_directory_identity: sessionAuthority.identity,
    turn_directory_identity: turnAuthority.identity,
    copied_rollout_sha256: sha256(rolloutBytes),
  };
  let destinationWritten = false;
  let receiptWritten = false;
  try {
    writeFileSync(destination, rolloutBytes, { flag: "wx", mode: 0o600 });
    destinationWritten = true;
    requirePrivateRegularFile(destination, "captured Codex rollout");
    writeFileSync(receipt, `${JSON.stringify(receiptBody, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    receiptWritten = true;
    requirePrivateRegularFile(receipt, "Codex capture receipt");
  } catch (error) {
    if (receiptWritten) {
      try {
        unlinkSync(receipt);
      } catch (cleanupError) {
        void cleanupError;
      }
    }
    if (destinationWritten) {
      try {
        unlinkSync(destination);
      } catch (cleanupError) {
        void cleanupError;
      }
    }
    throw error;
  }
  return destination;
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const allowTestScript = argv.includes("--allow-test-script");
  if (allowTestScript && process.env.BLIND_CODEX_TEST_SCRIPT_CLIENT !== "1") {
    fail("--allow-test-script requires the explicit BLIND_CODEX_TEST_SCRIPT_CLIENT=1 test seam");
  }
  if (command === "resolve-home") {
    const home = option(argv, "--home");
    if (!home) fail("resolve-home requires --home");
    process.stdout.write(canonicalCodexHome(home));
    return;
  }
  if (command === "resolve-home-if-present") {
    const home = option(argv, "--home");
    if (!home) fail("resolve-home-if-present requires --home");
    process.stdout.write(canonicalCodexHomeIfPresent(home));
    return;
  }
  if (command === "validate-output") {
    const home = option(argv, "--home");
    const out = option(argv, "--out");
    const base = option(argv, "--base");
    if (!home || !out || !base) {
      fail("validate-output requires --home, --out, and --base");
    }
    process.stdout.write(validateOutputPrefix(home, out, base));
    return;
  }
  if (command === "resolve-client-binary") {
    const binary = option(argv, "--binary");
    if (!binary) fail("resolve-client-binary requires --binary");
    const resolved = resolveCodexClientBinary(binary, { allowTestScript });
    process.stdout.write(
      `${resolved.selected_binary}\n${resolved.executable_binary}\n${resolved.identity_token}`,
    );
    return;
  }
  if (command === "verify-client-binary") {
    const binary = option(argv, "--binary");
    const identity = option(argv, "--identity");
    if (!binary || !identity) {
      fail("verify-client-binary requires --binary and --identity");
    }
    process.stdout.write(verifyCodexClientBinary(binary, identity, { allowTestScript }));
    return;
  }
  if (command === "preflight-client") {
    const binary = option(argv, "--binary");
    const versionOutput = option(argv, "--version-output");
    const identity = option(argv, "--identity");
    if (!binary || versionOutput === undefined || !identity) {
      fail("preflight-client requires --binary, --version-output, and --identity");
    }
    const authority = decodeClientAuthority(identity);
    const result = validateCodexClientPreflight(
      binary,
      versionOutput,
      authority.declared_cli_version,
    );
    process.stdout.write(result.cli_version);
    return;
  }
  if (command === "render-client-authority") {
    const identity = option(argv, "--identity");
    const cliVersion = option(argv, "--cli-version");
    if (!identity || !cliVersion) {
      fail("render-client-authority requires --identity and --cli-version");
    }
    process.stdout.write(JSON.stringify(codexClientAuthorityRecord(identity, cliVersion)));
    return;
  }
  if (command === "capture") {
    const home = option(argv, "--home");
    const events = option(argv, "--events");
    const out = option(argv, "--out");
    const receipt = option(argv, "--receipt");
    const expectedCwd = option(argv, "--expected-cwd");
    if (!home || !events || !out || !receipt || !expectedCwd) {
      fail("capture requires --home, --events, --out, --receipt, and --expected-cwd");
    }
    captureThreadBoundCodexRollout(home, events, out, receipt, expectedCwd);
    return;
  }
  fail(
    "Usage: codex-rollout.mjs resolve-home|resolve-home-if-present|validate-output|resolve-client-binary|verify-client-binary|preflight-client|render-client-authority|capture ...",
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
