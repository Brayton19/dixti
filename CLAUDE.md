# dixti

> A standalone tool. It must work for anyone on any agent host — nothing here may assume a
> particular user's setup, corpus, or hooks.

## Overview
`AGENTS.md` is what you tell the agent. **dixti is what the agents learned.**

A shared store of notes, written by agents, living inside a project's own git repository. An agent
searches before writing, so knowledge accumulates by topic instead of being rediscovered. Four
operations and no others:

```bash
dixti dict              # what has anything been written about
dixti search <words>    # is there already a note on this topic?
dixti show <id>         # read one note in full
dixti note              # write a new one
dixti init              # scaffold .agents/notes/ and the union-merge line
```

Spec: `spec/FORMAT.md` — read it before touching `src/`.


## Scope

dixti is deliberately small. The question for anything new is: **does it directly serve search,
write, or multi-agent sharing?** If it does not, it belongs in a different tool.

Four invariants hold everywhere, and a change that breaks one has to say so:

- **Notes are appended, never rewritten in place** — this is what makes `merge=union` safe.
- **Unknown metadata keys are preserved, not rejected**, so a newer store parses in an older version.
- **Nothing derived is committed** — no index, no cache, no build output.
- **Host adapters contain no logic.** If one host seems to need some, it belongs in `src/`.

## Tech Stack
- Runtime: Node.js 20+, TypeScript (ESM). **Zero runtime dependencies.**
- Testing: Vitest
- CI: GitHub Actions

## Before any push: `npm run check-private`
This repo develops a notes tool, so it keeps accumulating fragments of the corpora it was tested
against — private repo names, absolute home paths, someone's employer. Every one of those got in
because somebody meant to remember, and **git history is permanent**: by the time a repo goes public,
"scrub it later" is already too late.

`scripts/check-private.sh` runs in `npm run check` and first in CI. Two layers: generic patterns
(home paths, emails, key material) that are safe to keep in the open, and a private denylist of
literal terms read from `.dixti-denylist` (gitignored) or `~/.dixti-denylist`. **The denylist is
never committed** — a file enumerating what you are hiding is worse than the terms it hides — and a
denylist hit prints the filename but never the term, since that output can land in a public CI log.

## Packaging — verified, not assumed
`npm pack` produces a 55-file tarball (`dist`, `hooks`, `spec`, README, LICENSE) that installs
globally and works. Two things are easy to break:

- **`prepare: npm run build`.** `dist/` is gitignored, so without it a clone installs a `bin` that
  points at nothing and the `dixti` command silently does not exist.
- **`build: rm -rf dist && tsc`.** `tsc` never deletes output for source that no longer exists, so
  `dist/` accumulates output for modules that no longer exist, and it ships in the tarball.

**`npm install -g github:...` does not work** and this is an npm limitation, not a bug here: npm 11
runs `prepare` for a global git install without installing devDependencies, so `tsc` is missing.
Clone + `npm install` + `npm link` works, and a registry tarball works. Do not try to fix this by
committing `dist/`.

Whenever packaging changes, re-run the real test rather than reasoning about it: `npm pack`, install
the tarball globally, then `init` / `note` / `search` in a directory that has never seen dixti.

## Build Commands
```bash
npm run build       # Compile TypeScript
npm run typecheck   # Type check without emit
npm test            # Vitest
npm run check       # typecheck + test + build — run this before committing
```

## Architecture
```
spec/FORMAT.md    THE contract. The only thing expensive to change.
src/parse.ts      markdown → notes. PURE. Implements §2.
src/search.ts     notes + query → ranked hits. PURE. Implements §4.
src/note.ts       a new note → the file write it implies. PURE. Implements §3.
src/dict.ts       notes → the topic list. PURE.
src/capture.ts    should we ask for a note, and what to ask. PURE. The host-neutral write trigger.
src/instructions.ts  what an agent needs to know to use the store. PURE. Written into AGENTS.md by init.
src/adapt.ts      plain markdown → notes, for a corpus with no dixti metadata. PURE.
src/init.ts       plans the scaffold as a list of writes. PURE.
src/store.ts      reads .agents/notes/ off disk
src/id.ts         8-hex id generation
src/cli.ts        argument handling and exit codes — the only module that does IO
hooks/            host adapters + README.md, the integration guide. Adapters reshape strings
                  and contain no logic; anything cleverer belongs in src/capture.ts.
tests/            69 tests, all against the pure layer
.agents/notes/    dixti's own notes
```

**Everything except `cli.ts` is pure.** That is why every behaviour is testable with no temp
directory and no fixture repo. Reaching for `fs` inside `search.ts` or `note.ts` would cost that.

