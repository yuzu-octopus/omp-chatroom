// session-miner: stream omp session .jsonl files, count tool usage.
// Usage: bun scripts/session-miner.ts [roots...] [--json] [--bench]
//   roots default to every project dir + rooms/ under the sessions store.
//   No globbing of the store: roots come from argv or readdir of one known dir.
// Reads ONE line at a time (never whole-file); skips JSON.parse for lines
// that cannot be tool events (substring prefilter).

import * as fs from "node:fs";
import * as path from "node:path";

const STORE = `${process.env.HOME}/.omp/agent/sessions`;

// --- spec: what counts as what. Extend here, not in the loop. ---
type Query = { name: string; tools?: Set<string>; pathPrefix?: string; textNeedle?: string };
const DEFAULT_QUERIES: Query[] = [
	{ name: "task(spawn)", tools: new Set(["task"]) },
	{ name: "write agent://", tools: new Set(["write"]), pathPrefix: "agent://" },
	{ name: "read agent://", tools: new Set(["read"]), pathPrefix: "agent://" },
	// TODO(user): real irc:// traffic is rare/host-side; doc chatter dominates "irc" text hits.
	// Keep the needle narrow until a real sample shows its shape.
	{ name: "room", tools: new Set(["room"]) },
	{ name: "wait_for_claim", tools: new Set(["wait_for_claim"]) },
	{ name: "wait_for_agent", tools: new Set(["wait_for_agent"]) },
	{ name: "wait_for_message", tools: new Set(["wait_for_message"]) },
	{ name: "wait(native)", tools: new Set(["wait"]) },
];

// Room ops ride in the toolCall arguments; outcomes in the toolResult details.
// Fixed-string slices (no regex): measured ~1.7x faster than JSON.parse-everything.
const OP_NEEDLE = `"name":"room","arguments":{`;
const OUTCOME_TOOLS = [
	`"toolName":"room"`,
	`"toolName":"wait_for_claim"`,
	`"toolName":"wait_for_agent"`,
	`"toolName":"wait_for_message"`,
];

type FileStats = {
	file: string;
	lines: number;
	toolCalls: number;
	perTool: Map<string, number>;
	perRoomOp: Map<string, number>;
	perOutcome: Map<string, number>;
	queries: number[];
};

const emptyStats = (file: string, nq: number): FileStats => ({
	file,
	lines: 0,
	toolCalls: 0,
	perTool: new Map(),
	perRoomOp: new Map(),
	perOutcome: new Map(),
	queries: new Array(nq).fill(0),
});

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

// One pass, line-at-a-time, zero JSON.parse: fixed-string slices only.
// (Measured on real logs: this beats JSON.parse-everything ~1.7x; Bun.JSONL ties parse.)
async function scanFile(file: string, queries: Query[]): Promise<FileStats> {
	const st = emptyStats(file, queries.length);
	const stream = Bun.file(file).stream();
	const decoder = new TextDecoder();
	let pending = "";
	for await (const chunk of stream) {
		const lines = (pending + decoder.decode(chunk, { stream: true })).split("\n");
		pending = lines.pop()!;
		for (let li = 0; li < lines.length; li++) {
			const line = lines[li]!;
			st.lines++;
			// toolCall lines carry name+arguments; toolResult lines carry toolName+details.
			const isCall = line.includes('"toolCall"');
			// Fixed-string name slice: the name value never contains a quote, so indexOf is exact.
			let name = "";
			if (isCall) {
				const at = line.indexOf('"name":"', line.indexOf('"toolCall"'));
				if (at < 0) continue;
				const s = at + 8;
				const e = line.indexOf('"', s);
				if (e < 0) continue;
				name = line.slice(s, e);
			} else {
				if (!line.includes('"role":"toolResult"')) continue;
				const at = line.indexOf('"toolName":"');
				if (at < 0) continue;
				const s = at + 12;
				const e = line.indexOf('"', s);
				if (e < 0) continue;
				name = line.slice(s, e);
			}
			if (!name) continue;
			st.toolCalls++;
			bump(st.perTool, name);
			for (let i = 0; i < queries.length; i++) {
				const q = queries[i]!;
				if (q.tools && !q.tools.has(name)) continue;
				if (q.pathPrefix && !line.includes(`"path":"${q.pathPrefix}`)) continue;
				if (q.textNeedle && !line.includes(q.textNeedle)) continue;
				st.queries[i]!++;
			}
			if (name === "room") {
				if (isCall) {
					// op is a short alpha value inside the SAME arguments object; the first
					// `"op":"` after the room needle is it (verify: counts must match the old regex).
					const at = line.indexOf(OP_NEEDLE);
					if (at >= 0) {
						const os = line.indexOf('"op":"', at);
						if (os >= 0) {
							const s = os + 6;
							const e = line.indexOf('"', s);
							if (e >= 0) bump(st.perRoomOp, line.slice(s, e));
						}
					}
				} else {
					const d = line.indexOf('"details":{"ok":');
					if (d >= 0) {
						const okTrue = line.startsWith("true", d + 16);
						const oo = line.indexOf('"outcome":"', d);
						const outcome =
							oo >= 0 ? line.slice(oo + 11, line.indexOf('"', oo + 11)) : okTrue ? "ok" : "err";
						bump(st.perOutcome, `${name}:${outcome}`);
					}
				}
			} else if (!isCall) {
				for (let t = 0; t < OUTCOME_TOOLS.length; t++) {
					if (!line.includes(OUTCOME_TOOLS[t]!)) continue;
					const d = line.indexOf('"details":{"ok":');
					if (d < 0) break;
					const okTrue = line.startsWith("true", d + 16);
					const oo = line.indexOf('"outcome":"', d);
					const outcome =
						oo >= 0 ? line.slice(oo + 11, line.indexOf('"', oo + 11)) : okTrue ? "ok" : "err";
					bump(st.perOutcome, `${name}:${outcome}`);
					break;
				}
			}
		}
	}
	pending += decoder.decode();
	if (pending.length > 0) {
		st.lines++;
		if (pending.includes('"toolCall"') || pending.includes('"role":"toolResult"')) {
			const m = /"(?:name|toolName)":"([a-zA-Z0-9_:-]+)"/.exec(pending);
			if (m?.[1]) {
				st.toolCalls++;
				bump(st.perTool, m[1]);
			}
		}
	}
	return st;
}

