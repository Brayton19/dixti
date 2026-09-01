# Lexical recall — is keyword search enough, or does dixti need embeddings?

**Run:** 2026-09-01 · **Script:** `scripts/recall-test.mjs` · **Corpus:** a private 310-block corpus
of six months' automatically-captured findings

## Why it mattered before building the index

BM25 is free: SQLite ships FTS5, no model, no API, no service to run. Embeddings cost a model call
per query plus a vector index to maintain — a dependency in a tool whose whole pitch is *no server, no
vendor*. Worth answering before the index exists rather than after.

The honest test is not whether search finds a block using the block's own words. It is whether it
finds it when someone asks months later, in their own words. So every target got two queries:
**verbatim** (the block's distinctive terms) and **paraphrase** (deliberately avoiding them).

## Result

| Query style | hit@1 | hit@3 | hit@5 | never found | MRR |
|---|---|---|---|---|---|
| **verbatim** | 15/15 | 15/15 | 15/15 | 0 | **1.00** |
| **paraphrase** | 6/15 | 9/15 | 10/15 | 3 | **0.50** |

**If you remember the words, BM25 is perfect. If you ask in your own words, it misses the right
finding in the top three 40% of the time, and never finds it at all in 20%.**

Weighting headings 3× barely moved anything (hit@1 5 → 6), so the fix is not in the ranking function.

## What the failures actually look like

Not all misses are equal. Two of the six returned a *genuinely related* block:

- A question about how to tell whether a payment happened without the customer present returned a
  different finding about the same field — arguably the more useful answer of the two.
- A question about missing regression coefficients returned a different gotcha in the same statistics
  library: wrong, but in the right neighbourhood.

The other four were noise — one query about statistical significance matched an unrelated block on a
token collision, and nothing more.

*(Query and heading text is not reproduced here; the corpus is private. Ground truth lives in a
gitignored fixture, see `scripts/recall-test.mjs --cases`.)*

So the practical failure rate is somewhat better than 40%, but not enough to change the conclusion.

## Decision: ship FTS5, do not ship embeddings

Three reasons, in order of weight:

1. **Search is not dixti's primary retrieval path.** The main path is *anchor ∩ working-set* — findings
   surface because you touched a file they point at, with no text matching involved at all. This test
   measures the secondary path. A 0.50 MRR on the fallback is a very different problem from 0.50 on
   the main road.
2. **BM25 is perfect when the vocabulary is shared**, which is the common case within one team working
   on one codebase — table names, service names, error strings.
3. The **link graph** is the designed partial fix and this data supports it: in both near-miss cases
   the block returned would plausibly be linked to the right one, so expanding a good hit to its
   neighbours recovers the answer. That costs nothing extra once links exist.

**Instrument instead of pre-solving.** Log every search and whether the agent expanded anything from
it. `MRR 0.50 / hit@3 60%` is now the baseline. If real usage produces a high
search-with-no-expansion rate, embeddings are justified by evidence rather than by anticipation.

## Caveats

- **15 cases, hand-written by the same person who picked the targets.** The paraphrases could be
  harder or easier than real queries; there is no way to know without real ones.
- One person's corpus, in a fairly technical vocabulary. A team corpus would have more shared
  vocabulary, which favours BM25, and more people paraphrasing each other, which does not.
- Scoring counted only exact target hits. A user handed a related-but-different finding may well be
  satisfied; that is not captured here and would make the numbers look better.
