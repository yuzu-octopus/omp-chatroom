import { beforeAll, expect, test } from "bun:test";
import {
  ensureThemeSync,
  getColorBlindMode,
  getSymbolPresetOverride,
  initThemeSync,
  onThemeChange,
  type SymbolKey,
  setSymbolPreset,
  setThemeInstance,
  Theme,
  theme,
} from "@oh-my-pi/pi-tui";
import { activeThemeSymbol, setActiveSymbolTheme } from "@oh-my-pi/pi-tui/theme/active-symbols";
import { adoptHostTheme, uncolouredTheme } from "../src/panel/host-theme";
import { resolveTheme } from "../src/panel/panel";

/**
 * The fallback theme's own shape, as the panel sees it. `uncolouredTheme` is a plain record at
 * runtime (the host's `Theme` is a class), so the contract is spelled out here — the members the
 * panel reads, plus the ones the HOST reads off a published theme.
 */
interface FallbackTheme {
  fg: (tone: string, text: string) => string;
  bold: (text: string) => string;
  symbol: (key: string) => string;
  styledSymbol: (key: string, tone: string) => string;
  getSymbolPreset: () => string;
  getBashModeBorderColor: () => (str: string) => string;
  getPythonModeBorderColor: () => (str: string) => string;
  sessionAccentInputs: { accentHex: string; colorHexes: readonly string[] };
  status: Record<string, string>;
  nav: Record<string, string>;
  tree: Record<string, string>;
  sep: Record<string, string>;
  md: Record<string, string>;
  format: Record<string, string>;
  tool: Record<string, string>;
  boxRound: Record<string, string>;
  boxSharp: Record<string, string>;
}

/** The fallback, typed. */
function fallback(): FallbackTheme {
  return uncolouredTheme() as unknown as FallbackTheme;
}

// The host's theme singleton is `export var theme` — undefined until the host initialises it. This
// file's tests restore it, so it has to EXIST before they start.
beforeAll(() => {
  ensureThemeSync();
});

/**
 * The rounded box's JUNCTIONS borrow the sharp set — the host's own `get boxRound()` does the same,
 * because a rounded box has no rounded junction glyph. So a table member and the symbol key it
 * resolves to are not always the same name.
 */
const JUNCTION_MEMBERS: readonly string[] = ["cross", "teeDown", "teeUp", "teeRight", "teeLeft"];

/** The SYMBOL KEY a table member resolves to. */
function symbolKeyOf(bucket: string, member: string): SymbolKey {
  if (bucket === "boxRound" && JUNCTION_MEMBERS.includes(member)) {
    return `boxSharp.${member}` as SymbolKey;
  }
  return `${bucket}.${member}` as SymbolKey;
}

/** The fallback's symbol tables — the ones the panel and the cards read. */
type FallbackTables = Pick<
  FallbackTheme,
  "status" | "nav" | "tree" | "sep" | "md" | "format" | "tool" | "boxRound" | "boxSharp"
>;

/** The tables the fallback carries — the ones the panel and the cards read. */
const TABLES: readonly (keyof FallbackTables)[] = [
  "status",
  "nav",
  "tree",
  "sep",
  "md",
  "format",
  "tool",
  "boxRound",
  "boxSharp",
];

test("the fallback answers every member the host's theme-change path reads", () => {
  // The publish path notifies the host's theme-change listener SYNCHRONOUSLY, and the interactive
  // mode's listener asks the PUBLISHED theme for the symbol preset and the editor's border colours
  // (`pi-coding-agent/src/modes/interactive-mode.ts:2632`, `:2745`, `:3898`). A published theme
  // without them threw `TypeError: theme.getSymbolPreset is not a function` INSIDE the publish, and
  // the panel died with it.
  const shim = fallback();
  expect(typeof shim.getSymbolPreset).toBe("function");
  expect(typeof shim.getBashModeBorderColor).toBe("function");
  expect(typeof shim.getPythonModeBorderColor).toBe("function");
  expect(shim.sessionAccentInputs).toBeDefined();
  // The shapes the host's own `Theme` uses: a preset, ONE-argument colour functions, and the
  // session-accent inputs.
  expect(["unicode", "nerd", "ascii"]).toContain(shim.getSymbolPreset());
  // A two-argument identity would take the text as the TONE and return `undefined`.
  expect(shim.getBashModeBorderColor()("text")).toBe("text");
  expect(shim.getPythonModeBorderColor()("text")).toBe("text");
  expect(typeof shim.sessionAccentInputs.accentHex).toBe("string");
  expect(Array.isArray(shim.sessionAccentInputs.colorHexes)).toBe(true);
});

