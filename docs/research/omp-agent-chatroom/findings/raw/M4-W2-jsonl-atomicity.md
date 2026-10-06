# M4-W2 — omp JSONL write pattern + safe atomic-append primitive for a multi-session room log

## Angle

Determine (a) the exact house pattern omp uses to append JSONL session entries and its durability policy, and (b) which primitive a plugin may safely use for a shared append-only JSONL room log written by multiple sessions inside ONE process. Deliverables: ONE chosen primitive with exact call + cited source, partial-line + fsync policy, locking verdict, and fs.watch vs EventBus verdict.

## Claims

### House pattern — omp appends session JSONL with `fs.writeSync` on a held `O_APPEND` fd

- Session descriptors are opened once for the writer's lifetime with numeric flags `SESSION_WRITE_FLAGS | O_APPEND`, via `openCloexecSync`: `const SESSION_WRITE_FLAGS = fs.constants.O_WRONLY | fs.constants.O_CREAT;` and `this.#fd = openCloexecSync(fpath, SESSION_WRITE_FLAGS | (flags === "w" ? fs.constants.O_TRUNC : fs.constants.O_APPEND));` — `~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/session/session-storage.ts:24,244-247` (fetch 2026-10-06) — confidence: primary
- The append itself is a synchronous `fs.writeSync` loop over a UTF-8 buffer on the held fd (no position arg → kernel file offset; O_APPEND makes offset+write atomic): `const written = fs.writeSync(this.#fd, buf, offset, buf.length - offset);` inside `#writeNow(line, originalSize)` — `session-storage.ts:307-318` (fetch 2026-10-06) — confidence: primary
- Append is deliberately synchronous and in-body (`appendSync`), explicitly to survive a software crash after the call returns: "Write in-body so software crash after the call still sees the entry." — `session-storage.ts:350-359` (fetch 2026-10-06) — confidence: primary
- On a write error the writer rolls back to the pre-append size with `fs.ftruncateSync(this.#fd, originalSize)` (Windows falls back to reopening without O_APPEND and identity-checking inode/dev before truncating), so a failed append does not leave partial bytes — `session-storage.ts:319-347` (fetch 2026-10-06) — confidence: primary
- Manager call site takes the sync fast path: `if (writer.appendSync && !this.#storage.defersSyncPublish) { writer.appendSync(line); this.#recordDurableAppend(line); }` — `session-manager.ts:1737-1740` (fetch 2026-10-06) — confidence: primary
- Serialization line MUST include the trailing newline: "`line` MUST include the trailing newline." — `session-storage.ts:43` (fetch 2026-10-06) — confidence: primary

### House pattern — no fsync anywhere; durability = OS page cache

- Interface contract states no fsync: "No `fsync` — power loss may still drop the last page." and "Resolve once all queued appends complete. No fsync." / "Drain synchronously flushable queued work when the backend supports it. No fsync." — `session-storage.ts:39-40,54-57` (fetch 2026-10-06) — confidence: primary
- flush/flushSync are no-op drains on the file backend: "flush/flushSync remain no-op drains (no fsync)." — `session-storage.ts:356` (fetch 2026-10-06) — confidence: primary
- Manager doc restates the policy: entries "are handed to the OS synchronously in-body on append and never `fsync`'d. In-flight streaming text is intentionally not durable until `message_end` persists the finished message." — `session-manager.ts:771-773` (fetch 2026-10-06) — confidence: primary
- grep for `fsync|fdatasync|.sync()|O_SYNC|O_DSYNC` across `src/session/` + `@oh-my-pi/pi-utils/src` returns ONLY prose saying "no fsync"; the sole real `.sync()` is `await handle.sync()` on a settings write (`config/settings.ts:3503`), not the session transcript — grep result, `src/session/` (fetch 2026-10-06) — confidence: primary
- Whole-repo grep shows no `appendFileSync` and no O_SYNC usage; the other JSONL appenders are async: `await fs.appendFile(this.path, ...records..., "utf8")` (blob-broker savings) and `await fs.promises.appendFile(logPath, ...)` (edit blackbox) — `src/blob-broker/savings.ts:128`, `src/edit/blackbox.ts:36` (fetch 2026-10-06) — confidence: primary

### House pattern — write queue/mutex is per-rewrite, not per-append

