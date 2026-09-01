#!/usr/bin/env node
/**
 * recall-test — is keyword search enough, or does dixti need embeddings?
 *
 * BM25 costs nothing: SQLite ships FTS5, no model, no API, no index service. Embeddings cost a model
 * call per query plus a vector index to maintain, and they are a dependency in a tool whose entire
 * pitch is "no server, no vendor". So the question is worth answering before building the index, not
 * after.
 *
 * The honest test is not "can search find a block using the block's own words" — of course it can.
 * It is whether search finds it when someone asks months later, in their own words, having forgotten
 * the phrasing. So every target here has two queries:
 *
 *   verbatim    uses the block's distinctive terms — the upper bound
 *   paraphrase  how a person would actually ask, deliberately avoiding those terms
 *
 * The gap between the two is the cost of not having embeddings.
 *
 * Ground truth is hand-written per corpus and supplied with --cases. Queries should be written from
 * the heading alone, then checked against the body; where a paraphrase accidentally reuses a rare
 * term from the block, rewrite it.
 *
 * Usage: node scripts/recall-test.mjs --corpus <dir>[,<dir>] [--cases <file>] [--verbose]
 */

import { readdirSync, readFileSync } from "node:fs";

/**
 * Ground truth is loaded from --cases, not embedded here. Each entry is
 * {target, verbatim, paraphrase}: a fragment of the block heading to locate, the query using the
 * block's own vocabulary, and the query a person would actually type having forgotten it.
 *
 * It lives outside the repo because it necessarily quotes the corpus, and a corpus may be private.
 */
const DEFAULT_CASES = "scripts/out/recall-cases.json";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] ?? fallback) : fallback;
};

const ROOTS = (flag("--corpus", "") || "").split(",").map((d) => d.trim()).filter(Boolean);
const CASES_FILE = flag("--cases", DEFAULT_CASES);

if (!ROOTS.length) {
  console.error(
    "usage: node scripts/recall-test.mjs --corpus <dir>[,<dir>...] [--cases <file>] [--verbose]\n\n" +
      "  --cases  JSON array of {target, verbatim, paraphrase}. Ground truth is corpus-specific and\n" +
      "           stays out of this repo — the default path is gitignored.",
  );
  process.exit(1);
}


// ---------------------------------------------------------------- corpus

const FENCE = /^\s*(`{3,}|~{3,})/;
const H = /^(#{1,6})\s+(.*)$/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

function blocks(file, content) {
  const out = [];
  let fence = null;
  let heading = null;
  let buf = [];
  const flush = () => {
    if (heading !== null) out.push({ file, heading, body: buf.join("\n").trim() });
    buf = [];
  };
  for (const line of content.split("\n")) {
    const f = FENCE.exec(line);
    if (f) {
      const m = f[1] ?? "";
      if (!fence) fence = m;
      else if (m[0] === fence[0] && m.length >= fence.length) fence = null;
      buf.push(line);
      continue;
    }
    if (fence) { buf.push(line); continue; }
    const h = H.exec(line);
    if (h && (h[1] ?? "").length <= 3) {
      flush();
      heading = (h[1] ?? "").length === 3 ? (h[2] ?? "").trim() : null;
      continue;
    }
    buf.push(line);
  }
  flush();
  return out;
}

const corpus = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    corpus.push(...blocks(file.slice(root.length + 1), readFileSync(file, "utf8")));
  }
}

// ---------------------------------------------------------------- BM25

const STOP = new Set(
  ("a an the and or but if then of to in on for with without is are was were be been being it its this that these those " +
   "as at by from not no do does did doing have has had i you we they my your our their when what which who how why " +
   "can could should would will just so than too very s t").split(" "),
);

const tok = (s) =>
  s.toLowerCase().split(/[^a-z0-9_.]+/).filter((w) => w.length > 1 && !STOP.has(w));

function buildIndex(headingBoost) {
  const docs = corpus.map((b) => {
    const terms = [...Array(headingBoost).fill(b.heading), b.body].flatMap((t) => tok(t));
    const tf = new Map();
    for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { tf, len: terms.length };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avgLen = docs.reduce((a, d) => a + d.len, 0) / docs.length;
  return { docs, df, avgLen, N: docs.length };
}

function search(idx, query, k1 = 1.2, b = 0.75) {
  const qTerms = tok(query);
  return idx.docs
    .map((d, i) => {
      let score = 0;
      for (const t of qTerms) {
        const f = d.tf.get(t);
        if (!f) continue;
        const n = idx.df.get(t) ?? 0;
        const idf = Math.log(1 + (idx.N - n + 0.5) / (n + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / idx.avgLen)));
      }
      return { i, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b2) => b2.score - a.score);
}

// ---------------------------------------------------------------- run

const verbose = argv.includes("--verbose");

const CASES = JSON.parse(readFileSync(CASES_FILE, "utf8"));

const truth = CASES.map((c) => {
  const i = corpus.findIndex((b) => b.heading.includes(c.target));
  return { ...c, gold: i };
});
const missing = truth.filter((t) => t.gold < 0);
if (missing.length) {
  console.error(`ground truth not found for: ${missing.map((m) => m.target).join(" | ")}`);
  process.exit(1);
}

function evaluate(idx, field) {
  const ranks = truth.map((t) => {
    const results = search(idx, t[field]);
    const pos = results.findIndex((r) => r.i === t.gold);
    return { target: t.target, rank: pos < 0 ? Infinity : pos + 1, top: results[0] };
  });
  const hit = (n) => ranks.filter((r) => r.rank <= n).length;
  const mrr = ranks.reduce((a, r) => a + (r.rank === Infinity ? 0 : 1 / r.rank), 0) / ranks.length;
  return { ranks, hit1: hit(1), hit3: hit(3), hit5: hit(5), miss: ranks.filter((r) => r.rank === Infinity).length, mrr };
}

console.log(`\ncorpus: ${corpus.length} blocks\ncases:  ${truth.length} from ${CASES_FILE}\n`);
console.log(`${"".padEnd(64, "=")}`);

for (const boost of [1, 3]) {
  const idx = buildIndex(boost);
  console.log(`\nHEADING WEIGHT ${boost}×`);
  for (const field of ["verbatim", "paraphrase"]) {
    const r = evaluate(idx, field);
    console.log(
      `  ${field.padEnd(11)} hit@1 ${String(r.hit1).padStart(2)}/${truth.length}` +
        `   hit@3 ${String(r.hit3).padStart(2)}/${truth.length}` +
        `   hit@5 ${String(r.hit5).padStart(2)}/${truth.length}` +
        `   never found ${r.miss}` +
        `   MRR ${r.mrr.toFixed(2)}`,
    );
    if (verbose && boost === 3) {
      for (const x of r.ranks) {
        const mark = x.rank === 1 ? "  ✓" : x.rank <= 5 ? `  ${x.rank}` : x.rank === Infinity ? "  ✗" : ` ${x.rank}`;
        console.log(`      ${mark}  ${x.target.slice(0, 58)}`);
        if (x.rank > 3) {
          console.log(`           instead: ${corpus[x.top?.i ?? 0]?.heading.slice(0, 60) ?? "-"}`);
        }
      }
    }
  }
}
console.log();
