# Contributing

dixti is early. Bug reports and small fixes are very welcome; large features probably are not, and
the reason is worth reading before you spend an evening on one.

## The bar for new features

An earlier version of dixti had evidence tiers, anchors that decayed against git history, an
append-only event ledger, typed links between notes, a weekly curator agent, usage logging, a
documentation importer and a ten-rule linter. It was 1,774 lines of source with **zero lines that
wrote a note** — the thing it existed to do. All of it was deleted.

So the bar for anything new is: **does it directly serve search, write, or multi-agent sharing?**

If you want to propose something that fails that test, open an issue describing the *problem* first.
A concrete failure of the simple version is a much better argument than a design.

## Getting set up

```bash
git clone https://github.com/Brayton19/dixti.git
cd dixti && npm install && npm link
npm run check          # check-private → typecheck → 90 tests → build
```

`npm run check` is what CI runs. Run it before opening a pull request.

## How the code is arranged

Everything except `src/cli.ts` is **pure** — no filesystem, no git, no clock. That is why every
behaviour is testable without a temp directory or a fixture repo, and it is the single property most
worth preserving. If a change needs `fs` inside `search.ts` or `note.ts`, the design is wrong.

```
spec/FORMAT.md    the on-disk contract — read before touching src/
src/parse.ts      markdown → notes
src/search.ts     notes + query → ranked hits
src/note.ts       a new note → the file write it implies
src/dict.ts       notes → the topic list
src/topic.ts      is this a good topic name?
src/capture.ts    should we ask for a note, and what to ask
src/adapt.ts      plain markdown → notes, for a corpus dixti did not write
src/cli.ts        argument handling and exit codes — the only module that does IO
hooks/            host adapters. They reshape strings and contain no logic.
```

**The format is the product surface.** Everything else is an afternoon to rewrite; notes already
written into other people's repositories are not. Changes to `spec/FORMAT.md` need a version bump and
a reason.

## Things that will get a patch rejected

- **Editing a note in place.** Notes are appended and never rewritten. That is what makes
  `merge=union` safe; break it and concurrent writes corrupt silently instead of conflicting loudly.
- **Committing derived state.** No index, no cache, no build output in git.
- **Logic in a host adapter.** If one host seems to need it, it belongs in `src/` where every host
  gets it.
- **A test that needs a fixture repo** when an injected value would do.

## Privacy

`npm run check-private` runs first in CI. It fails on absolute home paths, email addresses and
private key material, plus any term in a personal denylist (`.dixti-denylist`, gitignored — a
committed file listing what you are hiding is worse than the terms it hides).

This exists because a notes tool accumulates fragments of whatever it was tested against, and **git
history is permanent**. If the check fires on your branch, fix the content rather than the check.

## Known rough edges

Good places to start, roughly easiest first:

- **`npm install -g github:...` does not work.** npm runs the build for a global git install without
  installing devDependencies. A packed release asset would fix it. Do **not** fix it by committing
  `dist/`.
- **Search misses on vocabulary substitution.** It is lexical: a note whose heading shares no word
  with the question is invisible. Measured at 6/15 on paraphrased queries. Better *headings* are
  half the fix and cost nothing — see if the capture prompt can push harder before reaching for an
  index.
- **`dixti note` reports near-duplicates after writing, not before.** Prompting first is better.
- **Merging two topics that should be one.** Nothing helps with this today, and notes being
  append-only makes it a rewrite. Unsolved on purpose; a good design here would be welcome.
- **The topic two-step is unmeasured with a real agent.** Above a token budget the reader picks a
  topic before seeing any heading. The lexical floor for that is 0/15; how far above it a model
  actually gets is an open number. `scripts/twostep-test.mjs` is the harness.

## Commit messages

Say what changed and why it mattered, in prose. If a measurement drove the change, put the number in
the message — several of the decisions in this repo are only defensible because the number is
recorded somewhere a reader can find it.
