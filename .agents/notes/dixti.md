# dixti's own notes

dixti's store, in dixti's repository. Each of these cost an hour to work out and would have cost
another hour to work out again.

### npx resolves the executable from the package name, so package != bin needs -p <!--dx:c47e9a15-->
<!--dx topic=dixti date=2026-08-31-->

`npx --yes typescript@5 tsc --noEmit` fails with "could not determine executable to run". The fix is
`npx --yes -p typescript@5 tsc --noEmit`. Bit both the local check and CI, and the error names no cause.

### A raw NUL byte in a source file makes it invisible to grep and git diff <!--dx:f70b2c94-->
<!--dx topic=dixti date=2026-09-01-->

`derivedId` used a NUL as an unambiguous separator between path and heading, written as a literal
byte in the template literal rather than as `\u0000`. Correct at runtime, and it shipped that way.

The cost is entirely in tooling. `grep` classified the file as binary and printed nothing for
matches that existed; `git diff` reported "Binary files differ" and no hunks. Both fail *silently* --
grep exits 1 as if the pattern were absent -- so an edit could be read back as not applied.

`\u0000` is the same character to the runtime. Verified by regenerating every derived id in a large
corpus before and after the change: identical.

Rule: never write a control byte below 0x09 literally into source. Escape it.


### Duplicate detection cannot reuse search: search scores query coverage, dedup is symmetric <!--dx:11c60cb3-->
<!--dx topic=dixti date=2026-09-04-->

`search` scales a note's score by `matched.length / words.length` — the fraction of the *query* that matched. That is right for a question, which is short and half-remembered, and wrong for a duplicate check: feed it a whole note body and the multiplier collapses, so a real duplicate scores near zero.

So `similar.ts` is a separate function — symmetric Dice on term sets, heading weighted 0.7 against body 0.3 — and never calls `search`.

The useful consequence: the measured paraphrase-recall ceiling on lexical search does NOT bound the duplicate check. That ceiling exists because a human phrases a question differently from the note. A duplicate check has no query to misphrase — the query is the note being written, which is the richest input the tool ever gets.

### Lexical similarity cannot tell a repeated note from the same analysis applied to a different subject <!--dx:90121f59-->
<!--dx topic=dixti date=2026-09-04-->

Leave-one-out over a 467-note corpus: the write-time duplicate check stops about 1 write in 27. Of the nine distinct pairs it caught, two were genuine duplicates and seven were parallel work — the same analysis run for two different cities, three reviews of different artefacts on one day.

The highest-scoring pair in the entire corpus (0.838, *identical* headings) is two different subjects, and it outscores every true duplicate. Precision at the blocking threshold is therefore about 22%, and **no threshold fixes it**: the false positives are textually more alike than the true positives.

Accepted rather than tuned away, because the costs are asymmetric. A false stop costs one command from an agent that has exactly the context needed to answer it; a duplicate that slips through costs every future reader. That is only affordable because a stopped write is held and re-offered rather than discarded.

Caveat: the corpus measured is adapted markdown with templated section headings, not a native store whose headings are standalone sentences. Native precision is probably better and is unmeasured.

If it proves too noisy in use, try a rare-term check — parallel notes each carry a discriminating proper noun the other lacks — not another threshold.
