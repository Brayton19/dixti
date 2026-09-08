# dixti

> A standalone tool. It must work for anyone on any agent host — nothing here may assume a
> particular user's setup, corpus, or hooks.

## Overview
`AGENTS.md` is what you tell the agent. **dixti is what the agents learned.**

A shared store of notes, written by agents, living inside a project's own git repository. An agent
searches before writing, so knowledge accumulates by topic instead of being rediscovered. Four
operations on notes, and no others:

```bash
dixti dict              # what has anything been written about
dixti search <words>    # is there already a note on this topic?
dixti show <id>         # read one note in full
dixti note              # write a new one
dixti init              # scaffold .agents/notes/ and the union-merge line

dixti topic merge a b   # maintenance: fold one topic name into another
```

Spec: `spec/FORMAT.md` — read it before touching `src/`.


## What it is for

Two questions, and every design decision should trace back to one of them:

1. **"I want my agent to use your thing — not use your agent."** dixti is not an agent. Anything that
   assumes a particular model, editor or host is in the wrong place; the host integration is a
   translation layer with no logic in it.
2. **"Someone leaves — who owns what their agent worked out?"** A finding is markdown in the
   company's own repository, reviewed in a pull request. No export, no account to transfer, no seat
   to reassign. Anything that puts state outside the repo attacks this directly.

## Scope

dixti is deliberately small. The question for anything new is: **does it directly serve search,
write, or multi-agent sharing?** If it does not, it belongs in a different tool.

Four invariants hold everywhere, and a change that breaks one has to say so:

- **Notes are appended, never rewritten in place** — this is what makes `merge=union` safe. The one
  exception is `dixti topic merge`, and it is fenced: see Key Decisions.
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
src/similar.ts    is this note already in the store? PURE. Implements §6.2. NOT search — see below.
src/supersede.ts  which notes a consolidation retired. PURE. Implements §6.
src/pending.ts    a stopped write, held rather than lost. PURE.
src/merge.ts      folding one topic into another → the writes it implies. PURE. Implements §7.
src/args.ts       flags and positionals. PURE.
src/dict.ts       notes → the topic list. PURE.
src/capture.ts    should we ask for a note, and what to ask. PURE. The host-neutral write trigger.
src/instructions.ts  what an agent needs to know to use the store. PURE. Written into AGENTS.md by init.
src/adapt.ts      plain markdown → notes, for a corpus with no dixti metadata. PURE.
src/init.ts       plans the scaffold as a list of writes. PURE.
src/store.ts      reads .agents/notes/ off disk
src/id.ts         8-hex id generation
src/cli.ts        dispatch and the read commands — IO
src/cli-write.ts  the write path: note, topic merge — IO
hooks/            host adapters + README.md, the integration guide. Adapters reshape strings
                  and contain no logic; anything cleverer belongs in src/capture.ts.
tests/            149 tests, all against the pure layer
.agents/notes/    dixti's own notes
```

**Everything except `cli.ts` and `cli-write.ts` is pure.** That is why every behaviour is testable
with no temp directory and no fixture repo. Reaching for `fs` inside `search.ts` or `similar.ts`
would cost that.

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
- **Duplicate detection is not search, and must never be built on it.** `search` scales by how much
  of a *query* matched, because a query is short and half-remembered. `similar.ts` compares two
  notes, symmetrically, on full heading and body. Feeding a whole note into `search` would collapse
  its coverage multiplier and score nothing.
- **A stopped write is held, never discarded.** `dixti note` refuses a likely duplicate — the one
  place dixti says no. That is only defensible because the note is stashed under a handle and
  re-offered: bodies arrive on stdin at session end, so a rejected write with nowhere to land means
  the note is never written at all. Precision is ~25% at the blocking threshold and that is
  *accepted*, because a false positive costs one command and a duplicate costs every future reader.
- **`topic merge` rewrites files, and is fenced so that it can.** Append-only exists to make
  concurrent *agent* writes mergeable. A maintenance command a person runs deliberately is not that
  case, so it is allowed — but only behind a dry run by default, a refusal on a dirty tree or outside
  git, and preservation of every id, heading, body and date. Never call it from an agent write path.

## Current Status
Spec `0.4.0-draft`. **The loop closes**: the start hook injects the topic list, the agent searches
and reads, the stop hook asks for a note at session end.

Verified in a scratch repo dixti had never touched: `init` → `search` (miss, exit 1) → `note` →
`search` (hit) → `show`. Concurrent writes verified on diverged branches — two agents appending to
the same topic merged cleanly and all notes survived. Capture hook verified across all four gates:
fires once, silent when throttled, **silent after a note was written**, fires again when none was.
149 tests, typecheck clean, zero runtime dependencies.

Consolidation verified end to end in a scratch repo: a duplicate write stopped with exit 2 and was
held; `--resume --supersedes` wrote it and retired the old note, which vanished from `dict` while
`show <old-id>` still resolved and pointed forward; `--resume --anyway` wrote it and downgraded to a
warning. The multi-agent invariant was re-verified *with* consolidation in play — one agent
superseding a note while another appended to the same file on a diverged branch merged with zero
conflicts, three notes on disk and two listed.

## Open problems

1. **The duplicate check cannot tell repetition from parallel work.** Measured leave-one-out over a
   real 467-note corpus: it stops 1 write in 27, and of the nine distinct pairs caught, two were
   genuine duplicates and seven were the same analysis applied to a different subject — Paris versus
   Belgium, three reviews of different artefacts on one day. The highest-scoring pair in the whole
   corpus (0.838, identical headings) is two different cities and outscores every true duplicate, so
   **no threshold fixes this**: the false positives are textually more alike than the true positives.
   The design answer is that the agent adjudicates and nothing is lost when it is asked. If that
   proves too noisy in real use, the next thing to try is a rare-term check — parallel notes each
   carry a discriminating proper noun the other lacks, true duplicates do not — not a new threshold.
   The corpus measured is adapted markdown with templated section headings; precision on a native
   store is probably better and is **unmeasured**.
2. **Whether being stopped changes what agents write.** The mechanism is verified; its effect on
   behaviour is not. What to watch: how often `--anyway` is chosen over `--supersedes`, and whether
   a stopped write is ever simply abandoned.
3. **Choosing a topic from names alone.** Above a token budget the reader sees topic names plus a few
   sample headings rather than every heading. How well that works in practice is not characterised.
4. **Search misses on vocabulary substitution.** It is lexical: a heading sharing no word with the
   question is invisible. Better headings are half the answer; the other half is open.
