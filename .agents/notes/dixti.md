# dixti's own findings

Seeded by hand from the 2026-08-31 drift replay. These are real T1 claims — a command was run and
this file quotes its output.

### Anchor-commit comparison has a false-alarm rate under 4% <!--dx:0f3a71c2-->
<!--dx topic=dixti date=2026-08-31-->

Across three repos at two anchor points, cosmetic changes accounted for 3.2% of stale triggers at the
early anchor point and 0.0% at the later one. 76-84% were substantive code changes.

Run: `node scripts/drift-replay.mjs <repo> --at 0.25`. Plain `git log` comparison is therefore
good enough to ship, and the curator's diff-reading is not a prerequisite for the decay engine.

### A third to a half of findings go stale within days in an active repo <!--dx:8b21d04e-->
<!--dx topic=dixti date=2026-08-31-->

Median time to stale was 1-3 days; 18-55% of simulated findings went stale inside windows of 2-53
days. These are real changes, not false positives.

Consequence: STALE must mean "re-verify me", not "ignore me". Staleness demotes rather than excludes,
and a stale T1 should outrank a fresh T4.

Measured on young repos in rapid build-out, so treat these rates as an upper bound.

### npx resolves the executable from the package name, so package != bin needs -p <!--dx:c47e9a15-->
<!--dx topic=dixti date=2026-08-31-->

`npx --yes typescript@5 tsc --noEmit` fails with "could not determine executable to run". The fix is
`npx --yes -p typescript@5 tsc --noEmit`. Bit both the local check and CI, and the error names no cause.

### Importing from existing docs yields 0-3 findings and does not solve cold start <!--dx:5e1c8a37-->
<!--dx topic=dixti date=2026-08-31-->

