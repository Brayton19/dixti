# dixti

**`AGENTS.md` is what you tell the agent. dixti is what the agents learned.**

A shared store of notes that lives in your project's own git repository. No server, no database, no
account — a directory of reviewable markdown and a CLI that reads it.

```bash
dixti init                                        # scaffold the store
dixti search "refund double counting"             # has anyone written about this?
dixti note --topic billing --heading "Refunds re-enter the ledger as a second positive row"
dixti dict                                        # what has been written about, by topic
dixti show 7c2a91b4                               # read one in full
```

## Install

Node 20+. No runtime dependencies.

```bash
git clone https://github.com/Brayton19/dixti.git
cd dixti && npm install && npm link
```

`npm install` compiles the TypeScript; `npm link` puts `dixti` on your PATH. Putting it on PATH is
not optional — when a note list is too large to print in full it tells the reader which command to
run next, and that instruction has to name a binary that exists.

> `npm install -g github:Brayton19/dixti` does **not** work: npm runs the build step for a global
> git install without installing the dev dependencies it needs. Clone and link, or install a
> packed tarball from a release.

Uninstall with `npm unlink -g dixti`.

The point is the loop: **search before you write.** An agent that checks first appends to what the
team already knows instead of rediscovering it, and the store organises itself by topic.

## Why in the repo

| | a hosted memory service | a directory in your repo |
|---|---|---|
| Who can read it | whoever has a seat | whoever can clone the repo |
| Review | a web UI, if any | a pull request |
| History | whatever the vendor kept | `git log`, `git blame` |
| Approval to adopt | procurement, a DPA, seats | nobody — you already own the repo |
| Leaving | an export | it was always just files |

## Concurrent agents

Notes are **appended, never rewritten in place**, and `dixti init` writes

```
.agents/notes/*.md   merge=union
```

so two agents writing the same topic on different branches merge cleanly instead of conflicting.
That property is the whole multi-agent design, and it is why nothing in dixti ever edits a note.

## Reading a corpus you already have

Point it at any tree of `###`-headed markdown and you get search and browse over it immediately,
with nothing captured yet:

```bash
dixti dict   --adapt ~/notes --exclude archive
dixti search "rate limiting" --adapt ~/notes
```

## Session start

`hooks/session-start.sh` injects the topic list at the start of every session, so an agent begins
already knowing what has been written about. See `CLAUDE.md`.

## Status

Working: `init`, `search`, `note`, `dict`, `show`. 53 tests, zero runtime dependencies.
Not built: automatic capture at session end.

The on-disk contract is [`spec/FORMAT.md`](spec/FORMAT.md). [`notes/`](notes/) holds measurement
write-ups, several of which describe features removed in 0.3.0 — kept because the measurements are
still true.

MIT.