test("the publish never throws: the host's own theme-change listener runs to the end", () => {
  const original = theme;
  // A degraded host: the singleton has no `fg`, so the publish happens at all.
  setThemeInstance({} as unknown as Theme);
  let listenerFinished = false;
  const unsubscribe = onThemeChange(() => {
    // The host's listener shape: it reads the PUBLISHED theme's members.
    const published = theme;
    published.getSymbolPreset();
    published.getBashModeBorderColor()("x");
    published.getPythonModeBorderColor()("x");
    listenerFinished = true;
  });
  try {
    const shim = fallback();
    expect(() => adoptHostTheme(shim)).not.toThrow();
    // The listener really ran, and it ran to the END: a member it could not read would have thrown
    // BEFORE the flag was set.
    expect(listenerFinished).toBe(true);
  } finally {
    unsubscribe();
    setThemeInstance(original);
    setActiveSymbolTheme(original);
  }
});

test("a throwing theme-change listener cannot kill the publish", () => {
  // Line 183: the host's listener runs SYNCHRONOUSLY inside `setThemeInstance`,
  // so its throw propagates out of the publish. adoptHostTheme swallows it —
  // the theme IS assigned before the notify — and the panel still renders.
  const original = theme;
  setThemeInstance({} as unknown as Theme);
  const unsubscribe = onThemeChange(() => {
    throw new Error("host listener blew up");
  });
  try {
    const shim = fallback();
    expect(() => adoptHostTheme(shim)).not.toThrow();
  } finally {
    unsubscribe();
    setThemeInstance(original);
    setActiveSymbolTheme(original);
  }
});

test("the host's symbol mirror is never left pointing at a fallback", () => {
  const original = theme;
  try {
    // A DISTINCTIVE active symbol set, so a mirror left on the fallback is visible: the fallback's
    // snapshot would answer with "«status.info»", the host's own lookup never does.
    setActiveSymbolTheme({ symbol: (key: SymbolKey) => `«${key}»` } as unknown as Theme);
    const shim = fallback();
    expect(shim.symbol("status.info")).toBe("«status.info»");
    // A degraded host: the singleton has no `fg`, so the publish happens.
    setThemeInstance({} as unknown as Theme);
    adoptHostTheme(shim);
    // The mirror is NOT the fallback — the host's own lookup answers from the host's ascii preset
    // (what the mirror holds when no theme is published), not from the fallback's snapshot.
    expect(() => activeThemeSymbol("status.info")).not.toThrow();
    expect(activeThemeSymbol("status.info")).not.toBe("«status.info»");
    expect(activeThemeSymbol("status.info").length).toBeGreaterThan(0);

    // And a REAL theme published over a broken singleton keeps the mirror on ITSELF: the restore
    // is for FALLBACK publishes only. Restoring the previous theme over a real one would reset the
    // user's symbol set to the host's ascii preset.
    setThemeInstance({} as unknown as Theme);
    adoptHostTheme(original);
    expect(activeThemeSymbol("status.info")).toBe(original.symbol("status.info"));
  } finally {
    setThemeInstance(original);
    setActiveSymbolTheme(original);
  }
});

