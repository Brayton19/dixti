# Changelog

The format version and the package version move independently. The format version is the one that
matters: it is the contract for notes already written into other people's repositories.

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
