#!/usr/bin/env bash
#
# Fail if anything private is about to be committed.
#
# dixti is a notes tool, so the repo that develops it keeps ending up with fragments of the corpora
# it was tested against — private repo names, absolute home paths, a corpus that belongs to someone's
# employer. Every one of those got in because somebody meant to remember, and git history is
# permanent: by the time a repo goes public, "I'll scrub it later" is already too late.
#
# Two layers:
#
#   1. GENERIC patterns, checked always and in CI. Absolute home paths, email addresses, private
#      SSH/PGP key headers. These do not name anyone, so they live here in the open.
#   2. A PRIVATE denylist of literal terms — employer, project code names, usernames — read from
#      $DIXTI_DENYLIST or ./.dixti-denylist (gitignored) or ~/.dixti-denylist. Skipped with a notice
#      when absent, because the list itself must never be committed: a file enumerating what you are
#      hiding is worse than the terms it hides.
#
# Usage: scripts/check-private.sh [--staged]
#   default    scan tracked files in the working tree
#   --staged   scan only what is staged, for a pre-commit hook
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 0

mode="${1:-}"
if [ "$mode" = "--staged" ]; then
  list_files() { git diff --cached --name-only --diff-filter=ACM; }
else
  list_files() { git ls-files; }
fi

# `mapfile` is bash 4+; macOS still ships bash 3.2, and a guard that only runs on the maintainer's
# machine is not a guard. Read into the array the portable way.
# The lockfile is skipped: generated, enormous, and full of hashes that trip content checks.
KEEP=()
while IFS= read -r f; do
  case "$f" in
    package-lock.json|*.lock) continue ;;
  esac
  [ -f "$f" ] && KEEP+=("$f")
done < <(list_files)
[ ${#KEEP[@]} -gt 0 ] || exit 0

fail=0
hit() {   # $1 = label, $2 = grep output
  printf '\n  %s\n' "$1"
  printf '%s\n' "$2" | sed 's/^/    /'
  fail=1
}

# ---------------------------------------------------------------- generic
# An absolute home path names a person and reveals a machine layout. It is also the single most
# common leak, because it arrives inside a default value or a test fixture rather than in prose.
out=$(grep -nE '/(Users|home)/[a-z0-9_.-]+' "${KEEP[@]}" 2>/dev/null | grep -v '<user>' | grep -v '/home/runner')
[ -n "$out" ] && hit "absolute home path (names a person, reveals a machine layout):" "$out"

out=$(grep -nE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' "${KEEP[@]}" 2>/dev/null \
      | grep -vE 'example\.(com|org)|@types/|noreply@|\.github\.com|schema|@[0-9]')
[ -n "$out" ] && hit "email address:" "$out"

out=$(grep -nE 'BEGIN (RSA |OPENSSH |PGP |EC )?PRIVATE KEY' "${KEEP[@]}" 2>/dev/null)
[ -n "$out" ] && hit "private key material:" "$out"

# ---------------------------------------------------------------- denylist
LIST="${DIXTI_DENYLIST:-}"
[ -n "$LIST" ] || { [ -f .dixti-denylist ] && LIST=.dixti-denylist; }
[ -n "$LIST" ] || { [ -f "$HOME/.dixti-denylist" ] && LIST="$HOME/.dixti-denylist"; }

if [ -n "$LIST" ] && [ -f "$LIST" ]; then
  while IFS= read -r term; do
    term="${term%%#*}"; term="$(printf '%s' "$term" | tr -d '[:space:]')"
    [ -n "$term" ] || continue
    out=$(grep -nil -- "$term" "${KEEP[@]}" 2>/dev/null)
    # The term itself is NOT printed: this output may land in a public CI log.
    [ -n "$out" ] && hit "denylisted term (see your denylist) appears in:" "$out"
  done < "$LIST"
else
  printf '  note: no denylist found — generic checks only.\n'
  printf '        Put private terms one per line in .dixti-denylist (gitignored) or ~/.dixti-denylist.\n'
fi

if [ "$fail" -ne 0 ]; then
  printf '\ncheck-private: FAILED. Fix the above before committing — git history is permanent.\n'
  exit 1
fi
printf 'check-private: clean (%d files).\n' "${#KEEP[@]}"