test("a fallback publish keeps the mirror on a symbol-bearing singleton", () => {
  // Line 207 (isHostTheme's callable-symbol arm) through line 192's restore:
  // a half-built singleton — `symbol` but no `fg`, so the publish proceeds —
  // is still a host theme for mirror purposes, and the fallback publish
  // hands the mirror back to it. A restore that always yields undefined
  // leaves the mirror on the ascii preset instead.
  const original = theme;
  try {
    setThemeInstance({ symbol: (_key: SymbolKey) => "»host«" } as unknown as Theme);
    adoptHostTheme(fallback());
    expect(activeThemeSymbol("status.info")).toBe("»host«");
  } finally {
    setThemeInstance(original);
    setActiveSymbolTheme(original);
  }
});

test("the fallback's own lookups never recurse, even with the mirror pointing at it", () => {
  const original = theme;
  const shim = fallback();
  try {
    // The poisoned mirror: the host's own lookup now asks the fallback for its glyphs. A fallback
    // that resolved THROUGH the mirror would ask the mirror again, until the stack overflowed
    // ("Maximum call stack size exceeded") — in the plugin's cards AND in the host's key hints.
    setActiveSymbolTheme(shim as unknown as Theme);
    let value: string | undefined;
    expect(() => {
      value = shim.symbol("status.info");
    }).not.toThrow();
    expect(value).toBeDefined();
    expect(value).not.toBe("undefined");
    expect(value).not.toBe("");
    expect(value).not.toBe("?");
    // And the host's own path — `activeThemeSymbol` → the mirror → the fallback — resolves too.
    expect(() => activeThemeSymbol("status.info")).not.toThrow();
    expect(activeThemeSymbol("status.info").length).toBeGreaterThan(0);
  } finally {
    setActiveSymbolTheme(original);
  }
});

test("the fallback's tables and its symbol() agree, and both answer from the snapshot", () => {
  const original = theme;
  const shim = fallback();
  try {
    for (const bucket of TABLES) {
      const table = shim[bucket];
      expect(Object.keys(table).length, `the ${bucket} table is empty`).toBeGreaterThan(0);
      for (const member of Object.keys(table)) {
        const key = symbolKeyOf(bucket, member);
        // The same glyph, whichever way it is read.
        expect(table[member], `${bucket}.${member}`).toBe(shim.symbol(key));
        expect(shim.styledSymbol(key, "accent"), `${bucket}.${member}`).toBe(shim.symbol(key));
        // And the HOST's own lookup agrees: the fallback mirrors the host's symbols, it does not
        // invent its own. A "?" is the marker for a key the host has no glyph for either.
        const hostGlyph = theme.symbol(key);
        if (hostGlyph === undefined) {
          expect(table[member], `${bucket}.${member}`).toBe("?");
        } else {
          expect(table[member], `${bucket}.${member}`).toBe(hostGlyph);
        }
      }
    }
    // And they keep agreeing when the host's symbol set changes UNDER them: the fallback answers
    // from the snapshot it was built with, so a table and its lookup can never drift apart — and
    // the fallback never asks the mirror, so a mirror pointing at it cannot cycle.
    setActiveSymbolTheme({ symbol: (key: SymbolKey) => `»${key}«` } as unknown as Theme);
    for (const bucket of TABLES) {
      const table = shim[bucket];
      for (const member of Object.keys(table)) {
        const key = symbolKeyOf(bucket, member);
        expect(table[member], `${bucket}.${member}`).toBe(shim.symbol(key));
        expect(table[member], `${bucket}.${member}`).not.toBe(`»${key}«`);
      }
    }
  } finally {
    setActiveSymbolTheme(original);
  }
});

test("the host's real theme — the one the ladder prefers — is complete and usable", () => {
  ensureThemeSync();
  expect(theme).toBeDefined();
  expect(typeof theme.fg).toBe("function");
  expect(typeof theme.getSymbolPreset).toBe("function");
  expect(typeof theme.getBashModeBorderColor).toBe("function");
  expect(typeof theme.getPythonModeBorderColor).toBe("function");
  const glyph = theme.symbol("status.info");
  expect(typeof glyph).toBe("string");
  expect(glyph.length).toBeGreaterThan(0);
  expect(["unicode", "nerd", "ascii"]).toContain(theme.getSymbolPreset());
});

