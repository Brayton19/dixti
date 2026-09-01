#!/usr/bin/env node
/**
 * twostep-test — what does collapsing to topics cost?
 *
 * Above a token budget `dixti dict` prints topic names and counts instead of every heading, and the
 * agent must choose a topic before it can see a single note. The 14/15 recall result was measured on
 * the *fully expanded* list, so it says nothing about this path — and this path is what a real
 * corpus gets: a few hundred notes expands to several thousand tokens, well over any sane session
 * budget.
 *
 * The two-step succeeds only if BOTH steps do:
 *
 *   P(found) = P(right topic from names alone) x P(right note | topic expanded)
 *
 * Step 2 is the easy half — it is the same task as the 14/15 baseline over a much shorter list. The
 * unknown is step 1, and step 1 is where a topic name has to carry the whole query.
 *
 * WHAT THIS SCRIPT MEASURES, AND WHAT IT CANNOT
 * ---------------------------------------------
 * It measures step 1 *lexically*: it scores topic names against the query the way `dixti search`
 * scores notes, and reports where the correct topic ranks. That is a LOWER BOUND — a reading agent
 * understands that "my jupyter run died partway through" belongs under "pandas notebooks" without
 * sharing a word with it, and no lexical scorer ever will.
 *
 * It also reports the lexical CEILING: how often the correct topic name shares any content word with
 * the query at all. Below that ceiling, no amount of lexical cleverness helps; the gap between the
 * ceiling and 15 is the work only a model can do.
 *
 * The realistic number needs an agent with fresh context that has not read the corpus. This script
 * deliberately does not attempt it, because a process that has already read the corpus grading
 * itself on that corpus measures nothing.
 *
 * Usage: node scripts/twostep-test.mjs --corpus <dir> [--exclude archive] [--cases <file>] [--verbose]
 */

import { readFileSync } from "node:fs";
import { relative } from "node:path";

import { markdownFiles } from "../dist/store.js";
import { adaptFile } from "../dist/adapt.js";
import { topicOf } from "../dist/dict.js";
import { search, terms } from "../dist/search.js";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] ?? fallback) : fallback;
};

const corpus = flag("--corpus", null);
if (!corpus) {
  console.error("usage: node scripts/twostep-test.mjs --corpus <dir> [--exclude <names>] [--cases <file>]");
  process.exit(2);
}
const exclude = flag("--exclude", "archive").split(",").filter(Boolean);
const casesFile = flag("--cases", "scripts/out/recall-cases.json");
const verbose = argv.includes("--verbose");

const notes = markdownFiles(corpus, exclude).flatMap((f) =>
  adaptFile(relative(corpus, f), readFileSync(f, "utf8")),
);
const cases = JSON.parse(readFileSync(casesFile, "utf8"));

const byTopic = new Map();
for (const n of notes) {
  const t = topicOf(n);
  if (!byTopic.has(t)) byTopic.set(t, []);
  byTopic.get(t).push(n);
}
const topicNames = [...byTopic.keys()];

/**
 * Score a topic NAME against a query, the way search scores a heading. A topic name is all the agent
 * has at step 1 — no notes, no bodies, just the name and a count.
 */
function rankTopics(query) {
  const words = terms(query);
  const scored = topicNames.map((name) => {
    const hay = name.toLowerCase();
    const matched = words.filter((w) => hay.includes(w));
    return { name, score: matched.length, matched };
  });
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return scored;
}

const results = [];
for (const [i, c] of cases.entries()) {
  // A target fragment may legitimately match more than one note when the corpus states the same
  // rule twice; any of them counts as correct rather than dropping the case.
  const targets = notes.filter((n) => n.heading.includes(c.target));
  if (targets.length === 0) {
    results.push({ n: i + 1, missing: true });
    continue;
  }
  const goldTopics = new Set(targets.map(topicOf));

  for (const style of ["verbatim", "paraphrase"]) {
    const query = c[style];
    const ranked = rankTopics(query);
    const rank = ranked.findIndex((t) => goldTopics.has(t.name)) + 1;
    const scoreOfGold = ranked.find((t) => goldTopics.has(t.name))?.score ?? 0;

    // Step 2: expand the correct topic and search within it.
    const pool = [...goldTopics].flatMap((t) => byTopic.get(t) ?? []);
    const within = search(pool, query, 3);
    const step2Rank = within.findIndex((h) => targets.includes(h.note)) + 1;

    results.push({
      n: i + 1,
      style,
      query,
      goldTopic: [...goldTopics].join("|"),
      topicRank: scoreOfGold > 0 ? rank : 0, // 0 = no lexical overlap at all
      reachable: scoreOfGold > 0,
      topicPoolSize: pool.length,
      step2Rank,
    });
  }
}

const rows = results.filter((r) => !r.missing);
const missing = results.filter((r) => r.missing);

function report(style) {
  const r = rows.filter((x) => x.style === style);
  const reachable = r.filter((x) => x.reachable).length;
  const at1 = r.filter((x) => x.topicRank === 1).length;
  const at3 = r.filter((x) => x.topicRank >= 1 && x.topicRank <= 3).length;
  const s2at1 = r.filter((x) => x.step2Rank === 1).length;
  const bothAt1 = r.filter((x) => x.topicRank === 1 && x.step2Rank === 1).length;
  return { n: r.length, reachable, at1, at3, s2at1, bothAt1 };
}

console.log(`corpus     ${notes.length} notes · ${topicNames.length} topics · ${corpus}`);
console.log(`cases      ${rows.length / 2} usable${missing.length ? ` (${missing.length} target no longer in corpus)` : ""}`);
console.log(`\nSTEP 1 — pick the topic from ${topicNames.length} names, lexically. LOWER BOUND.`);
console.log(`  style        gold topic shares a word   rank 1   top 3`);
for (const style of ["verbatim", "paraphrase"]) {
  const s = report(style);
  console.log(
    `  ${style.padEnd(11)} ${String(s.reachable + "/" + s.n).padEnd(25)} ${String(s.at1 + "/" + s.n).padEnd(8)} ${s.at3}/${s.n}`,
  );
}
console.log(`\nSTEP 2 — correct topic already expanded, find the note inside it.`);
for (const style of ["verbatim", "paraphrase"]) {
  const s = report(style);
  console.log(`  ${style.padEnd(11)} rank 1: ${s.s2at1}/${s.n}`);
}
console.log(`\nBOTH STEPS, lexical throughout (the floor):`);
for (const style of ["verbatim", "paraphrase"]) {
  const s = report(style);
  console.log(`  ${style.padEnd(11)} ${s.bothAt1}/${s.n}`);
}

if (verbose) {
  console.log(`\nper case (paraphrase):`);
  for (const r of rows.filter((x) => x.style === "paraphrase")) {
    const mark = r.topicRank === 1 ? "  " : r.reachable ? "~ " : "X ";
    console.log(
      `${mark}${String(r.n).padStart(2)}  topic=${r.goldTopic.padEnd(22)} rank=${r.topicRank || "none"}  step2=${r.step2Rank || "miss"}  ${r.query}`,
    );
  }
}
