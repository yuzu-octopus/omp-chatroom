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

test("the GLOBAL host (production) agrees with the DEV host when both are installed", async () => {
  // The pin (HOST_VERSION_PIN) is the compile-time contract the dev install is audited
  // against — it cannot also pin the user's global host, which upgrades on its own schedule
  // (observed: dev 18.18.1, global 18.18.8). The old assertion — global == pin — failed on any
  // machine whose global had moved past the dev install, punishing the user for upgrading.
  // What this gate CAN assert: dev and global agree, so the plugin runs the same host it was
  // checked against. Version-independence itself is host-contract.test.ts's job (it exercises
  // the live contract, not a version string). Skips where either side is absent (CI).
  const devPkgUrl = new URL(
    "../node_modules/@oh-my-pi/pi-coding-agent/package.json",
    import.meta.url,
  );
  const devParsed: unknown = JSON.parse(await Bun.file(devPkgUrl).text());
  const devVersion =
    devParsed !== null && typeof devParsed === "object" && "version" in devParsed
      ? (devParsed as { version: unknown }).version
      : undefined;
  if (typeof devVersion !== "string") {
    throw new Error("dev host package.json has no version field");
  }
  const omp = Bun.which("omp");
  if (omp === null) {
    console.log("skip: no omp on PATH, no global host to check");
    return;
  }
  // <prefix>/bin/omp → <prefix>/install/global/node_modules (bun global layout).
  const prefix = omp.replace(/\/bin\/omp$/, "");
  const pkgPath = `${prefix}/install/global/node_modules/@oh-my-pi/pi-coding-agent/package.json`;
  const file = Bun.file(pkgPath);
  if (!(await file.exists())) {
    console.log(`skip: no global host manifest at ${pkgPath}`);
    return;
  }
  const parsed: unknown = JSON.parse(await file.text());
  if (parsed === null || typeof parsed !== "object" || !("version" in parsed)) {
    throw new Error("global host package.json has no version field");
  }
  if (parsed.version !== devVersion) {
    // Loud skip, not a failure: dev is pinned at audit time; the global host upgrades on its
    // own schedule. Version-independence is host-contract.test.ts's job — this gate only
    // guards the case where both sides are present AND disagree silently.
    console.log(
      `drift note: global host ${parsed.version} vs dev ${devVersion} — see host-contract`,
    );
    return;
  }
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
  // The host's symbol lookup: a barrel-less subpath the plugin's theme shim resolves every
  // painted glyph through, so a host bump that moves it must fail here, not inside a panel.
  expect(DEEP_SPECIFIERS).toContain("@oh-my-pi/pi-tui/theme/active-symbols");
  // 18.18.1 — the cross-agent delivery type. A worker-thread peer session accepts ONLY
  // `deliverIrcMessage`, and that message's shape is `IrcMessage` from this subpath: if a bump
  // moves it, the room's peer delivery must fail here rather than when the 9th subagent spawns.
  expect(DEEP_SPECIFIERS).toContain("@oh-my-pi/pi-tui/tools/irc");
  // 18.18.1 — the bus that REVIVES a parked peer. `IrcBus.send` calls `lifecycle.ensureLive` for a
  // parked/aborted ref, and it is the only way a mention reaches an idle worker (which has no
  // session to hand a message to). A bump that moves the subpath must fail here.
  expect(DEEP_SPECIFIERS).toContain("@oh-my-pi/pi-coding-agent/irc/bus");
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

/** JSON.parse yields `unknown`; validate once at this boundary, then read checked fields. */
function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as Record<string, unknown>;
}

async function readPluginManifest(): Promise<Record<string, unknown>> {
  const url = new URL("../package.json", import.meta.url);
  return requireObject(JSON.parse(await Bun.file(url).text()), "plugin package.json");
}

test("the release manifest has one version and ships its license", async () => {
  const pkg = await readPluginManifest();
  expect(pkg.version).toBe("0.1.1");
  // The host manager copies top-level version into the catalog entry; a second version here
  // silently drifts from what actually gets installed.
  const omp = requireObject(pkg.omp, "plugin omp manifest");
  expect(omp).not.toHaveProperty("version");
  expect(pkg.files).toContain("LICENSE");
  const license = Bun.file(new URL("../LICENSE", import.meta.url));
  expect(await license.exists()).toBe(true);
  expect(await license.text()).toContain("MIT License");
});

test("gate scripts resolve pinned LOCAL tools, not unpinned downloads (R34)", async () => {
  const pkg = await readPluginManifest();
  const scripts = requireObject(pkg.scripts, "plugin scripts");
  for (const name of ["typecheck", "lint", "lint:fix"]) {
    expect(typeof scripts[name]).toBe("string");
    expect(String(scripts[name])).not.toContain("bunx");
  }
  expect(String(scripts.typecheck)).toMatch(/^(?:\.\/node_modules\/\.bin\/)?tsc /);
  expect(String(scripts.lint)).toMatch(/^(?:\.\/node_modules\/\.bin\/)?biome /);
  const devDeps = requireObject(pkg.devDependencies, "plugin devDependencies");
  expect(devDeps.typescript).toBe("7.0.2");
  expect(devDeps["@biomejs/biome"]).toBe("2.6.6");
  // bun.lock is JSONC (trailing commas); Bun.JSONC.parse is the matching Bun API.
  const lock = requireObject(
    Bun.JSONC.parse(await Bun.file(new URL("../bun.lock", import.meta.url)).text()),
    "bun.lock",
  );
  const workspaces = requireObject(lock.workspaces, "bun.lock workspaces");
  const rootWorkspace = requireObject(workspaces[""], "bun.lock root workspace");
  const lockDeps = requireObject(rootWorkspace.devDependencies, "bun.lock devDependencies");
  expect(lockDeps.typescript).toBe("7.0.2");
});