test("the ladder: the injected theme, then the host's real theme, and the shim last", () => {
  const original = theme;
  try {
    // 1. The INJECTED theme wins when it is usable.
    const injected = { fg: () => "text" } as unknown as Theme;
    expect(resolveTheme(injected)).toBe(injected);

    // 2. The host's REAL theme, when the injected one is unusable: the pi-tui singleton, filled by
    // the host's own initialiser and re-read. It is a complete theme, so it is the one the panel
    // paints with.
    //
    // The singleton is EMPTIED first, so the host's own `initThemeSync` is what fills it — that is
    // the step under test, not a singleton that happened to be there already.
    setThemeInstance(undefined as unknown as Theme);
    expect(theme).toBeUndefined();
    const resolved = resolveTheme({} as unknown as Theme);
    expect(resolved).toBe(theme);
    // A REAL host theme, not the plugin's shim: the host's own initialiser filled the singleton,
    // and only the host builds instances of its own `Theme` class.
    expect(resolved).toBeInstanceOf(Theme);
    expect(typeof resolved.getSymbolPreset).toBe("function");
    expect(typeof resolved.getBashModeBorderColor).toBe("function");

    // 3. The shim is the LAST resort: the host's own theme loader is broken, so there is no real
    // theme to have — that is what the panel gets, and it is a complete theme, so publishing it
    // cannot throw.
    setThemeInstance({} as unknown as Theme);
    const last = resolveTheme(undefined, () => {
      throw new Error("the host's theme loader is broken");
    });
    expect(last).not.toBe(original);
    expect(typeof (last as unknown as FallbackTheme).getSymbolPreset).toBe("function");
    expect(typeof (last as unknown as FallbackTheme).sessionAccentInputs).toBe("object");
  } finally {
    setThemeInstance(original);
    setActiveSymbolTheme(original);
  }
});

// --- the published theme is a CONTRACT -------------------------------------

/**
 * EVERY public member of the host's `Theme` class — the methods and the getters, derived from
 * the class itself (`pi-tui/src/theme/theme-class.ts`) rather than from a hand-written list, so a
 * member the host adds in a later version is covered by the same assertion and the list cannot
 * drift from the host.
 */
function hostThemeMembers(): { methods: string[]; getters: string[] } {
  const methods: string[] = [];
  const getters: string[] = [];
  for (const name of Object.getOwnPropertyNames(Theme.prototype)) {
    if (name === "constructor") continue;
    const descriptor = Object.getOwnPropertyDescriptor(Theme.prototype, name);
    if (descriptor?.get !== undefined) getters.push(name);
    else methods.push(name);
  }
  return { methods, getters };
}

/**
 * The host's own INSTANCE fields — the members the class assigns in its constructor (the
 * `statusLineLuminance`), which are own properties of an instance and not of the prototype.
 */
function hostThemeInstanceFields(): string[] {
  return Object.getOwnPropertyNames(theme);
}

/**
 * The surface luminances: the fallback has no background, so it has no luminance — the same
 * undefined the host's own theme carries on a dark surface. Every other getter has to answer.
 */
const SURFACE_LUMINANCES: readonly string[] = ["statusLineLuminance", "accentSurfaceLuminance"];

/**
 * The host's own SYMBOL TABLES, read off the published theme by the host's own UI: the chat
 * renderer (`icon`), the copy overlay (`cmd`), the approval dialog (`checkbox`), the transcript
 * outline (`radio`, `boxDotted`), the loader (`progress`), the editor (`thinking`).
 *
 * The `tool` table is NOT one of them: the host's `Theme` has no `tool` table (the plugin gives
 * the cards one, so `theme.tool.irc` resolves), and `status`/`nav`/`tree`/`sep`/`md`/`format` are
 * the plugin's own reads of the host's tables.
 */
const HOST_TABLES: readonly string[] = [
  "status",
  "nav",
  "tree",
  "sep",
  "md",
  "format",
  "icon",
  "cmd",
  "thinking",
  "checkbox",
  "radio",
  "progress",
  "boxRound",
  "boxSharp",
  "boxDotted",
];

