#!/usr/bin/env bash
# Discovery probe: does a real model with NO room instruction reach for the room
# before touching a shared file? Exit 0 = claimed first (discovery works);
# exit 1 = edited without claiming (discovery failed); exit 2 = harness error.
#
# The prompt (discovery-prompt.txt) is the instrument and MUST NOT drift between
# runs — no room vocabulary ("claim"/"board"/"coordinate") or the trial measures
# prompt-following instead of discovery. APPDIR is substituted per trial.
#
# Costs one live model turn per run. Requires a keyed model (`omp --mode text`
# must work); without one the probe reports HARNESS-ERROR, not failure.
set -u
cd "$(dirname "$0")"

TRIAL_DIR=$(mktemp -d /tmp/discovery-XXXX)
trap 'rm -rf "$TRIAL_DIR"' EXIT
echo "shared content" > "$TRIAL_DIR/shared.txt"
PROMPT=$(sed "s|APPDIR|$TRIAL_DIR|g" discovery-prompt.txt)

OUT="$TRIAL_DIR/events.jsonl"
if ! timeout 500 omp --mode json "$PROMPT" > "$OUT" 2>"$TRIAL_DIR/stderr.txt"; then
  echo "HARNESS-ERROR: omp exited $?. Check $TRIAL_DIR/stderr.txt (model key? timeout?)"
  exit 2
fi

python3 - "$OUT" <<'EOF'
import json, re, sys

room_claim_at = None
first_mutation_at = None
EDIT_TOOLS = {"edit", "write"}
TARGET = "shared.txt"
# A model that appends with `printf 'x' >> shared.txt` MUTATED the file without ever calling
# edit/write. Missing that made the probe report HARNESS-ERROR ("the model did nothing") for a
# trial where the model had in fact done everything asked — a false negative on the miss rate.
REDIRECT = re.compile(r"(?:>>|>)\s*([^\s;&|]+)")
MUTATOR = re.compile(r"\b(sed\s+-i|tee|truncate)\b")


def bash_mutates(cmd: str) -> bool:
    for m in REDIRECT.finditer(cmd):
        if m.group(1).strip("'\"`").endswith(TARGET):
            return True
    return bool(MUTATOR.search(cmd))


seq = 0
for line in open(sys.argv[1]):
    line = line.strip()
    if not line:
        continue
    try:
        e = json.loads(line)
    except ValueError:
        continue
    if e.get("type") != "tool_execution_start":
        continue
    seq += 1
    name = e.get("toolName", "")
    args = e.get("args", {}) or {}
    if name == "room" and args.get("op") == "claim" and room_claim_at is None:
        room_claim_at = seq
    if first_mutation_at is not None:
        continue
    if name in EDIT_TOOLS:
        first_mutation_at = seq
    elif name == "bash" and bash_mutates(str(args.get("command", ""))):
        first_mutation_at = seq

if room_claim_at is None and first_mutation_at is None:
    print("HARNESS-ERROR: no room-claim and no mutation observed (model did nothing recognizable)")
    sys.exit(2)
if room_claim_at is not None and (first_mutation_at is None or room_claim_at < first_mutation_at):
    print(f"DISCOVERED: room claim at event {room_claim_at}, first mutation at {first_mutation_at}")
    sys.exit(0)
print(f"NOT-DISCOVERED: first mutation at event {first_mutation_at}, room claim at {room_claim_at}")
sys.exit(1)
EOF