## Session start — the hook
`hooks/session-start.sh` is what makes dixti a tool rather than a CLI nobody remembers to run. It is
an **adapter**: it turns `dixti dict` into the JSON envelope Claude Code wants on stdout, and other
editors get their own file beside it. Nothing about it belongs in `src/`.

```jsonc
// ~/.claude/settings.json
"SessionStart": [{ "hooks": [{ "type": "command",
  "command": "$HOME/dev/dixti/hooks/session-start.sh", "timeout": 15 }] }]
```

It injects the store's topic list when `.agents/` exists, plus `DIXTI_ADAPT`'s corpus when that is
set — so it is useful against an existing notes tree with nothing captured yet. `DIXTI_BIN`,
`DIXTI_DIR`, `DIXTI_TITLE`, `DIXTI_EXCLUDE` and `DIXTI_BUDGET` (default 4000) tune it.

**Prefer `DIXTI_EXCLUDE` over listing sub-directories in `DIXTI_ADAPT`.** A collapsed list prints the
command a reader must type to expand a topic, and that command has to round-trip every flag that
selected the corpus. Eight paths in that line is a command nobody will run. For the same reason
`dixti` must be on PATH (`npm link`), or the printed instruction names a binary that does not exist.

**It is silent on every failure, deliberately.** A session missing its notes is worse off; a session
that will not start because a hook errored is unusable, and the hook is never the point.

## Session end — `dixti capture`
Notes do not get written because an agent remembers to write them; something has to ask. That is
`dixti capture`: it prints the instruction to ask, or prints nothing and exits 1 when asking is not
worth it (no store, asked recently, or a note already written since it last asked).

**Host neutrality is the point, and it is a design constraint, not a nicety.** Every agent host has
some way to run a command at session end and they all differ. What must not differ is *what gets
asked* and *when it is worth asking* — so both live in `src/capture.ts`, and a host adapter is
~30 lines that reshape a string. Putting the prompt in a shell hook would make every host
re-derive the part that decides whether a store is worth reading a year later.

```bash
prompt=$(dixti capture --session "$sid") || exit 0   # exit 1 = say nothing
```

`hooks/README.md` is the integration guide; `hooks/session-stop.sh` is the Claude Code adapter and
should be read as an example of how small one ought to be. **Never put logic in an adapter** — if a
new host seems to need some, it belongs in `capture.ts` where every host gets it.

The prompt carries the two things that decide whether the store is worth having: *most sessions
should write nothing*, and *the heading must carry the words a future reader will search with* —
search is lexical, so a heading sharing no word with the question is invisible.

## Key Decisions
- **The format is the product surface.** Everything else is an afternoon to rewrite; notes already
  written into other people's repos are not. Change `spec/FORMAT.md` deliberately, with a version bump.
- **Notes are appended, never rewritten in place.** This is the entire multi-agent story: it makes
  `merge=union` safe, so two agents writing the same topic merge instead of conflicting. If it is
  ever violated, concurrent writes corrupt silently.
- **The heading is the product.** It is the line in `dixti dict` and in every search result. Every
  reader sees it; few open the body. Write headings as standalone sentences that state the finding.
- **Nothing derived is committed, and there is no index.** Scanning a few thousand headings is faster
  than opening an index would be, and a committed index becomes a second source of truth.
- **Unknown meta keys are preserved, not rejected** — a store written by a newer dixti still parses,
  and the fields 0.3.0 dropped do not break notes already on disk.
- **`search` is a filter, not an oracle.** It exists so an agent can decide *append or start a new
  topic*. The agent reads the results and judges.

## Current Status
Spec `0.3.0-draft`. **The loop closes**: the start hook injects the topic list, the agent searches
and reads, the stop hook asks for a note at session end.

Verified in a scratch repo dixti had never touched: `init` → `search` (miss, exit 1) → `note` →
`search` (hit) → `show`. Concurrent writes verified on diverged branches — two agents appending to
the same topic merged cleanly and all notes survived. Capture hook verified across all four gates:
fires once, silent when throttled, **silent after a note was written**, fires again when none was.
55 tests, typecheck clean, zero runtime dependencies.

## Open problems

1. **`dixti note` reports near-duplicates after writing, not before.** The capture prompt tells the
   agent to search first, which covers the common case, but nothing enforces it.
2. **Merging two topics that should be one.** Notes are append-only, so a merge is a rewrite. No good
   answer yet.
3. **Choosing a topic from names alone.** Above a token budget the reader sees topic names plus a few
   sample headings rather than every heading. How well that works in practice is not characterised.
4. **Search misses on vocabulary substitution.** It is lexical: a heading sharing no word with the
   question is invisible. Better headings are half the answer; the other half is open.