test("the published fallback answers EVERY member the host reads off a theme", () => {
  const original = theme;
  try {
    const shim = uncolouredTheme() as unknown as Record<string, unknown>;
    const { methods, getters } = hostThemeMembers();

    // Every member EXISTS. A member the host reads that the fallback does not have is a
    // host-wide crash on the next frame — in production the plugin and the host share ONE
    // `pi-tui` instance, so the fallback IS the host's theme once it is published.
    for (const name of [...methods, ...getters, ...hostThemeInstanceFields()]) {
      expect(name in shim, `the fallback has no ${name}`).toBe(true);
    }

    // Every method is callable, and calling it does not throw.
    for (const name of methods) {
      const member = shim[name];
      expect(typeof member, `${name} is not a function`).toBe("function");
      if (typeof member === "function") {
        expect(() => member(), `${name} threw`).not.toThrow();
      }
    }

    // Every getter answers with a value — the two surface luminances excepted, because the
    // fallback has no surface to measure.
    const real = theme as unknown as Record<string, unknown>;
    for (const name of getters) {
      if (SURFACE_LUMINANCES.includes(name)) continue;
      expect(shim[name], `${name} is undefined`).not.toBeUndefined();
      expect(real[name], `${name} is not a member of the host's theme`).not.toBeUndefined();
    }

    // And the tables carry the host's own MEMBERS: the host reads `theme.icon.output` and
    // `theme.cmd.copy` off the published theme, so a table that is missing one of the host's
    // members paints the literal "undefined" where a glyph belongs. The member lists are the
    // host's own — taken off a real theme — so they cannot drift.
    for (const name of HOST_TABLES) {
      const realTable = real[name] as Record<string, string> | undefined;
      const fallbackTable = shim[name] as Record<string, string> | undefined;
      expect(realTable, `the host's theme has no ${name} table`).toBeDefined();
      expect(fallbackTable, `the fallback has no ${name} table`).toBeDefined();
      expect(Object.keys(fallbackTable!).sort(), `the ${name} table differs`).toEqual(
        Object.keys(realTable!).sort(),
      );
    }
  } finally {
    setThemeInstance(original);
    setActiveSymbolTheme(original);
  }
});

test("the degraded path leaves the host reading a theme with no missing member", () => {
  const original = theme;
  try {
    // The host's theme loader is broken, so the last-resort theme is the one that is published
    // into the host's live singleton.
    setThemeInstance({} as unknown as Theme);
    const resolved = resolveTheme(undefined, () => {
      throw new Error("the host's theme loader is broken");
    });
    // The host reads THIS theme from here on.
    expect(theme).toBe(resolved);
    const published = theme as unknown as Record<string, unknown>;
    const { methods, getters } = hostThemeMembers();
    for (const name of methods) {
      const member = published[name];
      expect(typeof member, `the published theme has no ${name}`).toBe("function");
      if (typeof member === "function") {
        expect(() => member(), `${name} threw`).not.toThrow();
      }
    }
    for (const name of getters) {
      if (SURFACE_LUMINANCES.includes(name)) continue;
      expect(published[name], `the published theme has no ${name}`).not.toBeUndefined();
    }
  } finally {
    setThemeInstance(original);
    setActiveSymbolTheme(original);
  }
});

test("the last-resort branch is reachable when the host's theme loader throws", () => {
  const original = theme;
  try {
    // The host's own `initThemeSync` has its `loadThemeSync("dark", …)` fallback OUTSIDE its own
    // try/catch (`pi-tui/src/theme/theme.ts`), so a loader broken enough for both loads to fail
    // THROWS out of it. Unguarded, that throw left `resolveTheme` — and with it the whole panel —
    // dead, and the last-resort branch was never reached.
    setThemeInstance({} as unknown as Theme);
    let resolved: Theme | undefined;
    expect(() => {
      resolved = resolveTheme(undefined, () => {
        throw new Error("the host's theme loader is broken");
      });
    }).not.toThrow();
    expect(resolved).toBeDefined();
    // The panel still gets a theme, and it is the last-resort one: a shim, not a host theme.
    expect(resolved).not.toBeInstanceOf(Theme);
    expect(typeof (resolved as unknown as FallbackTheme).getSymbolPreset).toBe("function");
    // And it is PUBLISHED, because the host's chrome helpers draw the panel's frame from the
    // singleton.
    expect(theme).toBe(resolved!);
    // ...and the shim still answers a symbol (the "?" marker), so the board never draws blank.
    expect((resolved as unknown as FallbackTheme).symbol("status.info")).toBe("?");
  } finally {
    setThemeInstance(original);
    setActiveSymbolTheme(original);
  }
});

