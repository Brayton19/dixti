# The collapsed two-step, measured on 447 notes — 2026-09-01

Above a token budget `dixti dict` prints topic names and counts instead of headings, and the agent
must pick a topic before it sees a single note. The 14/15 recall result was measured on the **fully
expanded** list, so it never tested this path — and this path is what a real corpus gets. The corpus
here is 447 notes / 38 topics / ~7,700 tokens expanded, roughly twice any sane session budget.

    P(found) = P(right topic from names alone) x P(right note | topic expanded)

Run: `node scripts/twostep-test.mjs --corpus <dir> --verbose`. Same 15
ground-truth cases as the BM25 recall test (`scripts/out/recall-cases.json`, gitignored).

## Step 1 — pick the topic from 38 names. LEXICAL LOWER BOUND.

| query style | gold topic shares any word with the query | rank 1 |
|---|---|---|
| verbatim | **4/15** | 4/15 |
| paraphrase | **0/15** | **0/15** |

**Zero.** Not one paraphrased query shares a single content word with the name of the topic holding
its answer. This is not a ranking failure — there is nothing to rank. Lexical topic selection is
dead on this corpus, so the two-step has **no mechanical fallback whatsoever**: it rests entirely on
the model's semantic judgement at step 1, and if that misses there is no backstop.

## Step 2 — correct topic already expanded

| query style | lexical search within the topic, rank 1 |
|---|---|
| verbatim | 15/15 |
| paraphrase | 6/15 |

Paraphrase within a topic scores exactly what BM25 scored over the whole corpus: **6/15**. Narrowing
the pool from 447 notes to ~19 buys nothing, because the failure was never pool size — it is
vocabulary. (An *agent* reading an expanded topic should do far better; the 14/15 baseline is that
task over a longer list. Step 2 is the easy half either way.)

## Why step 1 fails: the names do not describe the contents

Topic names here are derived from file basenames. Measured — for each topic, the share of its own
notes whose heading contains any word of the topic name:

| topic | notes | self-describing |
|---|---|---|
| SESSION LOG | 41 | 0% |
| kernel | 38 | 0% |
| DESIGN | 25 | 0% |
| infra | 20 | 0% |
| decisions | 19 | 0% |
| principles | 14 | 0% |
| ios payment | 29 | 28% |
| sql bigquery | 19 | 21% |

**Mean 12% across topics with ≥6 notes; twelve topics score 0%.** "kernel" means behavioural rules,
"decisions" means settled cross-project facts, "principles" means something else again. No reader —
model or human — infers those from the name, and 6 of the 15 gold answers live in exactly those
three topics.

## What this does and does not establish

**Established:** the lexical floor of the two-step is 0/15 on paraphrase, and topic names on this
corpus are near-meaningless as labels.

**NOT established: the realistic number.** A reading agent understands that "my jupyter run died and
the disk was full" belongs under "pandas notebooks" without sharing a word with it. That measurement
needs an agent with **fresh context that has not read the corpus** — a process that has already read
it grading itself on it measures nothing. Not run.

## The conclusion that does not depend on the missing number

The predicted fix is confirmed from the other direction: **topic names must be authored, not derived
from filenames.** Whatever the agent's semantic hit rate turns out to be, it is being handicapped by
labels that do not describe their contents 88% of the time — and the fix costs nothing at write time
because `dixti note --topic` already takes an arbitrary string.

Two consequences for the product:
1. The capture prompt should push toward a small set of meaningful topics — it already says to reuse
   an existing topic, which is necessary but not sufficient if the existing ones are bad.
2. `--adapt` derives topics from paths and that is the weakest part of adapting a foreign corpus.
   Worth surfacing rather than hiding.

*Caveats: 15 hand-written cases on one corpus, and both the targets and paraphrases were written by
the same person. The corpus was one person's notes organised into files for human reading rather
than for retrieval, which is close to the worst case for topic-name selection — but it is also
exactly what `--adapt` will meet in the wild.*
