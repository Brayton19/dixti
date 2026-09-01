#!/usr/bin/env node
/**
 * grade-corpus — what would a store of automatically-captured findings actually look like?
 *
 * The largest untested risk in dixti is extraction quality: if a session-end hook writes four
 * mediocre findings a session, five people produce ~2,000 a year and reviewers stop reading long
 * before that. Building the hook to find out is expensive.
 *
 * But a corpus captured this way already exists wherever someone has run a session-end sweep for
 * months, writing what each session learned into markdown, in `###`-headed blocks — structurally the
 * same unit dixti calls a finding. It is a natural experiment in exactly the mechanism we have not
 * built, with months of real data.
 *
 * This script is generic: it grades any directory of `###`-blocked markdown. It writes nothing and
 * prints only aggregates and headings, so it can be pointed at a private corpus without copying its
 * contents anywhere.
 *
 * What it estimates per block:
 *   anchorable   cites a repo path, a `db.table`, or a file:line — could decay mechanically
 *   tier proxy   T1 if it cites something that was executed (a query, a command, a measured number)
 *                T2 if it cites source it read
 *                T4 otherwise
 *   hedged       contains likely/probably/seems/appears — an unverified claim reading as settled
 *   tokens       chars / 4, the usual rough estimate
 *
 * Usage: node scripts/grade-corpus.mjs <dir> [<dir> ...] [--show-worst N]
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const HEADING = /^(#{1,6})\s+(.*)$/;
const FENCE = /^\s*(`{3,}|~{3,})/;

const PATH_CITE = /`[^`\n]*\/[^`\n]*\.\w{1,8}`|`\w+\.\w+`|\b[\w./-]+\.\w{1,4}:\d+\b/;
const RAN_SOMETHING = /\b(select |count\(|group by|query|queried|ran |running |measured|p50|p75|%\)|→ yes|→ no|rows|\d+(\.\d+)?%)/i;
const READ_SOURCE = /\b(traced|read the|in the code|source|defined in|implemented in|see `)/i;
const HEDGED = /\b(likely|probably|most likely|seems|appears to|presumably|i think|might be|should be)\b/i;
const DATE = /\b(20\d\d-\d\d-\d\d)\b/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** Split into `###`-headed blocks, ignoring headings inside fenced code. */
function blocks(content) {
  const lines = content.split("\n");
  const found = [];
  let fence = null;
  let current = null;
  let buf = [];

  const flush = () => {
    if (current) found.push({ heading: current, body: buf.join("\n").trim() });
    buf = [];
  };

  for (const line of lines) {
    const f = FENCE.exec(line);
    if (f) {
      const marker = f[1] ?? "";
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      buf.push(line);
      continue;
    }
    if (fence !== null) { buf.push(line); continue; }

    const h = HEADING.exec(line);
    if (h) {
      const level = (h[1] ?? "").length;
      if (level <= 3) {
        flush();
        current = level === 3 ? (h[2] ?? "").trim() : null;
        continue;
      }
    }
    buf.push(line);
  }
  flush();
  return found;
}

function grade(block) {
  const text = `${block.heading}\n${block.body}`;
  const anchorable = PATH_CITE.test(text);
  const tier = RAN_SOMETHING.test(text) ? "T1" : READ_SOURCE.test(text) ? "T2" : "T4";
  return {
    heading: block.heading,
    chars: text.length,
    tokens: Math.round(text.length / 4),
    anchorable,
    tier,
    hedged: HEDGED.test(text),
    dated: DATE.test(text),
  };
}

const args = process.argv.slice(2);
const showWorst = args.includes("--show-worst") ? Number(args[args.indexOf("--show-worst") + 1]) : 0;
const dirs = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--show-worst");

if (!dirs.length) {
  console.error("usage: node scripts/grade-corpus.mjs <dir> [...] [--show-worst N]");
  process.exit(1);
}

const all = [];
for (const dir of dirs) {
  if (!statSync(dir).isDirectory()) continue;
  for (const file of walk(dir)) {
    const rel = relative(dir, file);
    for (const b of blocks(readFileSync(file, "utf8"))) {
      all.push({ ...grade(b), file: rel, root: dir });
    }
  }
}

const pct = (n) => (all.length ? `${((n / all.length) * 100).toFixed(1)}%` : "n/a");
const count = (fn) => all.filter(fn).length;
const sum = (fn) => all.reduce((a, b) => a + fn(b), 0);
const med = (nums) => {
  const s = [...nums].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

console.log(`\ncorpus: ${dirs.join(", ")}`);
console.log(`${"=".repeat(64)}`);
console.log(`  blocks                 ${all.length}`);
console.log(`  total tokens           ~${sum((b) => b.tokens).toLocaleString()}`);
console.log(`  median block           ~${med(all.map((b) => b.tokens))} tokens`);
console.log(`  heading only (1-liner) ~${med(all.map((b) => Math.round(b.heading.length / 4)))} tokens`);
console.log(`\n  ANCHORABLE (could decay mechanically)`);
console.log(`    yes                  ${count((b) => b.anchorable)}  ${pct(count((b) => b.anchorable))}`);
console.log(`    no                   ${count((b) => !b.anchorable)}  ${pct(count((b) => !b.anchorable))}`);
console.log(`\n  EVIDENCE TIER (proxy — lexical, not the real classifier)`);
for (const t of ["T1", "T2", "T4"]) {
  console.log(`    ${t}                   ${count((b) => b.tier === t)}  ${pct(count((b) => b.tier === t))}`);
}
console.log(`\n  QUALITY SIGNALS`);
console.log(`    hedged (unverified)  ${count((b) => b.hedged)}  ${pct(count((b) => b.hedged))}`);
console.log(`    carries a date       ${count((b) => b.dated)}  ${pct(count((b) => b.dated))}`);

const byFile = new Map();
for (const b of all) byFile.set(b.file, (byFile.get(b.file) ?? 0) + 1);
console.log(`\n  TOP FILES`);
for (const [file, n] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`    ${String(n).padStart(4)}  ${file}`);
}

const idxCost = all.length * med(all.map((b) => Math.round(b.heading.length / 4)) ) ;
console.log(`\n  WHAT THIS MEANS FOR RETRIEVAL`);
console.log(`    one-line index of the whole corpus   ~${idxCost.toLocaleString()} tokens`);
console.log(`    against a 4,000-token budget          ${idxCost > 4000 ? "OVER — pull-based retrieval required" : "fits, for now"}`);

if (showWorst) {
  console.log(`\n  ${showWorst} LONGEST BLOCKS (candidates for splitting — a finding should be one claim)`);
  for (const b of [...all].sort((a, b) => b.tokens - a.tokens).slice(0, showWorst)) {
    console.log(`    ${String(b.tokens).padStart(5)}t  ${b.file}  ${b.heading.slice(0, 70)}`);
  }
}
console.log();