// --- the user's settings survive the degraded path -------------------------

test("the degraded path keeps the user's symbol preset", async () => {
  const original = theme;
  const originalOverride = getSymbolPresetOverride();
  const originalColorBlind = getColorBlindMode();
  try {
    // The user chose the ascii set.
    await setSymbolPreset("ascii");
    const ascii = theme;
    const asciiInfo = ascii.symbol("status.info");

    // The host's singleton is EMPTIED: the degraded host.
    setThemeInstance(undefined as unknown as Theme);
    const resolved = resolveTheme({} as unknown as Theme);

    // The user's preset SURVIVED the degraded path. The old `ensureThemeSync()` wiped it: it
    // runs `configureTheme(undefined)`, which sets `currentSymbolPresetOverride = undefined`, and
    // the theme it built carried the default "unicode" set — so a user who chose ascii silently
    // got unicode back.
    expect(getSymbolPresetOverride()).toBe("ascii");
    expect(resolved.getSymbolPreset()).toBe("ascii");
    // And the theme really carries the ascii set's glyphs, not just the name of it.
    expect(resolved.status.info).toBe(asciiInfo);
  } finally {
    // The singleton, the mirror AND the preset are all restored.
    initThemeSync(originalOverride, originalColorBlind);
    setThemeInstance(original);
    setActiveSymbolTheme(original);
    expect(theme).toBe(original);
    expect(getSymbolPresetOverride()).toBe(originalOverride);
    expect(getColorBlindMode()).toBe(originalColorBlind);
  }
});

test("the fallback reports the preset its snapshot was taken under", async () => {
  const original = theme;
  const originalOverride = getSymbolPresetOverride();
  const originalColorBlind = getColorBlindMode();
  try {
    await setSymbolPreset("ascii");
    const ascii = theme;
    const asciiInfo = ascii.symbol("status.info");

    const shim = uncolouredTheme() as unknown as FallbackTheme;
    // The fallback's glyphs are the ascii set's ...
    expect(shim.status.info).toBe(asciiInfo);
    // ... and the preset it REPORTS is the one they were taken under. A live lookup made the
    // fallback name a set its own glyphs did not come from.
    expect(shim.getSymbolPreset()).toBe("ascii");

    // The host switching set afterwards changes neither the glyphs the fallback painted nor the
    // preset it reports: the snapshot is the snapshot.
    await setSymbolPreset("unicode");
    expect(shim.status.info).toBe(asciiInfo);
    expect(shim.getSymbolPreset()).toBe("ascii");
  } finally {
    initThemeSync(originalOverride, originalColorBlind);
    setThemeInstance(original);
    setActiveSymbolTheme(original);
    expect(theme).toBe(original);
    expect(getSymbolPresetOverride()).toBe(originalOverride);
  }
});

test("the fallback degrades to ascii when the singleton's preset getter throws", () => {
  // Lines 621, 625: a half-built singleton whose getSymbolPreset THROWS —
  // caught, falling through to "ascii". A compromise is unavoidable: the
  // snapshot took the host's own ascii set, so the preset IS ascii.
  const original = theme;
  try {
    setThemeInstance({
      ...original,
      getSymbolPreset: () => {
        throw new Error("half-built theme");
      },
    } as unknown as Theme);
    const shim = uncolouredTheme() as unknown as FallbackTheme;
    expect(shim.getSymbolPreset()).toBe("ascii");
  } finally {
    setThemeInstance(original);
    setActiveSymbolTheme(original);
  }
});
