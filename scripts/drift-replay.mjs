#!/usr/bin/env node
/**
 * drift-replay — does anchor-based staleness detection actually work?
 *
 * dixti marks a finding STALE when the commit of a file it anchors to changes. That is cheap and
 * exact, but it is only *useful* if anchor movement correlates with the finding actually being
 * invalidated. If most anchor movement is reformatting and comment edits, the state means nothing
 * and the curator's diff-reading has to ship alongside the decay engine rather than after it.
 *
 * This is a throwaway measurement, not part of the tool. It writes no findings and needs no dixti.
 *
 * Method
 *   1. T0 = the commit 25% of the way through the repo's history.
 *   2. Every source file present at T0 and still present at HEAD gets a simulated finding,
 *      anchored to that file, born at T0.
 *   3. Walk every non-merge commit after T0 touching that file.
 *   4. Classify the FIRST such commit — the one that would fire the stale flag.
 *
 * Classification of a triggering commit
 *   whitespace   diff is empty under `git diff -w --ignore-blank-lines`
 *   comments     all changed lines are comments or blank
 *   trivial      1–2 changed lines of real code
 *   substantive  3+ changed lines of real code
 *
 * "False alarm" = whitespace + comments. `trivial` is reported separately and NOT counted as a false
 * alarm: a one-line change can absolutely invalidate a claim, and folding it in either way would be
 * putting a thumb on the scale.
 *
 * Usage:  node scripts/drift-replay.mjs <repo> [<repo> ...] [--sample N] [--json out.json]
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SOURCE_EXT = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "sql", "go", "rs", "java", "rb",
  "php", "c", "h", "cc", "cpp", "cs", "swift", "kt", "scala", "css", "scss", "sh", "vue", "svelte",
]);

const EXCLUDE = [
  /(^|\/)node_modules\//, /(^|\/)dist\//, /(^|\/)build\//, /(^|\/)\.next\//,
  /(^|\/)vendor\//, /\.min\./, /(^|\/)package-lock\.json$/, /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/, /\.snap$/, /(^|\/)coverage\//,
];

const COMMENT_PREFIX = ["//", "#", "*", "/*", "*/", "<!--", "-->", "--"];

function git(repo, args) {
  try {
    return execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return "";
  }
}

function isSource(path) {
  if (EXCLUDE.some((re) => re.test(path))) return false;
  const ext = path.includes(".") ? path.split(".").pop().toLowerCase() : "";
  return SOURCE_EXT.has(ext);
}

