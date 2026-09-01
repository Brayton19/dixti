# Import yield — does seeding from existing docs solve cold start?

**Run:** 2026-08-31 · **Command:** `dixti import <repo> --dry-run`

## The question

A fresh store is empty, so `search` and staleness have nothing to work on for the first fortnight —
a poor first run for the colleague you are trying to convince. The proposed fix was an importer that
seeds findings from documentation the repo already has. It was written up as *recommended, not
settled*, and costing about a day.

It cost about a day. Here is what it yields.

## Result

| Repo | Docs | Sections | **Imported** | no live path | doc-only refs | dated log |
|---|---|---|---|---|---|---|
| A | 2 | 41 | **3** | 29 | 1 | 8 |
| B | 4 | 64 | **0** | 62 | 2 | 0 |
| dixti | 2 | 11 | **1** | 8 | 2 | 0 |

**Zero to three findings per repo. The importer does not solve cold start.**

## Why — and it is not a bug in the importer

The dominant skip reason, in every repo, is that a doc section **cites no repo path at all**: 29 of
41, 62 of 64, 8 of 11. Documentation is written in prose about concepts, not in references to files.
A section that never names a file cannot be anchored, and an unanchored finding never decays and never
surfaces on a working-set match — it would be text already in the repo, copied to a second place, with
a confidence score attached to it. Importing those would be pure noise.

So the filter is doing its job. The supply simply is not there.

## What the surviving findings look like

The three from A are reasonable — `CLAUDE.md § Data Flow` anchored to `src/data/case-studies.ts`,
`§ Data Validation` anchored to `scripts/validate-data.ts`. Those genuinely would surface at the right
moment. The one from dixti's own docs anchors the architecture section to six source files.

They are real, they are correctly T4, and there are not enough of them to matter.

## Two precision rules the first run forced

The first pass returned 7 from A and 2 from B. Both sets contained junk, and inspecting
it produced two rules now in `src/import.ts`:

1. **Dated changelog headings are skipped.** `CLAUDE.md § Mar 1, 2026` is a record of what happened on
   a day, not a claim about the system — stale by construction. Eight of A's sections.
2. **A markdown path does not qualify a section for import.** Both of B's imports anchored only
   to *other documents*; a doc pointing at a doc is a cross-reference, not a claim about code. Doc
   paths are still recorded as anchors when the section also cites real code.

After both rules: A 7 → 3, B 2 → 0.

## Verdict

**Keep the importer, stop treating it as the cold-start answer.** It is cheap, it is honest — on
B it prints "Nothing to write" rather than padding the store — and on a repo with reference-heavy
documentation it will do better than it did here. But the plan said a day of work would give a
populated store on day one, and that was wrong.

**Cold start is not solvable from documentation.** It has to come from capture, or from accepting that
the first fortnight is thin. That should be said out loud to anyone being asked to adopt this, rather
than promising a store that fills itself.

## Caveats

- Three repos, all mine, all small (2–4 docs each). A large codebase with an ADR practice or reference
  documentation that names files would yield more — *untested, and worth testing before the importer
  is written off entirely*.
- Only `README`/`AGENTS`/`CLAUDE`/`CONTRIBUTING`/`ARCHITECTURE`/`DESIGN`/`SPEC` at root plus
  `docs/`, `doc/`, `adr/`, `decisions/` trees are scanned. Docstrings and code comments are not, and
  they are where file-specific claims actually live. **That is the most promising untried source.**
