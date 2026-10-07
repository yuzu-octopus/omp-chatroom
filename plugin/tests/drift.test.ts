import { expect, test } from "bun:test";
// Static ESM imports. The host's deep subpaths declare ONLY an `import` condition in their exports
// map (no `require`), so `createRequire(...).resolve()` cannot see them — a `require`-based drift
// check would report a false failure. ESM import is the mechanism the plugin actually uses.
import * as localProtocol from "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol";
import * as agentRegistry from "@oh-my-pi/pi-coding-agent/registry/agent-registry";
import * as harnessTags from "@oh-my-pi/pi-coding-agent/session/harness-tags";
import * as eventBus from "@oh-my-pi/pi-coding-agent/utils/event-bus";
import { assertHostVersion, DEEP_SPECIFIERS, HOST_VERSION_PIN } from "../src/version";

test("the installed host version equals HOST_VERSION_PIN (X6/R34)", async () => {
  // Read the manifest as text + JSON.parse rather than `require`: the package has no `require`
  // condition on its subpaths, and this keeps the whole drift gate on one module system.
  const pkgUrl = new URL("../node_modules/@oh-my-pi/pi-coding-agent/package.json", import.meta.url);
  const raw = await Bun.file(pkgUrl).text();
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object" || !("version" in parsed)) {
    throw new Error("host package.json has no version field");
  }
  const version = parsed.version;
  expect(typeof version).toBe("string");
  expect(version).toBe(HOST_VERSION_PIN);
});

test("assertHostVersion throws on a mismatch and returns on a match", () => {
  expect(() => assertHostVersion(HOST_VERSION_PIN)).not.toThrow();
  expect(() => assertHostVersion("0.0.0-not-installed")).toThrow(/mismatch/i);
  expect(() => assertHostVersion("")).toThrow(/unknown/i);
});

test("DEEP_SPECIFIERS lists the Option A four plus the Option B surface", () => {
  // The Option A four are asserted live below; the rest are Option B surface kept under the same
  // gate so a future phase fails at this test rather than at first use.
  expect(DEEP_SPECIFIERS.length).toBeGreaterThanOrEqual(4);
  expect(DEEP_SPECIFIERS).toContain("@oh-my-pi/pi-coding-agent/session/harness-tags");
  expect(DEEP_SPECIFIERS).toContain("@oh-my-pi/pi-coding-agent/internal-urls/local-protocol");
});

test("each Option A deep specifier exports something, with no undefined members", () => {
  const mods: ReadonlyArray<readonly [string, object]> = [
    ["internal-urls/local-protocol", localProtocol],
    ["registry/agent-registry", agentRegistry],
    ["session/harness-tags", harnessTags],
    ["utils/event-bus", eventBus],
  ];
  for (const [label, mod] of mods) {
    const names = Object.keys(mod);
    expect(names.length, `${label} should export something`).toBeGreaterThan(0);
    for (const name of names) {
      expect(Reflect.get(mod, name), `${label} export ${name}`).toBeDefined();
    }
  }
});

test("the security-critical and shared-root exports exist with the expected arity", () => {
  // escapeHarnessTags is the S1/K22 defence; resolveLocalRoot is the shared-root premise.
  expect(typeof harnessTags.escapeHarnessTags).toBe("function");
  expect(harnessTags.escapeHarnessTags.length).toBe(1);
  expect(typeof localProtocol.resolveLocalRoot).toBe("function");
});
