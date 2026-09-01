# Changelog

Format version and package version move independently. The format version is the one that matters:
it is the contract for notes already written into other people's repositories.

## Unreleased

First public state. Format `0.3.0-draft`.

### Commands

- `dixti init` — scaffold `.agents/notes/` and the `merge=union` line.
- `dixti search <words>` — lexical search over headings, topics and bodies. Exits 1 when nothing
  matches, so a script can branch on "nothing written about this yet".
- `dixti note` — append a note to a topic. Warns about a topic name that is uninformative, dated, a
  near-duplicate of an existing topic, or really a heading. It never refuses.
- `dixti dict` — every note as one line, grouped by topic. Over a token budget, each topic shows its
  first few headings and `… N more`.
- `dixti show <id>` — one note in full.
- `dixti capture` — prints the instruction asking an agent to write a note, or prints nothing and
  exits 1 when asking is not worth it. The host-neutral write trigger.
- `--adapt <dir>` on `dict`, `search` and `show` reads any tree of `###`-headed markdown, so the tool
  is useful against notes you already have before anything has been captured.

### Design decisions, with the measurements behind them

- **A dictionary of one-line headings replaced the search index.** Measured 14/15 at rank 1 against
  keyword search's 6/15 on identical paraphrased queries. This deleted an FTS5 index, BM25, the
  embeddings question, anchor∩working-set retrieval and Wilson ranking.
- **The evidence layer was removed entirely** — tiers, anchors, decay, an append-only event ledger,
  every link type, a weekly curator agent, usage logging, a documentation importer and a ten-rule
  linter. It answered "how much should I believe this note?", which only has value once notes exist
  in volume. 1,774 lines of source became 802.
- **The documentation importer was cut on its own evidence**: 0–3 notes per repository. Documentation
  is prose about concepts, so most sections cite no file. Cold start has to come from capture.
- **Topic names are a retrieval surface, not labels.** On a 447-note corpus with path-derived topics,
  only 12% of a topic's notes shared a word with its topic name, and 0/15 paraphrased queries shared
  a word with the name of the topic holding the answer. Hence the advice in `dixti note` and sample
  headings in the collapsed list.

Write-ups are in [`notes/`](notes/).

### Not yet

- Automatic capture depends on a host hook; nothing writes notes unprompted.
- Search misses when a question shares no vocabulary with the note.
- No way to merge two topics that should be one.
- `npm install -g github:...` does not work — see [CONTRIBUTING.md](CONTRIBUTING.md).
