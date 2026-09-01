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

