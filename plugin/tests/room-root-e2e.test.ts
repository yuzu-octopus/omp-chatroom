import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { roomDirNameFor, roomIdFor } from "../src/ids";

/**
 * E2E: the room root really lands in the global omp session store, and a legacy project-local
 * room is migrated into it.
 *
 * `getSessionsDir()` resolves its XDG base ONCE, at module load (pi-utils keeps a module-level
 * DirResolver singleton), so a test process cannot point the global store at a temp directory by
 * setting `process.env.XDG_DATA_HOME` — by the time the test runs, the resolver already holds the
 * real HOME, and other plugin test files import pi-utils first. The only honest way to exercise
 * the global branch is a CHILD process with a fresh environment: `XDG_DATA_HOME=<temp>` plus a
 * `<temp>/omp` app dir, because the host only honours the XDG base when that directory exists.
 *
 * The child's project cwd must be OUTSIDE `os.tmpdir()`: the plugin deliberately keeps temp-dir
 * projects project-local, so a project under /tmp can never reach the global store.
 */

const PLUGIN_DIR = path.resolve(import.meta.dir, "..");
const RESULT_MARKER = "__ROOM_E2E_RESULT__";

const ROOT_MODULE = path.join(PLUGIN_DIR, "src/store/room-root.ts");
const STORE_MODULE = path.join(PLUGIN_DIR, "src/store/room-store.ts");

/**
 * The child script: resolve the room for a project cwd, open it, and report what landed on disk.
 *
 * It handles BOTH scenarios in one process: importing the store pulls in the whole host module
 * tree, which costs ~10 s of transpiling, so one child serves both cases. It prints one marker
 * line so the parent can parse it out of whatever else lands on stdout.
 */
const CHILD_SOURCE = `
import * as fs from "node:fs";
import { roomRootFor } from ${JSON.stringify(ROOT_MODULE)};
import { disposeRoomSession, roomStoreFor } from ${JSON.stringify(STORE_MODULE)};

// A subagent identity: a "main" agent would start the sweep/compactor timers this probe does
// not need, and the timers would keep the child alive.
function probe(cwd) {
  const ctx = {
    cwd: cwd,
    agent: { id: "E2E", kind: "sub", name: "E2E", depth: 1, parentId: "Main" },
  };
  const root = roomRootFor(ctx);
  const store = roomStoreFor(ctx);
  const roomDir = root + "/room";
  let files = [];
  try {
    files = fs.readdirSync(roomDir).sort();
  } catch {
    files = [];
  }
  let configRoomId = null;
  try {
    configRoomId = JSON.parse(fs.readFileSync(roomDir + "/config.json", "utf-8")).roomId || null;
  } catch {
    configRoomId = null;
  }
  let logText = null;
  try {
    logText = fs.readFileSync(store.logPath, "utf-8");
  } catch {
    logText = null;
  }
  const payload = {
    cwd: cwd,
    root: root,
    roomId: store.roomId,
    logPath: store.logPath,
    roomDir: roomDir,
    files: files,
    configRoomId: configRoomId,
    logText: logText,
  };
  disposeRoomSession(ctx);
  return payload;
}

const payload = {
  fresh: probe(process.env.ROOM_E2E_PROJECT_DIR || ""),
  legacy: probe(process.env.ROOM_E2E_LEGACY_PROJECT_DIR || ""),
};
console.log(${JSON.stringify(RESULT_MARKER)} + JSON.stringify(payload));
`;

interface ChildPayload {
  cwd: string;
  root: string;
  roomId: string;
  logPath: string;
  roomDir: string;
  files: string[];
  configRoomId: string | null;
  logText: string | null;
}

/** Every directory this test created; removed in `afterAll` and nowhere else. */
const created: string[] = [];

function tempDir(prefix: string, base: string = os.tmpdir()): string {
  const dir = fs.mkdtempSync(path.join(base, prefix));
  created.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of created) fs.rmSync(dir, { recursive: true, force: true });
});

function isUnder(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * A writable base for the PROJECT directory that is outside `os.tmpdir()` — the plugin keeps
 * temp-dir projects project-local on purpose, so only a non-temp cwd can reach the global store.
 */
function projectBase(): string {
  const candidates = [process.env.OMP_ROOM_E2E_BASE, "/var/tmp", os.homedir()];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const base = path.resolve(candidate);
    if (base === path.resolve(os.tmpdir())) continue;
    if (isUnder(os.tmpdir(), base)) continue;
    if (!fs.existsSync(base)) continue;
    try {
      fs.accessSync(base, fs.constants.W_OK);
    } catch {
      continue;
    }
    return base;
  }
  throw new Error("no writable directory outside os.tmpdir() for the e2e project");
}

