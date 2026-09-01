# Is a one-sentence summary enough? — the dictionary vs keyword search

**Run:** 2026-09-01 · **Corpus:** a private 311-entry corpus of six months' automatically-captured findings

## The question this settles

The dictionary model deleted four retrieval mechanisms — anchor∩working-set selection, an FTS5 index,
BM25, Wilson ranking — and replaced them with one: load a one-line summary of *everything* and let the
reading agent decide what to open. That moved the entire design onto a single untested assumption.
**If a sentence does not tell an agent whether a finding is worth opening, the finding is invisible
however good it is**, and all the deleted machinery has to come back.

## Method

An agent with **fresh context that had never seen the corpus** was given two things: the rendered
dictionary (311 lines of `id · tier · one-sentence summary`, grouped by theme, ~6,600 tokens) and 15
questions. It was told to pick the finding it would open, best plus up to two runners-up, and
explicitly instructed not to read any files or look for full text.

The 15 questions were **the same paraphrased queries** used for the keyword-search test in
`recall-test-2026-09-01.md` — phrased the way somebody would ask months later, deliberately avoiding
the target's distinctive vocabulary. Same corpus, same queries, same ground truth. The only variable
is the retrieval method.

The agent never saw the ground truth, and grading was scripted.

## Result

| Method | hit@1 | hit@3 | never found | MRR |
|---|---|---|---|---|
| **Dictionary — an agent reading 311 one-liners** | **14/15** | **15/15** | **0** | **0.97** |
| BM25 keyword search, identical queries | 6/15 | 9/15 | 3 | 0.50 |

**Better than double the rank-1 accuracy, and nothing was missed entirely.**

## The one that was not ranked first

Asked *"how do I tell whether a charge happened without the customer present"*, the agent picked a
finding about how that field is set in a specific system, rather than the one about the field not
existing in the payment provider's response. The correct answer was its first alternate.

That is the same near-miss BM25 made, and it is arguably the more useful answer to the question as
asked. It is scored as a miss here because moving the goalposts after seeing the result is how
measurements become worthless.

## What this does and does not establish

**Settles:** the reading agent is a better search engine than BM25 over this corpus, by a wide margin,
on exactly the queries BM25 struggles with. The deleted machinery stays deleted, and the design does
not need embeddings.

**Does not settle — and the distinction matters:** this measures **retrieval**, where the agent has a
question and is looking for an answer. It says nothing about **unprompted triggering** — whether a
one-line summary changes behaviour when nobody asked. That is the harder case, and it is the one that
matters if a dictionary is ever used for behavioural rules rather than facts. Different test, not yet
designed.

## Caveats

- **15 cases, written by the same person who chose the targets.** The bias applies equally to both
  methods, which is what makes the comparison meaningful even though the absolute numbers are soft.
- One corpus, one run, one model.
- The agent had the whole dictionary in context. At a corpus size where the dictionary must collapse to
  theme headers, retrieval becomes two-step and this result does not transfer unchanged.
