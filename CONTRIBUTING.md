# Contributing

dixti is early. Bug reports and small fixes are very welcome, and there is a list of open problems
below.

## Getting set up

```bash
git clone https://github.com/Brayton19/dixti.git
cd dixti && npm install && npm link
npm run check          # check-private → typecheck → tests → build
```

`npm run check` is what CI runs. Run it before opening a pull request.

## How the code is arranged

Everything except `src/cli.ts` is **pure** — no filesystem, no git, no clock. That is why every
behaviour is testable without a temp directory or a fixture repo, and it is the property most worth
preserving. If a change needs `fs` inside `search.ts` or `note.ts`, there is usually a better shape.

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
a migration story for stores that already exist.

## Invariants

Four things hold everywhere, and a change that breaks one needs to say so explicitly:

- **Notes are appended, never rewritten in place.** This is what makes `merge=union` safe. Break it
  and concurrent writes corrupt silently instead of conflicting loudly.
- **Unknown metadata keys are preserved, not rejected**, so a store written by a newer version still
  parses in an older one.
- **Nothing derived is committed** — no index, no cache, no build output.
- **Host adapters contain no logic.** If one host seems to need some, it belongs in `src/` where
  every host gets it.

## Proposing a feature

Open an issue describing the *problem* before writing the code. dixti is deliberately small, and the
question for anything new is whether it directly serves search, write, or multi-agent sharing. A
concrete case where the current design falls down is a much stronger argument than a design.

## Privacy

`npm run check-private` runs first in CI. It fails on absolute home paths, email addresses and
private key material, plus any term in a personal denylist (`.dixti-denylist`, gitignored — a
committed file listing what you are hiding is worse than the terms it hides).

A notes tool accumulates fragments of whatever it is tested against, and git history is permanent. If
the check fires on your branch, fix the content rather than the check.

## Open problems

Roughly easiest first:

- **`npm install -g github:...` does not work.** npm runs the build for a global git install without
  installing devDependencies. A packed release asset would fix it. Committing `dist/` would not — it
  trades a one-line install for permanent diff noise and a build that can silently go stale.
- **Search misses on vocabulary substitution.** It is lexical, so a note whose heading shares no word
  with the question is invisible. Better headings are half the answer and cost nothing; the other
  half is an open design question.
- **`dixti note` reports near-duplicates after writing, not before.** Prompting first is better.
- **Merging two topics that should be one.** Notes are append-only, so a merge is a rewrite. There is
  no good answer yet and a design would be welcome.
- **Choosing a topic from names alone.** Above a token budget the reader sees topic names and a few
  sample headings rather than every heading. How well that works in practice is not yet characterised.

## Commit messages

Say what changed and why it mattered, in prose. If a measurement drove the change, put the number in
the message.