function defaultRoots(): string[] {
	const roots: string[] = [];
	for (const e of fs.readdirSync(STORE, { withFileTypes: true })) {
		if (!e.isDirectory()) continue;
		// Session dirs hold *.jsonl directly; rooms/ holds one dir per room root.
		if (e.name === "rooms") {
			for (const r of fs.readdirSync(path.join(STORE, "rooms"), { withFileTypes: true })) {
				if (r.isDirectory()) roots.push(path.join(STORE, "rooms", r.name));
			}
		} else {
			roots.push(path.join(STORE, e.name));
		}
	}
	return roots;
}
function* jsonlFiles(roots: string[]): Generator<string> {
	for (const root of roots) {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(root, { withFileTypes: true });
		} catch {
			continue; // shortcut: unreadable root is skipped, not fatal
		}
		for (const e of entries) {
			if (e.isFile() && e.name.endsWith(".jsonl")) yield path.join(root, e.name);
			// Room logs sit one level down: rooms/<hash>/room/*.jsonl
			if (e.isDirectory() && e.name === "room") {
				const dir = path.join(root, "room");
				try {
					for (const f of fs.readdirSync(dir)) {
						if (f.endsWith(".jsonl")) yield path.join(dir, f);
					}
				} catch {
					/* skip */
				}
			}
		}
	}
}

async function main() {
	const args = process.argv.slice(2);
	const asJson = args.includes("--json");
	const bench = args.includes("--bench");
	const given = args.filter((a) => !a.startsWith("--"));
	const queries = DEFAULT_QUERIES;
	// Bare .jsonl args are files (handy for benching one session); dirs are roots.
	const files =
		given.length > 0 && given.every((g) => g.endsWith(".jsonl"))
			? given
			: [...jsonlFiles(given.length ? given : defaultRoots())];
	const t0 = performance.now();
	let bytes = 0;
	const agg: FileStats = emptyStats("<total>", queries.length);
	const perTool = agg.perTool;
	const perRoomOp = agg.perRoomOp;
	const perOutcome = agg.perOutcome;
	// Sequential: one 256MB file at a time beats parallel reads on one disk.
	for (const f of files) {
		bytes += (await Bun.file(f).stat()).size;
		const st = await scanFile(f, queries);
		agg.lines += st.lines;
		agg.toolCalls += st.toolCalls;
		for (const [k, v] of st.perTool) perTool.set(k, (perTool.get(k) ?? 0) + v);
		for (const [k, v] of st.perRoomOp) perRoomOp.set(k, (perRoomOp.get(k) ?? 0) + v);
		for (const [k, v] of st.perOutcome) perOutcome.set(k, (perOutcome.get(k) ?? 0) + v);
		for (let i = 0; i < queries.length; i++) agg.queries[i]! += st.queries[i]!;
	}
	const ms = performance.now() - t0;

	if (asJson) {
		console.log(
			JSON.stringify(
				{
					files: files.length,
					bytes,
					lines: agg.lines,
					toolCalls: agg.toolCalls,
					ms: Math.round(ms),
					mbPerSec: +(bytes / 1048576 / (ms / 1000)).toFixed(1),
					tools: Object.fromEntries([...perTool].sort((a, b) => b[1] - a[1])),
					roomOps: Object.fromEntries([...perRoomOp].sort((a, b) => b[1] - a[1])),
					outcomes: Object.fromEntries([...perOutcome].sort((a, b) => b[1] - a[1])),
					queries: Object.fromEntries(queries.map((q, i) => [q.name, agg.queries[i]])),
				},
				null,
				1,
			),
		);
		return;
	}
	const top = [...perTool].sort((a, b) => b[1] - a[1]);
	console.log(
		`files ${files.length} · ${(bytes / 1073741824).toFixed(2)}GB · ${agg.lines} lines in ${ms.toFixed(0)}ms`,
	);
	console.log(`tool calls ${agg.toolCalls} — top 15:`);
	for (const [k, v] of top.slice(0, 15)) {
		console.log(`  ${String(v).padStart(7)}  ${k}  (${((100 * v) / agg.toolCalls).toFixed(1)}%)`);
	}
	console.log(`room ops (${[...perRoomOp.values()].reduce((a, b) => a + b, 0)} parsed):`);
	for (const [k, v] of [...perRoomOp].sort((a, b) => b[1] - a[1]))
		console.log(`  ${String(v).padStart(7)}  ${k}`);
	console.log(`outcomes: ${[...perOutcome].map(([k, v]) => `${k}=${v}`).join(" ")}`);
	console.log(`queries:`);
	for (let i = 0; i < queries.length; i++)
		console.log(`  ${String(agg.queries[i]).padStart(7)}  ${queries[i]!.name}`);
	if (bench) console.log(`throughput ${(bytes / 1048576 / (ms / 1000)).toFixed(1)} MB/s`);
}

await main();
