#!/usr/bin/env bash
#
# Claude Code adapter for `dixti capture`. See hooks/README.md for other hosts.
#
# All this does is reshape dixti's output into the JSON envelope Claude Code's Stop hook expects.
# The instruction text and the decision of whether to ask at all live in dixti (src/capture.ts), so
# every host asks the same thing under the same conditions.
#
#   "Stop": [{ "hooks": [{ "type": "command",
#      "command": "$HOME/dev/dixti/hooks/session-stop.sh", "timeout": 15 }] }]
#
# Do NOT install alongside another blocking Stop hook — two of them re-wake the agent twice at every
# stop. Instead call `dixti capture --session "$sid"` from the hook you already have and append its
# stdout to your own instructions.
set -uo pipefail

DIXTI="${DIXTI_BIN:-dixti}"
command -v "$DIXTI" >/dev/null 2>&1 || command -v node >/dev/null 2>&1 || exit 0

# Claude Code sends the Stop payload on stdin. sed rather than jq or node: the session id is the
# only field needed, and requiring a JSON parser to read one string would add a dependency to the
# thinnest part of the system.
input=$(cat)
sid=$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
[ -n "$sid" ] || sid="default"

# Exits 1 and prints nothing when it is not worth asking.
prompt=$("$DIXTI" capture --session "$sid" ${DIXTI_CAPTURE_THROTTLE:+--throttle "$DIXTI_CAPTURE_THROTTLE"}) || exit 0
[ -n "$prompt" ] || exit 0

printf '%s' "$prompt" | node -e '
let s = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => { s += d; });
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ decision: "block", reason: s }));
});
'