/** Deterministic sample so re-runs are comparable. */
function sample(arr, n, seed = 42) {
  if (arr.length <= n) return arr;
  let s = seed;
  const rand = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function classify(repo, commit, file) {
  const full = git(repo, ["show", "--format=", "--no-color", commit, "--", file]);
  if (!full.trim()) return "empty";

  const noWs = git(repo, [
    "show", "--format=", "--no-color", "-w", "--ignore-blank-lines", commit, "--", file,
  ]);
  if (!noWs.trim()) return "whitespace";

  const changed = noWs
    .split("\n")
    .filter((l) => (l.startsWith("+") || l.startsWith("-")) && !l.startsWith("+++") && !l.startsWith("---"))
    .map((l) => l.slice(1).trim())
    .filter((t) => t.length > 0);

  const code = changed.filter((t) => !COMMENT_PREFIX.some((p) => t.startsWith(p)));
  if (code.length === 0) return "comments";
  if (code.length <= 2) return "trivial";
  return "substantive";
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function pct(n, d) {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`;
}

function replay(repo, sampleSize, at) {
  const log = git(repo, ["log", "--reverse", "--no-merges", "--format=%H|%cI"])
    .trim().split("\n").filter(Boolean)
    .map((l) => { const [hash, iso] = l.split("|"); return { hash, date: new Date(iso) }; });

  if (log.length < 8) return { repo, skipped: `only ${log.length} commits — too little history` };

  const t0 = log[Math.floor(log.length * at)];
  const head = log[log.length - 1];
  const windowDays = Math.round((head.date - t0.date) / 86400000);

  const atT0 = git(repo, ["ls-tree", "-r", "--name-only", t0.hash]).trim().split("\n").filter(isSource);
  const atHead = new Set(git(repo, ["ls-tree", "-r", "--name-only", "HEAD"]).trim().split("\n"));
  const candidates = sample(atT0.filter((f) => atHead.has(f)), sampleSize);

  const findings = [];
  for (const file of candidates) {
    const touches = git(repo, [
      "log", "--no-merges", "--format=%H|%cI", `${t0.hash}..HEAD`, "--", file,
    ]).trim().split("\n").filter(Boolean)
      .map((l) => { const [hash, iso] = l.split("|"); return { hash, date: new Date(iso) }; })
      .reverse();

    if (touches.length === 0) {
      findings.push({ file, stale: false, touches: 0 });
      continue;
    }

    const first = touches[0];
    const firstClass = classify(repo, first.hash, file);
    const daysToStale = Math.round((first.date - t0.date) / 86400000);

    // When would it have gone stale if cosmetic commits were filtered out?
    let firstReal = null;
    for (const t of touches) {
      const c = classify(repo, t.hash, file);
      if (c === "trivial" || c === "substantive") { firstReal = { ...t, days: Math.round((t.date - t0.date) / 86400000) }; break; }
    }

    findings.push({
      file, stale: true, touches: touches.length,
      firstClass, daysToStale,
      daysToRealChange: firstReal ? firstReal.days : null,
      everSubstantive: firstReal !== null,
    });
  }

  return { repo, windowDays, commits: log.length, t0: t0.date.toISOString().slice(0, 10), findings };
}

// ---------------------------------------------------------------- report

const args = process.argv.slice(2);
const FLAGS = new Set(["--sample", "--json", "--at"]);
const flagValueIdx = new Set();
args.forEach((a, i) => { if (FLAGS.has(a)) flagValueIdx.add(i + 1); });
const repos = args.filter((a, i) => !a.startsWith("--") && !flagValueIdx.has(i));
const sampleSize = Number(args.includes("--sample") ? args[args.indexOf("--sample") + 1] : 200);
const at = Number(args.includes("--at") ? args[args.indexOf("--at") + 1] : 0.25);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : "scripts/out/drift-replay.json";

if (repos.length === 0) {
  console.error("usage: node scripts/drift-replay.mjs <repo> [<repo> ...] [--sample N] [--json out.json]");
  process.exit(1);
}

const results = repos.map((r) => replay(r, sampleSize, at));
const all = [];

for (const r of results) {
  if (r.skipped) { console.log(`\n${r.repo}\n  SKIPPED — ${r.skipped}`); continue; }

  const f = r.findings;
  const stale = f.filter((x) => x.stale);
  const counts = { whitespace: 0, comments: 0, trivial: 0, substantive: 0, empty: 0 };
  for (const x of stale) counts[x.firstClass] = (counts[x.firstClass] ?? 0) + 1;
  const falseAlarms = counts.whitespace + counts.comments + counts.empty;

  console.log(`\n${r.repo}`);
  console.log(`  window            ${r.windowDays} days from ${r.t0}  (${r.commits} non-merge commits)`);
  console.log(`  findings simulated ${f.length}`);
  console.log(`  would go stale     ${stale.length}  (${pct(stale.length, f.length)})`);
  const d = stale.map((x) => x.daysToStale).sort((a, b) => a - b);
  const q = (p) => (d.length ? d[Math.min(d.length - 1, Math.floor(d.length * p))] : "n/a");
  console.log(`  days to stale      p25 ${q(0.25)} · median ${median(d) ?? "n/a"} · p75 ${q(0.75)}  (of ${r.windowDays}-day window)`);
  console.log(`  first trigger was:`);
  for (const [k, v] of Object.entries(counts)) {
    if (v) console.log(`    ${k.padEnd(12)} ${String(v).padStart(4)}  ${pct(v, stale.length)}`);
  }
  console.log(`  FALSE ALARM RATE   ${pct(falseAlarms, stale.length)}  (whitespace + comments)`);
  const neverReal = stale.filter((x) => !x.everSubstantive).length;
  console.log(`  stale but never substantively changed in the whole window: ${neverReal} (${pct(neverReal, stale.length)})`);

  all.push(...stale.map((x) => ({ ...x, repo: r.repo })));
}

if (all.length) {
  const counts = { whitespace: 0, comments: 0, trivial: 0, substantive: 0, empty: 0 };
  for (const x of all) counts[x.firstClass] = (counts[x.firstClass] ?? 0) + 1;
  const falseAlarms = counts.whitespace + counts.comments + counts.empty;
  console.log(`\n${"=".repeat(60)}\nCOMBINED  ${all.length} stale events across ${results.filter((r) => !r.skipped).length} repos`);
  for (const [k, v] of Object.entries(counts)) if (v) console.log(`  ${k.padEnd(12)} ${String(v).padStart(4)}  ${pct(v, all.length)}`);
  console.log(`  FALSE ALARM RATE  ${pct(falseAlarms, all.length)}`);
}

mkdirSync(dirname(jsonOut), { recursive: true });
writeFileSync(jsonOut, JSON.stringify(results, null, 2));
console.log(`\nfull results → ${jsonOut}`);
