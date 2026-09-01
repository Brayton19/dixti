#!/usr/bin/env bash
#
# dixti SessionStart hook — injects the topic list into every session.
#
# This is an adapter, not part of dixti: it translates `dixti dict` into the JSON envelope Claude
# Code expects on stdout. Codex, Cursor and Zed get their own file next to this one; none of them
# belongs in src/.
#
# Install (Claude Code, ~/.claude/settings.json):
#   "SessionStart": [{ "hooks": [{ "type": "command",
#      "command": "$HOME/dev/dixti/hooks/session-start.sh", "timeout": 15 }] }]
#
# Environment (all optional):
#   DIXTI_BIN      dixti executable. Default: `dixti` on PATH, else this repo's dist/cli.js.
#   DIXTI_DIR      store root. Default: the git top level of $PWD, else $PWD.
#   DIXTI_ADAPT    comma-separated dirs of plain ###-headed markdown to adapt and inject as well.
#   DIXTI_EXCLUDE  comma-separated directory or file basenames to skip inside it, e.g. `archive`.
#                  Prefer this over listing sub-directories in DIXTI_ADAPT: the dictionary prints the
#                  command a reader must type to expand a topic, and eight paths in that line is a
#                  command nobody will run.
#   DIXTI_TITLE    heading for the adapted corpus. Default: "What your notes have learned".
#   DIXTI_BUDGET   token ceiling per list. Over it, topics collapse to counts. Default 4000.
#
# It is silent on every failure. A session that starts without its notes is worse off; a
# session that fails to start because a hook errored is unusable, and this hook is never the point
# of the session.
set -uo pipefail

BUDGET="${DIXTI_BUDGET:-4000}"
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------- resolve dixti
if [ -n "${DIXTI_BIN:-}" ]; then
  DIXTI=("$DIXTI_BIN")
elif command -v dixti >/dev/null 2>&1; then
  DIXTI=(dixti)
elif [ -f "$HOOK_DIR/../dist/cli.js" ] && command -v node >/dev/null 2>&1; then
  DIXTI=(node "$HOOK_DIR/../dist/cli.js")
else
  exit 0
fi

# ---------------------------------------------------------------- resolve store
ROOT="${DIXTI_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || printf '%s' "$PWD")}"

body=""
add() {   # stdout of a dict run, or nothing
  local out
  out="$("$@" 2>/dev/null)" || return 0
  [ -n "$out" ] || return 0
  [ -n "$body" ] && body+=$'\n\n---\n\n'
  body+="$out"
}

[ -d "$ROOT/.agents" ] && add "${DIXTI[@]}" dict "$ROOT" --budget "$BUDGET"

if [ -n "${DIXTI_ADAPT:-}" ]; then
  adapt_args=(dict --adapt "$DIXTI_ADAPT" --budget "$BUDGET"
              --title "${DIXTI_TITLE:-What your notes have learned}")
  [ -n "${DIXTI_EXCLUDE:-}" ] && adapt_args+=(--exclude "$DIXTI_EXCLUDE")
  add "${DIXTI[@]}" "${adapt_args[@]}"
fi

[ -n "$body" ] || exit 0

# ---------------------------------------------------------------- emit
# node rather than jq: dixti already requires node, and jq is not installed everywhere.
printf '%s' "$body" | node -e '
let s = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => { s += d; });
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: s },
  }));
});
'
