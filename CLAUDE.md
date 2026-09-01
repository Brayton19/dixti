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


## Scope — read this before adding anything

**Reset 2026-09-01.** The project had grown a provenance layer — evidence
tiers, anchors decaying against git history, an append-only ledger, link types, a weekly curator,
usage logging, a doc importer, a ten-rule linter. All removed. It was a second product built on a
memory system that did not exist: 1,774 lines of source with **zero lines that wrote a note**.

The removed design was not bad and parts of it were measured. It is preserved in git history and in
the maintainer's own project notes. **Do not reintroduce any of it** without a concrete failure of
the simple version that demands it. If notes turn out to be wrong or stale in a way that costs
something real, the first thing to come back is evidence tiers — one derived character.

The bar for any new feature: *does it directly serve search, write, or multi-agent sharing?*

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
src/adapt.ts      plain markdown → notes, for a corpus with no dixti metadata. PURE.
src/init.ts       plans the scaffold as a list of writes. PURE.
src/store.ts      reads .agents/notes/ off disk
src/id.ts         8-hex id generation
src/cli.ts        argument handling and exit codes — the only module that does IO
hooks/            host adapters + README.md, the integration guide. Adapters reshape strings
                  and contain no logic; anything cleverer belongs in src/capture.ts.
tests/            69 tests, all against the pure layer
notes/            dated measurement write-ups (several describe removed features — kept as evidence)
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

## TODO
1. ~~Capture at session end.~~ **DONE 2026-09-01** — `hooks/session-stop.sh`. The loop now closes:
   the start hook injects the topic list, the stop hook asks for a note.
2. **A near-duplicate check that runs before the write, not after.** `dixti note` currently writes,
   then reports similar notes. The capture prompt tells the agent to search first, which covers the
   common case, but nothing enforces it.
3. ~~Fix the collapsed view.~~ **DONE 2026-09-01** — over budget, each topic now shows its first few
   headings plus `… N more` instead of a bare count. A name carries almost nothing (measured: only
   12% of a topic's own notes share a word with its name); three real headings say what a name
   cannot. 540 notes render in ~850 tokens against a 4,000 budget, so the signal is nearly free.
4. ~~Author the topic names.~~ **DONE 2026-09-01** — `src/topic.ts`. `dixti note` now says what is
   wrong with a topic name (uninformative, dated, a near-duplicate of an existing topic, or really a
   heading) and **never refuses**: the note is worth more than the objection, and a tool that blocks
   writes gets worked around. `dixti dict --adapt` says its topics came from file paths rather than
   from anyone choosing them.
5. **Author the topic names, part two:** nothing yet helps an existing store *merge* two topics that
   should be one. Notes are append-only, so a merge is a rewrite — deliberately unsolved. ~~Measure the collapsed two-step.~~ **MEASURED 2026-09-01** —
   `notes/twostep-test-2026-09-01.md`. Above budget the agent picks a topic before seeing any
   heading, and on a 447-note corpus the lexical floor for that is **0/15** on paraphrase: not one query shares a
   word with the name of the topic holding its answer. Topic names are only **12% self-describing**;
   twelve topics score 0%. So the two-step has no mechanical fallback and the names actively
   handicap the semantic one. Fix, which costs nothing since `--topic` already takes any string:
   push capture toward a small set of *meaningful* topics, and treat path-derived topics as the
   weakest part of `--adapt`. **Still unmeasured: the realistic rate**, which needs an agent with
   fresh context — a process that has read the corpus grading itself on it measures nothing.
6. Nothing else is planned. Add only against the bar in § Scope.
