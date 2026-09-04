# dixti

**`AGENTS.md` is what you tell the agent. dixti is what the agents learned.**

A shared store of notes that lives in your project's own git repository. No server, no database, no
account — a directory of reviewable markdown and a CLI that reads it.

Your agent spends twenty minutes working out that refunds are double-counted in the ledger. Tomorrow,
in a new session with no memory, it works it out again. So does your colleague's agent. dixti is
where that goes instead.

```bash
dixti search "refund double counting"    # has anyone worked this out already?
dixti note --topic billing \
  --heading "Refunds re-enter the ledger as a second positive row" \
  --body "Not a reversal. SUM(amount) double-counts."
```

The whole point is the order: **search before you write.** An agent that checks first adds to what
the team already knows instead of rediscovering it.

## Two questions this was built to answer

**"I want my agent to use your thing — not use your agent."**

dixti is not an agent and has no ambition to become one. It is a directory and six commands. Keep
your model, your editor, your prompts, your workflow — point whatever you already use at
`dixti search` and `dixti note`. The instruction text lives in dixti so that every tool asks the same
thing under the same conditions, but nothing in it assumes which agent is reading. A host
integration is about thirty lines that reshape a string, and if yours needs more than that, the
missing piece belongs in dixti where every host gets it.

**"Someone leaves. Who owns what their agent worked out?"**

Today, usually nobody. It is in a session transcript, a local memory file, or a vendor account tied
to a personal login — and it walks out with them. Six months of an agent learning your codebase
becomes six months the next person repeats.

dixti's answer is deliberately boring: a finding is markdown, committed to the repository the company
already owns, reviewed in a pull request like anything else. There is no export, no account to
transfer, no seat to reassign. Offboarding is a no-op, because there was never anything separate to
hand over.

---

## Install

Node 20+. Zero runtime dependencies.

```bash
git clone https://github.com/Brayton19/dixti.git
cd dixti && npm install && npm link
```

`npm install` compiles the TypeScript, `npm link` puts `dixti` on your PATH. **On PATH is not
optional:** when a note list is too big to print in full, it tells the reader which command to run
next — and that instruction has to name a binary that exists.

> `npm install -g github:Brayton19/dixti` does **not** work. npm runs the build step for a global git
> install without installing the dev dependencies the build needs. Clone and link.

Uninstall with `npm unlink -g dixti`.

## Use it

```bash
cd your-project
dixti init
```

That creates `.agents/notes/`, adds one line to `.gitattributes`, and **appends instructions to
`AGENTS.md`** so your agents know the store exists and how to use it — it appends below whatever is
already in that file, and re-running never duplicates it. If your tools read something else
(`CLAUDE.md`, `.cursorrules`, a system prompt), `dixti instructions` prints the same block to paste
wherever it belongs.

| | |
|---|---|
| `dixti search <words>` | is there already a note on this? |
| `dixti note` | if not, write one |
| `dixti dict` | what has been written about, by topic |
| `dixti show <id>` | read one in full |
| `dixti capture` | ask an agent, at session end, whether to write one |
| `dixti instructions` | the agent-facing block, for a file `init` did not write |

Notes are plain markdown you can read and review in a pull request:

```markdown
### Refunds re-enter the ledger as a second positive row <!--dx:7c2a91b4-->
<!--dx topic=billing date=2026-08-14-->

Not a reversal. A refund appears as `kind='refund'` with a **positive** amount, so summing
`amount` double-counts it. Confirmed against `analytics.fct_ledger`.
```

**The heading is the product.** It is the only line most readers ever see — in the topic list and in
every search result — so write it as a sentence that states the finding, not a label. "Billing notes"
is not a heading; the one above is.

## Wire it into your agent

Two commands, at two moments. Everything else is an adapter.

```bash
dixti dict                              # session start: what has been written about
dixti capture --session "$id" || exit 0 # session end: exits 1 when it is not worth asking
```

`dixti capture` prints the instruction that asks an agent to write a note — or prints nothing and
exits 1 when there is no store, it asked recently, or a note was already written. The instruction
text and the decision both live in dixti, so **every host asks the same thing under the same
conditions** and an adapter is ~30 lines that reshape a string.

[`hooks/`](hooks/) has the Claude Code pair and [an integration guide](hooks/README.md) for anything
else.

## Why in the repo

| | a hosted memory service | a directory in your repo |
|---|---|---|
| Who can read it | whoever has a seat | whoever can clone the repo |
| Review | a web UI, if any | a pull request |
| History | whatever the vendor kept | `git log`, `git blame` |
| Approval to adopt | procurement, a DPA, seats | nobody — you already own the repo |
| Leaving | an export | it was always just files |

## Concurrent agents

Notes are **appended, never rewritten in place**, and `dixti init` writes:

```
.agents/notes/*.md   merge=union
```

So two agents writing the same topic on different branches merge cleanly instead of conflicting.
That is the whole multi-agent design, and it is why nothing in dixti ever edits a note.

## Reading notes you already have

Point it at any tree of `###`-headed markdown and you get search and browse immediately, with nothing
captured yet:

```bash
dixti dict   --adapt ~/notes --exclude archive
dixti search "rate limiting" --adapt ~/notes
```

Topics are derived from file paths in this mode, and dixti says so — a derived topic name often does
not describe what is inside it.

## How search works

Lexical and in memory. A note scores on where your words appear — heading, then topic, then body —
scaled by how much of the query it covers. There is no index to build, invalidate or commit, and a
few thousand headings scan faster than an index opens.

Search is a filter, not an oracle: it exists so an agent can decide *add to an existing topic or
start a new one*, and the agent reads the results and judges. When a store is small enough to list in
full, `dixti dict` shows every heading and no search is needed at all.

## Status

Early, and useful. Every command works; 101 tests; zero runtime dependencies. The format is
`0.3.0-draft` and may still change — [`spec/FORMAT.md`](spec/FORMAT.md) is the contract.

[CONTRIBUTING.md](CONTRIBUTING.md) has the development setup and the current rough edges;
[CHANGELOG.md](CHANGELOG.md) has what is in this release.

## Licence

[MIT](LICENSE).
