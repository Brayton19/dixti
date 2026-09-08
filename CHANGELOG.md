# Changelog

The format version and the package version move independently. The format version is the one that
matters: it is the contract for notes already written into other people's repositories.

## 0.2.0 — format `0.4.0-draft`

Consolidation: two notes stating one finding, and one subject filed under two topic names.

### Duplicate detection moved before the write

`dixti note` used to append and *then* mention that similar notes existed, which is a report nobody
acts on. It now compares before writing, and **stops** when the note looks like one already in the
store — exiting **2**, distinct from the 1 that means failure.

Nothing is lost when it stops. The note is held under a handle and re-offered:

```
dixti note --resume <handle> --supersedes <id>   one finding — write mine, retire that note
dixti note --resume <handle> --anyway            different findings, similar wording
```

That matters because bodies are piped in on stdin at session end: a refused write with nowhere to
land means the note is never written at all. Held notes live outside the repository and are dropped
after 14 days.

The check is **not** `search`, and is not built on it. Search scales by how much of a *query*
matched; this compares two notes symmetrically on full heading and body (Dice on term sets, heading
0.7 / body 0.3, leading section numbers stripped as structure rather than subject).

**Measured, leave-one-out over a real 467-note corpus:** it stops 1 write in 27. Of the nine
distinct pairs it caught, two were genuine duplicates and seven were the same analysis applied to a
different subject. The highest-scoring pair in the corpus — identical headings, 0.838 — is two
different cities, and outscores every true duplicate. **Lexical similarity cannot separate
repetition from parallel work, and no threshold fixes that.** The thresholds are therefore set for
recall and the agent adjudicates, which is affordable only because a stopped write is held.

The warn band was moved from 0.28 to 0.40 for the same reason `capture` is throttled: at 0.28 it
fired on one write in four, which is the rate at which a warning stops being read.

### `supersedes` — consolidation without a rewrite

New meta key, comma-separated ids (format §6). The replacing note carries it; the replaced notes are
never touched, so the append-only invariant that makes `merge=union` safe is intact.

- `dixti dict` and `dixti search` stop listing a superseded note.
- `dixti show` still resolves it and prints what replaced it, so an id in an old commit still works.
- Chains collapse without traversal; an id matching nothing is ignored.

Verified with the multi-agent case in play: one agent superseding a note while another appended to
the same file on a diverged branch merged with zero conflicts.

### `dixti topic merge <from> <to>`

Folds one topic name into another when a subject ends up under two — "billing" and "billings". This
is the **only command that rewrites files**, and it breaks the append-only invariant deliberately:
append-only exists so concurrent *agent* writes merge, and a maintenance command a person runs is
not that case.

Fenced accordingly: dry run unless `--yes`, refuses on a dirty `.agents/notes` tree or outside a git
repository, and preserves every id, heading, body and date. Only `topic=` changes, and only where it
was written explicitly. Always one `git checkout` from undone.

It rewrites the source text line by line rather than re-rendering parsed notes, so anything the
parser does not model — a preamble, unusual spacing — survives.

### Also

- The capture prompt and `AGENTS.md` instructions no longer lean on the agent remembering to search
  first; they say the tool checks and how to answer it.
- `src/args.ts` and `src/cli-write.ts` split out; every module is under 300 lines.
- 149 tests, up from 101.

## 0.1.0 — format `0.3.0-draft`

First public release.

### Commands

- `dixti init` — scaffold `.agents/notes/` and the `merge=union` line.
- `dixti search <words>` — lexical search over headings, topics and bodies. Exits 1 when nothing
  matches, so a script can branch on "nothing written about this yet".
- `dixti note` — append a note to a topic. Flags a topic name that is uninformative, dated, a
  near-duplicate of an existing topic, or really a heading; it never refuses the write.
- `dixti dict` — every note as one line, grouped by topic. Over a token budget, each topic shows its
  first few headings and `… N more`.
- `dixti show <id>` — one note in full.
- `dixti capture` — prints the instruction asking an agent to write a note, or prints nothing and
  exits 1 when asking is not worth it. The host-neutral write trigger.
- `dixti instructions` — prints the agent-facing block explaining the store and the search-before-write
  habit. `dixti init` appends it to `AGENTS.md` automatically, below anything already there, and
  skips it if already present.
- `--adapt <dir>` on `dict`, `search` and `show` reads any tree of `###`-headed markdown, so dixti is
  useful against notes you already have before anything has been captured.

### Integration

- `hooks/session-start.sh` and `hooks/session-stop.sh` for Claude Code, plus an integration guide in
  `hooks/README.md` for other hosts.
- The capture instruction and the decision of whether to ask both live in `src/capture.ts`, so every
  host asks the same thing under the same conditions.

### Tooling

- `npm run check-private` fails the build on absolute home paths, email addresses, private key
  material, and any term in a local denylist. Runs first in CI.
