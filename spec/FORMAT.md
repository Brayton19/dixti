# dixti format specification

**Version:** `0.4.0-draft` · **Status:** not yet stable
**Implemented by:** `src/parse.ts` (§2), `src/note.ts` (§3), `src/search.ts` (§4),
`src/similar.ts` and `src/supersede.ts` (§6).

This is the contract for notes on disk. It is the one part of dixti that is expensive to change,
because notes written into a repository outlive any version of the tool that wrote them.

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

Plus `dixti topic merge`, which is maintenance rather than an operation on notes: it folds one topic
name into another (§7), and it is the only command that rewrites a file.

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
| `date` | ISO date the note was written. |
| `supersedes` | Comma-separated ids this note consolidates and replaces. See §6. |

**A topic name is a retrieval surface, not a label.** Once a store outgrows its budget the reader
sees topic names plus a few sample headings and must choose a topic before seeing the rest, so a
name that does not say what is inside it costs recall directly. Measured on a 447-note corpus whose
topics came from file names: only **12%** of a topic's notes shared any word with its topic name,
and not one of fifteen paraphrased queries shared a word with the name of the topic holding its
answer. Name a topic for its subject, never for when it was written or where it came from.
`dixti note` warns about the four names that produce that outcome — uninformative, dated,
near-duplicate, or really a heading — and never refuses.

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

## 5. What a note does not carry

The format is small on purpose. A field that is not in it cannot go stale, cannot be filled in
carelessly, and cannot become something a reader has to interpret.

| Not in the format | Why |
|---|---|
| A confidence or quality field | Self-assessment. If confidence matters, it belongs in the body where a reader can weigh the reasoning. |
| An author field | `git blame` already answers it, and a field invites grading colleagues. |
| Links between notes | A wrong edge is worse than no edge, and a reader can see the whole topic list. `supersedes` (§6) is the single exception, and §6.1 argues why. |
| An index | Derived state. Scanning is fast enough, and a committed index drifts from the notes. |

Anything added here has to survive the same test: notes already written must keep parsing, which is
why §2.2 requires unknown keys to be preserved rather than rejected.

---

## 6. Consolidation

Two notes sometimes state one finding. The store is append-only, so neither can be edited into the
other. Instead the note that replaces them carries `supersedes`:

```markdown
### Refunds and chargebacks both re-enter the ledger as positive rows <!--dx:9f3c02ab-->
<!--dx topic=billing date=2026-09-04 supersedes=7c2a91b4,1d4e88f0-->
```

- **Nothing is edited or deleted.** The replaced notes stay exactly where they are, so the invariant
  that makes `merge=union` safe is untouched.
- **`dixti dict` and `dixti search` stop listing a superseded note.** That is the whole effect.
- **`dixti show` still resolves it**, and prints the note that replaced it — an id in someone's
  commit message or another repository keeps working.
- **Chains collapse without traversal.** If C supersedes B and B supersedes A, both A and B are
  claimed by some note, so only C is listed.
- **An id that matches nothing is ignored**, in keeping with §2.2: a store must not stop parsing
  because an edge is stale.

### 6.1 Why this is the one link in the format

§5 rejects links between notes because a wrong edge is worse than no edge. A superseding edge earns
the exception on three counts, and a proposal for any other link should be held to the same test:

1. **One meaning and one consequence.** It does not invite interpretation: the replaced note stops
   being listed. An "related to" edge asks every reader to decide what the author meant.
2. **Bounded, reversible cost when wrong.** The note is hidden, not lost; `show` still reaches it and
   git still has it. Writing a further note that supersedes nothing undoes the mistake.
3. **The alternative is worse.** Without it the only way to consolidate is to rewrite a note in
   place, which breaks the invariant the whole multi-agent design rests on.

### 6.2 Detecting a duplicate is not searching

`dixti note` compares the note being written against the store before writing it. This is a
different problem from §4 and uses a different function.

Search scores *does this note answer a question*, and scales by how much of the query matched,
because a query is a short and possibly half-remembered phrase. Consolidation asks *are these two
notes the same thing* — symmetric, with no query at all, comparing the candidate's full heading and
body. Dice coefficient on term sets, heading weighted 0.7 against body 0.3, with a leading section
number stripped as structure rather than subject.

**A measured limit, stated because it bounds what the check can be trusted for.** Lexical similarity
cannot separate *written twice* from *the same analysis applied to a different subject*. Over a real
467-note corpus the highest-scoring pair of all — identical headings — was two different cities, and
it outscored every genuine duplicate. At the threshold that stops a write, roughly one caught pair in
four was a true duplicate.

The thresholds are therefore set for recall, and the **agent decides** — the same division of labour
as §4's "a filter, not an oracle". That is affordable only because a stopped write is held rather
than discarded, so a false positive costs one command while a duplicate that slips through costs
every future reader. `dixti note` exits **2** when it stops, distinct from the 1 that means failure.

---

## 7. Validation

Three properties are enforced by construction rather than by a linter:

- **Ids are unique** — `dixti note` generates against the ids already in the store.
- **Notes parse** — anything that does not parse as a note is simply not one; a malformed meta line
  degrades to no metadata rather than failing.
- **Appends are safe** — `dixti note` only ever appends, and `dixti init` writes the union-merge line.

**One command rewrites files, and it is not on the agent write path.** `dixti topic merge <from>
<to>` folds one topic name into another when a subject ends up under two — "billing" and "billings".
Append-only exists so that two agents writing concurrently merge instead of conflicting, and a
maintenance command run deliberately by a person is not that case. It is constrained accordingly: a
dry run unless `--yes`, a refusal on a dirty `.agents/notes` tree or outside a git repository, and
every id, heading, body and date preserved. Only the `topic=` key changes, and only where it was
written down explicitly. The result is always one `git checkout` from undone.

If a store is edited by hand into a state dixti cannot read, `dixti dict` shows fewer notes than
expected. That is the whole failure mode, and it is visible.