- There is a cross-process publish lock used ONLY to serialize an append against a concurrent full-file atomic rewrite's check-then-rename: "The publish lock serializes the append against a concurrent rewrite's check-then-rename, which would otherwise erase the appended turn." — `session-storage.ts:357-358` (fetch 2026-10-06) — confidence: primary
- Lock primitive is OS-backed advisory: `FileLock as NativeFileLock` from `@oh-my-pi/pi-natives`; on Linux it is an abstract-socket lock (no filesystem), on Windows a named mutex, elsewhere a `flock` sidecar — `session-storage.ts:5,545-561`; `~/.bun/install/global/node_modules/@oh-my-pi/pi-utils/src/file-lock.ts:5,43-44` (fetch 2026-10-06) — confidence: primary
- `@oh-my-pi/pi-coding-agent` package.json dependencies contain NO `proper-lockfile`/`async-mutex`/`write-file-atomic`/`fs-ext`/lockfile library — deps are `@oh-my-pi/*` + `@opentelemetry/*` + `@babel/parser` + `axe-core` + `puppeteer-core` — `~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/package.json` (fetch 2026-10-06) — confidence: primary
- No global append queue/mutex exists; `#appendToSessionFile` takes the sync hot path directly ("Hot path: write the entry directly on the writer, outside the async disk chain.") — `session-manager.ts:1726-1739` (fetch 2026-10-06) — confidence: primary

### Atomicity — safe primitives for multi-writer append-only JSONL in one process

- Linux guarantees the atomicity of O_APPEND append: "If the file was open(2)ed with O_APPEND, the file offset is first set to the end of the file before writing. The adjustment of the file offset and the write operation are performed as an atomic step." — https://man7.org/linux/man-pages/man2/write.2.html (fetch 2026-10-06) — confidence: primary
- POSIX/Linux also make `write()` offset updates atomic across processes sharing an open file description, fixed in Linux 3.14: "before Linux 3.14, this was not the case... This problem was fixed in Linux 3.14." — https://man7.org/linux/man-pages/man2/write.2.html (fetch 2026-10-06) — confidence: primary
- Node documents the append-mode positional-write behavior: "On Linux, positional writes do not work when the file is opened in append mode. The kernel ignores the position argument and always appends the data to the end of the file." — https://nodejs.org/api/fs.html (`filehandle.write`, fetch 2026-10-06) — confidence: primary
- `fs.appendFileSync(path, data[, options])` opens with `flag` default `'a'` and supports `flush` (fsync-before-close, default `false`): options `flag` "Default: `'a'`", `flush` "If `true`, the underlying file descriptor is flushed prior to closing it. Default: `false`." — https://nodejs.org/api/fs.html (fetch 2026-10-06) — confidence: primary
- `fs.appendFileSync` accepts a numeric fd and does NOT close it: "The `path` may be specified as a numeric file descriptor that has been opened for appending... The file descriptor will not be closed automatically." — https://nodejs.org/api/fs.html (fetch 2026-10-06) — confidence: primary
- `Bun.write(destination, data)` is NOT an append API: it "overwrites an existing destination and truncates it if the new content is shorter" — https://bun.sh/reference/bun/write (fetch 2026-10-06) — confidence: secondary
- `Bun.file(path).writer()` (`FileSink`) exposes only `write/flush/end/start/ref/unref` and documented options are `highWaterMark` only — no append/truncate/open-flag: `interface FileSink { write(...): number; flush(): number | Promise<number>; end(...): number | Promise<number>; start(options?: { highWaterMark?: number }): void; ref(): void; unref(): void; }` — https://bun.sh/docs/runtime/file-io (fetch 2026-10-06) — confidence: primary
- Bun docs recommend `node:fs` for what Bun's native file APIs do not cover: "For operations they don't cover, such as `mkdir` or `readdir`, use Bun's nearly complete implementation of the `node:fs` module." — https://bun.sh/docs/runtime/file-io (fetch 2026-10-06) — confidence: primary
- Sync calls are serialized by the single JS thread, so two sessions in one process can never interleave bytes inside a sync `fs.writeSync`; the hazard is ASYNC writes (`fs.promises.appendFile` / `Bun.write` / FileSink auto-flush), where the threadpool can run two appends concurrently on distinct fds and (without O_APPEND) race the offset — https://nodejs.org/api/fs.html states the promise API is "not synchronized or threadsafe. Care must be taken when performing multiple concurrent modifications on the same file or data corruption may occur." (fetch 2026-10-06) — confidence: primary

### Partial-line handling

- A reader MUST tolerate a malformed final line: omp's own blob-broker journal scan is documented as "Aggregate the durable journal in one linear scan; malformed lines are ignored." — `src/blob-broker/savings.ts:91-92` (fetch 2026-10-06) — confidence: primary
- With a single `fs.writeSync(fd, wholeLineBuffer, ..., null)` on an O_APPEND fd, one line = one `write(2)`; the kernel makes offset-adjust+write atomic, so within one process torn/interleaved lines cannot occur from concurrency — only from a short write (handled by the house retry loop) or a process kill / ENOSPC mid-write — https://man7.org/linux/man-pages/man2/write.2.html + `session-storage.ts:311-318` (fetch 2026-10-06) — confidence: primary
- A short write is detectable (`writeSync` returns bytes written; house code throws on 0) and can be resumed; a torn final line is therefore only observable after an abrupt kill between the partial write and the retry — `session-storage.ts:311-318` (fetch 2026-10-06) — confidence: primary

