# dixti format specification

**Version:** `0.3.0-draft` · **Status:** not yet stable · **Last changed:** 2026-09-01
**Implemented by:** `src/parse.ts` (§2), `src/note.ts` (§3), `src/search.ts` (§4), with 53 tests.

> **0.3.0 — the reset.** 0.1 and 0.2 specified a provenance layer on top of the store: evidence
> tiers, anchors that decay against git history, an append-only ledger of events, link types, and a
> weekly curator. All of it is **removed**. It was a second product built on a memory system that did
> not exist yet — 1,774 lines of source with zero lines that wrote a note.
>
> A note is now a heading, a topic, a date and a body. Nothing else. The removed design is preserved
> in git history; do not reintroduce any of it without a
> concrete failure of the simple version that demands it.

---

## 1. What dixti is

A shared store of notes, written by agents, living inside a project's own git repository.

`AGENTS.md` is what you tell the agent. **dixti is what the agents learned.**

Four operations, and there are deliberately no others:

| | |
|---|---|
| `dixti dict` | what has anything been written about |
| `dixti search <words>` | is there already a note on this topic |
| `dixti show <id>` | read one note in full |
| `dixti note` | write a new one |

**Design constraints, in priority order.**

1. **Git is the whole storage layer.** No server, no database, no account, no vendor. A note is
   markdown in a file; history, blame, review and access control are the repository's.
2. **Notes are appended, never rewritten in place.** This is what makes `merge=union` safe, and it
   is the entire multi-agent story: two agents writing different topics touch different files, and
   two writing the same topic append to the end of one file and git keeps both sides.
3. **Nothing derived is committed.** There is no index. A store of a few thousand headings is
   scanned faster than an index could be opened, and a committed index is a second source of truth.
4. **Unknown fields are preserved, never rejected.** A store written by a newer dixti still parses.

---

## 2. A note

A note is a level-3 heading, an optional meta comment, and a body.

```markdown
### Refunds re-enter the ledger as a second positive row <!--dx:7c2a91b4-->
<!--dx topic=billing date=2026-08-14-->

Not a reversal. A refund appears as `kind='refund'` with a **positive** amount, so summing
`amount` double-counts it. Confirmed against `analytics.fct_ledger`.
```

- **The heading is the product.** It is the line that appears in `dixti dict` and in search results,
  so every reader sees it and few open the body. Write it as a standalone sentence that states the
  finding, not a topic label. "Billing notes" is not a heading; the example above is.
- **The body is free markdown.** No length limit. Only the heading is ever loaded in bulk, so a long
  body costs nothing until someone asks for it.
- **A note ends** at the next heading of level 3 or shallower. `####` and deeper are body content, so
  a note may carry its own sub-structure.
- **Fenced blocks are opaque.** A `###` inside ``` or `~~~` is body text, not a new note. Nested
  fences of different markers nest correctly.

### 2.1 Identifiers

`<!--dx:xxxxxxxx-->` on the heading line — 8 lowercase hex characters, random, unique within a store.
Kept in an HTML comment so it never renders and never affects the prose.

A note without an id still parses; `dixti show` cannot address it, and `dixti dict` prints `········`
in its place. Corpora adapted from plain markdown are given ids derived from path + heading, so
re-reading the same corpus never renumbers.

### 2.2 The meta line

`<!--dx key=value key=value-->`, immediately after the heading, before the body.

| Key | Meaning |
|---|---|
| `topic` | Grouping. Defaults to the file's basename, so it is usually redundant and may be omitted. |

**A topic name is a retrieval surface, not a label.** Once a store outgrows its budget the reader
sees topic names plus a few sample headings and must choose a topic before seeing the rest, so a
name that does not say what is inside it costs recall directly. Measured on a 447-note corpus whose
topics came from file names: only **12%** of a topic's notes shared any word with its topic name,
and not one of fifteen paraphrased queries shared a word with the name of the topic holding its
answer. Name a topic for its subject, never for when it was written or where it came from.
`dixti note` warns about the four names that produce that outcome — uninformative, dated,
near-duplicate, or really a heading — and never refuses.
| `date` | ISO date the note was written. |

**Values may not contain whitespace.** A path with a space would otherwise split silently — this was
a real 0.1.0 bug, found by implementing the spec.

Tokens that are not `key=value` are ignored. **Keys this version does not recognise are preserved
verbatim** and written back out unchanged.

---

## 3. Layout

```
.agents/
  notes/
    README.md          how to use the store, written by `dixti init`
    billing.md         one file per topic
    matching.md
```

**One file per topic** is the whole storage model. It is what keeps concurrent writes apart, and what
makes `dixti dict --topic <name>` a file read.

`.gitattributes` must carry:

```
.agents/notes/*.md   merge=union
```

Union merge keeps both sides of a concurrent append instead of raising a conflict. It is safe **only
because notes are appended and never rewritten**. If that is ever violated, concurrent writes corrupt
silently rather than conflicting loudly.

---

## 4. Search

Lexical, in-memory, no index. A note scores by where the query's words appear:

| Field | Weight |
|---|---|
| heading | 4 |
| topic | 3 |
| body | 1 |

The total is then scaled by the fraction of query words that matched anything, so covering more of
the query beats repeating one word in three places. Stopwords and single characters are dropped;
identifiers keep their dots, slashes and underscores (`analytics.fct_ledger` is one term).

**This is a filter, not an oracle.** Its job is to let an agent decide *append to an existing topic
or start a new one*; the agent reads the results and judges. `dixti search` exits non-zero when
nothing matches, so a script can branch on "nothing written about this yet".

---

## 5. What the format deliberately does not contain

| Not here | Why |
|---|---|
| A confidence or quality field | Self-assessment. If it matters, it belongs in the body where a reader can weigh it. |
| An author field | `git blame` already answers it, and building it in invites grading colleagues. |
| Links between notes | Every link type was removed in 0.3.0. A wrong edge is worse than no edge, and the reading agent can see the whole topic list anyway. |
| An index | Derived state. Scanning is fast enough, and a committed index drifts from the notes. |
| A ledger, tiers, anchors, decay | The provenance layer, removed in 0.3.0. See the header. |

---

## 6. Validation

There is no linter. The three properties that matter are enforced by construction:

- **Ids are unique** — `dixti note` generates against the ids already in the store.
- **Notes parse** — anything that does not parse as a note is simply not one; a malformed meta line
  degrades to no metadata rather than failing.
- **Appends are safe** — `dixti note` only ever appends, and `dixti init` writes the union-merge line.

If a store is edited by hand into a state dixti cannot read, `dixti dict` shows fewer notes than
expected. That is the whole failure mode, and it is visible.