Measured across three repos: 3 of 41 sections, 0 of 64, and 1 of 11 (dixti's own).

The dominant skip reason everywhere is that a doc section cites no repo path at all (29/41, 62/64,
8/11). Documentation is prose about concepts, not references to files, and an unanchored finding
never decays and never surfaces on a working-set match.

Keep the importer — it is cheap and it prints "Nothing to write" rather than padding -- but cold
start has to come from capture, not from documentation. Docstrings and code comments are the most
promising untried source.

Run: `dixti import <repo> --dry-run`. Caveat: three small repos, all mine.

### Keyword search is perfect on remembered wording and halves on paraphrase <!--dx:b91f4c60-->
<!--dx topic=dixti date=2026-09-01-->

BM25 over 309 blocks of a real personal notes corpus, 15 targets, two queries each. Verbatim wording: 15/15 at rank 1,
MRR 1.00. Paraphrased wording: 6/15 at rank 1, 9/15 in the top 3, 3 never found, MRR 0.50. Weighting
headings 3x moved hit@1 from 5 to 6, so the ranking function is not where the loss is.

Decision: ship FTS5, do not ship embeddings yet. Search is the secondary retrieval path -- the primary
one is anchor-intersect-working-set, which does no text matching at all. Instrument searches that
produce no expansion and let real usage justify embeddings against this baseline.

Run: `node scripts/recall-test.mjs`. Caveat: 15 hand-written cases, one person's corpus.

### Six months of automatic capture yields 43% evidence-backed but only 29% anchorable <!--dx:2c7d3e18-->
<!--dx topic=dixti date=2026-09-01-->

A personal notes corpus produced by months of session-end sweeps holds 309 blocks, ~82,000 tokens. Lexical proxy
grading: 43% cite something executed or measured, 11% cite source they read, 47% are assertions.
Only 8% carry hedge words. But just 29% cite a file path or table, so seven in ten could never decay
mechanically.

Two consequences. Capture must demand an anchor rather than hope for one -- the same gap the doc
importer hit from the other direction. And real captured blocks are not atomic claims: the median is
177 tokens but the largest is 6,000, so the format has to tolerate large blocks or capture has to
split them.

Also confirms the scale model empirically: a one-line index of 309 blocks is ~4,900 tokens, already
over a 4,000-token budget from one person in six months.

Run: `node scripts/grade-corpus.mjs <dir>`. Caveat: the tier split is a lexical proxy, not the real
classifier.

### A dictionary of one-line summaries beats keyword search 14/15 against 6/15 <!--dx:0ccffa6c-->
<!--dx topic=dixti date=2026-09-01-->

Blind test on 311 one-line summaries from a real corpus. An agent with fresh context, given only the
dictionary and 15 paraphrased questions, picked the correct finding 14/15 at rank 1 and 15/15 in the
top 3. BM25 keyword search on the identical corpus and identical queries scored 6/15 and 9/15.

The single non-first pick was the same defensible near-miss BM25 made -- a related finding about the
same field, with the correct answer as its first alternate.

This settles the design fork: the reading agent is the search engine, and the deleted retrieval
machinery stays deleted. Caveat: 15 hand-written cases on one corpus, and it measures retrieval, not
whether a one-liner triggers a behavioural rule unprompted.

### A real corpus overshoots the dictionary budget by 3x, so the collapsed path is the one that ships <!--dx:d4e0a92b-->
<!--dx topic=dixti date=2026-09-01-->

Adapting a real personal notes corpus measured 606 findings across 46 themes at ~11,720 tokens fully expanded. A session-start
budget of 4,000 tokens collapses that to 46 theme headers and ~380 tokens.

The 14/15 blind-test result was measured on the *expanded* dictionary. On the real corpus an agent
never sees it: it sees theme names and must pick one before it sees any entry. That two-step path was
filed as an open question for "~3,000 findings" -- it is live at 606, from one person, today.

It also puts weight on theme names, which are derived from file paths and read badly at this corpus:
"claude patterns pre split 2026 07 07", "01 us persons in europe". A theme name is now a retrieval
surface, not a label.

Run: `dixti dict --adapt <corpus> --budget 999999` versus `--budget 4000`.

### An adapted corpus must not have its reads charged to the store in the working directory <!--dx:6a1f83d5-->
<!--dx topic=dixti date=2026-09-01-->

First implementation keyed the fetch buffer to `--dir`/cwd. Running `dixti show <id> --adapt <corpus>`
from inside the dixti repo therefore buffered a foreign id against dixti's own store, and `dixti flush`
reported it as "dropped -- no longer in the store". Wrong twice: the finding was never in that store,
and the store gained a usage signal for something it does not contain.

Caught by running the round trip, not by a test -- both halves were individually correct.

### A raw NUL byte in a source file makes it invisible to grep and git diff <!--dx:f70b2c94-->
<!--dx topic=dixti date=2026-09-01-->

`derivedId` used a NUL as an unambiguous separator between path and heading, written as a literal
byte in the template literal rather than as `\u0000`. Correct at runtime, and it shipped that way.

The cost is entirely in tooling. `grep` classified the file as binary and printed nothing for
matches that existed; `git diff` reported "Binary files differ" and no hunks. Both fail *silently* --
grep exits 1 as if the pattern were absent -- so an edit could be read back as not applied.

`\u0000` is the same character to the runtime. Verified by regenerating ids for all 606 findings in
an adapted corpus before and after: identical.

Rule: never write a control byte below 0x09 literally into source. Escape it.

### The shipped lexical search survives rephrasing but not vocabulary substitution <!--dx:50cff823-->
<!--dx topic=dixti date=2026-09-01-->

Spot check on a one-note store, 4 queries. Note heading: 'Refunds re-enter the ledger as a second positive row', body mentions kind='refund', SUM(amount), double-counts.

  hit   'why is my revenue sum too high'   (shares 'sum')
  hit   'negative amounts ledger'          (shares 'amounts', 'ledger')
  hit   'refunds'
  MISS  'chargeback totals wrong'          (shares nothing lexically)

So it tolerates a question being phrased differently as long as one content word is shared, and fails completely when the asker's vocabulary does not overlap the note's at all. This is the same failure BM25 showed at 6/15 on paraphrase (b91f4c60) — the shipped search is not better, it is the same class of tool without an index.

Mitigation that already exists: 'dixti dict' lists every heading, so an empty search is not a dead end. That is only true while a store fits a budget.

INDICATIVE, NOT MEASURED — 4 queries against 1 note, written by the person who wrote the note. A real test needs the 15-query harness in notes/recall-test-2026-09-01.md pointed at the new search.

### Path-derived topic names are near-useless as labels: 12% self-describing, 0/15 lexical topic recall <!--dx:3d45ef44-->
<!--dx topic=dixti date=2026-09-01-->

Measured on a 447-note / 38-topic corpus (notes/twostep-test-2026-09-01.md).

Above budget, dixti dict shows topic names only and the agent must pick a topic before seeing any heading. Two results:

1. LEXICAL FLOOR IS ZERO. Not one of 15 paraphrased queries shares a single content word with the name of the topic holding its answer (verbatim queries: 4/15). Nothing to rank. The two-step therefore has no mechanical fallback at all -- it rests entirely on the model's semantic judgement, and a miss has no backstop.

2. THE NAMES DO NOT DESCRIBE THE CONTENTS. For each topic, the share of its own notes whose heading contains any word of the topic name: mean 12%, and twelve topics score 0% ('kernel' means behavioural rules, 'decisions' means settled facts, 'principles' something else). Six of the fifteen answers live in those three topics.

Step 2 is fine: with the correct topic expanded, lexical search gets 6/15 on paraphrase -- exactly BM25's whole-corpus score, so narrowing 447 notes to 19 buys nothing. Pool size was never the problem; vocabulary is.

CONSEQUENCE: topic names must be AUTHORED, not derived from file paths. Costs nothing -- 'dixti note --topic' already takes any string -- and it is the weakest part of '--adapt' on a foreign corpus.

NOT MEASURED: the realistic rate, which needs an agent with fresh context that has not read the corpus. A process that has already read the corpus grading itself on it measures nothing.