/** A project directory OUTSIDE the temp dir, so the plugin takes the global-store branch. */
function makeProjectDir(): string {
  const dir = tempDir("omp-room-e2e-project-", projectBase());
  if (isUnder(os.tmpdir(), dir)) throw new Error("the e2e project dir landed under os.tmpdir()");
  return dir;
}

/** The XDG base the child will use. The `<temp>/omp` app dir must exist or the host ignores it. */
function makeXdgDir(): string {
  const dir = tempDir("omp-room-e2e-xdg-");
  fs.mkdirSync(path.join(dir, "omp"), { recursive: true });
  return dir;
}

/** Where the user's REAL session store would put a room with this leaf (must stay untouched). */
function realStoreRooms(leaf: string): string[] {
  const candidates = [path.join(os.homedir(), ".omp", "agent", "sessions", "rooms", leaf)];
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) candidates.push(path.join(xdg, "omp", "sessions", "rooms", leaf));
  return candidates;
}

/** Every entry under `dir`, as sorted relative paths (files and directories). */
function listTree(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string, prefix: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      out.push(rel);
      if (entry.isDirectory()) walk(path.join(current, entry.name), rel);
    }
  };
  walk(dir, "");
  return out.sort();
}

/**
 * Run the probe in a child `bun` process with a FRESH environment, so pi-utils resolves its XDG
 * base against the temp dir instead of the real HOME. `process.execPath` is the bun binary that
 * runs this suite (never node).
 *
 * ONE child serves both scenarios: importing the store pulls in the whole host module tree,
 * which costs ~10 s of transpiling — twice that would be a slow suite for no extra coverage.
 */
function runChild(
  projects: { fresh: string; legacy: string },
  xdgDir: string,
): {
  fresh: ChildPayload;
  legacy: ChildPayload;
} {
  const scriptPath = path.join(tempDir("omp-room-e2e-script-"), "child.ts");
  fs.writeFileSync(scriptPath, CHILD_SOURCE, "utf-8");

  const env: Record<string, string | undefined> = { ...process.env };
  env.XDG_DATA_HOME = xdgDir;
  env.XDG_STATE_HOME = xdgDir;
  env.XDG_CACHE_HOME = xdgDir;
  env.ROOM_E2E_PROJECT_DIR = projects.fresh;
  env.ROOM_E2E_LEGACY_PROJECT_DIR = projects.legacy;
  // bun's own transpiler cache would otherwise land in $XDG_CACHE_HOME and share the temp dir
  // with the room store; keep the XDG tree to the room alone.
  env.BUN_RUNTIME_TRANSPILER_CACHE_PATH = tempDir("omp-room-e2e-bun-cache-");
  // A named profile or an agent-dir override makes pi-utils ignore the XDG base, and the
  // sessions dir would fall back to the user's real ~/.omp. An undefined value is an unset
  // variable in the child (bun skips undefined entries when it builds the env block).
  env.PI_CODING_AGENT_DIR = undefined;
  env.OMP_PROFILE = undefined;
  env.PI_PROFILE = undefined;

  const proc = Bun.spawnSync({
    cmd: [process.execPath, "run", scriptPath],
    cwd: PLUGIN_DIR,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = proc.stdout.toString();
  if (!proc.success) {
    throw new Error(`child exited ${proc.exitCode}: ${proc.stderr.toString()}\n${stdout}`);
  }
  const line = stdout.split("\n").find((l) => l.startsWith(RESULT_MARKER));
  if (line === undefined) throw new Error(`no result marker in the child output:\n${stdout}`);
  const parsed: unknown = JSON.parse(line.slice(RESULT_MARKER.length));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`the child payload is not an object: ${line}`);
  }
  // The child script above emits exactly this shape, so the cast is the boundary assertion; the
  // fields themselves are checked by the assertions that follow.
  return parsed as { fresh: ChildPayload; legacy: ChildPayload };
}

interface Run {
  xdgDir: string;
  projectDir: string;
  legacyProjectDir: string;
  legacyRoot: string;
  legacyRoomDir: string;
  legacyId: string;
  legacyLog: string;
  legacyRecord: string;
  fixture: string[];
  fresh: ChildPayload;
  legacy: ChildPayload;
}

/** The one child run, shared by both tests (the child costs ~10 s to start). */
let run: Run | undefined;