### Locking

- Node/Bun expose NO `flock`/`fcntl` locking in `node:fs`: the fs API surface has no `flock`; the only OS-backed lock omp has is the native `@oh-my-pi/pi-natives` `FileLock` (abstract socket on Linux / named mutex on Windows / flock sidecar elsewhere) — `session-storage.ts:545-561`, `pi-utils/src/file-lock.ts:5` (fetch 2026-10-06) — confidence: primary
- In-process file locking is UNNECESSARY when every writer is the same process and writes are synchronous: the JS event loop serializes sync `fs.writeSync` calls and O_APPEND makes each write(2) atomic; a lock is only needed if a second PROCESS writes the same file (then a cross-process advisory lock like omp's `NativeFileLock` / a `proper-lockfile`-style lockfile is required, or accept O_APPEND-only atomicity with no multi-process rewrite) — derived from https://man7.org/linux/man-pages/man2/write.2.html + `session-storage.ts:357-358` (fetch 2026-10-06) — confidence: primary

### Notification

- `EventBus` is an in-process pub/sub with a `Map<string, Set<handler>>`; `emit` calls handlers synchronously, `on` returns an unsubscribe — `src/utils/event-bus.ts:3-28` (fetch 2026-10-06) — confidence: primary
- Each top-level session gets its OWN `EventBus` (`const eventBus = options.eventBus ?? new EventBus();` in `createAgentSession`), and the CLI constructs a fresh one per session — so `pi.events` is NOT shared across sibling sessions unless the embedder passes the same instance — `src/sdk.ts:1632`, `src/main.ts:2278-2282` (fetch 2026-10-06) — confidence: primary
- `AgentRegistry.global()` is a process-wide singleton with `onChange(listener: RegistryListener): () => void` and `#emit` dispatching to listeners synchronously, so it IS shared across all sessions in one process — `src/registry/agent-registry.ts:112-120,348-361` (fetch 2026-10-06) — confidence: primary
- The collab host already uses this shared registry for cross-agent notification: `this.#registryUnsubscribe = AgentRegistry.global().onChange(() => this.#scheduleAgentsBroadcast());` — `src/collab/host.ts:467` (fetch 2026-10-06) — confidence: primary
- omp uses `fs.watch` only for config reload and watches the DIRECTORY not the file, debouncing events: "Watching directories (not files) keeps atomic rename-over writes observable." with `CONFIG_WATCH_DEBOUNCE_MS` — `src/config/settings.ts:1149-1196` (fetch 2026-10-06) — confidence: primary
- The extension module is imported once and its factory rebound per session, so a module-level singleton (listener set / room store) in the extension file IS shared across every session in the process — matches brief (verified) — confidence: primary

## Searches

- `grep -n 'appendFile|createWriteStream|writeFile|writeSync|fsync|O_SYNC|durable'` over `src/session/` → session-storage.ts:24,313,356 etc.
- `grep -n 'appendFileSync|appendFile\(|\.jsonl'` over `src/` → blob-broker/savings.ts:128, edit/blackbox.ts:36, no appendFileSync.
- `grep -rn 'fsync|fdatasync|\.sync\(\)|O_SYNC|O_DSYNC'` over `src/session/` + `pi-utils/src` → prose only + settings.ts:3503.
- `grep -n 'appendSync|append\(|#appendToSessionFile|writeQueue|#diskQueue'` over session-manager.ts → 1655,1737-1748,2571.
- `grep -rn 'fs.watch|watchFile|inotify'` over `src/` → settings.ts:1169 only.
- `grep -rn 'class AgentRegistry|onChange'` → registry/agent-registry.ts:112,348.
- `grep -n 'lockfile|mutex|atomic|fs-ext'` in package.json deps → none.
- Fetch https://bun.sh/docs/runtime/file-io (2026-10-06) → Bun.write, FileSink, node:fs recommendation.
- Fetch https://nodejs.org/api/fs.html (2026-10-06) → appendFileSync, write, fsyncSync, createWriteStream fsync option.
- Fetch https://man7.org/linux/man-pages/man2/write.2.html (2026-10-06) → O_APPEND atomicity, Linux 3.14 fix.

## Conflicting evidence

- Bun's own `FileSink` (`file.writer()`) is used by omp for stream recordings and daemon logs (`src/stream/recording.ts:160`, `src/launch/broker.ts:234,325`) — this is a truncating/positional writer, NOT an append writer, and the Bun docs list no append/flag option. So the house JSONL-append pattern (session transcripts) deliberately does NOT use `Bun.write`/FileSink; the two coexist for different jobs. No true conflict — resolved in favor of `fs.writeSync`+O_APPEND for appends.
- `fs.appendFileSync(path, line, { flag: "a" })` is ALSO safe (O_APPEND + single write), but reopens the fd each call and cannot hold a CLOEXEC fd; omp's `openCloexecSync` helper exists specifically because Bun's `fs.open*` does not set O_CLOEXEC and child shells would inherit the handle (`pi-utils/src/fs-open.ts:14-30`). House pattern (held CLOEXEC fd) is strictly better for a long-lived room log.

## Gaps

- No Bun doc page states O_APPEND semantics for `FileSink`; the "no append option" conclusion is from the documented API surface + reference (`Bun.write` truncates), not a positive "cannot append" statement — RISK-flagged below.
- `PIPE_BUF` is a PIPE/socket concept; it does NOT bound regular-file write atomicity. Regular-file O_APPEND writes are atomic as a whole (write.2), so no PIPE_BUF caveat applies to a file-backed room log.
- Did not audit `@oh-my-pi/pi-natives` native source (only the packaged binary is present) for the exact Linux lock syscall; behavior is documented in comments (`session-storage.ts:545-548`).

## Recommendation (chosen primitive)

**Chosen primitive:** a single held file descriptor opened once with `O_WRONLY | O_CREAT | O_APPEND` (via `openCloexecSync`), then one synchronous whole-line write per record:

```ts
import * as fs from "node:fs";
const fd = openCloexecSync(roomLogPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND);
// per record (line MUST end with "\n"):
const buf = Buffer.from(line, "utf-8");
let offset = 0;
while (offset < buf.length) {
  const written = fs.writeSync(fd, buf, offset, buf.length - offset);
  if (written === 0) throw new Error("Short write");
  offset += written;
}
```

- Cited source: house pattern `session-storage.ts:244-247` (`openCloexecSync(..., SESSION_WRITE_FLAGS | O_APPEND)`) + `session-storage.ts:307-318` (`fs.writeSync` loop); atomicity https://man7.org/linux/man-pages/man2/write.2.html (fetch 2026-10-06).
- Do NOT use `Bun.write` (truncates) or `Bun.file(...).writer()` (no append flag). Do NOT use async `fs.promises.appendFile` (threadpool interleaving hazard).
- **Partial-line policy:** reader splits on `\n`, `JSON.parse` each complete line, and on the FIRST parse failure stops at the last valid line (house precedent: "malformed lines are ignored", `savings.ts:91-92`). Writer cannot produce interleaved lines within one process; a torn FINAL line is possible only on process kill / ENOSPC mid-write between a short write and its retry.
- **fsync policy:** NO fsync (matches omp: `session-storage.ts:39-40,54-57,356`). Durability = OS page cache; power loss may drop the last page. If stronger durability is ever required, `fs.fsyncSync(fd)` after each record (https://nodejs.org/api/fs.html).
- **Locking verdict:** NO in-process lock needed — sync writes are serialized by the event loop and O_APPEND makes each `write(2)` atomic. A cross-process advisory lock (omp's `NativeFileLock`, or a lockfile) is required ONLY if a second PROCESS appends/rewrites the same room log; there is no `flock`/`fcntl` in `node:fs`.
- **Notification verdict:** use an in-process notification (module-level singleton emitter in the extension module, shared across sessions, and/or `AgentRegistry.global().onChange` which is process-global — `agent-registry.ts:112-120,348`). Do NOT rely on `pi.events` (per-session `EventBus` — `sdk.ts:1632`) or on `fs.watch` (omp only uses it for debounced config-dir reload — `settings.ts:1149-1196`); `fs.watch` has inotify coalescing/latency and is only needed to observe a second process.

## RISK

- RISK: `Bun.file(path).writer()` has no documented append mode; relying on it for appends is unsupported. Fallback: the `node:fs` O_APPEND fd + `fs.writeSync` pattern above (which Bun implements via node:fs compat — https://bun.sh/docs/runtime/file-io).
- RISK: a second PROCESS writing the room log would break the single-process atomicity assumption (no cross-process lock in the recommended design). Fallback: adopt omp's `@oh-my-pi/pi-natives` `FileLock` / `tryAcquireFileLock` advisory lock around appends (`pi-utils/src/file-lock.ts:43-44`), or an `O_APPEND`-only multi-process design with the reader's torn-line tolerance.
- RISK: a torn final line after process kill is undetectable as "incomplete" vs "corrupt" without a length/checksum field. Fallback: reader stops at last valid JSON line (accepted house policy) or the record carries a trailing sequence number so a torn line is identifiable.
