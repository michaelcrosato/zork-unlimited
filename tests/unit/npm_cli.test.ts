import { describe, expect, it } from "vitest";
import { runNpmScript } from "../../scripts/npm-cli.js";

describe("runNpmScript security validation", () => {
  it("rejects invalid script names with control characters or non-standard characters", () => {
    expect(() => runNpmScript("build\n")).toThrow("contains control characters or newlines");
    expect(() => runNpmScript("build; evil_command")).toThrow(
      "Invalid script name: build; evil_command",
    );
    expect(() => runNpmScript("build && evil_command")).toThrow(
      "Invalid script name: build && evil_command",
    );
    expect(() => runNpmScript("script space")).toThrow("Invalid script name: script space");
  });

  it("rejects script arguments with control characters or null bytes", () => {
    expect(() => runNpmScript("test", ["arg\0value"])).toThrow(
      "contains control characters or newlines",
    );
    expect(() => runNpmScript("test", ["arg\nvalue"])).toThrow(
      "contains control characters or newlines",
    );
    expect(() => runNpmScript("test", ["arg\rvalue"])).toThrow(
      "contains control characters or newlines",
    );
  });

  it("accepts valid script names and script arguments", () => {
    // Valid script name and args shouldn't throw argument validation errors.
    // Notice: running an non-existent script might exit with npm error, but validation in runNpmScript passes.
    expect(() => runNpmScript("version", ["--help"])).not.toThrow(
      "contains control characters or newlines",
    );
    expect(() => runNpmScript("version", ["--help"])).not.toThrow("Invalid script name");
  });
});