function ensureRun(): Run {
  if (run !== undefined) return run;
  const xdgDir = makeXdgDir();
  const projectDir = makeProjectDir();
  const legacyProjectDir = makeProjectDir();

  // The legacy fixture: a project-local room with a log and a config that pins the room id.
  const legacyRoot = path.join(legacyProjectDir, ".omp-room");
  const legacyRoomDir = path.join(legacyRoot, "room");
  fs.mkdirSync(legacyRoomDir, { recursive: true });
  const legacyId = roomIdFor(legacyRoot);
  const legacyLog = `${legacyId}.jsonl`;
  const legacyRecord = JSON.stringify({
    v: 1,
    seq: 1,
    ts: 1700000000000,
    kind: "msg",
    id: "legacy-1",
    from: "Legacy",
    topic: "general",
    body: "hello from the legacy room",
  });
  fs.writeFileSync(path.join(legacyRoomDir, legacyLog), `${legacyRecord}\n`, "utf-8");
  fs.writeFileSync(
    path.join(legacyRoomDir, "config.json"),
    `${JSON.stringify({ roomId: legacyId })}\n`,
    "utf-8",
  );
  const fixture = listTree(legacyProjectDir);

  const payload = runChild({ fresh: projectDir, legacy: legacyProjectDir }, xdgDir);
  run = {
    xdgDir,
    projectDir,
    legacyProjectDir,
    legacyRoot,
    legacyRoomDir,
    legacyId,
    legacyLog,
    legacyRecord,
    fixture,
    fresh: payload.fresh,
    legacy: payload.legacy,
  };
  return run;
}

// The child takes ~10 s to start (it transpiles the host module tree), so both tests share ONE
// run and carry an explicit timeout — the 5 s default would kill a working probe.
const CHILD_TIMEOUT_MS = 120_000;

test(
  "a project outside the temp dir opens its room in the global omp session store",
  () => {
    const r = ensureRun();
    const payload = r.fresh;
    const leaf = roomDirNameFor(r.projectDir);
    const expectedRoot = path.join(r.xdgDir, "omp", "sessions", "rooms", leaf);

    // (a) the root is <XDG_DATA_HOME>/omp/sessions/rooms/<16 hex of the project path>
    expect(payload.root).toBe(expectedRoot);
    expect(path.basename(payload.root)).toMatch(/^[0-9a-f]{16}$/);
    expect(path.basename(payload.root)).toBe(leaf);
    // the room really exists there, with its config and its log
    expect(fs.existsSync(payload.roomDir)).toBe(true);
    expect(payload.files).toContain("config.json");
    expect(payload.files).toContain(`${payload.roomId}.jsonl`);
    expect(fs.existsSync(payload.logPath)).toBe(true);

    // (b) nothing was created under the project directory
    expect(fs.readdirSync(r.projectDir)).toEqual([]);
    expect(fs.existsSync(path.join(r.projectDir, ".omp-room"))).toBe(false);

    // the user's real store was not used
    for (const candidate of realStoreRooms(leaf)) {
      expect(fs.existsSync(candidate)).toBe(false);
    }
  },
  CHILD_TIMEOUT_MS,
);

test(
  "a legacy project-local room is copied into the global room on the first open",
  () => {
    const r = ensureRun();
    const payload = r.legacy;
    const leaf = roomDirNameFor(r.legacyProjectDir);
    const expectedRoot = path.join(r.xdgDir, "omp", "sessions", "rooms", leaf);

    // the room still lives in the global store, not in the project
    expect(payload.root).toBe(expectedRoot);
    expect(payload.roomDir).toBe(path.join(expectedRoot, "room"));

    // (c) the legacy room was copied in, keeping its id: the config pins it and travels with the log
    expect(payload.roomId).toBe(r.legacyId);
    expect(payload.configRoomId).toBe(r.legacyId);
    expect(payload.files).toContain(r.legacyLog);
    expect(payload.files).toContain("config.json");
    expect(fs.existsSync(path.join(payload.roomDir, r.legacyLog))).toBe(true);
    expect(fs.existsSync(path.join(payload.roomDir, "config.json"))).toBe(true);
    // the CONTENT travelled too, not just the file name
    expect(payload.logText).toContain("hello from the legacy room");

    // the legacy directory still exists afterwards: the move is a copy, not a move
    expect(fs.existsSync(r.legacyRoot)).toBe(true);
    expect(fs.existsSync(path.join(r.legacyRoomDir, r.legacyLog))).toBe(true);
    expect(fs.readFileSync(path.join(r.legacyRoomDir, r.legacyLog), "utf-8")).toBe(
      `${r.legacyRecord}\n`,
    );

    // and the plugin added nothing to the project tree: it is exactly the fixture
    expect(listTree(r.legacyProjectDir)).toEqual(r.fixture);

    // the user's real store was not used
    for (const candidate of realStoreRooms(leaf)) {
      expect(fs.existsSync(candidate)).toBe(false);
    }
  },
  CHILD_TIMEOUT_MS,
);
