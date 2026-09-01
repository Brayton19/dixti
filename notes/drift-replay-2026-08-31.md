# Drift replay — does anchor-based staleness detection work?

**Run:** 2026-08-31 · **Script:** `scripts/drift-replay.mjs` · **Raw:** `scripts/out/drift-{early,late}.json`

## The question

dixti marks a finding `STALE` when the commit of a file it anchors to changes. That is exact and free.
It is only *useful* if anchor movement correlates with the claim actually being invalidated. If most
anchor movement turns out to be reformatting and comment edits, the state means nothing, and the
curator's diff-reading has to ship alongside the decay engine instead of after it.

This was the cheapest way to find out, and it needed no dixti — it is pure `git log` analysis.

## Method

1. `T0` = the commit at a chosen fraction through the repo's non-merge history.
2. Every source file present at `T0` and still present at `HEAD` gets a simulated finding anchored to
   it, born at `T0`.
3. Walk every non-merge commit after `T0` touching that file.
4. Classify the **first** such commit — the one that fires the stale flag.

| Class | Test |
|---|---|
| `whitespace` | diff empty under `-w --ignore-blank-lines` |
| `comments` | every changed line is a comment or blank |
| `trivial` | 1–2 changed lines of real code |
| `substantive` | 3+ changed lines of real code |

**False alarm = whitespace + comments.** `trivial` is reported separately and deliberately *not*
counted as a false alarm — a one-line change can genuinely invalidate a claim, and folding it either
way would put a thumb on the scale.

Repos: three private repositories, referred to below as A, B and C. Two runs, `--at 0.25` (early, peak churn) and
`--at 0.70` (later, more settled), to check whether the result was an artifact of the anchor point.

## Result 1 — the false-alarm rate is negligible

| Anchor point | Stale events | whitespace + comments | trivial | substantive | **False alarm** |
|---|---|---|---|---|---|
| 25% through history | 62 | 2 | 13 (21.0%) | 47 (75.8%) | **3.2%** |
| 70% through history | 56 | 0 | 9 (16.1%) | 47 (83.9%) | **0.0%** |

Between 76% and 84% of stale triggers were substantive code changes. Only two events across both runs
were cosmetic.

**Verdict: plain anchor-commit comparison is good enough to ship.** The curator's diff-reading is
still worth building for other reasons, but it is *not* needed to suppress false alarms, and the decay
engine does not depend on it. That removes a dependency from the stage-2 build.

## Result 2 — the unexpected one: staleness is accurate but high-volume

| Repo | Window | Findings | Went stale | Median days to stale |
|---|---|---|---|---|
| A | 17d | 33 | 54.5% | 3 |
| B | 53d | 91 | 31.9% | 1 |
| C | 6d | 35 | 42.9% | 2 |

Between a third and a half of all findings go stale, and in actively developed areas the median time
to stale is **1–3 days**.

These are not false positives — they are real changes to the anchored code. But it means a rule of
*stale ⇒ sinks out of retrieval* would empty the store of exactly the areas people are working in
hardest, which are the areas where findings are most valuable.

**Design consequence:** `STALE` should mean *re-verify me*, not *ignore me*. Concretely:

- Staleness should demote rather than exclude, and a stale `T1` finding should still outrank a fresh
  `T4` one — a measurement whose code moved is usually worth more than a convention nobody checked.
- The label injected at session start should distinguish "this may have moved" from "this is weak",
  because they call for different responses from the reader.
- Re-verification is cheap for `T1` findings specifically, because they carry the command that
  established them. That is an argument for pushing capture hard toward `T1`.

## Caveats — do not over-read this

- **Short windows.** 2–53 days. Nothing here says anything about a 6-month horizon.
- **Young repos in rapid development.** All three were in active build-out. A mature codebase almost
  certainly churns less, so the stale rates here are an upper bound.
- **Modest samples.** 9–29 stale events per repo; 56–62 combined.
- **File granularity, not symbol.** A file-level anchor is coarser than `path#symbol` and will
  overstate staleness. Symbol anchors should test better; that is untested.
- **Every source file, not real findings.** Real findings cluster on things people actually
  investigate, which may churn differently from the average file.

The false-alarm result is robust across both anchor points and all three repos, so it is safe to build
on. The volume result is directionally clear but the exact rates should be re-measured on a mature
repo before anything tunes half-lives against them.
